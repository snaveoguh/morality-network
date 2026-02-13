// DAO Governance Fetcher
// Pulls live proposals from Snapshot (off-chain) and onchain Governor contracts via The Graph

export interface Proposal {
  id: string;
  title: string;
  body: string; // truncated description
  proposer: string; // ETH address — tippable!
  dao: string; // display name
  daoLogo: string;
  status: "active" | "pending" | "closed" | "defeated" | "succeeded" | "queued" | "executed";
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
  quorum?: number;
  startTime: number; // unix timestamp
  endTime: number; // unix timestamp
  link: string; // external link to vote
  source: "snapshot" | "onchain";
  isControversial: boolean; // close vote or high engagement
  chain?: string;
}

// ============================================================================
// SNAPSHOT — Off-chain governance (ENS, Aave, Gitcoin, Safe, etc.)
// ============================================================================

const SNAPSHOT_GQL = "https://hub.snapshot.org/graphql";

const SNAPSHOT_SPACES = [
  { id: "ens.eth", name: "ENS DAO", logo: "https://cdn.stamp.fyi/space/ens.eth?w=64" },
  { id: "uniswapgovernance.eth", name: "Uniswap", logo: "https://cdn.stamp.fyi/space/uniswapgovernance.eth?w=64" },
  { id: "opcollective.eth", name: "Optimism", logo: "https://cdn.stamp.fyi/space/opcollective.eth?w=64" },
  { id: "aave.eth", name: "Aave", logo: "https://cdn.stamp.fyi/space/aave.eth?w=64" },
  { id: "safe.eth", name: "Safe", logo: "https://cdn.stamp.fyi/space/safe.eth?w=64" },
  { id: "gitcoindao.eth", name: "Gitcoin", logo: "https://cdn.stamp.fyi/space/gitcoindao.eth?w=64" },
  { id: "arbitrumfoundation.eth", name: "Arbitrum", logo: "https://cdn.stamp.fyi/space/arbitrumfoundation.eth?w=64" },
  { id: "lido-snapshot.eth", name: "Lido", logo: "https://cdn.stamp.fyi/space/lido-snapshot.eth?w=64" },
];

const SNAPSHOT_QUERY = `
  query Proposals($spaces: [String!], $now: Int!) {
    active: proposals(
      first: 20,
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
      first: 10,
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
      next: { revalidate: 120 }, // cache 2 min
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

    // Deduplicate by id
    const seen = new Set<string>();
    const unique = allRaw.filter((p: any) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });

    return unique.map((p: any) => {
      const spaceInfo = SNAPSHOT_SPACES.find((s) => s.id === p.space.id);
      const scores = p.scores || [];
      const choices = (p.choices || []).map((c: string) => c.toLowerCase());

      // Try to map For/Against/Abstain from choices
      const forIdx = choices.findIndex((c: string) => c.includes("for") || c.includes("yes") || c === "yae");
      const againstIdx = choices.findIndex((c: string) => c.includes("against") || c.includes("no") || c === "nay");
      const abstainIdx = choices.findIndex((c: string) => c.includes("abstain"));

      const votesFor = forIdx >= 0 ? scores[forIdx] || 0 : scores[0] || 0;
      const votesAgainst = againstIdx >= 0 ? scores[againstIdx] || 0 : scores[1] || 0;
      const votesAbstain = abstainIdx >= 0 ? scores[abstainIdx] || 0 : 0;

      const total = votesFor + votesAgainst;
      const isControversial =
        total > 0 &&
        (Math.abs(votesFor - votesAgainst) / total < 0.2 || p.votes > 500);

      return {
        id: p.id,
        title: p.title,
        body: p.body?.slice(0, 200) || "",
        proposer: p.author,
        dao: spaceInfo?.name || p.space.name || p.space.id,
        daoLogo: spaceInfo?.logo || `https://cdn.stamp.fyi/space/${p.space.id}?w=64`,
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
      };
    });
  } catch (error) {
    console.error("Snapshot fetch failed:", error);
    return [];
  }
}

// ============================================================================
// NOUNS DAO — Onchain governance via The Graph
// ============================================================================

const NOUNS_SUBGRAPH =
  "https://api.thegraph.com/subgraphs/name/nounsdao/nouns-subgraph";

const NOUNS_QUERY = `
  query {
    proposals(first: 15, orderBy: createdTimestamp, orderDirection: desc) {
      id
      title
      description
      proposer { id }
      status
      forVotes
      againstVotes
      abstainVotes
      quorumVotes
      startBlock
      endBlock
      createdTimestamp
      executionETA
    }
  }
`;

