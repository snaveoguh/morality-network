// DAO Governance Fetcher
// Pulls live proposals from: Snapshot, Nouns, Tally, UK/US/EU/Canada/Australia Parliaments, SEC

import { createPublicClient, http } from "viem";
import {
  fetchLilNounsDelegationEvents,
  fetchLilNounsProposals,
  mainnetPublicClient,
  fetchNounsDelegationEvents,
  fetchNounsProposals,
  type NounsDelegationEvent,
  type NounsProposal,
} from "./nouns";
import {
  fetchCandidateProposals,
  type CandidateProposal,
} from "./nouns-candidates";
import {
  fetchPopularCasts,
  fetchTrendingCasts,
  lookupUser,
  type Cast,
} from "./farcaster";
import { fetchAllDivisions, type ParliamentDivision } from "./parliament";
import { getDaoPredictionKey } from "./proposal-entity";
import { getPredictionMarketChain, getPredictionMarketRpcUrl } from "./rpc-urls";
import { loadTtlValue, type TtlCacheEntry } from "./ttl-cache";
import { fetchWithRetry } from "./fetch-utils";

// ============================================================================
// CONSTANTS
// ============================================================================

const PROPOSAL_CACHE_TTL_MS = 60_000;
const GOVERNANCE_SOCIAL_CACHE_TTL_MS = 120_000;
const RECENT_GOVERNANCE_ACTIVITY_WINDOW_SECONDS = 72 * 60 * 60;
const GOVERNANCE_SOCIAL_WINDOW_SECONDS = 7 * 24 * 60 * 60;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const DEFAULT_GOVERNANCE_FARCASTER_USERNAMES = [
  "nouns",
  "nounsquare",
  "houseofnouns",
];
const proposalCache = new Map<string, TtlCacheEntry<Proposal[]>>();
const governanceSocialCache = new Map<
  string,
  TtlCacheEntry<GovernanceSocialSignal[]>
>();
const predictionMarketPublicClient = createPublicClient({
  chain: getPredictionMarketChain(),
  transport: http(getPredictionMarketRpcUrl(), { timeout: 10_000 }),
});

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
  source:
    | "snapshot"
    | "onchain"
    | "parliament"
    | "tally"
    | "congress"
    | "eu"
    | "canada"
    | "australia"
    | "sec"
    | "hyperliquid";
  isControversial: boolean; // close vote or high engagement
  tags: string[]; // auto-derived tags for filtering
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

export interface GovernanceSocialSignal {
  id: string;
  network: "farcaster";
  relatedDao: string | null;
  author: {
    fid: number;
    username: string;
    displayName: string;
    pfpUrl: string;
    verifiedAddresses: string[];
  };
  text: string;
  timestamp: number;
  link: string;
  channel?: string;
  tags: string[];
  engagement: {
    likes: number;
    recasts: number;
    replies: number;
    score: number;
  };
}

// ============================================================================
// SNAPSHOT — Off-chain governance
// ============================================================================

const SNAPSHOT_GQL = "https://hub.snapshot.org/graphql";

