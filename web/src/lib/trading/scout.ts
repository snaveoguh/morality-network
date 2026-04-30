/**
 * scout.ts — Tiny standalone trader that bypasses the composite signal stack.
 *
 * Goal: prove (or disprove) the premise that a single dumb price-momentum
 * signal can trade while the main engine is stuck on neutral. One signal
 * (linear regression slope on recent candles, EMA-cross confirmation),
 * tiny size, hard SL/TP, no moral / Kelly / news / pattern / wallet-flow
 * gates. Default OFF — only runs if WORKER_TASKS contains "scout" AND
 * SCOUT_ENABLED=true. Default DRY-RUN even when enabled.
 */

import { randomUUID } from "node:crypto";

import {
  executeHyperliquidOrderLive,
  fetchCandles,
  fetchHyperliquidMarketBySymbol,
  resolveHyperliquidAccountAddress,
  simulateHyperliquidOrder,
} from "./hyperliquid";
import { globalPositionLock } from "./global-position-lock";
import { PositionStore } from "./position-store";
import { getTraderConfig } from "./config";
import { createTradeDecision, closeTradeDecisionByCloid, newCloid } from "../db/trade-decisions";
import type { Position, TraderExecutionConfig } from "./types";

const SCOUT_STORE_PATH = "/tmp/pooter-scout-positions.json";

export interface ScoutConfig {
  enabled: boolean;
  dryRun: boolean;
  symbols: string[];
  entryUsd: number;
  leverage: number;
  stopLossPct: number;
  takeProfitPct: number;
  slopeThreshold: number;
  minConfidence: number;
  maxOpenPositions: number;
  maxPortfolioUsd: number;
  candleCount: number;
  candleInterval: "1m" | "3m" | "5m" | "15m" | "30m" | "1h";
  slippageBps: number;
}

export interface ScoutSignal {
  side: "long" | "short" | "neutral";
  confidence: number;
  normalizedSlope: number;
  fastEma: number;
  slowEma: number;
  reason: string;
}

export interface ScoutCycleReport {
  enabled: boolean;
  dryRun: boolean;
  evaluated: number;
  opened: number;
  closed: number;
  skipped: number;
  errors: string[];
}

function parseBoolEnv(key: string, fallback: boolean): boolean {
  const raw = process.env[key]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") return true;
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") return false;
  return fallback;
}

function parseNumberEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  const parsed = raw === undefined ? Number.NaN : Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseSymbolsEnv(key: string, fallback: string[]): string[] {
  const raw = process.env[key]?.trim();
  if (!raw) return fallback;
  const parts = raw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s.length > 0);
  return parts.length > 0 ? parts : fallback;
}

function parseIntervalEnv(key: string, fallback: ScoutConfig["candleInterval"]): ScoutConfig["candleInterval"] {
  const allowed: ReadonlyArray<ScoutConfig["candleInterval"]> = ["1m", "3m", "5m", "15m", "30m", "1h"];
  const raw = process.env[key]?.trim().toLowerCase() as ScoutConfig["candleInterval"] | undefined;
  return raw && allowed.includes(raw) ? raw : fallback;
}

export function getScoutConfig(): ScoutConfig {
  return {
    enabled: parseBoolEnv("SCOUT_ENABLED", false),
    dryRun: parseBoolEnv("SCOUT_DRY_RUN", true),
    symbols: parseSymbolsEnv("SCOUT_SYMBOLS", ["BTC", "ETH", "SOL"]),
    entryUsd: Math.max(5, parseNumberEnv("SCOUT_ENTRY_USD", 20)),
    leverage: Math.max(1, Math.min(20, parseNumberEnv("SCOUT_LEVERAGE", 5))),
    stopLossPct: Math.max(0.005, parseNumberEnv("SCOUT_SL_PCT", 0.02)),
    takeProfitPct: Math.max(0.005, parseNumberEnv("SCOUT_TP_PCT", 0.03)),
    slopeThreshold: Math.max(0, parseNumberEnv("SCOUT_SLOPE_THRESHOLD", 0.005)),
    minConfidence: Math.min(1, Math.max(0, parseNumberEnv("SCOUT_MIN_CONFIDENCE", 0.4))),
    maxOpenPositions: Math.max(1, parseNumberEnv("SCOUT_MAX_OPEN", 3)),
    maxPortfolioUsd: Math.max(10, parseNumberEnv("SCOUT_MAX_PORTFOLIO_USD", 300)),
    candleCount: Math.max(8, parseNumberEnv("SCOUT_CANDLE_COUNT", 20)),
    candleInterval: parseIntervalEnv("SCOUT_CANDLE_INTERVAL", "15m"),
    slippageBps: Math.max(1, parseNumberEnv("SCOUT_SLIPPAGE_BPS", 100)),
  };
}

function linearRegressionSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const meanX = (n - 1) / 2;
  let sumY = 0;
  for (const v of values) sumY += v;
  const meanY = sumY / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = i - meanX;
    num += dx * (values[i] - meanY);
    den += dx * dx;
  }
  return den === 0 ? 0 : num / den;
}

function ema(values: number[], period: number): number {
  if (values.length === 0) return 0;
  const k = 2 / (period + 1);
  let e = values[0];
  for (let i = 1; i < values.length; i++) {
    e = values[i] * k + e * (1 - k);
  }
  return e;
}

export function computeScoutSignal(closes: number[], cfg: ScoutConfig): ScoutSignal {
  const fastEma = ema(closes.slice(-Math.max(4, Math.floor(cfg.candleCount / 4))), Math.max(4, Math.floor(cfg.candleCount / 4)));
  const slowEma = ema(closes.slice(-cfg.candleCount), cfg.candleCount);

  if (closes.length < cfg.candleCount) {
    return {
      side: "neutral",
      confidence: 0,
      normalizedSlope: 0,
      fastEma,
      slowEma,
      reason: "insufficient candles",
    };
  }

  const window = closes.slice(-cfg.candleCount);
  const slope = linearRegressionSlope(window);
  const meanPrice = window.reduce((s, v) => s + v, 0) / window.length;
  const normalizedSlope = meanPrice > 0 ? (slope * cfg.candleCount) / meanPrice : 0;

  if (Math.abs(normalizedSlope) < cfg.slopeThreshold) {
    return {
      side: "neutral",
      confidence: 0,
      normalizedSlope,
      fastEma,
      slowEma,
      reason: `slope ${normalizedSlope.toFixed(4)} below threshold ${cfg.slopeThreshold}`,
    };
  }

  const slopeSign = Math.sign(normalizedSlope);
  const emaSign = fastEma > slowEma ? 1 : fastEma < slowEma ? -1 : 0;
  if (emaSign === 0 || emaSign !== slopeSign) {
    return {
      side: "neutral",
      confidence: 0,
      normalizedSlope,
      fastEma,
      slowEma,
      reason: `slope ${slopeSign} disagrees with ema ${emaSign}`,
    };
  }

  const confidence = Math.min(1, Math.abs(normalizedSlope) / 0.02);
  if (confidence < cfg.minConfidence) {
    return {
      side: "neutral",
      confidence,
      normalizedSlope,
      fastEma,
      slowEma,
      reason: `confidence ${confidence.toFixed(2)} below ${cfg.minConfidence}`,
    };
  }

  return {
    side: normalizedSlope > 0 ? "long" : "short",
    confidence,
    normalizedSlope,
    fastEma,
    slowEma,
    reason: `slope=${normalizedSlope.toFixed(4)} ema-aligned conf=${confidence.toFixed(2)}`,
  };
}

function log(message: string, meta?: unknown): void {
  if (meta === undefined) console.log(`[scout] ${message}`);
  else console.log(`[scout] ${message}`, meta);
}

function buildScoutPosition(args: {
  symbol: string;
  marketId: number;
  side: "long" | "short";
  fillPriceUsd: number;
  notionalUsd: number;
  sizeRaw: string;
  leverage: number;
  cfg: ScoutConfig;
  signalConfidence: number;
  txHash?: `0x${string}`;
  cloid: `0x${string}`;
}): Position {
  const id = `scout:hl:${args.symbol}:${Date.now()}:${randomUUID().slice(0, 8)}`;
  return {
    id,
    cloid: args.cloid,
    venue: "hyperliquid-perp",
    tokenAddress: "0x0000000000000000000000000000000000000000",
    tokenDecimals: 18,
    quoteTokenAddress: "0x0000000000000000000000000000000000000000",
    quoteSymbol: "USDC",
    quoteTokenDecimals: 6,
    dex: "uniswap-v3",
    direction: args.side,
    marketSymbol: args.symbol,
    marketId: args.marketId,
    leverage: args.leverage,
    entryPriceUsd: args.fillPriceUsd,
    quantityTokenRaw: args.sizeRaw,
    quoteSpentRaw: "0",
    entryNotionalUsd: args.notionalUsd,
    stopLossPct: args.cfg.stopLossPct,
    takeProfitPct: args.cfg.takeProfitPct,
    openedAt: Date.now(),
    txHash: args.txHash,
    status: "open",
    signalSource: "scout-momentum",
    signalConfidence: args.signalConfidence,
  };
}

