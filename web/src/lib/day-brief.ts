import "server-only";

import { generateTextForTask } from "./ai-provider";
import { hasAIProviderForTask } from "./ai-models";
import { isFrontStory } from "./front-filter";
import { politicsReach } from "./politics-slider";
import { fetchAllFeeds, type FeedItem } from "./rss";
import { loadTtlValue, type TtlCacheEntry } from "./ttl-cache";
import { processGlobal } from "./memory";
import {
  BRIEF_TOPICS,
  type BriefTopic,
  type ChatTurn,
  type DayBrief,
  type BriefSource,
  type ChatAnswer,
} from "./day-brief-types";

// ============================================================================
// YOUR DAY — the AI rundown at the top of the home page.
//
// Built only from the last 24 hours of the feed. The model is given numbered
// headlines and must cite them; a point that cites nothing real is dropped,
// so the brief cannot carry a claim we did not report. Without an AI
// provider the brief is the top stories themselves, plainly listed.
//
// One brief per topic, regenerated hourly in the background (ttl-cache is
// stale-while-revalidate, instrumentation.ts keeps "all" warm).
// ============================================================================

export { BRIEF_TOPICS, type BriefTopic };

const WINDOW_MS = 24 * 60 * 60 * 1000;
const BRIEF_TTL_MS = 60 * 60 * 1000;
const MAX_STORIES = 40;
const MAX_POINTS = 5;

function parseTime(pubDate: string): number {
  const t = Date.parse(pubDate);
  return Number.isFinite(t) ? t : 0;
}

/** How many outlets carried the story; the dedupe step records this. */
function reach(item: FeedItem): number {
  return Math.max(1, item.sourceNames?.length ?? 0, item.rawArticleCount ?? 0);
}

function matchesTopic(item: FeedItem, topic: BriefTopic): boolean {
  const cat = item.category.toLowerCase();
  switch (topic) {
    case "all":
      return isFrontStory({ title: item.title, category: item.category });
    case "uk": {
      // Same classifier as the home page politics slider.
      const r = politicsReach(item);
      return r === "uk-actor" || r === "uk";
    }
    case "world":
      return (cat === "world" || cat === "politics") && isFrontStory({ title: item.title, category: item.category });
    case "business":
      return cat === "business" || cat === "crypto";
    case "tech":
      return cat === "tech" || cat === "science";
    case "environment":
      return cat === "environment";
  }
}

/** The stories a brief is built from: last 24h, topic, most-covered first. */
export function selectBriefStories(items: FeedItem[], topic: BriefTopic, now = Date.now()): FeedItem[] {
  return items
    .filter((item) => !item.datedAtFetch)
    .filter((item) => {
      const t = parseTime(item.pubDate);
      return t > 0 && now - t <= WINDOW_MS && t <= now + 5 * 60_000;
    })
    .filter((item) => matchesTopic(item, topic))
    .sort((a, b) => reach(b) - reach(a) || parseTime(b.pubDate) - parseTime(a.pubDate))
    .slice(0, MAX_STORIES);
}

function toSource(item: FeedItem): BriefSource {
  return { title: item.title, source: item.source, link: item.link, pubDate: item.pubDate };
}

function numberedHeadlines(stories: FeedItem[]): string {
  return stories
    .map((s, i) => {
      const desc = s.description?.replace(/\s+/g, " ").trim().slice(0, 220);
      const outlets = reach(s) > 1 ? ` [${reach(s)} outlets]` : "";
      return `${i + 1}. ${s.title} (${s.source})${outlets}${desc ? ` — ${desc}` : ""}`;
    })
    .join("\n");
}

/** Pull the first JSON object out of a model reply. */
function parseJsonObject(text: string): unknown {
  let json = text.trim();
  if (json.startsWith("```")) json = json.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  const start = json.indexOf("{");
  const end = json.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object in reply");
  return JSON.parse(json.slice(start, end + 1));
}

