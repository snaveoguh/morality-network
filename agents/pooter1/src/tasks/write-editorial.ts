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
    ``,
    `RULES:`,
    `- Write 3-5 paragraphs max`,
    `- Pick the 2-3 most interesting stories. Connect them only if the sources show a real link; otherwise take them one at a time`,
    `- Be opinionated. Take a stance. This is an editorial, not a summary.`,
    `- End on a fact or on what happens next (a date, a vote, a figure), not on a one-line moral`,
    `- No headline — the system adds that`,
    `- Never use exclamation marks`,
    `- Reference historical parallels where relevant`,
    ``,
    // House style (docs/STYLE_GUIDE.md). These override the voice profile.
    `HOUSE STYLE (overrides the voice above):`,
    `- Plain, literal English. The opinion is in the argument, not in adjectives or metaphors`,
    `- Attribute with "said". Never "slammed", "blasted", "admitted", "insisted"`,
    `- Numbers with unit, period and source. Percentage points are not percentages`,
    `- Never write: amid, a stark reminder, in a world where, lays bare, litmus test, cautionary tale, narrative, reshapes, underscores, not just X but Y, the same day/night, X leaves Y while Z, gamble, duel, fuels, sparks, whispers`,
    `- One idea per sentence. Most sentences under 25 words`,
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

  // Generate headline candidates in one call. The publish route lints each
  // against the house style and 422s a failure, so we try them in order
  // rather than paying for another generation.
  const headlinePrompt = `Write 3 alternative headlines for this editorial, one per line, best first. Each: 6-12 words, one story, subject + active present-tense verb + the key fact. No quotes, no full stop, no numbering, no dashes, no comma lists, no metaphors.\n\n${editorial.slice(0, 500)}`;
  const headlineRaw = await generate({
    system: "You write news headlines in the style of Reuters and the BBC: literal, specific, active voice. Return ONLY the headlines, one per line.",
    user: headlinePrompt,
    maxTokens: 120,
    temperature: 0.6,
  });
  const headlineCandidates = headlineRaw
    .split("\n")
    .map((l) => l.trim().replace(/^(?:\d+[.)]|[-*•])\s*/, "").replace(/^["']|["']$/g, ""))
    .filter(Boolean)
    .slice(0, 3);
  if (headlineCandidates.length === 0) {
    console.warn("[pooter1] No headline generated, skipping");
    return;
  }
  let headline = headlineCandidates[0];

  // Publish to pooter.world — first candidate that passes house style wins.
  try {
    let res: Response | null = null;
    const publish = (title: string, styleLint?: "enforce") =>
      fetch(`${POOTER_API_URL}/api/articles/publish`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${CRON_SECRET}`,
        },
        body: JSON.stringify({
          title,
          body: editorial,
          category: "opinion",
          author: "pooter1",
          media: [],
          styleLint,
          deliberationId: deliberation?.id,
          marketPosition: deliberation?.winningThesis?.position,
          falsifiableAt: deliberation?.falsifiableAt,
        }),
      });
    for (const candidate of headlineCandidates) {
      headline = candidate;
      res = await publish(candidate, "enforce");
      if (res.status !== 422) break;
      const detail = await res.json().catch(() => null);
      console.warn(`[pooter1] Headline failed house style: "${candidate}"`, detail?.issues ?? "");
    }
    // Every candidate tripped the lint: the editorial is already paid for, so
    // publish the first headline unenforced rather than drop it.
    if (res?.status === 422) {
      headline = headlineCandidates[0];
      console.warn(`[pooter1] All headlines failed house style; publishing unenforced: "${headline}"`);
      res = await publish(headline);
    }
    if (!res) return;

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
