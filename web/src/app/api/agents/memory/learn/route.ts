import { NextResponse } from "next/server";
import { learnFromUrl, batchLearn } from "@/lib/agents/core/knowledge";

export const dynamic = "force-dynamic";
export const maxDuration = 55;

/**
 * POST /api/agents/memory/learn
 *
 * Trigger URL knowledge ingestion.
 *
 * Body:
 *   { url: string }           — learn from a single URL
 *   { urls: string[] }        — batch learn from multiple URLs
 */
export async function POST(request: Request) {
  let body: { url?: string; urls?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Single URL
  if (typeof body.url === "string" && body.url.trim()) {
    const result = await learnFromUrl(body.url.trim());
    return NextResponse.json(result);
  }

  // Batch URLs
  if (Array.isArray(body.urls) && body.urls.length > 0) {
    const urls = body.urls
      .filter((u): u is string => typeof u === "string" && u.trim().length > 0)
      .slice(0, 10); // Cap at 10 URLs per request

    if (urls.length === 0) {
      return NextResponse.json({ error: "No valid URLs provided" }, { status: 400 });
    }

    const results = await batchLearn(urls);
    const totalFacts = results.reduce((sum, r) => sum + r.factsLearned, 0);
    return NextResponse.json({
      results,
      totalUrls: results.length,
      totalFacts,
    });
  }

  return NextResponse.json({ error: "Provide url or urls in request body" }, { status: 400 });
}
