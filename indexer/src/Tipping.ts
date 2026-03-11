import { ponder } from "@/generated";
import { entity, comment, tip, feedItem } from "../ponder.schema";
import { ensureEntityRow } from "./entity-utils";

ponder.on("MoralityTipping:TipSent", async ({ event, context }) => {
  const { db } = context;

  await ensureEntityRow(db, event.args.entityHash, event.block.timestamp);

  await db.insert(tip).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    entityId: event.args.entityHash,
    tipper: event.args.tipper,
    recipient: event.args.recipient,
    amount: event.args.amount,
    isEscrowed: false,
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  }).onConflictDoNothing();

  // Update entity tip total
  await db.update(entity, { id: event.args.entityHash }).set((row) => ({
    tipTotal: (row.tipTotal ?? 0n) + event.args.amount,
    lastActivity: event.block.timestamp,
  }));

  // Feed item
  await db.insert(feedItem).values({
    id: `feed-${event.transaction.hash}-${event.log.logIndex}`,
    entityId: event.args.entityHash,
    actor: event.args.tipper,
    actionType: 2, // tip
    data: JSON.stringify({ amount: event.args.amount.toString(), recipient: event.args.recipient }),
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  }).onConflictDoNothing();
});

ponder.on("MoralityTipping:TipEscrowed", async ({ event, context }) => {
  const { db } = context;

  await ensureEntityRow(db, event.args.entityHash, event.block.timestamp);

  await db.insert(tip).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    entityId: event.args.entityHash,
    tipper: event.args.tipper,
    amount: event.args.amount,
    isEscrowed: true,
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  }).onConflictDoNothing();

  await db.update(entity, { id: event.args.entityHash }).set((row) => ({
    tipTotal: (row.tipTotal ?? 0n) + event.args.amount,
    lastActivity: event.block.timestamp,
  }));
});

ponder.on("MoralityTipping:CommentTipped", async ({ event, context }) => {
  const { db } = context;

  await db.insert(tip).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    entityId: "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`,
    tipper: event.args.tipper,
    recipient: event.args.author,
    amount: event.args.amount,
    commentId: event.args.commentId,
    isEscrowed: false,
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  }).onConflictDoNothing();

  // Update comment tip total
  try {
    await db.update(comment, { id: event.args.commentId }).set((row) => ({
      tipTotal: (row.tipTotal ?? 0n) + event.args.amount,
    }));
  } catch (error) {
    console.warn("[indexer] tip for missing comment", {
      commentId: event.args.commentId.toString(),
      txHash: event.transaction.hash,
      error,
    });
  }
});

ponder.on("MoralityTipping:EscrowClaimed", async ({ event, context }) => {
  const { db } = context;
  await ensureEntityRow(db, event.args.entityHash, event.block.timestamp);
  await db.update(entity, { id: event.args.entityHash }).set({
    owner: event.args.owner,
    lastActivity: event.block.timestamp,
  });
});
