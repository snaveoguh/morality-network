// ============================================================================
// RARE PEPE DATA LAYER — XChain + Reservoir API integration
// ============================================================================

import { type Address } from "viem";
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
const RESERVOIR_BASE = "https://api.reservoir.tools";
const EMBLEM_VAULT_LEGACY = "0x82c7a8f707110f5fbb16184a5933e9f78a34c6ab" as Address;
const EMBLEM_VAULT_CURATED = "0x7E6027a6A84fC1F6Db6782c523EFe62c923e46ff" as Address;

const RESERVOIR_API_KEY = process.env.NEXT_PUBLIC_RESERVOIR_API_KEY || "";

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
// RESERVOIR API — Emblem Vault listings on Ethereum
// ============================================================================

interface ReservoirToken {
  token: {
    tokenId: string;
    contract: string;
    name: string | null;
    image: string | null;
    description: string | null;
    owner: string | null;
  };
  market: {
    floorAsk: {
      price: { amount: { decimal: number; raw: string }; currency: { symbol: string } } | null;
    } | null;
  };
}

const reservoirHeaders: Record<string, string> = {
  accept: "application/json",
  ...(RESERVOIR_API_KEY ? { "x-api-key": RESERVOIR_API_KEY } : {}),
};

async function fetchReservoirTokens(
  collection: Address,
  limit: number = 50,
  continuation?: string,
): Promise<{ tokens: ReservoirToken[]; continuation: string | null }> {
  try {
    const params = new URLSearchParams({
      collection,
      sortBy: "floorAskPrice",
      limit: String(limit),
      includeAttributes: "false",
    });
    if (continuation) params.set("continuation", continuation);

    const res = await fetch(`${RESERVOIR_BASE}/tokens/v7?${params}`, {
      headers: reservoirHeaders,
      next: { revalidate: 300 },
    });
    if (!res.ok) return { tokens: [], continuation: null };
    const data = await res.json();
    return {
      tokens: data.tokens || [],
      continuation: data.continuation || null,
    };
  } catch {
    return { tokens: [], continuation: null };
  }
}

function reservoirTokenToPepeFeedItem(
  token: ReservoirToken,
  directory: PepeDirectoryEntry[],
): PepeFeedItem | null {
  const name = token.token.name || "";
  // Try to match by name to our directory
  const normalizedName = name.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const entry = directory.find(
    (e) => e.asset === normalizedName || e.asset === name.toUpperCase(),
  );

  const price = token.market?.floorAsk?.price;
  const contract = token.token.contract as Address;

  return {
    asset: entry?.asset || name || `VAULT-${token.token.tokenId}`,
    imageUrl: token.token.image || (entry ? getCardImageUrl(entry.asset) : ""),
    series: entry?.series ?? 0,
    card: entry?.card ?? 0,
    supply: 0, // Reservoir doesn't have supply — enriched later
    estimatedValueUsd: null,
    listedPriceEth: price ? String(price.amount.decimal) : null,
    emblemTokenId: token.token.tokenId,
    emblemContract: contract,
    sortTime: Date.now(),
    owner: (token.token.owner as Address) || null,
    marketplaceUrl: `https://opensea.io/assets/ethereum/${contract}/${token.token.tokenId}`,
  };
}

// ============================================================================
// COMBINED FETCH — primary data source for feed + marketplace
// ============================================================================

export async function fetchPepeListings(
  limit: number = 40,
): Promise<PepeFeedItem[]> {
  const directory = await getPepeDirectory();

  // Fetch from both Emblem Vault collections in parallel
  const [curated, legacy] = await Promise.all([
    fetchReservoirTokens(EMBLEM_VAULT_CURATED, Math.ceil(limit / 2)),
    fetchReservoirTokens(EMBLEM_VAULT_LEGACY, Math.ceil(limit / 2)),
  ]);

  const items: PepeFeedItem[] = [];

  for (const token of [...curated.tokens, ...legacy.tokens]) {
    const item = reservoirTokenToPepeFeedItem(token, directory);
    if (item) items.push(item);
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

  // Fallback: if Reservoir returned nothing, pick random cards from directory
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
      });
    }
  }

  return items.slice(0, limit);
}

// Full detail for a single asset (XChain + Reservoir)
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
      description: "",
      issuer: "",
      locked: false,
      holderCount: null,
      dispensers: [],
    };
  }

  info.holderCount = holders;
  info.dispensers = dispensers;

  // Try to find Emblem Vault listing for this card
  try {
    const directory = await getPepeDirectory();
    const [curated, legacy] = await Promise.all([
      fetchReservoirTokens(EMBLEM_VAULT_CURATED, 20),
      fetchReservoirTokens(EMBLEM_VAULT_LEGACY, 20),
    ]);
    for (const token of [...curated.tokens, ...legacy.tokens]) {
      const name = (token.token.name || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (name === assetName.toUpperCase()) {
        const item = reservoirTokenToPepeFeedItem(token, directory);
        if (item) {
          info.listedPriceEth = item.listedPriceEth;
          info.emblemTokenId = item.emblemTokenId;
          info.emblemContract = item.emblemContract;
          info.marketplaceUrl = item.marketplaceUrl;
          info.owner = item.owner;
        }
        break;
      }
    }
  } catch {
    // Non-critical — vault lookup failure doesn't block detail
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
