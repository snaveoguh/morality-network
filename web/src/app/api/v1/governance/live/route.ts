import { NextResponse } from "next/server";
import {
  fetchAllProposals,
  fetchGovernanceSocialSignals,
  fetchLiveProposals,
  type GovernanceSocialSignal,
  type Proposal,
} from "@/lib/governance";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const LIVE_GOVERNANCE_CACHE_TTL_MS = 45_000;

type SourceKind = "dao" | "government" | "corporate";

interface GovernanceLivePayload {
  data: ReturnType<typeof normalizeProposal>[];
  social: NormalizedGovernanceSocialSignal[];
  meta: {
    scope: string;
    totalFiltered: number;
    socialCount: number;
    limit: number;
    nextCursor: number | null;
    generatedAt: number;
  };
}

interface GovernanceLiveCacheEntry {
  expiresAt: number;
  payload: GovernanceLivePayload;
}

const governanceLiveCache = new Map<string, GovernanceLiveCacheEntry>();

interface NormalizedGovernanceSocialSignal {
  id: string;
  network: "farcaster";
  relatedDao: string | null;
  text: string;
  timestamp: number;
  link: string;
  channel: string | null;
  tags: string[];
  author: {
    fid: number;
    username: string;
    displayName: string;
    pfpUrl: string;
    verifiedAddresses: string[];
  };
  engagement: {
    likes: number;
    recasts: number;
    replies: number;
    score: number;
  };
}

function parseLimit(value: string | null): number {
  const parsed = Number(value ?? DEFAULT_LIMIT);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(parsed), MAX_LIMIT);
}

function parseCsv(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0);
}

function sourceKindFor(source: Proposal["source"]): SourceKind {
  if (source === "parliament" || source === "congress" || source === "eu" || source === "canada" || source === "australia") {
    return "government";
  }
  if (source === "sec") return "corporate";
  return "dao";
}

function normalizeProposal(proposal: Proposal) {
  const totalVotes = proposal.votesFor + proposal.votesAgainst + proposal.votesAbstain;

  return {
    proposalId: proposal.id,
    title: proposal.title,
    summary: proposal.body,
    source: proposal.source,
    sourceKind: sourceKindFor(proposal.source),
    status: proposal.status,
    organization: {
      name: proposal.dao,
      logo: proposal.daoLogo,
    },
    proposer: proposal.proposer,
    votes: {
      for: proposal.votesFor,
      against: proposal.votesAgainst,
      abstain: proposal.votesAbstain,
      total: totalVotes,
      quorum: proposal.quorum ?? null,
    },
    timing: {
      startTime: proposal.startTime,
      endTime: proposal.endTime,
    },
    tags: proposal.tags,
    link: proposal.link,
    chain: proposal.chain ?? null,
    proposalNumber: proposal.proposalNumber ?? null,
    isControversial: proposal.isControversial,
    metadata: {
      chamber: proposal.chamber ?? null,
      divisionId: proposal.divisionId ?? null,
      candidateSlug: proposal.candidateSlug ?? null,
      candidateSignatures: proposal.candidateSignatures ?? null,
      candidateThreshold: proposal.candidateThreshold ?? null,
      candidateIsPromotable: proposal.candidateIsPromotable ?? null,
      totalSupply: proposal.totalSupply ?? null,
      executionETA: proposal.executionETA ?? null,
      targets: proposal.targets ?? null,
      values: proposal.values ?? null,
      snapshotSpace: proposal.snapshotSpace ?? null,
    },
  };
}

function normalizeSocialSignal(
  signal: GovernanceSocialSignal
): NormalizedGovernanceSocialSignal {
  return {
    id: signal.id,
    network: signal.network,
    relatedDao: signal.relatedDao,
    text: signal.text,
    timestamp: signal.timestamp,
    link: signal.link,
    channel: signal.channel ?? null,
    tags: signal.tags,
    author: signal.author,
    engagement: signal.engagement,
  };
}

