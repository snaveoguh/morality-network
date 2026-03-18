"use strict";
/**
 * scalper.ts — Real-time sub-minute scalping engine for Hyperliquid perps.
 *
 * Streams 1m candles via WebSocket, detects big moves (large candles,
 * volume spikes, VWAP breakouts), and executes immediately.
 * Momentum strategy: trade in direction of the big move.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScalperManager = exports.CandleBuffer = void 0;
exports.detectScalpSignal = detectScalpSignal;
const accounts_1 = require("viem/accounts");
const hyperliquid_1 = require("./hyperliquid");
const technical_1 = require("./technical");
const BUFFER_SIZE = 60; // 1 hour of 1m candles
/* ═══════════════════════════  CandleBuffer  ═══════════════════════════ */
class CandleBuffer {
    candles = [];
    symbol;
    maxSize;
    constructor(symbol, maxSize = BUFFER_SIZE) {
        this.symbol = symbol;
        this.maxSize = maxSize;
    }
    /**
     * Push a new candle or update the current one (Hyperliquid sends partial
     * updates for the in-progress candle with the same timestamp).
     */
    pushOrUpdate(candle) {
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
    get length() {
        return this.candles.length;
    }
    get lastCandle() {
        return this.candles[this.candles.length - 1] ?? null;
    }
    /** The most recently completed candle (second-to-last, since last is in-progress). */
    get completedCandle() {
        return this.candles.length >= 2 ? this.candles[this.candles.length - 2] : null;
    }
    /** Close prices excluding the current in-progress candle. */
    get completedClosePrices() {
        return this.candles.slice(0, -1).map((c) => c.close);
    }
    get closePrices() {
        return this.candles.map((c) => c.close);
    }
    get vwap() {
        let numerator = 0;
        let denominator = 0;
        for (const c of this.candles) {
            const typical = (c.high + c.low + c.close) / 3;
            numerator += typical * c.volume;
            denominator += c.volume;
        }
        return denominator > 0 ? numerator / denominator : this.lastCandle?.close ?? 0;
    }
    get volumeSMA20() {
        const recent = this.candles.slice(-20);
        if (recent.length === 0)
            return 0;
        return recent.reduce((s, c) => s + c.volume, 0) / recent.length;
    }
    getAll() {
        return [...this.candles];
    }
}
exports.CandleBuffer = CandleBuffer;
/* ═══════════════════════  Signal Detection  ═══════════════════════ */
/**
 * Pure-math signal detection. No LLM calls — fast enough for real-time.
 * Momentum strategy: trade in direction of the big move.
 */
function detectScalpSignal(buffer, config, currentMidPrice) {
    if (buffer.length < 22)
        return null; // need at least 22 candles (21 completed + 1 in-progress)
    // Evaluate the just-completed candle, NOT the in-progress one
    const lastCandle = buffer.completedCandle;
    if (!lastCandle)
        return null;
    const closes = buffer.completedClosePrices;
    const reasons = [];
    let direction = null;
    let trigger = "big-candle";
    let confluenceCount = 0;
    // --- Signal 1: Big candle body (momentum) ---
    const bodyPct = Math.abs(lastCandle.close - lastCandle.open) / lastCandle.open;
    const isBigCandle = bodyPct >= config.candleThresholdPct;
    const candleDirection = lastCandle.close > lastCandle.open ? "long" : "short";
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
        const breakoutDir = priceVsVwap > 0 ? "long" : "short";
        reasons.push(`VWAP breakout: ${(priceVsVwap * 100).toFixed(2)}% ${breakoutDir}`);
        confluenceCount++;
        if (!direction) {
            direction = breakoutDir;
            trigger = "vwap-deviation";
        }
    }
    // --- Fast indicator confirmation ---
    const rsi14 = (0, technical_1.computeRSI)(closes, 14);
    const emaReading = (0, technical_1.computeEMAs)(closes);
    const bollinger = (0, technical_1.computeBollinger)(closes, 20, 2);
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
    // Require at least 1 primary trigger (big candle, volume spike, or VWAP breakout)
    if (!direction || confluenceCount < 1)
        return null;
    if (confluenceCount >= 3)
        trigger = "multi-confluence";
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
class ScalperManager {
    traderConfig;
    scalperConfig;
    buffers = new Map();
    midPrices = new Map();
    openScalps = new Map();
    closedScalps = [];
    lastEntryByMarket = new Map();
    /** Prevent concurrent execution on the same market */
    executingMarkets = new Set();
    subscriptions = [];
    monitorInterval = null;
    running = false;
    constructor(traderConfig, scalperConfig) {
        this.traderConfig = traderConfig;
        this.scalperConfig = scalperConfig;
    }
    async start() {
        if (this.running)
            return;
        this.running = true;
        const { subscriptionClient } = (0, hyperliquid_1.getHyperliquidWsClients)(this.traderConfig, true);
        const walletAddress = (0, accounts_1.privateKeyToAccount)(this.traderConfig.privateKey).address;
        const accountAddress = (0, hyperliquid_1.resolveHyperliquidAccountAddress)(this.traderConfig, walletAddress);
        log("connecting WebSocket...");
        // 1. Subscribe to allMids for real-time price tracking + SL/TP monitoring
        const midsSub = await subscriptionClient.allMids((data) => {
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
        const delay = (ms) => new Promise((r) => setTimeout(r, ms));
        // 2. Subscribe to 1m candles for each watched market
        const activeMarkets = [];
        for (const market of this.scalperConfig.markets) {
            try {
                this.buffers.set(market, new CandleBuffer(market));
                const candleSub = await subscriptionClient.candle({ coin: market, interval: "1m" }, (data) => {
                    const candle = {
                        timestamp: data.t,
                        open: Number(data.o),
                        high: Number(data.h),
                        low: Number(data.l),
                        close: Number(data.c),
                        volume: Number(data.v),
                    };
                    const buffer = this.buffers.get(market);
                    if (!buffer)
                        return;
                    const { isNewCandle } = buffer.pushOrUpdate(candle);
                    // Evaluate signals on new completed candles
                    if (isNewCandle) {
                        this.evaluateScalpSignal(market);
                    }
                });
                this.subscriptions.push(candleSub);
                activeMarkets.push(market);
                log(`candle subscription OK: ${market}`);
                await delay(200);
            }
            catch (err) {
                log(`subscription failed for ${market}, skipping: ${err instanceof Error ? err.message : err}`);
                this.buffers.delete(market);
            }
        }
        // Update markets list to only include successfully subscribed ones
        this.scalperConfig.markets = activeMarkets;
        // 3. Subscribe to order updates for fill confirmation
        try {
            const orderSub = await subscriptionClient.orderUpdates({ user: accountAddress }, (data) => {
                this.handleOrderUpdate(data);
            });
            this.subscriptions.push(orderSub);
        }
        catch (err) {
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
    async stop() {
        this.running = false;
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
            this.monitorInterval = null;
        }
        for (const sub of this.subscriptions) {
            await sub.unsubscribe().catch(() => { });
        }
        this.subscriptions = [];
        await (0, hyperliquid_1.closeHyperliquidWs)();
        log("stopped");
    }
    getOpenScalps() {
        return Array.from(this.openScalps.values());
    }
    getClosedScalps() {
        return [...this.closedScalps];
    }
    /* ── Backfill ── */
    async backfillCandles() {
        for (const market of this.scalperConfig.markets) {
            try {
                const candles = await (0, hyperliquid_1.fetchCandles)(this.traderConfig, market, "1m", BUFFER_SIZE);
                const buffer = this.buffers.get(market);
                if (buffer) {
                    for (const c of candles) {
                        buffer.pushOrUpdate(c);
                    }
                    log(`backfill ${market}: ${candles.length} candles loaded`);
                }
            }
            catch (err) {
                log(`backfill ${market} failed: ${err instanceof Error ? err.message : err}`);
            }
        }
    }
    /* ── Position persistence (load existing positions from exchange) ── */
    async loadExistingPositions(walletAddress) {
        try {
            const livePositions = await (0, hyperliquid_1.fetchHyperliquidLivePositions)(this.traderConfig, walletAddress);
            const watchedMarkets = new Set(this.scalperConfig.markets.map((m) => m.toUpperCase()));
            for (const pos of livePositions) {
                const symbol = pos.symbol.toUpperCase();
                if (!watchedMarkets.has(symbol))
                    continue;
                // Adopt this position as a scalp with conservative SL/TP
                const direction = pos.isShort ? "short" : "long";
                const slMultiplier = direction === "long"
                    ? 1 - this.scalperConfig.stopLossPct
                    : 1 + this.scalperConfig.stopLossPct;
                const tpMultiplier = direction === "long"
                    ? 1 + this.scalperConfig.takeProfitPct
                    : 1 - this.scalperConfig.takeProfitPct;
                const scalp = {
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
        }
        catch (err) {
            log(`failed to load existing positions: ${err instanceof Error ? err.message : err}`);
        }
    }
    /* ── Signal evaluation ── */
    evaluateScalpSignal(market) {
        if (!this.running)
            return;
        // Cooldown check
        const lastEntry = this.lastEntryByMarket.get(market) ?? 0;
        if (Date.now() - lastEntry < this.scalperConfig.cooldownMs)
            return;
        // Max open scalps check
        if (this.openScalps.size >= this.scalperConfig.maxOpenScalps)
            return;
        // Already have a scalp open on this market?
        for (const scalp of this.openScalps.values()) {
            if (scalp.symbol === market && scalp.status === "open")
                return;
        }
        // Already executing on this market?
        if (this.executingMarkets.has(market))
            return;
        const buffer = this.buffers.get(market);
        if (!buffer)
            return;
        const midPrice = this.midPrices.get(market);
        if (!midPrice)
            return;
        const signal = detectScalpSignal(buffer, this.scalperConfig, midPrice);
        if (!signal)
            return;
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
    async executeScalp(market, signal, _midPrice) {
        const marketSnapshot = await (0, hyperliquid_1.fetchHyperliquidMarketBySymbol)(this.traderConfig, market);
        if (!marketSnapshot || !marketSnapshot.priceUsd) {
            log(`no market data for ${market}, skipping`);
            return;
        }
        const side = signal.direction === "short" ? "sell" : "buy";
        const notionalUsd = Math.min(this.scalperConfig.maxPositionUsd, this.traderConfig.risk.maxPositionUsd);
        // Use market's max leverage (BTC=40x, ETH=25x, etc.), fall back to config default
        const leverage = marketSnapshot.maxLeverage ?? this.scalperConfig.defaultLeverage;
        const order = this.scalperConfig.dryRun
            ? await (0, hyperliquid_1.simulateHyperliquidOrder)({
                config: this.traderConfig,
                symbol: marketSnapshot.symbol,
                marketId: marketSnapshot.marketId,
                side,
                leverage,
                notionalUsd,
                szDecimals: marketSnapshot.szDecimals,
            })
            : await (0, hyperliquid_1.executeHyperliquidOrderLive)({
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
        const scalp = {
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
        log(`OPENED ${signal.direction} ${market} @ $${order.fillPriceUsd.toFixed(2)} ` +
            `| notional=$${order.notionalUsd.toFixed(2)} lev=${order.leverage}x ` +
            `| SL=$${scalp.stopLossPriceUsd.toFixed(2)} TP=$${scalp.takeProfitPriceUsd.toFixed(2)} ` +
            `| expires ${Math.round(this.scalperConfig.maxHoldMs / 1000)}s`);
    }
    /* ── Exit monitoring ── */
    checkScalpExits() {
        for (const scalp of this.openScalps.values()) {
            if (scalp.status !== "open")
                continue;
            const midPrice = this.midPrices.get(scalp.symbol);
            if (!midPrice)
                continue;
            let exitReason = null;
            if (scalp.direction === "long") {
                if (midPrice <= scalp.stopLossPriceUsd)
                    exitReason = "stop-loss";
                else if (midPrice >= scalp.takeProfitPriceUsd)
                    exitReason = "take-profit";
            }
            else {
                if (midPrice >= scalp.stopLossPriceUsd)
                    exitReason = "stop-loss";
                else if (midPrice <= scalp.takeProfitPriceUsd)
                    exitReason = "take-profit";
            }
            if (exitReason) {
                void this.closeScalp(scalp, exitReason, midPrice).catch((err) => {
                    log(`close error ${scalp.symbol}: ${err instanceof Error ? err.message : err}`);
                });
            }
        }
    }
    checkScalpTimeouts() {
        const now = Date.now();
        for (const scalp of this.openScalps.values()) {
            if (scalp.status !== "open")
                continue;
            if (now >= scalp.expiresAt) {
                const midPrice = this.midPrices.get(scalp.symbol) ?? scalp.entryPriceUsd;
                void this.closeScalp(scalp, "timeout", midPrice).catch((err) => {
                    log(`timeout close error ${scalp.symbol}: ${err instanceof Error ? err.message : err}`);
                });
            }
        }
    }
    async closeScalp(scalp, reason, exitPrice) {
        // Prevent double-close
        if (scalp.status !== "open")
            return;
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
                const market = await (0, hyperliquid_1.fetchHyperliquidMarketBySymbol)(this.traderConfig, scalp.symbol);
                if (market) {
                    const closeSide = scalp.direction === "long" ? "sell" : "buy";
                    await (0, hyperliquid_1.executeHyperliquidOrderLive)({
                        config: this.traderConfig,
                        market,
                        side: closeSide,
                        leverage: scalp.leverage,
                        slippageBps: this.traderConfig.risk.slippageBps,
                        sizeRaw: scalp.sizeRaw,
                        reduceOnly: true,
                    });
                }
            }
            catch (err) {
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
        log(`CLOSED ${scalp.direction} ${scalp.symbol} | reason=${reason} PnL=${pnlStr} ` +
            `(${(pnlMultiplier * 100).toFixed(2)}%) | held ${(holdMs / 1000).toFixed(1)}s`);
    }
    /* ── Order update handler ── */
    handleOrderUpdate(_data) {
        // Could track fills more precisely here, but for now the execution flow
        // in executeHyperliquidOrderLive already confirms fills synchronously.
    }
}
exports.ScalperManager = ScalperManager;
/* ── Logger ── */
function log(message) {
    console.log(`[scalper] ${message}`);
}
