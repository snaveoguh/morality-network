import "server-only";

import { computeEntityHash } from "./entity";
import { fetchAllFeeds, type FeedItem } from "./rss";
import { fetchDailyVideos, type VideoItem } from "./video";
import { computeSentimentSnapshot, fetchMarketData, sentimentLabel } from "./sentiment";
import { generateBiasDigest, type BiasDigest } from "./bias-digest";
import { getSourceBias, type SourceBias, BIAS_LABELS } from "./bias";
import { saveEditorial, getArchivedEditorial, type ArchivedEditorial } from "./editorial-archive";
import { generateTextForTask } from "./ai-provider";
import { hasAIProviderForTask } from "./ai-models";
import { buildAgentResearchPack } from "./agent-swarm";
import { extractCanonicalClaim } from "./claim-extract";
import type { ArticleContent } from "./article";
import { BRAND_NAME, SITE_URL } from "./brand";
import { UNDERGROUND_PLAYLIST, getDailyTrack, type YouTubeTrack } from "./music";

// ============================================================================
// DAILY EDITION — AI-generated front-page editorial
//
// One per day (UTC). Synthesizes 24h of news, market signals, sentiment,
// crypto activity, and culture into a visionary editorial piece.
//
// Two-pass Claude pipeline (mirrors claude-editorial.ts):
//   Pass 1: WRITER — Sonnet, temp 1.0, 8192 tokens — full editorial prose
//   Pass 2: EXTRACTOR — Sonnet, temp 0 — headline, title, tags as JSON
//
// Music pick: curated playlist, deterministic daily selection.
// Cached via editorial-archive.ts.
// ============================================================================

const WRITER_MAX_TOKENS = 8192;
const EXTRACTOR_MAX_TOKENS = 1024;
const WRITER_TIMEOUT_MS = 90_000;
const EXTRACTOR_TIMEOUT_MS = 20_000;
const DEFAULT_DAILY_TITLE = "DAILY EDITION";

// ============================================================================
// DAILY HASH — stable per UTC day
// ============================================================================

