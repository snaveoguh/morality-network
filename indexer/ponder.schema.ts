import { onchainTable, index, relations } from "@ponder/core";

// ============================================================================
// ENTITIES — Universal entity registry
// ============================================================================

export const entity = onchainTable("entity", (t) => ({
  id: t.hex().primaryKey(),            // entityHash (bytes32)
  identifier: t.text().notNull(),       // original URL/address/domain
  entityType: t.integer().notNull(),    // 0=URL, 1=DOMAIN, 2=ADDRESS, 3=CONTRACT
  registeredBy: t.hex().notNull(),
  owner: t.hex(),
  avgRating: t.integer().default(0),    // average * 100 (2 decimal precision)
  ratingCount: t.integer().default(0),
  commentCount: t.integer().default(0),
  tipTotal: t.bigint().default(0n),
  aiScore: t.integer().default(0),
  firstSeen: t.bigint().notNull(),      // block timestamp
  lastActivity: t.bigint().notNull(),
}), (table) => ({
  typeIdx: index().on(table.entityType),
  ownerIdx: index().on(table.owner),
  lastActivityIdx: index().on(table.lastActivity),
}));

// ============================================================================
// RATINGS — Individual user ratings
// ============================================================================

export const rating = onchainTable("rating", (t) => ({
  id: t.text().primaryKey(),            // `${entityHash}-${rater}`
  entityId: t.hex().notNull(),
  rater: t.hex().notNull(),
  score: t.integer().notNull(),
  reason: t.text(),
  timestamp: t.bigint().notNull(),
  txHash: t.hex().notNull(),
}), (table) => ({
  entityIdx: index().on(table.entityId),
  raterIdx: index().on(table.rater),
  timestampIdx: index().on(table.timestamp),
}));

// ============================================================================
// COMMENTS — Threaded onchain comments
// ============================================================================

export const comment = onchainTable("comment", (t) => ({
  id: t.bigint().primaryKey(),          // commentId from contract
  entityId: t.hex().notNull(),
  author: t.hex().notNull(),
  parentId: t.bigint().default(0n),
  score: t.integer().default(0),        // net upvotes - downvotes
  tipTotal: t.bigint().default(0n),
  timestamp: t.bigint().notNull(),
  txHash: t.hex().notNull(),
}), (table) => ({
  entityIdx: index().on(table.entityId),
  authorIdx: index().on(table.author),
  parentIdx: index().on(table.parentId),
  timestampIdx: index().on(table.timestamp),
}));

// ============================================================================
// TIPS — Individual tip records
// ============================================================================

export const tip = onchainTable("tip", (t) => ({
  id: t.text().primaryKey(),            // txHash-logIndex
  entityId: t.hex().notNull(),
  tipper: t.hex().notNull(),
  recipient: t.hex(),                   // null if escrowed
  amount: t.bigint().notNull(),
  commentId: t.bigint(),                // null if entity tip
  isEscrowed: t.boolean().default(false),
  timestamp: t.bigint().notNull(),
  txHash: t.hex().notNull(),
}), (table) => ({
  entityIdx: index().on(table.entityId),
  tipperIdx: index().on(table.tipper),
  timestampIdx: index().on(table.timestamp),
}));

// ============================================================================
// FEED ITEMS — Denormalized activity feed for fast querying
// ============================================================================

export const feedItem = onchainTable("feed_item", (t) => ({
  id: t.text().primaryKey(),            // txHash-logIndex
  entityId: t.hex().notNull(),
  actor: t.hex().notNull(),
  actionType: t.integer().notNull(),    // 0=rate, 1=comment, 2=tip, 3=rateWithReason, 4=vote
  data: t.text(),                       // JSON metadata
  timestamp: t.bigint().notNull(),
  txHash: t.hex().notNull(),
}), (table) => ({
  entityIdx: index().on(table.entityId),
  actorIdx: index().on(table.actor),
  actionTypeIdx: index().on(table.actionType),
  timestampIdx: index().on(table.timestamp),
}));

// ============================================================================
// COMMENT VOTES — Track individual votes on comments
// ============================================================================

export const commentVote = onchainTable("comment_vote", (t) => ({
  id: t.text().primaryKey(),            // `${commentId}-${voter}`
  commentId: t.bigint().notNull(),
  voter: t.hex().notNull(),
  vote: t.integer().notNull(),          // 1 or -1
  timestamp: t.bigint().notNull(),
  txHash: t.hex().notNull(),
}), (table) => ({
  commentIdx: index().on(table.commentId),
  voterIdx: index().on(table.voter),
}));

// ============================================================================
// SCANNER LAUNCHES — Persistent token scanner output (offchain ingestion)
// ============================================================================

export const scannerLaunch = onchainTable("scanner_launch", (t) => ({
  id: t.hex().primaryKey(),             // pool address (or token address fallback)
  tokenAddress: t.hex().notNull(),
  poolAddress: t.hex().notNull(),
  pairedAsset: t.hex().notNull(),
  dex: t.text().notNull(),              // "uniswap-v3" | "aerodrome"
  source: t.text().notNull(),           // "dexscreener-search" | ...
  score: t.integer().default(0),
  tokenSymbol: t.text(),
  tokenName: t.text(),
  priceUsd: t.text(),
  liquidityUsd: t.integer().default(0),
  volume24h: t.integer().default(0),
  txns24h: t.integer().default(0),
  pairUrl: t.text(),
  pairCreatedAt: t.bigint(),
  discoveredAt: t.bigint().notNull(),
  updatedAt: t.bigint().notNull(),
  enriched: t.boolean().default(false),
}), (table) => ({
  tokenIdx: index().on(table.tokenAddress),
  scoreIdx: index().on(table.score),
  discoveredIdx: index().on(table.discoveredAt),
  updatedIdx: index().on(table.updatedAt),
}));

// ============================================================================
// RELATIONS
// ============================================================================

export const entityRelations = relations(entity, ({ many }) => ({
  ratings: many(rating),
  comments: many(comment),
  tips: many(tip),
  feedItems: many(feedItem),
}));

export const ratingRelations = relations(rating, ({ one }) => ({
  entity: one(entity, { fields: [rating.entityId], references: [entity.id] }),
}));

export const commentRelations = relations(comment, ({ one }) => ({
  entity: one(entity, { fields: [comment.entityId], references: [entity.id] }),
}));

export const tipRelations = relations(tip, ({ one }) => ({
  entity: one(entity, { fields: [tip.entityId], references: [entity.id] }),
}));

export const feedItemRelations = relations(feedItem, ({ one }) => ({
  entity: one(entity, { fields: [feedItem.entityId], references: [entity.id] }),
}));
