import { NextResponse } from "next/server";
import { getOperatorAuthState, getSessionAddress } from "@/lib/operator-auth";
import { getSourceBias } from "@/lib/bias";
import { generateTextForTask } from "@/lib/ai-provider";
import { hasAIProviderForTask } from "@/lib/ai-models";
import { rateLimit } from "@/lib/rate-limit";

// ============================================================================
// AI ENTITY SCORING — Claude-powered credibility & quality analysis
//
// Scores any entity (URL, DOMAIN, ADDRESS, CONTRACT) for:
//   - Credibility (0-100): trustworthiness of the source/entity
//   - Quality (0-100): content/code quality
//   - Bias detection: editorial lean and framing analysis
//   - Flags: scam risk, misinformation, low quality, etc.
//
// Uses Claude Haiku for fast, cheap scoring. Falls back to static bias
// database + heuristics when API key is unavailable.
// ============================================================================

const SCORE_TIMEOUT_MS = 10_000;

interface ScoreRequest {
  identifier: string;
  entityType: "URL" | "DOMAIN" | "ADDRESS" | "CONTRACT";
  content?: string;
}

interface ScoreResult {
  credibility: number;
  quality: number;
  sentiment: "positive" | "neutral" | "negative";
  biasRating: string | null;
  flags: string[];
  summary: string;
}

