/**
 * Exchange-side protective orders + liquidation guard — pure price math.
 *
 * Everything here is deterministic and network-free so it can be unit tested
 * and reused by the smoke script. The engine owns the I/O (placing,
 * cancelling and reconciling Hyperliquid trigger orders); this module only
 * answers "what price?" and "is this safe?".
 *
 * Units: the engine's stop / take-profit / trailing percentages are in
 * LEVERAGED-PnL space (stopLossPct 0.12 at 3x = 4% adverse price move). Every
 * function below that takes a `*Pct` + `leverage` converts to price space by
 * dividing by leverage, exactly like evaluateOpenPositions does.
 */

export type PositionDirection = "long" | "short";
export type TpslKind = "sl" | "tp";

/** Software scaled-TP tiers are tp×1, ×1.5, ×2 (25% each) and ×3 (full close). */
export const SCALED_TP_FULL_CLOSE_MULTIPLIER = 3;

/** Default minimum stop improvement before the exchange stop is moved (0.25% of price). */
export const DEFAULT_EXCHANGE_STOP_MIN_MOVE_PCT = 0.0025;

/** Default liquidation buffer: stop distance must be ≤ half the liquidation distance. */
export const DEFAULT_LIQ_BUFFER_RATIO = 0.5;

/**
 * Each cycle, a live stop is considered to be "at" the liquidation price when
 * the gap between them is under this fraction of the mark→liquidation
 * distance. A stop-market that sits on top of liquidation can lose the race to
 * the liquidation engine, so this cushion is treated as a breach.
 */
export const DEFAULT_LIQ_MIN_CUSHION_RATIO = 0.1;

/**
 * Slippage cap on the limit price of a market trigger order (HL treats `p` on
 * an isMarket trigger as the worst acceptable fill). 10% mirrors the HL
 * front end; a stop that cannot fill is worse than one that fills badly.
 */
export const TRIGGER_MARKET_SLIPPAGE = 0.1;

/** Take-profit configured this high (or higher) means "no TP" (conviction trail-only). */
export const TAKE_PROFIT_DISABLED_AT = 999;

function isPositiveFinite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function lev(leverage: number | null | undefined): number {
  return isPositiveFinite(leverage) ? Math.max(1, leverage) : 1;
}

/**
 * Stop-loss trigger price from the actual fill price.
 * long: fill × (1 − stopLossPct/leverage); short: fill × (1 + stopLossPct/leverage).
 */
export function stopPriceFromFill(args: {
  fillPriceUsd: number;
  stopLossPct: number;
  leverage: number;
  direction: PositionDirection;
}): number | null {
  if (!isPositiveFinite(args.fillPriceUsd) || !isPositiveFinite(args.stopLossPct)) return null;
  const move = args.stopLossPct / lev(args.leverage);
  if (args.direction === "long" && move >= 1) return null;
  return args.direction === "short" ? args.fillPriceUsd * (1 + move) : args.fillPriceUsd * (1 - move);
}

/**
 * Take-profit trigger price from the actual fill price. The exchange TP sits
 * at the software full-close tier (tp × 3 by default) so it never pre-empts
 * the 25% scale-outs or the trailing runner; it is a backstop for when the
 * worker is down. Returns null when no TP is configured (≤0 or ≥999).
 */
export function takeProfitPriceFromFill(args: {
  fillPriceUsd: number;
  takeProfitPct: number;
  leverage: number;
  direction: PositionDirection;
  tierMultiplier?: number;
}): number | null {
  if (!isPositiveFinite(args.fillPriceUsd)) return null;
  if (!isPositiveFinite(args.takeProfitPct) || args.takeProfitPct >= TAKE_PROFIT_DISABLED_AT) return null;
  const multiplier = isPositiveFinite(args.tierMultiplier) ? args.tierMultiplier : SCALED_TP_FULL_CLOSE_MULTIPLIER;
  const move = (args.takeProfitPct * multiplier) / lev(args.leverage);
  if (args.direction === "short" && move >= 1) return null;
  return args.direction === "short" ? args.fillPriceUsd * (1 - move) : args.fillPriceUsd * (1 + move);
}

/**
 * Trailing-stop price implied by the stored water mark, or null when the trail
 * has not activated. Mirrors the engine: both percentages are leveraged-PnL
 * and are divided by leverage; the trail is active once the water mark has
 * moved at least the activation distance in the position's favour.
 */
