import "server-only";

// Chart queries — each returns a ChartSpec built from data we already hold,
// or null when that data is unavailable (no DB, feeds timed out, empty
// table). Every query sits behind unstable_cache with a short revalidate so
// the charts refresh on their own; a failed read throws inside the cache so
// an empty result is never pinned for the whole window.

import { unstable_cache } from "next/cache";
import { sql } from "../db";
import { fetchAllFeeds } from "../rss";
import { BIAS_LABELS, getSourceBias, type BiasRating } from "../bias";
import type { ChartPoint, ChartSpec } from "./types";

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function isoDay(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

// ── Live feed ──────────────────────────────────────────────────────────────

const BIAS_ORDER: BiasRating[] = [
  "far-left",
  "left",
  "lean-left",
  "center",
  "lean-right",
  "right",
  "far-right",
];

interface FeedAggregates {
  total: number;
  byBias: Record<BiasRating, number>;
  unrated: number;
  byCategory: Array<{ category: string; n: number }>;
  asOf: string;
}

async function loadFeedAggregates(): Promise<FeedAggregates> {
  const items = await withTimeout(fetchAllFeeds(), 8000, []);
  if (items.length === 0) throw new Error("feed empty or timed out");

  const byBias = Object.fromEntries(BIAS_ORDER.map((b) => [b, 0])) as Record<BiasRating, number>;
  let unrated = 0;
  const categories = new Map<string, number>();
  for (const item of items) {
    const bias = item.bias ?? getSourceBias(item.sourceUrl || item.source);
    if (bias) byBias[bias.bias]++;
    else unrated++;
    const cat = item.category || "Other";
    categories.set(cat, (categories.get(cat) ?? 0) + 1);
  }

  return {
    total: items.length,
    byBias,
    unrated,
    byCategory: [...categories.entries()]
      .map(([category, n]) => ({ category, n }))
      .sort((a, b) => b.n - a.n),
    asOf: new Date().toISOString(),
  };
}

const getFeedAggregates = unstable_cache(loadFeedAggregates, ["charts-feed-aggregates-v1"], {
  revalidate: 900, // matches the home page ISR window
});

async function feedAggregates(): Promise<FeedAggregates | null> {
  try {
    return await getFeedAggregates();
  } catch {
    return null;
  }
}

export async function feedBiasChart(): Promise<ChartSpec | null> {
  const agg = await feedAggregates();
  if (!agg) return null;

  const rated = agg.total - agg.unrated;
  const left = agg.byBias["far-left"] + agg.byBias.left + agg.byBias["lean-left"];
  const right = agg.byBias["far-right"] + agg.byBias.right + agg.byBias["lean-right"];
  const centre = agg.byBias.center;
  const sides = [
    { name: "Left-leaning outlets", n: left },
    { name: "Centre outlets", n: centre },
    { name: "Right-leaning outlets", n: right },
  ].sort((a, b) => b.n - a.n);
  const title =
    rated > 0
      ? `${sides[0].name} supply ${pct(sides[0].n, rated)}% of today's rated stories; ${sides[2].name.toLowerCase()}, ${pct(sides[2].n, rated)}%`
      : "No story in today's feed comes from a rated outlet";

  const data: ChartPoint[] = BIAS_ORDER.map((b) => ({ label: BIAS_LABELS[b], value: agg.byBias[b] }));
  if (agg.unrated > 0) data.push({ label: "Unrated", value: agg.unrated });

  return {
    id: "feed-bias",
    kind: "bar",
    title,
    dek: `Stories in the live pooter.world feed, by the rated bias of the outlet that published them. ${agg.total.toLocaleString("en-GB")} stories.`,
    data,
    unit: "stories",
    source: { name: "pooter.world feed; outlet ratings from MBFC, AllSides, Ad Fontes", href: "/api/feed/sources" },
    asOf: agg.asOf,
    note: "Unrated = forums and outlets with no published rating. Shares in the title are of rated stories only.",
  };
}

export async function feedCategoryChart(): Promise<ChartSpec | null> {
  const agg = await feedAggregates();
  if (!agg || agg.byCategory.length === 0) return null;

  const top = agg.byCategory.slice(0, 7);
  const rest = agg.byCategory.slice(7).reduce((sum, c) => sum + c.n, 0);
  const data: ChartPoint[] = top.map((c) => ({ label: c.category, value: c.n }));
  if (rest > 0) data.push({ label: "Everything else", value: rest });
  const lead = agg.byCategory[0];

  return {
    id: "feed-category",
    kind: "bar",
    title: `${lead.category} makes up ${pct(lead.n, agg.total)}% of today's feed`,
    dek: "Stories in the live feed, by the desk of the outlet they came from.",
    data,
    unit: "stories",
    source: { name: "pooter.world feed", href: "/api/feed/sources" },
    asOf: agg.asOf,
  };
}

// ── Claim Ledger ───────────────────────────────────────────────────────────

const PARTY_NAMES: Record<string, string> = {
  Lab: "Labour",
  "Lab/Co-op": "Labour",
  Con: "Conservative",
  LD: "Liberal Democrat",
  SNP: "SNP",
  Reform: "Reform UK",
  RUK: "Reform UK",
  "Reform UK": "Reform UK",
  Green: "Green",
  PC: "Plaid Cymru",
  DUP: "DUP",
  SF: "Sinn Féin",
  SDLP: "SDLP",
  UUP: "UUP",
  TUV: "TUV",
  Alliance: "Alliance",
  Ind: "Independent",
};

interface SittingRow {
  day: string | Date;
  n: number;
}

async function loadPmqsSittings(): Promise<{ rows: Array<{ day: string; n: number }>; asOf: string }> {
  // Every PMQs sitting we ingested, including those that yielded no claims.
  // Claims are also read directly in case a sitting was persisted without an
  // ingest-attempt row (on-demand extraction path).
  const rows = await sql<SittingRow[]>`
    SELECT MIN(day) AS day, SUM(n)::int AS n
    FROM (
      SELECT debate_ext_id, MIN(uttered_at) AS day, COUNT(*) AS n
      FROM pooter.ledger_claims
      WHERE context = 'pmqs'
      GROUP BY debate_ext_id
      UNION ALL
      SELECT debate_ext_id, sitting_date AS day, 0 AS n
      FROM pooter.ledger_ingested_debates
      WHERE context = 'pmqs' AND sitting_date IS NOT NULL
    ) u
    GROUP BY debate_ext_id
    ORDER BY day DESC
    LIMIT 40
  `;
  return {
    rows: [...rows].reverse().map((r) => ({ day: isoDay(r.day), n: r.n })),
    asOf: new Date().toISOString(),
  };
}

const getPmqsSittings = unstable_cache(loadPmqsSittings, ["charts-pmqs-sittings-v1"], {
  revalidate: 1800, // ledger page window
});

async function pmqsSittings() {
  if (!process.env.DATABASE_URL) return null;
  try {
    const result = await getPmqsSittings();
    return result.rows.length > 0 ? result : null;
  } catch {
    return null;
  }
}

export async function claimsPerSittingChart(): Promise<ChartSpec | null> {
  const sittings = await pmqsSittings();
  if (!sittings) return null;

  const recent = sittings.rows.slice(-16);
  const latest = recent[recent.length - 1];
  const prior = recent.slice(0, -1);
  const avg = prior.length > 0 ? prior.reduce((s, r) => s + r.n, 0) / prior.length : 0;
  const avgText = avg.toFixed(1).replace(/\.0$/, "");
  const verb = latest.n > avg ? "above" : latest.n < avg ? "below" : "level with";
  const title =
    prior.length > 0
      ? `The latest PMQs logged ${latest.n} checkable ${latest.n === 1 ? "claim" : "claims"}, ${verb} the ${prior.length}-sitting average of ${avgText}`
      : `The first PMQs on the ledger logged ${latest.n} checkable ${latest.n === 1 ? "claim" : "claims"}`;

  return {
    id: "claims-per-pmqs",
    kind: "column",
    title,
    dek: "Checkable claims the Claim Ledger recorded at each Prime Minister's Questions, quoted verbatim from Hansard.",
    data: recent.map((r) => ({ label: shortDate(r.day), value: r.n })),
    unit: "claims",
    source: { name: "Claim Ledger, from Hansard", href: "/ledger" },
    asOf: sittings.asOf,
  };
}

export async function ledgerGrowthChart(): Promise<ChartSpec | null> {
  const sittings = await pmqsSittings();
  if (!sittings || sittings.rows.length < 2) return null;

  let running = 0;
  const data = sittings.rows.map((r) => {
    running += r.n;
    return { label: shortDate(r.day), value: running };
  });
  const first = sittings.rows[0].day;

  return {
    id: "ledger-growth",
    kind: "line",
    title: `The ledger has logged ${running.toLocaleString("en-GB")} PMQs claims across ${sittings.rows.length} sittings since ${shortDate(first)}`,
    dek: "Running total of checkable claims recorded at Prime Minister's Questions.",
    data,
    unit: "claims (running total)",
    source: { name: "Claim Ledger, from Hansard", href: "/ledger" },
    asOf: sittings.asOf,
    note: sittings.rows.length >= 40 ? "Shows the 40 most recent sittings ingested." : undefined,
  };
}

interface PartyRow {
  party: string | null;
  n: number;
}

async function loadClaimsByParty(): Promise<{ rows: PartyRow[]; asOf: string }> {
  // Hansard drops the party on follow-up turns, so fill it from any other
  // claim by the same member before counting.
  const rows = await sql<PartyRow[]>`
    WITH member_party AS (
      SELECT DISTINCT ON (member_id) member_id, party
      FROM pooter.ledger_claims
      WHERE member_id IS NOT NULL AND party IS NOT NULL
      ORDER BY member_id, uttered_at DESC
    )
    SELECT COALESCE(c.party, mp.party) AS party, COUNT(*)::int AS n
    FROM pooter.ledger_claims c
    LEFT JOIN member_party mp ON mp.member_id = c.member_id
    WHERE c.context = 'pmqs'
    GROUP BY 1
    ORDER BY n DESC
  `;
  return { rows: rows.map((r) => ({ party: r.party, n: r.n })), asOf: new Date().toISOString() };
}

const getClaimsByParty = unstable_cache(loadClaimsByParty, ["charts-claims-by-party-v1"], {
  revalidate: 1800,
});

export async function claimsByPartyChart(): Promise<ChartSpec | null> {
  if (!process.env.DATABASE_URL) return null;
  let result: { rows: PartyRow[]; asOf: string };
  try {
    result = await getClaimsByParty();
  } catch {
    return null;
  }

  // Merge codes that map to the same party (Lab + Lab/Co-op).
  const totals = new Map<string, number>();
  for (const r of result.rows) {
    const name = r.party ? (PARTY_NAMES[r.party] ?? r.party) : "Unattributed";
    totals.set(name, (totals.get(name) ?? 0) + r.n);
  }
  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const total = ranked.reduce((s, [, n]) => s + n, 0);
  if (total === 0) return null;

  const top = ranked.slice(0, 6);
  const rest = ranked.slice(6).reduce((s, [, n]) => s + n, 0);
  const data: ChartPoint[] = top.map(([label, value]) => ({ label, value }));
  if (rest > 0) data.push({ label: "Other parties", value: rest });
  const [leadName, leadN] = ranked[0];

  return {
    id: "claims-by-party",
    kind: "bar",
    title: `${leadName} speakers made ${pct(leadN, total)}% of the checkable claims logged at PMQs`,
    dek: `All ${total.toLocaleString("en-GB")} PMQs claims on the Claim Ledger, by the speaker's party as printed in Hansard.`,
    data,
    unit: "claims",
    source: { name: "Claim Ledger, from Hansard", href: "/ledger" },
    asOf: result.asOf,
    note: "Counts claims, not their accuracy. The governing party answers most questions, so it speaks most.",
  };
}

// ── Registry ───────────────────────────────────────────────────────────────

export const CHARTS = {
  "feed-bias": feedBiasChart,
  "feed-category": feedCategoryChart,
  "claims-per-pmqs": claimsPerSittingChart,
  "claims-by-party": claimsByPartyChart,
  "ledger-growth": ledgerGrowthChart,
} as const satisfies Record<string, () => Promise<ChartSpec | null>>;

export type ChartId = keyof typeof CHARTS;

export function isChartId(value: string): value is ChartId {
  return Object.hasOwn(CHARTS, value);
}
