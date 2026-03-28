/**
 * governance/protocols.ts — Protocol-specific governance proposal fetchers.
 *
 * Uses the Tally API (free, no auth required for public data) as the primary
 * data source for governance proposals across multiple protocols.
 */

import type { GovernanceProposal, GovernanceProtocolConfig } from "./types";

const TALLY_API_URL = "https://api.tally.xyz/query";
const TALLY_API_KEY = process.env.TALLY_API_KEY ?? "";
const FETCH_TIMEOUT_MS = 10_000;

/* ═══════════════════════════  Tally GraphQL  ═══════════════════════════ */

const PROPOSALS_QUERY = `
  query GovernanceProposals($slug: String!, $chainId: ChainID!, $afterCursor: String) {
    proposals(
      sort: { field: START_BLOCK, order: DESC }
      pagination: { limit: 10, afterCursor: $afterCursor }
      chainId: $chainId
      governorSlug: $slug
    ) {
      nodes {
        ... on Proposal {
          id
          title
          description
          proposer {
            address
          }
          governorId
          statusChanges {
            type
          }
          voteStats {
            type
            votesCount
            votersCount
          }
          block {
            number
          }
          end {
            number
          }
          createdAt
        }
      }
      pageInfo {
        lastCursor
      }
    }
  }
`;

interface TallyProposalNode {
  id: string;
  title: string;
  description: string;
  proposer: { address: string } | null;
  statusChanges: Array<{ type: string }>;
  voteStats: Array<{
    type: string; // "FOR" | "AGAINST" | "ABSTAIN"
    votesCount: string;
    votersCount: string;
  }>;
  block: { number: string } | null;
  end: { number: string } | null;
  createdAt: string;
}

interface TallyResponse {
  data?: {
    proposals?: {
      nodes: TallyProposalNode[];
      pageInfo?: { lastCursor: string | null };
    };
  };
  errors?: Array<{ message: string }>;
}

function mapTallyStatus(statusChanges: Array<{ type: string }>): GovernanceProposal["status"] {
  if (!statusChanges || statusChanges.length === 0) return "pending";
  const latest = statusChanges[statusChanges.length - 1].type.toLowerCase();
  if (latest === "executed") return "executed";
  if (latest === "queued") return "queued";
  if (latest === "defeated" || latest === "failed") return "defeated";
  if (latest === "succeeded" || latest === "passed") return "succeeded";
  if (latest === "canceled" || latest === "cancelled") return "canceled";
  if (latest === "active") return "active";
  return "pending";
}

function getVoteCount(stats: TallyProposalNode["voteStats"], type: string): number {
  const match = stats.find((s) => s.type.toUpperCase() === type);
  return match ? parseFloat(match.votesCount) || 0 : 0;
}

/**
 * Fetch recent proposals from a single protocol via Tally API.
 */
export async function fetchTallyProposals(
  config: GovernanceProtocolConfig,
): Promise<GovernanceProposal[]> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  // Tally API key is optional but increases rate limits
  if (TALLY_API_KEY) {
    headers["Api-Key"] = TALLY_API_KEY;
  }

  try {
    const res = await fetch(TALLY_API_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        query: PROPOSALS_QUERY,
        variables: {
          slug: config.tallySlug,
          chainId: `eip155:${config.chainId}`,
        },
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!res.ok) {
      console.warn(`[governance] Tally API returned ${res.status} for ${config.id}`);
      return [];
    }

    const body = (await res.json()) as TallyResponse;

    if (body.errors?.length) {
      console.warn(`[governance] Tally GraphQL errors for ${config.id}:`, body.errors[0].message);
      return [];
    }

    const nodes = body.data?.proposals?.nodes ?? [];
    const now = Date.now();

    return nodes.map((node): GovernanceProposal => ({
      id: `${config.id}-${node.id}`,
      protocol: config.id,
      title: node.title || "Untitled Proposal",
      proposer: node.proposer?.address ?? "unknown",
      status: mapTallyStatus(node.statusChanges),
      forVotes: getVoteCount(node.voteStats, "FOR"),
      againstVotes: getVoteCount(node.voteStats, "AGAINST"),
      abstainVotes: getVoteCount(node.voteStats, "ABSTAIN"),
      createdBlock: parseInt(node.block?.number ?? "0", 10),
      endBlock: parseInt(node.end?.number ?? "0", 10),
      description: (node.description || "").slice(0, 500),
      treasuryImpactUsd: null, // Would need deeper analysis
      firstSeenAt: node.createdAt ? new Date(node.createdAt).getTime() : now,
      updatedAt: now,
    }));
  } catch (err) {
    console.warn(
      `[governance] Tally fetch failed for ${config.id}:`,
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

/**
 * Fetch proposals from all configured protocols.
 */
export async function fetchAllProtocolProposals(
  protocols: GovernanceProtocolConfig[],
): Promise<GovernanceProposal[]> {
  const results = await Promise.allSettled(
    protocols.map((p) => fetchTallyProposals(p)),
  );

  const proposals: GovernanceProposal[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      proposals.push(...result.value);
    }
  }

  return proposals;
}
