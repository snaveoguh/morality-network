// ============================================================================
// POST /api/music/discover — Taste-aware music discovery
// GET  /api/music/discover — Default discovery (no taste input)
// Follows the feed/route.ts + stumble/route.ts patterns
// ============================================================================

import { NextResponse } from "next/server";
import { fetchMusicDiscovery } from "@/lib/music-discovery";
import type { DiscoveryRequest } from "@/lib/music-types";

export const dynamic = "force-dynamic";

const DEFAULT_VECTORS = {
  genreWeights: {} as Record<string, number>,
  energyPreference: 0.5,
  eraPreference: {} as Record<string, number>,
  explorationRate: 0.7,
};

export async function POST(request: Request) {
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

export async function GET() {
  try {
    const result = await fetchMusicDiscovery({
      vectors: DEFAULT_VECTORS,
      seedGenres: [],
      seedArtists: [],
      excludeIds: [],
      limit: 20,
      mode: "explore",
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[api/music/discover] GET error:", error);
    return NextResponse.json(
      { error: "Discovery failed" },
      { status: 500 },
    );
  }
}
