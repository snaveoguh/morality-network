import { NextResponse } from "next/server";
import { getTraderReadinessByRunner, redactedConfigSummary } from "@/lib/trading/engine";
import { isWorkerTraderRuntime } from "@/lib/runtime-mode";
import { getIndexerBackendUrl } from "@/lib/server/indexer-backend";
import { fetchPersistedTraderState } from "@/lib/server/runtime-backend";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    if (isWorkerTraderRuntime()) {
      const backendUrl = getIndexerBackendUrl();
      if (!backendUrl) {
        return NextResponse.json(
          { error: "TRADER_EXECUTION_MODE=worker requires INDEXER_BACKEND_URL" },
          { status: 503 }
        );
      }

      const state = await fetchPersistedTraderState();
      return NextResponse.json(
        {
          readiness: state.readiness,
          parallel: state.parallelReadiness,
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

    const readinessByRunner = await getTraderReadinessByRunner();
    return NextResponse.json(
      {
        readiness: readinessByRunner.primary,
        parallel: readinessByRunner.parallel,
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
        error: error instanceof Error ? error.message : "readiness failed",
      },
      { status: 500 }
    );
  }
}
