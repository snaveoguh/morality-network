import "server-only";

import type { FeedItem } from "./rss";
import { fetchAllFeeds } from "./rss";
import { findRelatedArticles } from "./article";
import { generateAIEditorial } from "./claude-editorial";
import { saveEditorial, getArchivedEditorial } from "./editorial-archive";
import { hasAIProviderForTask } from "./ai-models";
import { computeEntityHash } from "./entity";
import { TOPIC_TAXONOMY, matchesTopicDefinition } from "./sentiment";
import { biasToPosition } from "./bias";
import { reportError, reportWarn } from "./report-error";
import {
  type NewsroomEdition,
  type NewsroomStory,
  getNewsroomEdition,
  saveNewsroomEdition,
  addStoryToEdition,
} from "./newsroom-edition";

// ============================================================================
// NEWSROOM — Automated editorial selection & generation
//
// Pipeline: Fetch → Rank → Cluster → Select → Generate → Publish
//
// Runs on a schedule (cron) or manually via POST /api/newsroom.
// Selects 5-25 stories per day based on newsworthiness signals,
// generates AI editorials for each, and saves them to the archive.
// The front page surfaces these as "published" articles.
// ============================================================================

// ── Source tiers (mirrored from rss.ts which doesn't export them) ──────────

type SourceTier = "wire" | "broadsheet" | "tabloid" | "blog";

const SOURCE_TIER_MAP: Record<string, SourceTier> = {
  "Reuters": "wire",
  "Associated Press": "wire",
  "AFP / France 24": "wire",
  "UN News": "wire",
  "WHO News": "wire",
  "BBC News": "broadsheet",
  "NPR": "broadsheet",
  "The Guardian": "broadsheet",
  "The Atlantic": "broadsheet",
  "Financial Times": "broadsheet",
  "Bloomberg": "broadsheet",
  "Wall Street Journal": "broadsheet",
  "Al Jazeera": "broadsheet",
  "DW News": "broadsheet",
  "NHK World": "broadsheet",
  "Times of India": "broadsheet",
  "Nature": "broadsheet",
  "ProPublica": "broadsheet",
  "Bellingcat": "broadsheet",
  "Politico": "broadsheet",
  "The Hill": "broadsheet",
  "Mongabay": "broadsheet",
  "Yale E360": "broadsheet",
  "Inside Climate News": "broadsheet",
  "Grist": "broadsheet",
  "GAO Reports": "broadsheet",
  "CBO Publications": "broadsheet",
  "World Bank Blogs": "broadsheet",
  "IMF Blog": "broadsheet",
  "OECD Newsroom": "broadsheet",
};

const TIER_SCORE: Record<SourceTier, number> = {
  wire: 100,
  broadsheet: 70,
  tabloid: 40,
  blog: 20,
};

function getSourceTier(sourceName: string): SourceTier {
  return SOURCE_TIER_MAP[sourceName] || "tabloid";
}

// ============================================================================
// TYPES
// ============================================================================

export interface StoryCluster {
  entityHash: `0x${string}`;
  primary: FeedItem;
  related: FeedItem[];
  score: number;
  signals: {
    sourceCount: number;
    velocity: number;
    sentimentExtremity: number;
    sourceTierMax: number;
    biasSpread: number;
    topicBreadth: number;
    isBreaking: boolean;
  };
}

interface NewsroomOptions {
  /** Force regeneration of already-generated editorials */
  forceRegenerate?: boolean;
  /** Override max stories (default: 25) */
  maxStories?: number;
  /** Override min stories (default: 5) */
  minStories?: number;
}

export interface NewsroomResult {
  edition: NewsroomEdition;
  generated: number;
  skipped: number;
  errors: number;
  details: Array<{
    hash: string;
    title: string;
    status: "generated" | "skipped" | "error";
    error?: string;
  }>;
}

// ============================================================================
// SCORING — six weighted signals for newsworthiness
// ============================================================================

function scoreSourceCount(count: number): number {
  // 1 source = 10, 2 = 35, 3 = 60, 4 = 75, 5+ = 90
  if (count <= 1) return 10;
  if (count === 2) return 35;
  if (count === 3) return 60;
  if (count === 4) return 75;
  return 90;
}

