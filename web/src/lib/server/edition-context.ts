import "server-only";

import type { Address } from "viem";
import { computeEntityHash } from "@/lib/entity";
import {
  getArchivedEditorial,
  type ArchivedEditorial,
} from "@/lib/editorial-archive";
import {
  POOTER_AUCTIONS_ABI,
  POOTER_AUCTIONS_ADDRESS,
  POOTER_EDITIONS_ABI,
  POOTER_EDITIONS_ADDRESS,
  ZERO_ADDRESS,
} from "@/lib/contracts";
import { baseContractsPublicClient } from "./onchain-clients";

export const EDITION_EPOCH = 1741651200;
export const EDITION_SECONDS_PER_DAY = 86400;
export const ZERO_CONTENT_HASH =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

interface OnchainEditionRecord {
  owner: Address | null;
  contentHash: string | null;
  dailyTitle: string | null;
}

interface AuctionRecord {
  exists: boolean;
  contentHash: string | null;
  dailyTitle: string | null;
}

export interface EditionContext {
  tokenId: number;
  editionDate: Date;
  dateStr: string;
  editorialHash: string;
  editorial: ArchivedEditorial | null;
  officialTitle: string | null;
  officialContentHash: string | null;
  owner: Address | null;
  isMinted: boolean;
  auctionExists: boolean;
  onchainTitle: string | null;
  onchainContentHash: string | null;
  auctionTitle: string | null;
  auctionContentHash: string | null;
  communityTitle: string | null;
  communityContentHash: string | null;
}

function normalizeTitle(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function isZeroContentHash(value: string | null | undefined): boolean {
  return !value || /^0x0{64}$/i.test(value.trim());
}

function normalizeContentHash(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || isZeroContentHash(trimmed)) return null;
  return trimmed;
}

async function readOnchainEdition(tokenId: number): Promise<OnchainEditionRecord> {
  if (POOTER_EDITIONS_ADDRESS === ZERO_ADDRESS) {
    return { owner: null, contentHash: null, dailyTitle: null };
  }

  try {
    const owner = await baseContractsPublicClient.readContract({
      address: POOTER_EDITIONS_ADDRESS,
      abi: POOTER_EDITIONS_ABI,
      functionName: "ownerOf",
      args: [BigInt(tokenId)],
    });

    const [contentHash, , dailyTitle] = await baseContractsPublicClient.readContract({
      address: POOTER_EDITIONS_ADDRESS,
      abi: POOTER_EDITIONS_ABI,
      functionName: "getEdition",
      args: [BigInt(tokenId)],
    });

    return {
      owner,
      contentHash: normalizeContentHash(contentHash),
      dailyTitle: normalizeTitle(dailyTitle),
    };
  } catch {
    return { owner: null, contentHash: null, dailyTitle: null };
  }
}

async function readAuction(tokenId: number): Promise<AuctionRecord> {
  if (POOTER_AUCTIONS_ADDRESS === ZERO_ADDRESS) {
    return { exists: false, contentHash: null, dailyTitle: null };
  }

  try {
    const auction = await baseContractsPublicClient.readContract({
      address: POOTER_AUCTIONS_ADDRESS,
      abi: POOTER_AUCTIONS_ABI,
      functionName: "auctions",
      args: [BigInt(tokenId)],
    });

    if (auction[0] === 0n) {
      return { exists: false, contentHash: null, dailyTitle: null };
    }

    return {
      exists: true,
      contentHash: normalizeContentHash(auction[4]),
      dailyTitle: normalizeTitle(auction[5]),
    };
  } catch {
    return { exists: false, contentHash: null, dailyTitle: null };
  }
}

export async function getEditionContext(tokenId: number): Promise<EditionContext> {
  const editionTimestamp = EDITION_EPOCH + (tokenId - 1) * EDITION_SECONDS_PER_DAY;
  const editionDate = new Date(editionTimestamp * 1000);
  const dateStr = editionDate.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const year = editionDate.getUTCFullYear();
  const month = String(editionDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(editionDate.getUTCDate()).padStart(2, "0");
  const dailyId = `pooter-daily-${year}-${month}-${day}`;
  const editorialHash = computeEntityHash(dailyId);

  const [editorial, onchain, auction] = await Promise.all([
    getArchivedEditorial(editorialHash).catch(() => null),
    readOnchainEdition(tokenId),
    readAuction(tokenId),
  ]);

  const officialTitle =
    normalizeTitle(editorial?.dailyTitle) ??
    normalizeTitle(editorial?.primary.title);
  const officialContentHash = normalizeContentHash(editorial?.contentHash);
  const communityTitle = auction.exists
    ? onchain.dailyTitle ?? auction.dailyTitle
    : null;
  const communityContentHash = auction.exists
    ? onchain.contentHash ?? auction.contentHash
    : null;

  return {
    tokenId,
    editionDate,
    dateStr,
    editorialHash,
    editorial,
    officialTitle,
    officialContentHash,
    owner: onchain.owner,
    isMinted: !!onchain.owner,
    auctionExists: auction.exists,
    onchainTitle: onchain.dailyTitle,
    onchainContentHash: onchain.contentHash,
    auctionTitle: auction.dailyTitle,
    auctionContentHash: auction.contentHash,
    communityTitle,
    communityContentHash,
  };
}
