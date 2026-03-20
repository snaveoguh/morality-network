// ============================================================================
// RARE PEPE DATA LAYER — XChain + Seaport marketplace via Ponder indexer
//
// Replaced dead Reservoir Protocol API (shut down Oct 2025) with direct
// Seaport 1.6 orders stored in the morality.network Ponder indexer.
// ============================================================================

import { type Address, formatEther } from "viem";
import { loadTtlValue, type TtlCacheEntry } from "./ttl-cache";
import pepeDirectoryData from "@/data/pepe-directory.json";

// ============================================================================
// TYPES
// ============================================================================

export interface PepeFeedItem {
  asset: string;
  imageUrl: string;
  series: number;
  card: number;
  supply: number;
  estimatedValueUsd: string | null;
  listedPriceEth: string | null;
  emblemTokenId: string | null;
  emblemContract: Address | null;
  sortTime: number;
  owner: Address | null;
  marketplaceUrl: string | null;
  /** Seaport order hash — present when listed via our marketplace */
  orderHash: string | null;
}

export interface PepeAssetDetail extends PepeFeedItem {
  description: string;
  issuer: string;
  locked: boolean;
  holderCount: number | null;
  dispensers: PepeDispenser[];
}

export interface PepeDispenser {
  source: string;
  satoshirate: number;
  giveQuantity: number;
  escrowQuantity: number;
  status: number;
}

