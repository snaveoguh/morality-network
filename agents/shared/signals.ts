/**
 * Trending Base token signal feed for agent decide loops.
 *
 * Pulls top-volume and trending pools from GeckoTerminal (free tier, no key,
 * 30 req/min rate limit — fine for a 15-min decide cadence). Returns a
 * compact candidate list the LLM can reason about.
 *
 * GeckoTerminal docs: https://www.geckoterminal.com/dex-api
 */

const GECKO_BASE = "https://api.geckoterminal.com/api/v2";

type GTAttributes = {
  name?: string;
  address?: string;
  base_token_price_usd?: string;
  fdv_usd?: string;
  reserve_in_usd?: string;
  price_change_percentage?: Record<string, string>;
  volume_usd?: Record<string, string>;
  pool_created_at?: string;
};

type GTRelationships = {
  base_token?: { data?: { id?: string } };
  quote_token?: { data?: { id?: string } };
  dex?: { data?: { id?: string } };
};

type GTPool = {
  id?: string;
  attributes?: GTAttributes;
  relationships?: GTRelationships;
};

type GTResponse = { data?: GTPool[] };

export interface BaseTokenCandidate {
  /** Pool name e.g. "DEGEN / WETH 1%" */
  pairName: string;
  /** Base token address (the non-quote token in the pool) on Base mainnet. */
  baseToken: `0x${string}`;
  /** Quote token address (USDC, WETH, etc). */
  quoteToken: `0x${string}` | null;
  /** Last trade price in USD. */
  priceUsd: number | null;
  /** Fully diluted valuation in USD. */
  fdvUsd: number | null;
  /** Pool liquidity in USD. */
  liquidityUsd: number | null;
  /** 24h price change, %. */
  priceChange24h: number | null;
  /** 24h trade volume, USD. */
  volume24hUsd: number | null;
  /** DEX id e.g. "uniswap-v3-base", "aerodrome-base". */
  dex: string | null;
  /** Pool age in hours (null if unknown). */
  ageHours: number | null;
}

function parseAddressFromId(id: string | undefined | null): `0x${string}` | null {
  if (!id) return null;
  // GT ids look like "base_0xabc..."
  const m = id.match(/0x[a-fA-F0-9]{40}/);
  return m ? (m[0] as `0x${string}`) : null;
}

function numOrNull(v: string | undefined): number | null {
  if (typeof v !== "string") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapPool(p: GTPool): BaseTokenCandidate | null {
  const a = p.attributes ?? {};
  const r = p.relationships ?? {};
  const baseToken = parseAddressFromId(r.base_token?.data?.id);
  if (!baseToken) return null;

  const createdAt = a.pool_created_at ? Date.parse(a.pool_created_at) : NaN;
  const ageHours = Number.isFinite(createdAt)
    ? Math.max(0, (Date.now() - createdAt) / 3_600_000)
    : null;

  return {
    pairName: a.name ?? "",
    baseToken,
    quoteToken: parseAddressFromId(r.quote_token?.data?.id),
    priceUsd: numOrNull(a.base_token_price_usd),
    fdvUsd: numOrNull(a.fdv_usd),
    liquidityUsd: numOrNull(a.reserve_in_usd),
    priceChange24h: numOrNull(a.price_change_percentage?.h24),
    volume24hUsd: numOrNull(a.volume_usd?.h24),
    dex: r.dex?.data?.id ?? null,
    ageHours,
  };
}

async function fetchGT(path: string): Promise<GTPool[]> {
  const res = await fetch(`${GECKO_BASE}${path}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`geckoterminal ${path} ${res.status}`);
  }
  const body = (await res.json()) as GTResponse;
  return body.data ?? [];
}

export interface CandidatesOptions {
  /** Max candidates returned. Default 10. */
  limit?: number;
  /** Minimum 24h volume in USD. Default 50_000 (filters noise). */
  minVolume24h?: number;
  /** Minimum pool liquidity in USD. Default 25_000 (filters rugs). */
  minLiquidity?: number;
}

/**
 * Returns a mix of top-volume + trending Base pools, deduped by base token,
 * sorted by 24h volume descending. Skips pools below thresholds.
 */
export async function getBaseCandidates(
  opts: CandidatesOptions = {},
): Promise<BaseTokenCandidate[]> {
  const limit = opts.limit ?? 10;
  const minVolume = opts.minVolume24h ?? 50_000;
  const minLiquidity = opts.minLiquidity ?? 25_000;

  let pools: GTPool[] = [];
  try {
    const [top, trending] = await Promise.all([
      fetchGT("/networks/base/pools?page=1"),
      fetchGT("/networks/base/trending_pools?page=1"),
    ]);
    pools = [...trending, ...top]; // trending first so it wins dedup ties
  } catch (err) {
    console.warn(`[signals] geckoterminal fetch failed: ${(err as Error).message}`);
    return [];
  }

  const seen = new Set<string>();
  const out: BaseTokenCandidate[] = [];
  for (const p of pools) {
    const c = mapPool(p);
    if (!c) continue;
    const key = c.baseToken.toLowerCase();
    if (seen.has(key)) continue;
    if ((c.volume24hUsd ?? 0) < minVolume) continue;
    if ((c.liquidityUsd ?? 0) < minLiquidity) continue;
    seen.add(key);
    out.push(c);
  }
  out.sort((a, b) => (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0));
  return out.slice(0, limit);
}

/** One-line per candidate, for embedding in an LLM prompt. */
export function formatCandidatesForPrompt(cands: BaseTokenCandidate[]): string {
  if (cands.length === 0) return "(no candidates met thresholds)";
  return cands
    .map((c) => {
      const change = c.priceChange24h == null ? "?" : `${c.priceChange24h.toFixed(1)}%`;
      const vol = c.volume24hUsd == null ? "?" : `$${Math.round(c.volume24hUsd).toLocaleString("en-US")}`;
      const liq = c.liquidityUsd == null ? "?" : `$${Math.round(c.liquidityUsd).toLocaleString("en-US")}`;
      const px = c.priceUsd == null ? "?" : `$${c.priceUsd < 0.01 ? c.priceUsd.toExponential(2) : c.priceUsd.toFixed(4)}`;
      const age = c.ageHours == null ? "?" : c.ageHours < 24 ? `${c.ageHours.toFixed(1)}h` : `${(c.ageHours / 24).toFixed(1)}d`;
      return `  • ${c.pairName.padEnd(28)} base=${c.baseToken} px=${px} 24h=${change} vol=${vol} liq=${liq} age=${age} dex=${c.dex ?? "?"}`;
    })
    .join("\n");
}
