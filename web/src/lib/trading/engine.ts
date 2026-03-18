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
} from "./hyperliquid";
import { fetchTokenMarketSnapshot, normalizeQuoteSymbol, type DexScreenerChainId } from "./market";
import { PositionStore } from "./position-store";
import { fetchScannerCandidates } from "./scanner-client";
import { getAggregatedMarketSignals, type AggregatedMarketSignal } from "./signals";
import { estimateAmountOutMin, executeSwap, readTokenDecimals, waitForSuccess } from "./swap";
import { checkMoralGate, checkCircuitBreaker, logMoralGateDecision } from "./moral-gate";
import { computeKelly, consecutiveLosses } from "./kelly";
import { positionsToJournal } from "./trade-journal";
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

    await this.evaluateOpenPositions(report);

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

      // Position gone from HL — fetch current market price for accurate exit PnL
      let exitPriceUsd = stored.entryPriceUsd; // fallback
      try {
        const currentPrice = await this.resolvePositionPriceUsd(stored);
        if (currentPrice && Number.isFinite(currentPrice) && currentPrice > 0) {
          exitPriceUsd = currentPrice;
        }
      } catch {
        // keep fallback
      }
      await this.store.close(stored.id, {
        exitReason: "manual",
        exitPriceUsd,
        closedAt: Date.now(),
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

      const priceRatio = currentPriceUsd / position.entryPriceUsd;
      const marketValueUsd = position.direction === "short"
        ? position.entryNotionalUsd * (2 - priceRatio)
        : position.entryNotionalUsd * priceRatio;
      // PnL includes estimated round-trip exchange fees
      const grossPnl = marketValueUsd - position.entryNotionalUsd;
      const pnlUsd = grossPnl - estFees;
      const pnlPct = position.entryNotionalUsd > 0 ? pnlUsd / position.entryNotionalUsd : 0;

      openMarketValueUsd += marketValueUsd;
      unrealizedPnlUsd += pnlUsd;
      open.push({
        position,
        currentPriceUsd,
        marketValueUsd,
        unrealizedPnlUsd: pnlUsd,
        unrealizedPnlPct: pnlPct,
        estimatedFeesUsd: estFees,
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

      const priceMove = position.direction === "short"
        ? (position.entryPriceUsd - position.exitPriceUsd) / position.entryPriceUsd
        : (position.exitPriceUsd - position.entryPriceUsd) / position.entryPriceUsd;
      // PnL includes estimated round-trip exchange fees
      const grossPnl = position.entryNotionalUsd * priceMove;
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

  private async evaluateOpenPositions(report: TraderCycleReport): Promise<void> {
    const open = this.store.getOpen();
    if (open.length === 0) return;

    for (const position of open) {
      // Skip scalper-managed positions (they have their own SL/TP via WebSocket)
      if (position.id.startsWith("scalp:")) continue;

      try {
        const currentPriceUsd = await this.resolvePositionPriceUsd(position);

        if (!currentPriceUsd || !Number.isFinite(currentPriceUsd) || currentPriceUsd <= 0) {
          report.skipped.push(`exit:no-price:${position.tokenAddress}`);
          continue;
        }

        const isShort = position.direction === "short";
        const pnlPct = isShort
          ? (position.entryPriceUsd - currentPriceUsd) / position.entryPriceUsd
          : (currentPriceUsd - position.entryPriceUsd) / position.entryPriceUsd;

        // ── Stop-loss: full close ──
        const stopPrice = isShort
          ? position.entryPriceUsd * (1 + position.stopLossPct)
          : position.entryPriceUsd * (1 - position.stopLossPct);
        const hitStop = isShort ? currentPriceUsd >= stopPrice : currentPriceUsd <= stopPrice;
        if (hitStop) {
          const closed = await this.closePosition(position, "stop-loss", currentPriceUsd);
          if (closed) report.exits.push(closed);
          continue;
        }

        // ── Trailing stop: update high/low water mark, close if retraced ──
        const trailingPct = position.trailingStopPct ?? this.config.risk.trailingStopPct ?? 0;
        const activationPct = this.config.risk.trailingStopActivationPct ?? 0.03;
        if (trailingPct > 0 && pnlPct >= activationPct) {
          const hwm = position.highWaterMark ?? position.entryPriceUsd;
          const lwm = position.lowWaterMark ?? position.entryPriceUsd;
          if (isShort) {
            const newLwm = Math.min(lwm, currentPriceUsd);
            if (newLwm < lwm) await this.store.upsert({ ...position, lowWaterMark: newLwm });
            const trailPrice = newLwm * (1 + trailingPct);
            if (currentPriceUsd >= trailPrice) {
              const closed = await this.closePosition(position, "trailing-stop", currentPriceUsd);
              if (closed) report.exits.push(closed);
              continue;
            }
          } else {
            const newHwm = Math.max(hwm, currentPriceUsd);
            if (newHwm > hwm) await this.store.upsert({ ...position, highWaterMark: newHwm });
            const trailPrice = newHwm * (1 - trailingPct);
            if (currentPriceUsd <= trailPrice) {
              const closed = await this.closePosition(position, "trailing-stop", currentPriceUsd);
              if (closed) report.exits.push(closed);
              continue;
            }
          }
        }

        // ── Scaled take-profit: close 25% at each tier, let the rest ride ──
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

    const closeSide = position.direction === "short" ? "buy" : "sell";

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
        });
      }
      return true;
    } catch (error) {
      console.error(`[trader] partial close failed: ${error instanceof Error ? error.message : "unknown"}`);
      return false;
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

    let selectedSignal: AggregatedMarketSignal | null = null;
    let market = null;

    // News-first routing: pick strongest directional signal (bullish OR bearish)
    // that exists on Hyperliquid. Skip conflicted signals (sources disagree).
    for (const signal of marketSignals) {
      if (signal.contradictionPenalty > 0.7) {
        console.log(
          `[trader] skipping conflicted signal: ${signal.symbol} contradiction=${signal.contradictionPenalty.toFixed(2)}`,
        );
        continue;
      }
      const signaledMarket = await fetchHyperliquidMarketBySymbol(this.config, signal.symbol);
      if (!signaledMarket) continue;
      selectedSignal = signal;
      market = signaledMarket;
      console.log(
        `[trader] signal-route: ${signal.symbol} ${signal.direction} score=${signal.score.toFixed(3)} contradiction=${signal.contradictionPenalty.toFixed(2)} obs=${signal.observations}`,
      );
      break;
    }

    if (!market) {
      console.log("[trader] no qualifying signal, falling back to scanner candidate");
      market = await resolveHyperliquidMarketForLaunch(this.config, candidate);
    }
    if (!market || !market.priceUsd || market.priceUsd <= 0) {
      return null;
    }
    if (openPositions.some((position) => position.marketSymbol === market.symbol)) {
      return null;
    }

    // Determine trade direction from signal: bearish → short (sell), bullish → long (buy)
    const isBearish = selectedSignal?.direction === "bearish";
    const side: "buy" | "sell" = isBearish ? "sell" : "buy";
    const direction: "long" | "short" = isBearish ? "short" : "long";

    // ═══ SOUL.md MORAL GATE — log-only until real onchain ratings exist ═══
    const moralGateResult = await checkMoralGate(market.symbol, direction);
    logMoralGateDecision(moralGateResult);
    if (!moralGateResult.allowed) {
      console.log(`[trader] SOUL.md ADVISORY (not blocking): ${market.symbol} ${direction} — ${moralGateResult.justification}`);
    }

    // ═══ SOUL.md KELLY CRITERION — position sizing via bankroll math ═══
    const journal = positionsToJournal(this.store.getAll());
    const compositeConfidence = selectedSignal
      ? Math.min(1, Math.max(0.1, Math.abs(selectedSignal.score)))
      : 0.5;

    // Get account value for Kelly sizing
    let accountValueUsd = this.config.risk.maxPortfolioUsd; // fallback
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

    // Use Kelly-derived position size, bounded by config limits
    const rawConviction = selectedSignal ? selectedSignal.score : 1;
    const convictionMultiplier = Number.isFinite(rawConviction)
      ? Math.min(1.5, Math.max(0.75, rawConviction))
      : 1;
    const kellyNotionalUsd = kelly.positionNotionalUsd;
    const convictionNotionalUsd = this.config.hyperliquid.entryNotionalUsd * convictionMultiplier;
    // Take the smaller of Kelly-derived and conviction-derived (conservative)
    const requestedNotionalUsd = Math.min(
      kellyNotionalUsd,
      convictionNotionalUsd,
      this.config.risk.maxPositionUsd
    );
    if (!Number.isFinite(requestedNotionalUsd) || requestedNotionalUsd <= 0) {
      return null;
    }
    const exchangeMinNotionalUsd = computeHyperliquidMinOrderNotionalUsd(market.priceUsd, market.szDecimals);
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
      `moral=${moralGateResult.moralScore}/100 kelly=${kelly.fraction.toFixed(3)} (${kelly.phase})`,
    );

    const order = this.config.dryRun
      ? await simulateHyperliquidOrder({
          config: this.config,
          symbol: market.symbol,
          marketId: market.marketId,
          side,
          leverage: this.config.hyperliquid.defaultLeverage,
          notionalUsd,
          szDecimals: market.szDecimals,
        })
      : await executeHyperliquidOrderLive({
          config: this.config,
          market,
          side,
          leverage: this.config.hyperliquid.defaultLeverage,
          slippageBps: this.config.risk.slippageBps,
          notionalUsd,
        });

    const quoteTokenAddress = this.config.quoteTokens.USDC ?? candidate.tokenAddress;
    const quoteDecimals = this.config.quoteTokenDecimals.USDC ?? 6;
    const quoteSpentRaw = Math.max(1, Math.floor(order.notionalUsd * 10 ** quoteDecimals)).toString();

    // Use deterministic ID matching HL sync format so positions stay consistent
    const positionId = `hl:${market.symbol}:${market.marketId}`;

    // Archive any closed position at this ID before creating the new one
    const closedAtId = this.store.getAll().find((p) => p.id === positionId && p.status === "closed");
    if (closedAtId) {
      const archiveId = `${positionId}:closed:${closedAtId.closedAt ?? Date.now()}`;
      await this.store.upsert({ ...closedAtId, id: archiveId });
    }

    const opened: Position = {
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
      direction,
      trailingStopPct: this.config.risk.trailingStopPct,
      signalSource: selectedSignal ? `${selectedSignal.symbol}:${selectedSignal.direction}` : undefined,
      signalConfidence: selectedSignal ? Math.abs(selectedSignal.score) : undefined,
      kellyFraction: kelly.fraction,
      moralScore: moralGateResult.moralScore ?? undefined,
      moralJustification: moralGateResult.justification,
    };

    await this.store.upsert(opened);
    return opened;
  }

  private async tryOpenSpotPosition(candidate: ScannerLaunch): Promise<Position | null> {
    const openPositions = this.store.getOpen();
    if (openPositions.length >= this.config.risk.maxOpenPositions) {
      return null;
    }

    // ═══ SOUL.md MORAL GATE — spot buys are always "long" ═══
    const entityId = candidate.tokenMeta?.symbol ?? candidate.tokenAddress;
    const moralGateResult = await checkMoralGate(entityId, "long");
    logMoralGateDecision(moralGateResult);
    if (!moralGateResult.allowed) {
      console.log(`[trader] SOUL.md BLOCKED spot: ${entityId} — ${moralGateResult.justification}`);
      return null;
    }

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

    const quoteMarket = await fetchTokenMarketSnapshot(quoteToken, {
      chainId,
    });
    const quotePriceUsd = quoteMarket.priceUsd ?? (quoteSymbol === "USDC" ? 1 : null);
    const tokenPriceUsd = tokenMarket.priceUsd ?? Number(candidate.dexScreenerData?.priceUsd ?? "");
    if (!quotePriceUsd || !Number.isFinite(tokenPriceUsd) || tokenPriceUsd <= 0) {
      return null;
    }

    if (!this.config.dryRun) {
      const balance = await this.clients.publicClient.readContract({
        address: quoteToken,
        abi: ERC20_TRADE_ABI,
        functionName: "balanceOf",
        args: [this.clients.address],
      });
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
      moralScore: moralGateResult.moralScore ?? undefined,
      moralJustification: moralGateResult.justification,
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
