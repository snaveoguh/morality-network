import "server-only";

import {
  createWalletClient,
  http,
  keccak256,
  type Address,
  type Hash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";
import {
  baseContractsPublicClient,
  getBaseContractsRpcUrl,
} from "./onchain-clients";
import {
  POOTER_IMAGE_VAULT_ADDRESS,
  POOTER_IMAGE_VAULT_ABI,
} from "@/lib/contracts";
import { uploadToIPFS, type IPFSUploadResult } from "@/lib/ipfs-upload";

// ============================================================================
// IMAGE VAULT — Server-side IPFS upload + on-chain mint
//
// This module handles the full pipeline:
//   1. Upload image to IPFS (Pinata)
//   2. Mint on PooterImageVault contract (Base Sepolia for dev)
//   3. Return CID + tokenId for storage
//
// Requires:
//   AGENT_PRIVATE_KEY — server wallet that owns the ImageVault contract
//   PINATA_JWT — Pinata API key for IPFS pinning
// ============================================================================

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

interface MintImageResult {
  cid: string;
  ipfsUrl: string;
  gatewayUrl: string;
  tokenId: bigint;
  txHash: Hash;
  contentHash: Hash;
}

/**
 * Get the chain for contract interactions, based on env config.
 */
function getContractsChain() {
  const chainId = Number(
    process.env.CONTRACTS_CHAIN_ID ||
      process.env.NEXT_PUBLIC_CONTRACTS_CHAIN_ID ||
      base.id,
  );
  return chainId === baseSepolia.id ? baseSepolia : base;
}

/**
 * Create a wallet client for server-side transactions.
 * Uses AGENT_PRIVATE_KEY env var.
 */
function getAgentWalletClient() {
  const privateKey = process.env.AGENT_PRIVATE_KEY?.trim();
  if (!privateKey) {
    throw new Error("AGENT_PRIVATE_KEY not configured — cannot mint images");
  }

  const account = privateKeyToAccount(
    privateKey.startsWith("0x")
      ? (privateKey as `0x${string}`)
      : (`0x${privateKey}` as `0x${string}`),
  );

  const chain = getContractsChain();

  return createWalletClient({
    account,
    chain,
    transport: http(getBaseContractsRpcUrl(), { timeout: 15_000 }),
  });
}

/**
 * Check if the ImageVault contract is configured and ready.
 */
export function isImageVaultEnabled(): boolean {
  return (
    !!POOTER_IMAGE_VAULT_ADDRESS &&
    POOTER_IMAGE_VAULT_ADDRESS !== ZERO_ADDRESS &&
    !!process.env.AGENT_PRIVATE_KEY?.trim() &&
    !!process.env.PINATA_JWT?.trim()
  );
}

/**
 * Upload an image to IPFS and mint it on PooterImageVault.
 *
 * Full pipeline: base64 → Buffer → Pinata IPFS → on-chain mint.
 *
 * @param base64Image - Base64-encoded image data (no data: prefix)
 * @param name - Human-readable name for the image
 * @param editionNumber - Optional link to PooterEditions tokenId
 * @returns Mint result with CID, tokenId, txHash
 */
export async function mintImage(
  base64Image: string,
  name: string,
  editionNumber?: number,
): Promise<MintImageResult> {
  if (!isImageVaultEnabled()) {
    throw new Error(
      "ImageVault not enabled — check POOTER_IMAGE_VAULT_ADDRESS, AGENT_PRIVATE_KEY, PINATA_JWT",
    );
  }

  // 1. Convert base64 to buffer
  const imageBuffer = Buffer.from(base64Image, "base64");
  const contentHash = keccak256(imageBuffer);

  console.log(
    `[image-vault] Minting "${name}" (${Math.round(imageBuffer.length / 1024)}KB, edition: ${editionNumber ?? "standalone"})`,
  );

  // 2. Upload to IPFS via Pinata
  const ipfs: IPFSUploadResult = await uploadToIPFS(imageBuffer, {
    name,
    editionNumber,
  });

  // 3. Mint on-chain
  const walletClient = getAgentWalletClient();

  const txHash = await walletClient.writeContract({
    address: POOTER_IMAGE_VAULT_ADDRESS,
    abi: POOTER_IMAGE_VAULT_ABI,
    functionName: "mint",
    args: [ipfs.cid, contentHash, BigInt(editionNumber ?? 0)],
  });

  console.log(`[image-vault] Mint tx submitted: ${txHash}`);

  // 4. Wait for receipt to get the tokenId from events
  const receipt = await baseContractsPublicClient.waitForTransactionReceipt({
    hash: txHash,
    timeout: 30_000,
  });

  // Parse ImageMinted event to get tokenId
  let tokenId = 0n;
  for (const log of receipt.logs) {
    // ImageMinted(uint256 indexed tokenId, string ipfsCID, bytes32 contentHash, uint256 indexed editionNumber)
    // Topic 0 = event signature, Topic 1 = tokenId, Topic 2 = editionNumber
    if (log.topics.length >= 2 && log.address.toLowerCase() === POOTER_IMAGE_VAULT_ADDRESS.toLowerCase()) {
      tokenId = BigInt(log.topics[1] ?? "0");
      break;
    }
  }

  console.log(
    `[image-vault] Minted! tokenId=${tokenId}, cid=${ipfs.cid}, tx=${txHash}`,
  );

  return {
    cid: ipfs.cid,
    ipfsUrl: ipfs.ipfsUrl,
    gatewayUrl: ipfs.gatewayUrl,
    tokenId,
    txHash,
    contentHash,
  };
}

/**
 * Look up the IPFS CID for an edition's illustration from on-chain data.
 */
export async function getEditionImageCID(
  editionNumber: number,
): Promise<string | null> {
  if (
    !POOTER_IMAGE_VAULT_ADDRESS ||
    POOTER_IMAGE_VAULT_ADDRESS === ZERO_ADDRESS
  ) {
    return null;
  }

  try {
    const cid = (await baseContractsPublicClient.readContract({
      address: POOTER_IMAGE_VAULT_ADDRESS,
      abi: POOTER_IMAGE_VAULT_ABI,
      functionName: "getImageByEdition",
      args: [BigInt(editionNumber)],
    })) as string;

    return cid || null;
  } catch {
    return null;
  }
}