async function fetchNounsProposals(): Promise<Proposal[]> {
  try {
    const res = await fetch(NOUNS_SUBGRAPH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: NOUNS_QUERY }),
      next: { revalidate: 120 },
    });

    if (!res.ok) return [];
    const json = await res.json();
    const proposals = json.data?.proposals || [];

    return proposals.map((p: any) => {
      const votesFor = parseInt(p.forVotes || "0");
      const votesAgainst = parseInt(p.againstVotes || "0");
      const total = votesFor + votesAgainst;
      const isControversial =
        total > 0 && Math.abs(votesFor - votesAgainst) / total < 0.2;

      return {
        id: `nouns-${p.id}`,
        title: p.title || `Nouns Proposal #${p.id}`,
        body: (p.description || "").slice(0, 200),
        proposer: p.proposer?.id || "0x0000000000000000000000000000000000000000",
        dao: "Nouns DAO",
        daoLogo: "https://nouns.wtf/static/media/noggles.7644bfd0.svg",
        status: mapOnchainStatus(p.status),
        votesFor,
        votesAgainst,
        votesAbstain: parseInt(p.abstainVotes || "0"),
        quorum: parseInt(p.quorumVotes || "0"),
        startTime: parseInt(p.createdTimestamp || "0"),
        endTime: parseInt(p.createdTimestamp || "0") + 7 * 24 * 60 * 60, // ~7 day voting
        link: `https://nouns.wtf/vote/${p.id}`,
        source: "onchain" as const,
        isControversial,
        chain: "ethereum",
      };
    });
  } catch (error) {
    console.error("Nouns fetch failed:", error);
    return [];
  }
}

// ============================================================================
// COMPOUND — Onchain governance via The Graph
// ============================================================================

const COMPOUND_SUBGRAPH =
  "https://api.thegraph.com/subgraphs/name/arr00/compound-governance-2";

const COMPOUND_QUERY = `
  query {
    proposals(first: 10, orderBy: startBlock, orderDirection: desc) {
      id
      description
      proposer { id }
      status
      forVotes
      againstVotes
      abstainVotes
      startBlock
      endBlock
    }
  }
`;

async function fetchCompoundProposals(): Promise<Proposal[]> {
  try {
    const res = await fetch(COMPOUND_SUBGRAPH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: COMPOUND_QUERY }),
      next: { revalidate: 120 },
    });

    if (!res.ok) return [];
    const json = await res.json();
    const proposals = json.data?.proposals || [];

    return proposals.map((p: any) => {
      const desc = p.description || "";
      const title = desc.split("\n")[0]?.slice(0, 120) || `Compound Proposal #${p.id}`;
      const votesFor = parseFloat(p.forVotes || "0") / 1e18;
      const votesAgainst = parseFloat(p.againstVotes || "0") / 1e18;
      const total = votesFor + votesAgainst;

      return {
        id: `compound-${p.id}`,
        title,
        body: desc.slice(0, 200),
        proposer: p.proposer?.id || "0x0000000000000000000000000000000000000000",
        dao: "Compound",
        daoLogo: "https://cdn.stamp.fyi/space/comp-vote.eth?w=64",
        status: mapOnchainStatus(p.status),
        votesFor: Math.round(votesFor),
        votesAgainst: Math.round(votesAgainst),
        votesAbstain: Math.round(parseFloat(p.abstainVotes || "0") / 1e18),
        startTime: 0,
        endTime: 0,
        link: `https://compound.finance/governance/proposals/${p.id}`,
        source: "onchain" as const,
        isControversial: total > 0 && Math.abs(votesFor - votesAgainst) / total < 0.2,
        chain: "ethereum",
      };
    });
  } catch (error) {
    console.error("Compound fetch failed:", error);
    return [];
  }
}

// ============================================================================
// AGGREGATOR — Fetch all sources, merge, sort, dedupe
// ============================================================================

export async function fetchAllProposals(): Promise<Proposal[]> {
  const results = await Promise.allSettled([
    fetchSnapshotProposals(),
    fetchNounsProposals(),
    fetchCompoundProposals(),
  ]);

  const all: Proposal[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      all.push(...result.value);
    }
  }

  // Sort: active first, then by end time (soonest ending first), then recent
  all.sort((a, b) => {
    const statusOrder = { active: 0, pending: 1, queued: 2, succeeded: 3, closed: 4, executed: 5, defeated: 6 };
    const aOrder = statusOrder[a.status] ?? 4;
    const bOrder = statusOrder[b.status] ?? 4;
    if (aOrder !== bOrder) return aOrder - bOrder;

    // Active proposals: soonest ending first
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

function mapOnchainStatus(status: string): Proposal["status"] {
  switch (status?.toUpperCase()) {
    case "ACTIVE":
      return "active";
    case "PENDING":
      return "pending";
    case "CANCELED":
    case "DEFEATED":
    case "EXPIRED":
      return "defeated";
    case "SUCCEEDED":
      return "succeeded";
    case "QUEUED":
      return "queued";
    case "EXECUTED":
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