async function maybeExitPosition(
  config: TraderExecutionConfig,
  store: PositionStore,
  position: Position,
): Promise<{ closed: boolean; reason?: string; pnlPct?: number }> {
  const symbol = position.marketSymbol;
  if (!symbol) return { closed: false };

  const market = await fetchHyperliquidMarketBySymbol(config, symbol);
  if (!market || !market.priceUsd) return { closed: false };
  const currentPrice = market.priceUsd;

  const direction = position.direction ?? "long";
  const rawPnlPct =
    direction === "long"
      ? (currentPrice - position.entryPriceUsd) / position.entryPriceUsd
      : (position.entryPriceUsd - currentPrice) / position.entryPriceUsd;
  const leveragedPnlPct = rawPnlPct * (position.leverage ?? 1);

  let exitReason: "stop-loss" | "take-profit" | null = null;
  if (leveragedPnlPct <= -position.stopLossPct) exitReason = "stop-loss";
  else if (leveragedPnlPct >= position.takeProfitPct) exitReason = "take-profit";

  if (!exitReason) return { closed: false };

  if (!config.dryRun) {
    try {
      await executeHyperliquidOrderLive({
        config,
        market,
        side: direction === "long" ? "sell" : "buy",
        leverage: position.leverage ?? 1,
        slippageBps: 100,
        reduceOnly: true,
        sizeRaw: position.quantityTokenRaw,
      });
    } catch (err) {
      log(`live close failed for ${symbol}: ${err instanceof Error ? err.message : err}`);
      return { closed: false };
    }
  }

  await store.close(position.id, {
    exitPriceUsd: currentPrice,
    exitReason,
  });
  globalPositionLock.recordClose(symbol, "scalper");

  // Mirror close to pooter.trade_decisions (best-effort, fire-and-forget)
  if (position.cloid) {
    closeTradeDecisionByCloid(position.cloid, {
      closedAt: new Date(),
      exitReason,
      exitRationale: { trigger: exitReason, priceAtTrigger: currentPrice, holdDurationMs: Date.now() - position.openedAt },
    }).catch((err) => {
      log(`failed to close TradeDecision cloid=${position.cloid}: ${err instanceof Error ? err.message : err}`);
    });
  }

  log(
    `${config.dryRun ? "DRY " : ""}closed ${direction} ${symbol} ${exitReason} pnl=${(leveragedPnlPct * 100).toFixed(2)}% entry=${position.entryPriceUsd.toFixed(2)} exit=${currentPrice.toFixed(2)}`,
  );
  return { closed: true, reason: exitReason, pnlPct: leveragedPnlPct };
}

