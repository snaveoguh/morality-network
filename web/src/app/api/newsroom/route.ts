import { NextResponse } from "next/server";
import { runNewsroom } from "@/lib/newsroom";
import { getNewsroomEdition } from "@/lib/newsroom-edition";

export const dynamic = "force-dynamic";
export const maxDuration = 55; // Vercel hobby plan limit

// ============================================================================
// GET /api/newsroom — returns today's edition (public, read-only)
// ============================================================================

export async function GET() {
  try {
    const edition = await getNewsroomEdition();
    if (!edition) {
      return NextResponse.json(
        { edition: null, message: "No edition generated today yet" },
        { status: 200 },
      );
    }
    return NextResponse.json({ edition });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// ============================================================================
// POST /api/newsroom — triggers the newsroom pipeline (auth required)
//
// Body (optional): { forceRegenerate?: boolean, maxStories?: number }
// Auth: Authorization: Bearer <NEWSROOM_SECRET>
// ============================================================================

export async function POST(request: Request) {
  // Auth check
  const secret = process.env.NEWSROOM_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }
  }

  let body: {
    forceRegenerate?: boolean;
    maxStories?: number;
    minStories?: number;
  } = {};

  try {
    const text = await request.text();
    if (text.trim()) {
      body = JSON.parse(text);
    }
  } catch {
    // No body or invalid JSON — proceed with defaults
  }

  try {
    const result = await runNewsroom({
      forceRegenerate: body.forceRegenerate ?? false,
      maxStories: Math.min(body.maxStories ?? 25, 25),
      minStories: Math.max(body.minStories ?? 5, 1),
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[newsroom/api] Pipeline failed:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Unknown error",
        generated: 0,
        skipped: 0,
        errors: 1,
      },
      { status: 500 },
    );
  }
}
