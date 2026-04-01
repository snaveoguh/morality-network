import "server-only";

import { unstable_cache } from "next/cache";
import { listRecentMarketImpactRecords } from "./editorial-archive";
import { generateTextForTask } from "./ai-provider";
import { hasAIProviderForTask } from "./ai-models";
import { computeNarrativeHash, getSeedNarratives } from "./narratives";
import type {
  MacroNarrative,
  NarrativeCategory,
  NarrativeSentiment,
} from "./narratives";

// ============================================================================
// NARRATIVE EXTRACTOR — Surfaces macro narratives from editorial archive
// ============================================================================

interface ExtractedNarrativeRaw {
  id: string;
  title: string;
  description: string;
  category: NarrativeCategory;
  sentiment: NarrativeSentiment;
}

const VALID_CATEGORIES = new Set<NarrativeCategory>([
  "macro-risk",
  "monetary-policy",
  "sector-rotation",
  "geopolitical",
  "crypto-native",
]);

const VALID_SENTIMENTS = new Set<NarrativeSentiment>([
  "bullish",
  "bearish",
  "neutral",
  "contested",
]);

/**
 * Extract macro narratives from recent editorials via AI.
 * Returns new narratives not already in the seed list.
 */
async function extractNarrativesFromEditorialsUncached(): Promise<
  MacroNarrative[]
> {
  if (!hasAIProviderForTask("factExtraction")) return [];

  const records = await listRecentMarketImpactRecords(50);
  if (records.length === 0) return [];

  // Build context from editorial claims
  const claims = records
    .map((r) => `- ${r.claim}`)
    .slice(0, 30)
    .join("\n");

  const seedTitles = getSeedNarratives().map((n) =>
    n.title.toLowerCase(),
  );

  const result = await generateTextForTask({
    task: "factExtraction",
    system: `You extract macro market narratives from editorial claims. Output ONLY a JSON array of narrative objects. Each object has: id (kebab-case), title (short label), description (1-2 sentences explaining the thesis), category (one of: macro-risk, monetary-policy, sector-rotation, geopolitical, crypto-native), sentiment (one of: bullish, bearish, neutral, contested). Return at most 5 narratives. Only return narratives that represent broad thematic forces, not individual stock or token calls. Skip narratives that match these existing titles: ${seedTitles.join(", ")}`,
    user: `Extract macro market narratives from these editorial claims:\n\n${claims}`,
    maxTokens: 1024,
    temperature: 0,
    timeoutMs: 15_000,
  }).catch(() => null);

  if (!result?.text) return [];

  try {
    // Extract JSON array from response
    const jsonMatch = result.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const raw: ExtractedNarrativeRaw[] = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(raw)) return [];

    return raw
      .filter(
        (n) =>
          n.id &&
          n.title &&
          n.description &&
          VALID_CATEGORIES.has(n.category) &&
          VALID_SENTIMENTS.has(n.sentiment) &&
          !seedTitles.includes(n.title.toLowerCase()),
      )
      .slice(0, 5)
      .map(
        (n): MacroNarrative => ({
          ...n,
          entityHash: computeNarrativeHash(n.id),
          seedDate: new Date().toISOString().split("T")[0],
          source: "editorial-ai",
        }),
      );
  } catch {
    return [];
  }
}

const getCachedEditorialNarratives = unstable_cache(
  async () => extractNarrativesFromEditorialsUncached(),
  ["markets-ai-narratives-v1"],
  { revalidate: 86_400 },
);

export async function extractNarrativesFromEditorials(): Promise<
  MacroNarrative[]
> {
  return getCachedEditorialNarratives();
}