async function tryOpenPosition(
  config: TraderExecutionConfig,
  store: PositionStore,
  cfg: ScoutConfig,
  symbol: string,
): Promise<{ opened: boolean; skipped?: string; error?: string }> {
  if (!globalPositionLock.canOpen(symbol, "scalper")) {
    return { opened: false, skipped: "global-cooldown" };
  }

  const open = store.getOpen();
  if (open.some((p) => p.marketSymbol === symbol)) {
    return { opened: false, skipped: "already-open" };
  }
  if (open.length >= cfg.maxOpenPositions) {
    return { opened: false, skipped: "max-open" };
  }
  const totalNotional = open.reduce((s, p) => s + (p.entryNotionalUsd ?? 0), 0);
  if (totalNotional + cfg.entryUsd > cfg.maxPortfolioUsd) {
    return { opened: false, skipped: "max-portfolio" };
  }

  let candles;
  try {
    candles = await fetchCandles(config, symbol, cfg.candleInterval, cfg.candleCount * 4);
  } catch (err) {
    return { opened: false, error: `candles: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (candles.length < cfg.candleCount) {
    return { opened: false, skipped: `candles<${cfg.candleCount}` };
  }

  const closes = candles.map((c) => c.close);
  const signal = computeScoutSignal(closes, cfg);
  if (signal.side === "neutral") {
    return { opened: false, skipped: signal.reason };
  }

  const market = await fetchHyperliquidMarketBySymbol(config, symbol);
  if (!market) {
    return { opened: false, error: "market unavailable" };
  }

  const side: "buy" | "sell" = signal.side === "long" ? "buy" : "sell";
  const cloid = newCloid() as `0x${string}`;

  let order;
  try {
    order = config.dryRun
      ? await simulateHyperliquidOrder({
          config,
          symbol,
          marketId: market.marketId,
          side,
          leverage: cfg.leverage,
          notionalUsd: cfg.entryUsd,
          szDecimals: market.szDecimals,
          cloid,
        })
      : await executeHyperliquidOrderLive({
          config,
          market,
          side,
          leverage: cfg.leverage,
          slippageBps: cfg.slippageBps,
          notionalUsd: cfg.entryUsd,
          cloid,
        });
  } catch (err) {
    return { opened: false, error: `order: ${err instanceof Error ? err.message : String(err)}` };
  }

  const position = buildScoutPosition({
    symbol,
    marketId: market.marketId,
    side: signal.side,
    fillPriceUsd: order.fillPriceUsd,
    notionalUsd: order.notionalUsd,
    sizeRaw: order.sizeRaw,
    leverage: order.leverage,
    cfg,
    signalConfidence: signal.confidence,
    txHash: order.txHash,
    cloid,
  });

  await store.upsert(position);
  globalPositionLock.recordOpen(symbol, "scalper");

  // Mirror to pooter.trade_decisions (best-effort, fire-and-forget)
  try {
    const wallet = resolveHyperliquidAccountAddress(config, config.privateKey ? (await import("viem/accounts")).privateKeyToAccount(config.privateKey).address : "0x0");
    await createTradeDecision({
      id: position.id,
      cloid,
      hlOid: order.orderId ? String(order.orderId) : null,
      wallet,
      marketSymbol: symbol,
      venue: "hyperliquid-perp",
      direction: signal.side,
      leverage: order.leverage,
      openedAt: new Date(position.openedAt),
      entryNotionalUsd: order.notionalUsd,
      signalSource: "scout-momentum",
      signalConfidence: signal.confidence,
      stopLossPct: cfg.stopLossPct,
      takeProfitPct: cfg.takeProfitPct,
      entryRationale: { signal: signal.reason, normalizedSlope: signal.normalizedSlope, fastEma: signal.fastEma, slowEma: signal.slowEma },
    });
  } catch (dbErr) {
    log(`failed to record TradeDecision for ${symbol} cloid=${cloid}: ${dbErr instanceof Error ? dbErr.message : dbErr}`);
  }

  log(
    `${config.dryRun ? "DRY " : ""}opened ${signal.side} ${symbol} @ ${order.fillPriceUsd.toFixed(2)} ` +
      `notional=$${order.notionalUsd.toFixed(2)} lev=${order.leverage}x conf=${signal.confidence.toFixed(2)} ` +
      `reason="${signal.reason}"`,
  );
  return { opened: true };
}

export async function runScoutCycle(): Promise<ScoutCycleReport> {
  const cfg = getScoutConfig();
  const errors: string[] = [];

  if (!cfg.enabled) {
    return { enabled: false, dryRun: cfg.dryRun, evaluated: 0, opened: 0, closed: 0, skipped: 0, errors };
  }

  const trader = getTraderConfig();
  if (trader.executionVenue !== "hyperliquid-perp") {
    return {
      enabled: cfg.enabled,
      dryRun: cfg.dryRun,
      evaluated: 0,
      opened: 0,
      closed: 0,
      skipped: 0,
      errors: ["scout requires hyperliquid-perp execution venue"],
    };
  }

  // Inherit private key + HL endpoint from main trader, but force dryRun per scout config.
  const config: TraderExecutionConfig = { ...trader, dryRun: cfg.dryRun };
  const store = new PositionStore(SCOUT_STORE_PATH);
  await store.load();

  let opened = 0;
  let closed = 0;
  let skipped = 0;

  // Step 1 — manage existing scout positions.
  for (const pos of store.getOpen()) {
    try {
      const exit = await maybeExitPosition(config, store, pos);
      if (exit.closed) closed += 1;
    } catch (err) {
      errors.push(`exit ${pos.marketSymbol}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Step 2 — evaluate each symbol for a fresh entry.
  for (const symbol of cfg.symbols) {
    try {
      const result = await tryOpenPosition(config, store, cfg, symbol);
      if (result.opened) opened += 1;
      else if (result.skipped) skipped += 1;
      if (result.error) errors.push(`${symbol}: ${result.error}`);
    } catch (err) {
      errors.push(`${symbol}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    enabled: cfg.enabled,
    dryRun: cfg.dryRun,
    evaluated: cfg.symbols.length,
    opened,
    closed,
    skipped,
    errors,
  };
}
