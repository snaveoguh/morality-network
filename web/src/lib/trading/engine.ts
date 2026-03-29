import { randomUUID } from "node:crypto";
import { formatUnits, type Address, type Hash } from "viem";
import { ERC20_TRADE_ABI } from "./abi";
import { createTraderClients } from "./clients";
import { getParallelBaseConfig, getTraderConfig } from "./config";
import {
  executeHyperliquidOrderLive,
  fetchHyperliquidAccountValueUsd,
  fetchHyperliquidLivePositions,
  fetchHyperliquidMarketBySymbol,
  resolveHyperliquidAccountAddress,
  resolveHyperliquidMarketForLaunch,
  simulateHyperliquidOrder,
  fetchRecentCloseFill,
} from "./hyperliquid";
import { fetchTokenMarketSnapshot, normalizeQuoteSymbol, type DexScreenerChainId } from "./market";
import { PositionStore } from "./position-store";
import { fetchScannerCandidates } from "./scanner-client";
import { getAggregatedMarketSignals, type AggregatedMarketSignal } from "./signals";
import { estimateAmountOutMin, executeSwap, readTokenDecimals, waitForSuccess } from "./swap";
import { checkMoralGate, checkCircuitBreaker, logMoralGateDecision } from "./moral-gate";
import { AGENT_VAULT_ABI, AGENT_VAULT_ADDRESS } from "../contracts";
import { computeKelly, consecutiveLosses } from "./kelly";
import { positionsToJournal } from "./trade-journal";
import { fetchTechnicalSignal } from "./technical";
import { detectPatterns } from "./pattern-detector";
import { computeCompositeSignal, type CompositeSignal } from "./composite-signal";
import { fetchMarketDataSignals } from "./market-signals";
import { fetchWalletFlowSignal } from "./wallet-flow";
import { fetchWebIntelligenceSignal, type WebIntelligenceSignal } from "./web-intelligence";
import { runAutoresearchCycle, getExperimentOverrideWeights } from "./autoresearch";
import { fetchCouncilSignal } from "./council-signal";
import {
  computeVaultSettlementPlan,
  computeVaultTopUpPlan,
  formatVaultEth,
} from "./vault-strategy";
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

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

interface VaultStateSnapshot {
  liquidAssetsWei: bigint;
  deployedCapitalWei: bigint;
  manager: Address;
}

// Hyperliquid taker fee: 0.035% per side → 0.07% round-trip (entry + exit)
// Applied as estimated exchange cost on notional position value
const HL_TAKER_FEE_PER_SIDE = 0.00035;
const HL_ROUND_TRIP_FEE_RATE = HL_TAKER_FEE_PER_SIDE * 2; // 0.0007

function computeHyperliquidMinOrderNotionalUsd(priceUsd: number, szDecimals: number): number {
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) return Number.POSITIVE_INFINITY;
  const lotStep = 10 ** -Math.max(0, szDecimals);
  const minLots = Math.ceil(10 / (priceUsd * lotStep));
  return minLots * lotStep * priceUsd;
}

function decimalStringToRaw(value: string, decimals: number): string {
  const normalized = value.trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    return "0";
  }
  const [whole, fractional = ""] = normalized.split(".");
  const units = `${whole}${fractional.padEnd(Math.max(0, decimals), "0").slice(0, Math.max(0, decimals))}`
    .replace(/^0+/, "");
  return units.length > 0 ? units : "0";
}

function isSpotVenue(venue: TraderExecutionConfig["executionVenue"]): boolean {
  return venue === "base-spot" || venue === "ethereum-spot";
}

function dexScreenerChainForVenue(
  venue: TraderExecutionConfig["executionVenue"] | Position["venue"] | undefined
): DexScreenerChainId {
  return venue === "ethereum-spot" ? "ethereum" : "base";
}

class TraderEngine {
  private readonly config: TraderExecutionConfig;
  private readonly store: PositionStore;
  private readonly clients: ReturnType<typeof createTraderClients>;
  private readonly initPromise: Promise<void>;
  /** Circuit breaker pause timestamp — null = not paused */
  private circuitBreakerPauseUntil: number | null = null;

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
    report.openPositions = await this.getCurrentOpenPositionCount();

    const readiness = await this.getReadiness();
    report.readiness = readiness;
    if (!this.config.dryRun && !readiness.liveReady) {
      report.errors.push(`live-gate:${readiness.reasons.join(",")}`);
      report.finishedAt = Date.now();
      return report;
    }

    // SOUL.md §Trading: Circuit breaker — 3 consecutive losses = pause
    const journal = positionsToJournal(this.store.getAll());
    const lossStreak = consecutiveLosses(journal);
    const cbCheck = checkCircuitBreaker(
      lossStreak,
      this.config.risk.circuitBreakerLosses,
      this.circuitBreakerPauseUntil,
    );
    if (cbCheck.blocked) {
      // Set pause timer if not already set
      if (this.circuitBreakerPauseUntil === null || Date.now() >= this.circuitBreakerPauseUntil) {
        this.circuitBreakerPauseUntil = Date.now() + this.config.risk.circuitBreakerPauseMs;
      }
      console.log(`[trader] ${cbCheck.reason}`);
      report.errors.push(`circuit-breaker:${cbCheck.reason}`);
      // Still evaluate exits (close losing positions) but don't open new ones
      await this.evaluateOpenPositions(report);
      report.finishedAt = Date.now();
      return report;
    }
    // Clear pause if we're past it and no longer in loss streak
    if (this.circuitBreakerPauseUntil !== null && Date.now() >= this.circuitBreakerPauseUntil) {
      console.log(`[trader] circuit breaker pause expired, resuming trading`);
      this.circuitBreakerPauseUntil = null;
    }

    // Fetch signals BEFORE exits so signal-reversal exit can use them
    let marketSignals: AggregatedMarketSignal[] = [];
    if (this.config.executionVenue === "hyperliquid-perp") {
      try {
        marketSignals = await getAggregatedMarketSignals({
          limit: 250,
          minAbsScore: 0.2,
        });
      } catch (error) {
        report.errors.push(
          `signals:${error instanceof Error ? error.message : "signal aggregation failed"}`
        );
      }
    }

    await this.evaluateOpenPositions(report, marketSignals);

    // Autoresearch: trigger self-improvement cycle if enough trades have closed
    if (report.exits.length > 0) {
      try {
        await runAutoresearchCycle(this.store.getAll(), this.config.risk);
      } catch (err) {
        console.warn("[trader] autoresearch cycle failed:", err instanceof Error ? err.message : err);
      }
    }

    let candidates: ScannerLaunch[] = [];
    if (isSpotVenue(this.config.executionVenue)) {
      try {
        candidates = await fetchScannerCandidates(this.config);
      } catch (error) {
        report.errors.push(error instanceof Error ? error.message : "scanner fetch failed");
        report.finishedAt = Date.now();
        return report;
      }
    } else if (this.config.executionVenue === "hyperliquid-perp") {
      // HL perp doesn't need scanner candidates — use a synthetic placeholder
      // so the loop below calls tryOpenPosition which routes to signal-based HL entry.
      try {
        candidates = await fetchScannerCandidates(this.config);
      } catch {
        // Scanner failure is non-fatal for HL perp — signals drive entries
      }
      // Ensure at least one dummy candidate so the entry loop runs for signal routing
      if (candidates.length === 0 && marketSignals.length > 0) {
        candidates = [{ tokenAddress: "0x0000000000000000000000000000000000000000", dex: "uniswap-v3", score: 0 } as unknown as ScannerLaunch];
      }
    }

    report.scannerCandidates = candidates.length;
    let entries = 0;

    for (const candidate of candidates) {
      if (entries >= this.config.risk.maxNewEntriesPerCycle) break;
      if (candidate.tokenAddress !== "0x0000000000000000000000000000000000000000" && this.store.getByToken(candidate.tokenAddress)) {
        report.skipped.push(`already-open:${candidate.tokenAddress}`);
        continue;
      }

      try {
        const opened = await this.tryOpenPosition(candidate, marketSignals);
        if (!opened) continue;
        report.entries.push(opened);
        entries += 1;
      } catch (error) {
        report.errors.push(
          `entry:${candidate.tokenAddress}:${error instanceof Error ? error.message : "unknown error"}`
        );
      }
    }

