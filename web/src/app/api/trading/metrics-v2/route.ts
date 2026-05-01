/**
 * /api/trading/metrics-v2  — HL + Postgres metrics endpoint (Stage 1e)
 *
 * Replaces the Redis-backed metrics endpoint with direct queries:
 *   - HL clearinghouseState → open positions, account value, margin
 *   - Postgres pooter.trade_decisions → metadata (rationale, signal, kelly, moral)
 *   - Postgres pooter.trade_decisions (closed) → closed trade history
 *
 * Response shape is identical to the existing /api/trading/metrics so the
 * dashboard can switch seamlessly.
 */

import { NextResponse } from "next/server";
import { getOperatorAuthState } from "@/lib/operator-auth";
import { getMoHolderAccessState } from "@/lib/holder-access";
import { isAddress, type Address } from "viem";
import { getTraderConfig } from "@/lib/trading/config";
import {
  fetchHyperliquidLivePositions,
  fetchHyperliquidAccountValueUsd,
  resolveHyperliquidAccountAddress,
} from "@/lib/trading/hyperliquid";
import {
  getOpenForWallet,
  getRecentClosed,
  findOpenByWalletSymbol,
} from "@/lib/db/trade-decisions";
import { dbReachable } from "@/lib/db";
import { fetchVaultOverview } from "@/lib/vault";
import type { TradeDecisionRow } from "@/lib/db";
import type { Position, TraderPerformanceReport, TraderPerformanceTotals } from "@/lib/trading/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// HL round-trip fee (maker + taker)
const HL_ROUND_TRIP_FEE_RATE = 0.00035;

// ── Helpers ────────────────────────────────────────────────────────────

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/**
 * Convert a TradeDecisionRow to a Position-shaped object the dashboard can read.
 * The dashboard expects entryPriceUsd, but we don't store that in trade_decisions
 * (HL is the source of truth for prices). For closed trades we can derive it
 * from the entry_rationale or leave it at 0 — the realized PnL comes from HL.
 */
function decisionToPosition(row: TradeDecisionRow, extra?: Partial<Position>): Position {
  return {
    id: row.id,
    cloid: (row.cloid as `0x${string}`) ?? undefined,
    venue: (row.venue as Position["venue"]) ?? "hyperliquid-perp",
    tokenAddress: "0x0000000000000000000000000000000000000000",
    tokenDecimals: 18,
    quoteTokenAddress: "0x0000000000000000000000000000000000000000",
    quoteSymbol: "USDC",
    quoteTokenDecimals: 6,
    dex: "uniswap-v3",
    marketSymbol: row.market_symbol,
    direction: row.direction,
    leverage: row.leverage ?? undefined,
    entryPriceUsd: extra?.entryPriceUsd ?? 0,
    quantityTokenRaw: extra?.quantityTokenRaw ?? "0",
    quoteSpentRaw: "0",
    entryNotionalUsd: row.entry_notional_usd ? Number(row.entry_notional_usd) : (extra?.entryNotionalUsd ?? 0),
    stopLossPct: row.stop_loss_pct ?? 0,
    takeProfitPct: row.take_profit_pct ?? 0,
    openedAt: row.opened_at.getTime(),
    closedAt: row.closed_at?.getTime(),
    exitPriceUsd: extra?.exitPriceUsd,
    exitReason: (row.exit_reason as Position["exitReason"]) ?? undefined,
    status: row.closed_at ? "closed" : "open",
    signalSource: row.signal_source ?? undefined,
    signalConfidence: row.signal_confidence ?? undefined,
    kellyFraction: row.kelly_fraction ?? undefined,
    moralScore: row.moral_score ?? undefined,
    moralJustification: row.moral_justification ?? undefined,
    trailingStopPct: row.trailing_stop_pct ?? undefined,
    highWaterMark: row.high_water_mark ?? undefined,
    lowWaterMark: row.low_water_mark ?? undefined,
    dynamicTpLevels: row.dynamic_tp_levels ?? undefined,
    entryRationale: row.entry_rationale as Position["entryRationale"],
    exitRationale: row.exit_rationale as Position["exitRationale"],
    ...extra,
  };
}