const SNAPSHOT_SPACES = [
  // ── Blue-chip DeFi ──────────────────────────────────────────────────
  { id: "ens.eth", name: "ENS DAO", logo: "https://cdn.stamp.fyi/space/ens.eth?w=64", tags: ["dao", "identity"] },
  { id: "uniswapgovernance.eth", name: "Uniswap", logo: "https://cdn.stamp.fyi/space/uniswapgovernance.eth?w=64", tags: ["dao", "defi"] },
  { id: "aave.eth", name: "Aave", logo: "https://cdn.stamp.fyi/space/aave.eth?w=64", tags: ["dao", "defi"] },
  { id: "safe.eth", name: "Safe", logo: "https://cdn.stamp.fyi/space/safe.eth?w=64", tags: ["dao", "multisig"] },
  { id: "lido-snapshot.eth", name: "Lido", logo: "https://cdn.stamp.fyi/space/lido-snapshot.eth?w=64", tags: ["dao", "staking"] },
  { id: "gitcoindao.eth", name: "Gitcoin", logo: "https://cdn.stamp.fyi/space/gitcoindao.eth?w=64", tags: ["dao", "grants"] },
  { id: "curvefi.eth", name: "Curve", logo: "https://cdn.stamp.fyi/space/curvefi.eth?w=64", tags: ["dao", "defi"] },
  { id: "balancer.eth", name: "Balancer", logo: "https://cdn.stamp.fyi/space/balancer.eth?w=64", tags: ["dao", "defi"] },
  { id: "sushi.eth", name: "SushiSwap", logo: "https://cdn.stamp.fyi/space/sushi.eth?w=64", tags: ["dao", "defi"] },
  { id: "compoundgov.eth", name: "Compound", logo: "https://cdn.stamp.fyi/space/compoundgov.eth?w=64", tags: ["dao", "defi"] },
  { id: "makerdao.eth", name: "MakerDAO", logo: "https://cdn.stamp.fyi/space/makerdao.eth?w=64", tags: ["dao", "defi", "stablecoin"] },
  { id: "synthetix.eth", name: "Synthetix", logo: "https://cdn.stamp.fyi/space/synthetix.eth?w=64", tags: ["dao", "defi"] },
  { id: "1inch.eth", name: "1inch", logo: "https://cdn.stamp.fyi/space/1inch.eth?w=64", tags: ["dao", "defi"] },
  { id: "dydxgov.eth", name: "dYdX", logo: "https://cdn.stamp.fyi/space/dydxgov.eth?w=64", tags: ["dao", "defi"] },

  // ── Yield / Perpetuals / Lending ────────────────────────────────────
  { id: "gmx.eth", name: "GMX", logo: "https://cdn.stamp.fyi/space/gmx.eth?w=64", tags: ["dao", "defi", "perps"] },
  { id: "frax.eth", name: "Frax Finance", logo: "https://cdn.stamp.fyi/space/frax.eth?w=64", tags: ["dao", "defi", "stablecoin"] },
  { id: "cvx.eth", name: "Convex Finance", logo: "https://cdn.stamp.fyi/space/cvx.eth?w=64", tags: ["dao", "defi", "yield"] },
  { id: "ybaby.eth", name: "Yearn Finance", logo: "https://cdn.stamp.fyi/space/ybaby.eth?w=64", tags: ["dao", "defi", "yield"] },
  { id: "penlocker.eth", name: "Pendle", logo: "https://cdn.stamp.fyi/space/penlocker.eth?w=64", tags: ["dao", "defi", "yield"] },
  { id: "aurafinance.eth", name: "Aura Finance", logo: "https://cdn.stamp.fyi/space/aurafinance.eth?w=64", tags: ["dao", "defi", "yield"] },
  { id: "morpho.eth", name: "Morpho", logo: "https://cdn.stamp.fyi/space/morpho.eth?w=64", tags: ["dao", "defi", "lending"] },
  { id: "radiantcapital.eth", name: "Radiant Capital", logo: "https://cdn.stamp.fyi/space/radiantcapital.eth?w=64", tags: ["dao", "defi"] },
  { id: "euler.eth", name: "Euler", logo: "https://cdn.stamp.fyi/space/euler.eth?w=64", tags: ["dao", "defi", "lending"] },
  { id: "instadapp-gov.eth", name: "Instadapp", logo: "https://cdn.stamp.fyi/space/instadapp-gov.eth?w=64", tags: ["dao", "defi"] },
  { id: "ribbondao.eth", name: "Ribbon / Aevo", logo: "https://cdn.stamp.fyi/space/ribbondao.eth?w=64", tags: ["dao", "defi", "options"] },
  { id: "barnbridge.eth", name: "BarnBridge", logo: "https://cdn.stamp.fyi/space/barnbridge.eth?w=64", tags: ["dao", "defi"] },

  // ── DEX / AMM ───────────────────────────────────────────────────────
  { id: "pancake.eth", name: "PancakeSwap", logo: "https://cdn.stamp.fyi/space/pancake.eth?w=64", tags: ["dao", "defi", "dex"] },
  { id: "cowswap.eth", name: "CoW Protocol", logo: "https://cdn.stamp.fyi/space/cowswap.eth?w=64", tags: ["dao", "defi", "dex"] },
  { id: "shapeshiftdao.eth", name: "ShapeShift", logo: "https://cdn.stamp.fyi/space/shapeshiftdao.eth?w=64", tags: ["dao", "defi"] },
  { id: "apeswap-finance.eth", name: "ApeSwap", logo: "https://cdn.stamp.fyi/space/apeswap-finance.eth?w=64", tags: ["dao", "defi", "dex"] },

  // ── Cross-chain / Bridge ────────────────────────────────────────────
  { id: "stgdao.eth", name: "Stargate", logo: "https://cdn.stamp.fyi/space/stgdao.eth?w=64", tags: ["dao", "defi", "bridge"] },
  { id: "hop.eth", name: "Hop Protocol", logo: "https://cdn.stamp.fyi/space/hop.eth?w=64", tags: ["dao", "bridge"] },
  { id: "lifi.eth", name: "LI.FI", logo: "https://cdn.stamp.fyi/space/lifi.eth?w=64", tags: ["dao", "bridge"] },

  // ── Layer 2 / Chains ────────────────────────────────────────────────
  { id: "opcollective.eth", name: "Optimism", logo: "https://cdn.stamp.fyi/space/opcollective.eth?w=64", tags: ["dao", "layer2"] },
  { id: "arbitrumfoundation.eth", name: "Arbitrum", logo: "https://cdn.stamp.fyi/space/arbitrumfoundation.eth?w=64", tags: ["dao", "layer2"] },
  { id: "starknet.eth", name: "Starknet", logo: "https://cdn.stamp.fyi/space/starknet.eth?w=64", tags: ["dao", "layer2", "zk"] },
  { id: "mantle.eth", name: "Mantle", logo: "https://cdn.stamp.fyi/space/mantle.eth?w=64", tags: ["dao", "layer2"] },
  { id: "gnosis.eth", name: "Gnosis", logo: "https://cdn.stamp.fyi/space/gnosis.eth?w=64", tags: ["dao", "infrastructure"] },
  { id: "polygoncommunitygrants.eth", name: "Polygon", logo: "https://cdn.stamp.fyi/space/polygoncommunitygrants.eth?w=64", tags: ["dao", "layer2"] },
  { id: "metis.eth", name: "Metis", logo: "https://cdn.stamp.fyi/space/metis.eth?w=64", tags: ["dao", "layer2"] },
  { id: "immutablex.eth", name: "ImmutableX", logo: "https://cdn.stamp.fyi/space/immutablex.eth?w=64", tags: ["dao", "layer2", "gaming"] },
  { id: "mode.eth", name: "Mode Network", logo: "https://cdn.stamp.fyi/space/mode.eth?w=64", tags: ["dao", "layer2"] },

  // ── Staking / Liquid Staking ────────────────────────────────────────
  { id: "rocketpool-dao.eth", name: "Rocket Pool", logo: "https://cdn.stamp.fyi/space/rocketpool-dao.eth?w=64", tags: ["dao", "staking"] },
  { id: "stakewise.eth", name: "StakeWise", logo: "https://cdn.stamp.fyi/space/stakewise.eth?w=64", tags: ["dao", "staking"] },
  { id: "stafi.eth", name: "StaFi", logo: "https://cdn.stamp.fyi/space/stafi.eth?w=64", tags: ["dao", "staking"] },

  // ── NFT / Gaming / Metaverse ────────────────────────────────────────
  { id: "apecoin.eth", name: "ApeCoin", logo: "https://cdn.stamp.fyi/space/apecoin.eth?w=64", tags: ["dao", "nft"] },
  { id: "decentraland.eth", name: "Decentraland", logo: "https://cdn.stamp.fyi/space/decentraland.eth?w=64", tags: ["dao", "metaverse"] },
  { id: "treasuredao.eth", name: "Treasure DAO", logo: "https://cdn.stamp.fyi/space/treasuredao.eth?w=64", tags: ["dao", "gaming", "nft"] },
  { id: "ilv.eth", name: "Illuvium", logo: "https://cdn.stamp.fyi/space/ilv.eth?w=64", tags: ["dao", "gaming"] },
  { id: "thesandboxdao.eth", name: "The Sandbox", logo: "https://cdn.stamp.fyi/space/thesandboxdao.eth?w=64", tags: ["dao", "metaverse", "gaming"] },

  // ── Social / Community ──────────────────────────────────────────────
  { id: "lensproperty.eth", name: "Lens Protocol", logo: "https://cdn.stamp.fyi/space/lensproperty.eth?w=64", tags: ["dao", "social"] },
  { id: "friendswithbenefits.eth", name: "FWB", logo: "https://cdn.stamp.fyi/space/friendswithbenefits.eth?w=64", tags: ["dao", "social"] },
  { id: "purple.eth", name: "Purple", logo: "https://cdn.stamp.fyi/space/purple.eth?w=64", tags: ["dao", "social", "farcaster"] },

  // ── Index / Portfolio ───────────────────────────────────────────────
  { id: "index-coop.eth", name: "Index Coop", logo: "https://cdn.stamp.fyi/space/index-coop.eth?w=64", tags: ["dao", "defi", "index"] },
  { id: "piedao.eth", name: "PieDAO", logo: "https://cdn.stamp.fyi/space/piedao.eth?w=64", tags: ["dao", "defi", "index"] },

  // ── Infrastructure / Public Goods ───────────────────────────────────
  { id: "yam.eth", name: "Yam Finance", logo: "https://cdn.stamp.fyi/space/yam.eth?w=64", tags: ["dao", "defi"] },
  { id: "olympusdao.eth", name: "OlympusDAO", logo: "https://cdn.stamp.fyi/space/olympusdao.eth?w=64", tags: ["dao", "defi"] },
  { id: "gearbox.eth", name: "Gearbox", logo: "https://cdn.stamp.fyi/space/gearbox.eth?w=64", tags: ["dao", "defi", "leverage"] },
  { id: "thegraphcouncil.eth", name: "The Graph", logo: "https://cdn.stamp.fyi/space/thegraphcouncil.eth?w=64", tags: ["dao", "infrastructure", "indexing"] },
  { id: "ampleforthorg.eth", name: "Ampleforth", logo: "https://cdn.stamp.fyi/space/ampleforthorg.eth?w=64", tags: ["dao", "defi"] },
  { id: "radicle.eth", name: "Radicle", logo: "https://cdn.stamp.fyi/space/radicle.eth?w=64", tags: ["dao", "developer", "git"] },
  { id: "poolpool.eth", name: "PoolTogether", logo: "https://cdn.stamp.fyi/space/poolpool.eth?w=64", tags: ["dao", "defi", "no-loss"] },
  { id: "fei.eth", name: "Tribe DAO", logo: "https://cdn.stamp.fyi/space/fei.eth?w=64", tags: ["dao", "defi"] },
  { id: "speraxdao.eth", name: "Sperax", logo: "https://cdn.stamp.fyi/space/speraxdao.eth?w=64", tags: ["dao", "defi", "stablecoin"] },
  { id: "angle-gov.eth", name: "Angle Protocol", logo: "https://cdn.stamp.fyi/space/angle-gov.eth?w=64", tags: ["dao", "defi", "stablecoin"] },
  { id: "tempgov.eth", name: "Tempus", logo: "https://cdn.stamp.fyi/space/tempgov.eth?w=64", tags: ["dao", "defi"] },
  { id: "vitadao.eth", name: "VitaDAO", logo: "https://cdn.stamp.fyi/space/vitadao.eth?w=64", tags: ["dao", "desci", "longevity"] },
  { id: "cakevote.eth", name: "CakeVote", logo: "https://cdn.stamp.fyi/space/cakevote.eth?w=64", tags: ["dao", "defi"] },
  { id: "paragraph.eth", name: "Paragraph", logo: "https://cdn.stamp.fyi/space/paragraph.eth?w=64", tags: ["dao", "social", "publishing"] },
];

