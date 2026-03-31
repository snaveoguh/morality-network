/**
 * pooter1 commenter — reads today's articles, leaves comments on
 * the most interesting ones. Uses the pooter.world API.
 */
import { generate } from "../llm.js";
import {
  getVoiceProfile,
  getDailyStats,
  incrementDailyStat,
  recordEngagement,
  getRecentEngagement,
} from "../memory.js";
import { commentOnChain, entityHash, getEthBalance } from "../onchain.js";
import { bridge } from "../bridge.js";
import { POOTER_API_URL, CRON_SECRET, MAX_COMMENTS_PER_DAY } from "../config.js";

/** Minimum ETH balance to attempt on-chain comments (0.0005 ETH) */
const MIN_BALANCE_WEI = 500_000_000_000_000n; // 0.0005 ETH
/** Max comments per cron run */
const COMMENTS_PER_RUN = 3;

/** Push article metadata to pooter.world so entity pages have context */
async function pushEntityContext(article: any, identifier: string): Promise<void> {
  try {
    const hash = entityHash(identifier);
    await fetch(`${POOTER_API_URL}/api/entity-context`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hash,
        title: article.title,
        description: article.description?.slice(0, 500),
        source: article.source || "Unknown",
        type: "article",
        url: article.link,
        imageUrl: article.imageUrl,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // Non-critical — entity page will just lack metadata
  }
}

async function fetchTodaysFeed(): Promise<any[]> {
  try {
    console.log(`[pooter1] Fetching feed from ${POOTER_API_URL}/api/feed`);
    const res = await fetch(`${POOTER_API_URL}/api/feed`, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      console.warn(`[pooter1] Feed returned ${res.status}`);
      return [];
    }
    const data = await res.json();
    const items = data.items || data || [];
    console.log(`[pooter1] Feed returned ${items.length} items`);
    return items;
  } catch (err: any) {
    console.error(`[pooter1] Feed fetch failed: ${err.message}`);
    return [];
  }
}

export async function commentOnArticles(): Promise<void> {
  const stats = await getDailyStats();
  if (stats.comments >= MAX_COMMENTS_PER_DAY) {
    console.log(`[pooter1] Daily comment limit reached (${stats.comments}/${MAX_COMMENTS_PER_DAY})`);
    return;
  }

  // Gas balance check — skip on-chain if wallet is too low
  const balance = await getEthBalance();
  if (balance !== null && balance < MIN_BALANCE_WEI) {
    console.warn(`[pooter1] ETH balance too low for on-chain comments (${balance} wei). Top up the agent wallet.`);
    return;
  }

  const feed = await fetchTodaysFeed();
  const voice = await getVoiceProfile();

  // Dedup: get recently commented entity hashes to skip
  const recentEngagement = await getRecentEngagement(100);
  const alreadyCommented = new Set(
    recentEngagement
      .filter((e) => e.type === "comment")
      .map((e) => e.entityHash),
  );

  // Pick up to COMMENTS_PER_RUN articles we haven't commented on yet
  const toComment = feed
    .filter((item: any) => {
      if (!item.title || !item.description) return false;
      const identifier = item.link || item.title;
      const hash = entityHash(identifier);
      if (alreadyCommented.has(hash)) {
        console.log(`[pooter1] Skipping already-commented: "${item.title.slice(0, 50)}"`);
        return false;
      }
      return true;
    })
    .slice(0, COMMENTS_PER_RUN);

  for (const article of toComment) {
    if (stats.comments >= MAX_COMMENTS_PER_DAY) break;

    const system = [
      `You are pooter1, commenting on a news article.`,
      `Your tone: ${voice.tone}`,
      `Your style: ${voice.style}`,
      `Keep comments to 1-3 sentences. Be insightful, not verbose.`,
      `Never start with "I think" or "This is interesting".`,
      `Add value — connect to other events, challenge assumptions, or highlight what's missing from the coverage.`,
      `Reply with ONLY the comment text. No reasoning, no preamble, no XML tags.`,
    ].join("\n");

    const user = [
      `Article: "${article.title}"`,
      `Source: ${article.source}`,
      `Summary: ${article.description?.slice(0, 300)}`,
      ``,
      `Write a brief, sharp comment.`,
    ].join("\n");

    try {
      const comment = await generate({ system, user, maxTokens: 500, temperature: 0.8 });

      if (!comment || comment.length < 20) continue;

      // Post comment on-chain via Base L2
      const identifier = article.link || article.title;
      const hash = entityHash(identifier);
      const txHash = await commentOnChain(identifier, comment);
      console.log(`[pooter1] Comment on "${article.title.slice(0, 50)}": ${comment.slice(0, 80)}... ${txHash ? `(tx: ${txHash.slice(0, 12)}...)` : "(off-chain)"}`);

      // Push article metadata so entity pages have context
      await pushEntityContext(article, identifier);

      // Broadcast to agent bridge
      await bridge.entityCommented({
        identifier: identifier,
        comment: comment.slice(0, 200),
        txHash: txHash || undefined,
      });

      await incrementDailyStat("comments");
      await recordEngagement({
        entityHash: hash,
        title: article.title,
        type: "comment",
        timestamp: new Date().toISOString(),
      });

      stats.comments++;
    } catch (err) {
      console.warn(`[pooter1] Comment failed for "${article.title.slice(0, 40)}":`, err);
    }
  }

  console.log(`[pooter1] Commented on ${stats.comments} articles today`);
}

// Run directly
commentOnArticles().catch(console.error);
