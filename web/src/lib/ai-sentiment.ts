import "server-only";

import { generateTextForTask } from "./ai-provider";
import { hasAIProviderForTask } from "./ai-models";
import type { FeedItem } from "./rss";
import type { TopicDefinition, AITopicScore } from "./sentiment";
import { matchesTopicDefinition } from "./sentiment";
import { MORALITY_AXES } from "./agents/core/soul";

// ============================================================================
// AI-powered sentiment + severity scoring via Claude (batched, cached)
//
// Replaces keyword lexicon with real semantic understanding.
// Returns two scores per topic:
//   - sentiment (0-100): genuine editorial tone
//   - severity  (0-100): human impact severity
// ============================================================================

const AI_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface CachedAIScores {
  scores: Record<string, AITopicScore>;
  timestamp: number;
}

let cachedResult: CachedAIScores | null = null;

const MORAL_AXES_TEXT = MORALITY_AXES.map(
  (a) => `- ${a.label}: ${a.description}`
).join("\n");

const SYSTEM_PROMPT = `You are a news analyst for the Morality Index, a global sentiment tracker. You score news topics on two axes:

1. SENTIMENT (0-100): The genuine editorial tone of coverage.
   0 = overwhelmingly negative/fearful, 50 = truly neutral/mixed, 100 = overwhelmingly positive/optimistic.
   Do NOT just count keywords. Read the meaning. "Peace talks collapse" is negative even though "peace" appears.

2. SEVERITY (0-100): Human impact severity based on these moral axes:
${MORAL_AXES_TEXT}
   0 = trivial/no real-world harm (e.g. celebrity gossip, minor market moves)
   50 = moderate impact (policy changes, economic shifts)
   100 = catastrophic (mass casualties, humanitarian crisis, existential threat)

Respond with ONLY a JSON object mapping topic slugs to scores. No markdown, no explanation.
Example: {"war":{"sentiment":18,"severity":92},"crypto":{"sentiment":72,"severity":12}}`;

function buildUserPrompt(
  topicArticles: Map<string, { displayName: string; headlines: string[] }>
): string {
  const parts: string[] = ["Score each topic based on these headlines:\n"];

  for (const [slug, data] of topicArticles) {
    parts.push(`## ${data.displayName} [${slug}]`);
    for (const h of data.headlines.slice(0, 30)) {
      parts.push(`- ${h}`);
    }
    parts.push("");
  }

  return parts.join("\n");
}

/**
 * Score all topics using Claude in a single batched call.
 * Returns a map of topic slug → { sentiment, severity }.
 * Falls back to null if AI is unavailable.
 */
export async function computeAISentimentScores(
  allItems: FeedItem[],
  topics: TopicDefinition[],
): Promise<Record<string, AITopicScore> | null> {
  // Check cache
  if (cachedResult && Date.now() - cachedResult.timestamp < AI_CACHE_TTL_MS) {
    return cachedResult.scores;
  }

  // Check if any AI provider is available
  if (!hasAIProviderForTask("sentimentScoring")) {
    return null;
  }

  // Group articles by topic
  const topicArticles = new Map<
    string,
    { displayName: string; headlines: string[] }
  >();

  for (const topic of topics) {
    const items = allItems.filter((item) =>
      matchesTopicDefinition(item, topic)
    );
    if (items.length === 0) continue;

    const headlines = items
      .slice(0, 30)
      .map((item) => {
        const desc = item.description
          ? ` — ${item.description.slice(0, 80)}`
          : "";
        return `${item.title}${desc}`;
      });

    topicArticles.set(topic.slug, {
      displayName: topic.displayName,
      headlines,
    });
  }

  if (topicArticles.size === 0) return null;

  try {
    const result = await generateTextForTask({
      task: "sentimentScoring",
      system: SYSTEM_PROMPT,
      user: buildUserPrompt(topicArticles),
      maxTokens: 1024,
      temperature: 0,
      timeoutMs: 20_000,
    });

    const scores = parseAIResponse(result.text, topics);
    if (scores) {
      cachedResult = { scores, timestamp: Date.now() };
    }
    return scores;
  } catch (err) {
    console.warn(
      "[ai-sentiment] Claude scoring failed, falling back to lexicon:",
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

function parseAIResponse(
  text: string,
  topics: TopicDefinition[]
): Record<string, AITopicScore> | null {
  try {
    // Strip <think> tags (reasoning models), markdown fences, and other wrappers
    const cleaned = text
      .replace(/<think>[\s\S]*?<\/think>/g, "")
      .replace(/```json?\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();
    const parsed = JSON.parse(cleaned) as Record<
      string,
      { sentiment?: number; severity?: number }
    >;

    const scores: Record<string, AITopicScore> = {};
    const validSlugs = new Set(topics.map((t) => t.slug));

    for (const [slug, data] of Object.entries(parsed)) {
      if (!validSlugs.has(slug)) continue;
      if (typeof data?.sentiment !== "number" || typeof data?.severity !== "number") continue;

      scores[slug] = {
        sentiment: clamp(Math.round(data.sentiment), 0, 100),
        severity: clamp(Math.round(data.severity), 0, 100),
      };
    }

    return Object.keys(scores).length > 0 ? scores : null;
  } catch {
    console.warn("[ai-sentiment] Failed to parse AI response:", text.slice(0, 200));
    return null;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
