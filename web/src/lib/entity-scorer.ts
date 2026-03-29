import "server-only";

/**
 * entity-scorer.ts — Orchestrates AI scoring for any entity type.
 *
 * Given a URL, contract address, or domain, fetches context and runs
 * AI analysis (morality, bias, contract audit) to produce a score card.
 */

import { routerGenerate } from "./ai-router";
import { scanEntity, detectChain, type ChainScanResult } from "./chain-scanner";
import { detectEntityType, computeEntityHash } from "./entity";
import { EntityType } from "./contracts";

// ============================================================================
// TYPES
// ============================================================================

export interface EntityScore {
  identifier: string;
  entityHash: string;
  entityType: "url" | "domain" | "address" | "contract";
  chain?: "base" | "solana" | "ethereum";

  /** Morality score 0-100 */
  moralityScore: number;
  /** Factuality score 0-100 (for URLs/domains) */
  factualityScore: number | null;
  /** Bias tilt -3 (far left) to +3 (far right), null for non-content entities */
  biasTilt: number | null;
  biasLabel: string | null;
  /** Risk score 0-100 (for contracts/addresses) */
  riskScore: number;
  /** Risk flags */
  riskFlags: string[];

  /** AI-generated reasoning (1-3 sentences) */
  reasoning: string;
  /** Key metadata */
  metadata: Record<string, unknown>;

  /** Which AI provider scored this */
  scoredBy: string;
  scoredAt: number;
}

// ============================================================================
// URL CONTENT FETCHER
// ============================================================================

async function fetchUrlContent(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "PooterBot/1.0 (morality scoring)",
        Accept: "text/html,application/xhtml+xml,text/plain",
      },
      signal: AbortSignal.timeout(10_000),
      redirect: "follow",
    });

    if (!res.ok) return `Failed to fetch: HTTP ${res.status}`;

    const html = await res.text();
    // Strip HTML tags for plain text extraction
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // Truncate to ~4000 chars for LLM context
    return text.slice(0, 4000);
  } catch (err) {
    return `Error fetching URL: ${err instanceof Error ? err.message : "unknown"}`;
  }
}

// ============================================================================
// AI SCORING PROMPTS
// ============================================================================

async function scoreUrlOrDomain(identifier: string, content: string): Promise<Partial<EntityScore>> {
  const systemPrompt = `You are the Morality Oracle — an impartial AI that scores web content for morality, bias, and factuality. Return ONLY valid JSON.`;

  const userPrompt = `Analyze this content from "${identifier}" and return a morality/bias/factuality score.

Content:
${content.slice(0, 3000)}

Return this exact JSON:
{
  "moralityScore": <0-100, how morally sound is this content? 100=exemplary, 0=deeply immoral>,
  "factualityScore": <0-100, how factual/accurate? 100=impeccable, 0=disinformation>,
  "biasTilt": <-3 to +3, -3=far-left, 0=center, +3=far-right. null if non-political>,
  "biasLabel": <"Far Left"|"Left"|"Lean Left"|"Center"|"Lean Right"|"Right"|"Far Right"|null>,
  "riskScore": <0-100, how risky is this source? Scam/phishing=high, established=low>,
  "riskFlags": [<list of flags like "clickbait", "misinformation", "propaganda", "satire", etc.>],
  "reasoning": "<2-3 sentence analysis>"
}`;

  try {
    const result = await routerGenerate({
      tier: "fast",
      system: systemPrompt,
      user: userPrompt,
      maxTokens: 512,
      temperature: 0.2,
      timeoutMs: 15_000,
    });

    let json = result.text.trim();
    if (json.startsWith("```")) json = json.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");

    const parsed = JSON.parse(json) as {
      moralityScore?: number;
      factualityScore?: number;
      biasTilt?: number;
      biasLabel?: string;
      riskScore?: number;
      riskFlags?: string[];
      reasoning?: string;
    };

    return {
      moralityScore: Math.max(0, Math.min(100, parsed.moralityScore ?? 50)),
      factualityScore: parsed.factualityScore != null ? Math.max(0, Math.min(100, parsed.factualityScore)) : null,
      biasTilt: parsed.biasTilt ?? null,
      biasLabel: parsed.biasLabel ?? null,
      riskScore: Math.max(0, Math.min(100, parsed.riskScore ?? 0)),
      riskFlags: parsed.riskFlags ?? [],
      reasoning: parsed.reasoning ?? "Analysis unavailable.",
      scoredBy: result.provider,
    };
  } catch (err) {
    return {
      moralityScore: 50,
      factualityScore: null,
      biasTilt: null,
      biasLabel: null,
      riskScore: 0,
      riskFlags: [],
      reasoning: `Scoring failed: ${err instanceof Error ? err.message : "unknown"}`,
      scoredBy: "none",
    };
  }
}

