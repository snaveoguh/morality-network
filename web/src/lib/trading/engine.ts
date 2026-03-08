import { randomUUID } from "node:crypto";
import { formatUnits, type Hash } from "viem";
import { ERC20_TRADE_ABI } from "./abi";
import { createTraderClients } from "./clients";
import { getTraderConfig } from "./config";
import { fetchTokenMarketSnapshot, normalizeQuoteSymbol } from "./market";
import { PositionStore } from "./position-store";
import { fetchScannerCandidates } from "./scanner-client";
import { estimateAmountOutMin, executeSwap, readTokenDecimals, waitForSuccess } from "./swap";
import type {
  Position,
  ScannerLaunch,
  TraderCycleReport,
  TraderExecutionConfig,
  TraderReadinessBalance,
  TraderReadinessReport,
} from "./types";

class TraderEngine {
  private readonly config: TraderExecutionConfig;
  private readonly store: PositionStore;
  private readonly clients: ReturnType<typeof createTraderClients>;
  private readonly initPromise: Promise<void>;

  constructor(config: TraderExecutionConfig) {
    this.config = config;
    this.clients = createTraderClients(config);
    this.store = new PositionStore(config.positionStorePath);
    this.initPromise = this.store.load();
  }

  async runCycle(): Promise<TraderCycleReport> {
    await this.initPromise;
    const startedAt = Date.now();
    const report: TraderCycleReport = {
      startedAt,
      finishedAt: startedAt,
      dryRun: this.config.dryRun,
      scannerCandidates: 0,
      openPositions: this.store.getOpen().length,
      entries: [],
      exits: [],
      skipped: [],
      errors: [],
    };

    const readiness = await this.getReadiness();
    report.readiness = readiness;
    if (!this.config.dryRun && !readiness.liveReady) {
      report.errors.push(`live-gate:${readiness.reasons.join(",")}`);
      report.finishedAt = Date.now();
      return report;
    }

    await this.evaluateOpenPositions(report);

    let candidates: ScannerLaunch[] = [];
    try {
      candidates = await fetchScannerCandidates(this.config);
    } catch (error) {
      report.errors.push(error instanceof Error ? error.message : "scanner fetch failed");
      report.finishedAt = Date.now();
      return report;
    }

    report.scannerCandidates = candidates.length;
    let entries = 0;

    for (const candidate of candidates) {
      if (entries >= this.config.risk.maxNewEntriesPerCycle) break;
      if (this.store.getByToken(candidate.tokenAddress)) {
        report.skipped.push(`already-open:${candidate.tokenAddress}`);
        continue;
      }

      try {
        const opened = await this.tryOpenPosition(candidate);
        if (!opened) continue;
        report.entries.push(opened);
        entries += 1;
      } catch (error) {
        report.errors.push(
          `entry:${candidate.tokenAddress}:${error instanceof Error ? error.message : "unknown error"}`
        );
      }
    }

    report.openPositions = this.store.getOpen().length;
    report.finishedAt = Date.now();
    return report;
  }

  async listPositions(): Promise<Position[]> {
    await this.initPromise;
    return this.store.getAll();
  }

  async getReadiness(): Promise<TraderReadinessReport> {
    await this.initPromise;

    const reasons: string[] = [];
    let scannerCandidates = 0;
    let scannerFetchError: string | undefined;

    try {
      scannerCandidates = (await fetchScannerCandidates(this.config)).length;
    } catch (error) {
      scannerFetchError = error instanceof Error ? error.message : "scanner fetch failed";
      reasons.push("scanner_unavailable");
    }

    if (scannerCandidates < this.config.safety.minScannerCandidatesLive) {
      reasons.push(`scanner_candidates_lt_${this.config.safety.minScannerCandidatesLive}`);
    }

    const balances: TraderReadinessBalance[] = [];

    const nativeBalance = await this.clients.publicClient.getBalance({
      address: this.clients.address,
    });
    const nativeFormatted = formatUnits(nativeBalance, 18);
    const nativeMeets = Number(nativeFormatted) >= this.config.safety.minBaseEthForGas;
    balances.push({
      symbol: "ETH",
      address: "native",
      raw: nativeBalance.toString(),
      decimals: 18,
      formatted: nativeFormatted,
      requiredFormatted: this.config.safety.minBaseEthForGas.toString(),
      meetsRequirement: nativeMeets,
    });
    if (!nativeMeets) {
      reasons.push(`eth_balance_lt_${this.config.safety.minBaseEthForGas}`);
    }

    for (const [symbol, tokenAddress] of Object.entries(this.config.quoteTokens)) {
      const decimals = this.config.quoteTokenDecimals[symbol] ?? 18;
      const requiredRaw = this.config.entryBudgetRaw[symbol] ?? BigInt(0);
      const requiredFormatted = formatUnits(requiredRaw, decimals);

      let raw = BigInt(0);
      try {
        raw = await this.clients.publicClient.readContract({
          address: tokenAddress,
          abi: ERC20_TRADE_ABI,
          functionName: "balanceOf",
          args: [this.clients.address],
        });
      } catch {
        reasons.push(`${symbol.toLowerCase()}_balance_unreadable`);
      }

      const formatted = formatUnits(raw, decimals);
      const meetsRequirement = raw >= requiredRaw;
      balances.push({
        symbol,
        address: tokenAddress,
        raw: raw.toString(),
        decimals,
        formatted,
        requiredRaw: requiredRaw.toString(),
        requiredFormatted,
        meetsRequirement,
      });

      if (!meetsRequirement) {
        reasons.push(`${symbol.toLowerCase()}_balance_lt_entry_budget`);
      }
    }

    return {
      timestamp: Date.now(),
      dryRun: this.config.dryRun,
      account: this.clients.address,
      scannerCandidates,
      scannerFetchError,
      minScannerCandidatesLive: this.config.safety.minScannerCandidatesLive,
      balances,
      liveReady: reasons.length === 0,
      reasons,
    };
  }

