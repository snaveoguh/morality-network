// ─── Agent Core — Moral Compass Self-Learning Pipeline ────────────────────────
//
// Pipeline 5: Autonomously crawls ethics/philosophy sources from the open web,
// extracts structured moral principles, and builds an evolving moral framework
// that informs sentiment scoring, editorial writing, and agent decisions.
//
// Architecture:
//   1. Seed sources (SEP, IEP, ethics journals) + discovered sources
//   2. Extract structured MoralPrinciple objects (not flat facts)
//   3. Reinforce principles seen across multiple sources
//   4. Discover new sources via LLM analysis of crawled content
//   5. Synthesize a coherent ~2000-char moral framework every 3 days
//   6. Decay unreinforced principles over time
//   7. Runs daily at 3 AM UTC via the scheduled crawl job
// ─────────────────────────────────────────────────────────────────────────────

import "server-only";

import { remember, recall, forget, countByScope } from "./memory";
import { generateTextForTask } from "../../ai-provider";

// ─── Types ──────────────────────────────────────────────────────────────────

export type MoralCategory =
  | "deontology"
  | "consequentialism"
  | "virtue-ethics"
  | "care-ethics"
  | "justice-theory"
  | "rights-theory"
  | "social-contract"
  | "natural-law"
  | "applied-ethics"
  | "meta-ethics"
  | "bioethics"
  | "environmental-ethics"
  | "information-ethics"
  | "war-ethics"
  | "cultural-ethics"
  | "case-study";

export interface MoralPrinciple {
  id: string;
  statement: string;
  category: MoralCategory;
  tradition: string;
  relevantAxes: string[];
  weight: number;
  confidence: number;
  sourceCount: number;
  sources: string[];
  extractedAt: string;
  lastReinforced: string;
  applicationGuidance: string;
}

export interface CrawlSource {
  url: string;
  category: MoralCategory;
  tradition: string;
  discovered?: boolean;
  discoveredFrom?: string;
}