// Simple in-memory cache — avoids repeated API calls for the same entity
const scoreCache = new Map<string, { result: ScoreResult; timestamp: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function getCacheKey(req: ScoreRequest): string {
  return `${req.entityType}:${req.identifier}`;
}

/**
 * Score an entity using Claude AI.
 */
async function scoreWithClaude(req: ScoreRequest): Promise<ScoreResult> {
  // Build context-aware prompt based on entity type
  let prompt: string;

  if (req.entityType === "DOMAIN") {
    const staticBias = getSourceBias(req.identifier);
    const biasContext = staticBias
      ? `Known bias rating: ${staticBias.bias}, Factuality: ${staticBias.factuality}, Ownership: ${staticBias.ownership || "unknown"}, Country: ${staticBias.country || "unknown"}`
      : "No pre-existing bias data available.";

    prompt = `Analyze this news domain for credibility and content quality.

Domain: ${req.identifier}
${biasContext}
${req.content ? `\nSample content:\n${req.content.slice(0, 2000)}` : ""}

Return a JSON object with:
- credibility (0-100): source trustworthiness based on reputation, factuality track record, transparency
- quality (0-100): editorial standards, sourcing quality, depth of coverage
- sentiment: "positive", "neutral", or "negative" (overall editorial tone)
- biasRating: detected bias ("far-left", "left", "lean-left", "center", "lean-right", "right", "far-right", or null)
- flags: array of concern strings (e.g. "clickbait", "state-funded", "satire", "propaganda", "paywalled")
- summary: one sentence assessment

Return ONLY valid JSON.`;

  } else if (req.entityType === "URL") {
    prompt = `Analyze this URL/article for credibility and content quality.

URL: ${req.identifier}
${req.content ? `\nContent excerpt:\n${req.content.slice(0, 2000)}` : ""}

Return a JSON object with:
- credibility (0-100): how trustworthy is this specific content
- quality (0-100): writing quality, sourcing, depth, originality
- sentiment: "positive", "neutral", or "negative"
- biasRating: detected bias ("far-left", "left", "lean-left", "center", "lean-right", "right", "far-right", or null)
- flags: array of concern strings (e.g. "misleading-headline", "unsourced-claims", "opinion-as-news", "sponsored")
- summary: one sentence assessment

Return ONLY valid JSON.`;

  } else {
    // ADDRESS or CONTRACT
    prompt = `Analyze this blockchain ${req.entityType.toLowerCase()} for trustworthiness.

${req.entityType}: ${req.identifier}
${req.content ? `\nContext:\n${req.content.slice(0, 1500)}` : ""}

Return a JSON object with:
- credibility (0-100): contract/address trustworthiness (verified, audit history, age, activity patterns)
- quality (0-100): code quality if contract, transaction patterns if address
- sentiment: "positive", "neutral", or "negative"
- biasRating: null (not applicable for onchain entities)
- flags: array of concern strings (e.g. "unverified", "honeypot-risk", "proxy-contract", "whale-wallet", "fresh-wallet", "mixer-associated")
- summary: one sentence assessment

Return ONLY valid JSON.`;
  }

  const result = await generateTextForTask({
    task: "entityScoring",
    maxTokens: 300,
    temperature: 0,
    timeoutMs: SCORE_TIMEOUT_MS,
    system:
      "You are a media credibility and blockchain security analyst. Return ONLY valid JSON. No markdown fences, no explanation.",
    user: prompt,
  });

  let jsonText = result.text.trim();
  if (jsonText.startsWith("```")) {
    jsonText = jsonText.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  }

  const parsed = JSON.parse(jsonText);
  return validateScoreResult(parsed);
}

/**
 * Fallback scoring using the static bias database + heuristics.
 */
function scoreWithHeuristics(req: ScoreRequest): ScoreResult {
  if (req.entityType === "DOMAIN") {
    const bias = getSourceBias(req.identifier);
    if (bias) {
      const factualityScores: Record<string, number> = {
        "very-high": 95, "high": 82, "mostly-factual": 68,
        "mixed": 45, "low": 25, "very-low": 10,
      };
      const credibility = factualityScores[bias.factuality] ?? 60;
      const quality = Math.min(100, credibility + 5);
      return {
        credibility,
        quality,
        sentiment: "neutral",
        biasRating: bias.bias,
        flags: bias.fundingModel === "state" ? ["state-funded"] : [],
        summary: `${bias.name}: ${bias.bias} bias, ${bias.factuality} factuality. ${bias.ownership ? `Owned by ${bias.ownership}.` : ""}`,
      };
    }
    // Unknown domain — moderate default
    return {
      credibility: 50,
      quality: 50,
      sentiment: "neutral",
      biasRating: null,
      flags: ["unrated-source"],
      summary: `Unknown domain — not in media bias database. Exercise caution.`,
    };
  }

  if (req.entityType === "ADDRESS" || req.entityType === "CONTRACT") {
    return {
      credibility: 50,
      quality: 50,
      sentiment: "neutral",
      biasRating: null,
      flags: ["unverified"],
      summary: `${req.entityType.toLowerCase()} analysis requires onchain data — heuristic score only.`,
    };
  }

  // URL fallback
  const domainMatch = req.identifier.match(/https?:\/\/(?:www\.)?([^/]+)/);
  if (domainMatch) {
    const domainResult = scoreWithHeuristics({
      identifier: domainMatch[1],
      entityType: "DOMAIN",
    });
    return { ...domainResult, summary: `URL scored via domain: ${domainResult.summary}` };
  }

  return {
    credibility: 50,
    quality: 50,
    sentiment: "neutral",
    biasRating: null,
    flags: [],
    summary: `Content analysis for ${req.identifier}`,
  };
}

function validateScoreResult(data: unknown): ScoreResult {
  if (!data || typeof data !== "object") {
    throw new Error("Score result is not an object");
  }
  const d = data as Record<string, unknown>;

  return {
    credibility: typeof d.credibility === "number"
      ? Math.min(100, Math.max(0, Math.round(d.credibility)))
      : 50,
    quality: typeof d.quality === "number"
      ? Math.min(100, Math.max(0, Math.round(d.quality)))
      : 50,
    sentiment: d.sentiment === "positive" || d.sentiment === "negative"
      ? d.sentiment
      : "neutral",
    biasRating: typeof d.biasRating === "string" ? d.biasRating : null,
    flags: Array.isArray(d.flags)
      ? (d.flags as unknown[]).filter((f): f is string => typeof f === "string")
      : [],
    summary: typeof d.summary === "string" ? d.summary.slice(0, 300) : "Analysis complete.",
  };
}

export async function POST(request: Request) {
  // Rate limit: 20 scoring requests per minute per IP
  const limited = rateLimit(request, { maxRequests: 20, windowMs: 60_000 });
  if (limited) return limited;

  if (process.env.NODE_ENV === "production") {
    const [operatorAuth, sessionAddress] = await Promise.all([
      getOperatorAuthState(request),
      getSessionAddress(),
    ]);
    if (!operatorAuth.authorized && !sessionAddress) {
      return NextResponse.json(
        { error: "Authentication required for AI scoring" },
        { status: 401 },
      );
    }
  }

  try {
    const body: ScoreRequest = await request.json();

    if (!body.identifier || !body.entityType) {
      return NextResponse.json(
        { error: "identifier and entityType required" },
        { status: 400 },
      );
    }

    // Check cache first
    const cacheKey = getCacheKey(body);
    const cached = scoreCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return NextResponse.json({
        identifier: body.identifier,
        entityType: body.entityType,
        score: cached.result,
        compositeAIScore: Math.round(
          ((cached.result.credibility + cached.result.quality) / 2) * 100,
        ),
        source: "cached",
        timestamp: cached.timestamp,
      });
    }

    // Try Claude scoring, fall back to heuristics
    let score: ScoreResult;
    let source: "ai" | "heuristic";

    if (hasAIProviderForTask("entityScoring")) {
      try {
        score = await scoreWithClaude(body);
        source = "ai";
      } catch (err) {
        console.warn(
          "[ai/score] AI scoring failed, using heuristics:",
          err instanceof Error ? err.message : err,
        );
        score = scoreWithHeuristics(body);
        source = "heuristic";
      }
    } else {
      score = scoreWithHeuristics(body);
      source = "heuristic";
    }

    // Cache the result
    scoreCache.set(cacheKey, { result: score, timestamp: Date.now() });

    // Evict old entries (simple TTL cleanup)
    if (scoreCache.size > 500) {
      const now = Date.now();
      for (const [key, entry] of scoreCache) {
        if (now - entry.timestamp > CACHE_TTL_MS) scoreCache.delete(key);
      }
    }

    return NextResponse.json({
      identifier: body.identifier,
      entityType: body.entityType,
      score,
      // Composite for leaderboard (0-10000 scale matching contract)
      compositeAIScore: Math.round(
        ((score.credibility + score.quality) / 2) * 100,
      ),
      source,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error("[ai/score] Scoring failed:", error);
    return NextResponse.json(
      { error: "AI scoring failed", details: error instanceof Error ? error.message : "unknown" },
      { status: 500 },
    );
  }
}
