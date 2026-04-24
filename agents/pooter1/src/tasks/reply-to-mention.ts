/**
 * pooter1 mention scanner — polls onchain comments for @pooter mentions,
 * generates context-aware replies, and posts them as threaded comments.
 */
import { generate } from "../llm.js";
import {
  getVoiceProfile,
  getDailyStats,
  incrementDailyStat,
  recordEngagement,
  getMentionCursor,
  setMentionCursor,
  hasRepliedToComment,
  markCommentReplied,
} from "../memory.js";
import {
  commentOnChain,
  getAgentAddress,
  getEthBalance,
  getNextCommentId,
  getCommentById,
  getCommentThread,
  entityHash,
  type OnchainComment,
} from "../onchain.js";
import { bridge } from "../bridge.js";
import {
  POOTER_API_URL,
  MAX_MENTION_REPLIES_PER_DAY,
  MENTION_SCAN_LOOKBACK,
} from "../config.js";

const MIN_BALANCE_WEI = 500_000_000_000_000n; // 0.0005 ETH
const MENTION_PATTERN = /@pooter\b/i;

/** Fetch entity context from pooter.world for richer replies. */
async function fetchEntityContext(
  eHash: string,
): Promise<{ title: string; source: string; summary: string } | null> {
  try {
    const res = await fetch(
      `${POOTER_API_URL}/api/entity-context?hash=${encodeURIComponent(eHash)}`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return {
      title: data.title || "Unknown",
      source: data.source || "Unknown",
      summary: (data.description || "").slice(0, 500),
    };
  } catch {
    return null;
  }
}

/** Format a comment for the LLM prompt. */
function formatComment(c: OnchainComment): string {
  const addr = `${c.author.slice(0, 6)}...${c.author.slice(-4)}`;
  return `[${addr}]: ${c.content}`;
}

/** Build the identifier string for an entity hash (needed by commentOnChain). */
async function resolveIdentifier(eHash: string): Promise<string> {
  // Try to get the original identifier from entity-context
  try {
    const res = await fetch(
      `${POOTER_API_URL}/api/entity-context?hash=${encodeURIComponent(eHash)}`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (res.ok) {
      const data = await res.json();
      if (data.url) return data.url;
      if (data.identifier) return data.identifier;
    }
  } catch {
    // fall through
  }
  // Fallback: use the hash directly as identifier
  // (commentOnChain hashes it again, so this won't match — but we can
  // pass the entityHash directly to the contract via a raw call)
  return eHash;
}

export async function scanAndReplyToMentions(): Promise<void> {
  const stats = await getDailyStats();
  if (stats.replies >= MAX_MENTION_REPLIES_PER_DAY) {
    console.log(
      `[pooter1:mentions] Daily reply limit reached (${stats.replies}/${MAX_MENTION_REPLIES_PER_DAY})`,
    );
    return;
  }

  const balance = await getEthBalance();
  if (balance !== null && balance < MIN_BALANCE_WEI) {
    console.warn(`[pooter1:mentions] ETH balance too low for replies (${balance} wei)`);
    return;
  }

  const agentAddr = getAgentAddress()?.toLowerCase();
  const nextId = await getNextCommentId();
  if (nextId === 0n) {
    console.log("[pooter1:mentions] Could not read nextCommentId — skipping");
    return;
  }

  let cursor = await getMentionCursor();

  // On first run or if cursor is way behind, don't scan the entire history
  if (cursor === 0n || nextId - cursor > BigInt(MENTION_SCAN_LOOKBACK)) {
    cursor = nextId - BigInt(MENTION_SCAN_LOOKBACK);
    if (cursor < 1n) cursor = 1n;
    console.log(`[pooter1:mentions] Clamping cursor to ${cursor} (lookback ${MENTION_SCAN_LOOKBACK})`);
  }

  console.log(`[pooter1:mentions] Scanning comments ${cursor} → ${nextId}`);

  let repliesThisRun = 0;
  const MAX_REPLIES_PER_RUN = 5;

  for (let id = cursor; id < nextId; id++) {
    if (repliesThisRun >= MAX_REPLIES_PER_RUN) break;
    if (stats.replies >= MAX_MENTION_REPLIES_PER_DAY) break;

    const comment = await getCommentById(id);
    if (!comment) continue;

    // Skip own comments
    if (agentAddr && comment.author.toLowerCase() === agentAddr) continue;

    // Check for @pooter mention
    if (!MENTION_PATTERN.test(comment.content)) continue;

    // Dedup: already replied?
    if (await hasRepliedToComment(comment.id)) continue;

    console.log(
      `[pooter1:mentions] Found mention in comment #${comment.id} by ${comment.author.slice(0, 10)}...`,
    );

    try {
      await replyToComment(comment);
      repliesThisRun++;
      stats.replies++;
    } catch (err: any) {
      console.warn(
        `[pooter1:mentions] Reply failed for comment #${comment.id}: ${err.message}`,
      );
    }
  }

  // Always advance cursor, even if no mentions found
  await setMentionCursor(nextId);
  console.log(
    `[pooter1:mentions] Done — ${repliesThisRun} replies, cursor now ${nextId}`,
  );
}

async function replyToComment(mention: OnchainComment): Promise<void> {
  const voice = await getVoiceProfile();

  // Gather conversation thread for context (up to 5 parent comments)
  const thread = await getCommentThread(mention.parentId, 5);

  // Fetch entity context (article title, source, summary)
  const entityCtx = await fetchEntityContext(mention.entityHash);

  // Resolve identifier for posting the reply
  const identifier = await resolveIdentifier(mention.entityHash);

  // Build LLM prompt
  const system = [
    `You are pooter1, an autonomous onchain agent replying to a user who mentioned you in a comment thread.`,
    `Your tone: ${voice.tone}`,
    `Your style: ${voice.style}`,
    `Avoid: ${voice.avoid}`,
    ``,
    `Core principles:`,
    `- Never fabricate facts, quotes, or sources.`,
    `- Surface contradictions rather than smoothing them over.`,
    `- If asked about markets or trading, share your perspective but note uncertainty.`,
    `- Be conversational but keep your editorial voice.`,
    `- Address the user's point directly. Don't dodge.`,
    ``,
    `Reply with ONLY the comment text. 1-4 sentences. No preamble, no XML tags.`,
  ].join("\n");

  const userParts: string[] = [];

  if (entityCtx) {
    userParts.push(
      `Article: "${entityCtx.title}"`,
      `Source: ${entityCtx.source}`,
      entityCtx.summary ? `Summary: ${entityCtx.summary}` : "",
      "",
    );
  }

  if (thread.length > 0) {
    userParts.push("Thread context (oldest first):");
    for (const c of thread) {
      userParts.push(formatComment(c));
    }
    userParts.push("");
  }

  userParts.push(
    `The comment mentioning you:`,
    formatComment(mention),
    "",
    "Reply to this mention.",
  );

  const reply = await generate({
    system,
    user: userParts.filter(Boolean).join("\n"),
    maxTokens: 500,
    temperature: 0.8,
  });

  if (!reply || reply.length < 10) {
    console.warn("[pooter1:mentions] LLM returned empty/short reply — skipping");
    return;
  }

  // Post threaded reply onchain (parentId = the mentioning comment's ID)
  const txHash = await commentOnChain(identifier, reply, mention.id);

  console.log(
    `[pooter1:mentions] Replied to #${mention.id}: "${reply.slice(0, 80)}..." ${txHash ? `(tx: ${txHash.slice(0, 12)}...)` : "(off-chain)"}`,
  );

  // Track everything
  await markCommentReplied(mention.id);
  await incrementDailyStat("replies");
  await recordEngagement({
    entityHash: mention.entityHash,
    title: `Reply to mention #${mention.id}`,
    type: "comment",
    timestamp: new Date().toISOString(),
  });
  await bridge.entityCommented({
    identifier,
    comment: reply.slice(0, 200),
    txHash: txHash || undefined,
  });
}