    report.openPositions = await this.getCurrentOpenPositionCount();
    report.finishedAt = Date.now();
    return report;
  }

  async listPositions(): Promise<Position[]> {
    await this.initPromise;
    if (this.config.executionVenue !== "hyperliquid-perp" || this.config.dryRun) {
      return this.store.getAll();
    }

    const liveOpen = await this.getHyperliquidOpenPositionsFromVenue();
    const closed = this.store.getAll().filter((position) => position.status === "closed");
    return [...liveOpen, ...closed];
  }

  private async getHyperliquidOpenPositionsFromVenue(): Promise<Position[]> {
    const accountAddress = resolveHyperliquidAccountAddress(this.config, this.clients.address);
    const livePositions = await fetchHyperliquidLivePositions(this.config, accountAddress);
    const quoteTokenAddress = this.config.quoteTokens.USDC ?? ZERO_ADDRESS;
    const quoteTokenDecimals = this.config.quoteTokenDecimals.USDC ?? 6;

    const liveIds = new Set<string>();
    const positions: Position[] = [];

    for (const live of livePositions) {
      const id = `hl:${live.symbol}:${live.marketId ?? "unknown"}`;
      liveIds.add(id);

      const quantityRaw = decimalStringToRaw(live.size, live.szDecimals);
      const sizeNumeric = Number(live.size);
      const entryNotionalUsd = Number.isFinite(sizeNumeric) ? sizeNumeric * live.entryPriceUsd : live.positionValueUsd;
      const quoteSpentRaw = Math.max(1, Math.floor(entryNotionalUsd * 10 ** quoteTokenDecimals)).toString();

      // Merge with existing store data to preserve openedAt, signalSource, etc.
      const existing = this.store.getAll().find((p) => p.id === id && p.status === "open");

      // If a CLOSED position exists with this deterministic ID, archive it with a
      // unique suffix so the upsert below doesn't overwrite historical records.
      const closedAtId = this.store.getAll().find((p) => p.id === id && p.status === "closed");
      if (closedAtId) {
        const archiveId = `${id}:closed:${closedAtId.closedAt ?? Date.now()}`;
        await this.store.upsert({ ...closedAtId, id: archiveId });
      }

      const position: Position = {
        id,
        venue: "hyperliquid-perp",
        tokenAddress: quoteTokenAddress,
        tokenDecimals: live.szDecimals,
        quoteTokenAddress,
        quoteSymbol: "USD",
        quoteTokenDecimals,
        dex: "uniswap-v3",
        marketSymbol: live.symbol,
        marketId: live.marketId ?? undefined,
        leverage: live.leverage ?? this.config.hyperliquid.defaultLeverage,
        poolAddress: undefined,
        entryPriceUsd: live.entryPriceUsd,
        quantityTokenRaw: quantityRaw,
        quoteSpentRaw,
        entryNotionalUsd,
        stopLossPct: this.config.risk.stopLossPct,
        takeProfitPct: this.config.risk.takeProfitPct,
        openedAt: existing?.openedAt ?? Date.now(),
        txHash: existing?.txHash,
        status: "open",
        direction: live.isShort ? "short" : "long",
        trailingStopPct: this.config.risk.trailingStopPct,
        signalSource: existing?.signalSource,
        signalConfidence: existing?.signalConfidence,
        kellyFraction: existing?.kellyFraction,
        highWaterMark: existing?.highWaterMark,
        lowWaterMark: existing?.lowWaterMark,
        moralScore: existing?.moralScore,
        moralJustification: existing?.moralJustification,
        entryRationale: existing?.entryRationale,
        exitRationale: existing?.exitRationale,
        // Carry HL's authoritative unrealized PnL (includes funding rates + actual fees)
        hlUnrealizedPnlUsd: live.unrealizedPnlUsd,
      };

      // Persist to store (→ Redis) so positions survive cold starts
      await this.store.upsert(position);
      positions.push(position);
    }

    // Detect positions that disappeared from HL (closed externally / liquidated).
    // Build a set of live market symbols so UUID-based positions that match a live
    // hl: position aren't falsely closed as "manual".
    const liveSymbols = new Set(livePositions.map((lp) => lp.symbol.toUpperCase()));
    const storeOpen = this.store.getOpen().filter((p) => p.venue === "hyperliquid-perp");
    for (const stored of storeOpen) {
      if (liveIds.has(stored.id)) continue;

      // If this is a UUID-based entry and the same symbol is live under an hl: ID,
      // it's the same position — just remove the duplicate UUID entry, don't close it.
      if (!stored.id.startsWith("hl:") && stored.marketSymbol && liveSymbols.has(stored.marketSymbol.toUpperCase())) {
        await this.store.upsert({ ...stored, status: "closed", closedAt: Date.now(), exitReason: "expired" as const });
        // Remove duplicate — the hl: version is the canonical record
        continue;
      }

      // Position gone from HL — try to get ACTUAL exit price from HL fills
      // instead of stale cached market price (which was wildly inaccurate at high leverage)
      let exitPriceUsd = stored.entryPriceUsd; // fallback
      let closedPnlFromHl: number | undefined;
      try {
        const closeFill = stored.marketSymbol
          ? await fetchRecentCloseFill(this.config, accountAddress, stored.marketSymbol)
          : null;
        if (closeFill) {
          exitPriceUsd = closeFill.exitPriceUsd;
          closedPnlFromHl = closeFill.closedPnlUsd;
        } else {
          // No recent fill found — fall back to market price (less accurate but better than entry)
          const currentPrice = await this.resolvePositionPriceUsd(stored);
          if (currentPrice && Number.isFinite(currentPrice) && currentPrice > 0) {
            exitPriceUsd = currentPrice;
          }
        }
      } catch {
        // keep fallback
      }
      const exitNote = closedPnlFromHl !== undefined
        ? `manual (disappeared from HL, actual fill PnL: $${closedPnlFromHl.toFixed(4)})`
        : "manual (disappeared from HL)";
      await this.store.close(stored.id, {
        exitReason: "manual",
        exitPriceUsd,
        closedAt: Date.now(),
        exitRationale: this.buildExitRationale(stored, exitNote, exitPriceUsd),
      });
    }

    return positions;
  }

  private async getCurrentOpenPositionCount(): Promise<number> {
    if (this.config.executionVenue !== "hyperliquid-perp" || this.config.dryRun) {
      return this.store.getOpen().length;
    }
    try {
      return (await this.getHyperliquidOpenPositionsFromVenue()).length;
    } catch {
      return this.store.getOpen().length;
    }
  }

  async getPerformance(): Promise<TraderPerformanceReport> {
    await this.initPromise;

    const persistedPositions = this.store.getAll();
    const openPositions =
      this.config.executionVenue === "hyperliquid-perp" && !this.config.dryRun
        ? await this.getHyperliquidOpenPositionsFromVenue()
        : persistedPositions.filter((position) => position.status === "open");
    const closedPositions = persistedPositions.filter((position) => position.status === "closed");

    const open: TraderPerformanceReport["open"] = [];
    const closed: TraderPerformanceReport["closed"] = [];

    let deployedUsd = 0;
    let openMarketValueUsd = 0;
    let unrealizedPnlUsd = 0;
    let realizedPnlUsd = 0;
    let estimatedTradingFeesUsd = 0;

    // Fee rate depends on venue — Hyperliquid perps use taker fee
    const isHyperliquid = this.config.executionVenue === "hyperliquid-perp";
    const feeRate = isHyperliquid ? HL_ROUND_TRIP_FEE_RATE : 0;

    for (const position of openPositions) {
      deployedUsd += position.entryNotionalUsd;
      const currentPriceUsd = await this.resolvePositionPriceUsd(position);

      // Estimated round-trip fees on notional (entry already paid + estimated exit)
      const estFees = position.entryNotionalUsd * feeRate;
      estimatedTradingFeesUsd += estFees;

      if (!currentPriceUsd || !Number.isFinite(currentPriceUsd) || position.entryPriceUsd <= 0) {
        open.push({
          position,
          currentPriceUsd: null,
          marketValueUsd: null,
          unrealizedPnlUsd: null,
          unrealizedPnlPct: null,
          estimatedFeesUsd: estFees,
        });
        continue;
      }

      // For HL positions, prefer HL's authoritative unrealized PnL which includes
      // funding rates, actual fees, and liquidation math — our recalculation was
      // drifting from reality because of stale cached prices and missing funding.
      const hasHlPnl = position.venue === "hyperliquid-perp"
        && position.hlUnrealizedPnlUsd !== undefined
        && Number.isFinite(position.hlUnrealizedPnlUsd);

      let pnlUsd: number;
      let marketValueUsd: number;
      if (hasHlPnl) {
        // HL's number is the truth — includes funding, actual maker/taker fees, etc.
        pnlUsd = position.hlUnrealizedPnlUsd!;
        marketValueUsd = position.entryNotionalUsd + pnlUsd;
      } else {
        // Fallback: manual calculation for non-HL venues or missing HL data
        const lev = position.leverage ?? 1;
        const priceMove = position.direction === "short"
          ? (position.entryPriceUsd - currentPriceUsd) / position.entryPriceUsd
          : (currentPriceUsd - position.entryPriceUsd) / position.entryPriceUsd;
        marketValueUsd = position.entryNotionalUsd * (1 + priceMove * lev);
        const grossPnl = marketValueUsd - position.entryNotionalUsd;
        pnlUsd = grossPnl - estFees;
      }
      const pnlPct = position.entryNotionalUsd > 0 ? pnlUsd / position.entryNotionalUsd : 0;

      openMarketValueUsd += marketValueUsd;
      unrealizedPnlUsd += pnlUsd;
      open.push({
        position,
        currentPriceUsd,
        marketValueUsd,
        unrealizedPnlUsd: pnlUsd,
        unrealizedPnlPct: pnlPct,
        estimatedFeesUsd: hasHlPnl ? 0 : estFees, // HL PnL already accounts for fees
      });
    }

    for (const position of closedPositions) {
      // Estimated round-trip fees on entry notional
      const estFees = position.entryNotionalUsd * feeRate;
      estimatedTradingFeesUsd += estFees;

      if (!position.exitPriceUsd || !Number.isFinite(position.exitPriceUsd) || position.entryPriceUsd <= 0) {
        closed.push({
          position,
          realizedPnlUsd: null,
          realizedPnlPct: null,
          estimatedFeesUsd: estFees,
        });
        continue;
      }

      const lev = position.leverage ?? 1;
      const priceMove = position.direction === "short"
        ? (position.entryPriceUsd - position.exitPriceUsd) / position.entryPriceUsd
        : (position.exitPriceUsd - position.entryPriceUsd) / position.entryPriceUsd;
      // PnL includes leverage + estimated round-trip exchange fees
      const grossPnl = position.entryNotionalUsd * priceMove * lev;
      const pnlUsd = grossPnl - estFees;
      const pnlPct = position.entryNotionalUsd > 0 ? pnlUsd / position.entryNotionalUsd : 0;

      realizedPnlUsd += pnlUsd;
      closed.push({
        position,
        realizedPnlUsd: pnlUsd,
        realizedPnlPct: pnlPct,
        estimatedFeesUsd: estFees,
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
      estimatedTradingFeesUsd,
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

    // Scanner is only relevant for spot venues (token discovery).
    // Hyperliquid perp trades use sentiment signals, not scanner candidates.
    if (isSpotVenue(this.config.executionVenue)) {
      try {
        scannerCandidates = (await fetchScannerCandidates(this.config)).length;
      } catch (error) {
        scannerFetchError = error instanceof Error ? error.message : "scanner fetch failed";
        reasons.push("scanner_unavailable");
      }

      if (scannerCandidates < this.config.safety.minScannerCandidatesLive) {
        reasons.push(`scanner_candidates_lt_${this.config.safety.minScannerCandidatesLive}`);
      }
    }

    const balances: TraderReadinessBalance[] = [];

    if (isSpotVenue(this.config.executionVenue)) {
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

  private async evaluateOpenPositions(
    report: TraderCycleReport,
    marketSignals: AggregatedMarketSignal[] = [],
  ): Promise<void> {
    const open = this.store.getOpen();
    if (open.length === 0) return;

    for (const position of open) {
      // Skip scalper-managed positions (they have their own SL/TP via WebSocket)
      if (position.id.startsWith("scalp:")) continue;

      try {
        // ── Max hold time: close stale positions ──
        const maxHoldMs = this.config.risk.maxHoldMs ?? 14_400_000; // 4h default
        const positionAgeMs = Date.now() - position.openedAt;
        if (maxHoldMs > 0 && positionAgeMs > maxHoldMs) {
          const currentPrice = await this.resolvePositionPriceUsd(position);
          console.log(
            `[trader] safety-net-max-hold: closing ${position.marketSymbol} after ${(positionAgeMs / 86_400_000).toFixed(1)}d (limit=${(maxHoldMs / 86_400_000).toFixed(1)}d)`,
          );
          const closed = await this.closePosition(position, "max-hold-time", currentPrice ?? position.entryPriceUsd);
          if (closed) report.exits.push(closed);
          continue;
        }

        // ── Minimum hold time: skip all exit checks (except catastrophic loss) ──
        const minHoldMs = this.config.risk.minHoldMs ?? 0;
        if (minHoldMs > 0 && positionAgeMs < minHoldMs) {
          // Safety valve: still allow exit on catastrophic loss (>50% drawdown)
          const currentPriceForCheck = await this.resolvePositionPriceUsd(position);
          if (currentPriceForCheck) {
            const isShortCheck = position.direction === "short";
            const levCheck = position.leverage ?? 1;
            const pricePctCheck = isShortCheck
              ? (position.entryPriceUsd - currentPriceForCheck) / position.entryPriceUsd
              : (currentPriceForCheck - position.entryPriceUsd) / position.entryPriceUsd;
            const pnlPctCheck = pricePctCheck * levCheck;
            if (pnlPctCheck < -0.5) {
              console.log(
                `[trader] catastrophic-loss: closing ${position.marketSymbol} at ${(pnlPctCheck * 100).toFixed(1)}% despite min-hold (age=${(positionAgeMs / 60_000).toFixed(0)}min)`,
              );
              const closed = await this.closePosition(position, "stop-loss", currentPriceForCheck);
              if (closed) report.exits.push(closed);
            }
          }
          continue; // Skip all other exit checks during min hold period
        }

        // ── Signal reversal: close only on STRONG reversals ──
        // Require: signal flipped direction, low contradiction, high absolute score,
        // AND position must have been open long enough to avoid whipsaw
        if (position.signalSource && position.marketSymbol && marketSignals.length > 0) {
          const currentSignal = marketSignals.find(
            (s) => s.symbol === position.marketSymbol,
          );
          const positionAgeForReversal = Date.now() - position.openedAt;
          const minAgeForReversal = 600_000; // 10 min minimum — ignore early flip-flops
          const minReversalScore = 0.65; // signal must be strongly directional
          if (
            currentSignal &&
            currentSignal.contradictionPenalty <= 0.3 && // strong consensus (was 0.5)
            Math.abs(currentSignal.score) >= minReversalScore &&
            positionAgeForReversal >= minAgeForReversal
          ) {
            const positionIsBullish = position.direction === "long";
            const signalIsBullish = currentSignal.direction === "bullish";
            if (positionIsBullish !== signalIsBullish) {
              const currentPrice = await this.resolvePositionPriceUsd(position);
              console.log(
                `[trader] signal-reversal: ${position.marketSymbol} was ${position.direction}, signal now ${currentSignal.direction} (score=${currentSignal.score.toFixed(2)}, age=${(positionAgeForReversal / 60_000).toFixed(0)}min)`,
              );
              const closed = await this.closePosition(position, "signal-reversal", currentPrice ?? position.entryPriceUsd);
              if (closed) report.exits.push(closed);
              continue;
            }
          }
        }

        const currentPriceUsd = await this.resolvePositionPriceUsd(position);

        if (!currentPriceUsd || !Number.isFinite(currentPriceUsd) || currentPriceUsd <= 0) {
          report.skipped.push(`exit:no-price:${position.tokenAddress}`);
          continue;
        }

        const isShort = position.direction === "short";
        const lev = position.leverage ?? 1;
        const pricePct = isShort
          ? (position.entryPriceUsd - currentPriceUsd) / position.entryPriceUsd
          : (currentPriceUsd - position.entryPriceUsd) / position.entryPriceUsd;
        // Leverage-adjusted PnL % (what the trader actually experiences)
        const pnlPct = pricePct * lev;

        // ── Stop-loss: full close (threshold is leverage-adjusted) ──
        // stopLossPct=0.2 at 40x means close at 0.5% adverse price move
        const stopPriceMove = position.stopLossPct / lev;
        const stopPrice = isShort
          ? position.entryPriceUsd * (1 + stopPriceMove)
          : position.entryPriceUsd * (1 - stopPriceMove);
        const hitStop = isShort ? currentPriceUsd >= stopPrice : currentPriceUsd <= stopPrice;
        if (hitStop) {
          const closed = await this.closePosition(position, "stop-loss", currentPriceUsd);
          if (closed) report.exits.push(closed);
          continue;
        }

        // ── Trailing stop: update high/low water mark, close if retraced ──
        // Both trailingPct and activationPct are leverage-adjusted thresholds.
        // At 40x, trailingPct=0.05 means 0.125% price retrace triggers stop.
        // activationPct=0.02 means 0.05% favorable price move activates trailing.
        const trailingPct = position.trailingStopPct ?? this.config.risk.trailingStopPct ?? 0;
        const activationPct = this.config.risk.trailingStopActivationPct ?? 0.03;
        // Convert to price-space: divide by leverage so trailing tracks price not leveraged PnL
        const trailingPricePct = lev > 1 ? trailingPct / lev : trailingPct;
        const activationPricePct = lev > 1 ? activationPct / lev : activationPct;
        if (trailingPct > 0 && pricePct >= activationPricePct) {
          const hwm = position.highWaterMark ?? position.entryPriceUsd;
          const lwm = position.lowWaterMark ?? position.entryPriceUsd;
          if (isShort) {
            const newLwm = Math.min(lwm, currentPriceUsd);
            if (newLwm < lwm) await this.store.upsert({ ...position, lowWaterMark: newLwm });
            const trailPrice = newLwm * (1 + trailingPricePct);
            if (currentPriceUsd >= trailPrice) {
              const closed = await this.closePosition(position, "trailing-stop", currentPriceUsd);
              if (closed) report.exits.push(closed);
              continue;
            }
          } else {
            const newHwm = Math.max(hwm, currentPriceUsd);
            if (newHwm > hwm) await this.store.upsert({ ...position, highWaterMark: newHwm });
            const trailPrice = newHwm * (1 - trailingPricePct);
            if (currentPriceUsd <= trailPrice) {
              const closed = await this.closePosition(position, "trailing-stop", currentPriceUsd);
              if (closed) report.exits.push(closed);
              continue;
            }
          }
        }

        // ── Dynamic take-profit at web-intelligence key levels ──
        if (position.dynamicTpLevels && position.dynamicTpLevels.length > 0) {
          const isShortDtp = position.direction === "short";
          const hitLevel = position.dynamicTpLevels.find((level) =>
            isShortDtp ? currentPriceUsd <= level : currentPriceUsd >= level,
          );

          if (hitLevel) {
            const remainingLevels = position.dynamicTpLevels.filter((l) => l !== hitLevel);
            const qty = BigInt(position.quantityTokenRaw);

            if (remainingLevels.length === 0) {
              // Last level — full close
              console.log(`[trader] dynamic-TP: full close ${position.marketSymbol} at level $${hitLevel.toFixed(2)} (last level)`);
              const closed = await this.closePosition(position, "dynamic-tp", currentPriceUsd);
              if (closed) report.exits.push(closed);
              continue;
            } else {
              // Partial close 25% at this level
              const partialQty = (qty * BigInt(25)) / BigInt(100);
              if (partialQty > BigInt(0) && partialQty < qty) {
                const partialClosed = await this.partialClosePosition(position, partialQty.toString(), currentPriceUsd);
                if (partialClosed) {
                  console.log(`[trader] dynamic-TP: partial close 25% of ${position.marketSymbol} at level $${hitLevel.toFixed(2)} (${remainingLevels.length} levels remain)`);
                  // Update stored position to remove the hit level
                  await this.store.upsert({ ...position, dynamicTpLevels: remainingLevels });
                }
              }
              // Don't continue — let other exit checks run too
            }
          }

          // Refresh dynamic TP levels from web intel every 20 min
          const posAgeForRefresh = Date.now() - position.openedAt;
          if (posAgeForRefresh > 20 * 60 * 1000 && position.marketSymbol) {
            try {
              const freshIntel = await fetchWebIntelligenceSignal(this.config, position.marketSymbol, currentPriceUsd);
              if (freshIntel) {
                const freshLevels = position.direction === "long"
                  ? freshIntel.resistanceLevels.filter((r) => r > currentPriceUsd).sort((a, b) => a - b)
                  : freshIntel.supportLevels.filter((s) => s < currentPriceUsd).sort((a, b) => b - a);
                if (freshLevels.length > 0) {
                  await this.store.upsert({ ...position, dynamicTpLevels: freshLevels });
                }
              }
            } catch {
              // Non-fatal — keep existing levels
            }
          }
        }

        // ── Scaled take-profit: close 25% at each tier, let the rest ride ──
        // Fallback when no dynamic TP levels are set
        // Tiers: TP×1 = 25%, TP×1.5 = 25%, TP×2 = 25%, TP×3 = full close
        const tp = position.takeProfitPct;
        const tiers = [
          { threshold: tp,       closePct: 0.25, label: "TP1" },
          { threshold: tp * 1.5, closePct: 0.25, label: "TP2" },
          { threshold: tp * 2,   closePct: 0.25, label: "TP3" },
          { threshold: tp * 3,   closePct: 1.0,  label: "TP-FULL" },
        ];
        const tierHit = tiers.find((t) => pnlPct >= t.threshold);
        if (tierHit) {
          // Track which tiers have already been taken via highWaterMark as proxy
          // If the remaining size is small or this is the final tier, close all
          const qty = BigInt(position.quantityTokenRaw);
          const partialQty = tierHit.closePct < 1.0
            ? (qty * BigInt(Math.round(tierHit.closePct * 100))) / BigInt(100)
            : qty;

          if (partialQty <= BigInt(0) || partialQty >= qty || tierHit.closePct >= 1.0) {
            // Full close
            const closed = await this.closePosition(position, "take-profit", currentPriceUsd);
            if (closed) report.exits.push(closed);
          } else {
            // Partial close: reduce position, keep remainder open
            const partialClosed = await this.partialClosePosition(position, partialQty.toString(), currentPriceUsd);
            if (partialClosed) {
              console.log(`[trader] ${tierHit.label}: partial close ${tierHit.closePct * 100}% of ${position.marketSymbol} at ${pnlPct > 0 ? "+" : ""}${(pnlPct * 100).toFixed(2)}%`);
            }
          }
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
    const market = await fetchTokenMarketSnapshot(position.tokenAddress, {
      chainId: dexScreenerChainForVenue(position.venue ?? this.config.executionVenue),
    });
    return market.priceUsd;
  }

  private buildExitRationale(position: Position, reason: string, exitPriceUsd: number): Position["exitRationale"] {
    const hwm = position.highWaterMark;
    return {
      trigger: reason,
      priceAtTrigger: exitPriceUsd,
      highWaterMark: hwm,
      drawdownFromPeak: hwm && hwm > 0 && exitPriceUsd < hwm
        ? (hwm - exitPriceUsd) / hwm
        : undefined,
      holdDurationMs: Date.now() - position.openedAt,
    };
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
        exitRationale: this.buildExitRationale(position, reason, exitPriceUsd),
      });
    }

    const quoteMarket = await fetchTokenMarketSnapshot(position.quoteTokenAddress, {
      chainId: dexScreenerChainForVenue(position.venue ?? this.config.executionVenue),
    });
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

    const closed = await this.store.close(position.id, {
      exitReason: reason,
      exitPriceUsd,
      exitTxHash: txHash,
      exitRationale: this.buildExitRationale(position, reason, exitPriceUsd),
    });
    await this.settleVaultStrategyIfFlat();
    return closed;
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

    const closeSide = position.direction === "short" ? "buy" : "sell";

    if (this.config.dryRun) {
      return this.store.close(position.id, {
        exitReason: reason,
        exitPriceUsd,
        exitTxHash: syntheticHash(),
        exitRationale: this.buildExitRationale(position, reason, exitPriceUsd),
      });
    }

    const execution = await executeHyperliquidOrderLive({
      config: this.config,
      market,
      side: closeSide,
      leverage: position.leverage ?? this.config.hyperliquid.defaultLeverage,
      slippageBps: this.config.risk.slippageBps,
      reduceOnly: true,
      sizeRaw: position.quantityTokenRaw,
    });

    return this.store.close(position.id, {
      exitReason: reason,
      exitPriceUsd: execution.fillPriceUsd,
      exitTxHash: execution.txHash,
      exitRationale: this.buildExitRationale(position, reason, execution.fillPriceUsd),
    });
  }

  /**
   * Partial close: reduce position size on Hyperliquid, update stored quantity.
   * Used for scaled take-profit (close 25% at each tier).
   */
  private async partialClosePosition(
    position: Position,
    partialSizeRaw: string,
    currentPriceUsd: number,
  ): Promise<boolean> {
    if (position.venue !== "hyperliquid-perp" || !position.marketSymbol) {
      return false;
    }

    const market = await fetchHyperliquidMarketBySymbol(this.config, position.marketSymbol);
    if (!market) return false;

    const closeSide = position.direction === "short" ? "buy" : "sell";

    if (this.config.dryRun) {
      // In dry-run, just reduce the stored quantity
      const remaining = BigInt(position.quantityTokenRaw) - BigInt(partialSizeRaw);
      if (remaining > BigInt(0)) {
        await this.store.upsert({ ...position, quantityTokenRaw: remaining.toString() });
      }
      console.log(`[trader] dry-run partial close: ${partialSizeRaw} of ${position.quantityTokenRaw} ${position.marketSymbol}`);
      return true;
    }

    try {
      await executeHyperliquidOrderLive({
        config: this.config,
        market,
        side: closeSide,
        leverage: position.leverage ?? this.config.hyperliquid.defaultLeverage,
        slippageBps: this.config.risk.slippageBps,
        reduceOnly: true,
        sizeRaw: partialSizeRaw,
      });

      // Update stored position with reduced quantity
      const remaining = BigInt(position.quantityTokenRaw) - BigInt(partialSizeRaw);
      if (remaining > BigInt(0)) {
        await this.store.upsert({ ...position, quantityTokenRaw: remaining.toString() });
      } else {
        await this.store.close(position.id, {
          exitReason: "take-profit",
          exitPriceUsd: currentPriceUsd,
          exitRationale: this.buildExitRationale(position, "take-profit (partial close completed)", currentPriceUsd),
        });
      }
      return true;
    } catch (error) {
      console.error(`[trader] partial close failed: ${error instanceof Error ? error.message : "unknown"}`);
      return false;
    }
  }

  private isVaultStrategyEnabled(): boolean {
    return this.config.executionVenue === "base-spot" && this.config.vaultStrategy?.enabled === true;
  }

  private async readVaultState(): Promise<VaultStateSnapshot> {
    const state = await this.clients.publicClient.readContract({
      address: AGENT_VAULT_ADDRESS,
      abi: AGENT_VAULT_ABI,
      functionName: "getVaultState",
    });

    const [
      ,
      liquidAssetsWei,
      deployedCapitalWei,
      ,
      ,
      ,
      manager,
    ] = state;

    return {
      liquidAssetsWei: liquidAssetsWei as bigint,
      deployedCapitalWei: deployedCapitalWei as bigint,
      manager: manager as Address,
    };
  }

  private async wrapEthToWeth(amountWei: bigint): Promise<void> {
    if (amountWei <= BigInt(0)) return;
    const wethAddress = this.config.quoteTokens.WETH;
    if (!wethAddress) throw new Error("WETH address not configured");

    const wrapHash = await this.clients.walletClient.writeContract({
      address: wethAddress,
      abi: [{ type: "function", name: "deposit", inputs: [], outputs: [], stateMutability: "payable" }],
      functionName: "deposit",
      value: amountWei,
    });
    await waitForSuccess(this.clients.publicClient, wrapHash);
    console.log(`[trader] wrapped ${formatVaultEth(amountWei)} ETH -> WETH: ${wrapHash}`);
  }

  private async unwrapWethToEth(amountWei: bigint): Promise<void> {
    if (amountWei <= BigInt(0)) return;
    const wethAddress = this.config.quoteTokens.WETH;
    if (!wethAddress) throw new Error("WETH address not configured");

    const unwrapHash = await this.clients.walletClient.writeContract({
      address: wethAddress,
      abi: [{ type: "function", name: "withdraw", inputs: [{ name: "wad", type: "uint256" }], outputs: [], stateMutability: "nonpayable" }],
      functionName: "withdraw",
      args: [amountWei],
    });
    await waitForSuccess(this.clients.publicClient, unwrapHash);
    console.log(`[trader] unwrapped ${formatVaultEth(amountWei)} WETH -> ETH: ${unwrapHash}`);
  }

  private async topUpWethFromVault(requiredWeth: bigint, currentWeth: bigint): Promise<void> {
    if (!AGENT_VAULT_ADDRESS || AGENT_VAULT_ADDRESS === ZERO_ADDRESS) {
      throw new Error("No vault address configured");
    }

    const reserveWei = this.config.vaultStrategy?.minReserveEthRaw ?? BigInt(0);
    const nativeEthWei = await this.clients.publicClient.getBalance({
      address: this.clients.address,
    });
    const plan = computeVaultTopUpPlan({
      requiredWethWei: requiredWeth,
      currentWethWei: currentWeth,
      currentNativeEthWei: nativeEthWei,
      reserveEthWei: reserveWei,
      allocateBufferBps: this.config.vaultStrategy?.allocateBufferBps ?? 12_000,
    });

    if (plan.wrapNativeWei > BigInt(0)) {
      await this.wrapEthToWeth(plan.wrapNativeWei);
    }

    if (plan.allocateWei <= BigInt(0)) {
      return;
    }

    if (!this.isVaultStrategyEnabled()) {
      throw new Error("vault strategy funding is disabled for this runner");
    }

    const vault = await this.readVaultState();
    if (vault.manager.toLowerCase() !== this.clients.address.toLowerCase()) {
      throw new Error(`strategy wallet ${this.clients.address} is not the vault manager`);
    }
    if (vault.liquidAssetsWei < plan.allocateWei) {
      throw new Error(
        `vault only has ${formatVaultEth(vault.liquidAssetsWei)} ETH liquid, need ${formatVaultEth(plan.allocateWei)}`
      );
    }

    console.log(`[trader] Allocating ${formatVaultEth(plan.allocateWei)} ETH from vault ${AGENT_VAULT_ADDRESS} -> strategy ${this.clients.address}`);
    const allocateHash = await this.clients.walletClient.writeContract({
      address: AGENT_VAULT_ADDRESS,
      abi: AGENT_VAULT_ABI,
      functionName: "allocateToStrategy",
      args: [this.clients.address, plan.allocateWei],
    });
    await waitForSuccess(this.clients.publicClient, allocateHash);
    console.log(`[trader] Vault allocation confirmed: ${allocateHash}`);

    await this.wrapEthToWeth(plan.allocateWei);
  }

  private async settleVaultStrategyIfFlat(): Promise<void> {
    if (!this.isVaultStrategyEnabled() || this.config.dryRun) {
      return;
    }
    if (this.store.getOpen().some((position) => position.venue === "base-spot")) {
      return;
    }

    const quoteTokensToCheck = Object.entries(this.config.quoteTokens).filter(
      ([symbol]) => symbol !== "WETH"
    );
    for (const [symbol, tokenAddress] of quoteTokensToCheck) {
      const balance = await this.clients.publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_TRADE_ABI,
        functionName: "balanceOf",
        args: [this.clients.address],
      });
      if (balance > BigInt(0)) {
        console.warn(`[trader] vault settlement skipped: residual ${symbol} balance ${balance.toString()} still in strategy wallet`);
        return;
      }
    }

    const vault = await this.readVaultState();
    if (vault.manager.toLowerCase() !== this.clients.address.toLowerCase()) {
      console.warn(`[trader] vault settlement skipped: ${this.clients.address} is not vault manager`);
      return;
    }

    const wethAddress = this.config.quoteTokens.WETH;
    const wethWei = wethAddress
      ? await this.clients.publicClient.readContract({
          address: wethAddress,
          abi: ERC20_TRADE_ABI,
          functionName: "balanceOf",
          args: [this.clients.address],
        })
      : BigInt(0);
    const nativeEthWei = await this.clients.publicClient.getBalance({
      address: this.clients.address,
    });
    const reserveWei = this.config.vaultStrategy?.minReserveEthRaw ?? BigInt(0);
    const plan = computeVaultSettlementPlan({
      deployedCapitalWei: vault.deployedCapitalWei,
      currentWethWei: wethWei,
      currentNativeEthWei: nativeEthWei,
      reserveEthWei: reserveWei,
    });

    if (plan.unwrapWethWei > BigInt(0)) {
      await this.unwrapWethToEth(plan.unwrapWethWei);
    }

    if (plan.returnWei > BigInt(0)) {
      const returnHash = await this.clients.walletClient.writeContract({
        address: AGENT_VAULT_ADDRESS,
        abi: AGENT_VAULT_ABI,
        functionName: "returnFromStrategy",
        value: plan.returnWei,
      });
      await waitForSuccess(this.clients.publicClient, returnHash);
      console.log(`[trader] returned ${formatVaultEth(plan.returnWei)} ETH back to vault: ${returnHash}`);
    }

    if (plan.reportLossWei > BigInt(0) && this.config.vaultStrategy?.autoReportLossWhenFlat) {
      const lossHash = await this.clients.walletClient.writeContract({
        address: AGENT_VAULT_ADDRESS,
        abi: AGENT_VAULT_ABI,
        functionName: "reportStrategyLoss",
        args: [plan.reportLossWei, "flat base strategy settlement shortfall"],
      });
      await waitForSuccess(this.clients.publicClient, lossHash);
      console.log(`[trader] reported ${formatVaultEth(plan.reportLossWei)} ETH strategy loss to vault: ${lossHash}`);
    }
  }

  private async tryOpenPosition(
    candidate: ScannerLaunch,
    marketSignals: AggregatedMarketSignal[] = []
  ): Promise<Position | null> {
    if (this.config.executionVenue === "hyperliquid-perp") {
      return this.tryOpenHyperliquidPosition(candidate, marketSignals);
    }
    return this.tryOpenSpotPosition(candidate);
  }

  private async tryOpenHyperliquidPosition(
    candidate: ScannerLaunch,
    marketSignals: AggregatedMarketSignal[]
  ): Promise<Position | null> {
    const openPositions =
      !this.config.dryRun ? await this.getHyperliquidOpenPositionsFromVenue() : this.store.getOpen();
    if (openPositions.length >= this.config.risk.maxOpenPositions) {
      return null;
    }

    const HL_SIGNAL_BLOCKLIST = new Set(
      (process.env.TRADER_HL_SIGNAL_BLOCKLIST || "SPX,DJI,NDX,VIX,RUT,IXIC")
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean),
    );

    // ═══ COMPOSITE SIGNAL ROUTING ═══
    // Scan watch markets with technical + pattern + news signals.
    // Technical (40%) + Pattern (30%) + News (30%). Requires 2-of-3 agreement.
    const watchMarkets = this.config.hyperliquid.watchMarkets ?? ["BTC", "ETH", "SOL"];
    const skippedReasons: string[] = [];

    // Build news signal lookup (filtered by blocklist)
    const newsSignalMap = new Map<string, AggregatedMarketSignal>();
    for (const signal of marketSignals) {
      if (HL_SIGNAL_BLOCKLIST.has(signal.symbol.toUpperCase())) {
        skippedReasons.push(`${signal.symbol}: blocklisted (HL ticker mismatch)`);
        continue;
      }
      if (signal.contradictionPenalty > 0.7) {
        skippedReasons.push(`${signal.symbol}: conflicted (${(signal.contradictionPenalty * 100).toFixed(0)}% contradiction)`);
        continue;
      }
      if (!newsSignalMap.has(signal.symbol)) {
        newsSignalMap.set(signal.symbol, signal);
      }
    }

    let bestComposite: CompositeSignal | null = null;
    let bestMarket: Awaited<ReturnType<typeof fetchHyperliquidMarketBySymbol>> = null;
    let bestNewsSignal: AggregatedMarketSignal | null = null;

    // Per-symbol cooldown: don't re-enter a market within 10 minutes of closing
    const recentlyClosed = this.store.getClosed().filter(
      (p) => p.venue === "hyperliquid-perp" && p.closedAt && (Date.now() - p.closedAt) < 600_000,
    );
    const cooldownSymbols = new Set(recentlyClosed.map((p) => p.marketSymbol?.toUpperCase()).filter(Boolean));

    // ── Cross-system awareness: include scalper positions from the store ──
    const storeOpen = this.store.getOpen();
    const scalperSymbols = new Set(
      storeOpen
        .filter((p) => p.id.startsWith("scalp:") || p.id.startsWith("hl:"))
        .map((p) => p.marketSymbol?.toUpperCase())
        .filter(Boolean),
    );

    for (const symbol of watchMarkets) {
      if (HL_SIGNAL_BLOCKLIST.has(symbol.toUpperCase())) continue;
      if (openPositions.some((p) => p.marketSymbol === symbol)) {
        skippedReasons.push(`${symbol}: already have open position (engine)`);
        continue;
      }
      if (scalperSymbols.has(symbol.toUpperCase())) {
        skippedReasons.push(`${symbol}: already have open position (scalper)`);
        continue;
      }
      if (cooldownSymbols.has(symbol.toUpperCase())) {
        skippedReasons.push(`${symbol}: cooldown (closed <10min ago)`);
        continue;
      }

      const market = await fetchHyperliquidMarketBySymbol(this.config, symbol);
      if (!market || !market.priceUsd || market.priceUsd <= 0) continue;

      // 1. Technical signal (pure math, fast)
      let technicalSignal = null;
      try {
        technicalSignal = await fetchTechnicalSignal(this.config, symbol, { interval: "15m", count: 100 });
      } catch (err) {
        console.warn(`[trader] technical signal failed for ${symbol}:`, err instanceof Error ? err.message : err);
      }

      const newsSignal = newsSignalMap.get(symbol) ?? null;

      // Skip LLM pattern call if technical is neutral AND no news — save cost
      if ((!technicalSignal || technicalSignal.direction === "neutral") && !newsSignal) {
        skippedReasons.push(`${symbol}: technical neutral + no news signal`);
        continue;
      }

      // 2. Pattern detection (LLM — only if technical is directional)
      let patternResult = null;
      if (technicalSignal && technicalSignal.direction !== "neutral") {
        try {
          patternResult = await detectPatterns(this.config, symbol, technicalSignal);
        } catch (err) {
          console.warn(`[trader] pattern detection failed for ${symbol}:`, err instanceof Error ? err.message : err);
        }
      }

      // 2b. Market data signals + wallet flow + web intelligence (parallel with pattern)
      let marketDataBundle = null;
      let walletFlowSignal = null;
      let webIntelSignal: WebIntelligenceSignal | null = null;
      try {
        const [mktData, wfSignal, wiSignal] = await Promise.all([
          fetchMarketDataSignals(this.config, symbol),
          fetchWalletFlowSignal(this.config, symbol).catch((err) => {
            console.warn(`[trader] wallet flow signal failed for ${symbol}:`, err instanceof Error ? err.message : err);
            return null;
          }),
          fetchWebIntelligenceSignal(this.config, symbol, market.priceUsd).catch((err) => {
            console.warn(`[trader] web intelligence signal failed for ${symbol}:`, err instanceof Error ? err.message : err);
            return null;
          }),
        ]);
        marketDataBundle = mktData;
        walletFlowSignal = wfSignal;
        webIntelSignal = wiSignal;
      } catch (err) {
        console.warn(`[trader] market data signals failed for ${symbol}:`, err instanceof Error ? err.message : err);
      }

      // 3. Composite signal (with experiment override weights if active)
      const experimentWeights = await getExperimentOverrideWeights().catch(() => undefined);
      const composite = computeCompositeSignal({
        symbol,
        technical: technicalSignal,
        pattern: patternResult,
        newsSignal,
        marketData: marketDataBundle,
        walletFlow: walletFlowSignal,
        webIntelligence: webIntelSignal,
        minConfidence: this.config.risk.minSignalConfidence,
        overrideWeights: experimentWeights,
      });

      const mktDir = composite.components.marketData?.direction ?? "n/a";
      const wfDir = composite.components.walletFlow?.direction ?? "n/a";
      const wiDir = composite.components.webIntelligence?.direction ?? "n/a";
      console.log(
        `[trader] composite ${symbol}: ${composite.direction} conf=${composite.confidence.toFixed(2)} agreement=${composite.agreementMet} | ` +
        `tech=${technicalSignal?.direction ?? "n/a"} pat=${patternResult?.overallDirection ?? "n/a"} news=${newsSignal?.direction ?? "n/a"} mkt=${mktDir} wf=${wfDir} wi=${wiDir}`,
      );

      if (composite.direction === "neutral") {
        skippedReasons.push(`${symbol}: composite neutral (${composite.reasons.join("; ")})`);
        continue;
      }

      // 4. Council signal (LLM multi-agent debate) — adjusts confidence
      try {
        const council = await fetchCouncilSignal({
          symbol,
          price: market.priceUsd,
          technical: technicalSignal,
          marketData: marketDataBundle,
          newsSignal,
        });
        if (council && council.direction !== "neutral") {
          if (council.direction === composite.direction) {
            // Council agrees — boost confidence by up to 15%
            composite.confidence = Math.min(1, composite.confidence + council.confidence * 0.15);
            composite.reasons.push(`Council confirms ${council.direction} (${council.votes.filter(v => v.vote === (council.direction === "long" ? "BUY" : "SELL")).length}/4 votes)`);
          } else {
            // Council disagrees — dampen confidence by up to 20%
            composite.confidence = Math.max(0, composite.confidence - council.confidence * 0.20);
            composite.reasons.push(`Council disagrees: ${council.direction} vs composite ${composite.direction} — dampening confidence`);
            // If confidence drops below threshold, force neutral
            if (composite.confidence < this.config.risk.minSignalConfidence) {
              composite.direction = "neutral";
              composite.reasons.push("Council disagreement pushed confidence below threshold");
            }
          }
        }
      } catch (err) {
        // Council is non-fatal — composite signal stands on its own
        console.warn(`[trader] council signal failed for ${symbol}:`, err instanceof Error ? err.message : err);
      }

      if (composite.direction === "neutral") {
        skippedReasons.push(`${symbol}: council disagreement forced neutral`);
        continue;
      }

      // Pick the strongest composite signal across all watch markets
      if (!bestComposite || composite.confidence > bestComposite.confidence) {
        bestComposite = composite;
        bestMarket = market;
        bestNewsSignal = newsSignal;
      }
    }

    if (!bestComposite || !bestMarket) {
      if (skippedReasons.length > 0) {
        console.log(`[trader] no qualifying composite signal. Skipped: ${skippedReasons.join(", ")}`);
      }
      return null;
    }

    const market = bestMarket;
    const composite = bestComposite;
    const selectedSignal = bestNewsSignal;

    // Direction from composite (not raw news)
    const direction = composite.direction as "long" | "short";
    const side: "buy" | "sell" = direction === "short" ? "sell" : "buy";

    // ═══ SOUL.md MORAL GATE — disabled for now, re-enable when onchain ratings exist ═══
    // const moralGateResult = await checkMoralGate(market.symbol, direction);
    // logMoralGateDecision(moralGateResult);

    // ═══ KELLY CRITERION — position sizing using composite confidence ═══
    const journal = positionsToJournal(this.store.getAll());
    const compositeConfidence = Math.min(1, Math.max(0.1, composite.confidence));

    let accountValueUsd = this.config.risk.maxPortfolioUsd;
    if (!this.config.dryRun) {
      try {
        const accountAddress = resolveHyperliquidAccountAddress(this.config, this.clients.address);
        const hlValue = await fetchHyperliquidAccountValueUsd(this.config, accountAddress);
        if (hlValue !== null && Number.isFinite(hlValue) && hlValue > 0) {
          accountValueUsd = hlValue;
        }
      } catch { /* use fallback */ }
    }

    const kelly = computeKelly({
      config: this.config,
      accountValueUsd,
      compositeConfidence,
      journal,
      symbol: market.symbol,
      stopDistancePct: this.config.risk.stopLossPct,
    });

    if (kelly.skip) {
      console.log(`[trader] Kelly skip: ${kelly.skipReason}`);
      return null;
    }

    const convictionMultiplier = Math.min(1.5, Math.max(0.75, composite.confidence));
    const kellyNotionalUsd = kelly.positionNotionalUsd;
    const convictionNotionalUsd = this.config.hyperliquid.entryNotionalUsd * convictionMultiplier;
    const requestedNotionalUsd = Math.min(
      kellyNotionalUsd,
      convictionNotionalUsd,
      this.config.risk.maxPositionUsd
    );
    if (!Number.isFinite(requestedNotionalUsd) || requestedNotionalUsd <= 0) {
      return null;
    }
    const exchangeMinNotionalUsd = computeHyperliquidMinOrderNotionalUsd(market.priceUsd ?? 0, market.szDecimals);
    if (!Number.isFinite(exchangeMinNotionalUsd) || exchangeMinNotionalUsd <= 0) {
      return null;
    }
    const notionalUsd = Math.max(requestedNotionalUsd, exchangeMinNotionalUsd);

    const portfolioNotional = openPositions.reduce((sum, position) => sum + position.entryNotionalUsd, 0);
    if (portfolioNotional + notionalUsd > this.config.risk.maxPortfolioUsd) {
      throw new Error("portfolio limit reached");
    }

    console.log(
      `[trader] opening ${direction} ${market.symbol} notional=$${notionalUsd.toFixed(2)} side=${side} | ` +
      `composite=${composite.confidence.toFixed(2)} kelly=${kelly.fraction.toFixed(3)} (${kelly.phase})`,
    );

    const rawLeverage = kelly.leverage > 1 ? kelly.leverage : this.config.hyperliquid.defaultLeverage;
    const orderLeverage = Math.min(rawLeverage, this.config.risk.maxLeverage);

    const quoteTokenAddress = this.config.quoteTokens.USDC ?? candidate.tokenAddress;
    const quoteDecimals = this.config.quoteTokenDecimals.USDC ?? 6;
    const positionId = `hl:${market.symbol}:${market.marketId}`;

    // Archive any existing closed position at this ID before we overwrite
    const closedAtId = this.store.getAll().find((p) => p.id === positionId && p.status === "closed");
    if (closedAtId) {
      const archiveId = `${positionId}:closed:${closedAtId.closedAt ?? Date.now()}`;
      await this.store.upsert({ ...closedAtId, id: archiveId });
    }

    // ─── PRE-PERSIST rationale BEFORE placing the order ───
    // This ensures the rationale survives even if the order succeeds but the
    // post-order store write is interrupted (cold start, timeout, crash).
    // We store a "pending" position with the rationale, then update with fill data.
    const entryRationale: Position["entryRationale"] = {
      signalSymbol: selectedSignal?.symbol ?? market.symbol,
      signalDirection: selectedSignal?.direction,
      signalScore: selectedSignal?.score,
      signalObservations: selectedSignal?.observations,
      contradictionPenalty: selectedSignal?.contradictionPenalty,
      supportingClaims: selectedSignal?.supportingClaims?.slice(0, 3),
      skippedSignals: skippedReasons.length > 0 ? skippedReasons : undefined,
      kellyPhase: kelly.phase,
      kellySizeUsd: kelly.positionNotionalUsd,
      actualSizeUsd: notionalUsd,
      compositeDirection: composite.direction,
      compositeConfidence: composite.confidence,
      compositeReasons: composite.reasons.slice(0, 6),
      technicalDirection: composite.components.technical?.direction,
      technicalStrength: composite.components.technical?.strength,
      patternDirection: composite.components.pattern?.direction,
      patternNames: composite.components.pattern?.patterns,
      walletFlowDirection: composite.components.walletFlow?.direction,
      walletFlowStrength: composite.components.walletFlow?.strength,
      whaleNetExposure: composite.components.walletFlow?.whaleNetExposure,
      agreementMet: composite.agreementMet,
    };

    const prePosition: Position = {
      id: positionId,
      venue: "hyperliquid-perp",
      tokenAddress: quoteTokenAddress,
      tokenDecimals: market.szDecimals,
      quoteTokenAddress,
      quoteSymbol: "USD",
      quoteTokenDecimals: quoteDecimals,
      dex: candidate.dex,
      marketSymbol: market.symbol,
      marketId: market.marketId,
      leverage: orderLeverage,
      poolAddress: candidate.poolAddress,
      entryPriceUsd: market.priceUsd ?? 0, // best estimate pre-fill
      quantityTokenRaw: "0",
      quoteSpentRaw: "0",
      entryNotionalUsd: notionalUsd,
      stopLossPct: this.config.risk.stopLossPct,
      takeProfitPct: this.config.risk.takeProfitPct,
      openedAt: Date.now(),
      status: "open",
      direction,
      trailingStopPct: this.config.risk.trailingStopPct,
      signalSource: `composite:${composite.direction}`,
      signalConfidence: Math.min(1, composite.confidence),
      kellyFraction: kelly.fraction,
      moralScore: undefined,
      moralJustification: undefined,
      entryRationale,
      // Store dynamic TP levels from web intelligence (resistance for longs, support for shorts)
      dynamicTpLevels: composite.components.webIntelligence
        ? (direction === "long"
            ? composite.components.webIntelligence.resistanceLevels.filter((r: number) => r > (market.priceUsd ?? 0)).sort((a: number, b: number) => a - b)
            : composite.components.webIntelligence.supportLevels.filter((s: number) => s < (market.priceUsd ?? Infinity)).sort((a: number, b: number) => b - a))
        : undefined,
    };
    await this.store.upsert(prePosition);

    // ─── Now place the actual order ───
    const order = this.config.dryRun
      ? await simulateHyperliquidOrder({
          config: this.config,
          symbol: market.symbol,
          marketId: market.marketId,
          side,
          leverage: orderLeverage,
          notionalUsd,
          szDecimals: market.szDecimals,
        })
      : await executeHyperliquidOrderLive({
          config: this.config,
          market,
          side,
          leverage: orderLeverage,
          slippageBps: this.config.risk.slippageBps,
          notionalUsd,
        });

    const quoteSpentRaw = Math.max(1, Math.floor(order.notionalUsd * 10 ** quoteDecimals)).toString();

    // ─── Update with actual fill data (rationale already persisted above) ───
    const opened: Position = {
      ...prePosition,
      leverage: order.leverage,
      entryPriceUsd: order.fillPriceUsd,
      quantityTokenRaw: order.sizeRaw,
      quoteSpentRaw,
      entryNotionalUsd: order.notionalUsd,
      txHash: order.txHash,
      entryRationale: {
        ...entryRationale,
        compositeDirection: composite.direction,
        compositeConfidence: Math.min(1, composite.confidence),
        compositeReasons: composite.reasons,
        technicalDirection: composite.components.technical?.direction,
        technicalStrength: composite.components.technical?.strength,
        patternDirection: composite.components.pattern?.direction,
        patternNames: composite.components.pattern?.patterns,
        walletFlowDirection: composite.components.walletFlow?.direction,
        walletFlowStrength: composite.components.walletFlow?.strength,
        whaleNetExposure: composite.components.walletFlow?.whaleNetExposure,
        agreementMet: composite.agreementMet,
      },
    };

    await this.store.upsert(opened);
    return opened;
  }

  private async tryOpenSpotPosition(candidate: ScannerLaunch): Promise<Position | null> {
    const openPositions = this.store.getOpen();
    if (openPositions.length >= this.config.risk.maxOpenPositions) {
      return null;
    }

    // ═══ SOUL.md MORAL GATE — log-only until real onchain ratings exist ═══
    // ═══ SOUL.md MORAL GATE — disabled for now, re-enable when onchain ratings exist ═══
    // const entityId = candidate.tokenMeta?.symbol ?? candidate.tokenAddress;
    // const moralGateResult = await checkMoralGate(entityId, "long");
    // logMoralGateDecision(moralGateResult);

    const chainId = dexScreenerChainForVenue(this.config.executionVenue);
    const tokenCode = await this.clients.publicClient.getBytecode({
      address: candidate.tokenAddress,
    });
    if (!tokenCode || tokenCode === "0x") {
      return null;
    }

    const tokenMarket = await fetchTokenMarketSnapshot(candidate.tokenAddress, {
      chainId,
    });
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
    if (this.isVaultStrategyEnabled() && quoteSymbol !== "WETH") {
      console.log(`[trader] skipping ${candidate.tokenAddress}: vault-funded spot strategy currently supports WETH-quoted launches only`);
      return null;
    }

    const quoteMarket = await fetchTokenMarketSnapshot(quoteToken, {
      chainId,
    });
    const quotePriceUsd = quoteMarket.priceUsd ?? (quoteSymbol === "USDC" ? 1 : null);
    const tokenPriceUsd = tokenMarket.priceUsd ?? Number(candidate.dexScreenerData?.priceUsd ?? "");
    if (!quotePriceUsd || !Number.isFinite(tokenPriceUsd) || tokenPriceUsd <= 0) {
      return null;
    }

    if (!this.config.dryRun) {
      let balance = await this.clients.publicClient.readContract({
        address: quoteToken,
        abi: ERC20_TRADE_ABI,
        functionName: "balanceOf",
        args: [this.clients.address],
      });

      // If WETH balance is insufficient, try to pull ETH from vault + wrap
      if (balance < amountIn && quoteSymbol === "WETH") {
        try {
          await this.topUpWethFromVault(amountIn, balance);
          // Re-check balance after top-up
          balance = await this.clients.publicClient.readContract({
            address: quoteToken,
            abi: ERC20_TRADE_ABI,
            functionName: "balanceOf",
            args: [this.clients.address],
          });
        } catch (err) {
          console.warn(`[trader] vault top-up failed: ${err instanceof Error ? err.message : err}`);
        }
      }

      if (balance < amountIn) {
        throw new Error(`insufficient ${quoteSymbol} balance`);
      }
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
      venue: this.config.executionVenue,
      tokenAddress: candidate.tokenAddress,
      tokenDecimals,
      quoteTokenAddress: quoteToken,
      quoteSymbol,
      quoteTokenDecimals: quoteDecimals,
      dex: candidate.dex,
      marketSymbol: candidate.tokenMeta?.symbol || tokenMarket.baseTokenSymbol || undefined,
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
      moralScore: undefined,
      moralJustification: undefined,
    };

    await this.store.upsert(opened);
    return opened;
  }
}

function syntheticHash(): Hash {
  const raw = randomUUID().split("-").join("").padEnd(64, "0").slice(0, 64);
  return `0x${raw}` as Hash;
}

type RunnerId = "primary" | "base-parallel";

interface RunnerDescriptor {
  id: RunnerId;
  label: string;
  config: TraderExecutionConfig;
  engine: TraderEngine;
}

let runnerCache: {
  key: string;
  runners: RunnerDescriptor[];
} | null = null;

function redactedConfigFrom(config: TraderExecutionConfig) {
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
    vaultStrategy: config.vaultStrategy
      ? {
          enabled: config.vaultStrategy.enabled,
          allocateBufferBps: config.vaultStrategy.allocateBufferBps,
          autoSettleWhenFlat: config.vaultStrategy.autoSettleWhenFlat,
          autoReportLossWhenFlat: config.vaultStrategy.autoReportLossWhenFlat,
          minReserveEthRaw: config.vaultStrategy.minReserveEthRaw.toString(),
        }
      : null,
    vaultRail: config.vaultRail
      ? {
          enabled: config.vaultRail.enabled,
          baseVaultAddress: config.vaultRail.baseVaultAddress,
          reserveAllocatorAddress: config.vaultRail.reserveAllocatorAddress ?? null,
          bridgeRouterAddress: config.vaultRail.bridgeRouterAddress,
          navReporterAddress: config.vaultRail.navReporterAddress,
          assetConverterAddress: config.vaultRail.assetConverterAddress ?? null,
          bridgeAdapterAddress: config.vaultRail.bridgeAdapterAddress ?? null,
          arbTransitEscrowAddress: config.vaultRail.arbTransitEscrowAddress ?? null,
          hlStrategyManagerAddress: config.vaultRail.hlStrategyManagerAddress ?? null,
          baseBridgeAssetAddress: config.vaultRail.baseBridgeAssetAddress,
          arbBridgeAssetAddress: config.vaultRail.arbBridgeAssetAddress,
          baseChainId: config.vaultRail.baseChainId,
          arbChainId: config.vaultRail.arbChainId,
          autoReportNav: config.vaultRail.autoReportNav,
          minNavIntervalMs: config.vaultRail.minNavIntervalMs,
          navFeeEthRaw: config.vaultRail.navFeeEthRaw.toString(),
          navEthPriceUsdOverride: config.vaultRail.navEthPriceUsdOverride ?? null,
        }
      : null,
    gasMultiplierBps: config.gasMultiplierBps,
    maxPriorityFeePerGas: config.maxPriorityFeePerGas.toString(),
  };
}