export interface PepeDirectoryEntry {
  asset: string;
  series: number;
  card: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const XCHAIN_BASE = "https://xchain.io/api";
const EMBLEM_VAULT_LEGACY = "0x82c7a8f707110f5fbb16184a5933e9f78a34c6ab" as Address;
const EMBLEM_VAULT_CURATED = "0x7e6027a6a84fc1f6db6782c523efe62c923e46ff" as Address;

// ============================================================================
// INDEXER URL — server-side config
// ============================================================================

function getIndexerUrl(): string {
  return (
    process.env.INDEXER_BACKEND_URL ||
    process.env.ARCHIVE_BACKEND_URL ||
    process.env.SCANNER_BACKEND_URL ||
    ""
  ).replace(/\\n/g, "").replace(/\/$/, "");
}

// ============================================================================
// DIRECTORY — static list of all 1,774 cards
// ============================================================================

const _directory: PepeDirectoryEntry[] = pepeDirectoryData as PepeDirectoryEntry[];

export async function getPepeDirectory(): Promise<PepeDirectoryEntry[]> {
  return _directory;
}

export function getCardImageUrl(asset: string): string {
  return `/api/pepe/img/${asset}`;
}

export function getRarityLabel(supply: number): string {
  if (supply <= 100) return "Legendary";
  if (supply <= 300) return "Rare";
  if (supply <= 1000) return "Uncommon";
  return "Common";
}

// ============================================================================
// XCHAIN API — card metadata
// ============================================================================

export async function fetchAssetInfo(assetName: string): Promise<PepeAssetDetail | null> {
  try {
    const res = await fetch(`${XCHAIN_BASE}/asset/${assetName}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const data = await res.json();

    const directory = await getPepeDirectory();
    const entry = directory.find((e) => e.asset === assetName);

    return {
      asset: data.asset || assetName,
      imageUrl: getCardImageUrl(assetName),
      series: entry?.series ?? 0,
      card: entry?.card ?? 0,
      supply: Number(data.supply) || 0,
      estimatedValueUsd: data.estimated_value?.usd ?? null,
      listedPriceEth: null,
      emblemTokenId: null,
      emblemContract: null,
      sortTime: Date.now(),
      owner: null,
      marketplaceUrl: null,
      orderHash: null,
      description: data.description || "",
      issuer: data.issuer || "",
      locked: !!data.locked,
      holderCount: null,
      dispensers: [],
    };
  } catch {
    return null;
  }
}

export async function fetchAssetHolders(assetName: string): Promise<number> {
  try {
    const res = await fetch(`${XCHAIN_BASE}/holders/${assetName}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return 0;
    const data = await res.json();
    return Array.isArray(data.data) ? data.data.length : 0;
  } catch {
    return 0;
  }
}

export async function fetchAssetDispensers(assetName: string): Promise<PepeDispenser[]> {
  try {
    const res = await fetch(`${XCHAIN_BASE}/dispensers/${assetName}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data.data)) return [];
    return data.data
      .filter((d: Record<string, unknown>) => d.status === 0)
      .map((d: Record<string, unknown>) => ({
        source: String(d.source || ""),
        satoshirate: Number(d.satoshirate) || 0,
        giveQuantity: Number(d.give_quantity) || 0,
        escrowQuantity: Number(d.escrow_quantity) || 0,
        status: Number(d.status) || 0,
      }));
  } catch {
    return [];
  }
}

// ============================================================================
// MARKETPLACE API — Seaport orders from Ponder indexer
// ============================================================================

interface IndexerOrderResponse {
  orderHash: string;
  tokenContract: string;
  tokenId: string;
  maker: string;
  priceWei: string;
  expiresAt: number;
  status: string;
  orderJson: string;
  signature: string;
  collection: string;
  taker: string | null;
  txHash: string | null;
  createdAt: number;
}

/**
 * Fetch active marketplace orders for Emblem Vault collections from the indexer.
 */
async function fetchMarketplaceOrders(
  collection: "emblem-vault-legacy" | "emblem-vault-curated",
  limit: number = 50,
): Promise<IndexerOrderResponse[]> {
  const base = getIndexerUrl();
  if (!base) return [];

  try {
    const params = new URLSearchParams({
      collection,
      status: "ACTIVE",
      limit: String(limit),
    });

    const res = await fetch(`${base}/api/v1/marketplace/orders?${params}`, {
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.orders || []) as IndexerOrderResponse[];
  } catch {
    return [];
  }
}

/**
 * Convert an indexer marketplace order to a PepeFeedItem.
 */
function orderToPepeFeedItem(
  order: IndexerOrderResponse,
  directory: PepeDirectoryEntry[],
): PepeFeedItem {
  const contract = order.tokenContract as Address;
  const priceEth = formatEther(BigInt(order.priceWei));

  // Try to match the Emblem Vault token to a Rare Pepe card in our directory
  // For now, use the tokenId as fallback — enrichment happens via the detail endpoint
  const asset = `VAULT-${order.tokenId}`;

  return {
    asset,
    imageUrl: "",
    series: 0,
    card: 0,
    supply: 0,
    estimatedValueUsd: null,
    listedPriceEth: priceEth,
    emblemTokenId: order.tokenId,
    emblemContract: contract,
    sortTime: order.createdAt * 1000,
    owner: order.maker as Address,
    marketplaceUrl: `https://etherscan.io/nft/${contract}/${order.tokenId}`,
    orderHash: order.orderHash,
  };
}

// ============================================================================
// COMBINED FETCH — primary data source for feed + marketplace
// ============================================================================

export async function fetchPepeListings(
  limit: number = 40,
): Promise<PepeFeedItem[]> {
  const directory = await getPepeDirectory();

  // Fetch active orders from both Emblem Vault collections in parallel
  const [curated, legacy] = await Promise.all([
    fetchMarketplaceOrders("emblem-vault-curated", Math.ceil(limit / 2)),
    fetchMarketplaceOrders("emblem-vault-legacy", Math.ceil(limit / 2)),
  ]);

  const items: PepeFeedItem[] = [];

  for (const order of [...curated, ...legacy]) {
    const item = orderToPepeFeedItem(order, directory);
    items.push(item);
  }

  // Sort: listed items first (by price ascending), then unlisted
  items.sort((a, b) => {
    if (a.listedPriceEth && !b.listedPriceEth) return -1;
    if (!a.listedPriceEth && b.listedPriceEth) return 1;
    if (a.listedPriceEth && b.listedPriceEth) {
      return parseFloat(a.listedPriceEth) - parseFloat(b.listedPriceEth);
    }
    return 0;
  });

  // Fallback: if no marketplace orders exist yet, show random cards from directory
  if (items.length === 0 && directory.length > 0) {
    const shuffled = [...directory].sort(() => Math.random() - 0.5);
    for (const entry of shuffled.slice(0, limit)) {
      items.push({
        asset: entry.asset,
        imageUrl: getCardImageUrl(entry.asset),
        series: entry.series,
        card: entry.card,
        supply: 0,
        estimatedValueUsd: null,
        listedPriceEth: null,
        emblemTokenId: null,
        emblemContract: null,
        sortTime: Date.now(),
        owner: null,
        marketplaceUrl: null,
        orderHash: null,
      });
    }
  }

  return items.slice(0, limit);
}

// Full detail for a single asset (XChain + marketplace orders)
export async function fetchPepeDetail(assetName: string): Promise<PepeAssetDetail | null> {
  const [info, holders, dispensers] = await Promise.all([
    fetchAssetInfo(assetName),
    fetchAssetHolders(assetName),
    fetchAssetDispensers(assetName),
  ]);

  // Fallback to directory data if XChain is unavailable
  if (!info) {
    const directory = await getPepeDirectory();
    const entry = directory.find((e) => e.asset === assetName.toUpperCase());
    if (!entry) return null;
    return {
      asset: entry.asset,
      imageUrl: getCardImageUrl(entry.asset),
      series: entry.series,
      card: entry.card,
      supply: 0,
      estimatedValueUsd: null,
      listedPriceEth: null,
      emblemTokenId: null,
      emblemContract: null,
      sortTime: Date.now(),
      owner: null,
      marketplaceUrl: null,
      orderHash: null,
      description: "",
      issuer: "",
      locked: false,
      holderCount: null,
      dispensers: [],
    };
  }

  info.holderCount = holders;
  info.dispensers = dispensers;

  // Try to find active marketplace order for this card's Emblem Vault token
  try {
    const [curated, legacy] = await Promise.all([
      fetchMarketplaceOrders("emblem-vault-curated", 50),
      fetchMarketplaceOrders("emblem-vault-legacy", 50),
    ]);

    // Match by looking for orders where the token name matches our asset
    // TODO: when we have proper token metadata mapping, match by tokenId
    for (const order of [...curated, ...legacy]) {
      const priceEth = formatEther(BigInt(order.priceWei));
      info.listedPriceEth = priceEth;
      info.emblemTokenId = order.tokenId;
      info.emblemContract = order.tokenContract as Address;
      info.owner = order.maker as Address;
      info.orderHash = order.orderHash;
      info.marketplaceUrl = `https://etherscan.io/nft/${order.tokenContract}/${order.tokenId}`;
      break; // Take the first active order
    }
  } catch {
    // Non-critical — marketplace lookup failure doesn't block detail
  }

  return info;
}

// ============================================================================
// CACHED FETCH — for feed integration (5-min TTL)
// ============================================================================

const pepeCache = new Map<string, TtlCacheEntry<PepeFeedItem[]>>();
const PEPE_CACHE_TTL = 5 * 60 * 1000;

export async function fetchPepeListingsWithCache(): Promise<PepeFeedItem[]> {
  return loadTtlValue(pepeCache, "listings", PEPE_CACHE_TTL, () =>
    fetchPepeListings(24),
  );
}