const SNAPSHOT_QUERY = `
  query Proposals($spaces: [String!]) {
    active: proposals(
      first: 80,
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
      first: 30,
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
      first: 50,
      skip: 0,
      where: { space_in: $spaces, state: "closed" },
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
    tags: deriveSnapshotTags(p.space.id, p.title),
  };
}

async function fetchSnapshotProposals(): Promise<Proposal[]> {
  try {
    const res = await fetchWithRetry(SNAPSHOT_GQL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: SNAPSHOT_QUERY,
        variables: {
          spaces: SNAPSHOT_SPACES.map((s) => s.id),
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
      ...(data.closed || []),
    ];

    const seen = new Set<string>();
    const unique = allRaw.filter((p: any) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });

    return unique.map(mapSnapshotProposal);
  } catch (error) {
    console.error("[Snapshot] Failed to fetch proposals:", error);
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

// Cached current-block anchor so we only fetch once per build/revalidation
let _blockAnchor: { block: number; time: number } | null = null;

async function getBlockAnchor(): Promise<{ block: number; time: number }> {
  if (_blockAnchor) return _blockAnchor;
  try {
    const block = await mainnetPublicClient.getBlock({ blockTag: "latest" });
    _blockAnchor = { block: Number(block.number), time: Number(block.timestamp) };
    return _blockAnchor;
  } catch {
    // Fallback: use a recent reference point (March 2026)
    return { block: 22_200_000, time: 1741600000 };
  }
}

function shortAddressLabel(address: string): string {
  if (!address || address.length < 12) return address || "unknown";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function describeDelegateTarget(address: string): string {
  if (!address || address.toLowerCase() === ZERO_ADDRESS) {
    return "self custody";
  }
  return shortAddressLabel(address);
}

function nounsDaoMetadata(dao: "nouns" | "lilnouns") {
  return dao === "lilnouns"
    ? {
        name: "Lil Nouns",
        logo: "https://noun.pics/0",
        tags: ["dao", "governance", "nft", "lil-nouns"],
      }
    : {
        name: "Nouns DAO",
        logo: "https://noun.pics/1",
        tags: ["dao", "governance", "nft", "nouns"],
      };
}

function convertNounsToProposal(p: NounsProposal, anchor: { block: number; time: number }): Proposal {
  const total = p.forVotes + p.againstVotes;
  const isControversial =
    total > 0 && Math.abs(p.forVotes - p.againstVotes) / total < 0.2;
  const isLilNouns = p.dao === "lilnouns";
  const daoMeta = nounsDaoMetadata(p.dao);
  const proposalLink = isLilNouns
    ? `https://lilnouns.wtf/vote/${p.id}`
    : `https://noun.wtf/vote/${p.id}`;

  // Approximate timestamps from block numbers (~12.05s avg per block on mainnet)
  const BLOCK_TIME = 12.05;
  const approxTime = (block: number) =>
    block > 0 ? Math.round(anchor.time + (block - anchor.block) * BLOCK_TIME) : 0;

  return {
    id: `${p.dao}-${p.id}`,
    title: p.title,
    body: p.description?.slice(0, 300) || "",
    fullBody: p.description || "",
    proposer: p.proposer,
    dao: daoMeta.name,
    daoLogo: daoMeta.logo,
    status: mapNounsStatus(p.status),
    votesFor: p.forVotes,
    votesAgainst: p.againstVotes,
    votesAbstain: p.abstainVotes,
    quorum: p.quorumVotes,
    startTime: approxTime(p.startBlock),
    endTime: approxTime(p.endBlock),
    executionETA: p.eta > 0 ? p.eta : undefined,
    link: proposalLink,
    source: "onchain",
    isControversial,
    chain: "ethereum",
    proposalNumber: p.id,
    totalSupply: p.totalSupply,
    tags: daoMeta.tags,
  };
}

export function isDelegationActivityProposal(
  proposal: Pick<Proposal, "tags">
): boolean {
  return proposal.tags.some((tag) => tag.toLowerCase() === "delegation");
}

export function convertDelegationToProposal(
  event: NounsDelegationEvent
): Proposal {
  const daoMeta = nounsDaoMetadata(event.dao);
  const recordedAt = event.timestamp > 0 ? event.timestamp : Math.floor(Date.now() / 1000);
  const txLink = `https://etherscan.io/tx/${event.txHash}`;
  const title = `Delegation update: ${shortAddressLabel(event.delegator)} -> ${describeDelegateTarget(event.toDelegate)}`;
  const body = compactText(
    `${shortAddressLabel(event.delegator)} redirected ${daoMeta.name} voting power from ${describeDelegateTarget(event.fromDelegate)} to ${describeDelegateTarget(event.toDelegate)} on Ethereum mainnet.`
  );
  const fullBody = [
    "# Delegation update",
    "",
    `${shortAddressLabel(event.delegator)} updated their ${daoMeta.name} delegate on Ethereum mainnet.`,
    "",
    `- Delegator: ${event.delegator}`,
    `- Previous delegate: ${event.fromDelegate}`,
    `- New delegate: ${event.toDelegate}`,
    `- Block: ${event.blockNumber}`,
    `- Transaction: [${event.txHash}](${txLink})`,
    `- Recorded at: ${new Date(recordedAt * 1000).toISOString()}`,
  ].join("\n");

  return {
    id: event.id,
    title,
    body: body.slice(0, 300),
    fullBody,
    proposer: event.delegator,
    dao: daoMeta.name,
    daoLogo: daoMeta.logo,
    status: "closed",
    votesFor: 0,
    votesAgainst: 0,
    votesAbstain: 0,
    startTime: recordedAt,
    endTime: recordedAt,
    link: txLink,
    source: "onchain",
    isControversial: false,
    chain: "ethereum",
    tags: [...daoMeta.tags, "activity", "delegation"],
  };
}

export function isRecentGovernanceActivity(
  proposal: Proposal,
  now: number = Math.floor(Date.now() / 1000)
): boolean {
  if (!isDelegationActivityProposal(proposal)) return false;
  const activityTime = proposal.startTime || proposal.endTime;
  return activityTime > 0 && now - activityTime <= RECENT_GOVERNANCE_ACTIVITY_WINDOW_SECONDS;
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
    link: `https://noun.wtf/candidate/${encodeURIComponent(c.slug)}`,
    source: "onchain",
    isControversial: false,
    chain: "ethereum",
    candidateSlug: c.slug,
    candidateSignatures: c.signatureCount,
    candidateThreshold: c.requiredThreshold,
    candidateIsPromotable: c.isPromotable,
    tags: ['dao', 'governance', 'nft', 'nouns', 'candidate'],
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
    tags: enrichTagsFromTitle(['governance', 'uk', 'parliament'], d.title || ""),
  };
}

// ============================================================================
// TALLY — Onchain governance aggregator (Compound Governor style)
// ============================================================================

const TALLY_GQL = "https://api.tally.xyz/query";
const TALLY_API_KEY = process.env.TALLY_API_KEY || "";

const TALLY_ORGS = [
  { slug: "uniswap", name: "Uniswap (Onchain)", tags: ["dao", "defi"] },
  { slug: "compound", name: "Compound (Onchain)", tags: ["dao", "defi"] },
  { slug: "gitcoin", name: "Gitcoin (Onchain)", tags: ["dao", "grants"] },
  { slug: "ens", name: "ENS (Onchain)", tags: ["dao", "identity"] },
  { slug: "arbitrum", name: "Arbitrum (Onchain)", tags: ["dao", "layer2"] },
  { slug: "optimism", name: "Optimism (Onchain)", tags: ["dao", "layer2"] },
  { slug: "aave", name: "Aave (Onchain)", tags: ["dao", "defi"] },
];

const TALLY_QUERY = `
  query Proposals($orgSlug: String!) {
    proposals(
      input: { organizationSlug: $orgSlug, sort: { isDescending: true, sortBy: id }, page: { limit: 10 } }
    ) {
      nodes {
        id
        onchainId
        title
        description
        proposer { address }
        status
        voteStats { votesCount support { support } percent }
        block { timestamp }
        end { timestamp }
        governor { name chainId }
      }
    }
  }
`;

async function fetchTallyProposals(): Promise<Proposal[]> {
  if (!TALLY_API_KEY) return [];
  try {
    const results: Proposal[] = [];
    for (const org of TALLY_ORGS) {
      try {
        const res = await fetchWithRetry(TALLY_GQL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Api-Key": TALLY_API_KEY,
          },
          body: JSON.stringify({ query: TALLY_QUERY, variables: { orgSlug: org.slug } }),
          next: { revalidate: 300 },
        });
        if (!res.ok) continue;
        const json = await res.json();
        const nodes = json.data?.proposals?.nodes || [];
        for (const p of nodes) {
          const forStat = p.voteStats?.find((v: any) => v.support?.support === "FOR");
          const againstStat = p.voteStats?.find((v: any) => v.support?.support === "AGAINST");
          const abstainStat = p.voteStats?.find((v: any) => v.support?.support === "ABSTAIN");
          const votesFor = Number(forStat?.votesCount || 0);
          const votesAgainst = Number(againstStat?.votesCount || 0);
          const total = votesFor + votesAgainst;
          results.push({
            id: `tally-${org.slug}-${p.onchainId || p.id}`,
            title: p.title || "Untitled",
            body: (p.description || "").slice(0, 300),
            fullBody: p.description || "",
            proposer: p.proposer?.address || "",
            dao: org.name,
            daoLogo: `https://cdn.stamp.fyi/space/${org.slug}.eth?w=64`,
            status: mapTallyStatus(p.status),
            votesFor,
            votesAgainst,
            votesAbstain: Number(abstainStat?.votesCount || 0),
            startTime: p.block?.timestamp ? Math.floor(new Date(p.block.timestamp).getTime() / 1000) : 0,
            endTime: p.end?.timestamp ? Math.floor(new Date(p.end.timestamp).getTime() / 1000) : 0,
            link: `https://www.tally.xyz/gov/${org.slug}/proposal/${p.onchainId || p.id}`,
            source: "tally",
            isControversial: total > 0 && Math.abs(votesFor - votesAgainst) / total < 0.2,
            chain: p.governor?.chainId === 1 ? "ethereum" : "l2",
            tags: [...org.tags, 'governance'],
          });
        }
      } catch (error) {
        console.warn(`[Tally] Failed to fetch proposals for ${org.slug}:`, error instanceof Error ? error.message : error);
      }
    }
    return results;
  } catch (error) {
    console.error("[Tally] Failed to fetch proposals:", error);
    return [];
  }
}