function buildRunnerCacheKey(primary: TraderExecutionConfig, baseParallel: TraderExecutionConfig | null): string {
  return JSON.stringify({
    primary: {
      executionVenue: primary.executionVenue,
      dryRun: primary.dryRun,
      scannerApiUrl: primary.scannerApiUrl,
      positionStorePath: primary.positionStorePath,
      minScore: primary.risk.minScore,
      maxOpenPositions: primary.risk.maxOpenPositions,
      maxPositionUsd: primary.risk.maxPositionUsd,
    },
    baseParallel: baseParallel
      ? {
          enabled: true,
          executionVenue: baseParallel.executionVenue,
          dryRun: baseParallel.dryRun,
          scannerApiUrl: baseParallel.scannerApiUrl,
          positionStorePath: baseParallel.positionStorePath,
          minScore: baseParallel.risk.minScore,
          maxOpenPositions: baseParallel.risk.maxOpenPositions,
          maxPositionUsd: baseParallel.risk.maxPositionUsd,
        }
      : { enabled: false },
  });
}

function getTraderRunners(): RunnerDescriptor[] {
  const primaryConfig = getTraderConfig();
  const baseParallelConfig = getParallelBaseConfig();
  const key = buildRunnerCacheKey(primaryConfig, baseParallelConfig);

  if (runnerCache && runnerCache.key === key) {
    return runnerCache.runners;
  }

  const nextRunners: RunnerDescriptor[] = [
    {
      id: "primary",
      label: "primary",
      config: primaryConfig,
      engine: new TraderEngine(primaryConfig),
    },
  ];

  if (baseParallelConfig) {
    nextRunners.push({
      id: "base-parallel",
      label: "base-parallel",
      config: baseParallelConfig,
      engine: new TraderEngine(baseParallelConfig),
    });
  }

  runnerCache = {
    key,
    runners: nextRunners,
  };
  return nextRunners;
}

