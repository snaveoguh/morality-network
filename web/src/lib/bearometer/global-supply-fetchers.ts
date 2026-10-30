import "server-only";

import type { DataIndicatorDef } from "./global-supply-taxonomy";
import type { SeriesPoint } from "./global-supply-score";

// ============================================================================
// BEAROMETER — GLOBAL SUPPLY-CHAIN DATA FETCHERS
// Free, keyless public sources only, each checked live on 2026-10-29:
//   Yahoo Finance chart API   daily closes (freight ETFs, futures)
//   IMF PortWatch (ArcGIS)    daily chokepoint transits — statistics queries
//                             only; plain row queries return "Invalid URL",
//                             and about half its server instances refuse
//                             any query, so every call retries.
//   OECD SDMX                 monthly business confidence (PMI stand-in)
//   UN FAO                    monthly Food Price Index CSV
//   US EIA                    weekly SPR stocks (HTML history table)
// Checked and left out: FRED (404 / timeouts from our hosts), GIE AGSI EU gas
// storage (API key required), Drewry WCI (429), DBnomics IMF commodity prices
// (last value June 2025), NY Fed GSCPI (legacy .xls only).
// Every fetcher fails soft to null; one dead source never blanks the panel.
// Results are cached in-process: most series update daily or monthly.
// ============================================================================

const TIMEOUT_MS = 12_000;
const CACHE_TTL_MS = 3 * 60 * 60 * 1000;
/** Retry sooner when a source failed, so one bad minute is not shown for hours. */
const CACHE_TTL_PARTIAL_MS = 15 * 60 * 1000;
const USER_AGENT = "Mozilla/5.0 (compatible; PooterWorld/1.0; +https://pooter.world)";

async function fetchText(url: string, attempts = 1): Promise<string> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

// ── Yahoo Finance ─────────────────────────────────────────────────────────

interface YahooChart {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: Array<number | null> }> };
    }>;
  };
}

