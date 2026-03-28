import { NextRequest } from "next/server";
import { isAddress } from "viem";
import { sessionMatchesAddress } from "@/lib/operator-auth";
import { requireTerminalAccess } from "@/lib/terminal-access";
import { rateLimit } from "@/lib/rate-limit";
import {
  submitPrompt,
  pollJob,
  cancelJob,
  isValidBankrKey,
} from "@/lib/bankr-agent";

export const runtime = "nodejs";
export const maxDuration = 120; // 2 minutes for polling

// ============================================================================
// POST /api/terminal/trade — Execute a trade via Bankr Agent API
//
// Receives the user's Bankr API key + natural language trade prompt.
// Submits to Bankr, polls for completion, streams SSE status updates.
// We never store the API key — pass-through only.
// ============================================================================

interface TradeRequestBody {
  bankrApiKey: string;
  prompt: string;
  wallet?: string;
  threadId?: string;
}

const POLL_INTERVAL_MS = 2_000;
const MAX_POLL_ATTEMPTS = 60;

export async function POST(request: NextRequest) {
  // Rate limit: 10 trades per minute per IP
  const limited = rateLimit(request, { maxRequests: 10, windowMs: 60_000 });
  if (limited) return limited;

  let body: TradeRequestBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { bankrApiKey, prompt, wallet, threadId } = body;

  // Validate inputs
  if (!bankrApiKey || !isValidBankrKey(bankrApiKey)) {
    return Response.json({ error: "Valid Bankr API key required" }, { status: 400 });
  }
  if (!prompt || typeof prompt !== "string" || prompt.length > 500) {
    return Response.json({ error: "Trade prompt required (max 500 chars)" }, { status: 400 });
  }

  // Validate wallet session if provided
  if (wallet) {
    if (!isAddress(wallet)) {
      return Response.json({ error: "Invalid wallet address" }, { status: 400 });
    }
    const allowed = await sessionMatchesAddress(wallet);
    if (!allowed) {
      return Response.json(
        { error: "Wallet session mismatch" },
        { status: 403 },
      );
    }
  }

  // Check terminal access
  const terminalAccess = await requireTerminalAccess(request, { consume: true });
  if (terminalAccess instanceof Response) return terminalAccess;

  // Stream SSE updates as the trade progresses
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
        );
      };

      try {
        // Submit to Bankr
        send({ status: "submitting", message: "Submitting to Bankr..." });

        const job = await submitPrompt(bankrApiKey, prompt, threadId);
        send({
          status: "pending",
          jobId: job.jobId,
          threadId: job.threadId,
          message: `Job ${job.jobId.slice(0, 8)}... queued`,
        });

        // Poll for result
        let attempts = 0;
        while (attempts < MAX_POLL_ATTEMPTS) {
          if (request.signal.aborted) {
            await cancelJob(bankrApiKey, job.jobId).catch(() => {});
            send({ status: "cancelled", jobId: job.jobId, message: "Trade cancelled" });
            break;
          }

          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
          attempts++;

          const result = await pollJob(bankrApiKey, job.jobId);

          if (result.status === "processing") {
            send({
              status: "processing",
              jobId: job.jobId,
              message: `Processing... (${attempts * 2}s)`,
            });
          }

          if (result.status === "completed") {
            send({
              status: "completed",
              jobId: job.jobId,
              response: result.response,
              richData: result.richData,
              message: result.response ?? "Trade completed",
              done: true,
            });
            break;
          }

          if (result.status === "failed") {
            send({
              status: "failed",
              jobId: job.jobId,
              error: result.error ?? "Trade failed",
              response: result.response,
              done: true,
            });
            break;
          }

          if (result.status === "cancelled") {
            send({
              status: "cancelled",
              jobId: job.jobId,
              message: "Trade was cancelled",
              done: true,
            });
            break;
          }
        }

        // Timeout
        if (attempts >= MAX_POLL_ATTEMPTS) {
          send({
            status: "failed",
            error: "Trade timed out after 2 minutes",
            done: true,
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Trade execution failed";
        console.error("[terminal/trade] Error:", msg);
        send({ status: "failed", error: msg, done: true });
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
