/**
 * scalper.ts — Real-time sub-minute scalping engine for Hyperliquid perps.
 *
 * Streams 1m candles via WebSocket, detects big moves (large candles,
 * volume spikes, VWAP breakouts), and executes immediately.
 * Momentum strategy: trade in direction of the big move.
 */

import { randomUUID } from "node:crypto";
import { privateKeyToAccount } from "viem/accounts";
import type { Address } from "viem";
import type { Candle } from "./hyperliquid";
import {
  closeHyperliquidWs,
  executeHyperliquidOrderLive,
  fetchCandles,
  fetchHyperliquidLivePositions,
  fetchHyperliquidMarketBySymbol,
  getHyperliquidWsClients,
  resolveHyperliquidAccountAddress,
  simulateHyperliquidOrder,
} from "./hyperliquid";
import { computeRSI, computeEMAs, computeBollinger } from "./technical";
import { checkMoralGate, logMoralGateDecision } from "./moral-gate";
import { globalPositionLock } from "./global-position-lock";
import type { ScalperConfig, ScalpSignal, ScalpPosition, TraderExecutionConfig, EntryRationale } from "./types";
import { PositionStore } from "./position-store";

const BUFFER_SIZE = 60; // 1 hour of 1m candles

/* ═══════════════════════════  CandleBuffer  ═══════════════════════════ */

export class CandleBuffer {
  private candles: Candle[] = [];
  readonly symbol: string;
  private readonly maxSize: number;

  constructor(symbol: string, maxSize = BUFFER_SIZE) {
    this.symbol = symbol;
    this.maxSize = maxSize;
  }

  /**
   * Push a new candle or update the current one (Hyperliquid sends partial
   * updates for the in-progress candle with the same timestamp).
   */
  pushOrUpdate(candle: Candle): { isNewCandle: boolean } {
    const last = this.candles[this.candles.length - 1];
    if (last && last.timestamp === candle.timestamp) {
      this.candles[this.candles.length - 1] = candle;
      return { isNewCandle: false };
    }

    this.candles.push(candle);
    if (this.candles.length > this.maxSize) {
      this.candles.shift();
    }
    return { isNewCandle: true };
  }

  get length(): number {
    return this.candles.length;
  }

  get lastCandle(): Candle | null {
    return this.candles[this.candles.length - 1] ?? null;
  }

  /** The most recently completed candle (second-to-last, since last is in-progress). */
  get completedCandle(): Candle | null {
    return this.candles.length >= 2 ? this.candles[this.candles.length - 2] : null;
  }

  /** Close prices excluding the current in-progress candle. */
  get completedClosePrices(): number[] {
    return this.candles.slice(0, -1).map((c) => c.close);
  }

  get closePrices(): number[] {
    return this.candles.map((c) => c.close);
  }

  get vwap(): number {
    let numerator = 0;
    let denominator = 0;
    for (const c of this.candles) {
      const typical = (c.high + c.low + c.close) / 3;
      numerator += typical * c.volume;
      denominator += c.volume;
    }
    return denominator > 0 ? numerator / denominator : this.lastCandle?.close ?? 0;
  }

  get volumeSMA20(): number {
    const recent = this.candles.slice(-20);
    if (recent.length === 0) return 0;
    return recent.reduce((s, c) => s + c.volume, 0) / recent.length;
  }

  getAll(): Candle[] {
    return [...this.candles];
  }
}

/* ═══════════════════════  Signal Detection  ═══════════════════════ */

/**
 * Pure-math signal detection. No LLM calls — fast enough for real-time.
 * Momentum strategy: trade in direction of the big move.
 */
