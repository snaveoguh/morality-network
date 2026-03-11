import { NextResponse } from "next/server";
import { redactedConfigSummary, runTraderCycles } from "@/lib/trading/engine";

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
