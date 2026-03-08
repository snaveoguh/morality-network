import { NextResponse } from "next/server";
import {
  fetchAllProposals,
  fetchLiveProposals,
  fetchControversialProposals,
  type Proposal,
} from "@/lib/governance";

const GOVERNANCE_CACHE_TTL_MS = 60_000;

interface GovernanceCacheEntry {
  expiresAt: number;
  proposals: Proposal[];
}

const governanceCache = new Map<string, GovernanceCacheEntry>();

function normalizedFilter(rawFilter: string | null): "all" | "live" | "controversial" {
  if (rawFilter === "live" || rawFilter === "controversial") {
    return rawFilter;
  }
  return "all";
}

function cacheControlHeader(ttlMs: number): string {
  const sMaxAge = Math.max(1, Math.floor(ttlMs / 1000));
  const staleWhileRevalidate = sMaxAge * 2;
  return `public, s-maxage=${sMaxAge}, stale-while-revalidate=${staleWhileRevalidate}`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filter = normalizedFilter(searchParams.get("filter"));
  const now = Date.now();

  const cached = governanceCache.get(filter);
  if (cached && cached.expiresAt > now) {
    return NextResponse.json(
      {
        proposals: cached.proposals,
        total: cached.proposals.length,
        timestamp: now,
      },
      {
        headers: {
          "cache-control": cacheControlHeader(GOVERNANCE_CACHE_TTL_MS),
          "x-cache": "HIT",
        },
      }
    );
  }

  let proposals: Proposal[];

  switch (filter) {
    case "live":
      proposals = await fetchLiveProposals();
      break;
    case "controversial":
      proposals = await fetchControversialProposals();
      break;
    default:
      proposals = await fetchAllProposals();
  }

  governanceCache.set(filter, {
    expiresAt: now + GOVERNANCE_CACHE_TTL_MS,
    proposals,
  });

  return NextResponse.json(
    {
      proposals,
      total: proposals.length,
      timestamp: now,
    },
    {
      headers: {
        "cache-control": cacheControlHeader(GOVERNANCE_CACHE_TTL_MS),
        "x-cache": "MISS",
      },
    }
  );
}
