"use strict";
// ─── Agent Core — URL Knowledge Ingestion ────────────────────────────────────
//
// Adapted from NounIRL's knowledge.ts for the Pooter agent swarm.
// Pipeline: URL → fetch HTML → strip tags → Claude fact extraction → memory
//
// Uses generateTextForTask() with the "factExtraction" task type
// (FAST provider order, cheap models).
// ─────────────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.learnFromUrl = learnFromUrl;
exports.batchLearn = batchLearn;
exports.getKnowledgeStats = getKnowledgeStats;
exports.buildKnowledgeContext = buildKnowledgeContext;
require("server-only");
const memory_1 = require("./memory");
const ai_provider_1 = require("../../ai-provider");
// ─── Text extraction from HTML ──────────────────────────────────────────────
const FETCH_TIMEOUT_MS = 15_000;
const MAX_CONTENT_CHARS = 50_000;
function stripHtml(html) {
    return html
        // Remove script, style, svg, noscript blocks
        .replace(/<(script|style|svg|noscript)[^>]*>[\s\S]*?<\/\1>/gi, "")
        // Remove all HTML tags
        .replace(/<[^>]+>/g, " ")
        // Decode common HTML entities
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, " ")
        // Collapse whitespace
        .replace(/\s+/g, " ")
        .trim();
}
async function fetchAndExtract(url) {
    const response = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
            "user-agent": "PooterBot/1.0 (knowledge-ingestion)",
            accept: "text/html, text/plain, application/json",
        },
    });
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} fetching ${url}`);
    }
    const contentType = response.headers.get("content-type") ?? "";
    const raw = await response.text();
    // JSON → stringify it
    if (contentType.includes("application/json")) {
        try {
            const parsed = JSON.parse(raw);
            return JSON.stringify(parsed, null, 2).slice(0, MAX_CONTENT_CHARS);
        }
        catch {
            return raw.slice(0, MAX_CONTENT_CHARS);
        }
    }
    // Plain text → use directly
    if (contentType.includes("text/plain")) {
        return raw.slice(0, MAX_CONTENT_CHARS);
    }
    // HTML → strip tags
    return stripHtml(raw).slice(0, MAX_CONTENT_CHARS);
}
// ─── Claude fact extraction ─────────────────────────────────────────────────
const FACT_EXTRACTION_SYSTEM = `You are a fact extraction engine. Given text content from a web page, extract the most important specific facts.

Focus on:
- Specific numbers, dates, percentages, dollar amounts
- Named entities (people, organizations, protocols, tokens)
- Causal claims ("X caused Y", "X leads to Y")
- Key mechanisms or processes described
- Addresses (wallet, contract, ENS names)
- Notable quotes or statements attributed to specific people
- Statistical claims or research findings

IMPORTANT: You MUST respond with ONLY a valid JSON array of strings. No other text, no explanations, no numbering.
Maximum 20 facts. Prioritize specificity over generality.

