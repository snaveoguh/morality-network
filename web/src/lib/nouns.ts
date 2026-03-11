// Nouns + Lil Nouns onchain data fetching
// Reads directly from contracts via public RPC — no subgraph dependency
// Nouns Governor: 0x6f3E6272A167e8AcCb32072d08E0957F9c79223d
// Nouns Auction House: 0x830BD73E4184ceF73443C15111a1DF14e495C706
// Lil Nouns Governor: 0x5d2C31ce16924C2a71D317e5BbFd5ce387854039
// Lil Nouns Auction House: 0x55e0F7A3bB39a28Bd7Bcc458e04b3cF00Ad3219E

import { createPublicClient, http, parseAbiItem, type Address } from "viem";
import { mainnet } from "viem/chains";

// ============================================================================
// PUBLIC CLIENT — Ethereum mainnet
// ============================================================================

const client = createPublicClient({
  chain: mainnet,
  transport: http("https://ethereum-rpc.publicnode.com"),
});

// ============================================================================
// CONTRACT ADDRESSES
// ============================================================================

export const NOUNS_CONTRACTS = {
  governor: "0x6f3E6272A167e8AcCb32072d08E0957F9c79223d" as Address,
  auctionHouse: "0x830BD73E4184ceF73443C15111a1DF14e495C706" as Address,
  token: "0x9C8fF314C9Bc7F6e59A9d9225Fb22946427eDC03" as Address,
} as const;

export const LIL_NOUNS_CONTRACTS = {
  governor: "0x5d2C31ce16924C2a71D317e5BbFd5ce387854039" as Address,
  auctionHouse: "0x55e0F7A3bB39a28Bd7Bcc458e04b3cF00Ad3219E" as Address,
  token: "0x4b10701Bfd7BFEdc47d50562b76b436fbB5BdB3B" as Address,
} as const;

// probe.wtf client ID for auction bids
export const PROBE_CLIENT_ID = 9;

// ============================================================================
// AUCTION HOUSE ABI (V2 — supports clientId)
// ============================================================================