export function trailingStopPrice(args: {
  entryPriceUsd: number;
  direction: PositionDirection;
  leverage: number;
  trailingStopPct: number;
  activationPct: number;
  highWaterMark?: number | null;
  lowWaterMark?: number | null;
}): number | null {
  if (!isPositiveFinite(args.entryPriceUsd) || !isPositiveFinite(args.trailingStopPct)) return null;
  const l = lev(args.leverage);
  const trailPricePct = args.trailingStopPct / l;
  const activationPricePct = Math.max(0, args.activationPct ?? 0) / l;
  if (args.direction === "short") {
    const lwm = args.lowWaterMark;
    if (!isPositiveFinite(lwm)) return null;
    if (lwm > args.entryPriceUsd * (1 - activationPricePct)) return null;
    return lwm * (1 + trailPricePct);
  }
  const hwm = args.highWaterMark;
  if (!isPositiveFinite(hwm)) return null;
  if (hwm < args.entryPriceUsd * (1 + activationPricePct)) return null;
  return hwm * (1 - trailPricePct);
}

/** The more protective of two stop prices (higher for longs, lower for shorts). */
export function moreProtectiveStop(
  direction: PositionDirection,
  a: number | null | undefined,
  b: number | null | undefined,
): number | null {
  const okA = isPositiveFinite(a);
  const okB = isPositiveFinite(b);
  if (!okA && !okB) return null;
  if (!okA) return b as number;
  if (!okB) return a as number;
  return direction === "short" ? Math.min(a as number, b as number) : Math.max(a as number, b as number);
}

/**
 * Rate-limit for moving the exchange stop: only when the new stop is better
 * (tighter in the position's favour) by at least `minMovePct` of price.
 * A missing current stop always qualifies.
 */
export function shouldUpdateExchangeStop(args: {
  direction: PositionDirection;
  currentTriggerPx: number | null | undefined;
  nextTriggerPx: number;
  minMovePct?: number;
}): boolean {
  if (!isPositiveFinite(args.nextTriggerPx)) return false;
  if (!isPositiveFinite(args.currentTriggerPx)) return true;
  const min = Math.max(0, args.minMovePct ?? DEFAULT_EXCHANGE_STOP_MIN_MOVE_PCT);
  const current = args.currentTriggerPx;
  return args.direction === "short"
    ? args.nextTriggerPx <= current * (1 - min)
    : args.nextTriggerPx >= current * (1 + min);
}

/** HL maintenance margin rate: half the initial margin at the market's max leverage. */
export function maintenanceMarginRate(maxLeverage: number | null | undefined, fallbackLeverage: number): number {
  const max = isPositiveFinite(maxLeverage) ? maxLeverage : lev(fallbackLeverage);
  return 1 / (2 * Math.max(1, max));
}

/**
 * Estimated liquidation price for a fresh position whose only collateral is
 * its own initial margin (isolated margin). Under cross margin the rest of the
 * account also backs the position, so the real liquidation is further away —
 * the isolated figure is therefore the conservative estimate for both modes.
 *
 * HL: liq = price − side × marginAvailable / size / (1 − mmr × side), with
 * marginAvailable = notional × (1/leverage − mmr).
 */
export function estimateLiquidationPrice(args: {
  entryPriceUsd: number;
  leverage: number;
  direction: PositionDirection;
  maxLeverage?: number | null;
}): { liquidationPriceUsd: number | null; distancePct: number; maintenanceMarginRate: number } {
  const l = lev(args.leverage);
  const mmr = maintenanceMarginRate(args.maxLeverage, l);
  const marginRatio = 1 / l - mmr;
  if (!isPositiveFinite(args.entryPriceUsd) || marginRatio <= 0) {
    // Leverage above what maintenance allows — liquidation is immediate.
    return { liquidationPriceUsd: isPositiveFinite(args.entryPriceUsd) ? args.entryPriceUsd : null, distancePct: 0, maintenanceMarginRate: mmr };
  }
  const side = args.direction === "short" ? -1 : 1;
  const distancePct = marginRatio / (1 - mmr * side);
  const liquidationPriceUsd = args.entryPriceUsd * (1 - side * distancePct);
  return {
    liquidationPriceUsd: liquidationPriceUsd > 0 ? liquidationPriceUsd : null,
    distancePct,
    maintenanceMarginRate: mmr,
  };
}