function scoreVelocity(items: FeedItem[]): number {
  if (items.length < 2) return 10;

  const times = items
    .map((i) => new Date(i.pubDate).getTime())
    .filter((t) => !isNaN(t))
    .sort((a, b) => a - b);

  if (times.length < 2) return 10;

  const spanHours = (times[times.length - 1] - times[0]) / (1000 * 60 * 60);
  if (spanHours < 0.1) return 95; // all within 6 minutes
  const perHour = items.length / spanHours;

  if (perHour > 3) return 95;
  if (perHour > 2) return 80;
  if (perHour > 1) return 60;
  if (perHour > 0.5) return 40;
  return 20;
}

function scoreSentimentExtremity(item: FeedItem): number {
  // Simple lexicon check on title + description
  const text = `${item.title} ${item.description || ""}`.toLowerCase();

  const POSITIVE = ["surge", "soar", "breakthrough", "victory", "triumph", "record", "rally"];
  const NEGATIVE = ["crash", "collapse", "crisis", "war", "kill", "attack", "scandal", "fraud", "plunge"];

  let score = 50; // neutral
  for (const term of POSITIVE) {
    if (text.includes(term)) score += 8;
  }
  for (const term of NEGATIVE) {
    if (text.includes(term)) score -= 8;
  }
  score = Math.max(0, Math.min(100, score));

  // Extremity = distance from neutral
  return Math.abs(score - 50) * 2;
}

function scoreSourceTier(items: FeedItem[]): number {
  let maxTier = 0;
  for (const item of items) {
    const tier = TIER_SCORE[getSourceTier(item.source)];
    if (tier > maxTier) maxTier = tier;
  }
  return maxTier;
}

function scoreBiasSpread(items: FeedItem[]): number {
  const positions: number[] = [];
  for (const item of items) {
    if (item.bias) {
      positions.push(biasToPosition(item.bias.bias));
    }
  }
  if (positions.length < 2) return 10;

  const mean = positions.reduce((a, b) => a + b, 0) / positions.length;
  const variance =
    positions.reduce((sum, p) => sum + (p - mean) ** 2, 0) / positions.length;
  const stdDev = Math.sqrt(variance);

  // stdDev 0 = all same bias (10), stdDev 3 = full spectrum (95)
  return Math.min(95, Math.round(10 + stdDev * 28));
}

function scoreTopicBreadth(item: FeedItem): number {
  let count = 0;
  for (const topic of TOPIC_TAXONOMY) {
    if (matchesTopicDefinition(item, topic)) {
      count++;
    }
  }
  // 0 topics = 10, 1 = 30, 2 = 55, 3+ = 80
  if (count === 0) return 10;
  if (count === 1) return 30;
  if (count === 2) return 55;
  return 80;
}

function computeClusterScore(primary: FeedItem, related: FeedItem[]): {
  score: number;
  signals: StoryCluster["signals"];
} {
  const allItems = [primary, ...related];
  const sourceCount = new Set(allItems.map((i) => i.source)).size;

  const sourceCountScore = scoreSourceCount(sourceCount);
  const velocityScore = scoreVelocity(allItems);
  const sentimentScore = scoreSentimentExtremity(primary);
  const tierScore = scoreSourceTier(allItems);
  const biasScore = scoreBiasSpread(allItems);
  const topicScore = scoreTopicBreadth(primary);

  // Is this breaking news? 5+ unique sources within a 2-hour window
  const isBreaking = sourceCount >= 5 && velocityScore >= 60;

  // Weighted composite
  const score = Math.round(
    sourceCountScore * 0.30 +
    velocityScore * 0.20 +
    sentimentScore * 0.15 +
    tierScore * 0.15 +
    biasScore * 0.10 +
    topicScore * 0.10,
  );

  return {
    score,
    signals: {
      sourceCount,
      velocity: velocityScore,
      sentimentExtremity: sentimentScore,
      sourceTierMax: tierScore,
      biasSpread: biasScore,
      topicBreadth: topicScore,
      isBreaking,
    },
  };
}

// ============================================================================
// CLUSTERING — greedy single-linkage using findRelatedArticles
// ============================================================================

const MAX_CLUSTER_SIZE = 8;