export interface MoralCompassResult {
  sourcesCrawled: number;
  principlesExtracted: number;
  principlesReinforced: number;
  principlesPruned: number;
  newSourcesDiscovered: number;
  synthesisUpdated: boolean;
  errors: string[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

const SCOPE_PRINCIPLES = "moral-compass";
const SCOPE_META = "moral-compass-meta";
const MAX_PRINCIPLES = 150;
const SYNTHESIS_MAX_CHARS = 2000;
const DECAY_DAYS = 30;
const DECAY_FACTOR = 0.9;
const PRUNE_THRESHOLD = 0.1;
const SOURCES_PER_RUN = 3;
const SYNTHESIS_INTERVAL_DAYS = 3;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_CONTENT_CHARS = 50_000;
const INTER_SOURCE_DELAY_MS = 10_000;

const VALID_CATEGORIES = new Set<string>([
  "deontology", "consequentialism", "virtue-ethics", "care-ethics",
  "justice-theory", "rights-theory", "social-contract", "natural-law",
  "applied-ethics", "meta-ethics", "bioethics", "environmental-ethics",
  "information-ethics", "war-ethics", "cultural-ethics", "case-study",
]);

const VALID_AXES = new Set(["harm", "agency", "truth", "power"]);

// ─── Seed Sources ───────────────────────────────────────────────────────────

const SEED_SOURCES: CrawlSource[] = [
  // Stanford Encyclopedia of Philosophy — core ethical theories
  { url: "https://plato.stanford.edu/entries/ethics-deontological/", category: "deontology", tradition: "survey" },
  { url: "https://plato.stanford.edu/entries/consequentialism/", category: "consequentialism", tradition: "survey" },
  { url: "https://plato.stanford.edu/entries/ethics-virtue/", category: "virtue-ethics", tradition: "survey" },
  { url: "https://plato.stanford.edu/entries/justice-distributive/", category: "justice-theory", tradition: "survey" },
  { url: "https://plato.stanford.edu/entries/rights/", category: "rights-theory", tradition: "survey" },
  { url: "https://plato.stanford.edu/entries/contractarianism/", category: "social-contract", tradition: "survey" },
  { url: "https://plato.stanford.edu/entries/natural-law-ethics/", category: "natural-law", tradition: "survey" },
  { url: "https://plato.stanford.edu/entries/feminism-ethics/", category: "care-ethics", tradition: "feminist" },
  { url: "https://plato.stanford.edu/entries/ethics-ai/", category: "information-ethics", tradition: "applied" },
  { url: "https://plato.stanford.edu/entries/environmental-ethics/", category: "environmental-ethics", tradition: "applied" },

  // Cross-cultural traditions
  { url: "https://plato.stanford.edu/entries/ethics-chinese/", category: "virtue-ethics", tradition: "Confucian" },
  { url: "https://plato.stanford.edu/entries/ethics-indian-buddhism/", category: "virtue-ethics", tradition: "Buddhist" },
  { url: "https://plato.stanford.edu/entries/arabic-islamic-ethics/", category: "natural-law", tradition: "Islamic" },

  // Applied ethics
  { url: "https://plato.stanford.edu/entries/ethics-biomedical/", category: "bioethics", tradition: "applied" },
  { url: "https://plato.stanford.edu/entries/ethics-business/", category: "applied-ethics", tradition: "applied" },
  { url: "https://plato.stanford.edu/entries/information-technology/", category: "information-ethics", tradition: "applied" },

  // Internet Encyclopedia of Philosophy
  { url: "https://iep.utm.edu/ethics/", category: "meta-ethics", tradition: "survey" },
  { url: "https://iep.utm.edu/util-a-r/", category: "consequentialism", tradition: "Utilitarian" },
  { url: "https://iep.utm.edu/care-eth/", category: "care-ethics", tradition: "survey" },

  // Case studies
  { url: "https://ethicsunwrapped.utexas.edu/glossary", category: "case-study", tradition: "applied" },

  // War, conflict & peace ethics
  { url: "https://plato.stanford.edu/entries/war/", category: "war-ethics", tradition: "just war" },
  { url: "https://plato.stanford.edu/entries/terrorism-definition/", category: "war-ethics", tradition: "applied" },
  { url: "https://plato.stanford.edu/entries/pacifism/", category: "war-ethics", tradition: "pacifist" },
  { url: "https://iep.utm.edu/justwar/", category: "war-ethics", tradition: "just war" },
  { url: "https://iep.utm.edu/nuclear-deterrence-ethics/", category: "war-ethics", tradition: "applied" },
  { url: "https://www.icrc.org/en/doc/resources/documents/misc/57jnhy.htm", category: "war-ethics", tradition: "Geneva Conventions" },
  { url: "https://casebook.icrc.org/a_to_z/glossary/international-humanitarian-law", category: "war-ethics", tradition: "IHL" },
  { url: "https://plato.stanford.edu/entries/colonialism/", category: "war-ethics", tradition: "postcolonial" },
  { url: "https://plato.stanford.edu/entries/genocide/", category: "war-ethics", tradition: "applied" },
  { url: "https://plato.stanford.edu/entries/civil-disobedience/", category: "applied-ethics", tradition: "political" },

  // Music, culture & moral expression
  { url: "https://plato.stanford.edu/entries/music/", category: "cultural-ethics", tradition: "aesthetics" },
  { url: "https://plato.stanford.edu/entries/aesthetic-judgment/", category: "cultural-ethics", tradition: "Kantian" },
  { url: "https://plato.stanford.edu/entries/adorno/", category: "cultural-ethics", tradition: "Frankfurt School" },
  { url: "https://plato.stanford.edu/entries/censorship/", category: "cultural-ethics", tradition: "applied" },
  { url: "https://plato.stanford.edu/entries/art-definition/", category: "cultural-ethics", tradition: "aesthetics" },
  { url: "https://iep.utm.edu/aestheti/", category: "cultural-ethics", tradition: "survey" },
  { url: "https://en.wikipedia.org/wiki/Protest_song", category: "cultural-ethics", tradition: "music history" },
  { url: "https://en.wikipedia.org/wiki/Music_and_politics", category: "cultural-ethics", tradition: "music history" },
  { url: "https://en.wikipedia.org/wiki/Censorship_of_music", category: "cultural-ethics", tradition: "music history" },
  { url: "https://en.wikipedia.org/wiki/Music_of_the_civil_rights_movement", category: "cultural-ethics", tradition: "music history" },
];

// ─── HTML stripping (same pattern as knowledge.ts) ──────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<(script|style|svg|noscript)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchAndExtract(url: string): Promise<string> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      "user-agent": "PooterBot/1.0 (moral-compass)",
      accept: "text/html, text/plain, application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${url}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  const raw = await response.text();

  if (contentType.includes("application/json")) {
    try {
      return JSON.stringify(JSON.parse(raw), null, 2).slice(0, MAX_CONTENT_CHARS);
    } catch {
      return raw.slice(0, MAX_CONTENT_CHARS);
    }
  }

  if (contentType.includes("text/plain")) {
    return raw.slice(0, MAX_CONTENT_CHARS);
  }

  return stripHtml(raw).slice(0, MAX_CONTENT_CHARS);
}

// ─── LLM Prompts ────────────────────────────────────────────────────────────

const PRINCIPLE_EXTRACTION_PROMPT = `You are a moral philosophy extraction engine for a news morality platform called Pooter World. The platform evaluates news on 4 moral axes: Harm, Agency, Truth Clarity, Power Asymmetry.

Given text from an ethics/philosophy source, extract structured moral principles.

For each principle, provide:
- statement: A clear, concise articulation (1-2 sentences)
- category: One of: deontology, consequentialism, virtue-ethics, care-ethics, justice-theory, rights-theory, social-contract, natural-law, applied-ethics, meta-ethics, bioethics, environmental-ethics, information-ethics, war-ethics, cultural-ethics, case-study
- tradition: The philosophical tradition (e.g., "Kantian", "Utilitarian", "Aristotelian", "Buddhist", "Rawlsian", "Confucian")
- relevantAxes: Which morality axes this maps to: "harm", "agency", "truth", "power" (can be multiple)
- applicationGuidance: One sentence on when/how to apply this principle to news events

Extract 5-10 principles. Prioritize principles that are:
1. Actionable for evaluating real-world news events
2. Distinct from each other (not restatements)
3. Grounded in a specific philosophical tradition

Respond with ONLY a JSON array. No markdown fences, no explanation.
Example: [{"statement":"Actions are morally right if they maximize overall well-being and minimize suffering across all affected parties.","category":"consequentialism","tradition":"Utilitarian","relevantAxes":["harm","agency"],"applicationGuidance":"Apply when evaluating policies or events by their aggregate outcomes on human welfare."}]`;

const SOURCE_DISCOVERY_PROMPT = `You just analyzed ethics/philosophy content from these URLs:
{urls}

Based on the content, suggest 3-5 NEW publicly accessible URLs of ethics/philosophy resources that would deepen a moral compass. Requirements:
1. Real, existing URLs from academic encyclopedias, ethics journals, philosophy departments, or established ethics organizations
2. About moral/ethical theory, applied ethics, or case studies in ethics
3. NOT already in the list above
4. Prefer sources that cover traditions or applied domains not yet represented

For each, provide: url, category (from: deontology, consequentialism, virtue-ethics, care-ethics, justice-theory, rights-theory, social-contract, natural-law, applied-ethics, meta-ethics, bioethics, environmental-ethics, information-ethics, case-study), tradition.

Respond with ONLY a JSON array. No markdown fences, no explanation.
Example: [{"url":"https://plato.stanford.edu/entries/moral-luck/","category":"meta-ethics","tradition":"survey"}]`;

const SYNTHESIS_PROMPT = `You are synthesizing a moral compass for Pooter World, an AI news analysis platform that evaluates events on 4 axes: Harm, Agency, Truth Clarity, Power Asymmetry.

Below are moral principles extracted from {count} philosophy/ethics sources, sorted by confidence (principles confirmed by multiple sources rank higher).

Create a SYNTHESIS: a coherent, actionable moral framework (max ${SYNTHESIS_MAX_CHARS} characters) that:

1. Identifies the 3-5 most robust cross-tradition moral insights
2. Maps each insight to the platform's 4 moral axes (Harm, Agency, Truth, Power)
3. Provides concrete guidance for evaluating news events morally
4. Acknowledges genuine tensions between traditions (don't paper over disagreements)
5. Is written as directive guidance, not academic summary

The synthesis will be injected into AI prompts for news sentiment scoring and editorial writing. It should make the AI a BETTER moral reasoner, not just a more knowledgeable one.

PRINCIPLES:
{principles}

Respond with ONLY the synthesis text. No JSON, no headers, no markdown fences. Max ${SYNTHESIS_MAX_CHARS} characters.`;

// ─── Principle ID generation ────────────────────────────────────────────────

function principleId(category: string, tradition: string, statement: string): string {
  const normalized = `${category}|${tradition}|${statement.slice(0, 60).toLowerCase().replace(/[^a-z0-9 ]/g, "")}`;
  // Simple hash — deterministic, collision-resistant enough for 150 items
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) - hash + normalized.charCodeAt(i)) | 0;
  }
  return `p-${Math.abs(hash).toString(36)}`;
}