export function getTraderEngine(): TraderEngine {
  return getTraderRunners()[0].engine;
}

export function getParallelTraderEngines(): Array<{ runnerId: RunnerId; label: string }> {
  return getTraderRunners()
    .slice(1)
    .map((runner) => ({
      runnerId: runner.id,
      label: runner.label,
    }));
}

export async function runTraderCycle(): Promise<TraderCycleReport> {
  return getTraderEngine().runCycle();
}

export async function runTraderCycles(): Promise<{
  primary: TraderCycleReport;
  parallel: Array<{ runnerId: RunnerId; label: string; report: TraderCycleReport }>;
}> {
  const runners = getTraderRunners();
  const executed = await Promise.all(
    runners.map(async (runner) => ({
      runnerId: runner.id,
      label: runner.label,
      report: await runner.engine.runCycle(),
    }))
  );

  return {
    primary: executed[0].report,
    parallel: executed.slice(1),
  };
}

export async function listTraderPositions(): Promise<Position[]> {
  return getTraderEngine().listPositions();
}

export async function listTraderPositionsByRunner(): Promise<{
  primary: Position[];
  parallel: Array<{ runnerId: RunnerId; label: string; positions: Position[] }>;
}> {
  const runners = getTraderRunners();
  const collected = await Promise.all(
    runners.map(async (runner) => ({
      runnerId: runner.id,
      label: runner.label,
      positions: await runner.engine.listPositions(),
    }))
  );

  return {
    primary: collected[0].positions,
    parallel: collected.slice(1),
  };
}