function mapTallyStatus(status: string): Proposal["status"] {
  switch (status?.toLowerCase()) {
    case "active": return "active";
    case "pending": return "pending";
    case "succeeded": return "succeeded";
    case "queued": return "queued";
    case "executed": return "executed";
    case "defeated": case "canceled": case "expired": return "defeated";
    default: return "closed";
  }
}

// ============================================================================
// US CONGRESS — Bills & votes via api.congress.gov
// ============================================================================

const CONGRESS_API = "https://api.congress.gov/v3";
const CONGRESS_KEY = process.env.CONGRESS_API_KEY || "DEMO_KEY";

interface CongressBill {
  congress: number;
  type: string;
  number: number;
  title: string;
  latestAction?: { text: string; actionDate: string };
  introducedDate: string;
  policyArea?: { name: string };
  sponsors?: Array<{ fullName: string; party: string; state: string }>;
}

async function fetchCongressBills(): Promise<Proposal[]> {
  try {
    const res = await fetchWithRetry(
      `${CONGRESS_API}/bill?format=json&limit=25&sort=updateDate+desc&api_key=${CONGRESS_KEY}`,
      { next: { revalidate: 600 } }
    );
    if (!res.ok) return [];
    const json = await res.json();
    const bills = (json.bills || []) as CongressBill[];

    return bills.map((b) => {
      const billId = `${b.type?.toLowerCase() || 'hr'}${b.number}`;
      return {
        id: `congress-${b.congress}-${billId}`,
        title: b.title || "Untitled Bill",
        body: b.latestAction?.text || "",
        proposer: b.sponsors?.[0]?.fullName || "",
        dao: "US Congress",
        daoLogo: "",
        status: mapCongressStatus(b.latestAction?.text || ""),
        votesFor: 0,
        votesAgainst: 0,
        votesAbstain: 0,
        startTime: Math.floor(new Date(b.introducedDate || b.latestAction?.actionDate || "").getTime() / 1000),
        endTime: 0,
        link: `https://www.congress.gov/bill/${ordinal(b.congress)}-congress/${b.type?.toLowerCase()}-bill/${b.number}`,
        source: "congress" as const,
        isControversial: false,
        tags: enrichTagsFromTitle(['governance', 'us', 'congress', ...(b.policyArea?.name ? [b.policyArea.name.toLowerCase()] : [])], b.title || ""),
        chamber: b.type?.startsWith('S') ? 'Senate' : 'House',
      };
    });
  } catch (error) {
    console.error("[US Congress] Failed to fetch bills:", error);
    return [];
  }
}

