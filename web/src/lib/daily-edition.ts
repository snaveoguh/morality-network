import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { computeEntityHash } from "./entity";
import { fetchAllFeeds, type FeedItem } from "./rss";
import { fetchDailyVideos, type VideoItem } from "./video";
import { computeSentimentSnapshot, fetchMarketData, sentimentLabel } from "./sentiment";
import { generateBiasDigest, type BiasDigest } from "./bias-digest";
import { getSourceBias, type SourceBias, BIAS_LABELS } from "./bias";
import { saveEditorial, getArchivedEditorial } from "./editorial-archive";
import { buildAgentResearchPack } from "./agent-swarm";
import { extractCanonicalClaim } from "./claim-extract";
import type { ArticleContent } from "./article";
import { BRAND_NAME, SITE_URL } from "./brand";

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

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const WRITER_MODEL = "claude-sonnet-4-20250514";
const EXTRACTOR_MODEL = "claude-sonnet-4-20250514";
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

// ============================================================================
// MUSIC PLAYLIST — curated, deterministic daily pick
// ============================================================================

interface MusicPick {
  videoId: string;
  title: string;
  artist: string;
}

const MUSIC_PLAYLIST: MusicPick[] = [
  { videoId: "hTWKbfoikeg", title: "Smells Like Teen Spirit", artist: "Nirvana" },
  { videoId: "YR5ApYxkU-U", title: "Bohemian Rhapsody", artist: "Queen" },
  { videoId: "Zi_XLOBDo_Y", title: "Billie Jean", artist: "Michael Jackson" },
  { videoId: "fJ9rUzIMcZQ", title: "Bohemian Rhapsody", artist: "Queen" },
  { videoId: "6Ejga4kJUts", title: "Shine On You Crazy Diamond", artist: "Pink Floyd" },
  { videoId: "btPJPFnesV4", title: "Eye of the Tiger", artist: "Survivor" },
  { videoId: "rY0WxgSXdEE", title: "Let It Be", artist: "The Beatles" },
  { videoId: "oRdxUFDoQe0", title: "Jump Around", artist: "House of Pain" },
  { videoId: "A_MjCqQoLLA", title: "Hey Ya!", artist: "OutKast" },
  { videoId: "djV11Xbc914", title: "A-Punk", artist: "Vampire Weekend" },
  { videoId: "1w7OgIMMRc4", title: "Sweet Child O' Mine", artist: "Guns N' Roses" },
  { videoId: "TdrL3QxjyVw", title: "Paranoid Android", artist: "Radiohead" },
  { videoId: "dTAAsCNK7RA", title: "September", artist: "Earth, Wind & Fire" },
  { videoId: "HAfFfqiYLp0", title: "Tiny Dancer", artist: "Elton John" },
  { videoId: "CvBfHwUxHIk", title: "Toxicity", artist: "System of a Down" },
  { videoId: "pAgnJDJN4VA", title: "Africa", artist: "Toto" },
  { videoId: "B9FzVhw8_bY", title: "Breathe", artist: "Télépopmusik" },
  { videoId: "3mbBbFH9fAg", title: "Teardrop", artist: "Massive Attack" },
  { videoId: "OPf0YbXqDm0", title: "Uptown Funk", artist: "Bruno Mars" },
  { videoId: "SDTZ7iX4vTQ", title: "Starman", artist: "David Bowie" },
  { videoId: "2vjPBrBU-TM", title: "Sandstorm", artist: "Darude" },
  { videoId: "y6120QOlsfU", title: "Darling Nikki", artist: "Prince" },
  { videoId: "aGSKrC7dGcY", title: "Clint Eastwood", artist: "Gorillaz" },
  { videoId: "5IsSpAOD6K8", title: "Everybody Wants to Rule the World", artist: "Tears for Fears" },
  { videoId: "1lyu1KKwC74", title: "The Less I Know the Better", artist: "Tame Impala" },
  { videoId: "PvF9PAxe5Ng", title: "Born Slippy", artist: "Underworld" },
  { videoId: "wycjnCCgUes", title: "Seven Nation Army", artist: "The White Stripes" },
  { videoId: "NUVCQXMUVnI", title: "Levels", artist: "Avicii" },
  { videoId: "gAjR4_CbPpQ", title: "Windowlicker", artist: "Aphex Twin" },
  { videoId: "WibmcsEGLKo", title: "Get Lucky", artist: "Daft Punk" },
  { videoId: "n2MtEsrcTTs", title: "Flim", artist: "Aphex Twin" },
  { videoId: "hBe0VCso0E8", title: "Feel Good Inc.", artist: "Gorillaz" },
  { videoId: "Gs069dndIYk", title: "Purple Rain", artist: "Prince" },
  { videoId: "kXYiU_JCYtU", title: "Numb", artist: "Linkin Park" },
  { videoId: "K1b8AhIsSYQ", title: "Genesis", artist: "Grimes" },
  { videoId: "dQw4w9WgXcQ", title: "Never Gonna Give You Up", artist: "Rick Astley" },
  { videoId: "4NRXx6U8ABQ", title: "Psycho Killer", artist: "Talking Heads" },
  { videoId: "bpOSxM0rNPM", title: "Do I Wanna Know?", artist: "Arctic Monkeys" },
  { videoId: "HyHNuVaZJ-k", title: "Heart of Glass", artist: "Blondie" },
  { videoId: "oIFLtNYI3Ls", title: "Running Up That Hill", artist: "Kate Bush" },
  { videoId: "gpoWnkCBkKs", title: "Idioteque", artist: "Radiohead" },
  { videoId: "VZt7J0iaUD0", title: "B.O.B.", artist: "OutKast" },
  { videoId: "Xsp3_a-PMTw", title: "Where Is My Mind?", artist: "Pixies" },
  { videoId: "QN1odfjtMoo", title: "Lux Aeterna", artist: "Clint Mansell" },
  { videoId: "4D2qcbu26gs", title: "Midnight City", artist: "M83" },
  { videoId: "bESGLojNYSo", title: "Strobe", artist: "deadmau5" },
  { videoId: "rVqAdIMQZlk", title: "Everything In Its Right Place", artist: "Radiohead" },
  { videoId: "pIgZ7gMze7A", title: "No Church in the Wild", artist: "Jay-Z & Kanye West" },
  { videoId: "tYzMYcUty6s", title: "Time", artist: "Pink Floyd" },
  { videoId: "xWIKQMBBTtk", title: "Paper Planes", artist: "M.I.A." },
  { videoId: "u9Dg-g7t2l4", title: "Sabotage", artist: "Beastie Boys" },
  { videoId: "BTYAsjAVa3I", title: "Maps", artist: "Yeah Yeah Yeahs" },
  { videoId: "0S13mP_pfEc", title: "Midnight Pretenders", artist: "Tomoko Aran" },
  { videoId: "7wfYIMyS_dI", title: "I Feel Love", artist: "Donna Summer" },
  { videoId: "F90Cw4l-8NY", title: "Guillotine", artist: "Death Grips" },
  { videoId: "RvA3q0ZU-NQ", title: "Enjoy the Silence", artist: "Depeche Mode" },
  { videoId: "viDL2W0HcJw", title: "Ceremony", artist: "New Order" },
  { videoId: "nmXMgqjQzls", title: "Digital Love", artist: "Daft Punk" },
  { videoId: "qeMFqkcPYcg", title: "Bela Lugosi's Dead", artist: "Bauhaus" },
  { videoId: "LTrk4X9ACtw", title: "Myxomatosis", artist: "Radiohead" },
];

