import { NextResponse } from "next/server";
import { runSelfLearn, runPipeline } from "@/lib/agents/core/self-learn";

export const dynamic = "force-dynamic";
export const maxDuration = 55;

/**
 * POST /api/agents/memory/self-learn
 *
 * Trigger self-learning pipelines.
 *
 * Body (optional):
 *   { pipeline?: "sentiment-trends" | "event-corpus" | "source-quality" | "editorial-archive" }
 *
 * If pipeline is specified, runs only that pipeline.
 * Otherwise, runs all 4 pipelines in parallel.
 */
export async function POST(request: Request) {
  let body: { pipeline?: string } = {};
  try {
    body = await request.json();
  } catch {
    // Empty body is fine — run all pipelines
  }

  const validPipelines = [
    "sentiment-trends",
    "event-corpus",
    "source-quality",
    "editorial-archive",
  ] as const;

  if (body.pipeline) {
    const pipeline = body.pipeline as (typeof validPipelines)[number];
    if (!validPipelines.includes(pipeline)) {
      return NextResponse.json(
        { error: `Invalid pipeline. Valid options: ${validPipelines.join(", ")}` },
        { status: 400 },
      );
    }

    const result = await runPipeline(pipeline);
    return NextResponse.json(result);
  }

  // Run all pipelines
  const summary = await runSelfLearn();
  return NextResponse.json(summary);
}