function mapCongressStatus(action: string): Proposal["status"] {
  const lower = action.toLowerCase();
  if (lower.includes("became public law") || lower.includes("signed by president")) return "executed";
  if (lower.includes("passed") || lower.includes("agreed to")) return "succeeded";
  if (lower.includes("failed") || lower.includes("vetoed")) return "defeated";
  if (lower.includes("committee") || lower.includes("referred")) return "pending";
  return "active";
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ============================================================================
// US CONGRESS — Roll call votes
// ============================================================================

async function fetchCongressVotes(): Promise<Proposal[]> {
  try {
    const res = await fetchWithRetry(
      `${CONGRESS_API}/vote?format=json&limit=15&sort=date+desc&api_key=${CONGRESS_KEY}`,
      { next: { revalidate: 600 } }
    );
    if (!res.ok) return [];
    const json = await res.json();
    const votes = json.votes || [];

    return votes.map((v: any) => {
      const chamber = v.chamber === "Senate" ? "Senate" : "House";
      return {
        id: `congress-vote-${v.congress}-${chamber}-${v.rollNumber}`,
        title: v.question || v.description || `Roll Call Vote #${v.rollNumber}`,
        body: v.result || "",
        proposer: "",
        dao: `US ${chamber}`,
        daoLogo: "",
        status: v.result?.toLowerCase().includes("passed") || v.result?.toLowerCase().includes("agreed") ? "succeeded" : "defeated",
        votesFor: v.yea || v.aye || 0,
        votesAgainst: v.nay || v.no || 0,
        votesAbstain: v.notVoting || v.present || 0,
        startTime: Math.floor(new Date(v.date || "").getTime() / 1000),
        endTime: Math.floor(new Date(v.date || "").getTime() / 1000),
        link: `https://www.congress.gov/roll-call-vote/${v.congress}/${chamber.toLowerCase()}/${v.rollNumber}`,
        source: "congress" as const,
        isControversial: false,
        tags: enrichTagsFromTitle(['governance', 'us', 'congress', 'vote'], v.question || ""),
        chamber,
      };
    });
  } catch (error) {
    console.error("[US Congress] Failed to fetch roll call votes:", error);
    return [];
  }
}

// ============================================================================
// EU PARLIAMENT — Legislative Observatory
// ============================================================================

const EU_API = "https://data.europarl.europa.eu/api/v2";

async function fetchEUProposals(): Promise<Proposal[]> {
  try {
    // Fetch recent plenary documents
    const res = await fetchWithRetry(
      `${EU_API}/activities/plenary-session-documents?year=${new Date().getFullYear()}&format=application%2Fld%2Bjson&offset=0&limit=20`,
      { next: { revalidate: 600 } }
    );
    if (!res.ok) {
      // Fallback: try the legislative acts endpoint
      return fetchEULegislativeActs();
    }
    const json = await res.json();
    const items = json.data || json["hydra:member"] || [];

    return items.slice(0, 20).map((item: any, i: number) => ({
      id: `eu-plenary-${item.identifier || item.id || i}`,
      title: item.title_en || item.label || item.title || "EU Parliament Document",
      body: item.summary_en || item.description || "",
      proposer: "",
      dao: "EU Parliament",
      daoLogo: "",
      status: "active" as const,
      votesFor: 0,
      votesAgainst: 0,
      votesAbstain: 0,
      startTime: item.date ? Math.floor(new Date(item.date).getTime() / 1000) : Math.floor(Date.now() / 1000),
      endTime: 0,
      link: item.url || `https://www.europarl.europa.eu/doceo/document/${item.identifier || ""}`,
      source: "eu" as const,
      isControversial: false,
      tags: enrichTagsFromTitle(['governance', 'eu', 'parliament'], item.title_en || item.title || ""),
    }));
  } catch (error) {
    console.error("[EU Parliament] Failed to fetch plenary documents:", error);
    return [];
  }
}

async function fetchEULegislativeActs(): Promise<Proposal[]> {
  try {
    const res = await fetchWithRetry(
      `https://eur-lex.europa.eu/search.html?SUBDOM_INIT=LEGISLATION&DB_TYPE_OF_ACT=regulation,directive,decision&DTS_DOM=EU_LAW&page=1&type=advanced&DTS_SUBDOM=LEGISLATION&qid=&PROC_ANN=${new Date().getFullYear()}&format=json`,
      { next: { revalidate: 600 } }
    );
    if (!res.ok) return [];
    const json = await res.json();
    const results = json.results || [];
    return results.slice(0, 15).map((r: any, i: number) => ({
      id: `eu-lex-${r.celex || i}`,
      title: r.title || "EU Legislative Act",
      body: r.summary || "",
      proposer: "",
      dao: "EU Parliament",
      daoLogo: "",
      status: "active" as const,
      votesFor: 0,
      votesAgainst: 0,
      votesAbstain: 0,
      startTime: r.date ? Math.floor(new Date(r.date).getTime() / 1000) : Math.floor(Date.now() / 1000),
      endTime: 0,
      link: r.url || `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:${r.celex || ""}`,
      source: "eu" as const,
      isControversial: false,
      tags: enrichTagsFromTitle(['governance', 'eu', 'regulation'], r.title || ""),
    }));
  } catch {
    return [];
  }
}

// ============================================================================
// CANADA — Open Parliament API (votes + bills)
// ============================================================================

const CANADA_API = "https://api.openparliament.ca";

async function fetchCanadaVotes(): Promise<Proposal[]> {
  try {
    const res = await fetchWithRetry(
      `${CANADA_API}/votes/?format=json&limit=30&session=45-1`,
      {
        headers: { Accept: "application/json" },
        next: { revalidate: 600 },
      }
    );
    if (!res.ok) return [];
    const json = await res.json();
    const votes = json.objects || [];

    // Deduplicate: keep only the most recent (highest-numbered) vote per bill.
    // Multiple votes on the same bill (2nd reading, report stage, 3rd reading)
    // clutter the feed — show only the latest stage.
    const billKey = (desc: string) => {
      const m = desc.match(/Bill [CS]-\d+/i);
      return m ? m[0].toUpperCase() : null;
    };

    const seenBills = new Map<string, any>();
    for (const v of votes) {
      const desc = v.description?.en || v.description || "";
      const key = billKey(desc);
      if (key) {
        const existing = seenBills.get(key);
        if (!existing || (v.number || 0) > (existing.number || 0)) {
          seenBills.set(key, v);
        }
      } else {
        // Non-bill votes (procedural, motions) — keep all
        seenBills.set(`__motion_${v.number}`, v);
      }
    }

    return Array.from(seenBills.values()).slice(0, 15).map((v: any) => {
      const yea = v.yea_total || 0;
      const nay = v.nay_total || 0;
      const total = yea + nay;
      return {
        id: `canada-${v.url || v.number}`,
        title: v.description?.en || v.description || `Vote #${v.number}`,
        body: v.result?.en || v.result || "",
        proposer: "",
        dao: "Canada Parliament",
        daoLogo: "",
        status: v.result?.en?.toLowerCase().includes("agreed") || v.result?.toLowerCase?.().includes("agreed") ? "succeeded" : "defeated",
        votesFor: yea,
        votesAgainst: nay,
        votesAbstain: v.paired_total || 0,
        startTime: v.date ? Math.floor(new Date(v.date).getTime() / 1000) : 0,
        endTime: 0,
        link: `https://openparliament.ca${v.url || `/votes/${v.session}/${v.number}/`}`,
        source: "canada" as const,
        isControversial: total > 0 && Math.abs(yea - nay) / total < 0.2,
        tags: enrichTagsFromTitle(['governance', 'canada', 'parliament'], v.DecisionDivisionSubject || v.DecisionResultName || ""),
        chamber: "House of Commons",
      };
    });
  } catch (error) {
    console.error("[Canada] Failed to fetch parliamentary votes:", error);
    return [];
  }
}

async function fetchCanadaBills(): Promise<Proposal[]> {
  try {
    // Filter to current session (45-1) to avoid the same bill from every parliament
    const res = await fetchWithRetry(
      `${CANADA_API}/bills/?format=json&limit=15&session=45-1`,
      {
        headers: { Accept: "application/json" },
        next: { revalidate: 600 },
      }
    );
    if (!res.ok) return [];
    const json = await res.json();
    const bills = json.objects || [];

    return bills.map((b: any) => ({
      id: `canada-bill-${b.url || b.number}`,
      title: b.name?.en || b.name || `Bill ${b.number}`,
      body: b.short_title?.en || b.short_title || "",
      proposer: b.sponsor_member_url || "",
      dao: "Canada Parliament",
      daoLogo: "",
      status: "active" as const,
      votesFor: 0,
      votesAgainst: 0,
      votesAbstain: 0,
      startTime: b.introduced ? Math.floor(new Date(b.introduced).getTime() / 1000) : 0,
      endTime: 0,
      link: `https://openparliament.ca${b.url || `/bills/${b.session}/${b.number}/`}`,
      source: "canada" as const,
      isControversial: false,
      tags: enrichTagsFromTitle(['governance', 'canada', 'legislation'], b.LongTitle || b.ShortTitle || ""),
    }));
  } catch (error) {
    console.error("[Canada] Failed to fetch bills:", error);
    return [];
  }
}

// ============================================================================
// AUSTRALIA — They Vote For You (parliamentary votes)
// ============================================================================

const AU_API = "https://theyvoteforyou.org.au/api/v1";
const AU_KEY = process.env.AU_API_KEY || "";

async function fetchAustraliaVotes(): Promise<Proposal[]> {
  if (!AU_KEY) {
    // Fallback: scrape recent divisions page as JSON (public, no key needed)
    return fetchAustraliaDivisionsPublic();
  }
  try {
    const res = await fetchWithRetry(
      `${AU_API}/divisions.json?key=${AU_KEY}&sort=date&order=desc`,
      { next: { revalidate: 600 } }
    );
    if (!res.ok) return [];
    const divisions = await res.json();

    return (divisions as any[]).slice(0, 20).map((d: any) => ({
      id: `au-${d.id}`,
      title: d.name || "Australian Division",
      body: d.summary || "",
      proposer: "",
      dao: `Australia ${d.house === "senate" ? "Senate" : "House of Reps"}`,
      daoLogo: "",
      status: "closed" as const,
      votesFor: d.aye_votes || 0,
      votesAgainst: d.no_votes || 0,
      votesAbstain: 0,
      startTime: d.date ? Math.floor(new Date(d.date).getTime() / 1000) : 0,
      endTime: 0,
      link: `https://theyvoteforyou.org.au/divisions/${d.house}/${d.date}/${d.number}`,
      source: "australia" as const,
      isControversial: false,
      tags: enrichTagsFromTitle(['governance', 'australia', 'parliament'], d.name || ""),
      chamber: d.house === "senate" ? "Senate" : "Representatives",
    }));
  } catch (error) {
    console.error("[Australia] Failed to fetch parliamentary votes:", error);
    return [];
  }
}

async function fetchAustraliaDivisionsPublic(): Promise<Proposal[]> {
  // TODO: theyvoteforyou.org.au returns HTML, not JSON. Needs scraping or API key.
  return [];
}

// ============================================================================
// SEC EDGAR — Recent corporate filings (proxy statements, 10-K, 8-K)
// ============================================================================

const SEC_API = "https://efts.sec.gov/LATEST/search-index";

async function fetchSECFilings(): Promise<Proposal[]> {
  try {
    const res = await fetchWithRetry(
      `https://efts.sec.gov/LATEST/search-index?q=%22proxy%20statement%22&dateRange=custom&startdt=${getRecentDate(30)}&enddt=${getRecentDate(0)}&forms=DEF+14A,8-K&from=0&size=20`,
      {
        headers: { "User-Agent": "pooter.world governance-aggregator/1.0", Accept: "application/json" },
        next: { revalidate: 1800 },
      }
    );
    if (!res.ok) {
      // Fallback: use EDGAR full-text search
      return fetchSECFullText();
    }
    const json = await res.json();
    const hits = json.hits?.hits || [];

    return hits.map((hit: any, i: number) => {
      const src = hit._source || {};
      return {
        id: `sec-${src.file_num || i}-${src.file_date || ""}`,
        title: `${src.display_names?.[0] || src.entity_name || "Company"}: ${src.form_type || "Filing"}`,
        body: src.display_names?.join(", ") || "",
        proposer: "",
        dao: src.entity_name || "SEC Filing",
        daoLogo: "",
        status: "closed" as const,
        votesFor: 0,
        votesAgainst: 0,
        votesAbstain: 0,
        startTime: src.file_date ? Math.floor(new Date(src.file_date).getTime() / 1000) : 0,
        endTime: 0,
        link: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${src.entity_id || ""}&type=${src.form_type || ""}&dateb=&owner=include&count=10`,
        source: "sec" as const,
        isControversial: false,
        tags: enrichTagsFromTitle(['finance', 'corporate', 'sec', 'regulation'], src.display_names?.join(" ") || ""),
      };
    });
  } catch (error) {
    console.error("[SEC EDGAR] Failed to fetch filings:", error);
    return [];
  }
}

async function fetchSECFullText(): Promise<Proposal[]> {
  try {
    const res = await fetchWithRetry(
      `https://efts.sec.gov/LATEST/search-index?q=%22shareholder+vote%22+OR+%22proxy+statement%22&forms=DEF+14A&from=0&size=15`,
      {
        headers: { "User-Agent": "pooter.world/1.0", Accept: "application/json" },
        next: { revalidate: 1800 },
      }
    );
    if (!res.ok) return [];
    const json = await res.json();
    return (json.hits?.hits || []).slice(0, 15).map((hit: any, i: number) => {
      const src = hit._source || {};
      return {
        id: `sec-ft-${i}`,
        title: `${src.entity_name || "Filing"}: ${src.form_type || "DEF 14A"}`,
        body: "",
        proposer: "",
        dao: "SEC EDGAR",
        daoLogo: "",
        status: "closed" as const,
        votesFor: 0, votesAgainst: 0, votesAbstain: 0,
        startTime: src.file_date ? Math.floor(new Date(src.file_date).getTime() / 1000) : 0,
        endTime: 0,
        link: `https://www.sec.gov/cgi-bin/browse-edgar?company=${encodeURIComponent(src.entity_name || "")}&CIK=&type=DEF+14A&dateb=&owner=include&count=10&action=getcompany`,
        source: "sec" as const,
        isControversial: false,
        tags: enrichTagsFromTitle(['finance', 'corporate', 'sec'], src.entity_name || ""),
      };
    });
  } catch {
    return [];
  }
}

function getRecentDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split("T")[0];
}

// ============================================================================
// HYPERLIQUID — Validator votes + foundation announcements
// ============================================================================

const HYPERLIQUID_INFO_API = "https://api.hyperliquid.xyz/info";
const HYPERLIQUID_ANNOUNCEMENTS_MIRROR = "https://r.jina.ai/http://t.me/s/hyperliquid_announcements";
const HYPERLIQUID_DAO_NAME = "Hyperliquid Foundation";
const HYPERLIQUID_DAO_LOGO = "https://hyperfoundation.org/favicon-32x32.png";

function coerceString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function coerceNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function timestampFromUnknown(value: unknown, fallback: number): number {
  const n = coerceNumber(value);
  if (n === null) return fallback;
  if (n > 1_000_000_000_000) return Math.floor(n / 1000);
  if (n > 1_000_000_000) return Math.floor(n);
  return fallback;
}

function toSentenceTitle(body: string, maxLen = 120): string {
  const sentence = body.split(/[\n.!?]/).find((part) => part.trim().length > 10) || body;
  const trimmed = sentence.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen - 1)}…`;
}

function compactText(raw: string): string {
  return raw
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1 ($2)")
    .replace(/[_*`>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseMonthDayToUnix(raw: string): number {
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentUnix = Math.floor(now.getTime() / 1000);

  const tryYear = (year: number): number | null => {
    const parsed = Date.parse(`${raw} ${year} UTC`);
    if (!Number.isFinite(parsed)) return null;
    return Math.floor(parsed / 1000);
  };

  let unix = tryYear(currentYear);
  if (unix === null) return currentUnix;
  if (unix > currentUnix + 86400) {
    unix = tryYear(currentYear - 1) ?? unix;
  }
  return unix;
}

function parseHyperliquidAnnouncements(markdown: string, limit = 12): Array<{
  id: string;
  title: string;
  body: string;
  timestamp: number;
  link: string;
}> {
  const regex =
    /\[\]\(https:\/\/t\.me\/hyperliquid_announcements\/(\d+)\)\n\n([\s\S]*?)\n\n_[\s\S]*?\n\n([A-Za-z]+\s+\d{1,2})/g;
  const out: Array<{ id: string; title: string; body: string; timestamp: number; link: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(markdown)) !== null) {
    if (out.length >= limit) break;
    const msgId = match[1];
    const body = compactText(match[2] || "");
    if (body.length < 20) continue;
    const dayLabel = (match[3] || "").trim();
    const timestamp = parseMonthDayToUnix(dayLabel);
    out.push({
      id: msgId,
      title: toSentenceTitle(body, 120),
      body: body.slice(0, 900),
      timestamp,
      link: `https://t.me/hyperliquid_announcements/${msgId}`,
    });
  }
  return out;
}

