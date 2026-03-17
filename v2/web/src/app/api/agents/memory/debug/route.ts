import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function indexerUrl(): string {
  return (
    process.env.INDEXER_BACKEND_URL ??
    process.env.ARCHIVE_BACKEND_URL ??
    process.env.SCANNER_BACKEND_URL ??
    ""
  ).trim().replace(/\/$/, "");
}

function indexerHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const secret = process.env.INDEXER_WORKER_SECRET?.trim();
  if (secret) headers.authorization = `Bearer ${secret}`;
  return headers;
}

async function remember(scope: string, key: string, content: string): Promise<void> {
  const base = indexerUrl();
  if (!base) throw new Error("No indexer backend URL configured");
  const res = await fetch(`${base}/api/v1/memory/remember`, {
    method: "PUT",
    headers: indexerHeaders(),
    body: JSON.stringify({ scope, key, content }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`remember failed: ${res.status}`);
}

async function recall(scope: string, key: string): Promise<unknown> {
  const base = indexerUrl();
  if (!base) throw new Error("No indexer backend URL configured");
  const res = await fetch(`${base}/api/v1/memory/recall?scope=${encodeURIComponent(scope)}&key=${encodeURIComponent(key)}`, {
    headers: indexerHeaders(),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`recall failed: ${res.status}`);
  return res.json();
}

async function countByScope(scope: string): Promise<unknown> {
  const base = indexerUrl();
  if (!base) throw new Error("No indexer backend URL configured");
  const res = await fetch(`${base}/api/v1/memory/count?scope=${encodeURIComponent(scope)}`, {
    headers: indexerHeaders(),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`count failed: ${res.status}`);
  return res.json();
}

/**
 * GET /api/agents/memory/debug
 * Tests the full memory round-trip: remember → recall → count
 */
export async function GET() {
  const testScope = "debug-test";
  const testKey = `test-${Date.now()}`;
  const testContent = `Debug test at ${new Date().toISOString()}`;
  const steps: Array<{ step: string; result: unknown; error?: string }> = [];

  // Step 1: Remember
  try {
    await remember(testScope, testKey, testContent);
    steps.push({ step: "remember", result: "ok" });
  } catch (err) {
    steps.push({ step: "remember", result: "failed", error: err instanceof Error ? err.message : String(err) });
  }

  // Step 2: Recall
  try {
    const entries = await recall(testScope, testKey);
    steps.push({ step: "recall", result: entries });
  } catch (err) {
    steps.push({ step: "recall", result: "failed", error: err instanceof Error ? err.message : String(err) });
  }

  // Step 3: Count
  try {
    const count = await countByScope(testScope);
    steps.push({ step: "count", result: count });
  } catch (err) {
    steps.push({ step: "count", result: "failed", error: err instanceof Error ? err.message : String(err) });
  }

  return NextResponse.json({
    indexerUrl: indexerUrl() || "(not set)",
    steps,
    generatedAt: Date.now(),
  });
}