export async function getTraderReadiness(): Promise<TraderReadinessReport> {
  return getTraderEngine().getReadiness();
}

export async function getTraderReadinessByRunner(): Promise<{
  primary: TraderReadinessReport;
  parallel: Array<{ runnerId: RunnerId; label: string; readiness: TraderReadinessReport }>;
}> {
  const runners = getTraderRunners();
  const collected = await Promise.all(
    runners.map(async (runner) => ({
      runnerId: runner.id,
      label: runner.label,
      readiness: await runner.engine.getReadiness(),
    }))
  );

  return {
    primary: collected[0].readiness,
    parallel: collected.slice(1),
  };
}

export async function getTraderPerformance(): Promise<TraderPerformanceReport> {
  return getTraderEngine().getPerformance();
}

export async function getTraderPerformanceByRunner(): Promise<{
  primary: TraderPerformanceReport;
  parallel: Array<{ runnerId: RunnerId; label: string; performance: TraderPerformanceReport }>;
}> {
  const runners = getTraderRunners();
  const collected = await Promise.all(
    runners.map(async (runner) => ({
      runnerId: runner.id,
      label: runner.label,
      performance: await runner.engine.getPerformance(),
    }))
  );

  return {
    primary: collected[0].performance,
    parallel: collected.slice(1),
  };
}

export function redactedConfigSummary() {
  const runners = getTraderRunners();
  const primary = redactedConfigFrom(runners[0].config);
  const parallelRunners = runners.slice(1).map((runner) => ({
    runnerId: runner.id,
    label: runner.label,
    config: redactedConfigFrom(runner.config),
  }));
  return {
    ...primary,
    parallelRunners,
  };
}
