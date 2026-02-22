// DAO Governance Fetcher
// Pulls live proposals from: Snapshot (off-chain), Nouns (onchain), Nouns Candidates, UK Parliament

import { fetchNounsProposals, type NounsProposal } from "./nouns";
import {
  fetchCandidateProposals,
  type CandidateProposal,
} from "./nouns-candidates";
import { fetchAllDivisions, type ParliamentDivision } from "./parliament";

// ============================================================================
// TYPES
// ============================================================================

export interface Proposal {
  id: string;
  title: string;
  body: string; // truncated description
  fullBody?: string; // full description for detail view
  proposer: string; // ETH address — tippable!
  dao: string; // display name
  daoLogo: string;
  status:
    | "active"
    | "pending"
    | "closed"
    | "defeated"
    | "succeeded"
    | "queued"
    | "executed"
    | "candidate";
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
  quorum?: number;
  startTime: number; // unix timestamp
  endTime: number; // unix timestamp
  link: string; // external link to vote
  source: "snapshot" | "onchain" | "parliament";
  isControversial: boolean; // close vote or high engagement
  chain?: string;
  proposalNumber?: number; // numeric proposal ID for display
  totalSupply?: number; // total token supply at snapshot (for quorum context)
  executionETA?: number; // timestamp for queued proposals
  targets?: string[]; // contract addresses being called
  values?: string[]; // ETH values in each call
  snapshotSpace?: string; // snapshot space id for voting link
  // Candidate-specific fields
  candidateSlug?: string;
  candidateSignatures?: number;
  candidateThreshold?: number;
  candidateIsPromotable?: boolean;
  // Parliament-specific fields
  chamber?: string; // "Commons" | "Lords"
  divisionId?: number;
}

// ============================================================================
// SNAPSHOT — Off-chain governance
// ============================================================================

const SNAPSHOT_GQL = "https://hub.snapshot.org/graphql";

const SNAPSHOT_SPACES = [
  {
    id: "ens.eth",
    name: "ENS DAO",
    logo: "https://cdn.stamp.fyi/space/ens.eth?w=64",
  },
  {
    id: "uniswapgovernance.eth",
    name: "Uniswap",
    logo: "https://cdn.stamp.fyi/space/uniswapgovernance.eth?w=64",
  },
  {
    id: "opcollective.eth",
    name: "Optimism",
    logo: "https://cdn.stamp.fyi/space/opcollective.eth?w=64",
  },
  {
    id: "aave.eth",
    name: "Aave",
    logo: "https://cdn.stamp.fyi/space/aave.eth?w=64",
  },
  {
    id: "safe.eth",
    name: "Safe",
    logo: "https://cdn.stamp.fyi/space/safe.eth?w=64",
  },
  {
    id: "gitcoindao.eth",
    name: "Gitcoin",
    logo: "https://cdn.stamp.fyi/space/gitcoindao.eth?w=64",
  },
  {
    id: "arbitrumfoundation.eth",
    name: "Arbitrum",
    logo: "https://cdn.stamp.fyi/space/arbitrumfoundation.eth?w=64",
  },
  {
    id: "lido-snapshot.eth",
    name: "Lido",
    logo: "https://cdn.stamp.fyi/space/lido-snapshot.eth?w=64",
  },
];

const SNAPSHOT_QUERY = `
  query Proposals($spaces: [String!], $now: Int!) {
    active: proposals(
      first: 30,
      skip: 0,
      where: { space_in: $spaces, state: "active" },
      orderBy: "created",
      orderDirection: desc
    ) {
      id
      title
      body
      author
      space { id name }
      state
      scores_total
      scores
      choices
      quorum
      start
      end
      link
      votes
    }
    pending: proposals(
      first: 10,
      skip: 0,
      where: { space_in: $spaces, state: "pending" },
      orderBy: "created",
      orderDirection: desc
    ) {
      id
      title
      body
      author
      space { id name }
      state
      scores_total
      scores
      choices
      quorum
      start
      end
      link
      votes
    }
    closed: proposals(
      first: 20,
      skip: 0,
      where: { space_in: $spaces, start_gte: $now },
      orderBy: "end",
      orderDirection: desc
    ) {
      id
      title
      body
      author
      space { id name }
      state
      scores_total
      scores
      choices
      quorum
      start
      end
      link
      votes
    }
  }
`;