export function detectScalpSignal(
  buffer: CandleBuffer,
  config: ScalperConfig,
  currentMidPrice: number,
): ScalpSignal | null {
  if (buffer.length < 22) return null; // need at least 22 candles (21 completed + 1 in-progress)

  // Evaluate the just-completed candle, NOT the in-progress one
  const lastCandle = buffer.completedCandle;
  if (!lastCandle) return null;

  const closes = buffer.completedClosePrices;
  const reasons: string[] = [];
  let direction: "long" | "short" | null = null;
  let trigger: ScalpSignal["trigger"] = "big-candle";
  let confluenceCount = 0;

  // --- Signal 1: Big candle body (momentum) ---
  const bodyPct = Math.abs(lastCandle.close - lastCandle.open) / lastCandle.open;
  const isBigCandle = bodyPct >= config.candleThresholdPct;
  const candleDirection: "long" | "short" = lastCandle.close > lastCandle.open ? "long" : "short";

  if (isBigCandle) {
    direction = candleDirection;
    trigger = "big-candle";
    reasons.push(`Big ${candleDirection} candle: ${(bodyPct * 100).toFixed(2)}%`);
    confluenceCount++;
  }

  // --- Signal 2: Volume spike (momentum in candle direction) ---
  const volumeSMA = buffer.volumeSMA20;
  const volumeRatio = volumeSMA > 0 ? lastCandle.volume / volumeSMA : 1;
  const isVolumeSpike = volumeRatio >= config.volumeSpikeMultiplier;

  if (isVolumeSpike) {
    reasons.push(`Volume spike: ${volumeRatio.toFixed(1)}x avg`);
    confluenceCount++;
    if (!direction) {
      direction = candleDirection;
      trigger = "volume-spike";
    }
  }

  // --- Signal 3: VWAP breakout (momentum, trade in direction of deviation) ---
  const vwap = buffer.vwap;
  const priceVsVwap = vwap > 0 ? (currentMidPrice - vwap) / vwap : 0;
  const isVwapBreakout = Math.abs(priceVsVwap) >= config.vwapDeviationPct;

  if (isVwapBreakout) {
    const breakoutDir: "long" | "short" = priceVsVwap > 0 ? "long" : "short";
    reasons.push(`VWAP breakout: ${(priceVsVwap * 100).toFixed(2)}% ${breakoutDir}`);
    confluenceCount++;
    if (!direction) {
      direction = breakoutDir;
      trigger = "vwap-deviation";
    }
  }

  // --- Fast indicator confirmation ---
  const rsi14 = computeRSI(closes, 14);
  const emaReading = computeEMAs(closes);
  const bollinger = computeBollinger(closes, 20, 2);

  // RSI confirmation (oversold confirms long momentum bounce, overbought confirms short)
  if (rsi14 < 30 && direction === "long") {
    reasons.push(`RSI oversold ${rsi14.toFixed(1)} confirms long`);
    confluenceCount++;
  }
  if (rsi14 > 70 && direction === "short") {
    reasons.push(`RSI overbought ${rsi14.toFixed(1)} confirms short`);
    confluenceCount++;
  }

  // Bollinger confirmation
  if (bollinger.percentB < 0.1 && direction === "long") {
    reasons.push(`Bollinger %B ${bollinger.percentB.toFixed(2)} confirms long`);
    confluenceCount++;
  }
  if (bollinger.percentB > 0.9 && direction === "short") {
    reasons.push(`Bollinger %B ${bollinger.percentB.toFixed(2)} confirms short`);
    confluenceCount++;
  }

  // EMA trend alignment confirmation
  if (emaReading.trendAlignment === "bullish" && direction === "long") {
    reasons.push("EMA trend bullish confirms long");
    confluenceCount++;
  }
  if (emaReading.trendAlignment === "bearish" && direction === "short") {
    reasons.push("EMA trend bearish confirms short");
    confluenceCount++;
  }

  // Require at least 4 confluent signals — event sniper mode, not routine scalping
  if (!direction || confluenceCount < 4) return null;

  if (confluenceCount >= 3) trigger = "multi-confluence";

  const confidence = Math.min(1, 0.3 + confluenceCount * 0.15);

  return {
    symbol: buffer.symbol,
    timestamp: Date.now(),
    direction,
    trigger,
    confidence,
    triggerCandle: {
      open: lastCandle.open,
      high: lastCandle.high,
      low: lastCandle.low,
      close: lastCandle.close,
      volume: lastCandle.volume,
      bodyPct,
    },
    indicators: {
      rsi14,
      ema9: emaReading.ema9,
      ema21: emaReading.ema21,
      bollingerPercentB: bollinger.percentB,
      vwap,
      volumeRatio,
      priceVsVwap,
    },
    reasons,
  };
}

