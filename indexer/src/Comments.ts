import { ponder } from "@/generated";
import { entity, comment, commentVote, feedItem } from "../ponder.schema";

ponder.on("MoralityComments:CommentCreated", async ({ event, context }) => {
  const { db } = context;

  await db.insert(comment).values({
    id: event.args.commentId,
    entityId: event.args.entityHash,
    author: event.args.author,
    parentId: event.args.parentId,
    score: 0,
    tipTotal: 0n,
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  }).onConflictDoNothing();

  // Update entity comment count
  await db.update(entity, { id: event.args.entityHash }).set((row) => ({
    commentCount: (row.commentCount ?? 0) + 1,
    lastActivity: event.block.timestamp,
  }));

  // Feed item
  await db.insert(feedItem).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    entityId: event.args.entityHash,
    actor: event.args.author,
    actionType: 1, // comment
    data: JSON.stringify({ commentId: event.args.commentId.toString(), parentId: event.args.parentId.toString() }),
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  }).onConflictDoNothing();
});

ponder.on("MoralityComments:CommentVoted", async ({ event, context }) => {
  const { db } = context;
  const voteId = `${event.args.commentId}-${event.args.voter}`;

  // Upsert vote
  await db.insert(commentVote).values({
    id: voteId,
    commentId: event.args.commentId,
    voter: event.args.voter,
    vote: event.args.vote,
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  }).onConflictDoUpdate({
    vote: event.args.vote,
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  });

  // Update comment score
  await db.update(comment, { id: event.args.commentId }).set((row) => ({
    score: (row.score ?? 0) + event.args.vote,
  }));

  // Feed item
  await db.insert(feedItem).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    entityId: "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`, // unknown entity from vote
    actor: event.args.voter,
    actionType: 4, // vote
    data: JSON.stringify({ commentId: event.args.commentId.toString(), vote: event.args.vote }),
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  }).onConflictDoNothing();
});
