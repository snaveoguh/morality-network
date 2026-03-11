// Nouns DAO Candidate Proposals — fetched directly from chain via event logs
// NounsDAODataProxy: 0xf790A5f59678dd733fb3De93493A91f472ca1365
// NounsDAOLogicV3:   0xdD1492570beb290a2f309541e1fDdcaAA3f00B61

import {
  createPublicClient,
  http,
  type Address,
  type PublicClient,
} from "viem";
import { mainnet } from "viem/chains";

// ============================================================================
// RPC CONFIGURATION
// ============================================================================

const PRIMARY_RPC = "https://ethereum-rpc.publicnode.com";
const FALLBACK_RPC = "https://ethereum.blockpi.network/v1/rpc/public";

/** Max block range per eth_getLogs request (safe under 50k public RPC limit) */
const CHUNK_SIZE = BigInt(40_000);

/** Number of retry attempts per chunk request */
const MAX_RETRIES = 3;

/** Base delay in ms for exponential backoff */
const BASE_DELAY_MS = 1_000;

// ============================================================================
// PUBLIC CLIENTS (primary + fallback)
// ============================================================================

const client = createPublicClient({
  chain: mainnet,
  transport: http(PRIMARY_RPC),
});

const fallbackClient = createPublicClient({
  chain: mainnet,
  transport: http(FALLBACK_RPC),
});

// ============================================================================
// CHUNKED LOG FETCHING WITH RETRY + FALLBACK
// ============================================================================

/**
 * Sleep helper for exponential backoff.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch logs for a single chunk with retry logic + RPC fallback.
 * Tries the primary RPC up to MAX_RETRIES times with exponential backoff,
 * then falls back to the secondary RPC with the same retry strategy.
 */
async function fetchChunkWithRetry(
  getLogsFn: () => Promise<any[]>,
  fallbackGetLogsFn: () => Promise<any[]>
): Promise<any[]> {
  // Try primary RPC first
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await getLogsFn();
    } catch (err) {
      const isLast = attempt === MAX_RETRIES - 1;
      if (!isLast) {
        await sleep(BASE_DELAY_MS * 2 ** attempt);
      }
    }
  }

  // Primary exhausted — try fallback RPC
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fallbackGetLogsFn();
    } catch (err) {
      const isLast = attempt === MAX_RETRIES - 1;
      if (!isLast) {
        await sleep(BASE_DELAY_MS * 2 ** attempt);
      }
      if (isLast) {
        throw err; // All retries on both RPCs exhausted
      }
    }
  }

  return []; // Unreachable, but satisfies TypeScript
}

/**
 * Fetch event logs in safe chunks of CHUNK_SIZE blocks.
 * Wraps viem's `getLogs` to split the block range into multiple requests
 * so public RPCs don't reject for exceeding their block-range limit (50k).
 *
 * The `events` ABI array is passed through to each chunk request, so
 * SignatureAdded, ProposalCandidateCreated, etc. all work correctly.
 */
async function getLogsChunked(params: {
  address: Address;
  events: readonly any[];
  fromBlock: bigint;
  toBlock: bigint;
}): Promise<any[]> {
  const { address, events, fromBlock, toBlock } = params;
  const allLogs: any[] = [];

  let cursor = fromBlock;
  while (cursor <= toBlock) {
    const ONE = BigInt(1);
    const chunkEnd =
      cursor + CHUNK_SIZE - ONE > toBlock
        ? toBlock
        : cursor + CHUNK_SIZE - ONE;

    const chunkFrom = cursor;
    const chunkTo = chunkEnd;

    const logs = await fetchChunkWithRetry(
      () =>
        client.getLogs({
          address,
          events: events as any,
          fromBlock: chunkFrom,
          toBlock: chunkTo,
        }),
      () =>
        fallbackClient.getLogs({
          address,
          events: events as any,
          fromBlock: chunkFrom,
          toBlock: chunkTo,
        })
    );
    allLogs.push(...logs);

    cursor = chunkEnd + ONE;
  }

  return allLogs;
}

// ============================================================================
// CONTRACT ADDRESSES
// ============================================================================

export const NOUNS_DAO_DATA_PROXY =
  "0xf790A5f59678dd733fb3De93493A91f472ca1365" as Address;