/** Signed-safe price distance as a fraction of `reference`. */
export function priceDistancePct(reference: number, other: number): number {
  if (!isPositiveFinite(reference) || !Number.isFinite(other)) return 0;
  return Math.abs(other - reference) / reference;
}

/**
 * Liquidation-buffer check: the stop must sit on the safe side of liquidation
 * and at most `bufferRatio` of the way from entry to liquidation.
 */
export function checkLiquidationBuffer(args: {
  entryPriceUsd: number;
  stopPriceUsd: number;
  liquidationPriceUsd: number | null;
  direction: PositionDirection;
  bufferRatio?: number;
}): { ok: boolean; stopDistancePct: number; liqDistancePct: number; ratio: number } {
  const bufferRatio = isPositiveFinite(args.bufferRatio) ? args.bufferRatio : DEFAULT_LIQ_BUFFER_RATIO;
  const stopDistancePct = priceDistancePct(args.entryPriceUsd, args.stopPriceUsd);
  if (!isPositiveFinite(args.liquidationPriceUsd)) {
    // No liquidation price (e.g. a long whose liq would be ≤0) — nothing to guard.
    return { ok: true, stopDistancePct, liqDistancePct: Infinity, ratio: 0 };
  }
  const liqDistancePct = priceDistancePct(args.entryPriceUsd, args.liquidationPriceUsd);
  const stopOnSafeSide =
    args.direction === "short"
      ? args.stopPriceUsd < args.liquidationPriceUsd
      : args.stopPriceUsd > args.liquidationPriceUsd;
  const ratio = liqDistancePct > 0 ? stopDistancePct / liqDistancePct : Infinity;
  return { ok: stopOnSafeSide && ratio <= bufferRatio + 1e-12, stopDistancePct, liqDistancePct, ratio };
}

/**
 * Pre-entry liquidation guard. Holds the intended PRICE stop distance fixed and
 * steps leverage down until the stop sits inside `bufferRatio` of the estimated
 * liquidation distance. Returns the leverage to use, or ok=false to refuse.
 * The caller shrinks notional by newLeverage/oldLeverage (same margin posted)
 * and rescales its leveraged-PnL percentages so price-space stops are unchanged.
 */
export function planLiquidationSafeLeverage(args: {
  entryPriceUsd: number;
  direction: PositionDirection;
  leverage: number;
  stopPriceDistancePct: number;
  maxLeverage?: number | null;
  bufferRatio?: number;
}): {
  ok: boolean;
  leverage: number;
  liquidationPriceUsd: number | null;
  liqDistancePct: number;
  stopDistancePct: number;
  reason: string;
} {
  const start = Math.max(1, Math.floor(lev(args.leverage)));
  const stopDistancePct = args.stopPriceDistancePct;
  const bufferRatio = isPositiveFinite(args.bufferRatio) ? args.bufferRatio : DEFAULT_LIQ_BUFFER_RATIO;
  let last = { liquidationPriceUsd: null as number | null, distancePct: 0 };
  for (let l = start; l >= 1; l -= 1) {
    const est = estimateLiquidationPrice({
      entryPriceUsd: args.entryPriceUsd,
      leverage: l,
      direction: args.direction,
      maxLeverage: args.maxLeverage,
    });
    last = est;
    const stopPriceUsd =
      args.direction === "short"
        ? args.entryPriceUsd * (1 + stopDistancePct)
        : args.entryPriceUsd * (1 - stopDistancePct);
    const check = checkLiquidationBuffer({
      entryPriceUsd: args.entryPriceUsd,
      stopPriceUsd,
      liquidationPriceUsd: est.liquidationPriceUsd,
      direction: args.direction,
      bufferRatio,
    });
    if (check.ok) {
      return {
        ok: true,
        leverage: l,
        liquidationPriceUsd: est.liquidationPriceUsd,
        liqDistancePct: est.distancePct,
        stopDistancePct,
        reason:
          l === start
            ? `stop ${(stopDistancePct * 100).toFixed(2)}% ≤ ${bufferRatio}× est. liq ${(est.distancePct * 100).toFixed(2)}% at ${l}x`
            : `leverage ${start}x→${l}x so stop ${(stopDistancePct * 100).toFixed(2)}% ≤ ${bufferRatio}× est. liq ${(est.distancePct * 100).toFixed(2)}%`,
      };
    }
  }
  return {
    ok: false,
    leverage: start,
    liquidationPriceUsd: last.liquidationPriceUsd,
    liqDistancePct: last.distancePct,
    stopDistancePct,
    reason: `stop ${(stopDistancePct * 100).toFixed(2)}% exceeds ${bufferRatio}× est. liq distance even at 1x (${(last.distancePct * 100).toFixed(2)}%)`,
  };
}

