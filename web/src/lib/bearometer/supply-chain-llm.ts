import "server-only";

import { hasAIProviderForTask } from "../ai-models";
import { generateTextForTask } from "../ai-provider";
import type { SupplyDirection } from "./supply-chain-taxonomy";
import type { TaggedSupplyChainItem } from "./supply-chain-score";

// ============================================================================
// BEAROMETER — GATED LLM DIRECTION FALLBACK (off by default)
// Only for headlines that hit a group but came back "neutral" from the regex.
// Spend rules (2026-09-19): opt-in via BEAROMETER_LLM_CLASSIFY=true, fast
// model order (editorialExtractor), AI_DISABLED_PROVIDERS respected through
// hasAIProviderForTask, ai-budget enforced fail-closed inside
// generateTextForTask, a hard per-snapshot cap, and every answer cached by
// item id so a headline is classified at most once per process. Any failure
// leaves the regex result in place.
// ============================================================================

const TASK = "editorialExtractor" as const;
const MAX_CALLS_PER_SNAPSHOT = 8;
const CACHE_MAX = 2000;

const cache = new Map<string, SupplyDirection>();

export function llmClassifyEnabled(): boolean {
  return process.env.BEAROMETER_LLM_CLASSIFY === "true" && hasAIProviderForTask(TASK);
}

const SYSTEM =
  "You label news headlines about Chinese critical-mineral supply. Reply with exactly one word: " +
  "TIGHTENING (supply to non-Chinese buyers is getting harder or dearer), " +
  "EASING (getting easier or cheaper), or NEUTRAL (neither, or unclear).";

function parse(text: string): SupplyDirection | null {
  const word = text.trim().toUpperCase();
  if (word.startsWith("TIGHTENING")) return "tightening";
  if (word.startsWith("EASING")) return "easing";
  if (word.startsWith("NEUTRAL")) return "neutral";
  return null;
}

/** Mutates nothing; returns items with neutral directions refined where possible. */
export async function refineNeutralDirections(
  items: TaggedSupplyChainItem[],
): Promise<TaggedSupplyChainItem[]> {
  if (!llmClassifyEnabled()) return items;

  let calls = 0;
  const out: TaggedSupplyChainItem[] = [];
  for (const item of items) {
    if (item.direction !== "neutral") {
      out.push(item);
      continue;
    }

    let direction = cache.get(item.id);
    if (direction === undefined && calls < MAX_CALLS_PER_SNAPSHOT) {
      calls += 1;
      try {
        const result = await generateTextForTask({
          task: TASK,
          system: SYSTEM,
          user: item.title,
          maxTokens: 4,
          temperature: 0,
          timeoutMs: 15_000,
          maxAttempts: 2,
        });
        // Cache unparseable answers as neutral so the same headline is not
        // paid for again on every snapshot.
        direction = parse(result.text) ?? "neutral";
        if (cache.size >= CACHE_MAX) cache.clear();
        cache.set(item.id, direction);
      } catch (error) {
        // Budget blocked, provider down, kill switch: stop calling this snapshot.
        console.warn(
          `[bearometer] llm classify skipped: ${error instanceof Error ? error.message : String(error)}`,
        );
        calls = MAX_CALLS_PER_SNAPSHOT;
      }
    }

    out.push(
      direction && direction !== "neutral" ? { ...item, direction, directionBy: "llm" } : item,
    );
  }
  return out;
}
