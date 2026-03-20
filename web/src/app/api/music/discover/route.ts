// ============================================================================
// POST /api/music/discover — Taste-aware music discovery
// GET  /api/music/discover — Default discovery (no taste input)
// Follows the feed/route.ts + stumble/route.ts patterns
// ============================================================================

import { NextResponse } from "next/server";
import { getOperatorAuthState, getSessionAddress } from "@/lib/operator-auth";
import { fetchMusicDiscovery } from "@/lib/music-discovery";
import type { DiscoveryRequest } from "@/lib/music-types";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const DEFAULT_VECTORS = {
  genreWeights: {} as Record<string, number>,
  energyPreference: 0.5,
  eraPreference: {} as Record<string, number>,
  explorationRate: 0.7,
};

export async function POST(request: Request) {
  // Rate limit: 20 discovery requests per minute per IP
  const limited = rateLimit(request, { maxRequests: 20, windowMs: 60_000 });
  if (limited) return limited;

  if (process.env.NODE_ENV === "production") {
    const [operatorAuth, sessionAddress] = await Promise.all([
      getOperatorAuthState(request),
      getSessionAddress(),
    ]);
    if (!operatorAuth.authorized && !sessionAddress) {
      return NextResponse.json(
        { error: "Authentication required for personalized discovery" },
        { status: 401 },
      );
    }
  }

  try {
    const body = (await request.json()) as Partial<DiscoveryRequest>;

    const sanitized: DiscoveryRequest = {
      vectors: body.vectors || DEFAULT_VECTORS,
      seedGenres: Array.isArray(body.seedGenres)
        ? body.seedGenres.slice(0, 50)
        : [],
      seedArtists: Array.isArray(body.seedArtists)
        ? body.seedArtists.slice(0, 100)
        : [],
      excludeIds: Array.isArray(body.excludeIds)
        ? body.excludeIds.slice(0, 200)
        : [],
      limit: Math.min(Math.max(1, body.limit || 20), 50),
      mode: body.mode === "comfort" ? "comfort" : "explore",
    };

    const result = await fetchMusicDiscovery(sanitized);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[api/music/discover] POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Discovery failed" },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  // Rate limit: 20 discovery requests per minute per IP
  const limited = rateLimit(request, { maxRequests: 10, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const result = await fetchMusicDiscovery({
      vectors: DEFAULT_VECTORS,
      seedGenres: [],
      seedArtists: [],
      excludeIds: [],
      limit: 20,
      mode: "explore",
    });
    return NextResponse.json(result, {
      headers: {
        "cache-control": "public, max-age=60, s-maxage=60",
      },
    });
  } catch (error) {
    console.error("[api/music/discover] GET error:", error);
    return NextResponse.json(
      { error: "Discovery failed" },
      { status: 500 },
    );
  }
}
