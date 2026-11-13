/**
 * smoke-exchange-stops.mjs — prints the EXACT Hyperliquid order payloads the
 * trader would send for the exchange-side stop-loss / take-profit triggers on
 * a long and a short, plus the liquidation-guard decision. Never places an
 * order: it forces TRADER_DRY_RUN=true, never builds an ExchangeClient, and
 * only calls read-only info endpoints (falls back to a fixed price offline).
 *
 *   npm run worker:build
 *   node scripts/smoke-exchange-stops.mjs
 *
 * Knobs (all optional):
 *   SMOKE_SYMBOLS=BTC,xyz:TSLA   markets to show (builder-dex symbols need HYPERLIQUID_BUILDER_DEXES)
 *   SMOKE_LEVERAGE=5             leverage to plan for (default TRADER_MAX_LEVERAGE-capped HL default)
 *   SMOKE_NOTIONAL_USD=100       entry notional for the size field
 *   HYPERLIQUID_IS_TESTNET=true  read testnet markets instead of mainnet
 * Stop / TP / trail / buffer come from the usual TRADER_* env (config.ts).
 */
process.env.TRADER_DRY_RUN = "true";
process.env.TRADER_EXECUTION_VENUE = "hyperliquid-perp";

const { getTraderConfig } = await import("../dist-worker/lib/trading/config.js");
const { fetchHyperliquidMarkets, buildProtectiveOrderPlan } = await import("../dist-worker/lib/trading/hyperliquid.js");
const pm = await import("../dist-worker/lib/trading/protective-orders.js");

const config = getTraderConfig();
if (!config.dryRun) throw new Error("refusing to run: config is not dry-run");

const symbols = (process.env.SMOKE_SYMBOLS ?? "BTC").split(",").map((s) => s.trim()).filter(Boolean);
const leverage = Number(process.env.SMOKE_LEVERAGE ?? config.hyperliquid.defaultLeverage ?? 5);
const notionalUsd = Number(process.env.SMOKE_NOTIONAL_USD ?? 100);
const risk = config.risk;
const bufferRatio = risk.liqBufferRatio ?? pm.DEFAULT_LIQ_BUFFER_RATIO;

console.log("network:", config.hyperliquid.isTestnet ? "testnet" : "mainnet", config.hyperliquid.apiUrl);
console.log("risk (leveraged-PnL pcts):", {
  stopLossPct: risk.stopLossPct,
  takeProfitPct: risk.takeProfitPct,
  trailingStopPct: risk.trailingStopPct,
  trailingStopActivationPct: risk.trailingStopActivationPct,
  exchangeStopsEnabled: risk.exchangeStopsEnabled,
  liqBufferRatio: bufferRatio,
  exchangeStopMinMovePct: risk.exchangeStopMinMovePct,
});

let markets = new Map();
try {
  markets = await fetchHyperliquidMarkets(config);
} catch (error) {
  console.warn(`market fetch failed (${error instanceof Error ? error.message : error}) — using offline fixture`);
}
const FIXTURE = { symbol: "BTC", marketId: 0, priceUsd: 100_000, szDecimals: 5, maxLeverage: 40 };

for (const symbol of symbols) {
  const market = markets.get(symbol) ?? (symbol === "BTC" ? FIXTURE : null);
  if (!market || !market.priceUsd) {
    console.log(`\n${symbol}: market not found`);
    continue;
  }
  const fill = market.priceUsd;
  console.log(
    `\n═══ ${market.symbol} marketId=${market.marketId} fill≈$${fill} szDecimals=${market.szDecimals} maxLev=${market.maxLeverage} ` +
      `margin=${market.onlyIsolated ? "isolated" : "cross"} dex=${market.dex ?? "main"} ═══`,
  );

  for (const direction of ["long", "short"]) {
    const plan = pm.planLiquidationSafeLeverage({
      entryPriceUsd: fill,
      direction,
      leverage,
      stopPriceDistancePct: risk.stopLossPct / Math.max(1, leverage),
      maxLeverage: market.maxLeverage,
      bufferRatio,
    });
    console.log(`\n── ${direction.toUpperCase()} @ ${leverage}x — liq-guard: ${plan.ok ? "OK" : "REFUSE"} (${plan.reason})`);
    if (!plan.ok) continue;
    const lev = plan.leverage;
    const scale = lev / Math.max(1, leverage);
    const stopLossPct = risk.stopLossPct * scale;
    const takeProfitPct = risk.takeProfitPct >= 999 ? risk.takeProfitPct : risk.takeProfitPct * scale;
    const size = (notionalUsd * scale) / fill;

    const stopPx = pm.stopPriceFromFill({ fillPriceUsd: fill, stopLossPct, leverage: lev, direction });
    const tpPx = pm.takeProfitPriceFromFill({ fillPriceUsd: fill, takeProfitPct, leverage: lev, direction });
    console.log(
      `   est. liq=$${plan.liquidationPriceUsd?.toFixed(4)} (${(plan.liqDistancePct * 100).toFixed(2)}%)  ` +
        `stop=$${stopPx?.toFixed(4)} (${(plan.stopDistancePct * 100).toFixed(2)}%)  tp=${tpPx ? "$" + tpPx.toFixed(4) : "none"}`,
    );

    for (const [tpsl, px] of [["sl", stopPx], ["tp", tpPx]]) {
      if (px === null) continue;
      const order = buildProtectiveOrderPlan({
        market,
        direction,
        size: size.toFixed(market.szDecimals),
        triggerPx: px,
        tpsl,
        cloid: "0x00000000000000000000000000000000",
      });
      // Exactly what exchangeClient.order() receives (cloid is random per order live).
      console.log(`   ${tpsl.toUpperCase()} payload:`, JSON.stringify({ orders: [order.wire], grouping: order.grouping }));
    }

    // Trailing ratchet example: price ran 3× the activation distance.
    const activation = (risk.trailingStopActivationPct ?? 0.03) / lev;
    const runPx = direction === "long" ? fill * (1 + 3 * activation) : fill * (1 - 3 * activation);
    const trailPx = pm.trailingStopPrice({
      entryPriceUsd: fill,
      direction,
      leverage: lev,
      trailingStopPct: risk.trailingStopPct,
      activationPct: risk.trailingStopActivationPct ?? 0.03,
      highWaterMark: direction === "long" ? runPx : undefined,
      lowWaterMark: direction === "short" ? runPx : undefined,
    });
    const next = pm.moreProtectiveStop(direction, stopPx, trailPx);
    const move = pm.shouldUpdateExchangeStop({
      direction,
      currentTriggerPx: stopPx,
      nextTriggerPx: next,
      minMovePct: risk.exchangeStopMinMovePct,
    });
    console.log(`   trail after run to $${runPx.toFixed(4)}: stop → $${next?.toFixed(4)} (move exchange stop: ${move})`);
  }
}
console.log("\nno orders were sent.");
