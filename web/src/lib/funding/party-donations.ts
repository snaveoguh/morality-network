import "server-only";

// Funding module — party donations aggregator.
// Fetches recent accepted donations to political parties (et=pp) from the
// Electoral Commission register and aggregates per-party 12-month totals.
// Registry-based only: every row is as the register states it; nothing inferred.

import { unstable_cache } from "next/cache";
import { searchDonations, donationToEdge } from "./electoral-commission";
import type { FundingEdge } from "./types";

export interface PartyTotal {
  party: string;
  total: number;
  count: number;
}

export interface PartyDonationsResult {
  /** Top-50 recent donations, sorted by accepted date descending. */
  recentDonations: FundingEdge[];
  /** Per-party totals for the trailing 12 months, sorted by total descending. */
  partyTotals: PartyTotal[];
  /** ISO date the window starts (12 months ago). */
  windowFrom: string;
  /** ISO date the window ends (today). */
  windowTo: string;
}

/**
 * Aggregate donations into per-party totals within a 12-month ISO date window.
 * Pure function — no I/O. Exported so the test file can exercise it directly.
 *
 * @param edges  Funding edges to aggregate (any document kind; non-EC edges are included).
 * @param nowIso ISO date string for "today" (YYYY-MM-DD), used to compute the 12-month cutoff.
 */
export function aggregateDonations(
  edges: FundingEdge[],
  nowIso: string,
): PartyTotal[] {
  // Compute 12-month window start: same day, prior year.
  const now = new Date(nowIso);
  const windowStart = new Date(now);
  windowStart.setFullYear(windowStart.getFullYear() - 1);
  const windowStartIso = windowStart.toISOString().slice(0, 10);

  const totals = new Map<string, { total: number; count: number }>();

  for (const edge of edges) {
    // Filter to donations within the trailing 12-month window.
    if (!edge.date || edge.date < windowStartIso || edge.date > nowIso) continue;

    const party = edge.to.name || "(not stated in register)";
    const amount = edge.amountGbp ?? 0;
    const existing = totals.get(party) ?? { total: 0, count: 0 };
    totals.set(party, { total: existing.total + amount, count: existing.count + 1 });
  }

  return Array.from(totals.entries())
    .map(([party, { total, count }]) => ({ party, total, count }))
    .sort((a, b) => b.total - a.total);
}

async function fetchRecentPartyDonationsUncached(): Promise<PartyDonationsResult> {
  const nowIso = new Date().toISOString().slice(0, 10);
  // 12-month window: same-day last year → today.
  const windowFrom = (() => {
    const d = new Date(nowIso);
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().slice(0, 10);
  })();

  try {
    // Fetch the most recent 100 accepted donations to political parties (et=pp).
    const records = await searchDonations({
      entityType: "pp",
      acceptedFrom: windowFrom,
      acceptedTo: nowIso,
      rows: 100,
    });

    const edges = records.map(donationToEdge);

    // Recent list: top 50 by date descending (searchDonations already returns
    // sort=AcceptedDate&order=desc, so the first 50 are the most recent).
    const recentDonations = edges.slice(0, 50);

    // Per-party 12-month totals.
    const partyTotals = aggregateDonations(edges, nowIso);

    return { recentDonations, partyTotals, windowFrom, windowTo: nowIso };
  } catch (error) {
    console.error("[funding/party-donations] fetch failed:", error);
    return {
      recentDonations: [],
      partyTotals: [],
      windowFrom,
      windowTo: nowIso,
    };
  }
}

/**
 * Fetch and aggregate recent Electoral Commission donations to political parties.
 * Returns the top-50 most recent donations and per-party 12-month totals.
 * Cached for 6 hours; returns empty results on registry downtime.
 */
export const getRecentPartyDonations = unstable_cache(
  fetchRecentPartyDonationsUncached,
  ["funding-party-donations-v1"],
  { revalidate: 21_600 }, // 6h
);