// ─── Source queue management ────────────────────────────────────────────────

async function getCrawledSources(): Promise<Set<string>> {
  const entries = await recall(SCOPE_META, "crawled-sources");
  if (entries.length === 0) return new Set();
  try {
    const urls = JSON.parse(entries[0].content) as string[];
    return new Set(urls);
  } catch {
    return new Set();
  }
}

async function saveCrawledSources(crawled: Set<string>): Promise<void> {
  await remember(SCOPE_META, "crawled-sources", JSON.stringify([...crawled]));
}

async function getDiscoveredSources(): Promise<CrawlSource[]> {
  const entries = await recall(SCOPE_META, "discovered-sources");
  if (entries.length === 0) return [];
  try {
    return JSON.parse(entries[0].content) as CrawlSource[];
  } catch {
    return [];
  }
}

async function saveDiscoveredSources(sources: CrawlSource[]): Promise<void> {
  // Keep max 50 discovered sources
  await remember(SCOPE_META, "discovered-sources", JSON.stringify(sources.slice(0, 50)));
}

async function getSourceQueue(): Promise<CrawlSource[]> {
  const crawled = await getCrawledSources();
  const queue: CrawlSource[] = [];

  // Seed sources first (uncrawled)
  for (const source of SEED_SOURCES) {
    if (!crawled.has(source.url)) {
      queue.push(source);
    }
  }

  // Then discovered sources (uncrawled)
  const discovered = await getDiscoveredSources();
  for (const source of discovered) {
    if (!crawled.has(source.url)) {
      queue.push(source);
    }
  }

  return queue;
}

