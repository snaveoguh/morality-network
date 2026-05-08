import { NextResponse } from "next/server";
import { runStatusChecks } from "@/lib/status-checks";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/status — public JSON health probe.
 *
 * Mirrors the /status page so external monitors (UptimeRobot, BetterStack,
 * a homemade GitHub Action, etc.) can curl it. Status code reflects the
 * overall worst-level check:
 *  - all "ok"          → 200
 *  - any "warn"        → 200 (still serving)
 *  - any "fail"        → 503
 */
export async function GET() {
  const result = await runStatusChecks();
  const status = result.overall === "fail" ? 503 : 200;
  return NextResponse.json(result, {
    status,
    headers: {
      "cache-control": "no-store, no-cache, must-revalidate",
    },
  });
}