/** Keep only citations that point at a story we gave the model. */
function validCitations(raw: unknown, stories: FeedItem[]): BriefSource[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<number>();
  const out: BriefSource[] = [];
  for (const n of raw) {
    const i = Number(n) - 1;
    if (!Number.isInteger(i) || i < 0 || i >= stories.length || seen.has(i)) continue;
    seen.add(i);
    out.push(toSource(stories[i]));
  }
  return out.slice(0, 3);
}

function clean(text: unknown, max: number): string {
  return typeof text === "string" ? text.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function headlinesBrief(topic: BriefTopic, stories: FeedItem[], now: number): DayBrief {
  return {
    topic,
    generatedAt: new Date(now).toISOString(),
    storyCount: stories.length,
    mode: "headlines",
    summary: null,
    points: stories.slice(0, MAX_POINTS).map((s) => ({ text: s.title, sources: [toSource(s)] })),
    suggestions: [],
    chatAvailable: hasAIProviderForTask("briefChat"),
  };
}

const BRIEF_SYSTEM = `You write the daily rundown for pooter world, an independent public record of politics and the news.
You are given numbered headlines from the last 24 hours. Use ONLY these headlines; never add facts, numbers, names or outcomes that are not in them.
Write plainly and calmly for a general reader. No hype, no opinions, no predictions, no financial advice. British spelling.
Reply with ONLY a JSON object:
{"summary": "<one sentence on what defined the day>",
 "points": [{"text": "<one or two sentences explaining a development and why it matters>", "cite": [<headline numbers>]}],
 "suggestions": ["<a short question a reader might ask about today's news>", ...]}
Give ${MAX_POINTS} points, most significant first, each citing at least one headline number. Merge headlines about the same event into one point. Give 3 suggestions under 60 characters each.`;

async function generateBrief(topic: BriefTopic): Promise<DayBrief> {
  const now = Date.now();
  const stories = selectBriefStories(await fetchAllFeeds(), topic, now);
  if (stories.length === 0 || !hasAIProviderForTask("dayBrief")) {
    return headlinesBrief(topic, stories, now);
  }

  try {
    const label = BRIEF_TOPICS.find((t) => t.id === topic)?.label ?? "All";
    const result = await generateTextForTask({
      task: "dayBrief",
      system: BRIEF_SYSTEM,
      user: `Topic: ${label}\nDate: ${new Date(now).toUTCString()}\n\nHeadlines:\n${numberedHeadlines(stories)}`,
      maxTokens: 900,
      temperature: 0.2,
      timeoutMs: 45_000,
    });
    const parsed = parseJsonObject(result.text) as {
      summary?: unknown;
      points?: Array<{ text?: unknown; cite?: unknown }>;
      suggestions?: unknown;
    };
    const points = (Array.isArray(parsed.points) ? parsed.points : [])
      .map((p) => ({ text: clean(p?.text, 400), sources: validCitations(p?.cite, stories) }))
      .filter((p) => p.text && p.sources.length > 0)
      .slice(0, MAX_POINTS);
    if (points.length < 2) return headlinesBrief(topic, stories, now);

    return {
      topic,
      generatedAt: new Date(now).toISOString(),
      storyCount: stories.length,
      mode: "ai",
      summary: clean(parsed.summary, 240) || null,
      points,
      suggestions: (Array.isArray(parsed.suggestions) ? parsed.suggestions : [])
        .map((s) => clean(s, 80))
        .filter(Boolean)
        .slice(0, 3),
      chatAvailable: hasAIProviderForTask("briefChat"),
    };
  } catch (error) {
    console.warn(`[day-brief] ${topic} generation failed:`, error);
    return headlinesBrief(topic, stories, now);
  }
}

// Shared by every bundled copy of this module and the instrumentation.ts
// warmer, so the warmed brief is the one pages read (lib/memory.ts).
const briefCache = processGlobal(
  "dayBrief.cache",
  () => new Map<string, TtlCacheEntry<DayBrief>>(),
);

export function isBriefTopic(value: unknown): value is BriefTopic {
  return BRIEF_TOPICS.some((t) => t.id === value);
}

export function getDayBrief(topic: BriefTopic = "all"): Promise<DayBrief> {
  return loadTtlValue(briefCache, topic, BRIEF_TTL_MS, () => generateBrief(topic));
}

// ── Chat ────────────────────────────────────────────────────────────────────

const CHAT_SYSTEM = `You are the pooter world news assistant. Answer questions about the last 24 hours of news using ONLY the numbered headlines provided.
If the headlines do not cover the question, say so plainly and suggest what the reader could look up; never guess or use outside knowledge for facts.
Be brief (under 120 words), plain and neutral. No opinions on parties or candidates, no voting advice, no financial advice. British spelling.
Reply with ONLY a JSON object: {"answer": "<your answer>", "cite": [<headline numbers you relied on>]}`;

export const CHAT_MAX_QUESTION = 400;

export async function answerBriefQuestion(
  question: string,
  topic: BriefTopic,
  history: ChatTurn[],
): Promise<ChatAnswer> {
  if (!hasAIProviderForTask("briefChat")) {
    return { answer: "The assistant is offline right now. The rundown above is today's news.", sources: [], available: false };
  }
  // Questions can be about anything in the day, so use the wide set.
  const items = await fetchAllFeeds();
  const stories = selectBriefStories(items, topic === "all" ? "all" : topic);
  const pool = stories.length >= 10 ? stories : selectBriefStories(items, "all");

  const transcript = history
    .slice(-4)
    .map((t) => `${t.role === "user" ? "Reader" : "Assistant"}: ${clean(t.text, 500)}`)
    .join("\n");

  const result = await generateTextForTask({
    task: "briefChat",
    system: CHAT_SYSTEM,
    user: `Date: ${new Date().toUTCString()}\n\nHeadlines:\n${numberedHeadlines(pool)}\n\n${
      transcript ? `Conversation so far:\n${transcript}\n\n` : ""
    }Reader's question: ${question}`,
    // 1200, not 400: the free hub runs a reasoning model (gpt-oss-120b on
    // Groq) whose hidden reasoning spends the same budget, so 400 left it
    // returning "" or a cut-off '{"' on a full day of headlines.
    maxTokens: 1200,
    temperature: 0.2,
    // Every configured provider gets a turn (no maxAttempts cap): with
    // Venice capped at $0 and a dead OpenAI key, a cap of 2 stopped the chain
    // before Anthropic, so every hub miss became an error. 20s each keeps a
    // hung provider from eating the route's 45s.
    timeoutMs: 20_000,
  });

  return chatAnswerFromReply(result.text, pool);
}

/** Turn a model reply into an answer. Exported for tests. */
export function chatAnswerFromReply(text: string, pool: FeedItem[]): ChatAnswer {
  try {
    const parsed = parseJsonObject(text) as { answer?: unknown; cite?: unknown };
    const answer = clean(parsed.answer, 1200);
    if (answer) return { answer, sources: validCitations(parsed.cite, pool), available: true };
  } catch {
    // Not a whole JSON object: salvage below.
  }
  // A reply cut off mid-JSON still carries the start of the answer.
  const partial = /"answer"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(text)?.[1];
  if (partial) {
    let answer = partial;
    try {
      answer = JSON.parse(`"${partial.replace(/\\$/, "")}"`) as string;
    } catch {
      // keep the raw escapes
    }
    answer = clean(answer, 1200);
    if (answer.length >= 20) {
      if (!/[.!?"')\u201d]$/.test(answer)) answer += "\u2026";
      return { answer, sources: [], available: true };
    }
  }
  // Never show JSON debris such as '{"' to a reader: fail so the route says
  // "try again" instead.
  const plain = clean(text, 1200);
  if (!plain || plain.startsWith("{") || plain.startsWith("```")) {
    throw new Error("model reply was not a usable answer");
  }
  // Model ignored the format: show its text, without sources.
  return { answer: plain, sources: [], available: true };
}