// Single proposal query for detail view
const SNAPSHOT_SINGLE_QUERY = `
  query Proposal($id: String!) {
    proposal(id: $id) {
      id
      title
      body
      author
      space { id name }
      state
      scores_total
      scores
      choices
      quorum
      start
      end
      link
      votes
    }
  }
`;

// Votes for a single proposal
const SNAPSHOT_VOTES_QUERY = `
  query Votes($proposalId: String!) {
    votes(
      first: 100,
      where: { proposal: $proposalId },
      orderBy: "vp",
      orderDirection: desc
    ) {
      id
      voter
      choice
      vp
      reason
      created
    }
  }
`;

function mapSnapshotProposal(p: any): Proposal {
  const spaceInfo = SNAPSHOT_SPACES.find((s) => s.id === p.space.id);
  const scores = p.scores || [];
  const choices = (p.choices || []).map((c: string) => c.toLowerCase());

  const forIdx = choices.findIndex(
    (c: string) => c.includes("for") || c.includes("yes") || c === "yae"
  );
  const againstIdx = choices.findIndex(
    (c: string) => c.includes("against") || c.includes("no") || c === "nay"
  );
  const abstainIdx = choices.findIndex((c: string) => c.includes("abstain"));

  const votesFor = forIdx >= 0 ? scores[forIdx] || 0 : scores[0] || 0;
  const votesAgainst =
    againstIdx >= 0 ? scores[againstIdx] || 0 : scores[1] || 0;
  const votesAbstain = abstainIdx >= 0 ? scores[abstainIdx] || 0 : 0;

  const total = votesFor + votesAgainst;
  const isControversial =
    total > 0 &&
    (Math.abs(votesFor - votesAgainst) / total < 0.2 || p.votes > 500);

  return {
    id: p.id,
    title: p.title,
    body: p.body?.slice(0, 300) || "",
    fullBody: p.body || "",
    proposer: p.author,
    dao: spaceInfo?.name || p.space.name || p.space.id,
    daoLogo:
      spaceInfo?.logo || `https://cdn.stamp.fyi/space/${p.space.id}?w=64`,
    status: mapStatus(p.state),
    votesFor,
    votesAgainst,
    votesAbstain,
    quorum: p.quorum || undefined,
    startTime: p.start,
    endTime: p.end,
    link: p.link || `https://snapshot.org/#/${p.space.id}/proposal/${p.id}`,
    source: "snapshot" as const,
    isControversial,
    snapshotSpace: p.space.id,
  };
}

async function fetchSnapshotProposals(): Promise<Proposal[]> {
  try {
    const now = Math.floor(Date.now() / 1000);
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60;

    const res = await fetch(SNAPSHOT_GQL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: SNAPSHOT_QUERY,
        variables: {
          spaces: SNAPSHOT_SPACES.map((s) => s.id),
          now: thirtyDaysAgo,
        },
      }),
      next: { revalidate: 120 },
    });

    if (!res.ok) return [];
    const json = await res.json();
    const data = json.data;
    if (!data) return [];

    const allRaw = [
      ...(data.active || []),
      ...(data.pending || []),
      ...(data.closed || []).filter((p: any) => p.state === "closed"),
    ];

    const seen = new Set<string>();
    const unique = allRaw.filter((p: any) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });

    return unique.map(mapSnapshotProposal);
  } catch (error) {
    console.error("Snapshot fetch failed:", error);
    return [];
  }
}

// ============================================================================
// NOUNS ONCHAIN — Convert NounsProposal to unified Proposal
// ============================================================================

