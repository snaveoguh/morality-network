/**
 * /api/hyperstructure — the self-funding flywheel, measured in public.
 *
 * Joins the two halves of the loop:
 *   - inference burn: AI usage telemetry (indexer /api/v1/ai/usage/summary)
 *   - agent profit:   realized PnL from pooter.trade_decisions (HL-net,
 *     recorded at close in exit_rationale.pnlUsd)
 *
 * The hyperstructure claim is "the platform funds its own inference off
 * agent profit". This endpoint is the referee: window PnL vs window burn,
 * with no editorializing — if the ratio is under 1, it says so.
 *
 * Public, no auth: spectator-mode parity with /markets.
 */

import { NextResponse } from "next/server";
import { fetchAIUsageSummary } from "@/lib/server/ai-telemetry";
import { sql, dbReachable } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEFAULT_WINDOW_HOURS = 24;
const MAX_WINDOW_HOURS = 24 * 30;

interface PnlAggregateRow {
  trades: number;
  pnl_usd: string | null; // numeric → string in postgres-js
  unpriced: number; // closed rows with no recorded pnlUsd — invisible to this panel
}

async function fetchRealizedPnl(windowHours: number | null): Promise<{
  closedTrades: number;
  realizedPnlUsd: number;
  unpricedCloses: number;
} | null> {
  const rows = windowHours === null
    ? await sql<PnlAggregateRow[]>`
        SELECT count(*) FILTER (WHERE exit_rationale ? 'pnlUsd')::int AS trades,
               coalesce(sum((exit_rationale->>'pnlUsd')::numeric) FILTER (WHERE exit_rationale ? 'pnlUsd'), 0) AS pnl_usd,
               count(*) FILTER (WHERE NOT (exit_rationale ? 'pnlUsd'))::int AS unpriced
        FROM pooter.trade_decisions
        WHERE closed_at IS NOT NULL
      `
    : await sql<PnlAggregateRow[]>`
        SELECT count(*) FILTER (WHERE exit_rationale ? 'pnlUsd')::int AS trades,
               coalesce(sum((exit_rationale->>'pnlUsd')::numeric) FILTER (WHERE exit_rationale ? 'pnlUsd'), 0) AS pnl_usd,
               count(*) FILTER (WHERE NOT (exit_rationale ? 'pnlUsd'))::int AS unpriced
        FROM pooter.trade_decisions
        WHERE closed_at IS NOT NULL
          AND closed_at > now() - ${windowHours} * interval '1 hour'
      `;
  const row = rows[0];
  if (!row) return null;
  const pnl = Number(row.pnl_usd ?? 0);
  return {
    closedTrades: row.trades,
    realizedPnlUsd: Number.isFinite(pnl) ? pnl : 0,
    unpricedCloses: row.unpriced ?? 0,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedHours = Number(url.searchParams.get("hours") ?? DEFAULT_WINDOW_HOURS);
  const windowHours = Number.isFinite(requestedHours)
    ? Math.max(1, Math.min(MAX_WINDOW_HOURS, Math.floor(requestedHours)))
    : DEFAULT_WINDOW_HOURS;

  // ── Inference burn (indexer telemetry) ──
  let inference: {
    estimatedCostUsd: number;
    invocations: number;
    totalTokens: number;
  } | null = null;
  try {
    const summary = await fetchAIUsageSummary({ hours: windowHours });
    if (summary) {
      inference = {
        estimatedCostUsd: summary.totals.estimatedCostUsd ?? 0,
        invocations: summary.totals.invocations ?? 0,
        totalTokens: summary.totals.totalTokens ?? 0,
      };
    }
  } catch {
    // indexer unreachable — report the gap rather than fake a zero
  }

  // ── Agent profit (trade_decisions) ──
  let windowPnl: Awaited<ReturnType<typeof fetchRealizedPnl>> = null;
  let bookPnl: Awaited<ReturnType<typeof fetchRealizedPnl>> = null;
  let openPositions: number | null = null;
  try {
    if (await dbReachable()) {
      [windowPnl, bookPnl] = await Promise.all([
        fetchRealizedPnl(windowHours),
        fetchRealizedPnl(null),
      ]);
      const openRows = await sql<{ open: number }[]>`
        SELECT count(*)::int AS open
        FROM pooter.trade_decisions
        WHERE closed_at IS NULL
      `;
      openPositions = openRows[0]?.open ?? null;
    }
  } catch {
    // db unreachable — same policy
  }

  // ── The verdict ──
  let flywheel: {
    windowNetUsd: number;
    selfFundingRatio: number | null;
    selfFunding: boolean;
  } | null = null;
  if (inference && windowPnl) {
    const burn = inference.estimatedCostUsd;
    flywheel = {
      windowNetUsd: windowPnl.realizedPnlUsd - burn,
      selfFundingRatio: burn > 0 ? windowPnl.realizedPnlUsd / burn : null,
      selfFunding: windowPnl.realizedPnlUsd >= burn && burn > 0,
    };
  }

  return NextResponse.json(
    {
      generatedAt: Date.now(),
      windowHours,
      inference,
      trading:
        windowPnl || bookPnl
          ? { window: windowPnl, book: bookPnl, openPositions }
          : null,
      flywheel,
    },
    { headers: { "cache-control": "public, max-age=30, stale-while-revalidate=60" } },
  );
}
