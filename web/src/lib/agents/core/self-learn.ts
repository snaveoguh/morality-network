// ─── Agent Core — Self-Learning Pipelines ────────────────────────────────────
//
// Adapted from NounIRL's selfLearn.ts for the Pooter agent swarm.
// 4 domain-specific pipelines that fetch data from the indexer backend
// and use Claude to extract persistent knowledge facts.
//
// Pipelines:
//   1. Sentiment trends    — recurring patterns in sentiment/morality scoring
//   2. Event corpus        — news event patterns from agent events
//   3. Source quality       — RSS feed quality + bias patterns
//   4. Editorial archive    — editorial generation themes + patterns
// ─────────────────────────────────────────────────────────────────────────────

import "server-only";

import { remember, recall } from "./memory";
import { generateTextForTask } from "../../ai-provider";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SelfLearnResult {
  pipeline: string;
  factsStored: number;
  errors: string[];
}

export interface SelfLearnSummary {
  sentimentTrends: SelfLearnResult;
  eventCorpus: SelfLearnResult;
  sourceQuality: SelfLearnResult;
  editorialArchive: SelfLearnResult;
  totalFacts: number;
}

// ─── Indexer helpers (duplicated to avoid circular deps) ─────────────────────

function getIndexerUrl(): string | null {
  const url = (
    process.env.INDEXER_BACKEND_URL ??
    process.env.ARCHIVE_BACKEND_URL ??
    process.env.SCANNER_BACKEND_URL ??
    ""
  ).trim();
  return url ? url.replace(/\/$/, "") : null;
}

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const secret = process.env.INDEXER_WORKER_SECRET?.trim();
  if (secret) {
    headers.authorization = `Bearer ${secret}`;
  }
  return headers;
}