Correct response format:
["Bitcoin ETF inflows reached $1.2B on March 5, 2026", "Vitalik proposed EIP-7702 for account abstraction"]`;
async function extractFactsWithDebug(text) {
    let result;
    try {
        result = await (0, ai_provider_1.generateTextForTask)({
            task: "factExtraction",
            system: FACT_EXTRACTION_SYSTEM,
            user: `Extract the key facts from this content:\n\n${text.slice(0, 12_000)}`,
            maxTokens: 2048,
            temperature: 0,
            timeoutMs: 30_000,
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { facts: [], debug: `AI call failed: ${msg}` };
    }
    // Strip markdown code fences if present
    let responseText = result.text;
    const codeBlockMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
        responseText = codeBlockMatch[1].trim();
    }
    // Parse JSON array from response
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
        try {
            const parsed = JSON.parse(jsonMatch[0]);
            if (Array.isArray(parsed)) {
                const facts = parsed
                    .filter((item) => typeof item === "string" && item.length > 10)
                    .slice(0, 20);
                return { facts, debug: `Provider=${result.provider}/${result.model}. Extracted ${facts.length} facts (JSON).` };
            }
        }
        catch {
            // Fall through to numbered list parsing
        }
    }
    // Fallback: parse numbered list format (e.g., "1. Some fact\n2. Another fact")
    const numberedLines = responseText
        .split("\n")
        .map((line) => line.replace(/^\s*\d+[\.\)]\s*/, "").trim())
        .filter((line) => line.length > 10 && !line.startsWith("Here ") && !line.startsWith("The following"));
    if (numberedLines.length >= 3) {
        const facts = numberedLines.slice(0, 20);
        return { facts, debug: `Provider=${result.provider}/${result.model}. Extracted ${facts.length} facts (numbered list fallback).` };
    }
    return {
        facts: [],
        debug: `Provider=${result.provider}/${result.model}. No parseable format. Response (first 300 chars): ${responseText.slice(0, 300)}`,
    };
}
// ─── URL slug for storage keys ──────────────────────────────────────────────
function urlToSlug(url) {
    return url
        .replace(/^https?:\/\//, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60)
        .toLowerCase();
}
// ─── Public API ─────────────────────────────────────────────────────────────
/**
 * Learn facts from a single URL.
 * Fetches the page, extracts text, sends to Claude for fact extraction,
 * and stores each fact in memory under the "knowledge" scope.
 */
async function learnFromUrl(url) {
    try {
        const text = await fetchAndExtract(url);
        console.log(`[knowledge] fetched ${url}: ${text.length} chars`);
        if (text.length < 50) {
            return { url, factsLearned: 0, facts: [], error: `Page content too short (${text.length} chars)` };
        }
        const { facts, debug } = await extractFactsWithDebug(text);
        if (facts.length === 0) {
            return { url, factsLearned: 0, facts: [], error: `No facts extracted. ${debug}` };
        }
        // Store each fact
        const slug = urlToSlug(url);
        for (let i = 0; i < facts.length; i++) {
            await (0, memory_1.remember)("knowledge", `${slug}-${i}`, facts[i]);
        }
        // Store source metadata
        await (0, memory_1.remember)("knowledge-sources", slug, JSON.stringify({
            url,
            factsCount: facts.length,
            learnedAt: new Date().toISOString(),
        }));
        console.log(`[knowledge] learned ${facts.length} facts from ${url}`);
        return { url, factsLearned: facts.length, facts };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[knowledge] failed to learn from ${url}:`, message);
        return { url, factsLearned: 0, facts: [], error: message };
    }
}
/**
 * Learn from multiple URLs sequentially with a 1-second delay between each.
 */
async function batchLearn(urls) {
    const results = [];
    for (const url of urls) {
        const result = await learnFromUrl(url);
        results.push(result);
        // Rate limiting: 1s delay between URLs
        if (urls.indexOf(url) < urls.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 1_000));
        }
    }
    return results;
}
/**
 * Get statistics about knowledge stored.
 */
async function getKnowledgeStats() {
    const totalFacts = await (0, memory_1.countByScope)("knowledge");
    const sourceEntries = await (0, memory_1.recall)("knowledge-sources");
    const sources = sourceEntries.map((entry) => {
        try {
            const meta = JSON.parse(entry.content);
            return typeof meta.url === "string" ? meta.url : entry.key;
        }
        catch {
            return entry.key;
        }
    });
    return { totalFacts, sources };
}
/**
 * Build formatted knowledge context for system prompt injection.
 */
async function buildKnowledgeContext(maxFacts = 40) {
    const facts = await (0, memory_1.recall)("knowledge");
    if (facts.length === 0)
        return null;
    const lines = facts
        .slice(0, maxFacts)
        .map((m) => `• ${m.content}`)
        .join("\n");
    return `LEARNED KNOWLEDGE (from ingested sources):\n${lines}`;
}
