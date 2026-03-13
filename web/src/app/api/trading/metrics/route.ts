import { NextResponse } from "next/server";
import { getTraderPerformanceByRunner, redactedConfigSummary } from "@/lib/trading/engine";
import { isWorkerTraderRuntime } from "@/lib/runtime-mode";
import { getIndexerBackendUrl } from "@/lib/server/indexer-backend";
import { fetchPersistedTraderState } from "@/lib/server/runtime-backend";
import { fetchVaultOverview } from "@/lib/vault";
import { isAddress, type Address } from "viem";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const accountParam = searchParams.get("account");
    const account =
      accountParam && isAddress(accountParam)
        ? (accountParam as Address)
        : null;

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
        fetchVaultOverview({ limit: 50, account }),
      ]);

      return NextResponse.json(
        {
          performance: state.performance,
          parallel: state.parallelPerformance,
          vault,
          config: state.config,
          updatedAt: state.updatedAt,
          backend: "indexer",
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
      fetchVaultOverview({ limit: 50, account }),
    ]);

    return NextResponse.json(
      {
        performance: performanceByRunner.primary,
        parallel: performanceByRunner.parallel,
        vault,
        config: redactedConfigSummary(),
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