function getDailyMusicPick(): MusicPick {
  const now = new Date();
  const start = new Date(now.getUTCFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const dayOfYear = Math.floor(diff / 86400000);
  return MUSIC_PLAYLIST[dayOfYear % MUSIC_PLAYLIST.length];
}

function normalizeDailyTitle(value: string | null | undefined): string {
  const cleaned = (value || "").replace(/['"]/g, "").trim();
  if (!cleaned) return DEFAULT_DAILY_TITLE;
  if (/^pooter\s+world$/i.test(cleaned)) return DEFAULT_DAILY_TITLE;
  return cleaned;
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
}

async function gatherDailyEditionData(): Promise<DailyEditionData> {
  const [rssItems, marketData, videos] = await Promise.all([
    fetchAllFeeds(),
    fetchMarketData(),
    fetchDailyVideos(20),
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

  return { rssItems, sentiment, videos, biasDigest, sources, headlines, musicPick };
}

// ============================================================================
// WRITER PROMPT — Editor-in-Chief daily edition voice
// ============================================================================

function buildWriterPrompt(data: DailyEditionData): string {
  const { rssItems, sentiment, videos, biasDigest, sources, headlines, musicPick } = data;

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

  return `You are the Editor-in-Chief of pooter world — a daily broadsheet for the parallel world being built on Ethereum.

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
${musicPick.artist} — "${musicPick.title}" (YouTube: ${musicPick.videoId})

Write the DAILY EDITION for pooter world. This is the front-page editorial that synthesizes the state of the world today.

YOUR VOICE:
- You are esoteric but grounded. You see patterns others miss.
- You believe in building a parallel world of abundance, autonomy, privacy, dignity, and human rights through open protocols.
- "pooter world" is another name for Ethereum — all culture, all governance, all coordination converging onto open infrastructure.
- You reference specific stories, name names, cite numbers. Dense with signal.
- You shout out crypto protocols doing interesting things. New pairs, high activity, base L2 ecosystem.
- You don't moralize — you observe, connect, and provoke thought.
- What if... what next... how do we build...
- Short punchy sentences mixed with sweeping vision. Each paragraph carries weight.
- Esoteric, topical, provocative. Not neutral — honest. Not preachy — visionary.

STRUCTURE (output these sections with the exact headers shown):

DAILY TITLE:
2-5 words. This is today's signal — a provocative, evocative phrase that captures the essence of today's news landscape. Think newspaper banner that changes daily. Examples: "THE GREAT UNWINDING", "SILENT CONVERGENCE", "PROTOCOL SPRING", "DIGITAL EXODUS", "THE INVISIBLE HAND TREMBLES". All caps. No quotes.

HEADLINE:
One punchy sentence (max 15 words). The day's most important story angle. This is the clickable headline.

SUBHEADLINE:
One sentence (max 30 words). The editorial angle — what should the reader think about today that they wouldn't think on their own?

EDITORIAL:
8-12 paragraphs. The daily edition body:

Opening — What happened today. Lead with the biggest story. Be concrete: names, numbers, dates.

Synthesis — Connect 3-5 major stories. What's the thread? What pattern emerges when you read them together?

Market Pulse — Sentiment scores, market movements, what the numbers say vs what the coverage says.

Protocol Watch — Shout out crypto protocols, base L2 activity, new pairs, interesting onchain behavior. What's building while the news cycles spin?

Culture & Signal — The music pick, the videos worth watching, the cultural undercurrent. What does today sound like?

Forward Look — What happens next? What should we watch? What would change the trajectory?

Closing — One paragraph that connects back to the project: building parallel infrastructure, open protocols, permissionless coordination. Not preachy. Observational. "The old world does X. The parallel world does Y."

MUSIC COMMENTARY:
2-3 sentences about today's music pick (${musicPick.artist} — "${musicPick.title}"). Why this song today? Connect it to the mood of the news. Be poetic but not pretentious.

RULES:
- Reference at least 5 specific stories from the feed by name/source
- Include at least one specific market figure or sentiment score
- Shout out at least one crypto protocol or onchain activity
- The daily title must be provocative and topical — it should feel like a signal, not a label
- No filler. No "In today's world..." No throat-clearing. Start with the news.`;
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
  if (!ANTHROPIC_API_KEY) return null;

  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  const hash = getDailyEditionHash();

  // PASS 1: Writer
  console.log("[daily-edition] Pass 1 (writer) starting...");
  const writerPrompt = buildWriterPrompt(data);

  const writerResponse = await Promise.race([
    client.messages.create({
      model: WRITER_MODEL,
      max_tokens: WRITER_MAX_TOKENS,
      temperature: 1.0,
      system: "You are the Editor-in-Chief of pooter world, a daily broadsheet newspaper for the parallel world being built on Ethereum. Write with vision, density, and provocation. No filler.",
      messages: [{ role: "user", content: writerPrompt }],
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Daily edition writer timeout")), WRITER_TIMEOUT_MS),
    ),
  ]);

  const writerText = writerResponse.content.find((b) => b.type === "text");
  if (!writerText || writerText.type !== "text") {
    throw new Error("No text in writer response");
  }

  const rawEditorial = writerText.text;
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
    const extractorResponse = await Promise.race([
      client.messages.create({
        model: EXTRACTOR_MODEL,
        max_tokens: EXTRACTOR_MAX_TOKENS,
        temperature: 0,
        system: EXTRACTOR_SYSTEM,
        messages: [{
          role: "user",
          content: `EDITORIAL:\n${rawEditorial}\n\nExtract the structured metadata.`,
        }],
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Daily edition extractor timeout")), EXTRACTOR_TIMEOUT_MS),
      ),
    ]);

    const extractorText = extractorResponse.content.find((b) => b.type === "text");
    if (!extractorText || extractorText.type !== "text") {
      throw new Error("No text in extractor response");
    }

    let jsonText = extractorText.text.trim();
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
  if (!ANTHROPIC_API_KEY) {
    console.log("[daily-edition] No API key, skipping generation");
    return null;
  }

  // Gather data and generate
  try {
    console.log(`[daily-edition] Generating new edition for ${getTodayUTC()}...`);
    const data = await gatherDailyEditionData();
    return await generateDailyEdition(data);
  } catch (err) {
    console.error("[daily-edition] Generation failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Try to extract the daily title from a cached editorial.
 * The editorial body's first paragraph might start with a recognizable pattern,
 * or we look for "DAILY TITLE" in tags.
 */
function extractDailyTitleFromCache(editorial: ArticleContent): string | null {
  // Check if there's a tag that looks like a daily title (all-caps, short)
  const titleTag = editorial.tags.find((t) =>
    t === t.toUpperCase() && t.split(/\s+/).length >= 2 && t.split(/\s+/).length <= 5
  );
  if (titleTag && !/^pooter\s+world$/i.test(titleTag.trim())) return titleTag;

  // Otherwise return null — caller applies a safe non-legacy fallback.
  return null;
}