async function scoreContract(scanResult: ChainScanResult): Promise<Partial<EntityScore>> {
  const systemPrompt = `You are a smart contract security auditor and the Morality Oracle. Analyze onchain data and return a risk assessment. Return ONLY valid JSON.`;

  const userPrompt = `Analyze this ${scanResult.chain} ${scanResult.entityType}:

Address: ${scanResult.identifier}
Chain: ${scanResult.chain}
Detected risk flags: ${scanResult.riskFlags.join(", ") || "none"}
Detected risk score: ${scanResult.riskScore}/100
Metadata: ${JSON.stringify(scanResult.metadata)}

Raw analysis:
${scanResult.rawSummary}

Return this exact JSON:
{
  "moralityScore": <0-100, higher=more trustworthy. Rug pulls/scams=0-20, legitimate protocols=70-100>,
  "riskScore": <0-100, 0=safe, 100=definite scam. Factor in the detected flags>,
  "riskFlags": [<refined list of flags — add any you infer, remove false positives>],
  "reasoning": "<2-3 sentence security assessment>"
}`;

  try {
    const result = await routerGenerate({
      tier: "fast",
      system: systemPrompt,
      user: userPrompt,
      maxTokens: 512,
      temperature: 0.2,
      timeoutMs: 15_000,
    });

    let json = result.text.trim();
    if (json.startsWith("```")) json = json.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");

    const parsed = JSON.parse(json) as {
      moralityScore?: number;
      riskScore?: number;
      riskFlags?: string[];
      reasoning?: string;
    };

    return {
      moralityScore: Math.max(0, Math.min(100, parsed.moralityScore ?? 50)),
      factualityScore: null,
      biasTilt: null,
      biasLabel: null,
      riskScore: Math.max(0, Math.min(100, parsed.riskScore ?? scanResult.riskScore)),
      riskFlags: parsed.riskFlags ?? scanResult.riskFlags,
      reasoning: parsed.reasoning ?? scanResult.rawSummary,
      scoredBy: result.provider,
      chain: scanResult.chain,
      metadata: scanResult.metadata as Record<string, unknown>,
    };
  } catch {
    // Fallback to raw scan results
    return {
      moralityScore: Math.max(0, 100 - scanResult.riskScore),
      factualityScore: null,
      biasTilt: null,
      biasLabel: null,
      riskScore: scanResult.riskScore,
      riskFlags: scanResult.riskFlags,
      reasoning: scanResult.rawSummary || "Contract analysis completed with limited data.",
      scoredBy: "chain-scanner",
      chain: scanResult.chain,
      metadata: scanResult.metadata as Record<string, unknown>,
    };
  }
}

// ============================================================================
// MAIN SCORER
// ============================================================================

/**
 * Score any entity — URL, domain, contract address, or wallet.
 * Fetches context, runs AI analysis, returns a complete score card.
 */
export async function scoreEntity(identifier: string): Promise<EntityScore> {
  const trimmed = identifier.trim();
  const entityHash = computeEntityHash(trimmed);

  // Detect entity type
  const chainDetect = detectChain(trimmed);
  const entityTypeRaw = detectEntityType(trimmed);

  // Contract/Address: scan chain first, then AI-score
  if (chainDetect) {
    const scanResult = await scanEntity(trimmed);
    if (scanResult) {
      const aiScore = await scoreContract(scanResult);
      return {
        identifier: trimmed,
        entityHash,
        entityType: scanResult.entityType === "token" ? "contract" : scanResult.entityType,
        chain: scanResult.chain,
        moralityScore: aiScore.moralityScore ?? 50,
        factualityScore: aiScore.factualityScore ?? null,
        biasTilt: aiScore.biasTilt ?? null,
        biasLabel: aiScore.biasLabel ?? null,
        riskScore: aiScore.riskScore ?? scanResult.riskScore,
        riskFlags: aiScore.riskFlags ?? scanResult.riskFlags,
        reasoning: aiScore.reasoning ?? "Analysis unavailable.",
        metadata: { ...scanResult.metadata, ...(aiScore.metadata ?? {}) },
        scoredBy: aiScore.scoredBy ?? "chain-scanner",
        scoredAt: Date.now(),
      };
    }
  }

  // URL: fetch content and score
  if (entityTypeRaw === EntityType.URL || trimmed.startsWith("http")) {
    const content = await fetchUrlContent(trimmed);
    const aiScore = await scoreUrlOrDomain(trimmed, content);
    return {
      identifier: trimmed,
      entityHash,
      entityType: "url",
      moralityScore: aiScore.moralityScore ?? 50,
      factualityScore: aiScore.factualityScore ?? null,
      biasTilt: aiScore.biasTilt ?? null,
      biasLabel: aiScore.biasLabel ?? null,
      riskScore: aiScore.riskScore ?? 0,
      riskFlags: aiScore.riskFlags ?? [],
      reasoning: aiScore.reasoning ?? "Analysis unavailable.",
      metadata: {},
      scoredBy: aiScore.scoredBy ?? "none",
      scoredAt: Date.now(),
    };
  }

  // Domain: score as content source
  if (entityTypeRaw === EntityType.DOMAIN || /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(trimmed)) {
    const content = await fetchUrlContent(`https://${trimmed}`);
    const aiScore = await scoreUrlOrDomain(trimmed, content);
    return {
      identifier: trimmed,
      entityHash,
      entityType: "domain",
      moralityScore: aiScore.moralityScore ?? 50,
      factualityScore: aiScore.factualityScore ?? null,
      biasTilt: aiScore.biasTilt ?? null,
      biasLabel: aiScore.biasLabel ?? null,
      riskScore: aiScore.riskScore ?? 0,
      riskFlags: aiScore.riskFlags ?? [],
      reasoning: aiScore.reasoning ?? "Analysis unavailable.",
      metadata: {},
      scoredBy: aiScore.scoredBy ?? "none",
      scoredAt: Date.now(),
    };
  }

  // Unknown type — best effort
  return {
    identifier: trimmed,
    entityHash,
    entityType: "address",
    moralityScore: 50,
    factualityScore: null,
    biasTilt: null,
    biasLabel: null,
    riskScore: 0,
    riskFlags: [],
    reasoning: "Entity type not recognized. Paste a URL, domain, or contract address.",
    metadata: {},
    scoredBy: "none",
    scoredAt: Date.now(),
  };
}