  private async evaluateOpenPositions(report: TraderCycleReport): Promise<void> {
    const open = this.store.getOpen();
    if (open.length === 0) return;

    for (const position of open) {
      try {
        const currentMarket = await fetchTokenMarketSnapshot(position.tokenAddress);
        if (!currentMarket.priceUsd) {
          report.skipped.push(`exit:no-price:${position.tokenAddress}`);
          continue;
        }

        const stopPrice = position.entryPriceUsd * (1 - position.stopLossPct);
        const takePrice = position.entryPriceUsd * (1 + position.takeProfitPct);
        let reason: Position["exitReason"] | null = null;

        if (currentMarket.priceUsd <= stopPrice) reason = "stop-loss";
        if (currentMarket.priceUsd >= takePrice) reason = "take-profit";
        if (!reason) continue;

        const closed = await this.closePosition(position, reason, currentMarket.priceUsd);
        if (closed) {
          report.exits.push(closed);
        }
      } catch (error) {
        report.errors.push(
          `exit:${position.tokenAddress}:${error instanceof Error ? error.message : "unknown error"}`
        );
      }
    }
  }

  private async closePosition(
    position: Position,
    reason: NonNullable<Position["exitReason"]>,
    exitPriceUsd: number
  ): Promise<Position | null> {
    if (this.config.dryRun) {
      return this.store.close(position.id, {
        exitReason: reason,
        exitPriceUsd,
        exitTxHash: syntheticHash(),
      });
    }

    const quoteMarket = await fetchTokenMarketSnapshot(position.quoteTokenAddress);
    if (!quoteMarket.priceUsd) {
      throw new Error(`missing quote price for exit ${position.quoteTokenAddress}`);
    }

    const amountIn = BigInt(position.quantityTokenRaw);
    if (amountIn <= BigInt(0)) {
      throw new Error("position amount is zero");
    }

    const amountOutMin = estimateAmountOutMin({
      amountInRaw: amountIn,
      quoteDecimals: position.tokenDecimals,
      tokenDecimals: position.quoteTokenDecimals,
      quotePriceUsd: exitPriceUsd,
      tokenPriceUsd: quoteMarket.priceUsd,
      slippageBps: this.config.risk.slippageBps,
    });

    const txHash = await executeSwap(
      {
        publicClient: this.clients.publicClient,
        walletClient: this.clients.walletClient,
        accountAddress: this.clients.address,
        config: this.config,
      },
      {
        dex: position.dex,
        tokenIn: position.tokenAddress,
        tokenOut: position.quoteTokenAddress,
        amountIn,
        amountOutMin,
      }
    );
    await waitForSuccess(this.clients.publicClient, txHash);

    return this.store.close(position.id, {
      exitReason: reason,
      exitPriceUsd,
      exitTxHash: txHash,
    });
  }

