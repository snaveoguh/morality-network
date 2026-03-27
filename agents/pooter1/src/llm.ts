/**
 * LLM interface — calls Agent Hub (Groq free tier) for all generation.
 * Falls back gracefully if hub is down.
 */
import { AGENT_HUB_URL, AGENT_HUB_SECRET } from "./config.js";

interface GenerateOpts {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}

export async function generate(opts: GenerateOpts): Promise<string> {
  const { system, user, maxTokens = 2000, temperature = 0.7 } = opts;

  const response = await fetch(`${AGENT_HUB_URL}/v1/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(AGENT_HUB_SECRET ? { Authorization: `Bearer ${AGENT_HUB_SECRET}` } : {}),
    },
    body: JSON.stringify({
      task: "premium",
      system,
      user,
      maxTokens,
      temperature,
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Agent Hub error ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = await response.json();
  return stripThinkTags(data.text || data.content || "");
}

/** Strip Qwen-style <think>...</think> reasoning blocks from output */
function stripThinkTags(text: string): string {
  // Handle closed tags: <think>...</think>
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>\s*/g, "");
  // Handle unclosed <think> (model didn't close the tag)
  cleaned = cleaned.replace(/<think>[\s\S]*/g, "");
  return cleaned.trim();
}

export async function chat(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  maxTokens = 2000,
): Promise<string> {
  const response = await fetch(`${AGENT_HUB_URL}/v1/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(AGENT_HUB_SECRET ? { Authorization: `Bearer ${AGENT_HUB_SECRET}` } : {}),
    },
    body: JSON.stringify({
      task: "premium",
      messages,
      maxTokens,
      temperature: 0.7,
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    throw new Error(`Agent Hub chat error ${response.status}`);
  }

  const data = await response.json();
  return stripThinkTags(data.text || data.content || "");
}
