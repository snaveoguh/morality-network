import { NextResponse, type NextRequest } from "next/server";
import {
  pollVeniceRiskAdvisory,
  getLatestAdvisory,
} from "@/lib/trading/risk-advisory";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = request.headers.get("authorization")?.trim();
  return auth === `Bearer ${secret}`;
}

/** GET — Return the current cached advisory (no Venice call) */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const advisory = await getLatestAdvisory();
    if (!advisory) {
      return NextResponse.json(
        { advisory: null, stale: true, message: "No cached advisory" },
        { status: 200 },
      );
    }

    const ageMs = Date.now() - advisory.timestamp;
    return NextResponse.json({
      advisory,
      ageSeconds: Math.round(ageMs / 1000),
      stale: ageMs > 5 * 60 * 1000,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "failed" },
      { status: 500 },
    );
  }
}

/** POST — Trigger a fresh Venice risk analysis and cache the result */
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const advisory = await pollVeniceRiskAdvisory();
    return NextResponse.json({ advisory, fresh: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Venice risk poll failed" },
      { status: 500 },
    );
  }
}
