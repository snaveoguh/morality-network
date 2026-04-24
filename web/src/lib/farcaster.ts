// Farcaster integration via Neynar API
// Fetches @pip's social graph and surfaces engaged casts in the feed
//
// ⚠️  DISABLED — all Neynar calls short-circuited to avoid API hammering.
//    Pooter.world doesn't need its own FC feed; noun.wtf is the only consumer.
//    To re-enable: set FARCASTER_ENABLED=true in env vars.

const FARCASTER_DISABLED = process.env.FARCASTER_ENABLED !== "true";

const NEYNAR_API = "https://api.neynar.com/v2/farcaster";
const API_KEY = process.env.NEYNAR_API_KEY || "NEYNAR_FROG_FM"; // dev fallback

function headers(): Record<string, string> {
  return {
    "x-api-key": API_KEY,
    "Content-Type": "application/json",
  };
}

export interface FarcasterUser {
  fid: number;
  username: string;
  displayName: string;
  pfpUrl: string;
  bio: string;
  followerCount: number;
  followingCount: number;
  verifiedAddresses: string[]; // ETH addresses — tippable!
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

// ============================================================================
// USER LOOKUP
// ============================================================================

export async function lookupUser(username: string): Promise<FarcasterUser | null> {
  if (FARCASTER_DISABLED) return null;
  try {
    const res = await fetch(
      `${NEYNAR_API}/user/by_username?username=${encodeURIComponent(username)}`,
      { headers: headers(), next: { revalidate: 3600 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const u = data.user;
    if (!u) return null;

    return {
      fid: u.fid,
      username: u.username,
      displayName: u.display_name || u.username,
      pfpUrl: u.pfp_url || "",
      bio: u.profile?.bio?.text || "",
      followerCount: u.follower_count || 0,
      followingCount: u.following_count || 0,
      verifiedAddresses: u.verified_addresses?.eth_addresses || [],
    };
  } catch (error) {
    console.error("Neynar user lookup failed:", error);
    return null;
  }
}

// ============================================================================
// SOCIAL GRAPH FEED — casts from people @pip follows
// ============================================================================

export async function fetchSocialFeed(fid: number): Promise<Cast[]> {
  if (FARCASTER_DISABLED) return [];
  try {
    const res = await fetch(
      `${NEYNAR_API}/feed?feed_type=following&fid=${fid}&with_recasts=true&limit=50`,
      { headers: headers(), next: { revalidate: 120 } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.casts || []).map(normalizeCast);
  } catch (error) {
    console.error("Neynar social feed failed:", error);
    return [];
  }
}

// ============================================================================
// TRENDING CASTS — global trending on Farcaster
// ============================================================================

export async function fetchTrendingCasts(): Promise<Cast[]> {
  if (FARCASTER_DISABLED) return [];
  try {
    const res = await fetch(
      `${NEYNAR_API}/feed/trending?limit=10&time_window=24h`,
      { headers: headers(), next: { revalidate: 300 } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.casts || []).map(normalizeCast);
  } catch (error) {
    console.error("Neynar trending failed:", error);
    return [];
  }
}

// ============================================================================
// POPULAR CASTS FROM A USER
// ============================================================================

export async function fetchPopularCasts(fid: number): Promise<Cast[]> {
  if (FARCASTER_DISABLED) return [];
  try {
    const res = await fetch(
      `${NEYNAR_API}/feed/user/popular?fid=${fid}`,
      { headers: headers(), next: { revalidate: 600 } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.casts || []).map(normalizeCast);
  } catch (error) {
    console.error("Neynar popular casts failed:", error);
    return [];
  }
}

// ============================================================================
// AGGREGATE — fetch @pip's feed + trending, filter by engagement
// ============================================================================

const MIN_ENGAGEMENT = 3; // min likes+recasts+replies to show in feed

// Known FIDs — skip the sequential lookupUser() API call
const KNOWN_FIDS: Record<string, number> = { pip: 7924 };

export async function fetchFarcasterContent(
  username: string = "pip"
): Promise<Cast[]> {
  if (FARCASTER_DISABLED) return [];
  // Use cached FID if known, otherwise do the API lookup
  const fid = KNOWN_FIDS[username] ?? (await lookupUser(username))?.fid;
  if (!fid) {
    // Fallback to just trending if user not found
    return filterByEngagement(await fetchTrendingCasts());
  }

  // Fetch social feed + trending in parallel
  const [socialCasts, trendingCasts] = await Promise.all([
    fetchSocialFeed(fid),
    fetchTrendingCasts(),
  ]);

  // Merge and dedupe by hash
  const seen = new Set<string>();
  const all: Cast[] = [];

  for (const cast of [...socialCasts, ...trendingCasts]) {
    if (!seen.has(cast.hash)) {
      seen.add(cast.hash);
      all.push(cast);
    }
  }

  // Filter out low-engagement spam
  return filterByEngagement(all);
}

function filterByEngagement(casts: Cast[]): Cast[] {
  return casts
    .filter((c) => c.likes + c.recasts + c.replies >= MIN_ENGAGEMENT)
    .sort((a, b) => {
      // Sort by engagement score
      const scoreA = a.likes * 2 + a.recasts * 3 + a.replies;
      const scoreB = b.likes * 2 + b.recasts * 3 + b.replies;
      return scoreB - scoreA;
    });
}

// ============================================================================
// HELPERS
// ============================================================================

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
