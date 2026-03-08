import { NextResponse } from "next/server";
import { redactedConfigSummary, runTraderCycle } from "@/lib/trading/engine";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function execute() {
  const report = await runTraderCycle();
  return NextResponse.json(
    {
      report,
      config: redactedConfigSummary(),
    },
    {
      headers: {
        "cache-control": "no-store, max-age=0",
      },
    }
  );
}

export async function GET() {
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

export async function POST() {
  return GET();
}
