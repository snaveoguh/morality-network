import { NextRequest } from "next/server";
import {
  streamVeniceRisk,
  hasVeniceLLM,
  type TerminalTradingContext,
} from "@/lib/terminal-llm";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 30;

// ============================================================================
// POST /api/terminal/risk — Venice-only private portfolio risk analysis
//
// Runs on Venice AI with zero data retention. Portfolio positions, PnL, and
// wallet data are analyzed privately — never stored or logged by the inference
// provider. Produces trustworthy risk assessments for onchain workflows.
//
// Fires in parallel with /api/terminal/chat (Bankr) on every message.
// ============================================================================

interface RiskRequestBody {
  userMessage: string;
  context: TerminalTradingContext;
}

export async function POST(request: NextRequest) {
  // Rate limit: 15 risk analyses per minute per IP (matches terminal/chat)
  const limited = rateLimit(request, { maxRequests: 15, windowMs: 60_000 });
  if (limited) return limited;

  if (!hasVeniceLLM()) {
    return Response.json(
      { error: "Venice AI not configured (set VENICE_API_KEY)" },
      { status: 503 },
    );
  }

  let body: RiskRequestBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { userMessage, context } = body;
  if (!userMessage || typeof userMessage !== "string") {
    return Response.json({ error: "userMessage string required" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const riskStream = streamVeniceRisk({
          userMessage,
          context,
          signal: request.signal,
        });

        for await (const chunk of riskStream) {
          if (request.signal.aborted) break;
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ token: chunk })}\n\n`),
          );
        }

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Risk analysis failed";
        console.error("[terminal/risk] Venice stream error:", msg);
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