function mapNounsStatus(status: string): Proposal["status"] {
  switch (status) {
    case "Active":
    case "ObjectionPeriod":
    case "Updatable":
      return "active";
    case "Pending":
      return "pending";
    case "Succeeded":
      return "succeeded";
    case "Queued":
      return "queued";
    case "Executed":
      return "executed";
    case "Defeated":
    case "Canceled":
    case "Expired":
    case "Vetoed":
      return "defeated";
    default:
      return "closed";
  }
}

function convertNounsToProposal(p: NounsProposal): Proposal {
  const total = p.forVotes + p.againstVotes;
  const isControversial =
    total > 0 && Math.abs(p.forVotes - p.againstVotes) / total < 0.2;

  return {
    id: `nouns-${p.id}`,
    title: p.title,
    body: p.description?.slice(0, 300) || "",
    fullBody: p.description || "",
    proposer: p.proposer,
    dao: "Nouns DAO",
    daoLogo: "https://noun.pics/1",
    status: mapNounsStatus(p.status),
    votesFor: p.forVotes,
    votesAgainst: p.againstVotes,
    votesAbstain: p.abstainVotes,
    quorum: p.quorumVotes,
    startTime: 0,
    endTime: 0,
    link: `https://nouns.wtf/vote/${p.id}`,
    source: "onchain",
    isControversial,
    chain: "ethereum",
    proposalNumber: p.id,
    totalSupply: p.totalSupply,
  };
}

// ============================================================================
// NOUNS CANDIDATES — Convert CandidateProposal to unified Proposal
// ============================================================================

function convertCandidateToProposal(c: CandidateProposal): Proposal {
  return {
    id: `candidate-${c.proposer}-${c.slug}`,
    title: c.title,
    body: c.description?.slice(0, 300) || "",
    fullBody: c.description || "",
    proposer: c.proposer,
    dao: "Nouns DAO",
    daoLogo: "https://noun.pics/1",
    status: "candidate",
    votesFor: c.signatureCount,
    votesAgainst: 0,
    votesAbstain: 0,
    quorum: c.requiredThreshold,
    startTime: c.createdTimestamp,
    endTime: 0,
    link: `https://nouns.wtf/candidates/${encodeURIComponent(c.slug)}`,
    source: "onchain",
    isControversial: false,
    chain: "ethereum",
    candidateSlug: c.slug,
    candidateSignatures: c.signatureCount,
    candidateThreshold: c.requiredThreshold,
    candidateIsPromotable: c.isPromotable,
  };
}

// ============================================================================
// UK PARLIAMENT — Convert ParliamentDivision to unified Proposal
// ============================================================================

function convertDivisionToProposal(d: ParliamentDivision): Proposal {
  const total = d.ayeCount + d.noeCount;
  const isControversial =
    total > 0 && Math.abs(d.ayeCount - d.noeCount) / total < 0.2;

  return {
    id: `parliament-${d.house.toLowerCase()}-${d.id}`,
    title: d.title,
    body: "",
    proposer: "",
    dao: "UK Parliament",
    daoLogo: "",
    status: "closed",
    votesFor: d.ayeCount,
    votesAgainst: d.noeCount,
    votesAbstain: d.abstentionCount,
    startTime: Math.floor(new Date(d.date).getTime() / 1000),
    endTime: Math.floor(new Date(d.date).getTime() / 1000),
    link:
      d.house === "Commons"
        ? `https://votes.parliament.uk/votes/commons/division/${d.id}`
        : `https://votes.parliament.uk/votes/lords/division/${d.id}`,
    source: "parliament",
    isControversial,
    chamber: d.house,
    divisionId: d.id,
  };
}

// ============================================================================
// SINGLE PROPOSAL DETAIL — For /proposals/[id] page
// ============================================================================

export interface SnapshotVote {
  voter: string;
  support: number;
  votes: number;
  reason: string;
}

export interface ProposalDetail extends Proposal {
  onchainVotes: SnapshotVote[];
}

