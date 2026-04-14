import { NextResponse } from "next/server";
import {
  getOperatorAuthState,
} from "@/lib/operator-auth";
import { getMoHolderAccessState } from "@/lib/holder-access";
import { getTraderPerformanceByRunner, redactedConfigSummary } from "@/lib/trading/engine";
import { isWorkerTraderRuntime } from "@/lib/runtime-mode";
import { getIndexerBackendUrl } from "@/lib/server/indexer-backend";
import { fetchPersistedTraderState } from "@/lib/server/runtime-backend";
import { getParallelBaseConfig, getTraderConfig } from "@/lib/trading/config";
import { fetchVaultRailOverview } from "@/lib/trading/vault-rail";
import { fetchVaultOverview } from "@/lib/vault";
import { isAddress, type Address } from "viem";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
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
  // Public view: strip wallet addresses and open positions,
  // but include closed trade P&L so the equity chart works.
  const sanitizedClosed = (report.closed ?? []).map((row: any) => ({
    position: {
      id: row.position?.id,
      symbol: row.position?.symbol,
      direction: row.position?.direction,
      pnlUsd: row.position?.pnlUsd,
      closedAt: row.position?.closedAt,
      leverage: row.position?.leverage,
      entryPrice: row.position?.entryPrice,
      exitPrice: row.position?.exitPrice,
    },
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

function sanitizeVault(
  vault: Awaited<ReturnType<typeof fetchVaultOverview>>,
  options: { includeAccount: boolean; includeFunders: boolean },
) {
  if (!vault) return null;
  return {
    ...vault,
    manager: options.includeFunders ? vault.manager : undefined,
    feeRecipient: options.includeFunders ? vault.feeRecipient : undefined,
    funders: options.includeFunders ? vault.funders : [],
    account: options.includeAccount ? vault.account : null,
  };
}

async function fetchVaultRails(options: {
  account?: Address | null;
  includeAccount: boolean;
}) {
  try {
    const primary = getTraderConfig();
    const parallel = getParallelBaseConfig();
    const runners = [
      { runnerId: "primary", label: "primary", config: primary },
      ...(parallel ? [{ runnerId: "base-parallel", label: "base-parallel", config: parallel }] : []),
    ];

    const rails = await Promise.all(
      runners
        .filter((runner) => runner.config.vaultRail?.enabled)
        .map((runner) =>
          fetchVaultRailOverview(runner.config, {
            runnerId: runner.runnerId,
            label: runner.label,
            executionVenue: runner.config.executionVenue,
            account: options.includeAccount ? options.account ?? null : null,
            includeAccount: options.includeAccount,
          }).catch(() => null)
        )
    );

    return rails.filter((rail): rail is NonNullable<typeof rail> => rail !== null);
  } catch {
    return [];
  }
}

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
    const includeFunders = authState.authorized;
    const fullAccess = holderAccess.fullAccess;

    if (isWorkerTraderRuntime()) {
      const backendUrl = getIndexerBackendUrl();
      if (!backendUrl) {
        return NextResponse.json(
          { error: "TRADER_EXECUTION_MODE=worker requires INDEXER_BACKEND_URL" },
          { status: 503 }
        );
      }

      const [state, vault, vaultRails] = await Promise.all([
        fetchPersistedTraderState(),
        fetchVaultOverview({
          limit: 50,
          account: includeAccount ? account : null,
          includeFunders,
          includeAccount,
        }),
        fetchVaultRails({
          account,
          includeAccount,
        }),
      ]);

      return NextResponse.json(
        {
          performance:
            state.performance && !fullAccess
              ? sanitizePerformance(state.performance)
              : state.performance,
          parallel: fullAccess
            ? state.parallelPerformance
            : state.parallelPerformance.map((runner) => ({
                ...runner,
                performance: sanitizePerformance(runner.performance),
              })),
          vaultRails,
          vault: sanitizeVault(vault, { includeAccount, includeFunders }),
          config: authState.authorized
            ? state.config
            : publicConfigSummary(state.config),
          updatedAt: state.updatedAt,
          backend: "indexer",
          access: {
            operator: authState.authorized,
            holder: holderAccess.holder,
            fullAccess,
            via: authState.via,
            accountMatched,
          },
        },
        {
          headers: {
            "cache-control": "no-store, max-age=0",
          },
        }
      );
    }

    const [performanceByRunner, vault, vaultRails] = await Promise.all([
      getTraderPerformanceByRunner(),
      fetchVaultOverview({
        limit: 50,
        account: includeAccount ? account : null,
        includeFunders,
        includeAccount,
      }),
      fetchVaultRails({
        account,
        includeAccount,
      }),
    ]);

    return NextResponse.json(
      {
        performance: fullAccess
          ? performanceByRunner.primary
          : sanitizePerformance(performanceByRunner.primary),
        parallel: fullAccess
          ? performanceByRunner.parallel
          : performanceByRunner.parallel.map((runner) => ({
              ...runner,
              performance: sanitizePerformance(runner.performance),
            })),
        vaultRails,
        vault: sanitizeVault(vault, { includeAccount, includeFunders }),
        config: authState.authorized
          ? redactedConfigSummary()
          : publicConfigSummary(redactedConfigSummary()),
        access: {
          operator: authState.authorized,
          holder: holderAccess.holder,
          fullAccess,
          via: authState.via,
          accountMatched,
        },
      },
      {
        headers: {
          "cache-control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "metrics failed",
      },
      { status: 500 }
    );
  }
}
