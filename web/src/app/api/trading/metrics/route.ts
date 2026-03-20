import { NextResponse } from "next/server";
import {
  getOperatorAuthState,
  sessionMatchesAddress,
} from "@/lib/operator-auth";
import { getTraderPerformanceByRunner, redactedConfigSummary } from "@/lib/trading/engine";
import { isWorkerTraderRuntime } from "@/lib/runtime-mode";
import { getIndexerBackendUrl } from "@/lib/server/indexer-backend";
import { fetchPersistedTraderState } from "@/lib/server/runtime-backend";
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

function sanitizePerformance<T extends {
  readiness: {
    liveReady: boolean;
    balances: unknown[];
    reasons: string[];
  };
  open: unknown[];
  closed: unknown[];
}>(report: T): T {
  return {
    ...report,
    account: undefined,
    fundingAddress: undefined,
    open: [],
    closed: [],
    readiness: {
      ...report.readiness,
      balances: [],
      reasons: report.readiness.liveReady
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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const accountParam = searchParams.get("account");
    const account =
      accountParam && isAddress(accountParam)
        ? (accountParam as Address)
        : null;
    const authState = await getOperatorAuthState(request);
    const accountMatched = account ? await sessionMatchesAddress(account) : false;
    const includeAccount = authState.authorized || accountMatched;
    const includeFunders = authState.authorized;

    if (isWorkerTraderRuntime()) {
      const backendUrl = getIndexerBackendUrl();
      if (!backendUrl) {
        return NextResponse.json(
          { error: "TRADER_EXECUTION_MODE=worker requires INDEXER_BACKEND_URL" },
          { status: 503 }
        );
      }

      const [state, vault] = await Promise.all([
        fetchPersistedTraderState(),
        fetchVaultOverview({
          limit: 50,
          account: includeAccount ? account : null,
          includeFunders,
          includeAccount,
        }),
      ]);

      return NextResponse.json(
        {
          performance:
            state.performance && !authState.authorized
              ? sanitizePerformance(state.performance)
              : state.performance,
          parallel: authState.authorized
            ? state.parallelPerformance
            : state.parallelPerformance.map((runner) => ({
                ...runner,
                performance: sanitizePerformance(runner.performance),
              })),
          vault: sanitizeVault(vault, { includeAccount, includeFunders }),
          config: authState.authorized
            ? state.config
            : publicConfigSummary(state.config),
          updatedAt: state.updatedAt,
          backend: "indexer",
          access: {
            operator: authState.authorized,
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

    const [performanceByRunner, vault] = await Promise.all([
      getTraderPerformanceByRunner(),
      fetchVaultOverview({
        limit: 50,
        account: includeAccount ? account : null,
        includeFunders,
        includeAccount,
      }),
    ]);

    return NextResponse.json(
      {
        performance: authState.authorized
          ? performanceByRunner.primary
          : sanitizePerformance(performanceByRunner.primary),
        parallel: authState.authorized
          ? performanceByRunner.parallel
          : performanceByRunner.parallel.map((runner) => ({
              ...runner,
              performance: sanitizePerformance(runner.performance),
            })),
        vault: sanitizeVault(vault, { includeAccount, includeFunders }),
        config: authState.authorized
          ? redactedConfigSummary()
          : publicConfigSummary(redactedConfigSummary()),
        access: {
          operator: authState.authorized,
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
