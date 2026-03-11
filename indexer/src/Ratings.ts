import { ponder } from "@/generated";
import { entity, rating, feedItem } from "../ponder.schema";
import { ensureEntityRow } from "./entity-utils";

ponder.on("MoralityRatings:Rated", async ({ event, context }) => {
  const { db } = context;
  const ratingId = `${event.args.entityHash}-${event.args.rater}`;

  await ensureEntityRow(db, event.args.entityHash, event.block.timestamp);

  // Upsert rating
  await db.insert(rating).values({
    id: ratingId,
    entityId: event.args.entityHash,
    rater: event.args.rater,
    score: event.args.score,
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  }).onConflictDoUpdate({
    score: event.args.score,
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  });

  // Update entity stats
  await db.update(entity, { id: event.args.entityHash }).set((row) => ({
    ratingCount: (row.ratingCount ?? 0) + 1,
    lastActivity: event.block.timestamp,
  }));

  // Feed item
  await db.insert(feedItem).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    entityId: event.args.entityHash,
    actor: event.args.rater,
    actionType: 0, // rate
    data: JSON.stringify({ score: event.args.score }),
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  }).onConflictDoNothing();
});

ponder.on("MoralityRatings:RatedWithReason", async ({ event, context }) => {
  const { db } = context;
  const ratingId = `${event.args.entityHash}-${event.args.rater}`;

  await ensureEntityRow(db, event.args.entityHash, event.block.timestamp);

  await db.insert(rating).values({
    id: ratingId,
    entityId: event.args.entityHash,
    rater: event.args.rater,
    score: event.args.score,
    reason: event.args.reason,
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  }).onConflictDoUpdate({
    score: event.args.score,
    reason: event.args.reason,
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  });

  await db.update(entity, { id: event.args.entityHash }).set((row) => ({
    ratingCount: (row.ratingCount ?? 0) + 1,
    lastActivity: event.block.timestamp,
  }));

  await db.insert(feedItem).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    entityId: event.args.entityHash,
    actor: event.args.rater,
    actionType: 3, // rateWithReason
    data: JSON.stringify({ score: event.args.score, reason: event.args.reason }),
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  }).onConflictDoNothing();
});

ponder.on("MoralityRatings:RatingUpdated", async ({ event, context }) => {
  const { db } = context;
  const ratingId = `${event.args.entityHash}-${event.args.rater}`;

  await ensureEntityRow(db, event.args.entityHash, event.block.timestamp);

  await db.insert(rating).values({
    id: ratingId,
    entityId: event.args.entityHash,
    rater: event.args.rater,
    score: event.args.newScore,
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  }).onConflictDoUpdate({
    score: event.args.newScore,
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  });

  await db.update(entity, { id: event.args.entityHash }).set({
    lastActivity: event.block.timestamp,
  });
});

ponder.on("MoralityRatings:RatingWithReasonUpdated", async ({ event, context }) => {
  const { db } = context;
  const ratingId = `${event.args.entityHash}-${event.args.rater}`;

  await ensureEntityRow(db, event.args.entityHash, event.block.timestamp);

  await db.insert(rating).values({
    id: ratingId,
    entityId: event.args.entityHash,
    rater: event.args.rater,
    score: event.args.newScore,
    reason: event.args.reason,
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  }).onConflictDoUpdate({
    score: event.args.newScore,
    reason: event.args.reason,
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  });

  await db.update(entity, { id: event.args.entityHash }).set({
    lastActivity: event.block.timestamp,
  });
});