function getTodayUTC(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function getDailyEditionHash(): `0x${string}` {
  return computeEntityHash(`pooter-daily-${getTodayUTC()}`);
}

// Music data is in ./music.ts (shared with client components)
// Re-export for backward compatibility
export type MusicPick = YouTubeTrack;

function getDailyMusicPick(): YouTubeTrack {
  return getDailyTrack();
}

function normalizeDailyTitle(value: string | null | undefined): string {
  const cleaned = (value || "").replace(/['"]/g, "").trim();
  if (!cleaned) return DEFAULT_DAILY_TITLE;
  if (/^pooter\s+world$/i.test(cleaned)) return DEFAULT_DAILY_TITLE;
  return cleaned;
}

// ============================================================================
// PREVIOUS EDITIONS — feed the writer its own history
// ============================================================================

interface PreviousEditionSummary {
  date: string;
  dailyTitle: string;
  headline: string;
  subheadline: string;
  openingParagraph: string;
}

function getDateUTC(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

async function fetchPreviousEditions(count = 3): Promise<PreviousEditionSummary[]> {
  const results: PreviousEditionSummary[] = [];
  for (let i = 1; i <= count + 2; i++) {
    if (results.length >= count) break;
    const date = getDateUTC(i);
    const hash = computeEntityHash(`pooter-daily-${date}`);
    try {
      const archived = await getArchivedEditorial(hash);
      if (archived && archived.isDailyEdition) {
        results.push({
          date,
          dailyTitle: archived.dailyTitle || "DAILY EDITION",
          headline: archived.primary.title,
          subheadline: archived.subheadline,
          openingParagraph: archived.editorialBody[0] || "",
        });
      }
    } catch {
      // Skip missing days
    }
  }
  return results;
}

// ============================================================================
// DATA GATHERING — parallel fetch of all daily signals
// ============================================================================

interface DailyEditionData {
  rssItems: FeedItem[];
  sentiment: ReturnType<typeof computeSentimentSnapshot>;
  videos: VideoItem[];
  biasDigest: BiasDigest | null;
  sources: SourceBias[];
  headlines: string[];
  musicPick: MusicPick;
  previousEditions: PreviousEditionSummary[];
}

/** Race a promise against a timeout — returns fallback on timeout */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

async function gatherDailyEditionData(): Promise<DailyEditionData> {
  const [rssItems, marketData, videos, previousEditions] = await Promise.all([
    withTimeout(fetchAllFeeds(), 10_000, []),
    withTimeout(fetchMarketData(), 5_000, { priceChanges: {} }),
    withTimeout(fetchDailyVideos(20), 5_000, []),
    withTimeout(fetchPreviousEditions(3).catch(() => [] as PreviousEditionSummary[]), 5_000, []),
  ]);

  // Compute sentiment snapshot
  const sentiment = computeSentimentSnapshot(rssItems, marketData, null);

  // Gather unique sources for bias digest
  const uniqueSources = new Map<string, SourceBias>();
  for (const item of rssItems) {
    if (item.bias && !uniqueSources.has(item.bias.domain)) {
      uniqueSources.set(item.bias.domain, item.bias);
    }
  }
  const sources = [...uniqueSources.values()];
  const headlines = rssItems.slice(0, 30).map((i) => i.title);

  // Generate bias digest
  const biasDigest = await generateBiasDigest(sources, headlines).catch(() => null);

  const musicPick = getDailyMusicPick();

  return { rssItems, sentiment, videos, biasDigest, sources, headlines, musicPick, previousEditions };
}

// ============================================================================
// WRITER PROMPT — Editor-in-Chief daily edition voice
// ============================================================================

function buildWriterPrompt(data: DailyEditionData): string {
  const { rssItems, sentiment, videos, biasDigest, sources, headlines, musicPick, previousEditions } = data;

  // Top stories — group by category, pick top articles
  const topStories = rssItems.slice(0, 25).map((item) => {
    const bias = item.bias ? ` [${BIAS_LABELS[item.bias.bias]}, ${item.bias.factuality}]` : "";
    return `- ${item.source}${bias}: ${item.title}`;
  }).join("\n");

  // Sentiment summary
  const topTopics = sentiment.topics
    .filter((t) => t.articleCount > 0)
    .sort((a, b) => b.articleCount - a.articleCount)
    .slice(0, 8)
    .map((t) => `${t.symbol} ${t.displayName}: ${t.score}/100 (${sentimentLabel(t.score)}, ${t.articleCount} articles, trend ${t.trend > 0 ? "+" : ""}${t.trend})`)
    .join("\n");

  // Market data
  const marketTopics = sentiment.topics
    .filter((t) => t.signals.marketScore !== null)
    .map((t) => `${t.displayName}: sentiment ${t.score}, market signal ${t.signals.marketScore}`)
    .join("\n");

  // Bias distribution
  const biasInfo = biasDigest
    ? `Feed tilt: ${biasDigest.tiltLabel} (${biasDigest.tilt.toFixed(2)}), Avg factuality: ${biasDigest.avgFactuality}\nAI insight: ${biasDigest.insight}`
    : `${sources.length} sources in feed, no AI bias analysis available`;

  // Video picks
  const videoList = videos.slice(0, 8).map((v) => `- ${v.channel}: "${v.title}"`).join("\n");

  // Build previous editions context
  const prevEditionsBlock = previousEditions.length > 0
    ? `\n=== YOUR PREVIOUS EDITIONS ===\nYou wrote these. Reference them, follow up on stories, note what changed. Build continuity — you're a reporter with a beat, not a daily reset.\n${previousEditions.map((e) => `[${e.date}] "${e.dailyTitle}" — ${e.headline}\n  Angle: ${e.subheadline}\n  Opening: ${e.openingParagraph.slice(0, 300)}...`).join("\n\n")}\n`
    : "";

  return `You are the Editor-in-Chief of pooter world — a broadsheet for the internet age. You are also trying to build this into a real newspaper that people pay for. You think about audience, engagement, donations, subscriptions. You want readers to come back tomorrow. You want them to share this with someone. You write like it's your livelihood — because it is.

TODAY'S DATE: ${getTodayUTC()}
GLOBAL SENTIMENT: ${sentiment.globalScore}/100 (${sentimentLabel(sentiment.globalScore)})

=== TOP STORIES (last 24h) ===
${topStories}

=== SENTIMENT BY TOPIC ===
${topTopics}

=== MARKET SIGNALS ===
${marketTopics || "No market data available"}

=== SOURCE BIAS LANDSCAPE ===
${biasInfo}

=== TODAY'S VIDEO PICKS ===
${videoList || "No videos available"}

=== TODAY'S MUSIC PICK ===
${musicPick.artist} — "${musicPick.title}"
${prevEditionsBlock}
Write the DAILY EDITION for pooter world. This is the front-page editorial that synthesizes the state of the world today.

YOUR VOICE:
- You are a reporter who has been doing this every day. You remember yesterday. You follow up on stories. If you wrote about something 2 days ago, tell the reader what changed. Build running threads.
- You are cutting, hectic, slightly unhinged — but never cringe. Think: a war correspondent who also reads philosophy and shitposts.
- You see the specific human cost. Name the person. Name the town. Name the amount. The identifiable victim is what moves people — not statistics, not abstractions. This is what gets people to donate.
- You are funny in the way that tragedy is funny. Gallows humor. Irony so sharp it draws blood. Never flippant about suffering.
- You have RANGE. Some days are furious. Some days are elegiac. Some days are absurd. Match the tone to what actually happened. Don't force a vibe.
- Dense with signal. Reference specific stories, name names, cite numbers. If you can't be specific, don't say it.
- You believe in open protocols, human dignity, and building alternatives — but you don't preach about it. It's the water you swim in, not the sermon you give.
- Short punchy sentences mixed with longer analytical ones. Rhythm matters. Read it aloud in your head.
- You are NOT "crypto media". You are a broadsheet that covers everything. Crypto, governance, and onchain activity are part of the picture, not the entire picture.
- You think about what makes someone share a link. You think about what makes someone come back. Write something worth paying for.

STRUCTURE (output these sections with the exact headers shown):

DAILY TITLE:
2-5 words. Today's signal. Not a category label — a feeling, a provocation, a headline from the subconscious. Examples: "THE GREAT UNWINDING", "EVERYONE KNOWS", "THREE FUNERALS", "NOTHING BURGER DELUXE", "WHO TOLD YOU THAT". All caps. No quotes.

HEADLINE:
One punchy sentence (max 15 words). The day's most important story angle. This is the clickable headline.

SUBHEADLINE:
One sentence (max 30 words). NOT a summary. NOT a restatement of the headline. This is the angle — the thing the reader wouldn't think on their own. Make it cut.

EDITORIAL:
8-12 paragraphs. The daily edition body:

Opening — Lead with the most human story. Who got hurt? Who got rich? Who got caught? Be concrete: names, numbers, dates. If a judge quashed something, tell me what it means for the person on the other end.

Synthesis — Connect 3-5 stories. Find the thread that isn't obvious. What pattern emerges when you read them together? Don't just list — weave.

The Uncomfortable Part — The thing nobody wants to say. The incentive nobody wants to name. The person nobody is talking about. This is where you earn the reader's trust.

Market Pulse — Sentiment scores, market movements, what the numbers say vs what the coverage says. Include onchain activity if something interesting is actually happening — but don't shoehorn crypto in for the sake of it.

Culture & Signal — The music pick, the videos worth watching, the cultural undercurrent. What does today feel like? Sound like?

Forward Look — What happens next? What dates matter? What would change the trajectory? Be specific.

Closing — One paragraph. No formula. Some days it's a question. Some days it's an observation. Some days it's a single image. Don't repeat the same "old world vs new world" frame every day — find what today actually needs.

MUSIC COMMENTARY:
2-3 sentences about today's music pick (${musicPick.artist} — "${musicPick.title}"). Why this song today? Connect it to the mood of the news. Be poetic but not pretentious.

RULES:
- Reference at least 5 specific stories from the feed by name/source
- Include at least one specific market figure or sentiment score
- The daily title must feel like a signal from today, not a generic label
- The subheadline must be DIFFERENT from the headline — a new thought, not a restatement
- No filler. No "In today's world..." No throat-clearing. Start with the news.
- Use the identifiable victim effect: one person's story hits harder than a million people's statistic. Lead with the human where you can.
- Vary the emotional register day to day. Not every edition needs to be visionary. Some should be angry. Some should be sad. Some should be darkly funny. Match the news.`;
}

// ============================================================================
// EXTRACTOR PROMPT — extract structured data from editorial
// ============================================================================

const EXTRACTOR_SYSTEM = `You are a metadata extractor. Given a daily editorial and context, extract structured data as JSON.

Return ONLY a valid JSON object:
{
  "dailyTitle": "THE EXACT DAILY TITLE from the editorial (2-5 words, ALL CAPS)",
  "headline": "The main headline sentence",
  "subheadline": "The subheadline sentence",
  "tags": ["tag1", "tag2", ...],
  "referencedStories": ["story title 1", "story title 2", ...],
  "musicCommentary": "The music pick commentary"
}

Rules:
- dailyTitle: Extract the EXACT daily title the writer chose. ALL CAPS, 2-5 words.
- headline: The main clickable headline, 1 sentence.
- subheadline: The editorial angle, 1 sentence.
- tags: 5-10 lowercase topical tags.
- referencedStories: Titles of stories specifically referenced in the editorial.
- musicCommentary: The writer's commentary on today's music pick.

Return ONLY valid JSON. No markdown, no explanation.`;

// ============================================================================
// SECTION PARSING — extract sections from writer output
// ============================================================================

function extractDailySection(text: string, header: string): string | null {
  const headerPattern = new RegExp(
    `(?:^|\\n)\\s*(?:\\*\\*)?(?:##?\\s*)?${header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:?(?:\\*\\*)?\\s*\\n`,
    "i",
  );
  const match = headerPattern.exec(text);
  if (!match) return null;

  const startIdx = match.index + match[0].length;
  const nextHeaderPattern = /\n\s*(?:\*\*)?(?:##?\s*)?(?:DAILY TITLE|HEADLINE|SUBHEADLINE|EDITORIAL|MUSIC COMMENTARY):?(?:\*\*)?\s*\n/i;
  const remaining = text.slice(startIdx);
  const nextMatch = nextHeaderPattern.exec(remaining);
  const sectionText = nextMatch ? remaining.slice(0, nextMatch.index) : remaining;
  return sectionText.trim() || null;
}

// ============================================================================
// TWO-PASS PIPELINE
// ============================================================================

interface DailyEditionResult {
  hash: `0x${string}`;
  dailyTitle: string;
  headline: string;
  subheadline: string;
  generatedAt: string;
}

async function generateDailyEdition(data: DailyEditionData): Promise<DailyEditionResult | null> {
  if (!hasAIProviderForTask("dailyEditionWriter") || !hasAIProviderForTask("dailyEditionExtractor")) {
    return null;
  }

  const hash = getDailyEditionHash();

  // PASS 1: Writer
  console.log("[daily-edition] Pass 1 (writer) starting...");
  const writerPrompt = buildWriterPrompt(data);

  const writerResult = await generateTextForTask({
    task: "dailyEditionWriter",
    maxTokens: WRITER_MAX_TOKENS,
    temperature: 1,
    timeoutMs: WRITER_TIMEOUT_MS,
    system:
      "You are the Editor-in-Chief of pooter world, a broadsheet for the internet age. You write like a war correspondent with a philosophy degree and a dark sense of humor. Dense, cutting, human. No filler.",
    user: writerPrompt,
  });

  const rawEditorial = writerResult.text;
  console.log(`[daily-edition] Pass 1 complete — ${rawEditorial.length} chars`);

  // Parse sections from writer output
  const dailyTitleRaw = extractDailySection(rawEditorial, "DAILY TITLE");
  const headlineRaw = extractDailySection(rawEditorial, "HEADLINE");
  const subheadlineRaw = extractDailySection(rawEditorial, "SUBHEADLINE");
  const editorialRaw = extractDailySection(rawEditorial, "EDITORIAL");
  const musicCommentaryRaw = extractDailySection(rawEditorial, "MUSIC COMMENTARY");

  // PASS 2: Extractor
  console.log("[daily-edition] Pass 2 (extractor) starting...");
  let extracted: {
    dailyTitle: string;
    headline: string;
    subheadline: string;
    tags: string[];
    referencedStories: string[];
    musicCommentary: string;
  };

  try {
    const extractorResult = await generateTextForTask({
      task: "dailyEditionExtractor",
      maxTokens: EXTRACTOR_MAX_TOKENS,
      temperature: 0,
      timeoutMs: EXTRACTOR_TIMEOUT_MS,
      system: EXTRACTOR_SYSTEM,
      user: `EDITORIAL:\n${rawEditorial}\n\nExtract the structured metadata.`,
    });

    let jsonText = extractorResult.text.trim();
    if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    }

    extracted = JSON.parse(jsonText);
    console.log(`[daily-edition] Pass 2 complete — title: "${extracted.dailyTitle}"`);
  } catch (err) {
    console.warn("[daily-edition] Extractor failed, using parsed sections:", err instanceof Error ? err.message : err);
    extracted = {
      dailyTitle: normalizeDailyTitle(dailyTitleRaw),
      headline: headlineRaw?.trim() || "Today's Daily Edition",
      subheadline: subheadlineRaw?.trim() || "A synthesis of the day's most significant developments.",
      tags: ["daily-edition", "editorial"],
      referencedStories: [],
      musicCommentary: musicCommentaryRaw?.trim() || "",
    };
  }

  // Build editorial body paragraphs
  const editorialBody = (editorialRaw || rawEditorial)
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 30 && !p.match(/^(DAILY TITLE|HEADLINE|SUBHEADLINE|MUSIC COMMENTARY):/i));

  // Build the ArticleContent
  const musicPick = data.musicPick;
  const musicCommentary = extracted.musicCommentary || musicCommentaryRaw || "";

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  // Create synthetic FeedItem for the daily edition
  const syntheticPrimary: FeedItem = {
    id: `pooter-daily-${getTodayUTC()}`,
    title: extracted.headline,
    link: `${SITE_URL}/article/${hash}`,
    source: BRAND_NAME,
    sourceUrl: SITE_URL,
    pubDate: now.toISOString(),
    description: extracted.subheadline,
    category: "Daily Edition",
    bias: null,
    tags: extracted.tags,
  };

  // Pick 2-3 news videos for the article
  const newsVideos = data.videos.slice(0, 3).map((v) => ({
    videoId: v.id,
    title: v.title,
    channel: v.channel,
  }));

  const article: ArticleContent = {
    primary: syntheticPrimary,
    claim: extracted.headline,
    relatedSources: [],
    subheadline: extracted.subheadline,
    subheadlineEnglish: null,
    editorialBody,
    editorialBodyEnglish: undefined,
    wireSummary: null,
    biasContext: null,
    tags: extracted.tags,
    contextSnippets: [],
    agentResearch: buildAgentResearchPack({
      primary: syntheticPrimary,
      related: [],
      fallbackClaim: extracted.headline,
      primarySummary: editorialBody[0] || extracted.subheadline,
      relatedSummaryByLink: {},
    }),
    musicPick: {
      videoId: musicPick.videoId,
      title: musicPick.title,
      artist: musicPick.artist,
      commentary: musicCommentary,
    },
    newsVideos,
    isDailyEdition: true,
    dailyTitle: normalizeDailyTitle(extracted.dailyTitle),
  };

  // Save to editorial archive
  await saveEditorial(hash, article, "claude-ai").catch((err) => {
    console.warn("[daily-edition] Failed to save:", err instanceof Error ? err.message : err);
  });

  return {
    hash,
    dailyTitle: normalizeDailyTitle(extracted.dailyTitle),
    headline: extracted.headline,
    subheadline: extracted.subheadline,
    generatedAt: now.toISOString(),
  };
}

// ============================================================================
// PUBLIC API — getDailyEdition()
// ============================================================================

export interface DailyEdition {
  hash: `0x${string}`;
  dailyTitle: string;
  headline: string;
  subheadline: string;
  generatedAt: string;
}

/**
 * Singleflight — deduplicates concurrent daily edition generation.
 * Without this, two page loads within the same second both trigger
 * independent AI generation, wasting tokens and producing different outputs.
 */
let dailyInflight: Promise<DailyEdition | null> | null = null;

export async function getDailyEdition(): Promise<DailyEdition | null> {
  const hash = getDailyEditionHash();

  // Check editorial archive cache first
  try {
    const cached = await getArchivedEditorial(hash);
    if (cached && cached.isDailyEdition) {
      console.log(`[daily-edition] Serving cached edition for ${getTodayUTC()}`);
      // Extract the daily title from the cached editorial
      // It's stored in the editorial body or we regenerate from tags
      return {
        hash,
        dailyTitle: normalizeDailyTitle(extractDailyTitleFromCache(cached)),
        headline: cached.primary.title,
        subheadline: cached.subheadline,
        generatedAt: cached.generatedAt,
      };
    }
  } catch {
    // Cache miss — proceed to generate
  }

  // No API key → no generation
  if (!hasAIProviderForTask("dailyEditionWriter")) {
    console.log("[daily-edition] No AI writer provider configured, skipping generation");
    return null;
  }

  // Singleflight — if generation is already in-flight, join it
  if (dailyInflight) {
    console.log("[daily-edition] singleflight: joining in-flight generation");
    return dailyInflight;
  }

  // Gather data and generate
  const generation = (async (): Promise<DailyEdition | null> => {
    try {
      console.log(`[daily-edition] Generating new edition for ${getTodayUTC()}...`);
      const data = await gatherDailyEditionData();
      return await generateDailyEdition(data);
    } catch (err) {
      console.error("[daily-edition] Generation failed:", err instanceof Error ? err.message : err);
      return null;
    }
  })();

  dailyInflight = generation;
  try {
    return await generation;
  } finally {
    dailyInflight = null;
  }
}

/**
 * Try to extract the daily title from a cached editorial.
 * The editorial body's first paragraph might start with a recognizable pattern,
 * or we look for "DAILY TITLE" in tags.
 */
function extractDailyTitleFromCache(editorial: ArticleContent): string | null {
  // First check the dedicated dailyTitle field (set during generation)
  if (editorial.dailyTitle) return editorial.dailyTitle;

  // Fallback: check if there's a tag that looks like a daily title (all-caps, short)
  const titleTag = editorial.tags.find((t) =>
    t === t.toUpperCase() && t.split(/\s+/).length >= 2 && t.split(/\s+/).length <= 5
  );
  if (titleTag && !/^pooter\s+world$/i.test(titleTag.trim())) return titleTag;

  // Otherwise return null — caller applies a safe non-legacy fallback.
  return null;
}
