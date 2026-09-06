/**
 * engine-symbol.ts — the ONE place that turns a ticker / asset name from any
 * producer (editorial LLM, swarm regex, newsdesk, scanner) into the exact
 * symbol the Hyperliquid engine trades (`BTC`, `PAXG`, `xyz:SILVER`, …).
 *
 * Kept dependency-free on purpose: editorial-archive.ts, signals.ts and
 * swarm-signals.ts all import it, and signals.ts ⇄ editorial-archive.ts is
 * already a cycle we must not deepen.
 */

/** Explicit ticker → engine symbol. Keys are upper-case. */
export const TICKER_ALIASES: Record<string, string> = {
  BTC: "BTC",
  XBT: "BTC",
  ETH: "ETH",
  ZEC: "ZEC",
  SOL: "SOL",
  DOGE: "DOGE",
  AVAX: "AVAX",
  LINK: "LINK",
  ARB: "ARB",
  OP: "OP",
  XRP: "XRP",
  HYPE: "HYPE",
  TAO: "TAO",
  XAU: "PAXG",
  GC: "PAXG",
  GOLD: "PAXG",
  PAXG: "PAXG",
  // True silver trades on the xyz builder dex (was proxied to PAXG before HIP-3 support)
  XAG: "xyz:SILVER",
  SI: "xyz:SILVER",
  SILVER: "xyz:SILVER",
  // Equities via the xyz builder dex
  TSLA: "xyz:TSLA",
  NVDA: "xyz:NVDA",
  AAPL: "xyz:AAPL",
  MSTR: "xyz:MSTR",
  COIN: "xyz:COIN",
  CL: "OIL",
  BRN: "OIL",
  WTI: "OIL",
  OIL: "OIL",
  DXY: "DXY",
  UST: "DXY",
  US10Y: "DXY",
  SPX: "SPX",
  SPY: "SPX",
  ES: "SPX",
  NDX: "SPX",
  QQQ: "SPX",
};

/** Lower-cased, punctuation-stripped asset name → engine symbol. */
export const EXACT_ASSET_ALIASES: Record<string, string> = {
  "bitcoin": "BTC",
  "ethereum": "ETH",
  "zcash": "ZEC",
  "solana": "SOL",
  "gold": "PAXG",
  "silver": "xyz:SILVER",
  "tesla": "xyz:TSLA",
  "nvidia": "xyz:NVDA",
  "apple": "xyz:AAPL",
  "microstrategy": "xyz:MSTR",
  "coinbase": "xyz:COIN",
  "crude oil": "OIL",
  "us dollar index": "DXY",
  "digital assets": "BTC",
  "ai & semiconductor equities": "xyz:NVDA",
  "healthcare & biotech": "SPX",
  "global trade flows": "DXY",
  "global macro": "DXY",
  "defense & commodities": "OIL",
  "energy transition": "OIL",
  "political risk": "DXY",
  "governance risk": "SPX",
  "esg & social impact": "SPX",
  "haleon plc": "SPX",
  "uk consumer staples etf": "SPX",
  "indian pharmaceutical index": "SPX",
};

export function normalizeTicker(ticker: string | null | undefined): string | null {
  if (!ticker) return null;
  const cleaned = ticker.trim().toUpperCase().replace(/^\$/, "");
  return cleaned || null;
}

export function normalizeAssetText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9&\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resolve a producer's (ticker, asset) pair to an engine symbol.
 * Returns null when nothing we trade matches — callers should skip the row
 * rather than persist an untradeable symbol.
 *
 * Already-canonical engine symbols (`xyz:GOLD`, `PAXG`, …) pass through.
 */
export function normalizeEngineSymbol(
  ticker: string | null | undefined,
  asset?: string | null,
): string | null {
  const t = normalizeTicker(ticker);
  if (t) {
    if (t.startsWith("XYZ:")) return `xyz:${t.slice(4)}`;
    if (TICKER_ALIASES[t]) return TICKER_ALIASES[t];
  }
  const a = normalizeAssetText(asset);
  if (a && EXACT_ASSET_ALIASES[a]) return EXACT_ASSET_ALIASES[a];
  // A bare ticker inside the asset string, e.g. "Gold (XAU)" or "Tesla ($TSLA)"
  const embedded = (asset ?? "").match(/\(\$?([A-Z]{2,6})\)/);
  if (embedded && TICKER_ALIASES[embedded[1]]) return TICKER_ALIASES[embedded[1]];
  return null;
}