async function fetchHyperliquidValidatorVotes(): Promise<Proposal[]> {
  try {
    const res = await fetchWithRetry(HYPERLIQUID_INFO_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "validatorL1Votes" }),
      next: { revalidate: 90 },
    });
    if (!res.ok) return [];

    const json = await res.json();
    if (!Array.isArray(json)) return [];

    const now = Math.floor(Date.now() / 1000);
    return json.slice(0, 30).map((item, i) => {
      const row = item as Record<string, unknown>;
      const voteId =
        coerceString(row.id) ||
        coerceString(row.voteId) ||
        coerceString(row.proposalId) ||
        `${now}-${i}`;
      const title =
        coerceString(row.title) ||
        coerceString(row.topic) ||
        coerceString(row.proposal) ||
        `Validator Vote ${i + 1}`;
      const body =
        coerceString(row.description) ||
        coerceString(row.details) ||
        "Hyperliquid validator vote.";
      const link =
        coerceString(row.link) ||
        coerceString(row.url) ||
        "https://app.hyperliquid.xyz";
      const startTime = timestampFromUnknown(
        row.startTime ?? row.startTs ?? row.timestamp ?? row.createdAt,
        now
      );
      const endTime = timestampFromUnknown(
        row.endTime ?? row.endTs ?? row.deadline,
        startTime + 7 * 86400
      );
      const votesFor = Math.max(
        0,
        Math.round(
          coerceNumber(row.votesFor ?? row.forVotes ?? row.yesVotes) ?? 0
        )
      );
      const votesAgainst = Math.max(
        0,
        Math.round(
          coerceNumber(row.votesAgainst ?? row.againstVotes ?? row.noVotes) ?? 0
        )
      );
      const votesAbstain = Math.max(
        0,
        Math.round(coerceNumber(row.votesAbstain ?? row.abstainVotes) ?? 0)
      );
      const rawStatus = (coerceString(row.status) || coerceString(row.state) || "").toLowerCase();
      const status: Proposal["status"] =
        rawStatus.includes("pending")
          ? "pending"
          : rawStatus.includes("closed") || rawStatus.includes("resolved")
            ? "closed"
            : "active";

      return {
        id: `hyper-vote-${voteId}`,
        title,
        body,
        proposer: "hyperliquid-validator-set",
        dao: "Hyperliquid Validators",
        daoLogo: HYPERLIQUID_DAO_LOGO,
        status,
        votesFor,
        votesAgainst,
        votesAbstain,
        startTime,
        endTime,
        link,
        source: "hyperliquid" as const,
        isControversial: Math.abs(votesFor - votesAgainst) < Math.max(3, (votesFor + votesAgainst) * 0.1),
        tags: enrichTagsFromTitle(["governance", "hyperliquid", "validator", "vote"], title),
        chain: "hyperliquid",
      };
    });
  } catch (error) {
    console.error("[Hyperliquid] Failed to fetch validator votes:", error);
    return [];
  }
}