/* ═══════════════════════  ScalperManager  ═══════════════════════ */

interface ActiveSubscription {
  unsubscribe(): Promise<void>;
}

export class ScalperManager {
  private readonly traderConfig: TraderExecutionConfig;
  private readonly scalperConfig: ScalperConfig;
  private store: PositionStore | null = null;

  private buffers = new Map<string, CandleBuffer>();
  private midPrices = new Map<string, number>();
  private openScalps = new Map<string, ScalpPosition>();
  private closedScalps: ScalpPosition[] = [];
  private lastEntryByMarket = new Map<string, number>();
  /** Prevent concurrent execution on the same market */
  private executingMarkets = new Set<string>();

  private subscriptions: ActiveSubscription[] = [];
  private monitorInterval: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(traderConfig: TraderExecutionConfig, scalperConfig: ScalperConfig) {
    this.traderConfig = traderConfig;
    this.scalperConfig = scalperConfig;
  }

  /** Attach a position store so scalper can pre-persist rationale for the dashboard */
  setStore(store: PositionStore): void {
    this.store = store;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    const { subscriptionClient } = getHyperliquidWsClients(this.traderConfig, true);
    const walletAddress = privateKeyToAccount(this.traderConfig.privateKey).address as Address;
    const accountAddress = resolveHyperliquidAccountAddress(this.traderConfig, walletAddress);

    log("connecting WebSocket...");

    // 1. Subscribe to allMids for real-time price tracking + SL/TP monitoring
    const midsSub = await subscriptionClient.allMids((data: { mids: Record<string, string> }) => {
      for (const [coin, price] of Object.entries(data.mids)) {
        const numPrice = Number(price);
        if (Number.isFinite(numPrice) && numPrice > 0) {
          this.midPrices.set(coin.toUpperCase(), numPrice);
        }
      }
      this.checkScalpExits();
    });
    this.subscriptions.push(midsSub);
    log("allMids subscribed");

    // Small delay between subscriptions to avoid WS rate-limits
    const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

    // 2. Subscribe to 1m candles for each watched market
    const activeMarkets: string[] = [];
    for (const market of this.scalperConfig.markets) {
      try {
        this.buffers.set(market, new CandleBuffer(market));

        const candleSub = await subscriptionClient.candle(
          { coin: market, interval: "1m" },
          (data: { t: number; o: string; h: string; l: string; c: string; v: string; n: number }) => {
            const candle: Candle = {
              timestamp: data.t,
              open: Number(data.o),
              high: Number(data.h),
              low: Number(data.l),
              close: Number(data.c),
              volume: Number(data.v),
            };

            const buffer = this.buffers.get(market);
            if (!buffer) return;

            const { isNewCandle } = buffer.pushOrUpdate(candle);

            // Evaluate signals on new completed candles
            if (isNewCandle) {
              this.evaluateScalpSignal(market);
            }
          },
        );
        this.subscriptions.push(candleSub);
        activeMarkets.push(market);
        log(`candle subscription OK: ${market}`);
        await delay(200);
      } catch (err) {
        log(`subscription failed for ${market}, skipping: ${err instanceof Error ? err.message : err}`);
        this.buffers.delete(market);
      }
    }
    // Update markets list to only include successfully subscribed ones
    this.scalperConfig.markets = activeMarkets;

    // 3. Subscribe to order updates for fill confirmation
    try {
      const orderSub = await subscriptionClient.orderUpdates(
        { user: accountAddress as `0x${string}` },
        (data: unknown) => {
          this.handleOrderUpdate(data);
        },
      );
      this.subscriptions.push(orderSub);
    } catch (err) {
      log(`orderUpdates subscription failed (non-fatal): ${err instanceof Error ? err.message : err}`);
    }

    // 4. Load existing positions from exchange (persistence across redeploys)
    await this.loadExistingPositions(walletAddress);

    // 5. Periodic timeout check (every 5 seconds)
    this.monitorInterval = setInterval(() => {
      this.checkScalpTimeouts();
    }, 5_000);

    // 6. Backfill candle buffers with recent history via HTTP
    await this.backfillCandles();

    log(`started, watching ${this.scalperConfig.markets.join(",")} via WebSocket`);
    log(`config: SL=${(this.scalperConfig.stopLossPct * 100).toFixed(1)}% TP=${(this.scalperConfig.takeProfitPct * 100).toFixed(1)}% lev=${this.scalperConfig.defaultLeverage}x max=$${this.scalperConfig.maxPositionUsd} dryRun=${this.scalperConfig.dryRun}`);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    for (const sub of this.subscriptions) {
      await sub.unsubscribe().catch(() => {});
    }
    this.subscriptions = [];
    await closeHyperliquidWs();
    log("stopped");
  }