export async function fetchProposalById(
  proposalId: string
): Promise<ProposalDetail | null> {
  try {
    const [proposalRes, votesRes] = await Promise.all([
      fetch(SNAPSHOT_GQL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: SNAPSHOT_SINGLE_QUERY,
          variables: { id: proposalId },
        }),
        next: { revalidate: 60 },
      }),
      fetch(SNAPSHOT_GQL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: SNAPSHOT_VOTES_QUERY,
          variables: { proposalId },
        }),
        next: { revalidate: 60 },
      }),
    ]);

    if (!proposalRes.ok) return null;
    const proposalJson = await proposalRes.json();
    const p = proposalJson.data?.proposal;
    if (!p) return null;

    const base = mapSnapshotProposal(p);

    let onchainVotes: SnapshotVote[] = [];
    if (votesRes.ok) {
      const votesJson = await votesRes.json();
      const rawVotes = votesJson.data?.votes || [];
      onchainVotes = rawVotes.map((v: any) => ({
        voter: v.voter || "",
        support: typeof v.choice === "number" ? v.choice : 1,
        votes: v.vp || 0,
        reason: v.reason || "",
      }));
    }

    return { ...base, onchainVotes };
  } catch (error) {
    console.error("Proposal detail fetch failed:", error);
    return null;
  }
}

// Keep old export name for backwards compat
export { fetchProposalById as fetchNounsProposalById };
export type {
  SnapshotVote as NounsVote,
  ProposalDetail as NounsProposalDetail,
};

// ============================================================================
// AGGREGATOR — Fetch all sources, merge, sort, dedupe
// ============================================================================

export async function fetchAllProposals(): Promise<Proposal[]> {
  const results = await Promise.allSettled([
    fetchSnapshotProposals(),
    fetchNounsProposals(10).then((ps) => ps.map(convertNounsToProposal)),
    fetchCandidateProposals().then((cs) => cs.map(convertCandidateToProposal)),
    fetchAllDivisions().then((ds) => ds.map(convertDivisionToProposal)),
  ]);

  const all: Proposal[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      all.push(...result.value);
    }
  }

  // Sort: active/candidate first, then by end time, then recent
  all.sort((a, b) => {
    const statusOrder: Record<string, number> = {
      active: 0,
      candidate: 1,
      pending: 2,
      queued: 3,
      succeeded: 4,
      closed: 5,
      executed: 6,
      defeated: 7,
    };
    const aOrder = statusOrder[a.status] ?? 5;
    const bOrder = statusOrder[b.status] ?? 5;
    if (aOrder !== bOrder) return aOrder - bOrder;

    if (a.status === "active" && b.status === "active") {
      return a.endTime - b.endTime;
    }

    return b.startTime - a.startTime;
  });

  return all;
}

// Get only active/pending proposals (for feed highlight)
export async function fetchLiveProposals(): Promise<Proposal[]> {
  const all = await fetchAllProposals();
  return all.filter((p) => p.status === "active" || p.status === "pending");
}

// Get controversial proposals (close votes)
export async function fetchControversialProposals(): Promise<Proposal[]> {
  const all = await fetchAllProposals();
  return all.filter((p) => p.isControversial);
}

// ============================================================================
// HELPERS
// ============================================================================

function mapStatus(state: string): Proposal["status"] {
  switch (state?.toLowerCase()) {
    case "active":
      return "active";
    case "pending":
      return "pending";
    case "closed":
      return "closed";
    case "defeated":
      return "defeated";
    case "succeeded":
      return "succeeded";
    case "queued":
      return "queued";
    case "executed":
      return "executed";
    default:
      return "closed";
  }
}

export function getTimeRemaining(endTime: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = endTime - now;

  if (diff <= 0) return "Ended";
  if (diff < 3600) return `${Math.floor(diff / 60)}m left`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h left`;
  return `${Math.floor(diff / 86400)}d left`;
}

export function getVotePercentage(
  votesFor: number,
  votesAgainst: number
): { forPct: number; againstPct: number } {
  const total = votesFor + votesAgainst;
  if (total === 0) return { forPct: 50, againstPct: 50 };
  return {
    forPct: Math.round((votesFor / total) * 100),
    againstPct: Math.round((votesAgainst / total) * 100),
  };
}