export const AUCTION_HOUSE_ABI = [
  {
    type: "function",
    name: "auction",
    inputs: [],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "nounId", type: "uint96" },
          { name: "amount", type: "uint128" },
          { name: "startTime", type: "uint40" },
          { name: "endTime", type: "uint40" },
          { name: "bidder", type: "address" },
          { name: "settled", type: "bool" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "createBid",
    inputs: [
      { name: "nounId", type: "uint256" },
      { name: "clientId", type: "uint32" },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "reservePrice",
    inputs: [],
    outputs: [{ name: "", type: "uint192" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "minBidIncrementPercentage",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "settleCurrentAndCreateNewAuction",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

// Lil Nouns uses V1 auction house (no clientId)
export const LIL_AUCTION_HOUSE_ABI = [
  {
    type: "function",
    name: "auction",
    inputs: [],
    outputs: [
      { name: "nounId", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "startTime", type: "uint256" },
      { name: "endTime", type: "uint256" },
      { name: "bidder", type: "address" },
      { name: "settled", type: "bool" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "createBid",
    inputs: [{ name: "nounId", type: "uint256" }],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "reservePrice",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "minBidIncrementPercentage",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
  },
] as const;

// ============================================================================
// GOVERNOR ABI — Read proposals
// ============================================================================

export const GOVERNOR_ABI = [
  {
    type: "function",
    name: "proposalCount",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "proposals",
    inputs: [{ name: "proposalId", type: "uint256" }],
    outputs: [
      { name: "id", type: "uint256" },
      { name: "proposer", type: "address" },
      { name: "proposalThreshold", type: "uint256" },
      { name: "quorumVotes", type: "uint256" },
      { name: "eta", type: "uint256" },
      { name: "startBlock", type: "uint256" },
      { name: "endBlock", type: "uint256" },
      { name: "forVotes", type: "uint256" },
      { name: "againstVotes", type: "uint256" },
      { name: "abstainVotes", type: "uint256" },
      { name: "canceled", type: "bool" },
      { name: "vetoed", type: "bool" },
      { name: "executed", type: "bool" },
      { name: "totalSupply", type: "uint256" },
      { name: "creationBlock", type: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "proposalDescriptions",
    inputs: [{ name: "proposalId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "state",
    inputs: [{ name: "proposalId", type: "uint256" }],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
  },
] as const;

// ============================================================================
// TYPES
// ============================================================================

export interface NounsAuction {
  nounId: number;
  amount: bigint;
  startTime: number;
  endTime: number;
  bidder: string;
  settled: boolean;
  imageUrl: string;
  dao: "nouns" | "lilnouns";
}

export interface NounsProposal {
  id: number;
  proposer: string;
  forVotes: number;
  againstVotes: number;
  abstainVotes: number;
  quorumVotes: number;
  startBlock: number;
  endBlock: number;
  eta: number;
  canceled: boolean;
  vetoed: boolean;
  executed: boolean;
  totalSupply: number;
  status: string;
  description: string;
  title: string;
  dao: "nouns" | "lilnouns";
}

// ============================================================================
// FETCHERS — Server-side, called from RSC pages
// ============================================================================

function mapProposalState(stateNum: number): string {
  const states = [
    "Pending",     // 0
    "Active",      // 1
    "Canceled",    // 2
    "Defeated",    // 3
    "Succeeded",   // 4
    "Queued",      // 5
    "Expired",     // 6
    "Executed",    // 7
    "Vetoed",      // 8
    "ObjectionPeriod", // 9
    "Updatable",   // 10
  ];
  return states[stateNum] || "Unknown";
}

export async function fetchNounsAuction(): Promise<NounsAuction | null> {
  try {
    const data = await client.readContract({
      address: NOUNS_CONTRACTS.auctionHouse,
      abi: AUCTION_HOUSE_ABI,
      functionName: "auction",
    });

    const auction = data as any;
    const nounId = Number(auction.nounId ?? auction[0]);
    return {
      nounId,
      amount: BigInt(auction.amount ?? auction[1]),
      startTime: Number(auction.startTime ?? auction[2]),
      endTime: Number(auction.endTime ?? auction[3]),
      bidder: (auction.bidder ?? auction[4]) as string,
      settled: Boolean(auction.settled ?? auction[5]),
      imageUrl: `https://noun.pics/${nounId}`,
      dao: "nouns",
    };
  } catch (e) {
    console.error("Failed to fetch Nouns auction:", e);
    return null;
  }
}

export async function fetchLilNounsAuction(): Promise<NounsAuction | null> {
  try {
    const data = (await client.readContract({
      address: LIL_NOUNS_CONTRACTS.auctionHouse,
      abi: LIL_AUCTION_HOUSE_ABI,
      functionName: "auction",
    })) as unknown as any[];

    const nounId = Number(data[0]);
    return {
      nounId,
      amount: BigInt(data[1]),
      startTime: Number(data[2]),
      endTime: Number(data[3]),
      bidder: data[4] as string,
      settled: Boolean(data[5]),
      imageUrl: `https://noun.pics/${nounId}`, // lil nouns also on noun.pics
      dao: "lilnouns",
    };
  } catch (e) {
    console.error("Failed to fetch Lil Nouns auction:", e);
    return null;
  }
}

export async function fetchNounsProposals(count: number = 5): Promise<NounsProposal[]> {
  return fetchProposalsFromGovernor(NOUNS_CONTRACTS.governor, "nouns", count);
}


export async function fetchLilNounsProposals(count: number = 5): Promise<NounsProposal[]> {
  return fetchProposalsFromGovernor(LIL_NOUNS_CONTRACTS.governor, "lilnouns", count);
}

// ============================================================================
// SUBGRAPH — Fallback for proposal descriptions
// ============================================================================

// noun.wtf Ponder API — indexes Nouns onchain data including full descriptions
const NOUNS_PONDER_API =
  "https://spirited-flexibility-production-3c30.up.railway.app";

async function fetchDescriptionsFromSubgraph(
  ids: number[],
  dao: "nouns" | "lilnouns"
): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  if (ids.length === 0) return map;

  // Only Nouns DAO has a Ponder index; skip for Lil Nouns
  if (dao !== "nouns") return map;

  try {
    const idStrings = ids.map((id) => `"${id}"`);
    const res = await fetch(NOUNS_PONDER_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `{
          proposals(where: { id_in: [${idStrings.join(",")}] }, limit: ${ids.length}) {
            items { id description }
          }
        }`,
      }),
      next: { revalidate: 300 },
    });

    if (!res.ok) return map;
    const json = await res.json();
    const proposals = json?.data?.proposals?.items;
    if (Array.isArray(proposals)) {
      for (const p of proposals) {
        if (p.description) {
          map.set(Number(p.id), p.description);
        }
      }
    }
  } catch (e) {
    console.warn(`[nouns] Ponder description fallback failed:`, e);
  }

  return map;
}

// ============================================================================
// SHARED — Multicall-based proposal fetcher (single RPC round-trip)
// ============================================================================

async function fetchProposalsFromGovernor(
  governor: Address,
  dao: "nouns" | "lilnouns",
  count: number
): Promise<NounsProposal[]> {
  try {
    const totalCount = await client.readContract({
      address: governor,
      abi: GOVERNOR_ABI,
      functionName: "proposalCount",
    });

    const total = Number(totalCount);
    const start = Math.max(1, total - count + 1);
    const ids = Array.from({ length: Math.min(count, total) }, (_, i) => start + i).reverse();

    // Use multicall to batch all reads into one RPC call
    // Fetch proposals, state, AND descriptions in a single round-trip
    const calls = ids.flatMap((id) => [
      {
        address: governor,
        abi: GOVERNOR_ABI,
        functionName: "proposals" as const,
        args: [BigInt(id)],
      },
      {
        address: governor,
        abi: GOVERNOR_ABI,
        functionName: "state" as const,
        args: [BigInt(id)],
      },
      {
        address: governor,
        abi: GOVERNOR_ABI,
        functionName: "proposalDescriptions" as const,
        args: [BigInt(id)],
      },
    ]);

    const results = await client.multicall({ contracts: calls, allowFailure: true });

    const proposals: NounsProposal[] = [];
    const missingDescIds: number[] = [];

    for (let i = 0; i < ids.length; i++) {
      const proposalResult = results[i * 3];
      const stateResult = results[i * 3 + 1];
      const descResult = results[i * 3 + 2];

      if (proposalResult.status !== "success" || stateResult.status !== "success") continue;

      const p = proposalResult.result as unknown as any[];
      const id = ids[i];
      const prefix = dao === "nouns" ? "Proposal" : "Lil Proposal";

      // Parse description — title is typically the first markdown heading line
      const rawDesc = descResult.status === "success" ? String(descResult.result ?? "") : "";
      const descTitle = rawDesc
        .split("\n")[0]
        ?.replace(/^#+\s*/, "")
        .trim();
      const title = descTitle || `${prefix} ${id}`;

      if (!rawDesc) missingDescIds.push(id);

      proposals.push({
        id,
        proposer: p[1] as string,
        forVotes: Number(p[7]),
        againstVotes: Number(p[8]),
        abstainVotes: Number(p[9]),
        quorumVotes: Number(p[3]),
        startBlock: Number(p[5]),
        endBlock: Number(p[6]),
        eta: Number(p[4]),
        canceled: Boolean(p[10]),
        vetoed: Boolean(p[11]),
        executed: Boolean(p[12]),
        totalSupply: Number(p[13]),
        status: mapProposalState(Number(stateResult.result)),
        description: rawDesc,
        title,
        dao,
      });
    }

    // Backfill empty descriptions from subgraph
    if (missingDescIds.length > 0) {
      const subgraphDescs = await fetchDescriptionsFromSubgraph(missingDescIds, dao);
      for (const prop of proposals) {
        if (!prop.description && subgraphDescs.has(prop.id)) {
          prop.description = subgraphDescs.get(prop.id)!;
          // Re-derive title from description
          const descTitle = prop.description
            .split("\n")[0]
            ?.replace(/^#+\s*/, "")
            .trim();
          if (descTitle) prop.title = descTitle;
        }
      }
    }

    return proposals;
  } catch (e) {
    console.error(`Failed to fetch ${dao} proposals:`, e);
    return [];
  }
}

// ============================================================================
// DIRECT SINGLE-PROPOSAL FETCH — Fetch one proposal by numeric ID
// ============================================================================

async function fetchSingleProposalFromGovernor(
  governor: Address,
  dao: "nouns" | "lilnouns",
  proposalId: number
): Promise<NounsProposal | null> {
  try {
    const calls = [
      {
        address: governor,
        abi: GOVERNOR_ABI,
        functionName: "proposals" as const,
        args: [BigInt(proposalId)],
      },
      {
        address: governor,
        abi: GOVERNOR_ABI,
        functionName: "state" as const,
        args: [BigInt(proposalId)],
      },
      {
        address: governor,
        abi: GOVERNOR_ABI,
        functionName: "proposalDescriptions" as const,
        args: [BigInt(proposalId)],
      },
    ];

    const results = await client.multicall({ contracts: calls, allowFailure: true });
    const proposalResult = results[0];
    const stateResult = results[1];
    const descResult = results[2];

    if (proposalResult.status !== "success" || stateResult.status !== "success") return null;

    const p = proposalResult.result as unknown as any[];
    const prefix = dao === "nouns" ? "Proposal" : "Lil Proposal";

    let rawDesc = descResult.status === "success" ? String(descResult.result ?? "") : "";

    // Subgraph fallback for empty descriptions
    if (!rawDesc && dao === "nouns") {
      const subgraphDescs = await fetchDescriptionsFromSubgraph([proposalId], dao);
      rawDesc = subgraphDescs.get(proposalId) || "";
    }

    const descTitle = rawDesc
      .split("\n")[0]
      ?.replace(/^#+\s*/, "")
      .trim();
    const title = descTitle || `${prefix} ${proposalId}`;

    return {
      id: proposalId,
      proposer: p[1] as string,
      forVotes: Number(p[7]),
      againstVotes: Number(p[8]),
      abstainVotes: Number(p[9]),
      quorumVotes: Number(p[3]),
      startBlock: Number(p[5]),
      endBlock: Number(p[6]),
      eta: Number(p[4]),
      canceled: Boolean(p[10]),
      vetoed: Boolean(p[11]),
      executed: Boolean(p[12]),
      totalSupply: Number(p[13]),
      status: mapProposalState(Number(stateResult.result)),
      description: rawDesc,
      title,
      dao,
    };
  } catch (e) {
    console.error(`Failed to fetch ${dao} proposal #${proposalId}:`, e);
    return null;
  }
}

export async function fetchNounsProposalDirect(proposalId: number): Promise<NounsProposal | null> {
  return fetchSingleProposalFromGovernor(NOUNS_CONTRACTS.governor, "nouns", proposalId);
}

export async function fetchLilNounsProposalDirect(proposalId: number): Promise<NounsProposal | null> {
  return fetchSingleProposalFromGovernor(LIL_NOUNS_CONTRACTS.governor, "lilnouns", proposalId);
}