/**
 * Per-cycle guard against the live liquidation price creeping past the stop
 * (possible under cross margin when other positions lose). A breach is a stop
 * that is beyond liquidation or within `minCushionRatio` of the
 * mark→liquidation distance of it; the fix is a stop `bufferRatio` of the way
 * from mark to liquidation. Never loosens a stop.
 */
export function liquidationSafeStop(args: {
  direction: PositionDirection;
  markPriceUsd: number;
  stopPriceUsd: number | null;
  liquidationPriceUsd: number | null | undefined;
  bufferRatio?: number;
  minCushionRatio?: number;
}): { breach: boolean; stopPriceUsd: number | null } {
  const { direction, markPriceUsd, liquidationPriceUsd } = args;
  if (!isPositiveFinite(markPriceUsd) || !isPositiveFinite(liquidationPriceUsd)) {
    return { breach: false, stopPriceUsd: args.stopPriceUsd };
  }
  const bufferRatio = isPositiveFinite(args.bufferRatio) ? Math.min(1, args.bufferRatio) : DEFAULT_LIQ_BUFFER_RATIO;
  const minCushionRatio = Math.max(0, args.minCushionRatio ?? DEFAULT_LIQ_MIN_CUSHION_RATIO);
  const side = direction === "short" ? -1 : 1;
  // Positive while mark is on the solvent side of liquidation.
  const markToLiq = side * (markPriceUsd - liquidationPriceUsd);
  if (markToLiq <= 0) return { breach: true, stopPriceUsd: args.stopPriceUsd };
  const target = markPriceUsd - side * bufferRatio * markToLiq;
  if (!isPositiveFinite(args.stopPriceUsd)) return { breach: true, stopPriceUsd: target };
  const cushion = side * (args.stopPriceUsd - liquidationPriceUsd);
  if (cushion >= minCushionRatio * markToLiq) {
    return { breach: false, stopPriceUsd: args.stopPriceUsd };
  }
  return { breach: true, stopPriceUsd: moreProtectiveStop(direction, args.stopPriceUsd, target) };
}

/** Limit price for a market trigger: the worst fill we accept once triggered. */
export function triggerLimitPrice(
  direction: PositionDirection,
  triggerPx: number,
  slippage: number = TRIGGER_MARKET_SLIPPAGE,
): number {
  // Closing a long sells (accept lower); closing a short buys (accept higher).
  return direction === "short" ? triggerPx * (1 + slippage) : triggerPx * (1 - slippage);
}

export interface TriggerOrderWire {
  a: number;
  b: boolean;
  p: string;
  s: string;
  r: true;
  t: { trigger: { isMarket: true; triggerPx: string; tpsl: TpslKind } };
  c?: `0x${string}`;
}

/**
 * Wire-format reduce-only market trigger order closing `direction`.
 * `formatPrice` is injected (the SDK's tick formatter) to keep this module
 * free of SDK imports for testing.
 */
export function buildTriggerOrderWire(args: {
  marketId: number;
  direction: PositionDirection;
  size: string;
  triggerPx: number;
  tpsl: TpslKind;
  szDecimals: number;
  formatPrice: (price: number, szDecimals: number) => string;
  cloid?: `0x${string}`;
}): TriggerOrderWire {
  const triggerPx = args.formatPrice(args.triggerPx, args.szDecimals);
  const limitPx = args.formatPrice(triggerLimitPrice(args.direction, Number(triggerPx)), args.szDecimals);
  return {
    a: args.marketId,
    // Closing a long is a sell (b=false); closing a short is a buy.
    b: args.direction === "short",
    p: limitPx,
    s: args.size,
    r: true,
    t: { trigger: { isMarket: true, triggerPx, tpsl: args.tpsl } },
    ...(args.cloid ? { c: args.cloid } : {}),
  };
}
