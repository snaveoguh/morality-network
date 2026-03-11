#!/usr/bin/env node

/**
 * Batch editorial generation script.
 * Reads article-archive.json, finds items missing editorials in editorial-archive.json,
 * and generates AI editorials via Claude API.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... node scripts/generate-editorials.mjs
 *
 * Env vars:
 *   ANTHROPIC_API_KEY — Required. Claude API key.
 *   EDITORIAL_BATCH_SIZE — Max items per run (default: 20)
 *   EDITORIAL_DELAY_MS — Delay between API calls in ms (default: 3000)
 */

import path from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { keccak256, toBytes } from "viem";
import Anthropic from "@anthropic-ai/sdk";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ARTICLE_ARCHIVE_PATH = path.join(__dirname, "../src/data/article-archive.json");
const EDITORIAL_ARCHIVE_PATH = path.join(__dirname, "../src/data/editorial-archive.json");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const BATCH_SIZE = parseInt(process.env.EDITORIAL_BATCH_SIZE || "20", 10);
const DELAY_MS = parseInt(process.env.EDITORIAL_DELAY_MS || "3000", 10);
const MODEL = "claude-sonnet-4-20250514";

if (!ANTHROPIC_API_KEY) {
  console.error("[editorial] ANTHROPIC_API_KEY not set — aborting.");
  process.exit(1);
}

const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are the editorial engine for pooter.world, a vintage newspaper-style news aggregation platform that presents multi-source coverage with editorial synthesis.

Your job is to synthesize an editorial article from a primary news article and related coverage from other sources. You write with authority, precision, and journalistic rigour — like a seasoned newspaper editor.

Rules:
1. ONLY use information present in the provided sources. Never fabricate facts, quotes, or details.
2. If related articles discuss DIFFERENT topics from the primary article, IGNORE them entirely. Do not mix unrelated stories.
3. When sources agree, synthesize their coverage into a unified narrative.
4. When sources contradict each other, note the contradiction explicitly.
5. Write in third person, active voice. No clichés, no clickbait.
6. Every claim must be attributable to at least one named source.

Return a JSON object with exactly these fields:
{
  "subheadline": "One sentence (max 30 words) contextualizing the story in editorial voice",
  "editorialBody": ["paragraph1", "paragraph2", "paragraph3", ...],
  "wireSummary": "One compact paragraph summarizing multi-source coverage, or null",
  "biasContext": "One sentence noting the primary source's known editorial lean, or null",
  "tags": ["tag1", "tag2", ...],
  "claim": "One canonical factual claim sentence"
}

Guidelines:
- subheadline: Editorial voice, contextualizes the story
- editorialBody: 3-5 paragraphs. First: what happened. Middle: cross-source context. Last: what to watch.
- tags: 3-8 lowercase topical tags
- claim: The single most important factual claim, stated neutrally

Return ONLY valid JSON. No markdown, no explanation, no preamble.`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadJson(filePath) {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function computeContentHash(editorial) {
  const payload = JSON.stringify({
    claim: editorial.claim || "",
    subheadline: editorial.subheadline || "",
    editorialBody: editorial.editorialBody || [],
    wireSummary: editorial.wireSummary || null,
    biasContext: editorial.biasContext || null,
    tags: editorial.tags || [],
    primaryTitle: editorial.primaryTitle || "",
    primaryLink: editorial.primaryLink || "",
  });
  return keccak256(toBytes(payload));
}

function findRelatedItems(primaryItem, allItems) {
  // Simple category + keyword matching for batch context
  const primaryWords = new Set(
    (primaryItem.title || "")
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3),
  );

  const scored = [];

  for (const [hash, item] of Object.entries(allItems)) {
    if (item.link === primaryItem.link) continue;
    if (item.source === primaryItem.source) continue;

    const itemWords = new Set(
      (item.title || "")
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 3),
    );

    let overlap = 0;
    for (const w of primaryWords) {
      if (itemWords.has(w)) overlap++;
    }

    // Require at least 3 shared meaningful words
    if (overlap >= 3) {
      scored.push({ item, overlap });
    }
  }

  scored.sort((a, b) => b.overlap - a.overlap);
  return scored.slice(0, 3).map((s) => s.item);
}

async function generateEditorialForItem(primaryItem, relatedItems) {
  const userMessage = JSON.stringify(
    {
      primary: {
        title: primaryItem.title,
        description: primaryItem.description || "",
        link: primaryItem.link,
        source: primaryItem.source,
        category: primaryItem.category || "World",
        pubDate: primaryItem.pubDate,
        bias: primaryItem.bias || null,
      },
      relatedArticles: relatedItems.map((item, i) => ({
        index: i,
        title: item.title,
        description: item.description || "",
        link: item.link,
        source: item.source,
        category: item.category || "World",
        bias: item.bias || null,
      })),
    },
    null,
    2,
  );

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text block in response");
  }

  let jsonText = textBlock.text.trim();
  if (jsonText.startsWith("```")) {
    jsonText = jsonText.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  }

  return JSON.parse(jsonText);
}

