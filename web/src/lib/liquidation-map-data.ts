import "server-only";

import { fetchWithRetry } from "@/lib/fetch-utils";
import {
  buildLiquidationMap,
  findClusters,
  type Candle,
  type LiquidationCluster,
  type LiquidationMap,
} from "@/lib/liquidation-map";

/**
 * Live inputs for the liquidation map, from Hyperliquid's public info API
 * (no key): `metaAndAssetCtxs` for mark price, open interest, funding and
 * max leverage; `candleSnapshot` for 1h candles. Stocks and indices are
 * HIP-3 perps on the `xyz` dex (trade.xyz), read with `dex: "xyz"`.
 *
 * Binance and Bybit futures endpoints return 451/403 from US hosts
 * (Railway), so they are not used. Coinglass needs a key. No LLM calls.
 *
 * Results are cached in memory for CACHE_MS; the /markets page also
 * revalidates every 5 minutes.
 */

const HL_INFO = "https://api.hyperliquid.xyz/info";
const CACHE_MS = 5 * 60_000;
const LOOKBACK_MS = 7 * 24 * 3_600_000;

export type AssetGroup = "crypto" | "stocks";

interface AssetDef {
  /** Hyperliquid coin name. */
  coin: string;
  label: string;
  group: AssetGroup;
}

/** Large Hyperliquid perps by open interest (checked 2026-10-30). */
export const LIQ_MAP_ASSETS: readonly AssetDef[] = [
  { coin: "BTC", label: "BTC", group: "crypto" },
  { coin: "ETH", label: "ETH", group: "crypto" },
  { coin: "SOL", label: "SOL", group: "crypto" },
  { coin: "HYPE", label: "HYPE", group: "crypto" },
  { coin: "XRP", label: "XRP", group: "crypto" },
  { coin: "ZEC", label: "ZEC", group: "crypto" },
  { coin: "BNB", label: "BNB", group: "crypto" },
  { coin: "DOGE", label: "DOGE", group: "crypto" },
  { coin: "xyz:SP500", label: "S&P 500", group: "stocks" },
  { coin: "xyz:XYZ100", label: "XYZ100", group: "stocks" },
  { coin: "xyz:NVDA", label: "NVDA", group: "stocks" },
  { coin: "xyz:GOOGL", label: "GOOGL", group: "stocks" },
  { coin: "xyz:AAPL", label: "AAPL", group: "stocks" },
  { coin: "xyz:META", label: "META", group: "stocks" },
  { coin: "xyz:MSFT", label: "MSFT", group: "stocks" },
  { coin: "xyz:TSLA", label: "TSLA", group: "stocks" },
];

export interface LiquidationMapEntry {
  label: string;
  group: AssetGroup;
  /** Hourly funding rate as a fraction (Hyperliquid pays funding hourly). */
  funding: number;
  maxLeverage: number;
  map: LiquidationMap;
  clusters: LiquidationCluster[];
}

export interface LiquidationMapSnapshot {
  fetchedAt: number;
  entries: LiquidationMapEntry[];
}

interface AssetCtx {
  price: number;
  openInterest: number;
  funding: number;
  maxLeverage: number;
}

async function hlInfo<T>(body: unknown): Promise<T> {
  const res = await fetchWithRetry(
    HL_INFO,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
    1,
    8_000,
  );
  if (!res.ok) throw new Error(`Hyperliquid info ${res.status}`);
  return (await res.json()) as T;
}

type MetaAndCtxs = [
  { universe: Array<{ name: string; maxLeverage: number; isDelisted?: boolean }> },
  Array<{ markPx: string | null; openInterest: string; funding: string }>,
];

async function fetchContexts(dex?: string): Promise<Map<string, AssetCtx>> {
  const [meta, ctxs] = await hlInfo<MetaAndCtxs>(
    dex ? { type: "metaAndAssetCtxs", dex } : { type: "metaAndAssetCtxs" },
  );
  const out = new Map<string, AssetCtx>();
  meta.universe.forEach((u, i) => {
    const c = ctxs[i];
    if (!c || u.isDelisted) return;
    const price = Number(c.markPx);
    const openInterest = Number(c.openInterest);
    if (!(price > 0) || !(openInterest > 0)) return;
    out.set(u.name, { price, openInterest, funding: Number(c.funding), maxLeverage: u.maxLeverage });
  });
  return out;
}

async function fetchCandles(coin: string, now: number): Promise<Candle[]> {
  const raw = await hlInfo<Array<Record<string, string | number>>>({
    type: "candleSnapshot",
    req: { coin, interval: "1h", startTime: now - LOOKBACK_MS, endTime: now },
  });
  return raw.map((k) => ({
    t: Number(k.t),
    o: Number(k.o),
    h: Number(k.h),
    l: Number(k.l),
    c: Number(k.c),
    v: Number(k.v),
  }));
}

async function load(): Promise<LiquidationMapSnapshot> {
  const now = Date.now();
  const [main, xyz] = await Promise.all([
    fetchContexts(),
    fetchContexts("xyz").catch(() => new Map<string, AssetCtx>()),
  ]);
  const settled = await Promise.allSettled(
    LIQ_MAP_ASSETS.map(async (a): Promise<LiquidationMapEntry | null> => {
      const ctx = (a.group === "stocks" ? xyz : main).get(a.coin);
      if (!ctx) return null;
      const candles = await fetchCandles(a.coin, now);
      if (candles.length < 24) return null;
      const map = buildLiquidationMap({
        coin: a.coin,
        price: ctx.price,
        openInterest: ctx.openInterest,
        maxLeverage: ctx.maxLeverage,
        candles,
      });
      return {
        label: a.label,
        group: a.group,
        funding: ctx.funding,
        maxLeverage: ctx.maxLeverage,
        map,
        clusters: findClusters(map),
      };
    }),
  );
  const entries = settled.flatMap((r) => (r.status === "fulfilled" && r.value ? [r.value] : []));
  return { fetchedAt: now, entries };
}

let cache: { at: number; promise: Promise<LiquidationMapSnapshot> } | null = null;

/** Live snapshot, or null if Hyperliquid is unreachable. Never throws. */
export async function getLiquidationMaps(): Promise<LiquidationMapSnapshot | null> {
  const now = Date.now();
  if (!cache || now - cache.at > CACHE_MS) {
    const promise = load();
    cache = { at: now, promise };
    // Don't keep a failed or empty load cached.
    promise
      .then((s) => {
        if (s.entries.length === 0 && cache?.promise === promise) cache = null;
      })
      .catch(() => {
        if (cache?.promise === promise) cache = null;
      });
  }
  try {
    const snap = await cache.promise;
    return snap.entries.length ? snap : null;
  } catch (err) {
    console.warn("[liquidation-map] fetch failed:", err instanceof Error ? err.message : err);
    return null;
  }
}