  private async tryOpenPosition(candidate: ScannerLaunch): Promise<Position | null> {
    const openPositions = this.store.getOpen();
    if (openPositions.length >= this.config.risk.maxOpenPositions) {
      return null;
    }

    const tokenMarket = await fetchTokenMarketSnapshot(candidate.tokenAddress);
    const quoteSymbol =
      normalizeQuoteSymbol(candidate.pairedAsset) ??
      normalizeQuoteSymbol(tokenMarket.quoteSymbol) ??
      "USDC";
    const quoteToken = this.config.quoteTokens[quoteSymbol];
    const quoteDecimals = this.config.quoteTokenDecimals[quoteSymbol];
    const amountIn = this.config.entryBudgetRaw[quoteSymbol];

    if (!quoteToken || quoteDecimals === undefined || amountIn === undefined || amountIn <= BigInt(0)) {
      return null;
    }

    const quoteMarket = await fetchTokenMarketSnapshot(quoteToken);
    const quotePriceUsd = quoteMarket.priceUsd ?? (quoteSymbol === "USDC" ? 1 : null);
    const tokenPriceUsd = tokenMarket.priceUsd ?? Number(candidate.dexScreenerData?.priceUsd ?? "");
    if (!quotePriceUsd || !Number.isFinite(tokenPriceUsd) || tokenPriceUsd <= 0) {
      return null;
    }

    const balance = await this.clients.publicClient.readContract({
      address: quoteToken,
      abi: ERC20_TRADE_ABI,
      functionName: "balanceOf",
      args: [this.clients.address],
    });
    if (balance < amountIn) {
      throw new Error(`insufficient ${quoteSymbol} balance`);
    }

    const notionalUsd = (Number(amountIn) / 10 ** quoteDecimals) * quotePriceUsd;
    if (notionalUsd > this.config.risk.maxPositionUsd) {
      throw new Error(`position above max size (${notionalUsd.toFixed(2)} > ${this.config.risk.maxPositionUsd})`);
    }

    const portfolioNotional = openPositions.reduce((sum, position) => sum + position.entryNotionalUsd, 0);
    if (portfolioNotional + notionalUsd > this.config.risk.maxPortfolioUsd) {
      throw new Error("portfolio limit reached");
    }

    const tokenDecimals = await readTokenDecimals(this.clients.publicClient, candidate.tokenAddress);
    const amountOutMin = estimateAmountOutMin({
      amountInRaw: amountIn,
      quoteDecimals,
      tokenDecimals,
      quotePriceUsd,
      tokenPriceUsd,
      slippageBps: this.config.risk.slippageBps,
    });
    if (!this.config.dryRun && amountOutMin <= BigInt(0)) {
      throw new Error("amountOutMin resolved to zero");
    }

    const txHash = this.config.dryRun
      ? syntheticHash()
      : await executeSwap(
          {
            publicClient: this.clients.publicClient,
            walletClient: this.clients.walletClient,
            accountAddress: this.clients.address,
            config: this.config,
          },
          {
            dex: candidate.dex,
            tokenIn: quoteToken,
            tokenOut: candidate.tokenAddress,
            amountIn,
            amountOutMin,
          }
        );
    if (!this.config.dryRun) {
      await waitForSuccess(this.clients.publicClient, txHash);
    }

    const opened: Position = {
      id: randomUUID(),
      tokenAddress: candidate.tokenAddress,
      tokenDecimals,
      quoteTokenAddress: quoteToken,
      quoteSymbol,
      quoteTokenDecimals: quoteDecimals,
      dex: candidate.dex,
      poolAddress: candidate.poolAddress,
      entryPriceUsd: tokenPriceUsd,
      quantityTokenRaw: amountOutMin > BigInt(0) ? amountOutMin.toString() : "1",
      quoteSpentRaw: amountIn.toString(),
      entryNotionalUsd: notionalUsd,
      stopLossPct: this.config.risk.stopLossPct,
      takeProfitPct: this.config.risk.takeProfitPct,
      openedAt: Date.now(),
      txHash,
      status: "open",
    };

    await this.store.upsert(opened);
    return opened;
  }
}

function syntheticHash(): Hash {
  const raw = randomUUID().split("-").join("").padEnd(64, "0").slice(0, 64);
  return `0x${raw}` as Hash;
}

let singleton: TraderEngine | null = null;

export function getTraderEngine(): TraderEngine {
  if (!singleton) {
    singleton = new TraderEngine(getTraderConfig());
  }
  return singleton;
}

export async function runTraderCycle(): Promise<TraderCycleReport> {
  return getTraderEngine().runCycle();
}

export async function listTraderPositions(): Promise<Position[]> {
  return getTraderEngine().listPositions();
}

export async function getTraderReadiness(): Promise<TraderReadinessReport> {
  return getTraderEngine().getReadiness();
}

export function redactedConfigSummary() {
  const config = getTraderConfig();
  return {
    dryRun: config.dryRun,
    rpcUrl: config.rpcUrl,
    scannerApiUrl: config.scannerApiUrl,
    quoteTokens: config.quoteTokens,
    risk: config.risk,
    safety: config.safety,
    gasMultiplierBps: config.gasMultiplierBps,
    maxPriorityFeePerGas: config.maxPriorityFeePerGas.toString(),
  };
}