async function main() {
  const articleArchive = await loadJson(ARTICLE_ARCHIVE_PATH);
  if (!articleArchive?.items || Object.keys(articleArchive.items).length === 0) {
    console.log("[editorial] No items in article archive — nothing to generate.");
    return;
  }

  let editorialArchive = await loadJson(EDITORIAL_ARCHIVE_PATH);
  if (!editorialArchive?.items) {
    editorialArchive = { version: 1, updatedAt: "", items: {} };
  }

  const existingHashes = new Set(Object.keys(editorialArchive.items));
  const missingHashes = Object.keys(articleArchive.items).filter(
    (hash) => !existingHashes.has(hash),
  );

  if (missingHashes.length === 0) {
    console.log(
      `[editorial] All ${existingHashes.size} items already have editorials.`,
    );
    return;
  }

  console.log(
    `[editorial] ${missingHashes.length} items missing editorials. Generating up to ${BATCH_SIZE}...`,
  );

  const batch = missingHashes.slice(0, BATCH_SIZE);
  let generated = 0;
  let failed = 0;

  for (const hash of batch) {
    const primaryItem = articleArchive.items[hash];
    if (!primaryItem?.title) {
      console.warn(`[editorial] skipping ${hash.slice(0, 10)}... (no title)`);
      failed++;
      continue;
    }

    try {
      const relatedItems = findRelatedItems(primaryItem, articleArchive.items);
      const aiResult = await generateEditorialForItem(primaryItem, relatedItems);

      // Build the full editorial record
      const now = new Date().toISOString();
      const contentHash = computeContentHash({
        ...aiResult,
        primaryTitle: primaryItem.title,
        primaryLink: primaryItem.link,
      });

      editorialArchive.items[hash] = {
        primary: {
          id: primaryItem.id || hash,
          title: primaryItem.title,
          link: primaryItem.link,
          description: primaryItem.description || "",
          pubDate: primaryItem.pubDate,
          source: primaryItem.source,
          sourceUrl: primaryItem.sourceUrl || "",
          category: primaryItem.category || "World",
          imageUrl: primaryItem.imageUrl || undefined,
          bias: primaryItem.bias || null,
          tags: primaryItem.tags || [],
          canonicalClaim: aiResult.claim || "",
        },
        claim: aiResult.claim || "",
        relatedSources: relatedItems.map((item) => ({
          id: item.id || "",
          title: item.title,
          link: item.link,
          description: item.description || "",
          pubDate: item.pubDate,
          source: item.source,
          sourceUrl: item.sourceUrl || "",
          category: item.category || "World",
          imageUrl: item.imageUrl || undefined,
          bias: item.bias || null,
          tags: item.tags || [],
          canonicalClaim: "",
        })),
        subheadline: aiResult.subheadline || "",
        subheadlineEnglish: null,
        editorialBody: aiResult.editorialBody || [],
        editorialBodyEnglish: undefined,
        wireSummary: aiResult.wireSummary || null,
        biasContext: aiResult.biasContext || null,
        tags: aiResult.tags || [],
        contextSnippets: [],
        agentResearch: {
          canonicalClaim: aiResult.claim || "",
          claimVariants: [],
          evidence: [],
          contradictionFlags: [],
          sourceCount: 1 + relatedItems.length,
        },
        entities: [],
        entityHash: hash,
        generatedAt: now,
        generatedBy: "claude-ai",
        contentHash,
        version: 1,
      };

      generated++;
      console.log(
        `[editorial] ✓ ${hash.slice(0, 10)}... "${primaryItem.title.slice(0, 50)}..." (${generated}/${batch.length})`,
      );
    } catch (err) {
      failed++;
      console.error(
        `[editorial] ✗ ${hash.slice(0, 10)}... error:`,
        err.message || err,
      );
    }

    // Rate limit
    if (batch.indexOf(hash) < batch.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  // Save editorial archive
  editorialArchive.updatedAt = new Date().toISOString();
  await mkdir(path.dirname(EDITORIAL_ARCHIVE_PATH), { recursive: true });
  await writeFile(
    EDITORIAL_ARCHIVE_PATH,
    `${JSON.stringify(editorialArchive, null, 2)}\n`,
    "utf8",
  );

  const total = Object.keys(editorialArchive.items).length;
  console.log(
    `[editorial] Done. generated=${generated} failed=${failed} total=${total}`,
  );
}

main().catch((err) => {
  console.error("[editorial] batch generation failed:", err);
  process.exit(1);
});
