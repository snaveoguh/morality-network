import "server-only";

import { fetchWithRetry } from "@/lib/fetch-utils";
import {
  buildLiquidationMap,
  findClusters,
  type Candle,
  type LiquidationCluster,
  type LiquidationMap,
} from "@/lib/liquidation-map";
import { findPriceLevels, type PriceLevel } from "@/lib/price-levels";
import {
  buildExactLiquidationMap,
  combineMaps,
  type CombinedLiquidationMap,
  type ExactLiquidationMap,
} from "@/lib/hl-positions";
import { getScannedPositions, lastScanFinishedAt, touchHlScanner } from "@/lib/hl-position-scanner";
import { liquidationSignal, type LiquidationSignal } from "@/lib/liquidation-signal";
import { recordSignalsBatch, type RecordSignalInput } from "@/lib/db/signals";

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
 *
 * Exact layer: `hl-position-scanner.ts` polls real accounts' positions in
 * the background. Where it has any for a coin, the entry carries the exact
 * map (real `liquidationPx × size`) and a combined map: exact plus the
 * estimate scaled to the share of open interest not yet scanned.
 *
 * Each load also writes one INFORMATIONAL row per coin per hour to `pooter.signals`
 * (producer "liquidation-map", direction "neutral", which the trader's
 * reader skips). See `liquidation-signal.ts` for the backtest gate.
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
  /** Support and resistance from swing highs and lows in the same candles. */
  levels: PriceLevel[];
  /** Real positions, when the scanner has any for this coin. */
  exact: { map: ExactLiquidationMap; combined: CombinedLiquidationMap } | null;
  /** Nearest large clusters, from the combined map if there is one. */
  signal: LiquidationSignal;
}

export interface LiquidationMapSnapshot {
  fetchedAt: number;
  entries: LiquidationMapEntry[];
  /** When the position scan whose results are used here finished. */
  scannedAt: number | null;
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
  const scan = getScannedPositions(now);
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
      let exact: LiquidationMapEntry["exact"] = null;
      if (scan) {
        const exactMap = buildExactLiquidationMap({
          coin: a.coin,
          price: ctx.price,
          openInterest: ctx.openInterest,
          positions: scan.positions,
        });
        if (exactMap.accounts > 0) exact = { map: exactMap, combined: combineMaps(exactMap, map) };
      }
      const shown = exact?.combined ?? map;
      return {
        label: a.label,
        group: a.group,
        funding: ctx.funding,
        maxLeverage: ctx.maxLeverage,
        map,
        clusters: findClusters(shown),
        levels: findPriceLevels(candles, ctx.price),
        exact,
        signal: liquidationSignal({ coin: a.coin, price: ctx.price, buckets: shown.buckets }),
      };
    }),
  );
  const entries = settled.flatMap((r) => (r.status === "fulfilled" && r.value ? [r.value] : []));
  void recordLiquidationSignals(entries, now);
  return { fetchedAt: now, entries, scannedAt: scan?.lastCycle?.finishedAt ?? null };
}

/**
 * One row per coin per hour (the first load in the hour wins). Rows are kept
 * after their TTL, so they build the history the exact signal needs before
 * it can be backtested (docs/LIQUIDATION_SIGNAL.md).
 */
const SIGNAL_SLOT_MS = 3_600_000;
const SIGNAL_TTL_MS = 2 * SIGNAL_SLOT_MS;

export function toSignalRows(entries: readonly LiquidationMapEntry[], now: number): RecordSignalInput[] {
  const slot = Math.floor(now / SIGNAL_SLOT_MS) * SIGNAL_SLOT_MS;
  return entries.map((e) => ({
    id: `liqmap-${e.map.coin}-${slot}`,
    producedAt: new Date(now),
    producedBy: "liquidation-map",
    symbol: e.map.coin,
    // Informational: the trader's reader drops neutral rows.
    direction: "neutral",
    strength: 0,
    claim: null,
    sourceDetail: {
      informational: true,
      basis: e.exact ? "exact+estimate" : "estimate",
      coverage: e.exact?.map.coverage ?? 0,
      accounts: e.exact?.map.accounts ?? 0,
      price: e.signal.price,
      nearestLong: e.signal.nearestLong,
      nearestShort: e.signal.nearestShort,
      imbalance: e.signal.imbalance,
      nearPct: e.signal.nearPct,
    },
    ttlExpiresAt: new Date(now + SIGNAL_TTL_MS),
  }));
}

async function recordLiquidationSignals(entries: readonly LiquidationMapEntry[], now: number): Promise<void> {
  if (!process.env.DATABASE_URL || process.env.NEXT_PHASE === "phase-production-build") return;
  try {
    await recordSignalsBatch(toSignalRows(entries, now));
  } catch (err) {
    console.warn("[liquidation-map] signal write failed:", err instanceof Error ? err.message : err);
  }
}

let cache: { at: number; scanAt: number | null; promise: Promise<LiquidationMapSnapshot> } | null = null;

/** Live snapshot, or null if Hyperliquid is unreachable. Never throws. */
export async function getLiquidationMaps(): Promise<LiquidationMapSnapshot | null> {
  const now = Date.now();
  touchHlScanner(LIQ_MAP_ASSETS.map((a) => a.coin));
  const scanAt = lastScanFinishedAt();
  // Reload when a newer position scan has finished, not only on expiry.
  if (!cache || now - cache.at > CACHE_MS || scanAt !== cache.scanAt) {
    const promise = load();
    cache = { at: now, scanAt, promise };
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
