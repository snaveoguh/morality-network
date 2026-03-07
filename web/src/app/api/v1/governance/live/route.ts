import { NextResponse } from "next/server";
import { fetchAllProposals, fetchLiveProposals, type Proposal } from "@/lib/governance";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

type SourceKind = "dao" | "government" | "corporate";

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

    const proposals = scope === "all" ? await fetchAllProposals() : await fetchLiveProposals();

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

      if (Number.isFinite(cursor) && cursor > 0 && proposal.startTime >= cursor) {
        return false;
      }

      return true;
    });

    const sorted = filtered.sort((a, b) => b.startTime - a.startTime);
    const slice = sorted.slice(0, limit + 1);
    const hasMore = slice.length > limit;
    const page = hasMore ? slice.slice(0, limit) : slice;

    const nextCursor = hasMore ? page[page.length - 1]?.startTime ?? null : null;

    return NextResponse.json({
      data: page.map(normalizeProposal),
      meta: {
        scope,
        totalFiltered: filtered.length,
        limit,
        nextCursor,
        generatedAt: Date.now(),
      },
    });
  } catch (error) {
    console.error("governance/live API error", error);
    return NextResponse.json({ error: "failed to fetch governance live feed" }, { status: 500 });
  }
}