async function indexerFetch<T>(path: string, timeoutMs = 15_000): Promise<T> {
  const base = getIndexerUrl();
  if (!base) throw new Error("Indexer backend URL not configured");

  const url = new URL(path, `${base}/`);
  const response = await fetch(url.toString(), {
    cache: "no-store",
    headers: getAuthHeaders(),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Indexer ${response.status}${body ? `: ${body.slice(0, 240)}` : ""}`);
  }

  return (await response.json()) as T;
}

// ─── Shared fact storage helper ─────────────────────────────────────────────

async function storeFacts(
  pipeline: string,
  rangeLabel: string,
  facts: string[],
): Promise<number> {
  let stored = 0;
  for (let i = 0; i < facts.length; i++) {
    try {
      await remember("knowledge", `${pipeline}-${rangeLabel}-${i}`, facts[i]);
      stored++;
    } catch (err) {
      console.warn(
        `[self-learn:${pipeline}] failed to store fact ${i}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return stored;
}

async function getProgress(pipeline: string): Promise<string | null> {
  const entries = await recall("self-learn-progress", `last-${pipeline}`);
  return entries.length > 0 ? entries[0].content : null;
}

async function setProgress(pipeline: string, checkpoint: string): Promise<void> {
  await remember("self-learn-progress", `last-${pipeline}`, checkpoint);
}

// ─── Pipeline 1: Sentiment Trends ───────────────────────────────────────────

const SENTIMENT_ANALYSIS_PROMPT = `You are analyzing AI usage and sentiment scoring data from a morality-focused news aggregation platform called "Pooter World". The platform tracks global sentiment across topics like geopolitics, markets, technology, environment, etc.

Given the usage summary data below, extract the most interesting patterns and insights about:
- Which topics drive the most fear vs optimism
- Recurring patterns in how sentiment shifts
- Which AI tasks are most/least used
- Cost efficiency observations
- Any anomalies or noteworthy trends

Output a JSON array of 10-15 concise fact strings. Each fact should be a single, self-contained observation.`;

async function learnFromSentimentTrends(): Promise<SelfLearnResult> {
  const result: SelfLearnResult = { pipeline: "sentiment-trends", factsStored: 0, errors: [] };

  try {
    // Fetch AI usage summary for the last 24 hours
    const summary = await indexerFetch<Record<string, unknown>>(
      "/api/v1/ai/usage/summary?hours=24",
    );

    if (!summary) {
      result.errors.push("No AI usage summary available");
      return result;
    }

    const aiResult = await generateTextForTask({
      task: "selfLearn",
      system: SENTIMENT_ANALYSIS_PROMPT,
      user: `Here is the AI usage summary data for the last 24 hours:\n\n${JSON.stringify(summary, null, 2).slice(0, 8000)}`,
      maxTokens: 2048,
      temperature: 0.1,
      timeoutMs: 30_000,
    });

    const facts = parseFactsFromResponse(aiResult.text);
    const now = new Date().toISOString().slice(0, 10);
    result.factsStored = await storeFacts("sentiment", now, facts);
    await setProgress("sentiment-trends", now);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(msg);
    console.error(`[self-learn:sentiment-trends] error:`, msg);
  }

  return result;
}

// ─── Pipeline 2: Event Corpus ───────────────────────────────────────────────

const EVENT_CORPUS_PROMPT = `You are analyzing agent event logs from a multi-agent news intelligence swarm called "Pooter". The swarm has agents that scan for news, detect token launches, research stories, and coordinate analysis.

Given the recent agent events below, extract insights about:
- What types of events occur most frequently
- Patterns in agent communication (which agents talk to which)
- What topics trend in the event stream
- Any coordination patterns or bottlenecks
- Notable events that stand out

Output a JSON array of 10-15 concise fact strings. Each fact should be a single, self-contained observation.`;

async function learnFromEventCorpus(): Promise<SelfLearnResult> {
  const result: SelfLearnResult = { pipeline: "event-corpus", factsStored: 0, errors: [] };

  try {
    const lastCheckpoint = await getProgress("event-corpus");
    const params = new URLSearchParams({ limit: "100", sort: "desc" });
    if (lastCheckpoint) {
      params.set("since", lastCheckpoint);
    }

    const eventsData = await indexerFetch<{ messages: Array<Record<string, unknown>> }>(
      `/api/v1/agents/events?${params.toString()}`,
    );

    const events = eventsData.messages ?? [];
    if (events.length < 5) {
      result.errors.push("Not enough events to analyze");
      return result;
    }

    // Summarize events for Claude
    const eventSummary = events.slice(0, 50).map((e) => ({
      from: e.from,
      to: e.to,
      topic: e.topic,
      timestamp: e.timestamp,
      payloadPreview: JSON.stringify(e.payload ?? {}).slice(0, 200),
    }));

    const aiResult = await generateTextForTask({
      task: "selfLearn",
      system: EVENT_CORPUS_PROMPT,
      user: `Here are the last ${eventSummary.length} agent events:\n\n${JSON.stringify(eventSummary, null, 2).slice(0, 8000)}`,
      maxTokens: 2048,
      temperature: 0.1,
      timeoutMs: 30_000,
    });

    const facts = parseFactsFromResponse(aiResult.text);
    const now = String(Date.now());
    result.factsStored = await storeFacts("events", now, facts);
    await setProgress("event-corpus", now);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(msg);
    console.error(`[self-learn:event-corpus] error:`, msg);
  }

  return result;
}

// ─── Pipeline 3: Source Quality ─────────────────────────────────────────────

const SOURCE_QUALITY_PROMPT = `You are analyzing article archive data from a news aggregation platform. The platform pulls from many RSS feeds across categories like Business, Crypto, Geopolitics, Science, Environment, etc.

Given the article data below, extract insights about:
- Which sources produce the most articles
- Patterns in content quality (duplicate titles, clickbait patterns)
- Category distribution and gaps
- Temporal patterns (when articles get published)
- Any bias indicators (loaded language, one-sided framing)
- Source reliability observations

Output a JSON array of 10-15 concise fact strings. Each fact should be a single, self-contained observation.`;

async function learnFromSourceQuality(): Promise<SelfLearnResult> {
  const result: SelfLearnResult = { pipeline: "source-quality", factsStored: 0, errors: [] };

  try {
    // Fetch recent articles from the archive
    const archiveData = await indexerFetch<{ articles: Array<Record<string, unknown>> }>(
      "/api/v1/archive/articles?limit=100&sort=desc",
    );

    const articles = archiveData.articles ?? [];
    if (articles.length < 10) {
      result.errors.push("Not enough articles to analyze");
      return result;
    }

    // Summarize for Claude
    const articleSummary = articles.slice(0, 80).map((a) => ({
      title: a.title,
      source: a.source,
      category: a.category,
      pubDate: a.pubDate,
      descriptionPreview: typeof a.description === "string"
        ? (a.description as string).slice(0, 100)
        : "",
    }));

    const aiResult = await generateTextForTask({
      task: "selfLearn",
      system: SOURCE_QUALITY_PROMPT,
      user: `Here are the ${articleSummary.length} most recent archived articles:\n\n${JSON.stringify(articleSummary, null, 2).slice(0, 8000)}`,
      maxTokens: 2048,
      temperature: 0.1,
      timeoutMs: 30_000,
    });

    const facts = parseFactsFromResponse(aiResult.text);
    const now = new Date().toISOString().slice(0, 10);
    result.factsStored = await storeFacts("sources", now, facts);
    await setProgress("source-quality", now);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(msg);
    console.error(`[self-learn:source-quality] error:`, msg);
  }

  return result;
}

// ─── Pipeline 4: Editorial Archive ──────────────────────────────────────────

const EDITORIAL_ANALYSIS_PROMPT = `You are analyzing AI-generated editorial content from a morality-focused news platform. Each editorial is generated from RSS feed articles and includes claims, moral analysis, and sometimes market impact assessments.

Given the editorial data below, extract insights about:
- Common themes across editorials
- Quality patterns (which types of source articles produce better editorials)
- Claim types and their frequency
- Market impact patterns (what drives impact predictions)
- Content gaps or areas that could be improved
- How generation quality varies (template-fallback vs AI-generated)

Output a JSON array of 10-15 concise fact strings. Each fact should be a single, self-contained observation.`;

async function learnFromEditorialArchive(): Promise<SelfLearnResult> {
  const result: SelfLearnResult = { pipeline: "editorial-archive", factsStored: 0, errors: [] };

  try {
    const editorialData = await indexerFetch<{ editorials: Array<Record<string, unknown>> }>(
      "/api/v1/archive/editorials?limit=50&sort=desc",
    );

    const editorials = editorialData.editorials ?? [];
    if (editorials.length < 5) {
      result.errors.push("Not enough editorials to analyze");
      return result;
    }

    // Summarize for Claude (exclude full payload, keep key fields)
    const editorialSummary = editorials.slice(0, 30).map((e) => ({
      generatedAt: e.generatedAt,
      generatedBy: e.generatedBy,
      claim: e.claim,
      dailyTitle: e.dailyTitle,
      hasMarketImpact: e.hasMarketImpact,
      version: e.version,
    }));

    const aiResult = await generateTextForTask({
      task: "selfLearn",
      system: EDITORIAL_ANALYSIS_PROMPT,
      user: `Here are the ${editorialSummary.length} most recent editorials:\n\n${JSON.stringify(editorialSummary, null, 2).slice(0, 8000)}`,
      maxTokens: 2048,
      temperature: 0.1,
      timeoutMs: 30_000,
    });

    const facts = parseFactsFromResponse(aiResult.text);
    const now = new Date().toISOString().slice(0, 10);
    result.factsStored = await storeFacts("editorials", now, facts);
    await setProgress("editorial-archive", now);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(msg);
    console.error(`[self-learn:editorial-archive] error:`, msg);
  }

  return result;
}

// ─── JSON response parser ───────────────────────────────────────────────────

function parseFactsFromResponse(text: string): string[] {
  // Strip markdown code fences if present
  let cleaned = text;
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1].trim();
  }

  const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item): item is string => typeof item === "string" && item.length > 10)
          .slice(0, 20);
      }
    } catch {
      // Fall through to numbered list parsing
    }
  }

  // Fallback: parse numbered list format
  const numberedLines = cleaned
    .split("\n")
    .map((line) => line.replace(/^\s*\d+[\.\)]\s*/, "").trim())
    .filter((line) => line.length > 10 && !line.startsWith("Here ") && !line.startsWith("The following"));

  if (numberedLines.length >= 3) {
    return numberedLines.slice(0, 20);
  }

  console.warn(`[self-learn] no parseable format. Preview: ${text.slice(0, 200)}`);
  return [];
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Run all 4 self-learning pipelines.
 * Each pipeline runs independently; errors in one don't block others.
 */