  getOpenScalps(): ScalpPosition[] {
    return Array.from(this.openScalps.values());
  }

  getClosedScalps(): ScalpPosition[] {
    return [...this.closedScalps];
  }

  /* ── Backfill ── */

  private async backfillCandles(): Promise<void> {
    for (const market of this.scalperConfig.markets) {
      try {
        const candles = await fetchCandles(this.traderConfig, market, "1m", BUFFER_SIZE);
        const buffer = this.buffers.get(market);
        if (buffer) {
          for (const c of candles) {
            buffer.pushOrUpdate(c);
          }
          log(`backfill ${market}: ${candles.length} candles loaded`);
        }
      } catch (err) {
        log(`backfill ${market} failed: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  /* ── Position persistence (load existing positions from exchange) ── */

  private async loadExistingPositions(walletAddress: Address): Promise<void> {
    try {
      const livePositions = await fetchHyperliquidLivePositions(this.traderConfig, walletAddress);
      const watchedMarkets = new Set(this.scalperConfig.markets.map((m) => m.toUpperCase()));

      for (const pos of livePositions) {
        const symbol = pos.symbol.toUpperCase();
        if (!watchedMarkets.has(symbol)) continue;

        // Adopt this position as a scalp with conservative SL/TP
        const direction: "long" | "short" = pos.isShort ? "short" : "long";
        const slMultiplier = direction === "long"
          ? 1 - this.scalperConfig.stopLossPct
          : 1 + this.scalperConfig.stopLossPct;
        const tpMultiplier = direction === "long"
          ? 1 + this.scalperConfig.takeProfitPct
          : 1 - this.scalperConfig.takeProfitPct;

        const scalp: ScalpPosition = {
          id: `scalp:recovered-${symbol}-${Date.now()}`,
          symbol,
          marketId: pos.marketId ?? null,
          direction,
          entryPriceUsd: pos.entryPriceUsd,
          sizeRaw: pos.size,
          notionalUsd: pos.positionValueUsd,
          leverage: pos.leverage ?? this.scalperConfig.defaultLeverage,
          stopLossPriceUsd: pos.entryPriceUsd * slMultiplier,
          takeProfitPriceUsd: pos.entryPriceUsd * tpMultiplier,
          openedAt: Date.now(),
          expiresAt: Date.now() + this.scalperConfig.maxHoldMs,
          signal: {
            symbol,
            timestamp: Date.now(),
            direction,
            trigger: "multi-confluence",
            confidence: 0.5,
            triggerCandle: { open: 0, high: 0, low: 0, close: 0, volume: 0, bodyPct: 0 },
            indicators: { rsi14: 50, ema9: 0, ema21: 0, bollingerPercentB: 0.5, vwap: 0, volumeRatio: 1, priceVsVwap: 0 },
            reasons: ["recovered from exchange on restart"],
          },
          status: "open",
        };

        this.openScalps.set(scalp.id, scalp);
        log(`RECOVERED ${direction} ${symbol} @ $${pos.entryPriceUsd.toFixed(2)} size=${pos.size} notional=$${pos.positionValueUsd.toFixed(2)} | SL=$${scalp.stopLossPriceUsd.toFixed(2)} TP=$${scalp.takeProfitPriceUsd.toFixed(2)}`);
      }

      if (this.openScalps.size > 0) {
        log(`loaded ${this.openScalps.size} existing position(s) from exchange`);
      }
    } catch (err) {
      log(`failed to load existing positions: ${err instanceof Error ? err.message : err}`);
    }
  }

  /* ── Signal evaluation ── */

  private evaluateScalpSignal(market: string): void {
    if (!this.running) return;

    // Cooldown check
    const lastEntry = this.lastEntryByMarket.get(market) ?? 0;
    if (Date.now() - lastEntry < this.scalperConfig.cooldownMs) return;

    // Max open scalps check
    if (this.openScalps.size >= this.scalperConfig.maxOpenScalps) return;

    // Already have a scalp open on this market?
    for (const scalp of this.openScalps.values()) {
      if (scalp.symbol === market && scalp.status === "open") return;
    }

    // ── Cross-system awareness: check if trader engine has a position on this market ──
    if (this.store) {
      const traderPositions = this.store.getOpen();
      const traderHasMarket = traderPositions.some(
        (p) => p.marketSymbol?.toUpperCase() === market.toUpperCase() && !p.id.startsWith("scalp:"),
      );
      if (traderHasMarket) {
        log(`SKIP ${market}: trader engine has open position — deferring`);
        return;
      }
      // Also check total open positions across both systems
      const totalOpen = this.openScalps.size + traderPositions.filter((p) => !p.id.startsWith("scalp:")).length;
      const globalMaxPositions = this.scalperConfig.maxOpenScalps + 3; // scalper limit + trader headroom
      if (totalOpen >= globalMaxPositions) {
        log(`SKIP ${market}: global position limit reached (${totalOpen}/${globalMaxPositions})`);
        return;
      }
    }

    // Global cross-system cooldown (engine + scalper)
    if (!globalPositionLock.canOpen(market, "scalper")) {
      return;
    }

    // Already executing on this market?
    if (this.executingMarkets.has(market)) return;

    const buffer = this.buffers.get(market);
    if (!buffer) return;

    const midPrice = this.midPrices.get(market);
    if (!midPrice) return;

    const signal = detectScalpSignal(buffer, this.scalperConfig, midPrice);
    if (!signal) return;

    // ── Direction conflict check: don't fight the trader engine's position ──
    if (this.store) {
      const traderPos = this.store.getOpen().find(
        (p) => p.marketSymbol?.toUpperCase() === market.toUpperCase() && !p.id.startsWith("scalp:"),
      );
      if (traderPos && traderPos.direction && traderPos.direction !== signal.direction) {
        log(`SKIP ${market} ${signal.direction}: conflicts with trader engine's ${traderPos.direction} position`);
        return;
      }
    }

    log(`SIGNAL: ${signal.direction} ${market} | trigger=${signal.trigger} conf=${signal.confidence.toFixed(2)} | ${signal.reasons.join("; ")}`);

    this.executingMarkets.add(market);
    void this.executeScalp(market, signal, midPrice)
      .catch((err) => {
        log(`execution error ${market}: ${err instanceof Error ? err.message : err}`);
      })
      .finally(() => {
        this.executingMarkets.delete(market);
      });
  }

  /* ── Execution ── */

  private async executeScalp(
    market: string,
    signal: ScalpSignal,
    _midPrice: number,
  ): Promise<void> {
    // ═══ SOUL.md MORAL GATE — disabled for now, re-enable when onchain ratings exist ═══
    // const moralGateResult = await checkMoralGate(market, signal.direction);
    // logMoralGateDecision(moralGateResult);
    // if (!moralGateResult.allowed) {
    //   log(`SOUL.md BLOCKED: ${market} ${signal.direction} — ${moralGateResult.justification}`);
    //   return;
    // }

    const marketSnapshot = await fetchHyperliquidMarketBySymbol(this.traderConfig, market);
    if (!marketSnapshot || !marketSnapshot.priceUsd) {
      log(`no market data for ${market}, skipping`);
      return;
    }

    const side = signal.direction === "short" ? "sell" : "buy";
    const notionalUsd = Math.min(
      this.scalperConfig.maxPositionUsd,
      this.traderConfig.risk.maxPositionUsd,
    );

    // Use market's max leverage (BTC=40x, ETH=25x, etc.), fall back to config default
    const leverage = marketSnapshot.maxLeverage ?? this.scalperConfig.defaultLeverage;

    const order = this.scalperConfig.dryRun
      ? await simulateHyperliquidOrder({
          config: this.traderConfig,
          symbol: marketSnapshot.symbol,
          marketId: marketSnapshot.marketId,
          side,
          leverage,
          notionalUsd,
          szDecimals: marketSnapshot.szDecimals,
        })
      : await executeHyperliquidOrderLive({
          config: this.traderConfig,
          market: marketSnapshot,
          side,
          leverage,
          slippageBps: this.traderConfig.risk.slippageBps,
          notionalUsd,
        });

    // Compute SL/TP prices
    const slMultiplier = signal.direction === "long"
      ? 1 - this.scalperConfig.stopLossPct
      : 1 + this.scalperConfig.stopLossPct;
    const tpMultiplier = signal.direction === "long"
      ? 1 + this.scalperConfig.takeProfitPct
      : 1 - this.scalperConfig.takeProfitPct;

    const scalp: ScalpPosition = {
      id: `scalp:${order.id}`,
      symbol: market,
      marketId: order.marketId,
      direction: signal.direction,
      entryPriceUsd: order.fillPriceUsd,
      sizeRaw: order.sizeRaw,
      notionalUsd: order.notionalUsd,
      leverage: order.leverage,
      stopLossPriceUsd: order.fillPriceUsd * slMultiplier,
      takeProfitPriceUsd: order.fillPriceUsd * tpMultiplier,
      openedAt: Date.now(),
      expiresAt: Date.now() + this.scalperConfig.maxHoldMs,
      signal,
      status: "open",
    };

    this.openScalps.set(scalp.id, scalp);
    this.lastEntryByMarket.set(market, Date.now());

    log(
      `OPENED ${signal.direction} ${market} @ $${order.fillPriceUsd.toFixed(2)} ` +
      `| notional=$${order.notionalUsd.toFixed(2)} lev=${order.leverage}x ` +
      `| SL=$${scalp.stopLossPriceUsd.toFixed(2)} TP=$${scalp.takeProfitPriceUsd.toFixed(2)} ` +
      `| expires ${Math.round(this.scalperConfig.maxHoldMs / 1000)}s`,
    );

    // Pre-persist rationale so the dashboard shows why this trade was opened
    if (this.store) {
      const rationale: EntryRationale = {
        compositeDirection: signal.direction,
        compositeConfidence: signal.confidence,
        compositeReasons: [`Scalper: ${signal.trigger} — ${signal.reasons.join("; ")}`],
        kellyPhase: "scalper",
        signalDirection: signal.direction,
        signalScore: signal.confidence,
      };
      const scalpStoreId = `scalp:${market.toUpperCase()}:${Date.now()}`;
      try {
        // Find existing position in the open list (check both scalp: and hl: prefixes)
        const existingList = this.store.getOpen().filter(
          (p) => p.marketSymbol?.toUpperCase() === market.toUpperCase() && p.status === "open",
        );
        const existing = existingList[0];
        if (existing) {
          await this.store.upsert({ ...existing, entryRationale: rationale });
        } else {
          await this.store.upsert({
            id: scalpStoreId,
            venue: "hyperliquid-perp",
            chainId: 42161,
            marketSymbol: market.toUpperCase(),
            direction: signal.direction,
            entryPriceUsd: order.fillPriceUsd,
            entryNotionalUsd: order.notionalUsd,
            leverage: order.leverage,
            openedAt: Date.now(),
            status: "open",
            entryRationale: rationale,
          } as unknown as Parameters<typeof this.store.upsert>[0]);
        }
      } catch (err) {
        log(`rationale pre-persist failed: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  /* ── Exit monitoring ── */

  private checkScalpExits(): void {
    for (const scalp of this.openScalps.values()) {
      if (scalp.status !== "open") continue;

      const midPrice = this.midPrices.get(scalp.symbol);
      if (!midPrice) continue;

      let exitReason: ScalpPosition["exitReason"] | null = null;

      if (scalp.direction === "long") {
        if (midPrice <= scalp.stopLossPriceUsd) exitReason = "stop-loss";
        else if (midPrice >= scalp.takeProfitPriceUsd) exitReason = "take-profit";
      } else {
        if (midPrice >= scalp.stopLossPriceUsd) exitReason = "stop-loss";
        else if (midPrice <= scalp.takeProfitPriceUsd) exitReason = "take-profit";
      }

      if (exitReason) {
        void this.closeScalp(scalp, exitReason, midPrice).catch((err) => {
          log(`close error ${scalp.symbol}: ${err instanceof Error ? err.message : err}`);
        });
      }
    }
  }

  private checkScalpTimeouts(): void {
    const now = Date.now();
    for (const scalp of this.openScalps.values()) {
      if (scalp.status !== "open") continue;
      if (now >= scalp.expiresAt) {
        const midPrice = this.midPrices.get(scalp.symbol) ?? scalp.entryPriceUsd;
        void this.closeScalp(scalp, "timeout", midPrice).catch((err) => {
          log(`timeout close error ${scalp.symbol}: ${err instanceof Error ? err.message : err}`);
        });
      }
    }
  }

  private async closeScalp(
    scalp: ScalpPosition,
    reason: NonNullable<ScalpPosition["exitReason"]>,
    exitPrice: number,
  ): Promise<void> {
    // Prevent double-close
    if (scalp.status !== "open") return;
    scalp.status = "closed";
    scalp.closedAt = Date.now();
    scalp.exitPriceUsd = exitPrice;
    scalp.exitReason = reason;

    const pnlMultiplier = scalp.direction === "long"
      ? (exitPrice - scalp.entryPriceUsd) / scalp.entryPriceUsd
      : (scalp.entryPriceUsd - exitPrice) / scalp.entryPriceUsd;
    scalp.pnlUsd = scalp.notionalUsd * pnlMultiplier;

    // Close on exchange
    if (!this.scalperConfig.dryRun) {
      try {
        const market = await fetchHyperliquidMarketBySymbol(this.traderConfig, scalp.symbol);
        if (market) {
          const closeSide = scalp.direction === "long" ? "sell" : "buy";
          await executeHyperliquidOrderLive({
            config: this.traderConfig,
            market,
            side: closeSide,
            leverage: scalp.leverage,
            slippageBps: this.traderConfig.risk.slippageBps,
            sizeRaw: scalp.sizeRaw,
            reduceOnly: true,
          });
        }
      } catch (err) {
        log(`exchange close failed for ${scalp.symbol}: ${err instanceof Error ? err.message : err}`);
      }
    }

    // Move from open to closed
    this.openScalps.delete(scalp.id);
    this.closedScalps.push(scalp);
    // Keep last 200 closed
    if (this.closedScalps.length > 200) {
      this.closedScalps = this.closedScalps.slice(-200);
    }

    const holdMs = (scalp.closedAt ?? Date.now()) - scalp.openedAt;
    const pnlStr = scalp.pnlUsd !== undefined ? `$${scalp.pnlUsd.toFixed(2)}` : "?";
    log(
      `CLOSED ${scalp.direction} ${scalp.symbol} | reason=${reason} PnL=${pnlStr} ` +
      `(${(pnlMultiplier * 100).toFixed(2)}%) | held ${(holdMs / 1000).toFixed(1)}s`,
    );
  }

  /* ── Order update handler ── */

  private handleOrderUpdate(_data: unknown): void {
    // Could track fills more precisely here, but for now the execution flow
    // in executeHyperliquidOrderLive already confirms fills synchronously.
  }
}

/* ── Logger ── */

function log(message: string): void {
  console.log(`[scalper] ${message}`);
}
