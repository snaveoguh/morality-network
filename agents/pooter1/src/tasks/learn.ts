/**
 * pooter1 self-learning — analyzes engagement data and feedback
 * to evolve its voice profile. Runs weekly.
 *
 * Learning signals:
 * 1. Which editorials got the most ratings/tips/comments
 * 2. Direct feedback from comments on pooter1's articles
 * 3. What high-reputation users are saying
 *
 * Output: Updated voice profile stored in Redis.
 */
import { generate } from "../llm.js";
import {
  getVoiceProfile,
  saveVoiceProfile,
  getRecentEngagement,
  getRecentFeedback,
} from "../memory.js";

export async function learn(): Promise<void> {
  console.log("[pooter1] Starting self-learning cycle...");

  const voice = await getVoiceProfile();
  const engagement = await getRecentEngagement(50);
  const feedback = await getRecentFeedback(50);

  if (!engagement.length && !feedback.length) {
    console.log("[pooter1] No engagement data yet — skipping learning cycle");
    return;
  }

  // Summarize engagement
  const editorials = engagement.filter((e) => e.type === "editorial");
  const topEditorials = editorials
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 5);

  // Summarize feedback
  const positiveFeedback = feedback.filter((f) => f.sentiment === "positive");
  const negativeFeedback = feedback.filter((f) => f.sentiment === "negative");

  const system = [
    `You are the self-improvement module for pooter1, an autonomous editorial AI agent.`,
    `Your job is to analyze engagement data and feedback, then recommend changes to the voice profile.`,
    ``,
    `Current voice profile:`,
    `- Tone: ${voice.tone}`,
    `- Style: ${voice.style}`,
    `- Avoid: ${voice.avoid}`,
    `- Influences: ${voice.influences}`,
    `- Signature: ${voice.signature}`,
    ``,
    `RULES:`,
    `- Evolve gradually — small adjustments, not wholesale changes`,
    `- Weight feedback from users who have rated/tipped highly (they're engaged)`,
    `- If something is working, keep it. If something isn't, adjust.`,
    `- Never lose the core voice — just refine it`,
    `- Output ONLY valid JSON matching the profile structure`,
  ].join("\n");

  const user = [
    `ENGAGEMENT DATA (last 7 days):`,
    `- Total editorials: ${editorials.length}`,
    `- Top performing editorials:`,
    ...topEditorials.map((e, i) =>
      `  ${i + 1}. "${e.title}" — score: ${e.score || "N/A"}, tips: ${e.tips || 0}, comments: ${e.commentCount || 0}`
    ),
    ``,
    `POSITIVE FEEDBACK (${positiveFeedback.length} items):`,
    ...positiveFeedback.slice(0, 10).map((f) =>
      `- "${f.content.slice(0, 100)}" (from ${f.from.slice(0, 10)}...)`
    ),
    ``,
    `NEGATIVE FEEDBACK (${negativeFeedback.length} items):`,
    ...negativeFeedback.slice(0, 10).map((f) =>
      `- "${f.content.slice(0, 100)}" (from ${f.from.slice(0, 10)}...)`
    ),
    ``,
    `Based on this data, output an updated voice profile as JSON with these fields:`,
    `{ "tone", "style", "avoid", "influences", "signature", "topPerformers" }`,
    `topPerformers should list the titles of your best-performing pieces.`,
  ].join("\n");

  try {
    const result = await generate({ system, user, maxTokens: 1000, temperature: 0.4 });

    // Parse the JSON from the response
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn("[pooter1] Learning cycle returned no valid JSON");
      return;
    }

    const updated = JSON.parse(jsonMatch[0]);

    const newProfile = {
      tone: updated.tone || voice.tone,
      style: updated.style || voice.style,
      avoid: updated.avoid || voice.avoid,
      influences: updated.influences || voice.influences,
      signature: updated.signature || voice.signature,
      updatedAt: new Date().toISOString(),
      version: voice.version + 1,
      topPerformers: updated.topPerformers || voice.topPerformers,
    };

    await saveVoiceProfile(newProfile);
    console.log(`[pooter1] Voice profile updated to v${newProfile.version}`);
    console.log(`[pooter1] Tone: ${newProfile.tone}`);
    console.log(`[pooter1] Style: ${newProfile.style}`);
  } catch (err) {
    console.error("[pooter1] Learning cycle failed:", err);
  }
}

// Run directly
learn().catch(console.error);
