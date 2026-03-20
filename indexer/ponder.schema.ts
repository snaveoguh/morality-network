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
// ARTICLE ARCHIVE — Durable feed archive formerly stored in web-local JSON
// ============================================================================

export const articleArchive = onchainTable("article_archive", (t) => ({
  id: t.hex().primaryKey(),             // entity hash derived from link
  feedItemId: t.text().notNull(),
  title: t.text().notNull(),
  link: t.text().notNull(),
  description: t.text().notNull(),
  pubDate: t.text().notNull(),
  source: t.text().notNull(),
  sourceUrl: t.text().notNull(),
  category: t.text().notNull(),
  imageUrl: t.text(),
  biasJson: t.text(),
  tagsJson: t.text(),
  canonicalClaim: t.text(),
  preservedLinksJson: t.text(),
  firstSeenAt: t.text().notNull(),
  lastSeenAt: t.text().notNull(),
  seenCount: t.integer().default(1),
  archivedAt: t.text().notNull(),
}), (table) => ({
  sourceIdx: index().on(table.source),
  categoryIdx: index().on(table.category),
  pubDateIdx: index().on(table.pubDate),
  lastSeenIdx: index().on(table.lastSeenAt),
}));

// ============================================================================
// EDITORIAL ARCHIVE — Durable editorial payloads and market-impact records
// ============================================================================

export const editorialArchive = onchainTable("editorial_archive", (t) => ({
  id: t.hex().primaryKey(),             // entity hash
  generatedAt: t.text().notNull(),
  generatedBy: t.text().notNull(),
  contentHash: t.hex().notNull(),
  version: t.integer().notNull(),
  claim: t.text().notNull(),
  dailyTitle: t.text(),
  onchainTxHash: t.hex(),
  onchainTimestamp: t.text(),
  hasMarketImpact: t.boolean().default(false),
  marketImpactJson: t.text(),
  payloadJson: t.text().notNull(),
}), (table) => ({
  generatedIdx: index().on(table.generatedAt),
  versionIdx: index().on(table.version),
  marketImpactIdx: index().on(table.hasMarketImpact),
}));

// ============================================================================
// SWARM STATE — Latest persisted research swarm snapshot from the worker
// ============================================================================

export const swarmState = onchainTable("swarm_state", (t) => ({
  id: t.text().primaryKey(),            // "latest"
  generatedAt: t.text().notNull(),
  scannedItems: t.integer().default(0),
  clustersJson: t.text().notNull(),
  contradictionFlagsJson: t.text().notNull(),
  updatedAt: t.bigint().notNull(),
}), (table) => ({
  updatedIdx: index().on(table.updatedAt),
}));

// ============================================================================
// TRADER STATE — Latest persisted trader execution snapshot from the worker
// ============================================================================

export const traderState = onchainTable("trader_state", (t) => ({
  id: t.text().primaryKey(),            // "latest"
  executionMode: t.text().notNull(),
  configJson: t.text().notNull(),
  primaryReportJson: t.text(),
  parallelReportsJson: t.text().notNull(),
  primaryReadinessJson: t.text(),
  parallelReadinessJson: t.text().notNull(),
  primaryPerformanceJson: t.text(),
  parallelPerformanceJson: t.text().notNull(),
  primaryPositionsJson: t.text().notNull(),
  parallelPositionsJson: t.text().notNull(),
  updatedAt: t.bigint().notNull(),
}), (table) => ({
  updatedIdx: index().on(table.updatedAt),
  modeIdx: index().on(table.executionMode),
}));

// ============================================================================
// AGENT EVENTS — Durable cross-runtime swarm event log
// ============================================================================

