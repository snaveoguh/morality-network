import { NextResponse } from "next/server";
import { redactedConfigSummary, runTraderCycles } from "@/lib/trading/engine";
import { isWorkerTraderRuntime } from "@/lib/runtime-mode";
import { getIndexerBackendUrl } from "@/lib/server/indexer-backend";
import { fetchPersistedTraderState } from "@/lib/server/runtime-backend";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

async function execute() {
  const cycles = await runTraderCycles();
  return NextResponse.json(
    {
      report: cycles.primary,
      parallel: cycles.parallel,
      config: redactedConfigSummary(),
    },
    {
      headers: {
        "cache-control": "no-store, max-age=0",
      },
    }
  );
}

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return true;

  const auth = request.headers.get("authorization")?.trim();
  return auth === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    if (isWorkerTraderRuntime()) {
      const backendUrl = getIndexerBackendUrl();
      if (!backendUrl) {
        return NextResponse.json(
          { error: "TRADER_EXECUTION_MODE=worker requires INDEXER_BACKEND_URL" },
          { status: 503 },
        );
      }

      try {
        const state = await fetchPersistedTraderState();
        return NextResponse.json(
          {
            error: "trader execution is delegated to the always-on worker",
            executionMode: "worker",
            report: state.report,
            parallel: state.parallel,
            updatedAt: state.updatedAt,
            config: state.config,
          },
          { status: 409 },
        );
      } catch (error) {
        return NextResponse.json(
          {
            error:
              error instanceof Error
                ? error.message
                : "persisted trader state unavailable",
          },
          { status: 503 },
        );
      }
    }

    return await execute();
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "execution failed",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
