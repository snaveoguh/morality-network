/**
 * pooter1 Farcaster client — reads casts via Neynar API.
 * Ported from web/src/lib/farcaster.ts, stripped of Next.js cache directives.
 */
import { NEYNAR_API_KEY } from "./config.js";

const NEYNAR_API = "https://api.neynar.com/v2/farcaster";

function headers(): Record<string, string> {
  return {
    "x-api-key": NEYNAR_API_KEY || "NEYNAR_FROG_FM",
    "Content-Type": "application/json",
  };
}

// ── Types ────────────────────────────────────────────────────────────

export interface FarcasterUser {
  fid: number;
  username: string;
  displayName: string;
  pfpUrl: string;
  bio: string;
  followerCount: number;
  followingCount: number;
  verifiedAddresses: string[];
}

export interface Cast {
  hash: string;
  author: FarcasterUser;
  text: string;
  timestamp: string;
  likes: number;
  recasts: number;
  replies: number;
  embeds: CastEmbed[];
  parentUrl?: string;
  channel?: string;
}

export interface CastEmbed {
  url?: string;
  metadata?: {
    title?: string;
    description?: string;
    image?: string;
  };
}

// ── API Functions ────────────────────────────────────────────────────

export async function fetchTrendingCasts(limit = 10): Promise<Cast[]> {
  try {
    const res = await fetch(
      `${NEYNAR_API}/feed/trending?limit=${limit}&time_window=24h`,
      { headers: headers(), signal: AbortSignal.timeout(15_000) },
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.casts || []).map(normalizeCast);
  } catch (err: any) {
    console.warn(`[pooter1:farcaster] Trending fetch failed: ${err.message}`);
    return [];
  }
}

export async function fetchChannelFeed(channelId: string, limit = 25): Promise<Cast[]> {
  try {
    const res = await fetch(
      `${NEYNAR_API}/feed/channels?channel_ids=${encodeURIComponent(channelId)}&limit=${limit}`,
      { headers: headers(), signal: AbortSignal.timeout(15_000) },
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.casts || []).map(normalizeCast);
  } catch (err: any) {
    console.warn(`[pooter1:farcaster] Channel ${channelId} fetch failed: ${err.message}`);
    return [];
  }
}

export async function searchCasts(query: string, limit = 10): Promise<Cast[]> {
  try {
    const res = await fetch(
      `${NEYNAR_API}/cast/search?q=${encodeURIComponent(query)}&limit=${limit}`,
      { headers: headers(), signal: AbortSignal.timeout(15_000) },
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.result?.casts || []).map(normalizeCast);
  } catch (err: any) {
    console.warn(`[pooter1:farcaster] Search failed for "${query}": ${err.message}`);
    return [];
  }
}

// ── Engagement Scoring ───────────────────────────────────────────────

export function engagementScore(cast: Cast): number {
  return cast.likes * 2 + cast.recasts * 3 + cast.replies;
}

export function dedupeAndRank(casts: Cast[], limit = 10): Cast[] {
  const seen = new Set<string>();
  const unique: Cast[] = [];
  for (const cast of casts) {
    if (!seen.has(cast.hash)) {
      seen.add(cast.hash);
      unique.push(cast);
    }
  }
  return unique
    .filter((c) => c.likes + c.recasts + c.replies >= 3)
    .sort((a, b) => engagementScore(b) - engagementScore(a))
    .slice(0, limit);
}

// ── Helpers ──────────────────────────────────────────────────────────

function normalizeCast(raw: any): Cast {
  return {
    hash: raw.hash,
    author: {
      fid: raw.author?.fid || 0,
      username: raw.author?.username || "unknown",
      displayName: raw.author?.display_name || raw.author?.username || "unknown",
      pfpUrl: raw.author?.pfp_url || "",
      bio: raw.author?.profile?.bio?.text || "",
      followerCount: raw.author?.follower_count || 0,
      followingCount: raw.author?.following_count || 0,
      verifiedAddresses: raw.author?.verified_addresses?.eth_addresses || [],
    },
    text: raw.text || "",
    timestamp: raw.timestamp || new Date().toISOString(),
    likes: raw.reactions?.likes_count || raw.reactions?.likes?.length || 0,
    recasts: raw.reactions?.recasts_count || raw.reactions?.recasts?.length || 0,
    replies: raw.replies?.count || 0,
    embeds: (raw.embeds || []).map((e: any) => ({
      url: e.url,
      metadata: e.metadata
        ? {
            title: e.metadata.title,
            description: e.metadata.description,
            image: e.metadata.image?.url,
          }
        : undefined,
    })),
    parentUrl: raw.parent_url,
    channel: raw.channel?.id,
  };
}