// ─── Principle storage ──────────────────────────────────────────────────────

async function loadAllPrinciples(): Promise<MoralPrinciple[]> {
  const entries = await recall(SCOPE_PRINCIPLES);
  const principles: MoralPrinciple[] = [];

  for (const entry of entries) {
    try {
      principles.push(JSON.parse(entry.content) as MoralPrinciple);
    } catch {
      // Skip malformed entries
    }
  }

  return principles;
}

async function storePrinciple(principle: MoralPrinciple): Promise<void> {
  await remember(SCOPE_PRINCIPLES, principle.id, JSON.stringify(principle));
}

// ─── Core pipeline functions ────────────────────────────────────────────────

function validateCategory(cat: string): MoralCategory | null {
  return VALID_CATEGORIES.has(cat) ? (cat as MoralCategory) : null;
}

function validateAxes(axes: unknown): string[] {
  if (!Array.isArray(axes)) return ["harm"];
  return axes.filter((a): a is string => typeof a === "string" && VALID_AXES.has(a));
}

async function extractPrinciplesFromUrl(
  source: CrawlSource,
): Promise<{ principles: MoralPrinciple[]; error?: string }> {
  try {
    const text = await fetchAndExtract(source.url);
    if (text.length < 100) {
      return { principles: [], error: `Content too short (${text.length} chars)` };
    }

    const result = await generateTextForTask({
      task: "moralCompass",
      system: PRINCIPLE_EXTRACTION_PROMPT,
      user: `Extract moral principles from this ${source.tradition} ${source.category} source:\n\n${text.slice(0, 20_000)}`,
      maxTokens: 2048,
      temperature: 0.1,
      timeoutMs: 30_000,
    });

    // Parse response
    let cleaned = result.text;
    const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) cleaned = codeBlockMatch[1].trim();
    // Strip <think> tags (reasoning models)
    cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return { principles: [], error: `No JSON array in response: ${cleaned.slice(0, 200)}` };
    }

    const parsed = JSON.parse(jsonMatch[0]) as Array<Record<string, unknown>>;
    if (!Array.isArray(parsed)) {
      return { principles: [], error: "Response is not an array" };
    }

    const now = new Date().toISOString();
    const principles: MoralPrinciple[] = [];

    for (const raw of parsed.slice(0, 10)) {
      const statement = typeof raw.statement === "string" ? raw.statement.trim() : "";
      if (statement.length < 20) continue;

      const category = validateCategory(typeof raw.category === "string" ? raw.category : "");
      if (!category) continue;

      const tradition = typeof raw.tradition === "string" ? raw.tradition.trim() : source.tradition;
      const relevantAxes = validateAxes(raw.relevantAxes);
      if (relevantAxes.length === 0) continue;

      const guidance = typeof raw.applicationGuidance === "string"
        ? raw.applicationGuidance.trim()
        : "";

      principles.push({
        id: principleId(category, tradition, statement),
        statement,
        category,
        tradition,
        relevantAxes,
        weight: 0.5,
        confidence: 0.3,
        sourceCount: 1,
        sources: [source.url],
        extractedAt: now,
        lastReinforced: now,
        applicationGuidance: guidance,
      });
    }

    return { principles };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { principles: [], error: msg };
  }
}

