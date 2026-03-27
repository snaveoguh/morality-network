/**
 * pooter1 farcaster-digest — monitors Farcaster for alpha, extracts
 * signals, and feeds intelligence back to pooter.world.
 *
 * Runs 3x/day via cron. Read-only — no posting.
 */
import { generate } from "../llm.js";
import {
  fetchTrendingCasts,
  fetchChannelFeed,
  dedupeAndRank,
  engagementScore,
  type Cast,
} from "../farcaster.js";
import { getVoiceProfile, getDailyStats, incrementDailyStat } from "../memory.js";
import { bridge } from "../bridge.js";
import { entityHash } from "../onchain.js";
import {
  POOTER_API_URL,
  MAX_FARCASTER_DIGESTS_PER_DAY,
} from "../config.js";
import { redisSet } from "../memory.js";

// ── Channels to monitor ──────────────────────────────────────────────

const CHANNELS = ["base", "crypto", "farcaster", "degen", "nouns"];

// ── Main Task ────────────────────────────────────────────────────────

export async function farcasterDigest(): Promise<void> {
  const stats = await getDailyStats();
  if ((stats as any).farcasterDigests >= MAX_FARCASTER_DIGESTS_PER_DAY) {
    console.log(`[pooter1] Daily Farcaster digest limit reached`);
    return;
  }

  console.log(`[pooter1] Starting Farcaster digest...`);

  // 1. Fetch trending + channel feeds in parallel
  const [trending, ...channelFeeds] = await Promise.all([
    fetchTrendingCasts(15),
    ...CHANNELS.map((ch) => fetchChannelFeed(ch, 15)),
  ]);

  const allCasts = [...trending, ...channelFeeds.flat()];
  const topCasts = dedupeAndRank(allCasts, 12);

  if (topCasts.length === 0) {
    console.log(`[pooter1] No notable Farcaster activity found`);
    return;
  }

  console.log(`[pooter1] Found ${topCasts.length} notable casts from ${allCasts.length} total`);

  // 2. Push entity context for casts with embedded URLs
  await pushCastEntityContext(topCasts);

  // 3. Ask LLM to extract intelligence
  const digest = await extractIntelligence(topCasts);
  if (!digest) {
    console.log(`[pooter1] LLM failed to extract digest`);
    return;
  }

  // 4. Publish emerging events to bridge
  for (const event of digest.events || []) {
    if (event.urgency === "medium" || event.urgency === "high") {
      await bridge.emergingEvent({
        headline: event.headline,
        sources: [`farcaster`],
        urgency: event.urgency,
      });
    }
  }

  // 5. Store digest in Redis for the learn task
  const today = new Date().toISOString().slice(0, 10);
  await redisSet(
    `pooter1:farcaster-digest:${today}:${Date.now()}`,
    JSON.stringify({
      ...digest,
      castCount: topCasts.length,
      channels: CHANNELS,
      timestamp: new Date().toISOString(),
    }),
    172800, // 48h TTL
  );

  await incrementDailyStat("farcasterDigests" as any);

  console.log(
    `[pooter1] Farcaster digest complete: ${digest.topics?.length || 0} topics, ` +
    `${digest.signals?.length || 0} signals, ${digest.events?.length || 0} events`,
  );
}

// ── LLM Intelligence Extraction ──────────────────────────────────────

interface DigestResult {
  topics: string[];
  signals: { asset: string; direction: string; confidence: number; claim: string }[];
  events: { headline: string; urgency: "low" | "medium" | "high" }[];
  summary: string;
}

async function extractIntelligence(casts: Cast[]): Promise<DigestResult | null> {
  const voice = await getVoiceProfile();

  const castSummaries = casts.map((c, i) => {
    const score = engagementScore(c);
    const embedUrls = c.embeds
      .filter((e) => e.url)
      .map((e) => e.metadata?.title || e.url)
      .join(", ");
    return `${i + 1}. @${c.author.username} (${score} engagement${c.channel ? `, /${c.channel}` : ""}): "${c.text.slice(0, 200)}"${embedUrls ? ` [links: ${embedUrls}]` : ""}`;
  }).join("\n");

  const system = [
    `You are pooter1's intelligence module. Analyze Farcaster casts and extract structured signals.`,
    `Your perspective: ${voice.tone}`,
    `Reply with ONLY valid JSON. No reasoning, no preamble, no XML tags.`,
  ].join("\n");

  const user = [
    `Analyze these trending Farcaster casts:`,
    ``,
    castSummaries,
    ``,
    `Extract and return JSON with this exact structure:`,
    `{`,
    `  "topics": ["topic1", "topic2", ...],`,
    `  "signals": [{"asset": "BTC", "direction": "bullish|bearish", "confidence": 0.0-1.0, "claim": "why"}],`,
    `  "events": [{"headline": "...", "urgency": "low|medium|high"}],`,
    `  "summary": "2-3 sentence digest of what Farcaster is talking about"`,
    `}`,
    ``,
    `Rules:`,
    `- Only include signals for assets that are explicitly or clearly discussed`,
    `- Confidence should reflect how many casts + engagement support the signal`,
    `- Events are noteworthy happenings — launches, hacks, governance, drama`,
    `- Summary should be sharp and opinionated (your voice)`,
  ].join("\n");

  try {
    const raw = await generate({ system, user, maxTokens: 800, temperature: 0.4 });
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);
  } catch (err: any) {
    console.warn(`[pooter1] Digest LLM parse failed: ${err.message}`);
    return null;
  }
}

// ── Entity Context Push ──────────────────────────────────────────────

async function pushCastEntityContext(casts: Cast[]): Promise<void> {
  for (const cast of casts) {
    for (const embed of cast.embeds) {
      if (!embed.url || !embed.metadata?.title) continue;
      try {
        const hash = entityHash(embed.url);
        await fetch(`${POOTER_API_URL}/api/entity-context`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            hash,
            title: embed.metadata.title,
            description: embed.metadata.description?.slice(0, 500),
            source: `Farcaster (@${cast.author.username})`,
            type: "article",
            url: embed.url,
            imageUrl: embed.metadata.image,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }),
          signal: AbortSignal.timeout(5_000),
        });
      } catch {
        // Non-critical
      }
    }
  }
}

// Run directly if invoked as script
const isDirectRun = process.argv[1]?.includes("farcaster-digest");
if (isDirectRun) farcasterDigest().catch(console.error);
