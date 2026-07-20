/**
 * smoke-builder-dex.mjs — dry-run smoke test for HIP-3 builder-dex support.
 * Compiles the worker TS then exercises: builder-dex market discovery (offset
 * asset ids), case-preserving candles, technical signal, simulated order.
 * No keys, no orders — read-only against the live HL API.
 *
 *   TRADER_DRY_RUN=true node scripts/smoke-builder-dex.mjs
 */
process.env.TRADER_DRY_RUN = "true";
process.env.TRADER_EXECUTION_VENUE = "hyperliquid-perp";
process.env.HYPERLIQUID_BUILDER_DEXES = "xyz";
process.env.HYPERLIQUID_WATCH_MARKETS = "BTC,xyz:TSLA,xyz:GOLD,xyz:SILVER";

const { getTraderConfig } = await import("../dist-worker/lib/trading/config.js");
const { fetchHyperliquidMarkets, fetchCandles, simulateHyperliquidOrder } = await import(
  "../dist-worker/lib/trading/hyperliquid.js"
);
const { fetchTechnicalSignal } = await import("../dist-worker/lib/trading/technical.js");

const config = getTraderConfig();
console.log("watchMarkets:", config.hyperliquid.watchMarkets);
console.log("builderDexes:", config.hyperliquid.builderDexes);

const markets = await fetchHyperliquidMarkets(config);
console.log("total markets loaded:", markets.size);

for (const sym of ["BTC", "xyz:TSLA", "xyz:GOLD", "xyz:SILVER", "xyz:MSTR"]) {
  const m = markets.get(sym);
  if (!m) { console.log(`  ${sym}: NOT FOUND`); continue; }
  console.log(
    `  ${m.symbol}: marketId=${m.marketId} px=${m.priceUsd} szDec=${m.szDecimals} maxLev=${m.maxLeverage} onlyIsolated=${m.onlyIsolated ?? false} dex=${m.dex ?? "main"}`
  );
}

const candles = await fetchCandles(config, "xyz:TSLA", "15m", 100);
console.log(`xyz:TSLA candles: ${candles.length}, last close=${candles.at(-1)?.close}`);

const signal = await fetchTechnicalSignal(config, "xyz:TSLA", { interval: "15m", count: 100 });
console.log(
  `xyz:TSLA technical: dir=${signal.direction} strength=${signal.strength.toFixed(2)} conf=${signal.confidence.toFixed(2)} candles=${signal.candleCount}`
);
console.log(`  ichimoku: priceVsCloud=${signal.indicators.ichimoku.priceVsCloud} cloud=${signal.indicators.ichimoku.cloudColor}`);

const tsla = markets.get("xyz:TSLA");
const order = await simulateHyperliquidOrder({
  config,
  symbol: "xyz:TSLA",
  marketId: tsla.marketId,
  side: "buy",
  leverage: 3,
  notionalUsd: 150,
  szDecimals: tsla.szDecimals,
});
console.log(`simulated order: ${order.symbol} marketId=${order.marketId} size=${order.size} @ $${order.fillPriceUsd}`);
console.log("SMOKE OK");
