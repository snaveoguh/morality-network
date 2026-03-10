import { randomUUID } from "node:crypto";
import { formatUnits, type Hash } from "viem";
import { ERC20_TRADE_ABI } from "./abi";
import { createTraderClients } from "./clients";
import { getTraderConfig } from "./config";
import {
  executeHyperliquidOrderLive,
  fetchHyperliquidAccountValueUsd,
  fetchHyperliquidMarketBySymbol,
  resolveHyperliquidAccountAddress,
  resolveHyperliquidMarketForLaunch,
  simulateHyperliquidOrder,
} from "./hyperliquid";
import { fetchTokenMarketSnapshot, normalizeQuoteSymbol } from "./market";
import { PositionStore } from "./position-store";
import { fetchScannerCandidates } from "./scanner-client";
import { estimateAmountOutMin, executeSwap, readTokenDecimals, waitForSuccess } from "./swap";
import type {
  Position,
  ScannerLaunch,
  TraderCycleReport,
  TraderExecutionConfig,
  TraderPerformanceReport,
  TraderPerformanceTotals,
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
      executionVenue: this.config.executionVenue,
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

  async getPerformance(): Promise<TraderPerformanceReport> {
    await this.initPromise;

    const positions = this.store.getAll();
    const openPositions = positions.filter((position) => position.status === "open");
    const closedPositions = positions.filter((position) => position.status === "closed");

    const open: TraderPerformanceReport["open"] = [];
    const closed: TraderPerformanceReport["closed"] = [];

    let deployedUsd = 0;
    let openMarketValueUsd = 0;
    let unrealizedPnlUsd = 0;
    let realizedPnlUsd = 0;

    for (const position of openPositions) {
      deployedUsd += position.entryNotionalUsd;
      const currentPriceUsd = await this.resolvePositionPriceUsd(position);

      if (!currentPriceUsd || !Number.isFinite(currentPriceUsd) || position.entryPriceUsd <= 0) {
        open.push({
          position,
          currentPriceUsd: null,
          marketValueUsd: null,
          unrealizedPnlUsd: null,
          unrealizedPnlPct: null,
        });
        continue;
      }

      const marketValueUsd = position.entryNotionalUsd * (currentPriceUsd / position.entryPriceUsd);
      const pnlUsd = marketValueUsd - position.entryNotionalUsd;
      const pnlPct = position.entryNotionalUsd > 0 ? pnlUsd / position.entryNotionalUsd : 0;

      openMarketValueUsd += marketValueUsd;
      unrealizedPnlUsd += pnlUsd;
      open.push({
        position,
        currentPriceUsd,
        marketValueUsd,
        unrealizedPnlUsd: pnlUsd,
        unrealizedPnlPct: pnlPct,
      });
    }

    for (const position of closedPositions) {
      if (!position.exitPriceUsd || !Number.isFinite(position.exitPriceUsd) || position.entryPriceUsd <= 0) {
        closed.push({
          position,
          realizedPnlUsd: null,
          realizedPnlPct: null,
        });
        continue;
      }

      const pnlUsd =
        position.entryNotionalUsd * ((position.exitPriceUsd - position.entryPriceUsd) / position.entryPriceUsd);
      const pnlPct = position.entryNotionalUsd > 0 ? pnlUsd / position.entryNotionalUsd : 0;

      realizedPnlUsd += pnlUsd;
      closed.push({
        position,
        realizedPnlUsd: pnlUsd,
        realizedPnlPct: pnlPct,
      });
    }

    const grossPnlUsd = realizedPnlUsd + unrealizedPnlUsd;
    const performanceFeeUsd =
      realizedPnlUsd > 0 ? (realizedPnlUsd * this.config.performanceFeeBps) / 10_000 : 0;
    const netPnlAfterFeeUsd = grossPnlUsd - performanceFeeUsd;

    const totals: TraderPerformanceTotals = {
      openPositions: openPositions.length,
      closedPositions: closedPositions.length,
      deployedUsd,
      openMarketValueUsd,
      unrealizedPnlUsd,
      realizedPnlUsd,
      grossPnlUsd,
      performanceFeeUsd,
      netPnlAfterFeeUsd,
    };

    return {
      timestamp: Date.now(),
      executionVenue: this.config.executionVenue,
      dryRun: this.config.dryRun,
      account: this.clients.address,
      fundingAddress: this.clients.address,
      performanceFeeBps: this.config.performanceFeeBps,
      readiness: await this.getReadiness(),
      totals,
      open,
      closed,
    };
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

    if (this.config.executionVenue === "base-spot") {
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
    } else {
      const accountAddress = resolveHyperliquidAccountAddress(this.config, this.clients.address);
      const defaultMarket = this.config.hyperliquid.defaultMarket;

      let accountValueUsd: number | null = null;
      let marketAvailable = false;

      try {
        const market = await fetchHyperliquidMarketBySymbol(this.config, defaultMarket);
        marketAvailable = market !== null;
      } catch {
        reasons.push("hyperliquid_unreachable");
      }

      try {
        accountValueUsd = await fetchHyperliquidAccountValueUsd(this.config, accountAddress);
      } catch {
        if (!this.config.dryRun) {
          reasons.push("hyperliquid_account_unavailable");
        }
      }

      balances.push({
        symbol: "HL_ACCOUNT_VALUE_USD",
        address: accountAddress,
        raw:
          accountValueUsd !== null && Number.isFinite(accountValueUsd)
            ? Math.floor(accountValueUsd * 100).toString()
            : "0",
        decimals: 2,
        formatted: accountValueUsd !== null ? accountValueUsd.toFixed(2) : "0.00",
        requiredFormatted: this.config.hyperliquid.minAccountValueUsd.toString(),
        meetsRequirement:
          this.config.dryRun ||
          (accountValueUsd !== null && accountValueUsd >= this.config.hyperliquid.minAccountValueUsd),
      });

      if (!marketAvailable && !this.config.dryRun) {
        reasons.push(`hyperliquid_market_unavailable_${defaultMarket.toLowerCase()}`);
      }

      if (
        !this.config.dryRun &&
        (accountValueUsd === null || accountValueUsd < this.config.hyperliquid.minAccountValueUsd)
      ) {
        reasons.push(`hyperliquid_account_value_lt_${this.config.hyperliquid.minAccountValueUsd}`);
      }
    }

    return {
      timestamp: Date.now(),
      executionVenue: this.config.executionVenue,
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
        const currentPriceUsd = await this.resolvePositionPriceUsd(position);
        if (!currentPriceUsd || !Number.isFinite(currentPriceUsd) || currentPriceUsd <= 0) {
          report.skipped.push(`exit:no-price:${position.tokenAddress}`);
          continue;
        }

        const stopPrice = position.entryPriceUsd * (1 - position.stopLossPct);
        const takePrice = position.entryPriceUsd * (1 + position.takeProfitPct);
        let reason: Position["exitReason"] | null = null;

        if (currentPriceUsd <= stopPrice) reason = "stop-loss";
        if (currentPriceUsd >= takePrice) reason = "take-profit";
        if (!reason) continue;

        const closed = await this.closePosition(position, reason, currentPriceUsd);
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

  private async resolvePositionPriceUsd(position: Position): Promise<number | null> {
    if (position.venue === "hyperliquid-perp" && position.marketSymbol) {
      const market = await fetchHyperliquidMarketBySymbol(this.config, position.marketSymbol);
      return market?.priceUsd ?? null;
    }
    const market = await fetchTokenMarketSnapshot(position.tokenAddress);
    return market.priceUsd;
  }

  private async closePosition(
    position: Position,
    reason: NonNullable<Position["exitReason"]>,
    exitPriceUsd: number
  ): Promise<Position | null> {
    if (position.venue === "hyperliquid-perp") {
      return this.closeHyperliquidPosition(position, reason, exitPriceUsd);
    }

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

  private async closeHyperliquidPosition(
    position: Position,
    reason: NonNullable<Position["exitReason"]>,
    exitPriceUsd: number
  ): Promise<Position | null> {
    if (!position.marketSymbol) {
      throw new Error("hyperliquid position missing market symbol");
    }

    const market = await fetchHyperliquidMarketBySymbol(this.config, position.marketSymbol);
    if (!market) {
      throw new Error(`missing hyperliquid market ${position.marketSymbol}`);
    }

    if (this.config.dryRun) {
      return this.store.close(position.id, {
        exitReason: reason,
        exitPriceUsd,
        exitTxHash: syntheticHash(),
      });
    }

    const execution = await executeHyperliquidOrderLive({
      config: this.config,
      market,
      side: "sell",
      leverage: position.leverage ?? this.config.hyperliquid.defaultLeverage,
      slippageBps: this.config.risk.slippageBps,
      reduceOnly: true,
      sizeRaw: position.quantityTokenRaw,
    });

    return this.store.close(position.id, {
      exitReason: reason,
      exitPriceUsd: execution.fillPriceUsd,
      exitTxHash: execution.txHash,
    });
  }

  private async tryOpenPosition(candidate: ScannerLaunch): Promise<Position | null> {
    if (this.config.executionVenue === "hyperliquid-perp") {
      return this.tryOpenHyperliquidPosition(candidate);
    }
    return this.tryOpenSpotPosition(candidate);
  }

  private async tryOpenHyperliquidPosition(candidate: ScannerLaunch): Promise<Position | null> {
    const openPositions = this.store.getOpen();
    if (openPositions.length >= this.config.risk.maxOpenPositions) {
      return null;
    }

    const market = await resolveHyperliquidMarketForLaunch(this.config, candidate);
    if (!market || !market.priceUsd || market.priceUsd <= 0) {
      return null;
    }

    const notionalUsd = Math.min(this.config.hyperliquid.entryNotionalUsd, this.config.risk.maxPositionUsd);
    if (!Number.isFinite(notionalUsd) || notionalUsd <= 0) {
      return null;
    }

    const portfolioNotional = openPositions.reduce((sum, position) => sum + position.entryNotionalUsd, 0);
    if (portfolioNotional + notionalUsd > this.config.risk.maxPortfolioUsd) {
      throw new Error("portfolio limit reached");
    }

    const order = this.config.dryRun
      ? await simulateHyperliquidOrder({
          config: this.config,
          symbol: market.symbol,
          marketId: market.marketId,
          side: "buy",
          leverage: this.config.hyperliquid.defaultLeverage,
          notionalUsd,
          szDecimals: market.szDecimals,
        })
      : await executeHyperliquidOrderLive({
          config: this.config,
          market,
          side: "buy",
          leverage: this.config.hyperliquid.defaultLeverage,
          slippageBps: this.config.risk.slippageBps,
          notionalUsd,
        });

    const quoteTokenAddress = this.config.quoteTokens.USDC ?? candidate.tokenAddress;
    const quoteDecimals = this.config.quoteTokenDecimals.USDC ?? 6;
    const quoteSpentRaw = Math.max(1, Math.floor(order.notionalUsd * 10 ** quoteDecimals)).toString();

    const opened: Position = {
      id: randomUUID(),
      venue: "hyperliquid-perp",
      tokenAddress: candidate.tokenAddress,
      tokenDecimals: market.szDecimals,
      quoteTokenAddress,
      quoteSymbol: "USD",
      quoteTokenDecimals: quoteDecimals,
      dex: candidate.dex,
      marketSymbol: market.symbol,
      marketId: market.marketId,
      leverage: order.leverage,
      poolAddress: candidate.poolAddress,
      entryPriceUsd: order.fillPriceUsd,
      quantityTokenRaw: order.sizeRaw,
      quoteSpentRaw,
      entryNotionalUsd: order.notionalUsd,
      stopLossPct: this.config.risk.stopLossPct,
      takeProfitPct: this.config.risk.takeProfitPct,
      openedAt: Date.now(),
      txHash: order.txHash,
      status: "open",
    };

    await this.store.upsert(opened);
    return opened;
  }

  private async tryOpenSpotPosition(candidate: ScannerLaunch): Promise<Position | null> {
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
      venue: "base-spot",
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

export async function getTraderPerformance(): Promise<TraderPerformanceReport> {
  return getTraderEngine().getPerformance();
}

export function redactedConfigSummary() {
  const config = getTraderConfig();
  return {
    executionVenue: config.executionVenue,
    dryRun: config.dryRun,
    performanceFeeBps: config.performanceFeeBps,
    rpcUrl: config.rpcUrl,
    scannerApiUrl: config.scannerApiUrl,
    quoteTokens: config.quoteTokens,
    risk: config.risk,
    safety: config.safety,
    hyperliquid: {
      apiUrl: config.hyperliquid.apiUrl,
      isTestnet: config.hyperliquid.isTestnet,
      accountAddress: config.hyperliquid.accountAddress ?? null,
      defaultMarket: config.hyperliquid.defaultMarket,
      defaultLeverage: config.hyperliquid.defaultLeverage,
      entryNotionalUsd: config.hyperliquid.entryNotionalUsd,
      minAccountValueUsd: config.hyperliquid.minAccountValueUsd,
    },
    gasMultiplierBps: config.gasMultiplierBps,
    maxPriorityFeePerGas: config.maxPriorityFeePerGas.toString(),
  };
}