export async function runSelfLearn(): Promise<SelfLearnSummary> {
  console.log("[self-learn] starting all pipelines...");

  const [sentimentTrends, eventCorpus, sourceQuality, editorialArchive] =
    await Promise.all([
      learnFromSentimentTrends().catch((err) => ({
        pipeline: "sentiment-trends",
        factsStored: 0,
        errors: [err instanceof Error ? err.message : String(err)],
      })),
      learnFromEventCorpus().catch((err) => ({
        pipeline: "event-corpus",
        factsStored: 0,
        errors: [err instanceof Error ? err.message : String(err)],
      })),
      learnFromSourceQuality().catch((err) => ({
        pipeline: "source-quality",
        factsStored: 0,
        errors: [err instanceof Error ? err.message : String(err)],
      })),
      learnFromEditorialArchive().catch((err) => ({
        pipeline: "editorial-archive",
        factsStored: 0,
        errors: [err instanceof Error ? err.message : String(err)],
      })),
    ]);

  const totalFacts =
    sentimentTrends.factsStored +
    eventCorpus.factsStored +
    sourceQuality.factsStored +
    editorialArchive.factsStored;

  console.log(`[self-learn] complete: ${totalFacts} total facts stored`);

  return {
    sentimentTrends,
    eventCorpus,
    sourceQuality,
    editorialArchive,
    totalFacts,
  };
}

/**
 * Run a single pipeline by name.
 */
export async function runPipeline(
  pipeline: "sentiment-trends" | "event-corpus" | "source-quality" | "editorial-archive",
): Promise<SelfLearnResult> {
  switch (pipeline) {
    case "sentiment-trends":
      return learnFromSentimentTrends();
    case "event-corpus":
      return learnFromEventCorpus();
    case "source-quality":
      return learnFromSourceQuality();
    case "editorial-archive":
      return learnFromEditorialArchive();
    default:
      return { pipeline, factsStored: 0, errors: [`Unknown pipeline: ${pipeline}`] };
  }
}
