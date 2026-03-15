import { NextRequest } from "next/server";
import {
  buildTerminalSystemPromptWithMemory,
  streamChat,
  hasTerminalLLM,
  type ChatMessage,
  type TerminalTradingContext,
} from "@/lib/terminal-llm";

export const runtime = "nodejs";
export const maxDuration = 30;

// ============================================================================
// POST /api/terminal/chat — Streaming LLM chat for the markets terminal
//
// Accepts { messages, context } and streams back SSE with text chunks.
// Tries Bankr LLM Gateway first, falls back to Venice.
// ============================================================================

interface ChatRequestBody {
  messages: ChatMessage[];
  context: TerminalTradingContext;
  wallet?: string;
}

export async function POST(request: NextRequest) {
  // Check provider availability
  if (!hasTerminalLLM()) {
    return Response.json(
      { error: "No LLM provider configured (set BANKR_API_KEY or VENICE_API_KEY)" },
      { status: 503 },
    );
  }

  let body: ChatRequestBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { messages, context, wallet } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: "messages array required" }, { status: 400 });
  }

  // Trim to last 20 messages to keep context window reasonable
  const recentMessages = messages.slice(-20);

  // Build system prompt with live trading context + persistent memory
  const systemPrompt = await buildTerminalSystemPromptWithMemory(context, wallet);

  // Stream response
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const llmStream = streamChat({
          messages: recentMessages,
          systemPrompt,
          signal: request.signal,
        });

        for await (const chunk of llmStream) {
          if (request.signal.aborted) break;
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ token: chunk })}\n\n`),
          );
        }

        // Signal completion
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Stream failed";
        console.error("[terminal/chat] Stream error:", msg);
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
