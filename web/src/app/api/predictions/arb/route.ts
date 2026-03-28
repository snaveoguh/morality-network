/**
 * GET /api/predictions/arb — Proxy to polypooter service for Polymarket arb opportunities.
 *
 * Query params:
 *   ?view=report — returns the full report instead of raw opportunities
 */

import { NextResponse } from "next/server";

export const revalidate = 120; // 2-minute ISR cache

const POLYPOOTER_URL = process.env.POLYPOOTER_URL ?? "";

export async function GET(request: Request) {
  if (!POLYPOOTER_URL) {
    return NextResponse.json(
      { error: "Polypooter service not configured" },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view");
  const endpoint = view === "report" ? "/report" : "/opportunities";

  try {
    const res = await fetch(`${POLYPOOTER_URL.replace(/\/+$/, "")}${endpoint}`, {
      headers: {
        Authorization: `Bearer ${process.env.CRON_SECRET ?? ""}`,
      },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Polypooter returned ${res.status}` },
        { status: res.status },
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.warn(
      "[api/predictions/arb] Polypooter fetch failed:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { error: "Polypooter service unavailable" },
      { status: 503 },
    );
  }
}
