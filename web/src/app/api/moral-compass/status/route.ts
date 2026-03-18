import { NextResponse } from "next/server";
import {
  getMoralCompassStats,
  buildMoralCompassContext,
} from "@/lib/agents/core/moral-compass";

export const dynamic = "force-dynamic";

/**
 * GET /api/moral-compass/status
 * Debug endpoint: returns compass stats and context preview.
 */
export async function GET() {
  try {
    const stats = await getMoralCompassStats();
    const context = await buildMoralCompassContext();
    return NextResponse.json({
      ...stats,
      contextPreview: context?.slice(0, 500) ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