async function fetchHyperliquidAnnouncementsFeed(): Promise<Proposal[]> {
  try {
    const res = await fetchWithRetry(HYPERLIQUID_ANNOUNCEMENTS_MIRROR, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    const text = await res.text();
    const parsed = parseHyperliquidAnnouncements(text, 12);
    const now = Math.floor(Date.now() / 1000);

    return parsed.map((entry) => {
      const isRecent = now - entry.timestamp <= 14 * 86400;
      return {
        id: `hyper-announcement-${entry.id}`,
        title: entry.title,
        body: entry.body,
        proposer: "hyperfoundation-announcements",
        dao: HYPERLIQUID_DAO_NAME,
        daoLogo: HYPERLIQUID_DAO_LOGO,
        status: isRecent ? ("active" as const) : ("closed" as const),
        votesFor: 0,
        votesAgainst: 0,
        votesAbstain: 0,
        startTime: entry.timestamp,
        endTime: entry.timestamp + 14 * 86400,
        link: entry.link,
        source: "hyperliquid" as const,
        isControversial: false,
        tags: enrichTagsFromTitle(["governance", "hyperliquid", "foundation", "announcement"], entry.title),
        chain: "hyperliquid",
      };
    });
  } catch (error) {
    console.error("[Hyperliquid] Failed to fetch announcements:", error);
    return [];
  }
}

async function fetchHyperliquidGovernance(): Promise<Proposal[]> {
  const [votes, announcements] = await Promise.all([
    fetchHyperliquidValidatorVotes(),
    fetchHyperliquidAnnouncementsFeed(),
  ]);
  return [...votes, ...announcements];
}

async function fetchNounsGovernanceActivity(): Promise<Proposal[]> {
  const [nounsEvents, lilNounsEvents] = await Promise.all([
    fetchNounsDelegationEvents(25),
    fetchLilNounsDelegationEvents(15),
  ]);

  return [...nounsEvents, ...lilNounsEvents]
    .sort((a, b) => b.timestamp - a.timestamp)
    .map(convertDelegationToProposal);
}

function governanceFarcasterUsernames(): string[] {
  const raw = process.env.GOVERNANCE_FARCASTER_USERNAMES;
  if (!raw) return DEFAULT_GOVERNANCE_FARCASTER_USERNAMES;
  const parsed = raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : DEFAULT_GOVERNANCE_FARCASTER_USERNAMES;
}

function castSearchText(cast: Cast): string {
  return compactText(
    [
      cast.text,
      cast.channel,
      cast.author.username,
      cast.author.displayName,
      ...cast.embeds.flatMap((embed) => [
        embed.url || "",
        embed.metadata?.title || "",
        embed.metadata?.description || "",
      ]),
    ].join(" ")
  ).toLowerCase();
}

function governanceTagsFromCast(cast: Cast): string[] {
  const haystack = castSearchText(cast);
  const tags = new Set<string>(["farcaster", "social", "governance"]);

  if (/(^|\W)lil nouns?(\W|$)/i.test(haystack)) {
    tags.add("lil-nouns");
  } else if (/(^|\W)nouns?(\W|$)|noun\.wtf|nounsquare|houseofnouns|house of nouns/i.test(haystack)) {
    tags.add("nouns");
  }

  if (/\bdelegate|delegation|delegatee|delegator\b/i.test(haystack)) tags.add("delegation");
  if (/\bproposal|candidate|vote|voting|quorum\b/i.test(haystack)) tags.add("proposal");

  return [...tags];
}

function governanceDaoFromCast(cast: Cast): string | null {
  const tags = governanceTagsFromCast(cast);
  if (tags.includes("lil-nouns")) return "Lil Nouns";
  if (tags.includes("nouns")) return "Nouns DAO";
  return null;
}

export function isGovernanceRelevantCast(cast: Cast): boolean {
  const haystack = castSearchText(cast);
  const nounsSignal =
    /(^|\W)nouns?(\W|$)|noun\.wtf|nounsquare|houseofnouns|house of nouns|lil nouns?/i.test(
      haystack
    );
  const governanceSignal =
    /\bdelegate|delegation|delegatee|proposal|candidate|vote|voting|quorum|governance\b/i.test(
      haystack
    );
  return nounsSignal && governanceSignal;
}

export function normalizeGovernanceCast(
  cast: Cast
): GovernanceSocialSignal {
  const timestamp = Math.floor(new Date(cast.timestamp).getTime() / 1000);
  const safeTimestamp =
    Number.isFinite(timestamp) && timestamp > 0
      ? timestamp
      : Math.floor(Date.now() / 1000);
  const score = cast.likes * 2 + cast.recasts * 3 + cast.replies;

  return {
    id: `farcaster-${cast.hash}`,
    network: "farcaster",
    relatedDao: governanceDaoFromCast(cast),
    author: {
      fid: cast.author.fid,
      username: cast.author.username,
      displayName: cast.author.displayName,
      pfpUrl: cast.author.pfpUrl,
      verifiedAddresses: cast.author.verifiedAddresses,
    },
    text: compactText(cast.text || ""),
    timestamp: safeTimestamp,
    link: `https://warpcast.com/~/conversations/${cast.hash}`,
    channel: cast.channel,
    tags: governanceTagsFromCast(cast),
    engagement: {
      likes: cast.likes,
      recasts: cast.recasts,
      replies: cast.replies,
      score,
    },
  };
}

export async function fetchGovernanceSocialSignals(): Promise<
  GovernanceSocialSignal[]
> {
  // ⚠️ Farcaster disabled — no Neynar calls. Re-enable via FARCASTER_ENABLED=true
  if (process.env.FARCASTER_ENABLED !== "true") return [];

  return loadTtlValue(
    governanceSocialCache,
    "farcaster",
    GOVERNANCE_SOCIAL_CACHE_TTL_MS,
    async () => {
      const usernames = governanceFarcasterUsernames();
      const users = await Promise.all(usernames.map((username) => lookupUser(username)));
      const fids = users.flatMap((user) => (user ? [user.fid] : []));
      const [popularLists, trending] = await Promise.all([
        Promise.all(fids.map((fid) => fetchPopularCasts(fid))),
        fetchTrendingCasts(),
      ]);

      const cutoff = Math.floor(Date.now() / 1000) - GOVERNANCE_SOCIAL_WINDOW_SECONDS;
      const seen = new Set<string>();
      const normalized: GovernanceSocialSignal[] = [];

      for (const cast of [...popularLists.flat(), ...trending]) {
        if (seen.has(cast.hash) || !isGovernanceRelevantCast(cast)) continue;
        seen.add(cast.hash);

        const signal = normalizeGovernanceCast(cast);
        if (signal.timestamp < cutoff) continue;
        normalized.push(signal);
      }

      normalized.sort((a, b) => {
        if (a.timestamp !== b.timestamp) return b.timestamp - a.timestamp;
        return b.engagement.score - a.engagement.score;
      });

      return normalized.slice(0, 12);
    }
  );
}

// ============================================================================
// TAG DERIVATION
// ============================================================================

/** Keyword-based tag enrichment — used by all proposal types */
function enrichTagsFromTitle(baseTags: string[], title: string): string[] {
  const tags = new Set<string>(baseTags);
  const lower = title.toLowerCase();

  // Policy domains
  if (lower.includes('grant') || lower.includes('fund') || lower.includes('appropriat')) tags.add('finance');
  if (lower.includes('treasury') || lower.includes('budget') || lower.includes('spending')) tags.add('finance');
  if (lower.includes('tax') || lower.includes('tariff') || lower.includes('trade')) tags.add('finance');
  if (lower.includes('health') || lower.includes('medic') || lower.includes('pharma')) tags.add('health');
  if (lower.includes('climate') || lower.includes('environment') || lower.includes('energy')) tags.add('energy');
  if (lower.includes('security') || lower.includes('defense') || lower.includes('military')) tags.add('security');
  if (lower.includes('privacy') || lower.includes('surveillance') || lower.includes('data protection')) tags.add('rights');
  if (lower.includes('election') || lower.includes('voting') || lower.includes('ballot')) tags.add('election');
  if (lower.includes('crypto') || lower.includes('blockchain') || lower.includes('digital asset')) tags.add('crypto');
  if (lower.includes('ai') || lower.includes('artificial intelligence') || lower.includes('algorithm')) tags.add('ai');
  if (lower.includes('immigra') || lower.includes('border') || lower.includes('asylum')) tags.add('immigration');

  // Tech/governance
  if (lower.includes('upgrade') || lower.includes('deploy') || lower.includes('smart contract')) tags.add('tech');
  if (lower.includes('bridge') || lower.includes('l2') || lower.includes('layer')) tags.add('layer2');

  return Array.from(tags);
}

function deriveSnapshotTags(spaceId: string, title: string): string[] {
  const space = SNAPSHOT_SPACES.find(s => s.id === spaceId);
  const baseTags = [...(space?.tags || ['dao']), 'governance'];
  return enrichTagsFromTitle(baseTags, title);
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
      fetchWithRetry(SNAPSHOT_GQL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: SNAPSHOT_SINGLE_QUERY,
          variables: { id: proposalId },
        }),
        next: { revalidate: 60 },
      }),
      fetchWithRetry(SNAPSHOT_GQL, {
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
    console.error("[Snapshot] Failed to fetch proposal detail:", error);
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
// DIRECT SINGLE-PROPOSAL FETCH — Avoids loading ALL sources
// ============================================================================

export async function fetchSingleProposal(
  decodedId: string
): Promise<ProposalDetail | null> {
  // Nouns onchain proposals: "nouns-123"
  const nounsMatch = decodedId.match(/^nouns-(\d+)$/);
  if (nounsMatch) {
    const proposalNum = parseInt(nounsMatch[1], 10);
    try {
      const { fetchNounsProposalDirect } = await import("./nouns");
      const [raw, anchor] = await Promise.all([
        fetchNounsProposalDirect(proposalNum),
        getBlockAnchor(),
      ]);
      if (!raw) return null;
      const base = convertNounsToProposal(raw, anchor);
      return { ...base, onchainVotes: [] };
    } catch (e) {
      console.error(`[governance] Failed direct fetch for nouns-${proposalNum}:`, e);
      return null;
    }
  }

  // Lil Nouns: "lilnouns-123"
  const lilMatch = decodedId.match(/^lilnouns-(\d+)$/);
  if (lilMatch) {
    const proposalNum = parseInt(lilMatch[1], 10);
    try {
      const { fetchLilNounsProposalDirect } = await import("./nouns");
      const [raw, anchor] = await Promise.all([
        fetchLilNounsProposalDirect(proposalNum),
        getBlockAnchor(),
      ]);
      if (!raw) return null;
      const base = convertNounsToProposal(raw, anchor);
      return { ...base, onchainVotes: [] };
    } catch {
      return null;
    }
  }

  // Snapshot proposals (no prefix or hex-like)
  if (!decodedId.match(/^(candidate-|parliament-|tally-|congress-|eu-|canada-|au-|sec-|hyper-)/)) {
    const direct = await fetchProposalById(decodedId);
    if (direct) return direct;
  }

  const all = await fetchAllProposals();
  const found = all.find((proposal) => proposal.id === decodedId);
  return found ? { ...found, onchainVotes: [] } : null;
}

// ============================================================================
// AGGREGATOR — Fetch all sources, merge, sort, dedupe
// ============================================================================

// Prefer partial governance coverage over blank pages.
const PROPOSAL_SOURCE_TIMEOUT_MS = 4_000;

async function withSourceTimeout<T>(
  source: string,
  task: Promise<T>,
  fallback: T
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task,
      new Promise<T>((resolve) => {
        timeoutId = setTimeout(() => {
          console.warn(
            `[Governance] ${source} timed out after ${PROPOSAL_SOURCE_TIMEOUT_MS}ms; using fallback`
          );
          resolve(fallback);
        }, PROPOSAL_SOURCE_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    console.warn(
      `[Governance] ${source} failed; using fallback`,
      error instanceof Error ? error.message : error
    );
    return fallback;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function fetchAllProposalsUncached(): Promise<Proposal[]> {
  const anchor = await getBlockAnchor();
  const results = await Promise.all([
    withSourceTimeout("snapshot", fetchSnapshotProposals(), [] as Proposal[]),
    withSourceTimeout(
      "nouns",
      Promise.all([fetchNounsProposals(25), fetchLilNounsProposals(25)]).then(
        ([nouns, lilNouns]) =>
          [...nouns, ...lilNouns].map((proposal) =>
            convertNounsToProposal(proposal, anchor)
          )
      ),
      [] as Proposal[]
    ),
    withSourceTimeout(
      "nouns-activity",
      fetchNounsGovernanceActivity(),
      [] as Proposal[]
    ),
    withSourceTimeout(
      "nouns-candidates",
      fetchCandidateProposals(200_000).then((cs) => cs.map(convertCandidateToProposal)),
      [] as Proposal[]
    ),
    withSourceTimeout(
      "uk-parliament",
      fetchAllDivisions().then((ds) => ds.map(convertDivisionToProposal)),
      [] as Proposal[]
    ),
    withSourceTimeout("tally", fetchTallyProposals(), [] as Proposal[]),
    withSourceTimeout("congress-bills", fetchCongressBills(), [] as Proposal[]),
    withSourceTimeout("congress-votes", fetchCongressVotes(), [] as Proposal[]),
    withSourceTimeout("eu-parliament", fetchEUProposals(), [] as Proposal[]),
    withSourceTimeout("canada-votes", fetchCanadaVotes(), [] as Proposal[]),
    withSourceTimeout("canada-bills", fetchCanadaBills(), [] as Proposal[]),
    withSourceTimeout("australia", fetchAustraliaVotes(), [] as Proposal[]),
    withSourceTimeout("sec-edgar", fetchSECFilings(), [] as Proposal[]),
    withSourceTimeout("hyperliquid", fetchHyperliquidGovernance(), [] as Proposal[]),
  ]);

  const raw: Proposal[] = [];
  for (const proposals of results) raw.push(...proposals);

  // Deduplicate by ID (first occurrence wins)
  const seen = new Set<string>();
  const all: Proposal[] = [];
  for (const p of raw) {
    if (!seen.has(p.id)) {
      seen.add(p.id);
      all.push(p);
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

export async function fetchAllProposals(): Promise<Proposal[]> {
  return loadTtlValue(
    proposalCache,
    "all",
    PROPOSAL_CACHE_TTL_MS,
    fetchAllProposalsUncached,
  );
}

// Get only active/pending proposals (for feed highlight)
export async function fetchLiveProposals(): Promise<Proposal[]> {
  const all = await fetchAllProposals();
  return all.filter(
    (proposal) =>
      proposal.status === "active" ||
      proposal.status === "pending" ||
      isRecentGovernanceActivity(proposal)
  );
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

// ============================================================================
// NOUNS-ONLY FETCHER — For prediction markets (only active/pending proposals)
// ============================================================================

export async function fetchActivePredictionProposals(): Promise<Proposal[]> {
  const anchor = await getBlockAnchor();
  try {
    const [nounsRaw, lilNounsRaw] = await Promise.all([
      fetchNounsProposals(25),
      fetchLilNounsProposals(25),
    ]);

    return [...nounsRaw, ...lilNounsRaw]
      .map((p) => convertNounsToProposal(p, anchor))
      .filter((p) => p.status === "active" || p.status === "pending");
  } catch (error) {
    console.error("[Predictions] Governance fetch failed:", error);
    return [];
  }
}

const RESOLVED_STATUSES = new Set<Proposal["status"]>([
  "executed",
  "succeeded",
  "defeated",
  "closed",
  "queued",
]);

function compareResolvedPredictionRecency(a: Proposal, b: Proposal): number {
  const endDelta = (b.endTime ?? 0) - (a.endTime ?? 0);
  if (endDelta !== 0) return endDelta;

  const startDelta = (b.startTime ?? 0) - (a.startTime ?? 0);
  if (startDelta !== 0) return startDelta;

  return Number(b.proposalNumber ?? 0) - Number(a.proposalNumber ?? 0);
}

export async function fetchResolvedPredictionProposals(): Promise<Proposal[]> {
  // Wrap in a 15s timeout so static builds don't hang on slow RPCs
  const result = await Promise.race([
    _fetchResolvedPredictionProposalsInner(),
    new Promise<Proposal[]>((resolve) => setTimeout(() => resolve([]), 15_000)),
  ]);
  return result;
}

async function _fetchResolvedPredictionProposalsInner(): Promise<Proposal[]> {
  const anchor = await getBlockAnchor();
  try {
    const { PREDICTION_MARKET_ABI, PREDICTION_MARKET_ADDRESS } = await import("./contracts");

    const [nounsRaw, lilNounsRaw] = await Promise.all([
      fetchNounsProposals(25),
      fetchLilNounsProposals(25),
    ]);

    // Check recent resolved proposals from each DAO independently so Lil Nouns
    // markets are not drowned out by higher-numbered Nouns proposal ids.
    const resolved = [...nounsRaw, ...lilNounsRaw]
      .map((p) => convertNounsToProposal(p, anchor))
      .filter((p) => RESOLVED_STATUSES.has(p.status))
      .sort(compareResolvedPredictionRecency);

    // Only include proposals that have an onchain market (skip "Not Open" noise)
    const withMarkets = await Promise.all(
      resolved.map(async (p) => {
        const daoKey = getDaoPredictionKey(p.dao);
        const proposalId = p.proposalNumber?.toString() ?? p.id;
        try {
          const raw = await predictionMarketPublicClient.readContract({
            address: PREDICTION_MARKET_ADDRESS,
            abi: PREDICTION_MARKET_ABI,
            functionName: "getMarket",
            args: [daoKey, proposalId],
          });
          const exists = (raw as readonly [bigint, bigint, bigint, bigint, bigint, bigint, number, boolean])[7];
          return exists ? p : null;
        } catch {
          return null;
        }
      }),
    );

    const visible = withMarkets
      .filter((p): p is Proposal => p !== null)
      .reduce<Record<string, Proposal[]>>((acc, proposal) => {
        const daoKey = getDaoPredictionKey(proposal.dao);
        (acc[daoKey] ||= []).push(proposal);
        return acc;
      }, {});

    return Object.values(visible)
      .flatMap((group) => group.sort(compareResolvedPredictionRecency).slice(0, 5))
      .sort(compareResolvedPredictionRecency)
      .slice(0, 10);
  } catch (error) {
    console.error("[Predictions] Resolved governance fetch failed:", error);
    return [];
  }
}

export async function fetchActiveNounsProposals(): Promise<Proposal[]> {
  const proposals = await fetchActivePredictionProposals();
  return proposals.filter((proposal) => getDaoPredictionKey(proposal.dao) === "nouns");
}
