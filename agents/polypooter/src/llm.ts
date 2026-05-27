/**
 * Agent Hub LLM client for polypooter. Mirrors pooter1/src/llm.ts shape so
 * future migrations to a single shared client are mechanical.
 */
import { getConfig } from "./config.js";

interface GenerateOpts {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}

function stripThinkTags(text: string): string {
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>\s*/g, "");
  cleaned = cleaned.replace(/<think>[\s\S]*/g, "");
  return cleaned.trim();
}

export async function generate(opts: GenerateOpts): Promise<string> {
  const config = getConfig();
  const { system, user, maxTokens = 2000, temperature = 0.7 } = opts;
  const secret = process.env.AGENT_HUB_SECRET || "";

  const response = await fetch(`${config.agentHubUrl}/v1/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
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
  const data = (await response.json()) as { text?: string; content?: string };
  return stripThinkTags(data.text || data.content || "");
}