export const agentEvent = onchainTable("agent_event", (t) => ({
  id: t.text().primaryKey(),
  fromAgent: t.text().notNull(),
  toAgent: t.text().notNull(),
  topic: t.text().notNull(),
  payloadJson: t.text().notNull(),
  metaJson: t.text(),
  source: t.text().notNull(),
  timestampMs: t.bigint().notNull(),
  persistedAt: t.bigint().notNull(),
}), (table) => ({
  topicIdx: index().on(table.topic),
  fromIdx: index().on(table.fromAgent),
  toIdx: index().on(table.toAgent),
  timestampIdx: index().on(table.timestampMs),
  persistedIdx: index().on(table.persistedAt),
}));

// ============================================================================
// AGENT CONSUMER CURSORS — Durable offsets for relays/stream consumers
// ============================================================================

export const agentConsumerCursor = onchainTable("agent_consumer_cursor", (t) => ({
  id: t.text().primaryKey(),
  consumer: t.text().notNull(),
  lastEventId: t.text(),
  lastTimestampMs: t.bigint().notNull(),
  updatedAt: t.bigint().notNull(),
}), (table) => ({
  consumerIdx: index().on(table.consumer),
  timestampIdx: index().on(table.lastTimestampMs),
  updatedIdx: index().on(table.updatedAt),
}));

// ============================================================================
// AI INVOCATIONS — Durable AI provider telemetry
// ============================================================================

export const aiInvocation = onchainTable("ai_invocation", (t) => ({
  id: t.text().primaryKey(),
  task: t.text().notNull(),
  provider: t.text().notNull(),
  model: t.text().notNull(),
  status: t.text().notNull(),
  inputTokens: t.integer().default(0),
  outputTokens: t.integer().default(0),
  totalTokens: t.integer().default(0),
  latencyMs: t.integer().default(0),
  estimatedCostMicrousd: t.bigint().default(0n),
  error: t.text(),
  metaJson: t.text(),
  createdAt: t.bigint().notNull(),
}), (table) => ({
  taskIdx: index().on(table.task),
  providerIdx: index().on(table.provider),
  modelIdx: index().on(table.model),
  statusIdx: index().on(table.status),
  createdIdx: index().on(table.createdAt),
}));

// ============================================================================
// AGENT MEMORY — Persistent key/value memory for agent learning + recall
// ============================================================================

export const agentMemory = onchainTable("agent_memory", (t) => ({
  key: t.text().primaryKey(),
  scope: t.text().notNull(),
  content: t.text().notNull(),
  createdAt: t.bigint().notNull(),
  updatedAt: t.bigint().notNull(),
}), (table) => ({
  scopeIdx: index().on(table.scope),
  updatedIdx: index().on(table.updatedAt),
}));

// ============================================================================
// MARKETPLACE ORDERS — Seaport 1.6 NFT marketplace (Nouns + PEPE)
// ============================================================================

export const marketplaceOrder = onchainTable("marketplace_order", (t) => ({
  id: t.text().primaryKey(),               // orderHash (offerer-salt-token-tokenId)
  tokenContract: t.text().notNull(),       // NFT contract address
  tokenId: t.text().notNull(),             // Token ID
  maker: t.text().notNull(),               // Seller address
  priceWei: t.text().notNull(),            // Price in wei (text for BigInt safety)
  expiresAt: t.bigint().notNull(),         // Unix timestamp expiration
  status: t.text().notNull(),              // ACTIVE | FILLED | CANCELLED | EXPIRED
  orderJson: t.text().notNull(),           // Full Seaport order JSON (needed for fulfillment)
  signature: t.text().notNull(),           // EIP-712 signature
  collection: t.text().notNull(),          // 'nouns' | 'emblem-vault-legacy' | 'emblem-vault-curated'
  taker: t.text(),                         // Buyer address (filled on purchase)
  txHash: t.text(),                        // Fill/cancel tx hash
  createdAt: t.bigint().notNull(),         // Unix timestamp
}), (table) => ({
  tokenIdx: index().on(table.tokenContract, table.tokenId),
  makerIdx: index().on(table.maker),
  collectionIdx: index().on(table.collection),
  statusIdx: index().on(table.status),
  expiresIdx: index().on(table.expiresAt),
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
