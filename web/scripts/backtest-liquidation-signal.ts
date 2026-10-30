/**
 * Backtest of the liquidation-cluster signal on Hyperliquid 1h candles.
 * See `src/lib/liquidation-signal.ts` for the method and the gate.
 *
 *   npx jiti ./scripts/backtest-liquidation-signal.ts [--horizon 24] [--out file.json]
 *
 * Reads the last 5000 hourly candles per coin (the most `candleSnapshot`
 * returns, ~208 days) from the public info API. No key, no LLM, no writes
 * except the optional JSON file. Weight: 16 × (20 + 84) ≈ 1,700, paced.
 */

import { writeFileSync } from "node:fs";
import type { Candle } from "../src/lib/liquidation-map";
import { backtestLiquidationSignal, gateVerdicts, type BacktestResult } from "../src/lib/liquidation-signal";

const HL_INFO = "https://api.hyperliquid.xyz/info";
const COINS = ["BTC", "ETH", "SOL", "HYPE", "XRP", "ZEC", "BNB", "DOGE"];

async function info<T>(body: unknown): Promise<T> {
  const res = await fetch(HL_INFO, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Hyperliquid ${res.status}`);
  return (await res.json()) as T;
}

async function main() {
  const arg = (name: string) => {
    const i = process.argv.indexOf(name);
    return i > 0 ? process.argv[i + 1] : null;
  };
  const out = arg("--out");
  const horizon = Number(arg("--horizon") ?? 24);
  const [meta] = await info<[{ universe: Array<{ name: string; maxLeverage: number }> }]>({
    type: "metaAndAssetCtxs",
  });
  const maxLev = new Map(meta.universe.map((u) => [u.name, u.maxLeverage]));
  const end = Date.now();
  const results: BacktestResult[] = [];
  for (const coin of COINS) {
    const raw = await info<Array<Record<string, string | number>>>({
      type: "candleSnapshot",
      req: { coin, interval: "1h", startTime: end - 5000 * 3_600_000, endTime: end },
    });
    const candles: Candle[] = raw.map((k) => ({
      t: Number(k.t),
      o: Number(k.o),
      h: Number(k.h),
      l: Number(k.l),
      c: Number(k.c),
      v: Number(k.v),
    }));
    const r = backtestLiquidationSignal(candles, { coin, maxLeverage: maxLev.get(coin) ?? 20, horizon });
    results.push(r);
    const m = r.magnet;
    const i = r.imbalance;
    console.log(
      `${coin.padEnd(5)} candles ${candles.length} trials ${r.trials} | magnet near-first ${m.nearFirst}/${m.trials} ` +
        `vs mirror ${m.placeboNearFirst} (wins ${m.wins}, losses ${m.losses}) z ${m.z.toFixed(2)} | imbalance ${i.hits}/${i.calls} ` +
        `(${(i.hitRate * 100).toFixed(0)}%) mean ${i.meanReturnPct.toFixed(2)}% z ${i.z.toFixed(2)}`,
    );
    await new Promise((r) => setTimeout(r, 6_000));
  }
  const verdicts = gateVerdicts(results);
  for (const v of verdicts) {
    console.log(
      `${v.hypothesis}: ${v.trials} trials, pooled z ${v.z.toFixed(2)}, edge on ${v.coinsPositive}/${v.coins} coins → ${
        v.pass ? "PASSES" : "fails"
      } the gate`,
    );
  }
  if (out) writeFileSync(out, JSON.stringify({ ranAt: new Date(end).toISOString(), horizon, results, verdicts }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
