/**
 * pooter1 on-chain interface — wraps @pooter/sdk for Base L2 interactions.
 * Rates URLs, posts comments, registers entities on-chain.
 */
import {
  createWalletClient,
  createPublicClient,
  http,
  type Address,
  type Chain,
  keccak256,
  toBytes,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { POOTER1_PRIVATE_KEY, BASE_RPC } from "./config.js";

// ── Contract addresses (Base mainnet) ───────────────────────────────
const CONTRACTS = {
  registry: "0x2ea7502C4db5B8cfB329d8a9866EB6705b036608" as Address,
  ratings: "0x29F66D8b15326cE7232c0277DBc2CbFDaaf93405" as Address,
  comments: "0x66BA3cE1280bF86DFe957B52e9888A1De7F81d7b" as Address,
  tipping: "0x27c79A57BE68EB62c9C6bB19875dB76D33FD099B" as Address,
};

// ── Minimal ABIs ────────────────────────────────────────────────────
const REGISTRY_ABI = [
  {
    type: "function" as const,
    name: "registerEntity",
    inputs: [
      { name: "identifier", type: "string" },
      { name: "entityType", type: "uint8" },
    ],
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "nonpayable" as const,
  },
  {
    type: "function" as const,
    name: "getEntity",
    inputs: [{ name: "entityHash", type: "bytes32" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "entityHash", type: "bytes32" },
          { name: "entityType", type: "uint8" },
          { name: "identifier", type: "string" },
          { name: "registeredBy", type: "address" },
          { name: "claimedOwner", type: "address" },
          { name: "createdAt", type: "uint256" },
          { name: "exists", type: "bool" },
        ],
      },
    ],
    stateMutability: "view" as const,
  },
] as const;

const RATINGS_ABI = [
  {
    type: "function" as const,
    name: "rateWithReason",
    inputs: [
      { name: "entityHash", type: "bytes32" },
      { name: "score", type: "uint8" },
      { name: "reason", type: "string" },
    ],
    outputs: [],
    stateMutability: "nonpayable" as const,
  },
] as const;

const COMMENTS_ABI = [
  {
    type: "function" as const,
    name: "comment",
    inputs: [
      { name: "entityHash", type: "bytes32" },
      { name: "content", type: "string" },
      { name: "parentId", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "nonpayable" as const,
  },
] as const;

// ── Client setup ────────────────────────────────────────────────────

function getClients() {
  if (!POOTER1_PRIVATE_KEY) {
    return null;
  }

  const account = privateKeyToAccount(POOTER1_PRIVATE_KEY as `0x${string}`);

  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http(BASE_RPC),
  });

  const publicClient = createPublicClient({
    chain: base,
    transport: http(BASE_RPC),
  });

  return { walletClient, publicClient, account };
}

function entityHash(identifier: string): `0x${string}` {
  return keccak256(toBytes(identifier));
}

export { entityHash };

// ── Public API ──────────────────────────────────────────────────────

export async function ensureEntityRegistered(identifier: string): Promise<`0x${string}`> {
  const clients = getClients();
  const hash = entityHash(identifier);

  if (!clients) {
    console.log(`[pooter1:onchain] No wallet — skipping registration for ${identifier.slice(0, 40)}`);
    return hash;
  }

  // Check if already registered — getEntity reverts if not found
  let exists = false;
  try {
    await clients.publicClient.readContract({
      address: CONTRACTS.registry,
      abi: REGISTRY_ABI,
      functionName: "getEntity",
      args: [hash],
    });
    exists = true;
  } catch {
    // Entity doesn't exist — need to register
  }

  if (exists) return hash;

  try {
    // Register as URL entity (type 0)
    const txHash = await clients.walletClient.writeContract({
      address: CONTRACTS.registry,
      abi: REGISTRY_ABI,
      functionName: "registerEntity",
      args: [identifier, 0],
    });

    // Wait for confirmation before sending follow-up txs (avoids nonce collision)
    await clients.publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log(`[pooter1:onchain] Registered entity: ${txHash}`);
    return hash;
  } catch (err: any) {
    console.warn(`[pooter1:onchain] Registration failed: ${err.message?.slice(0, 100)}`);
    return hash;
  }
}

export async function rateOnChain(
  identifier: string,
  score: 1 | 2 | 3 | 4 | 5,
  reason: string,
): Promise<string | null> {
  const clients = getClients();
  if (!clients) {
    console.log(`[pooter1:onchain] No wallet — skipping rate`);
    return null;
  }

  const hash = await ensureEntityRegistered(identifier);

  try {
    const txHash = await clients.walletClient.writeContract({
      address: CONTRACTS.ratings,
      abi: RATINGS_ABI,
      functionName: "rateWithReason",
      args: [hash, score, reason.slice(0, 500)],
    });

    console.log(`[pooter1:onchain] Rated ${identifier.slice(0, 30)} → ${score}/5: ${txHash}`);
    return txHash;
  } catch (err: any) {
    console.warn(`[pooter1:onchain] Rate failed: ${err.message}`);
    return null;
  }
}

export async function commentOnChain(
  identifier: string,
  content: string,
  parentId = 0n,
): Promise<string | null> {
  const clients = getClients();
  if (!clients) {
    console.log(`[pooter1:onchain] No wallet — skipping comment`);
    return null;
  }

  const hash = await ensureEntityRegistered(identifier);

  try {
    const txHash = await clients.walletClient.writeContract({
      address: CONTRACTS.comments,
      abi: COMMENTS_ABI,
      functionName: "comment",
      args: [hash, content.slice(0, 2000), parentId],
    });

    // Wait for confirmation to avoid nonce collisions on sequential comments
    await clients.publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log(`[pooter1:onchain] Commented on ${identifier.slice(0, 30)}: ${txHash}`);
    return txHash;
  } catch (err: any) {
    console.warn(`[pooter1:onchain] Comment failed: ${err.message}`);
    return null;
  }
}

export function getAgentAddress(): string | null {
  if (!POOTER1_PRIVATE_KEY) return null;
  const account = privateKeyToAccount(POOTER1_PRIVATE_KEY as `0x${string}`);
  return account.address;
}