export async function fetchYahooDaily(symbol: string): Promise<SeriesPoint[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=6mo&interval=1d`;
  const json = JSON.parse(await fetchText(url, 2)) as YahooChart;
  const result = json.chart?.result?.[0];
  const stamps = result?.timestamp ?? [];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  const points: SeriesPoint[] = [];
  stamps.forEach((ts, i) => {
    const close = closes[i];
    if (typeof close === "number" && Number.isFinite(close)) {
      points.push({ date: new Date(ts * 1000).toISOString().slice(0, 10), value: close });
    }
  });
  return points;
}

// ── IMF PortWatch ─────────────────────────────────────────────────────────

const PORTWATCH_QUERY =
  "https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Chokepoints_Data/FeatureServer/0/query";
const PORTWATCH_WINDOW_DAYS = 14;

interface ArcgisStats {
  error?: unknown;
  features?: Array<{ attributes: Record<string, string | number | null> }>;
}

async function portwatchStats(params: Record<string, string>): Promise<ArcgisStats> {
  const url = `${PORTWATCH_QUERY}?${new URLSearchParams({ ...params, f: "json" })}`;
  // ArcGIS answers errors with HTTP 200 and an { error } body, so retry on that too.
  let last: ArcgisStats = {};
  for (let i = 0; i < 5; i += 1) {
    try {
      last = JSON.parse(await fetchText(url)) as ArcgisStats;
      if (!last.error && last.features) return last;
    } catch {
      // network error: try again
    }
  }
  throw new Error(`portwatch query failed: ${JSON.stringify(last.error ?? "no features")}`);
}

function isoDay(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

async function portwatchAverages(from: string, to: string): Promise<Map<string, number>> {
  const json = await portwatchStats({
    where: `date >= DATE '${from}' AND date <= DATE '${to}'`,
    groupByFieldsForStatistics: "portid",
    outStatistics: JSON.stringify([
      { statisticType: "avg", onStatisticField: "n_total", outStatisticFieldName: "avg_total" },
    ]),
  });
  const out = new Map<string, number>();
  for (const f of json.features ?? []) {
    const id = f.attributes.portid;
    const avg = Number(f.attributes.avg_total);
    if (typeof id === "string" && Number.isFinite(avg)) out.set(id, avg);
  }
  return out;
}

/**
 * Every chokepoint at once: two points per port — the same 14 days a year
 * earlier, then the latest 14 days — dated by each window's last day.
 */
export async function fetchPortwatchTransits(): Promise<Map<string, SeriesPoint[]>> {
  const latest = await portwatchStats({
    where: "1=1",
    outStatistics: JSON.stringify([
      { statisticType: "max", onStatisticField: "date", outStatisticFieldName: "latest" },
    ]),
  });
  const latestDate = String(latest.features?.[0]?.attributes.latest ?? "");
  const end = Date.parse(latestDate);
  if (!Number.isFinite(end)) throw new Error("portwatch: no latest date");

  const start = end - (PORTWATCH_WINDOW_DAYS - 1) * 86_400_000;
  const yearAgo = (ts: number) => {
    const d = new Date(ts);
    d.setUTCFullYear(d.getUTCFullYear() - 1);
    return d.getTime();
  };
  const [recent, prior] = await Promise.all([
    portwatchAverages(isoDay(start), isoDay(end)),
    portwatchAverages(isoDay(yearAgo(start)), isoDay(yearAgo(end))),
  ]);

  const out = new Map<string, SeriesPoint[]>();
  for (const [portid, value] of recent) {
    const before = prior.get(portid);
    if (before === undefined) continue;
    out.set(portid, [
      { date: isoDay(yearAgo(end)), value: before },
      { date: isoDay(end), value },
    ]);
  }
  return out;
}

// ── OECD business confidence ──────────────────────────────────────────────

export async function fetchOecdBusinessConfidence(areas: string[]): Promise<Map<string, SeriesPoint[]>> {
  const start = new Date();
  start.setUTCMonth(start.getUTCMonth() - 18);
  const url =
    `https://sdmx.oecd.org/public/rest/data/OECD.SDD.STES,DSD_STES@DF_CLI,/${areas.join("+")}.M.BCICP......` +
    `?startPeriod=${start.toISOString().slice(0, 7)}&dimensionAtObservation=AllDimensions&format=csvfile`;
  // OECD returns the odd HTTP 500 under load; a retry usually clears it.
  return parseOecdCsv(await fetchText(url, 3));
}

