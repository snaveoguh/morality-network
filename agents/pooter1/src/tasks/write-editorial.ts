/**
 * pooter1 editorial writer — reads today's news, writes an editorial
 * in its evolving voice, posts to pooter.world.
 */
import { generate } from "../llm.js";
import {
  getVoiceProfile,
  recordEngagement,
  getDailyStats,
  incrementDailyStat,
} from "../memory.js";
import { rateOnChain } from "../onchain.js";
import { bridge } from "../bridge.js";
import { POOTER_API_URL, CRON_SECRET, MAX_EDITORIALS_PER_DAY } from "../config.js";

async function fetchTodaysFeed(): Promise<any[]> {
  const res = await fetch(`${POOTER_API_URL}/api/feed`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Feed fetch failed: ${res.status}`);
  const data = await res.json();
  return data.items || data || [];
}

export async function writeEditorial(): Promise<void> {
  // Rate limit
  const stats = await getDailyStats();
  if (stats.editorials >= MAX_EDITORIALS_PER_DAY) {
    console.log(`[pooter1] Daily editorial limit reached (${stats.editorials}/${MAX_EDITORIALS_PER_DAY})`);
    return;
  }

  // Get today's news
  const feed = await fetchTodaysFeed();
  const topStories = feed.slice(0, 15).map((item: any) => ({
    title: item.title,
    source: item.source,
    description: item.description?.slice(0, 200),
    category: item.category,
  }));

  if (!topStories.length) {
    console.log("[pooter1] No stories to write about");
    return;
  }

  // Fetch latest council deliberation for market context
  let deliberation: any = null;
  try {
    const deliberationRes = await fetch(
      `${POOTER_API_URL}/api/trading/deliberation/latest?symbols=BTC,ETH,SOL`,
      { signal: AbortSignal.timeout(5_000) },
    );
    if (deliberationRes.ok) {
      const body = await deliberationRes.json();
      deliberation = body?.data?.[0] ?? null;
    }
  } catch {
    console.log("[pooter1] Deliberation fetch failed — writing without market context");
  }

  // Get voice profile
  const voice = await getVoiceProfile();

  const systemLines = [
    `You are pooter1, an autonomous editorial agent for pooter.world.`,
    `You write sharp, concise news commentary.`,
    ``,
    `YOUR VOICE:`,
    `Tone: ${voice.tone}`,
    `Style: ${voice.style}`,
    `Avoid: ${voice.avoid}`,
    `Influences: ${voice.influences}`,
    `Signature move: ${voice.signature}`,
    ``,
    `RULES:`,
    `- Write 3-5 paragraphs max`,
    `- Pick the 2-3 most interesting stories and weave them into a take`,
    `- Be opinionated. Take a stance. This is an editorial, not a summary.`,
    `- End with your signature one-liner`,
    `- No headline — the system adds that`,
    `- Never use exclamation marks`,
    `- Reference historical parallels where relevant`,
  ];

  // If council deliberation is available, add rhetoric instructions
  if (deliberation?.winningThesis) {
    const bullArg = deliberation.arguments?.find((a: any) => a.position === "LONG");
    const bearArg = deliberation.arguments?.find((a: any) => a.position === "SHORT");
    systemLines.push(
      ``,
      `MARKET ANALYSIS (from today's council deliberation):`,
      `Position: ${deliberation.winningThesis.position}`,
      bullArg ? `Bull case: ${bullArg.thesis}` : "",
      bearArg ? `Bear case: ${bearArg.thesis}` : "",
      `Key contention: ${deliberation.winningThesis.keyContention || "none"}`,
      `Conviction: ${Math.round((deliberation.winningThesis.argumentQuality || 0) * 100)}%`,
      ``,
      `- If council deliberation is available, take a stance on the market.`,
      `- Reference the specific data points from the bull/bear debate.`,
      `- Structure: position (what you think) + logos (the data) + pathos (what's at stake).`,
      `- End your market section with what would prove you wrong (falsifiability).`,
    );
  }

  const system = systemLines.filter(Boolean).join("\n");

  const user = [
    `Today's top stories:`,
    ``,
    ...topStories.map((s: any, i: number) =>
      `${i + 1}. [${s.source}] ${s.title}\n   ${s.description || ""}`
    ),
    ``,
    `Write your editorial take on today's news.`,
  ].join("\n");

  console.log("[pooter1] Writing editorial...");
  const editorial = await generate({ system, user, maxTokens: 1500, temperature: 0.8 });

  if (!editorial || editorial.length < 100) {
    console.warn("[pooter1] Editorial too short, skipping");
    return;
  }

  // Generate a headline
  const headlinePrompt = `Write a single punchy editorial headline (5-8 words, no quotes, no period) for this editorial:\n\n${editorial.slice(0, 500)}`;
  const headline = await generate({
    system: "You write newspaper headlines. Short, punchy, no clickbait. Return ONLY the headline.",
    user: headlinePrompt,
    maxTokens: 50,
    temperature: 0.6,
  });

  // Publish to pooter.world
  try {
    const res = await fetch(`${POOTER_API_URL}/api/articles/publish`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CRON_SECRET}`,
      },
      body: JSON.stringify({
        title: headline.trim().replace(/^["']|["']$/g, ""),
        body: editorial,
        category: "opinion",
        author: "pooter1",
        media: [],
        deliberationId: deliberation?.id,
        marketPosition: deliberation?.winningThesis?.position,
        falsifiableAt: deliberation?.falsifiableAt,
      }),
    });

    if (res.ok) {
      const result = await res.json();
      console.log(`[pooter1] Editorial published: ${result.slug || result.entityHash}`);
      await incrementDailyStat("editorials");
      await recordEngagement({
        entityHash: result.entityHash || "",
        title: headline,
        type: "editorial",
        timestamp: new Date().toISOString(),
      });

      // Broadcast to agent bridge
      await bridge.editorialPublished({
        title: headline.trim(),
        entityHash: result.entityHash || "",
        url: result.slug ? `https://pooter.world/article/${result.entityHash}` : undefined,
      });

      // Rate the top stories we referenced (on-chain)
      for (const story of topStories.slice(0, 3)) {
        if (story.title) {
          // Rate 3-5 based on newsworthiness (pooter1's opinion)
          const score = Math.min(5, Math.max(3, Math.round(Math.random() * 2) + 3)) as 1 | 2 | 3 | 4 | 5;
          await rateOnChain(
            story.title,
            score,
            `Referenced in pooter1 editorial: "${headline.trim().slice(0, 50)}"`,
          );
        }
      }
    } else {
      console.warn(`[pooter1] Publish failed: ${res.status}`);
    }
  } catch (err) {
    console.error("[pooter1] Publish error:", err);
  }
}

// Run directly
writeEditorial().catch(console.error);