function cacheControlHeader(ttlMs: number): string {
  const sMaxAge = Math.max(1, Math.floor(ttlMs / 1000));
  const staleWhileRevalidate = sMaxAge * 2;
  return `public, s-maxage=${sMaxAge}, stale-while-revalidate=${staleWhileRevalidate}`;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const scope = (searchParams.get("scope") ?? "live").toLowerCase();
    const sourceFilter = parseCsv(searchParams.get("source"));
    const sourceKindFilter = parseCsv(searchParams.get("sourceKind"));
    const statusFilter = parseCsv(searchParams.get("status"));
    const tagFilter = parseCsv(searchParams.get("tag"));
    const limit = parseLimit(searchParams.get("limit"));
    const cursor = Number(searchParams.get("cursor") ?? "");

    if (searchParams.get("cursor") && (!Number.isFinite(cursor) || cursor <= 0)) {
      return NextResponse.json({ error: "invalid cursor (expected unix seconds)" }, { status: 400 });
    }

    const normalizedCursor = Number.isFinite(cursor) && cursor > 0 ? cursor : null;
    const cacheKey = JSON.stringify({
      scope,
      source: [...sourceFilter].sort(),
      sourceKind: [...sourceKindFilter].sort(),
      status: [...statusFilter].sort(),
      tag: [...tagFilter].sort(),
      limit,
      cursor: normalizedCursor,
    });
    const now = Date.now();

    const cached = governanceLiveCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return NextResponse.json(cached.payload, {
        headers: {
          "cache-control": cacheControlHeader(LIVE_GOVERNANCE_CACHE_TTL_MS),
          "x-cache": "HIT",
        },
      });
    }

    const [proposals, socialSignals] = await Promise.all([
      scope === "all" ? fetchAllProposals() : fetchLiveProposals(),
      fetchGovernanceSocialSignals(),
    ]);

    const filtered = proposals.filter((proposal) => {
      if (sourceFilter.length > 0 && !sourceFilter.includes(proposal.source.toLowerCase())) {
        return false;
      }

      const sourceKind = sourceKindFor(proposal.source);
      if (sourceKindFilter.length > 0 && !sourceKindFilter.includes(sourceKind)) {
        return false;
      }

      if (statusFilter.length > 0 && !statusFilter.includes(proposal.status.toLowerCase())) {
        return false;
      }

      if (tagFilter.length > 0) {
        const tags = proposal.tags.map((tag) => tag.toLowerCase());
        if (!tagFilter.some((tag) => tags.includes(tag))) {
          return false;
        }
      }

      if (normalizedCursor !== null && proposal.startTime >= normalizedCursor) {
        return false;
      }

      return true;
    });

    const sorted = filtered.sort((a, b) => b.startTime - a.startTime);
    const slice = sorted.slice(0, limit + 1);
    const hasMore = slice.length > limit;
    const page = hasMore ? slice.slice(0, limit) : slice;
    const filteredSocial = socialSignals
      .filter((signal) => {
        if (tagFilter.length > 0) {
          const tags = signal.tags.map((tag) => tag.toLowerCase());
          if (!tagFilter.some((tag) => tags.includes(tag))) {
            return false;
          }
        }

        if (normalizedCursor !== null && signal.timestamp >= normalizedCursor) {
          return false;
        }

        return true;
      });
    const social = filteredSocial.slice(0, Math.min(limit, 12));

    const nextCursor = hasMore ? page[page.length - 1]?.startTime ?? null : null;

    const payload: GovernanceLivePayload = {
      data: page.map(normalizeProposal),
      social: social.map(normalizeSocialSignal),
      meta: {
        scope,
        totalFiltered: filtered.length,
        socialCount: filteredSocial.length,
        limit,
        nextCursor,
        generatedAt: now,
      },
    };

    governanceLiveCache.set(cacheKey, {
      expiresAt: now + LIVE_GOVERNANCE_CACHE_TTL_MS,
      payload,
    });

    return NextResponse.json(payload, {
      headers: {
        "cache-control": cacheControlHeader(LIVE_GOVERNANCE_CACHE_TTL_MS),
        "x-cache": "MISS",
      },
    });
  } catch (error) {
    console.error("governance/live API error", error);
    return NextResponse.json({ error: "failed to fetch governance live feed" }, { status: 500 });
  }
}