// The DAO proxy delegates to LogicV3 — use proxy address for reads + writes
export const NOUNS_DAO_LOGIC_V3 =
  "0x6f3E6272A167e8AcCb32072d08E0957F9c79223d" as Address;

// probe.wtf client ID — used when promoting via proposeBySigs
export const PROMOTE_CLIENT_ID = 9;

// ============================================================================
// ABIs
// ============================================================================

const PROPOSAL_CANDIDATE_CREATED_ABI = [
  {
    type: "event",
    name: "ProposalCandidateCreated",
    inputs: [
      { name: "msgSender", type: "address", indexed: true },
      { name: "targets", type: "address[]", indexed: false },
      { name: "values", type: "uint256[]", indexed: false },
      { name: "signatures", type: "string[]", indexed: false },
      { name: "calldatas", type: "bytes[]", indexed: false },
      { name: "description", type: "string", indexed: false },
      { name: "slug", type: "string", indexed: false },
      { name: "proposalIdToUpdate", type: "uint256", indexed: false },
      { name: "encodedProposalHash", type: "bytes32", indexed: false },
    ],
  },
] as const;

const SIGNATURE_ADDED_ABI = [
  {
    type: "event",
    name: "SignatureAdded",
    inputs: [
      { name: "signer", type: "address", indexed: true },
      { name: "sig", type: "bytes", indexed: false },
      { name: "expirationTimestamp", type: "uint256", indexed: false },
      { name: "proposer", type: "address", indexed: false },
      { name: "slug", type: "string", indexed: false },
      { name: "proposalIdToUpdate", type: "uint256", indexed: false },
      { name: "encodedPropHash", type: "bytes32", indexed: false },
      { name: "sigDigest", type: "bytes32", indexed: false },
      { name: "reason", type: "string", indexed: false },
    ],
  },
] as const;

const CANDIDATE_CANCELED_ABI = [
  {
    type: "event",
    name: "ProposalCandidateCanceled",
    inputs: [
      { name: "msgSender", type: "address", indexed: true },
      { name: "slug", type: "string", indexed: false },
    ],
  },
] as const;