export function clusterStories(items: FeedItem[]): StoryCluster[] {
  // Sort by recency (newest first)
  const sorted = [...items].sort(
    (a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime(),
  );

  const claimed = new Set<string>();
  const clusters: StoryCluster[] = [];

  for (const item of sorted) {
    if (claimed.has(item.id)) continue;

    // Find related coverage (reuses existing algorithm)
    const related = findRelatedArticles(item, sorted, MAX_CLUSTER_SIZE)
      .filter((r) => !claimed.has(r.id));

    // Pick the highest-tier source as the primary
    const allInCluster = [item, ...related];
    const primary = allInCluster.reduce((best, curr) => {
      const bestTier = TIER_SCORE[getSourceTier(best.source)];
      const currTier = TIER_SCORE[getSourceTier(curr.source)];
      return currTier > bestTier ? curr : best;
    });
    const rest = allInCluster.filter((i) => i.id !== primary.id);

    // Mark all items as claimed
    for (const i of allInCluster) {
      claimed.add(i.id);
    }

    const { score, signals } = computeClusterScore(primary, rest);
    const entityHash = computeEntityHash(primary.link);

    clusters.push({
      entityHash,
      primary,
      related: rest,
      score,
      signals,
    });
  }

  // Sort by score descending
  clusters.sort((a, b) => b.score - a.score);
  return clusters;
}

// ============================================================================
// SELECTION — pick 5-25 stories for today's edition
// ============================================================================

export function selectStories(
  clusters: StoryCluster[],
  options: { min: number; max: number } = { min: 5, max: 25 },
): StoryCluster[] {
  const selected: StoryCluster[] = [];
  const topicCounts = new Map<string, number>();
  const sourceCounts = new Map<string, number>();

  // Phase 1: Always include breaking news
  for (const cluster of clusters) {
    if (cluster.signals.isBreaking) {
      selected.push(cluster);
    }
  }

  // Phase 2: Fill from top-scored clusters
  for (const cluster of clusters) {
    if (selected.length >= options.max) break;
    if (selected.some((s) => s.entityHash === cluster.entityHash)) continue;

    // Topic diversity: max 2 per topic (was 3 — enforce more diverse coverage)
    const primaryTopics = TOPIC_TAXONOMY
      .filter((t) => matchesTopicDefinition(cluster.primary, t))
      .map((t) => t.slug);

    const topicSaturated = primaryTopics.some(
      (slug) => (topicCounts.get(slug) ?? 0) >= 2,
    );
    if (topicSaturated && selected.length >= options.min) continue;

    // Source diversity: max 1 per primary source (was 2 — no duplicate sources)
    const sourceKey = cluster.primary.source;
    if ((sourceCounts.get(sourceKey) ?? 0) >= 1 && selected.length >= options.min) continue;

    selected.push(cluster);

    // Update counters
    for (const slug of primaryTopics) {
      topicCounts.set(slug, (topicCounts.get(slug) ?? 0) + 1);
    }
    sourceCounts.set(sourceKey, (sourceCounts.get(sourceKey) ?? 0) + 1);
  }

  return selected;
}

// ============================================================================
// ORCHESTRATOR — run the full newsroom pipeline
// ============================================================================

const DELAY_BETWEEN_GENERATIONS_MS = 2_000;
const DEFAULT_MAX_STORIES = 10; // Pooter Originals: 10 curated pieces per day

function getTodayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function runNewsroom(
  options?: NewsroomOptions,
): Promise<NewsroomResult> {
  const today = getTodayUTC();
  const minStories = options?.minStories ?? 5;
  const maxStories = options?.maxStories ?? DEFAULT_MAX_STORIES;

  reportWarn("newsroom", `Starting for ${today} (${minStories}-${maxStories} stories)`);

  // 1. Fetch all feeds
  const items = await fetchAllFeeds();
  if (items.length === 0) {
    reportWarn("newsroom", "No feed items available");
    return {
      edition: {
        date: today,
        generatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        stories: [],
      },
      generated: 0,
      skipped: 0,
      errors: 0,
      details: [],
    };
  }

  reportWarn("newsroom", `${items.length} feed items loaded`);

  // 2. Cluster stories
  const clusters = clusterStories(items);
  reportWarn("newsroom", `${clusters.length} story clusters identified`);

  // 3. Select stories for publication
  const selected = selectStories(clusters, { min: minStories, max: maxStories });
  reportWarn("newsroom", `${selected.length} stories selected (${selected.filter((s) => s.signals.isBreaking).length} breaking)`);

  // 4. Check existing edition (idempotent — skip already-generated)
  const existingEdition = await getNewsroomEdition(today);
  const existingHashes = new Set(
    existingEdition?.stories.map((s) => s.entityHash) ?? [],
  );

  // 5. Generate editorials (if AI is available)
  const canGenerate =
    hasAIProviderForTask("editorialWriter") &&
    hasAIProviderForTask("editorialExtractor");

  const details: NewsroomResult["details"] = [];
  let generated = 0;
  let skipped = 0;
  let errors = 0;

  for (const cluster of selected) {
    const hash = cluster.entityHash;

    // Skip if already in today's edition (unless forced)
    if (!options?.forceRegenerate && existingHashes.has(hash)) {
      details.push({ hash, title: cluster.primary.title, status: "skipped" });
      skipped++;
      continue;
    }

    // Skip if editorial already exists in archive (unless forced)
    if (!options?.forceRegenerate) {
      const cached = await getArchivedEditorial(hash).catch(() => null);
      if (cached) {
        // Already generated — just add to today's edition
        const story: NewsroomStory = {
          entityHash: hash,
          title: cluster.primary.title,
          category: cluster.primary.category,
          source: cluster.primary.source,
          score: cluster.score,
          isBreaking: cluster.signals.isBreaking,
          clusterSize: cluster.signals.sourceCount,
          generatedAt: cached.generatedAt ?? new Date().toISOString(),
        };
        await addStoryToEdition(today, story);
        details.push({ hash, title: cluster.primary.title, status: "skipped" });
        skipped++;
        continue;
      }
    }

    // Generate AI editorial
    if (!canGenerate) {
      // No AI provider — still record in edition as "selected" (no editorial body)
      const story: NewsroomStory = {
        entityHash: hash,
        title: cluster.primary.title,
        category: cluster.primary.category,
        source: cluster.primary.source,
        score: cluster.score,
        isBreaking: cluster.signals.isBreaking,
        clusterSize: cluster.signals.sourceCount,
        generatedAt: new Date().toISOString(),
      };
      await addStoryToEdition(today, story);
      details.push({ hash, title: cluster.primary.title, status: "skipped" });
      skipped++;
      continue;
    }

    try {
      reportWarn("newsroom", `Generating editorial for "${cluster.primary.title.slice(0, 60)}..." (score: ${cluster.score}, sources: ${cluster.signals.sourceCount})`);

      const editorial = await generateAIEditorial(
        cluster.primary,
        cluster.related,
      );

      await saveEditorial(hash, editorial, "claude-ai");

      const story: NewsroomStory = {
        entityHash: hash,
        title: cluster.primary.title,
        category: cluster.primary.category,
        source: cluster.primary.source,
        score: cluster.score,
        isBreaking: cluster.signals.isBreaking,
        clusterSize: cluster.signals.sourceCount,
        generatedAt: new Date().toISOString(),
      };
      await addStoryToEdition(today, story);

      details.push({ hash, title: cluster.primary.title, status: "generated" });
      generated++;

      reportWarn("newsroom", `Generated ${generated}/${selected.length}: "${cluster.primary.title.slice(0, 50)}..."`);

      // Rate limit between generations
      if (generated < selected.length) {
        await new Promise((resolve) =>
          setTimeout(resolve, DELAY_BETWEEN_GENERATIONS_MS),
        );
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : String(err);
      reportError("newsroom", `Failed: "${cluster.primary.title.slice(0, 50)}..." — ${message}`, { severity: "error" });
      details.push({
        hash,
        title: cluster.primary.title,
        status: "error",
        error: message,
      });
      errors++;
    }
  }

  // 6. Build final edition from file (includes all stories added incrementally)
  const finalEdition = (await getNewsroomEdition(today)) ?? {
    date: today,
    generatedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    stories: [],
  };

  reportWarn("newsroom", `Complete: ${generated} generated, ${skipped} skipped, ${errors} errors. Edition has ${finalEdition.stories.length} stories.`);

  return {
    edition: finalEdition,
    generated,
    skipped,
    errors,
    details,
  };
}