async function reinforceOrStore(
  incoming: MoralPrinciple,
  existing: MoralPrinciple[],
): Promise<"new" | "reinforced"> {
  // Check for semantic match: same category + tradition + similar statement prefix
  const incomingNorm = incoming.statement.slice(0, 60).toLowerCase().replace(/[^a-z0-9 ]/g, "");

  for (const ex of existing) {
    if (ex.category !== incoming.category) continue;

    // Check statement similarity: either same id or overlapping normalized prefix
    const exNorm = ex.statement.slice(0, 60).toLowerCase().replace(/[^a-z0-9 ]/g, "");
    if (ex.id === incoming.id || similarity(incomingNorm, exNorm) > 0.6) {
      // Reinforce existing principle
      ex.sourceCount = Math.min(ex.sourceCount + 1, 20);
      ex.confidence = Math.min(0.3 + ex.sourceCount * 0.12, 1.0);
      ex.weight = Math.min(ex.weight + 0.1, 1.0);
      ex.lastReinforced = new Date().toISOString();

      // Merge source URL (keep max 5)
      if (!ex.sources.includes(incoming.sources[0]) && ex.sources.length < 5) {
        ex.sources.push(incoming.sources[0]);
      }

      // Merge axes
      for (const axis of incoming.relevantAxes) {
        if (!ex.relevantAxes.includes(axis)) {
          ex.relevantAxes.push(axis);
        }
      }

      await storePrinciple(ex);
      return "reinforced";
    }
  }

  // No match — store as new
  await storePrinciple(incoming);
  existing.push(incoming);
  return "new";
}