function publicConfigSummary(config: unknown) {
  const root = config && typeof config === "object"
    ? (config as Record<string, unknown>)
    : {};
  const risk =
    root.risk && typeof root.risk === "object"
      ? (root.risk as Record<string, unknown>)
      : {};
  const hyperliquid =
    root.hyperliquid && typeof root.hyperliquid === "object"
      ? (root.hyperliquid as Record<string, unknown>)
      : {};

  return {
    executionVenue:
      typeof root.executionVenue === "string" ? root.executionVenue : null,
    dryRun: typeof root.dryRun === "boolean" ? root.dryRun : null,
    performanceFeeBps: parseNumber(root.performanceFeeBps),
    risk: {
      maxOpenPositions: parseNumber(risk.maxOpenPositions),
      maxNewEntriesPerCycle: parseNumber(risk.maxNewEntriesPerCycle),
      maxPositionUsd: parseNumber(risk.maxPositionUsd),
      maxPortfolioUsd: parseNumber(risk.maxPortfolioUsd),
      stopLossPct: parseNumber(risk.stopLossPct),
      takeProfitPct: parseNumber(risk.takeProfitPct),
      trailingStopPct: parseNumber(risk.trailingStopPct),
      maxHoldMs: parseNumber(risk.maxHoldMs),
    },
    hyperliquid: {
      isTestnet:
        typeof hyperliquid.isTestnet === "boolean"
          ? hyperliquid.isTestnet
          : null,
      defaultLeverage: parseNumber(hyperliquid.defaultLeverage),
      entryNotionalUsd: parseNumber(hyperliquid.entryNotionalUsd),
      minAccountValueUsd: parseNumber(hyperliquid.minAccountValueUsd),
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sanitizePerformance(report: any) {
  const sanitizedClosed = (report.closed ?? []).map((row: any) => ({
    position: {
      id: row.position?.id,
      symbol: row.position?.marketSymbol ?? row.position?.symbol,
      direction: row.position?.direction,
      entryPrice: row.position?.entryPriceUsd,
      exitPrice: row.position?.exitPriceUsd,
      closedAt: row.position?.closedAt,
      leverage: row.position?.leverage,
    },
    realizedPnlUsd: row.realizedPnlUsd ?? 0,
    pnlUsd: row.realizedPnlUsd ?? 0,
  }));

  return {
    ...report,
    account: undefined,
    fundingAddress: undefined,
    open: [],
    closed: sanitizedClosed,
    readiness: {
      ...report.readiness,
      balances: [],
      reasons: report.readiness?.liveReady
        ? []
        : ["Detailed readiness data requires operator access."],
    },
  };
}

// ── Main handler ───────────────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const accountParam = searchParams.get("account");
    const account =
      accountParam && isAddress(accountParam)
        ? (accountParam as Address)
        : null;
    const authState = await getOperatorAuthState(request);
    const holderAccess = await getMoHolderAccessState(request);
    const accountMatched =
      Boolean(account) &&
      Boolean(holderAccess.sessionAddress) &&
      account!.toLowerCase() === holderAccess.sessionAddress!.toLowerCase();
    const includeAccount = authState.authorized || accountMatched;
    const fullAccess = holderAccess.fullAccess;
    const includeFunders = authState.authorized;

    const config = getTraderConfig();
    // Resolve wallet: prefer env var (web service usually has no private key),
    // then derive from private key, then fall back to config accountAddress.
    const envWallet = process.env.TRADER_WALLET ?? process.env.HYPERLIQUID_ACCOUNT_ADDRESS;
    const walletAddress = envWallet && isAddress(envWallet)
      ? (envWallet as Address)
      : config.privateKey
        ? (await import("viem/accounts")).privateKeyToAccount(config.privateKey).address as Address
        : "0x0000000000000000000000000000000000000000" as Address;
    const hlWallet = resolveHyperliquidAccountAddress(config, walletAddress);
    const pgAvailable = await dbReachable();

    // ─── Parallel fetch: HL live data + Postgres metadata ───
    const [livePositions, accountValue, pgOpenDecisions, pgClosedDecisions, vault] = await Promise.all([
      fetchHyperliquidLivePositions(config, hlWallet as Address).catch(() => []),
      fetchHyperliquidAccountValueUsd(config, hlWallet as Address).catch(() => null),
      pgAvailable ? getOpenForWallet(hlWallet) : Promise.resolve([]),
      pgAvailable ? getRecentClosed(hlWallet, 2000) : Promise.resolve([]),
      fetchVaultOverview({
        limit: 50,
        account: includeAccount ? account : null,
        includeFunders,
        includeAccount,
      }).catch(() => null),
    ]);

    // ─── Build open position metrics from HL live data ───
    // Join HL positions with Postgres decisions for metadata
    const pgOpenBySymbol = new Map<string, TradeDecisionRow>();
    for (const d of pgOpenDecisions) {
      pgOpenBySymbol.set(d.market_symbol.toUpperCase(), d);
    }

    const open: TraderPerformanceReport["open"] = [];
    let deployedUsd = 0;
    let openMarketValueUsd = 0;
    let unrealizedPnlUsd = 0;
    let estimatedTradingFeesUsd = 0;

    for (const hlPos of livePositions) {
      const pgDecision = pgOpenBySymbol.get(hlPos.symbol.toUpperCase());
      const direction: "long" | "short" = hlPos.isShort ? "short" : "long";
      const notionalUsd = hlPos.positionValueUsd;
      const estFees = notionalUsd * HL_ROUND_TRIP_FEE_RATE;

      deployedUsd += notionalUsd;
      estimatedTradingFeesUsd += estFees;
      openMarketValueUsd += notionalUsd + hlPos.unrealizedPnlUsd;
      unrealizedPnlUsd += hlPos.unrealizedPnlUsd;

      // Build position from HL live data + PG metadata
      const position: Position = pgDecision
        ? decisionToPosition(pgDecision, {
            entryPriceUsd: hlPos.entryPriceUsd,
            quantityTokenRaw: hlPos.size,
            entryNotionalUsd: notionalUsd,
            hlUnrealizedPnlUsd: hlPos.unrealizedPnlUsd,
            status: "open",
            direction,
            leverage: hlPos.leverage ?? pgDecision.leverage ?? undefined,
            marketId: hlPos.marketId ?? undefined,
          })
        : {
            // No PG record — build minimal position from HL data alone
            id: `hl:${hlPos.symbol}:${hlPos.marketId ?? 0}`,
            venue: "hyperliquid-perp" as const,
            tokenAddress: "0x0000000000000000000000000000000000000000" as `0x${string}`,
            tokenDecimals: 18,
            quoteTokenAddress: "0x0000000000000000000000000000000000000000" as `0x${string}`,
            quoteSymbol: "USDC",
            quoteTokenDecimals: 6,
            dex: "uniswap-v3" as const,
            marketSymbol: hlPos.symbol,
            marketId: hlPos.marketId ?? undefined,
            direction,
            leverage: hlPos.leverage ?? undefined,
            entryPriceUsd: hlPos.entryPriceUsd,
            quantityTokenRaw: hlPos.size,
            quoteSpentRaw: "0",
            entryNotionalUsd: notionalUsd,
            stopLossPct: config.risk.stopLossPct,
            takeProfitPct: config.risk.takeProfitPct,
            openedAt: Date.now(), // HL doesn't tell us open time
            status: "open" as const,
            hlUnrealizedPnlUsd: hlPos.unrealizedPnlUsd,
          };

      // Compute current price from HL position data
      const currentPriceUsd = hlPos.entryPriceUsd; // HL gives entry, not current — use unrealized PnL instead
      const marketValueUsd = notionalUsd + hlPos.unrealizedPnlUsd;
      const pnlPct = notionalUsd > 0 ? hlPos.unrealizedPnlUsd / notionalUsd : 0;

      open.push({
        position,
        currentPriceUsd,
        marketValueUsd,
        unrealizedPnlUsd: hlPos.unrealizedPnlUsd,
        unrealizedPnlPct: pnlPct,
        estimatedFeesUsd: 0, // HL's unrealized PnL already accounts for fees
      });
    }

    // ─── Build closed position metrics from Postgres ───
    const closed: TraderPerformanceReport["closed"] = [];
    let realizedPnlUsd = 0;

    for (const pgRow of pgClosedDecisions) {
      const notionalUsd = pgRow.entry_notional_usd ? Number(pgRow.entry_notional_usd) : 0;
      const estFees = notionalUsd * HL_ROUND_TRIP_FEE_RATE;
      estimatedTradingFeesUsd += estFees;

      // We don't have actual entry/exit prices in Postgres (HL is source of truth for prices).
      // But the old endpoint calculated PnL from entry/exit prices stored in Redis.
      // For now, extract what we can from the exit_rationale JSON if present.
      const exitRationale = pgRow.exit_rationale as Record<string, unknown> | null;
      const exitPriceUsd = exitRationale?.priceAtTrigger as number | undefined;
      const entryRationale = pgRow.entry_rationale as Record<string, unknown> | null;

      // Try to compute PnL from rationale data or mark as null
      let pnlUsd: number | null = null;
      let pnlPct: number | null = null;

      // Check if exit rationale has holdDurationMs or pnlUsd directly
      if (exitRationale?.pnlUsd !== undefined) {
        pnlUsd = exitRationale.pnlUsd as number;
        pnlPct = notionalUsd > 0 ? pnlUsd / notionalUsd : 0;
      }

      if (pnlUsd !== null) {
        realizedPnlUsd += pnlUsd;
      }

      const position = decisionToPosition(pgRow, {
        exitPriceUsd: exitPriceUsd ?? undefined,
      });

      closed.push({
        position,
        realizedPnlUsd: pnlUsd,
        realizedPnlPct: pnlPct,
        estimatedFeesUsd: estFees,
      });
    }

    // ─── Compute totals ───
    const grossPnlUsd = realizedPnlUsd + unrealizedPnlUsd;
    const performanceFeeUsd =
      realizedPnlUsd > 0 ? (realizedPnlUsd * config.performanceFeeBps) / 10_000 : 0;
    const netPnlAfterFeeUsd = grossPnlUsd - performanceFeeUsd;

    const totals: TraderPerformanceTotals = {
      openPositions: livePositions.length,
      closedPositions: pgClosedDecisions.length,
      deployedUsd,
      openMarketValueUsd,
      unrealizedPnlUsd,
      realizedPnlUsd,
      grossPnlUsd,
      estimatedTradingFeesUsd,
      performanceFeeUsd,
      netPnlAfterFeeUsd,
    };

    // ─── Build readiness ───
    const readiness = {
      timestamp: Date.now(),
      executionVenue: config.executionVenue,
      dryRun: config.dryRun,
      account: hlWallet as Address,
      scannerCandidates: 0,
      minScannerCandidatesLive: 0,
      balances: [] as { symbol: string; address: Address; raw: string; decimals: number; formatted: string; requiredFormatted?: string; meetsRequirement: boolean }[],
      liveReady: !config.dryRun && accountValue !== null && accountValue > (config.hyperliquid?.minAccountValueUsd ?? 10),
      reasons: [] as string[],
    };

    if (accountValue !== null) {
      readiness.balances.push({
        symbol: "USDC (perps)",
        address: hlWallet as Address,
        raw: Math.floor(accountValue * 1e6).toString(),
        decimals: 6,
        formatted: `$${accountValue.toFixed(2)}`,
        meetsRequirement: accountValue > (config.hyperliquid?.minAccountValueUsd ?? 10),
      });
    }

    const performance: TraderPerformanceReport = {
      timestamp: Date.now(),
      executionVenue: config.executionVenue,
      dryRun: config.dryRun,
      account: hlWallet as Address,
      fundingAddress: hlWallet as Address,
      performanceFeeBps: config.performanceFeeBps,
      readiness,
      totals,
      open,
      closed,
    };

    // ─── Build response matching v1 shape ───
    const redactedConfig = {
      executionVenue: config.executionVenue,
      dryRun: config.dryRun,
      performanceFeeBps: config.performanceFeeBps,
      risk: {
        maxOpenPositions: config.risk.maxOpenPositions,
        maxNewEntriesPerCycle: config.risk.maxNewEntriesPerCycle,
        maxPositionUsd: config.risk.maxPositionUsd,
        maxPortfolioUsd: config.risk.maxPortfolioUsd,
        stopLossPct: config.risk.stopLossPct,
        takeProfitPct: config.risk.takeProfitPct,
        trailingStopPct: config.risk.trailingStopPct,
        maxHoldMs: config.risk.maxHoldMs,
      },
      hyperliquid: {
        isTestnet: config.hyperliquid?.isTestnet ?? false,
        defaultLeverage: config.hyperliquid?.defaultLeverage,
        entryNotionalUsd: config.hyperliquid?.entryNotionalUsd,
        minAccountValueUsd: config.hyperliquid?.minAccountValueUsd,
      },
    };

    return NextResponse.json(
      {
        performance: fullAccess ? performance : sanitizePerformance(performance),
        parallel: [],
        vaultRails: [],
        vault: vault
          ? {
              ...vault,
              manager: includeFunders ? vault.manager : undefined,
              feeRecipient: includeFunders ? vault.feeRecipient : undefined,
              funders: includeFunders ? vault.funders : [],
              account: includeAccount ? vault.account : null,
            }
          : null,
        config: authState.authorized ? redactedConfig : publicConfigSummary(redactedConfig),
        access: {
          operator: authState.authorized,
          holder: holderAccess.holder,
          fullAccess,
          via: authState.via,
          accountMatched,
        },
        backend: "hl+postgres",
        pgAvailable,
      },
      {
        headers: {
          "cache-control": "no-store, max-age=0",
        },
      },
    );
  } catch (error) {
    console.error("[metrics-v2] error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "metrics-v2 failed",
      },
      { status: 500 },
    );
  }
}