export function parseOecdCsv(csv: string): Map<string, SeriesPoint[]> {
  const [header, ...rows] = csv.trim().split(/\r?\n/);
  const cols = header.split(",");
  const area = cols.indexOf("REF_AREA");
  const period = cols.indexOf("TIME_PERIOD");
  const value = cols.indexOf("OBS_VALUE");
  const out = new Map<string, SeriesPoint[]>();
  if (area < 0 || period < 0 || value < 0) return out;
  for (const row of rows) {
    const cells = row.split(",");
    const v = Number(cells[value]);
    if (!Number.isFinite(v)) continue;
    const list = out.get(cells[area]) ?? [];
    list.push({ date: cells[period], value: v });
    out.set(cells[area], list);
  }
  for (const list of out.values()) list.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

// ── FAO Food Price Index ──────────────────────────────────────────────────

const FAO_CSV =
  "https://www.fao.org/media/docs/worldfoodsituationlibraries/wfs-library/food_price_indices_data.csv?download=true";

export function parseFaoCsv(csv: string): SeriesPoint[] {
  const points: SeriesPoint[] = [];
  for (const line of csv.split(/\r?\n/)) {
    const [date, index] = line.split(",");
    if (!/^\d{4}-\d{2}$/.test(date ?? "")) continue;
    const value = Number(index);
    if (Number.isFinite(value) && index !== "") points.push({ date, value });
  }
  return points.sort((a, b) => a.date.localeCompare(b.date));
}

export async function fetchFaoFoodPriceIndex(): Promise<SeriesPoint[]> {
  return parseFaoCsv(await fetchText(FAO_CSV, 2));
}

// ── EIA Strategic Petroleum Reserve ───────────────────────────────────────

const EIA_SPR =
  "https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=WCSSTUS1&f=W";

/**
 * The EIA history page is a table: one row per month ("2026-Oct"), five
 * week-ending cells ("10/23", class B5) and five value cells (class B3, in
 * thousand barrels). Converted to million barrels.
 */
export function parseEiaSprHtml(html: string): SeriesPoint[] {
  const points: SeriesPoint[] = [];
  const rowPattern = /<td class='B6'>&nbsp;&nbsp;(\d{4})-\w{3}([\s\S]*?)<\/tr>/g;
  for (const [, year, rest] of html.matchAll(rowPattern)) {
    const dates = [...rest.matchAll(/<td class='B5'>([^<]*)<\/td>/g)].map((m) => m[1].replace(/&nbsp;/g, "").trim());
    const values = [...rest.matchAll(/<td class='B3'>([^<]*)<\/td>/g)].map((m) =>
      Number(m[1].replace(/&nbsp;|,/g, "").trim()),
    );
    dates.forEach((md, i) => {
      const value = values[i];
      if (!/^\d{2}\/\d{2}$/.test(md) || !Number.isFinite(value) || value === 0) return;
      points.push({ date: `${year}-${md.slice(0, 2)}-${md.slice(3, 5)}`, value: value / 1000 });
    });
  }
  return points.sort((a, b) => a.date.localeCompare(b.date));
}

export async function fetchEiaSpr(): Promise<SeriesPoint[]> {
  return parseEiaSprHtml(await fetchText(EIA_SPR, 2));
}

// ── All series ────────────────────────────────────────────────────────────

let cache: { series: Record<string, SeriesPoint[] | null>; failed: string[]; expires: number } | null = null;

/** One fetch per source family (PortWatch and OECD batch every series in one call). */
export async function fetchAllSeries(
  defs: DataIndicatorDef[],
): Promise<{ series: Record<string, SeriesPoint[] | null>; failed: string[] }> {
  if (cache && Date.now() < cache.expires) return cache;

  const oecdAreas = defs.flatMap((d) => (d.source.kind === "oecd-bci" ? [d.source.area] : []));
  const [portwatch, oecd, fao, spr] = await Promise.allSettled([
    fetchPortwatchTransits(),
    fetchOecdBusinessConfidence(oecdAreas),
    fetchFaoFoodPriceIndex(),
    fetchEiaSpr(),
  ]);
  const yahooSymbols = [...new Set(defs.flatMap((d) => (d.source.kind === "yahoo" ? [d.source.symbol] : [])))];
  const yahoo = await Promise.allSettled(yahooSymbols.map((s) => fetchYahooDaily(s)));
  const yahooBySymbol = new Map(yahooSymbols.map((s, i) => [s, yahoo[i]] as const));

  const failed = new Set<string>();
  const value = <T>(result: PromiseSettledResult<T> | undefined, key: string): T | null => {
    if (result?.status === "fulfilled") return result.value;
    if (failed.has(key)) return null;
    failed.add(key);
    if (result?.status === "rejected") {
      console.warn(`[bearometer] ${key} fetch failed: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
    }
    return null;
  };

  const series: Record<string, SeriesPoint[] | null> = {};
  for (const def of defs) {
    const src = def.source;
    let points: SeriesPoint[] | null = null;
    switch (src.kind) {
      case "yahoo":
        points = value(yahooBySymbol.get(src.symbol), `yahoo:${src.symbol}`);
        break;
      case "portwatch":
        points = value(portwatch, src.kind)?.get(src.portid) ?? null;
        break;
      case "oecd-bci":
        points = value(oecd, src.kind)?.get(src.area) ?? null;
        break;
      case "fao-ffpi":
        points = value(fao, src.kind);
        break;
      case "eia-spr":
        points = value(spr, src.kind);
        break;
    }
    series[def.id] = points && points.length > 0 ? points : null;
  }

  cache = {
    series,
    failed: [...failed],
    expires: Date.now() + (failed.size > 0 ? CACHE_TTL_PARTIAL_MS : CACHE_TTL_MS),
  };
  return cache;
}