/** Simple word-overlap similarity (Jaccard on word bigrams). */
function similarity(a: string, b: string): number {
  const bigramsA = new Set<string>();
  const bigramsB = new Set<string>();
  const wordsA = a.split(/\s+/);
  const wordsB = b.split(/\s+/);

  for (let i = 0; i < wordsA.length - 1; i++) bigramsA.add(`${wordsA[i]} ${wordsA[i + 1]}`);
  for (let i = 0; i < wordsB.length - 1; i++) bigramsB.add(`${wordsB[i]} ${wordsB[i + 1]}`);

  if (bigramsA.size === 0 || bigramsB.size === 0) return 0;

  let intersection = 0;
  for (const bg of bigramsA) {
    if (bigramsB.has(bg)) intersection++;
  }

  return intersection / (bigramsA.size + bigramsB.size - intersection);
}

async function discoverNewSources(
  recentUrls: string[],
): Promise<CrawlSource[]> {
  if (recentUrls.length === 0) return [];

  try {
    const result = await generateTextForTask({
      task: "moralCompass",
      system: SOURCE_DISCOVERY_PROMPT.replace("{urls}", recentUrls.join("\n")),
      user: "Suggest 3-5 new ethics/philosophy source URLs based on the content you analyzed.",
      maxTokens: 1024,
      temperature: 0.3,
      timeoutMs: 20_000,
    });

    let cleaned = result.text;
    const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) cleaned = codeBlockMatch[1].trim();
    cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]) as Array<Record<string, unknown>>;
    if (!Array.isArray(parsed)) return [];

    const crawled = await getCrawledSources();
    const allKnownUrls = new Set([
      ...SEED_SOURCES.map((s) => s.url),
      ...crawled,
      ...recentUrls,
    ]);

    const newSources: CrawlSource[] = [];
    for (const raw of parsed.slice(0, 5)) {
      const url = typeof raw.url === "string" ? raw.url.trim() : "";
      if (!url || !url.startsWith("https://") || allKnownUrls.has(url)) continue;

      const category = validateCategory(typeof raw.category === "string" ? raw.category : "");
      if (!category) continue;

      newSources.push({
        url,
        category,
        tradition: typeof raw.tradition === "string" ? raw.tradition.trim() : "discovered",
        discovered: true,
        discoveredFrom: recentUrls[0],
      });
    }

    return newSources;
  } catch (err) {
    console.warn(
      "[moral-compass] source discovery failed:",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

async function decayAndPrune(): Promise<number> {
  const principles = await loadAllPrinciples();
  const now = Date.now();
  const decayThreshold = DECAY_DAYS * 24 * 60 * 60 * 1000;
  let pruned = 0;

  for (const p of principles) {
    const age = now - new Date(p.lastReinforced).getTime();
    if (age > decayThreshold) {
      p.weight *= DECAY_FACTOR;

      if (p.weight < PRUNE_THRESHOLD) {
        await forget(SCOPE_PRINCIPLES, p.id);
        pruned++;
      } else {
        await storePrinciple(p);
      }
    }
  }

  return pruned;
}

async function synthesize(principles: MoralPrinciple[]): Promise<boolean> {
  // Sort by weight * confidence, take top 100
  const ranked = [...principles]
    .filter((p) => p.confidence >= 0.3)
    .sort((a, b) => b.weight * b.confidence - a.weight * a.confidence)
    .slice(0, 100);

  if (ranked.length < 3) {
    console.log("[moral-compass] not enough principles for synthesis, need >= 3");
    return false;
  }

  const principleText = ranked
    .map(
      (p, i) =>
        `${i + 1}. [${p.category}/${p.tradition}] (confidence: ${p.confidence.toFixed(2)}, sources: ${p.sourceCount})\n   ${p.statement}\n   Axes: ${p.relevantAxes.join(", ")}\n   Guidance: ${p.applicationGuidance}`,
    )
    .join("\n\n");

  try {
    const result = await generateTextForTask({
      task: "moralCompass",
      system: SYNTHESIS_PROMPT
        .replace("{count}", String(ranked.length))
        .replace("{principles}", principleText),
      user: "Generate the moral compass synthesis now.",
      maxTokens: 1024,
      temperature: 0.2,
      timeoutMs: 30_000,
    });

    let synthesis = result.text.trim();
    // Strip any markdown/think wrappers
    synthesis = synthesis.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    synthesis = synthesis.replace(/^```[\s\S]*?```$/gm, "").trim();

    if (synthesis.length < 100) {
      console.warn("[moral-compass] synthesis too short, skipping");
      return false;
    }

    // Truncate to max chars
    if (synthesis.length > SYNTHESIS_MAX_CHARS) {
      synthesis = synthesis.slice(0, SYNTHESIS_MAX_CHARS);
    }

    await remember(SCOPE_META, "synthesis", synthesis);
    await remember(SCOPE_META, "last-synthesis", new Date().toISOString());

    console.log(`[moral-compass] synthesis updated: ${synthesis.length} chars from ${ranked.length} principles`);
    return true;
  } catch (err) {
    console.error(
      "[moral-compass] synthesis failed:",
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Get the current moral compass synthesis text.
 * Returns null if not yet generated.
 */
export async function getMoralCompassSynthesis(): Promise<string | null> {
  try {
    const entries = await recall(SCOPE_META, "synthesis");
    return entries.length > 0 ? entries[0].content : null;
  } catch {
    return null;
  }
}

/**
 * Build formatted moral compass context for prompt injection.
 * Returns the synthesis + top 5 high-confidence principles.
 */
export async function buildMoralCompassContext(): Promise<string | null> {
  try {
    const synthesis = await getMoralCompassSynthesis();
    if (!synthesis) return null;

    const principles = await loadAllPrinciples();
    const top = principles
      .filter((p) => p.confidence >= 0.5)
      .sort((a, b) => b.weight * b.confidence - a.weight * a.confidence)
      .slice(0, 5);

    const sections = [`MORAL COMPASS (learned from ethics/philosophy sources):\n${synthesis}`];

    if (top.length > 0) {
      const topPrinciples = top
        .map((p) => `- [${p.tradition}] ${p.statement} (confidence: ${p.confidence.toFixed(1)})`)
        .join("\n");
      sections.push(`\nTOP PRINCIPLES:\n${topPrinciples}`);
    }

    return sections.join("\n");
  } catch {
    return null;
  }
}

/**
 * Get statistics about the moral compass state.
 */
export async function getMoralCompassStats(): Promise<{
  principleCount: number;
  categoryBreakdown: Record<string, number>;
  sourcesCrawled: number;
  sourcesQueued: number;
  lastSynthesis: string | null;
  synthesisPreview: string | null;
}> {
  const principles = await loadAllPrinciples();
  const crawled = await getCrawledSources();
  const queue = await getSourceQueue();

  const categoryBreakdown: Record<string, number> = {};
  for (const p of principles) {
    categoryBreakdown[p.category] = (categoryBreakdown[p.category] ?? 0) + 1;
  }

  const lastSynthesisEntries = await recall(SCOPE_META, "last-synthesis");
  const lastSynthesis = lastSynthesisEntries.length > 0 ? lastSynthesisEntries[0].content : null;

  const synthesis = await getMoralCompassSynthesis();

  return {
    principleCount: principles.length,
    categoryBreakdown,
    sourcesCrawled: crawled.size,
    sourcesQueued: queue.length,
    lastSynthesis,
    synthesisPreview: synthesis ? synthesis.slice(0, 500) : null,
  };
}

/**
 * Run the full moral compass pipeline.
 * Called daily by the scheduled crawl job at 3 AM UTC.
 */
export async function runMoralCompassPipeline(): Promise<MoralCompassResult> {
  console.log("[moral-compass] starting pipeline...");

  const result: MoralCompassResult = {
    sourcesCrawled: 0,
    principlesExtracted: 0,
    principlesReinforced: 0,
    principlesPruned: 0,
    newSourcesDiscovered: 0,
    synthesisUpdated: false,
    errors: [],
  };

  // 1. Get next sources to crawl
  const queue = await getSourceQueue();
  const batch = queue.slice(0, SOURCES_PER_RUN);

  if (batch.length === 0) {
    console.log("[moral-compass] no sources in queue, skipping extraction");
    result.errors.push("Source queue empty — waiting for discovered sources");
  }

  // 2. Load existing principles for reinforcement checks
  let existing = await loadAllPrinciples();

  // Check capacity
  if (existing.length >= MAX_PRINCIPLES) {
    console.log("[moral-compass] at max principles, running decay first");
    result.principlesPruned = await decayAndPrune();
    existing = await loadAllPrinciples();
  }

  // 3. Crawl each source with rate limiting
  const crawled = await getCrawledSources();
  const processedUrls: string[] = [];

  for (let i = 0; i < batch.length; i++) {
    const source = batch[i];
    console.log(`[moral-compass] crawling [${i + 1}/${batch.length}]: ${source.url}`);

    const { principles, error } = await extractPrinciplesFromUrl(source);

    if (error) {
      result.errors.push(`${source.url}: ${error}`);
    }

    for (const principle of principles) {
      const action = await reinforceOrStore(principle, existing);
      if (action === "new") {
        result.principlesExtracted++;
      } else {
        result.principlesReinforced++;
      }
    }

    crawled.add(source.url);
    processedUrls.push(source.url);
    result.sourcesCrawled++;

    // Rate limiting between sources
    if (i < batch.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, INTER_SOURCE_DELAY_MS));
    }
  }

  // Save crawled state
  await saveCrawledSources(crawled);

  // 4. Discover new sources from what we just crawled
  if (processedUrls.length > 0) {
    const newSources = await discoverNewSources(processedUrls);
    if (newSources.length > 0) {
      const existingDiscovered = await getDiscoveredSources();
      const existingUrls = new Set(existingDiscovered.map((s) => s.url));
      const truly_new = newSources.filter((s) => !existingUrls.has(s.url));
      await saveDiscoveredSources([...existingDiscovered, ...truly_new]);
      result.newSourcesDiscovered = truly_new.length;
      console.log(`[moral-compass] discovered ${truly_new.length} new sources`);
    }
  }

  // 5. Decay and prune
  if (result.principlesPruned === 0) {
    result.principlesPruned = await decayAndPrune();
  }

  // 6. Check if synthesis is due
  const lastSynthesisEntries = await recall(SCOPE_META, "last-synthesis");
  const lastSynthesisDate = lastSynthesisEntries.length > 0
    ? new Date(lastSynthesisEntries[0].content)
    : null;

  const daysSinceSynthesis = lastSynthesisDate
    ? (Date.now() - lastSynthesisDate.getTime()) / (24 * 60 * 60 * 1000)
    : Infinity;

  if (daysSinceSynthesis >= SYNTHESIS_INTERVAL_DAYS) {
    const allPrinciples = await loadAllPrinciples();
    result.synthesisUpdated = await synthesize(allPrinciples);
  }

  console.log(
    `[moral-compass] pipeline complete: ${result.sourcesCrawled} crawled, ` +
    `${result.principlesExtracted} new, ${result.principlesReinforced} reinforced, ` +
    `${result.principlesPruned} pruned, ${result.newSourcesDiscovered} discovered, ` +
    `synthesis=${result.synthesisUpdated}`,
  );

  return result;
}