const GOVERNOR_THRESHOLD_ABI = [
  {
    type: "function",
    name: "proposalThreshold",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

// proposeBySigs with clientId support
export const PROPOSE_BY_SIGS_ABI = [
  {
    type: "function",
    name: "proposeBySigs",
    inputs: [
      {
        name: "proposerSignatures",
        type: "tuple[]",
        components: [
          { name: "sig", type: "bytes" },
          { name: "signer", type: "address" },
          { name: "expirationTimestamp", type: "uint256" },
        ],
      },
      { name: "targets", type: "address[]" },
      { name: "values", type: "uint256[]" },
      { name: "signatures", type: "string[]" },
      { name: "calldatas", type: "bytes[]" },
      { name: "description", type: "string" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "nonpayable",
  },
] as const;

// addSignature on NounsDAODataProxy
export const ADD_SIGNATURE_ABI = [
  {
    type: "function",
    name: "addSignature",
    inputs: [
      { name: "sig", type: "bytes" },
      { name: "expirationTimestamp", type: "uint256" },
      { name: "proposer", type: "address" },
      { name: "slug", type: "string" },
      { name: "proposalIdToUpdate", type: "uint256" },
      { name: "encodedPropHash", type: "bytes32" },
      { name: "sigDigest", type: "bytes32" },
      { name: "reason", type: "string" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

// ============================================================================
// TYPES
// ============================================================================

export interface CandidateProposal {
  slug: string;
  proposer: string;
  description: string;
  title: string;
  targets: string[];
  values: string[];
  signatures: string[];
  calldatas: string[];
  createdBlock: number;
  createdTimestamp: number;
  encodedProposalHash: string;
  proposalIdToUpdate: number;
  sponsorSignatures: SponsorSignature[];
  signatureCount: number;
  requiredThreshold: number;
  isPromotable: boolean;
}

export interface SponsorSignature {
  signer: string;
  sig: string; // raw signature bytes (hex)
  expirationTimestamp: number;
  reason: string;
  encodedPropHash: string;
  sigDigest: string;
}

// ============================================================================
// FETCHER — Scan event logs for candidate proposals + signatures
// ============================================================================

export async function fetchCandidateProposals(
  lookbackBlocks: number = 50000
): Promise<CandidateProposal[]> {
  try {
    const currentBlock = await client.getBlockNumber();
    const fromBlock = currentBlock - BigInt(lookbackBlocks);

    // Read proposal threshold from Governor
    const threshold = await client.readContract({
      address: NOUNS_DAO_LOGIC_V3,
      abi: GOVERNOR_THRESHOLD_ABI,
      functionName: "proposalThreshold",
    });
    const requiredThreshold = Number(threshold);

    // Fetch events using chunked log fetching (safe for public RPCs).
    // Each event type is fetched sequentially across its chunk range,
    // but the three event types run in parallel.
    const [createdLogs, signatureLogs, canceledLogs] = await Promise.all([
      getLogsChunked({
        address: NOUNS_DAO_DATA_PROXY,
        events: PROPOSAL_CANDIDATE_CREATED_ABI,
        fromBlock,
        toBlock: currentBlock,
      }),
      getLogsChunked({
        address: NOUNS_DAO_DATA_PROXY,
        events: SIGNATURE_ADDED_ABI,
        fromBlock,
        toBlock: currentBlock,
      }),
      getLogsChunked({
        address: NOUNS_DAO_DATA_PROXY,
        events: CANDIDATE_CANCELED_ABI,
        fromBlock,
        toBlock: currentBlock,
      }),
    ]);

    // Build set of canceled candidates
    const canceledKeys = new Set<string>();
    for (const log of canceledLogs) {
      const args = log.args as any;
      canceledKeys.add(`${args.msgSender}-${args.slug}`);
    }

    // Build candidate map
    const candidates = new Map<string, CandidateProposal>();

    for (const log of createdLogs) {
      const args = log.args as any;
      const key = `${args.msgSender}-${args.slug}`;

      // Skip canceled candidates
      if (canceledKeys.has(key)) continue;

      const description = args.description || "";
      // Parse title from first line of description (markdown heading)
      const title =
        description
          .split("\n")[0]
          ?.replace(/^#+\s*/, "")
          .trim() || args.slug || "Untitled";

      candidates.set(key, {
        slug: args.slug,
        proposer: args.msgSender,
        description,
        title,
        targets: (args.targets || []).map(String),
        values: (args.values || []).map(String),
        signatures: args.signatures || [],
        calldatas: (args.calldatas || []).map(String),
        createdBlock: Number(log.blockNumber),
        createdTimestamp: 0,
        encodedProposalHash: args.encodedProposalHash || "",
        proposalIdToUpdate: Number(args.proposalIdToUpdate || 0),
        sponsorSignatures: [],
        signatureCount: 0,
        requiredThreshold,
        isPromotable: false,
      });
    }

    // Attach signatures to candidates
    for (const log of signatureLogs) {
      const args = log.args as any;
      const key = `${args.proposer}-${args.slug}`;
      const candidate = candidates.get(key);
      if (!candidate) continue;

      // Check if signature is still valid (not expired)
      const now = Math.floor(Date.now() / 1000);
      const expiry = Number(args.expirationTimestamp);
      if (expiry > 0 && expiry < now) continue;

      candidate.sponsorSignatures.push({
        signer: args.signer,
        sig: args.sig || "0x",
        expirationTimestamp: expiry,
        reason: args.reason || "",
        encodedPropHash: args.encodedPropHash || "",
        sigDigest: args.sigDigest || "",
      });
    }

    // Calculate signature counts and promotability
    for (const candidate of candidates.values()) {
      // Deduplicate by signer (keep latest)
      const signerMap = new Map<string, SponsorSignature>();
      for (const sig of candidate.sponsorSignatures) {
        signerMap.set(sig.signer.toLowerCase(), sig);
      }
      candidate.sponsorSignatures = Array.from(signerMap.values());
      candidate.signatureCount = candidate.sponsorSignatures.length;
      candidate.isPromotable =
        candidate.signatureCount >= candidate.requiredThreshold;
    }

    // Return newest first
    return Array.from(candidates.values()).sort(
      (a, b) => b.createdBlock - a.createdBlock
    );
  } catch (e) {
    console.error("Failed to fetch candidate proposals:", e);
    return [];
  }
}
