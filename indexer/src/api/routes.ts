import { and, desc, eq, gte, graphql, inArray, lte, lt } from "@ponder/core";
import { keccak256, toBytes } from "viem";
import { ponder } from "@/generated";
import {
  agentConsumerCursor,
  agentEvent,
  agentMemory,
  aiInvocation,
  articleArchive,
  editorialArchive,
  entity,
  feedItem,
  marketplaceOrder,
  scannerLaunch,
  swarmState,
  traderState,
} from "../../ponder.schema";
import { fetchCanonicalClaimFromSource } from "../claim-extract";
import {
  CLAIM_SOURCE_KINDS,
  DELIBERATION_SCHEMA_VERSION,
  INTERPRETATION_KINDS,
  OUTCOME_STATES,
  buildCanonicalDeliberationGraph,
} from "../types/deliberation";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const MAX_ARCHIVE_LIMIT = 100_000;
const ZERO_ENTITY_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";
const DEXSCREENER_SEARCH_API = "https://api.dexscreener.com/latest/dex/search/?q=";
const KNOWN_QUOTE_TOKENS = new Set([
  "0x4200000000000000000000000000000000000006", // WETH
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", // USDC
  "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca", // USDbC
  "0x50c5725949a6f0c72e6c4a641f24049a917db0cb", // DAI
  "0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22", // cbETH
  "0xc1cba3fcea344f92d9239c08c0568f6f2f0ee452", // wstETH
]);
const WORKER_STATE_ROW_ID = "latest";

function hasWorkerWriteAccess(authHeader: string | null | undefined): boolean {
  const secret = process.env.INDEXER_WORKER_SECRET?.trim();
  if (!secret) {
    // Fail CLOSED — block all writes if secret is not configured.
    console.error("[indexer] INDEXER_WORKER_SECRET not set — rejecting write request");
    return false;
  }
  return authHeader?.trim() === `Bearer ${secret}`;
}

function requireWorkerAccess(c: {
  req: { header: (name: string) => string | null | undefined };
  json: (body: unknown, status?: number) => unknown;
}) {
  if (!hasWorkerWriteAccess(c.req.header("authorization"))) {
    return c.json({ error: "unauthorized" }, 401);
  }
  return null;
}

function parseLimit(value: string | undefined): number {
  const parsed = Number(value ?? DEFAULT_LIMIT);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(parsed), MAX_LIMIT);
}

function parseArchiveLimit(value: string | undefined, fallbackValue = MAX_ARCHIVE_LIMIT): number {
  const parsed = Number(value ?? fallbackValue);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallbackValue;
  return Math.min(Math.floor(parsed), MAX_ARCHIVE_LIMIT);
}

function parseTimestamp(value: string | undefined): bigint | undefined {
  if (!value) return undefined;
  if (!/^\d+$/.test(value)) return undefined;
  try {
    return BigInt(value);
  } catch {
    return undefined;
  }
}

function parseEntityHash(value: string | undefined): `0x${string}` | undefined {
  if (!value) return undefined;
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) return undefined;
  return value.toLowerCase() as `0x${string}`;
}

function parseAddress(value: string | undefined): `0x${string}` | undefined {
  if (!value) return undefined;
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) return undefined;
  return value.toLowerCase() as `0x${string}`;
}

function parseActionTypes(value: string | undefined): number[] | undefined {
  if (!value) return undefined;
  const parts = value.split(",").map((v) => Number(v.trim()));
  if (parts.length === 0 || parts.some((v) => !Number.isInteger(v))) return undefined;

  const unique = Array.from(new Set(parts));
  if (unique.some((v) => v < 0 || v > 4)) return undefined;
  return unique;
}

function parseEntityType(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 3) return undefined;
  return parsed;
}

function parseMinScore(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, Math.floor(parsed)));
}

function parseScannerDex(value: string | undefined): "uniswap-v3" | "aerodrome" | undefined {
  if (!value) return undefined;
  if (value === "uniswap-v3" || value === "aerodrome") return value;
  return undefined;
}

function parseTopics(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const topics = value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  if (topics.length === 0) return undefined;
  return Array.from(new Set(topics));
}

function parseSortDirection(value: string | undefined): "asc" | "desc" {
  return value === "asc" ? "asc" : "desc";
}

function parseAddressLoose(value: unknown): `0x${string}` | undefined {
  if (typeof value !== "string") return undefined;
  return parseAddress(value);
}

function normalizeDex(raw: string | undefined): "uniswap-v3" | "aerodrome" {
  const lower = (raw ?? "").toLowerCase();
  if (lower.includes("aero")) return "aerodrome";
  if (lower.includes("uni")) return "uniswap-v3";
  return "uniswap-v3";
}

function safeNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function parseText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function parseOptionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function safeJsonParse<T>(value: string | null | undefined, fallbackValue: T): T {
  if (!value) return fallbackValue;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallbackValue;
  }
}

function isHexHash(value: unknown): value is `0x${string}` {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
}

function computeEntityHash(identifier: string): `0x${string}` {
  return keccak256(toBytes(identifier));
}

function scorePair(input: {
  liquidityUsd: number;
  volume24h: number;
  txns24h: number;
  ageMinutes: number;
}): number {
  let score = 0;

  const liq = input.liquidityUsd;
  if (liq >= 250_000) score += 40;
  else if (liq >= 100_000) score += 30;
  else if (liq >= 50_000) score += 20;
  else if (liq >= 10_000) score += 10;
  else if (liq >= 1_000) score += 5;

  const vol = input.volume24h;
  if (vol >= 1_000_000) score += 30;
  else if (vol >= 250_000) score += 20;
  else if (vol >= 50_000) score += 12;
  else if (vol >= 10_000) score += 6;
  else if (vol >= 1_000) score += 3;

  const txns = input.txns24h;
  if (txns >= 1_000) score += 20;
  else if (txns >= 400) score += 14;
  else if (txns >= 100) score += 8;
  else if (txns >= 30) score += 4;

  const ageMinutes = input.ageMinutes;
  if (ageMinutes >= 24 * 60) score += 10;
  else if (ageMinutes >= 6 * 60) score += 7;
  else if (ageMinutes >= 60) score += 4;
  else if (ageMinutes >= 15) score += 2;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function serializeEntityRow(row: typeof entity.$inferSelect) {
  return {
    entityHash: row.id,
    identifier: row.identifier,
    entityType: row.entityType,
    registeredBy: row.registeredBy,
    owner: row.owner,
    avgRating: row.avgRating ?? 0,
    ratingCount: row.ratingCount ?? 0,
    commentCount: row.commentCount ?? 0,
    tipTotal: (row.tipTotal ?? 0n).toString(),
    aiScore: row.aiScore ?? 0,
    firstSeen: row.firstSeen.toString(),
    lastActivity: row.lastActivity.toString(),
  };
}

function actionTypeName(actionType: number): string {
  switch (actionType) {
    case 0:
      return "rate";
    case 1:
      return "comment";
    case 2:
      return "tip";
    case 3:
      return "rateWithReason";
    case 4:
      return "vote";
    default:
      return "unknown";
  }
}

function serializeFeedRow(
  row: typeof feedItem.$inferSelect,
  entityRow?: typeof entity.$inferSelect,
) {
  return {
    id: row.id,
    entityHash: row.entityId,
    actor: row.actor,
    actionType: row.actionType,
    action: actionTypeName(row.actionType),
    data: row.data,
    timestamp: row.timestamp.toString(),
    txHash: row.txHash,
    entity: entityRow ? serializeEntityRow(entityRow) : null,
  };
}

function serializeScannerLaunch(row: typeof scannerLaunch.$inferSelect) {
  return {
    id: row.id,
    tokenAddress: row.tokenAddress,
    poolAddress: row.poolAddress,
    pairedAsset: row.pairedAsset,
    dex: row.dex,
    source: row.source,
    score: row.score ?? 0,
    tokenMeta: {
      name: row.tokenName ?? undefined,
      symbol: row.tokenSymbol ?? undefined,
    },
    dexScreenerData: {
      priceUsd: row.priceUsd ?? null,
      liquidity: { usd: row.liquidityUsd ?? 0 },
      volume24h: row.volume24h ?? 0,
      pairUrl: row.pairUrl ?? null,
    },
    discoveredAt: Number(row.discoveredAt),
    updatedAt: Number(row.updatedAt),
    enriched: row.enriched ?? false,
  };
}

function serializeArticleArchiveRow(row: typeof articleArchive.$inferSelect) {
  return {
    hash: row.id,
    id: row.feedItemId,
    title: row.title,
    link: row.link,
    description: row.description,
    pubDate: row.pubDate,
    source: row.source,
    sourceUrl: row.sourceUrl,
    category: row.category,
    imageUrl: row.imageUrl ?? undefined,
    bias: safeJsonParse(row.biasJson, null as unknown),
    tags: safeJsonParse(row.tagsJson, [] as string[]),
    canonicalClaim: row.canonicalClaim ?? undefined,
    preservedLinks: safeJsonParse(row.preservedLinksJson, [] as string[]),
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt,
    seenCount: row.seenCount ?? 1,
    archivedAt: row.archivedAt,
  };
}

function computeEditorialContentHash(editorial: Record<string, unknown>): `0x${string}` {
  const primary = (editorial.primary ?? {}) as Record<string, unknown>;
  const payload = JSON.stringify({
    claim: parseText(editorial.claim),
    subheadline: parseText(editorial.subheadline),
    editorialBody: Array.isArray(editorial.editorialBody) ? editorial.editorialBody : [],
    wireSummary: editorial.wireSummary ?? null,
    biasContext: editorial.biasContext ?? null,
    tags: parseStringArray(editorial.tags),
    primaryTitle: parseText(primary.title),
    primaryLink: parseText(primary.link),
    marketImpact: editorial.marketImpact ?? null,
  });

  return keccak256(toBytes(payload));
}

function serializeEditorialArchiveRow(row: typeof editorialArchive.$inferSelect) {
  return safeJsonParse(row.payloadJson, {
    entityHash: row.id,
    generatedAt: row.generatedAt,
    generatedBy: row.generatedBy,
    contentHash: row.contentHash,
    version: row.version,
    claim: row.claim,
    dailyTitle: row.dailyTitle ?? undefined,
    onchainTxHash: row.onchainTxHash ?? undefined,
    onchainTimestamp: row.onchainTimestamp ?? undefined,
  });
}

function serializeSwarmStateRow(row: typeof swarmState.$inferSelect) {
  return {
    generatedAt: row.generatedAt,
    scannedItems: row.scannedItems ?? 0,
    clusters: safeJsonParse(row.clustersJson, [] as unknown[]),
    contradictionFlags: safeJsonParse(row.contradictionFlagsJson, [] as unknown[]),
    updatedAt: Number(row.updatedAt),
  };
}

function serializeTraderStateRow(row: typeof traderState.$inferSelect) {
  return {
    executionMode: row.executionMode,
    config: safeJsonParse(row.configJson, null as unknown),
    report: safeJsonParse(row.primaryReportJson, null as unknown),
    parallel: safeJsonParse(row.parallelReportsJson, [] as unknown[]),
    readiness: safeJsonParse(row.primaryReadinessJson, null as unknown),
    parallelReadiness: safeJsonParse(row.parallelReadinessJson, [] as unknown[]),
    performance: safeJsonParse(row.primaryPerformanceJson, null as unknown),
    parallelPerformance: safeJsonParse(row.parallelPerformanceJson, [] as unknown[]),
    positions: safeJsonParse(row.primaryPositionsJson, [] as unknown[]),
    parallelPositions: safeJsonParse(row.parallelPositionsJson, [] as unknown[]),
    updatedAt: Number(row.updatedAt),
  };
}

function serializeAgentEventRow(row: typeof agentEvent.$inferSelect) {
  return {
    id: row.id,
    from: row.fromAgent,
    to: row.toAgent,
    topic: row.topic,
    payload: safeJsonParse(row.payloadJson, null as unknown),
    meta: safeJsonParse(row.metaJson, undefined as unknown),
    source: row.source,
    timestamp: Number(row.timestampMs),
    persistedAt: Number(row.persistedAt),
  };
}

function serializeAgentConsumerCursorRow(row: typeof agentConsumerCursor.$inferSelect) {
  return {
    id: row.id,
    consumer: row.consumer,
    lastEventId: row.lastEventId ?? null,
    lastTimestampMs: Number(row.lastTimestampMs),
    updatedAt: Number(row.updatedAt),
  };
}

function serializeAIInvocationRow(row: typeof aiInvocation.$inferSelect) {
  return {
    id: row.id,
    task: row.task,
    provider: row.provider,
    model: row.model,
    status: row.status,
    inputTokens: row.inputTokens ?? 0,
    outputTokens: row.outputTokens ?? 0,
    totalTokens: row.totalTokens ?? 0,
    latencyMs: row.latencyMs ?? 0,
    estimatedCostMicrousd: Number(row.estimatedCostMicrousd ?? 0n),
    estimatedCostUsd: Number(row.estimatedCostMicrousd ?? 0n) / 1_000_000,
    error: row.error ?? null,
    meta: safeJsonParse(row.metaJson, undefined as unknown),
    createdAt: Number(row.createdAt),
  };
}

function computeAgentEventId(message: {
  id?: unknown;
  from: string;
  to: string;
  topic: string;
  timestamp: number;
  payload: unknown;
}): string {
  if (typeof message.id === "string" && message.id.trim().length > 0) {
    return message.id.trim();
  }

  return keccak256(
    toBytes(
      JSON.stringify({
        from: message.from,
        to: message.to,
        topic: message.topic,
        timestamp: message.timestamp,
        payload: message.payload ?? null,
      }),
    ),
  );
}

type AgentEventInput = {
  id: string;
  from: string;
  to: string;
  topic: string;
  payload: unknown;
  meta?: unknown;
  timestamp: number;
};

type AIInvocationInput = {
  id: string;
  task: string;
  provider: string;
  model: string;
  status: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
  estimatedCostMicrousd: bigint;
  error: string | null;
  meta?: unknown;
  createdAt: number;
};

function normalizeAgentEventInput(value: unknown): AgentEventInput | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const from = parseText(input.from).trim();
  const to = parseText(input.to, "*").trim() || "*";
  const topic = parseText(input.topic).trim();
  const timestamp = Math.max(0, Math.floor(safeNumber(input.timestamp, Date.now())));
  if (!from || !topic) return null;

  return {
    id: computeAgentEventId({
      id: input.id,
      from,
      to,
      topic,
      timestamp,
      payload: input.payload ?? null,
    }),
    from,
    to,
    topic,
    payload: input.payload ?? null,
    meta: input.meta,
    timestamp,
  };
}

function normalizeAIInvocationInput(value: unknown): AIInvocationInput | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const task = parseText(input.task).trim();
  const provider = parseText(input.provider).trim().toLowerCase();
  const model = parseText(input.model).trim();
  const status = parseText(input.status, "success").trim().toLowerCase();
  const createdAt = Math.max(0, Math.floor(safeNumber(input.createdAt, Date.now())));
  if (!task || !provider || !model || !status) return null;

  const inputTokens = Math.max(0, Math.floor(safeNumber(input.inputTokens, 0)));
  const outputTokens = Math.max(0, Math.floor(safeNumber(input.outputTokens, 0)));
  const totalTokens = Math.max(
    0,
    Math.floor(safeNumber(input.totalTokens, inputTokens + outputTokens)),
  );
  const latencyMs = Math.max(0, Math.floor(safeNumber(input.latencyMs, 0)));
  const estimatedCostMicrousd = BigInt(
    Math.max(0, Math.floor(safeNumber(input.estimatedCostMicrousd, 0))),
  );
  const error = parseOptionalText(input.error);

  return {
    id:
      parseOptionalText(input.id) ??
      keccak256(
        toBytes(
          JSON.stringify({
            task,
            provider,
            model,
            status,
            createdAt,
            totalTokens,
            latencyMs,
          }),
        ),
      ),
    task,
    provider,
    model,
    status,
    inputTokens,
    outputTokens,
    totalTokens,
    latencyMs,
    estimatedCostMicrousd,
    error,
    meta: input.meta,
    createdAt,
  };
}

async function persistAgentEvents(
  c: any,
  messages: AgentEventInput[],
  source: string,
): Promise<typeof agentEvent.$inferSelect[]> {
  const persistedAt = BigInt(Date.now());
  const rows: typeof agentEvent.$inferSelect[] = [];

  for (const message of messages) {
    const existing = await c.db
      .select()
      .from(agentEvent)
      .where(eq(agentEvent.id, message.id))
      .limit(1);

    if (existing[0]) {
      rows.push(existing[0]);
      continue;
    }

    const values = {
      id: message.id,
      fromAgent: message.from,
      toAgent: message.to,
      topic: message.topic,
      payloadJson: JSON.stringify(message.payload ?? null),
      metaJson: message.meta === undefined ? null : JSON.stringify(message.meta),
      source,
      timestampMs: BigInt(message.timestamp),
      persistedAt,
    };

    await c.db.insert(agentEvent).values(values);
    rows.push(values);
  }

  return rows;
}

async function persistAIInvocation(
  c: any,
  invocation: AIInvocationInput,
): Promise<typeof aiInvocation.$inferSelect> {
  const existing = await c.db
    .select()
    .from(aiInvocation)
    .where(eq(aiInvocation.id, invocation.id))
    .limit(1);

  if (existing[0]) {
    return existing[0];
  }

  const values = {
    id: invocation.id,
    task: invocation.task,
    provider: invocation.provider,
    model: invocation.model,
    status: invocation.status,
    inputTokens: invocation.inputTokens,
    outputTokens: invocation.outputTokens,
    totalTokens: invocation.totalTokens,
    latencyMs: invocation.latencyMs,
    estimatedCostMicrousd: invocation.estimatedCostMicrousd,
    error: invocation.error,
    metaJson: invocation.meta === undefined ? null : JSON.stringify(invocation.meta),
    createdAt: BigInt(invocation.createdAt),
  };

  await c.db.insert(aiInvocation).values(values);
  return values;
}

function normalizeArchivedArticleInput(
  value: unknown,
  nowIso: string,
): ReturnType<typeof serializeArticleArchiveRow> | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const link = parseText(input.link).trim();
  const title = parseText(input.title).trim();
  if (!link || !title) return null;

  const hash = computeEntityHash(link);
  const tags = parseStringArray(input.tags);
  const preservedLinks = parseStringArray(input.preservedLinks);
  const canonicalClaim =
    parseOptionalText(input.canonicalClaim) ??
    (title.endsWith(".") ? title : `${title}.`);

  return {
    hash,
    id: parseText(input.id, hash),
    title,
    link,
    description: parseText(input.description),
    pubDate: parseText(input.pubDate, nowIso),
    source: parseText(input.source, "Recovered Source"),
    sourceUrl: parseText(input.sourceUrl),
    category: parseText(input.category, "Archive"),
    imageUrl: parseOptionalText(input.imageUrl) ?? undefined,
    bias: input.bias ?? null,
    tags,
    canonicalClaim,
    preservedLinks,
    firstSeenAt: nowIso,
    lastSeenAt: nowIso,
    seenCount: 1,
    archivedAt: nowIso,
  };
}

async function upsertArticleArchiveRow(
  c: any,
  record: ReturnType<typeof serializeArticleArchiveRow>,
): Promise<"inserted" | "updated"> {
  const existing = await c.db
    .select()
    .from(articleArchive)
    .where(eq(articleArchive.id, record.hash))
    .limit(1);

  const row = existing[0];
  if (!row) {
    await c.db.insert(articleArchive).values({
      id: record.hash,
      feedItemId: record.id,
      title: record.title,
      link: record.link,
      description: record.description,
      pubDate: record.pubDate,
      source: record.source,
      sourceUrl: record.sourceUrl,
      category: record.category,
      imageUrl: record.imageUrl ?? null,
      biasJson: record.bias ? JSON.stringify(record.bias) : null,
      tagsJson: JSON.stringify(record.tags ?? []),
      canonicalClaim: record.canonicalClaim ?? null,
      preservedLinksJson: JSON.stringify(record.preservedLinks ?? []),
      firstSeenAt: record.firstSeenAt,
      lastSeenAt: record.lastSeenAt,
      seenCount: record.seenCount ?? 1,
      archivedAt: record.archivedAt,
    });
    return "inserted";
  }

  // --- Only update if there's actually new/better data ---
  const newCanonicalClaim =
    row.canonicalClaim && row.canonicalClaim !== "Claim unavailable."
      ? null // already good, no change
      : (record.canonicalClaim && record.canonicalClaim !== "Claim unavailable." ? record.canonicalClaim : null);

  const newBias = record.bias && !row.biasJson ? JSON.stringify(record.bias) : null;
  const newDescription = !row.description && record.description ? record.description : null;
  const newImageUrl = !row.imageUrl && record.imageUrl ? record.imageUrl : null;

  const hasNewData = !!(newCanonicalClaim || newBias || newDescription || newImageUrl);

  if (!hasNewData) {
    // Nothing meaningful changed — skip the DB write entirely.
    // This prevents Ponder reorg table bloat from no-op updates.
    return "updated";
  }

  const canonicalClaim = newCanonicalClaim ?? row.canonicalClaim ?? null;

  await c.db
    .update(articleArchive, { id: record.hash })
    .set({
      feedItemId: record.id || row.feedItemId,
      title: record.title || row.title,
      link: record.link,
      description: newDescription ?? row.description,
      pubDate: record.pubDate || row.pubDate,
      source: record.source || row.source,
      sourceUrl: record.sourceUrl || row.sourceUrl,
      category: record.category || row.category,
      imageUrl: newImageUrl ?? row.imageUrl,
      biasJson: newBias ?? row.biasJson,
      tagsJson: JSON.stringify(record.tags ?? safeJsonParse(row.tagsJson, [] as string[])),
      canonicalClaim,
      preservedLinksJson: JSON.stringify(
        record.preservedLinks ?? safeJsonParse(row.preservedLinksJson, [] as string[]),
      ),
      firstSeenAt: row.firstSeenAt,
      lastSeenAt: record.lastSeenAt,
      seenCount: (row.seenCount ?? 1) + 1,
      archivedAt: row.archivedAt,
    });

  return "updated";
}

function normalizeGeneratedBy(value: unknown): "claude-ai" | "template-fallback" {
  return value === "claude-ai" ? "claude-ai" : "template-fallback";
}

async function upsertEditorialArchiveRow(
  c: any,
  hash: `0x${string}`,
  editorial: Record<string, unknown>,
  generatedByRaw: unknown,
): Promise<Record<string, unknown>> {
  const nowIso = new Date().toISOString();
  const generatedBy = normalizeGeneratedBy(generatedByRaw);
  const contentHash = computeEditorialContentHash(editorial);

  const existing = await c.db
    .select()
    .from(editorialArchive)
    .where(eq(editorialArchive.id, hash))
    .limit(1);

  const row = existing[0];
  const version = row ? (row.version ?? 0) + 1 : 1;
  const hasMarketImpact =
    Boolean(editorial.marketImpact) &&
    Array.isArray((editorial.marketImpact as Record<string, unknown>).affectedMarkets) &&
    ((editorial.marketImpact as Record<string, unknown>).affectedMarkets as unknown[]).length > 0;

  const payload = {
    ...editorial,
    entityHash: hash,
    generatedAt: nowIso,
    generatedBy,
    contentHash,
    version,
    onchainTxHash: row?.onchainTxHash ?? undefined,
    onchainTimestamp: row?.onchainTimestamp ?? undefined,
  };

  const values = {
    generatedAt: nowIso,
    generatedBy,
    contentHash,
    version,
    claim: parseText(editorial.claim),
    dailyTitle: parseOptionalText(editorial.dailyTitle),
    onchainTxHash: row?.onchainTxHash ?? null,
    onchainTimestamp: row?.onchainTimestamp ?? null,
    hasMarketImpact,
    marketImpactJson: editorial.marketImpact ? JSON.stringify(editorial.marketImpact) : null,
    payloadJson: JSON.stringify(payload),
  };

  if (!row) {
    await c.db.insert(editorialArchive).values({
      id: hash,
      ...values,
    });
  } else if (row.contentHash !== contentHash) {
    // Only update if content actually changed — skip no-op rewrites
    // to prevent Ponder reorg table bloat
    await c.db.update(editorialArchive, { id: hash }).set(values);
  }

  return payload;
}

ponder.get("/", (c) => {
  return c.json({
    service: "pooter-world-indexer",
    endpoints: [
      "/graphql",
      "/api/v1/health",
      "/api/v1/deliberation/schema",
      "/api/v1/entities/:entityHash",
      "/api/v1/entities/:entityHash/feed",
      "/api/v1/feed/global",
      "/api/v1/scanner/launches",
      "/api/v1/scanner/sync",
      "/api/v1/agents/events",
      "/api/v1/agents/events/summary",
      "/api/v1/agents/cursors/:consumer",
      "/api/v1/ai/usage",
      "/api/v1/ai/usage/summary",
      "/api/v1/swarm/latest",
      "/api/v1/trading/state",
      "/api/v1/archive/articles",
      "/api/v1/archive/articles/:hash",
      "/api/v1/archive/editorials/hashes",
      "/api/v1/archive/editorials/market-impact",
      "/api/v1/archive/editorials/:hash",
    ],
    timestamp: Date.now(),
  });
});

ponder.get("/api/v1/health", (c) => {
  return c.json({ ok: true, timestamp: Date.now() });
});

ponder.get("/api/v1/deliberation/schema", (c) => {
  return c.json({
    data: {
      schemaVersion: DELIBERATION_SCHEMA_VERSION,
      model: "entity -> claim -> interpretation -> evidence -> outcome",
      claimSourceKinds: CLAIM_SOURCE_KINDS,
      interpretationKinds: INTERPRETATION_KINDS,
      outcomeStates: OUTCOME_STATES,
    },
    meta: {
      generatedAt: Date.now(),
    },
  });
});

ponder.get("/api/v1/entities/:entityHash", async (c) => {
  const entityHash = parseEntityHash(c.req.param("entityHash"));
  if (!entityHash) {
    return c.json({ error: "invalid entityHash" }, 400);
  }

  const rows = await c.db
    .select()
    .from(entity)
    .where(eq(entity.id, entityHash))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return c.json({ error: "entity not found" }, 404);
  }

  const recent = await c.db
    .select()
    .from(feedItem)
    .where(eq(feedItem.entityId, entityHash))
    .orderBy(desc(feedItem.timestamp))
    .limit(10);

  let claimHint: string | null = null;
  if (row.identifier.startsWith("url:")) {
    const sourceUrl = row.identifier.slice(4).trim();
    claimHint = await fetchCanonicalClaimFromSource(sourceUrl);
  }

  const canonical = buildCanonicalDeliberationGraph({
    entityHash: row.id,
    identifier: row.identifier,
    firstSeen: row.firstSeen.toString(),
    lastActivity: row.lastActivity.toString(),
    claimHint,
    recentActivity: recent.map((item) => ({
      id: item.id,
      actor: item.actor,
      actionType: item.actionType,
      data: item.data ?? "",
      timestamp: item.timestamp.toString(),
    })),
  });

  return c.json({
    data: {
      entity: serializeEntityRow(row),
      canonical,
      recentActivity: recent.map((item) => serializeFeedRow(item)),
    },
    meta: {
      generatedAt: Date.now(),
    },
  });
});

ponder.get("/api/v1/entities/:entityHash/feed", async (c) => {
  const entityHash = parseEntityHash(c.req.param("entityHash"));
  if (!entityHash) {
    return c.json({ error: "invalid entityHash" }, 400);
  }

  const limit = parseLimit(c.req.query("limit"));
  const cursor = parseTimestamp(c.req.query("cursor"));
  if (c.req.query("cursor") && cursor === undefined) {
    return c.json({ error: "invalid cursor (expected unix seconds)" }, 400);
  }

  const actionTypes = parseActionTypes(c.req.query("actionTypes"));
  if (c.req.query("actionTypes") && actionTypes === undefined) {
    return c.json({ error: "invalid actionTypes (use comma-separated 0-4)" }, 400);
  }

  const conditions = [eq(feedItem.entityId, entityHash)];
  if (cursor !== undefined) conditions.push(lt(feedItem.timestamp, cursor));
  if (actionTypes && actionTypes.length > 0) {
    conditions.push(inArray(feedItem.actionType, actionTypes));
  }

  const rows = await c.db
    .select()
    .from(feedItem)
    .where(conditions.length === 1 ? conditions[0]! : and(...conditions))
    .orderBy(desc(feedItem.timestamp))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  return c.json({
    data: {
      entityHash,
      items: items.map((item) => serializeFeedRow(item)),
    },
    meta: {
      limit,
      nextCursor: hasMore ? items[items.length - 1]!.timestamp.toString() : null,
      generatedAt: Date.now(),
    },
  });
});

ponder.get("/api/v1/feed/global", async (c) => {
  const limit = parseLimit(c.req.query("limit"));
  const cursor = parseTimestamp(c.req.query("cursor"));
  const from = parseTimestamp(c.req.query("from"));
  const to = parseTimestamp(c.req.query("to"));

  if (c.req.query("cursor") && cursor === undefined) {
    return c.json({ error: "invalid cursor (expected unix seconds)" }, 400);
  }
  if (c.req.query("from") && from === undefined) {
    return c.json({ error: "invalid from (expected unix seconds)" }, 400);
  }
  if (c.req.query("to") && to === undefined) {
    return c.json({ error: "invalid to (expected unix seconds)" }, 400);
  }

  const actionTypes = parseActionTypes(c.req.query("actionTypes"));
  if (c.req.query("actionTypes") && actionTypes === undefined) {
    return c.json({ error: "invalid actionTypes (use comma-separated 0-4)" }, 400);
  }

  const actor = parseAddress(c.req.query("actor"));
  if (c.req.query("actor") && actor === undefined) {
    return c.json({ error: "invalid actor address" }, 400);
  }

  const entityType = parseEntityType(c.req.query("entityType"));
  if (c.req.query("entityType") !== undefined && entityType === undefined) {
    return c.json({ error: "invalid entityType (expected 0-3)" }, 400);
  }

  const conditions = [];

  if (cursor !== undefined) conditions.push(lt(feedItem.timestamp, cursor));
  if (from !== undefined) conditions.push(gte(feedItem.timestamp, from));
  if (to !== undefined) conditions.push(lte(feedItem.timestamp, to));
  if (actionTypes && actionTypes.length > 0) {
    conditions.push(inArray(feedItem.actionType, actionTypes));
  }
  if (actor !== undefined) conditions.push(eq(feedItem.actor, actor));

  const whereClause =
    conditions.length === 0 ? null : conditions.length === 1 ? conditions[0]! : and(...conditions);

  const rows = await (whereClause
    ? c.db
        .select()
        .from(feedItem)
        .where(whereClause)
        .orderBy(desc(feedItem.timestamp))
        .limit(limit + 1)
    : c.db
        .select()
        .from(feedItem)
        .orderBy(desc(feedItem.timestamp))
        .limit(limit + 1));

  const hasMore = rows.length > limit;
  const baseItems = hasMore ? rows.slice(0, limit) : rows;

  const entityHashes = Array.from(
    new Set(baseItems.map((item) => item.entityId).filter((hash) => hash !== ZERO_ENTITY_HASH)),
  );

  const entityRows =
    entityHashes.length > 0
      ? await c.db.select().from(entity).where(inArray(entity.id, entityHashes))
      : [];

  const entityMap = new Map(entityRows.map((row) => [row.id, row]));

  const filtered = entityType === undefined
    ? baseItems
    : baseItems.filter((item) => entityMap.get(item.entityId)?.entityType === entityType);

  return c.json({
    data: {
      items: filtered.map((item) => serializeFeedRow(item, entityMap.get(item.entityId))),
    },
    meta: {
      limit,
      nextCursor: hasMore ? baseItems[baseItems.length - 1]!.timestamp.toString() : null,
      generatedAt: Date.now(),
    },
  });
});

// ----------------------------------------------------------------------------
// Agent event log API (durable cross-runtime swarm events)
// ----------------------------------------------------------------------------

ponder.get("/api/v1/agents/events", async (c) => {
  const unauthorized = requireWorkerAccess(c);
  if (unauthorized) return unauthorized;

  const limit = Math.min(parseLimit(c.req.query("limit")), 200);
  const cursor = parseTimestamp(c.req.query("cursor"));
  const since = parseTimestamp(c.req.query("since"));
  const fromAgent = parseOptionalText(c.req.query("from"));
  const toAgent = parseOptionalText(c.req.query("to"));
  const topics = parseTopics(c.req.query("topic"));
  const sort = parseSortDirection(c.req.query("sort"));

  if (c.req.query("cursor") && cursor === undefined) {
    return c.json({ error: "invalid cursor (expected unix ms)" }, 400);
  }
  if (c.req.query("since") && since === undefined) {
    return c.json({ error: "invalid since (expected unix ms)" }, 400);
  }

  const conditions = [];
  if (cursor !== undefined) conditions.push(lt(agentEvent.timestampMs, cursor));
  if (since !== undefined) conditions.push(gte(agentEvent.timestampMs, since));
  if (fromAgent) conditions.push(eq(agentEvent.fromAgent, fromAgent));
  if (toAgent) conditions.push(eq(agentEvent.toAgent, toAgent));
  if (topics && topics.length === 1) {
    conditions.push(eq(agentEvent.topic, topics[0]!));
  } else if (topics && topics.length > 1) {
    conditions.push(inArray(agentEvent.topic, topics));
  }

  const whereClause =
    conditions.length === 0 ? null : conditions.length === 1 ? conditions[0]! : and(...conditions);

  const rows = await (whereClause
    ? c.db
        .select()
        .from(agentEvent)
        .where(whereClause)
        .orderBy(sort === "asc" ? agentEvent.timestampMs : desc(agentEvent.timestampMs))
        .limit(limit + 1)
    : c.db
        .select()
        .from(agentEvent)
        .orderBy(sort === "asc" ? agentEvent.timestampMs : desc(agentEvent.timestampMs))
        .limit(limit + 1));

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  return c.json({
    messages: items.map(serializeAgentEventRow),
    count: items.length,
    meta: {
      limit,
      topic: topics ?? null,
      from: fromAgent ?? null,
      to: toAgent ?? null,
      sort,
      nextCursor: hasMore ? items[items.length - 1]!.timestampMs.toString() : null,
      generatedAt: Date.now(),
    },
  });
});

ponder.post("/api/v1/agents/events", async (c) => {
  if (!hasWorkerWriteAccess(c.req.header("authorization"))) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return c.json({ error: "invalid body" }, 400);
  }

  const input = body as Record<string, unknown>;
  const source = parseText(input.source, "worker");
  const rawMessages = Array.isArray(input.messages)
    ? input.messages
    : input.message
      ? [input.message]
      : [body];

  const messages = rawMessages
    .map((message) => normalizeAgentEventInput(message))
    .filter((message): message is AgentEventInput => message !== null);

  if (messages.length === 0) {
    return c.json({ error: "no valid messages" }, 400);
  }

  const persisted = await persistAgentEvents(c, messages, source);

  return c.json({
    ok: true,
    count: persisted.length,
    messages: persisted.map(serializeAgentEventRow),
  });
});

ponder.get("/api/v1/agents/events/summary", async (c) => {
  const unauthorized = requireWorkerAccess(c);
  if (unauthorized) return unauthorized;

  const windowMs = Math.max(
    60_000,
    Math.min(7 * 24 * 60 * 60 * 1000, Math.floor(safeNumber(c.req.query("windowMs"), 15 * 60 * 1000))),
  );
  const since = parseTimestamp(c.req.query("since")) ?? BigInt(Date.now() - windowMs);
  const topics = parseTopics(c.req.query("topic"));
  const fromAgent = parseOptionalText(c.req.query("from"));
  const toAgent = parseOptionalText(c.req.query("to"));

  if (c.req.query("since") && parseTimestamp(c.req.query("since")) === undefined) {
    return c.json({ error: "invalid since (expected unix ms)" }, 400);
  }

  const conditions = [gte(agentEvent.timestampMs, since)];
  if (fromAgent) conditions.push(eq(agentEvent.fromAgent, fromAgent));
  if (toAgent) conditions.push(eq(agentEvent.toAgent, toAgent));
  if (topics && topics.length === 1) {
    conditions.push(eq(agentEvent.topic, topics[0]!));
  } else if (topics && topics.length > 1) {
    conditions.push(inArray(agentEvent.topic, topics));
  }

  const rows = await c.db
    .select()
    .from(agentEvent)
    .where(conditions.length === 1 ? conditions[0]! : and(...conditions))
    .orderBy(desc(agentEvent.timestampMs));

  const topicMap = new Map<
    string,
    { count: number; lastSeenAt: number; lastFrom: string; lastTo: string }
  >();

  for (const row of rows) {
    const timestamp = Number(row.timestampMs);
    const existing = topicMap.get(row.topic) ?? {
      count: 0,
      lastSeenAt: timestamp,
      lastFrom: row.fromAgent,
      lastTo: row.toAgent,
    };
    existing.count += 1;
    if (timestamp >= existing.lastSeenAt) {
      existing.lastSeenAt = timestamp;
      existing.lastFrom = row.fromAgent;
      existing.lastTo = row.toAgent;
    }
    topicMap.set(row.topic, existing);
  }

  const minutes = Math.max(1, Math.round((Date.now() - Number(since)) / 60_000));

  return c.json({
    window: {
      since: Number(since),
      until: Date.now(),
      windowMs,
      minutes,
    },
    totals: {
      events: rows.length,
      throughputPerMinute: Number((rows.length / minutes).toFixed(2)),
      latestEventAt: rows[0] ? Number(rows[0].timestampMs) : null,
    },
    topics: Array.from(topicMap.entries())
      .map(([topic, summary]) => ({
        topic,
        count: summary.count,
        throughputPerMinute: Number((summary.count / minutes).toFixed(2)),
        lastSeenAt: summary.lastSeenAt,
        lastFrom: summary.lastFrom,
        lastTo: summary.lastTo,
      }))
      .sort((a, b) => b.count - a.count || b.lastSeenAt - a.lastSeenAt),
    meta: {
      topic: topics ?? null,
      from: fromAgent ?? null,
      to: toAgent ?? null,
      generatedAt: Date.now(),
    },
  });
});

ponder.get("/api/v1/agents/cursors/:consumer", async (c) => {
  const unauthorized = requireWorkerAccess(c);
  if (unauthorized) return unauthorized;

  const consumer = parseText(c.req.param("consumer")).trim();
  if (!consumer) {
    return c.json({ error: "consumer is required" }, 400);
  }

  const rows = await c.db
    .select()
    .from(agentConsumerCursor)
    .where(eq(agentConsumerCursor.id, consumer))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return c.json({
      cursor: {
        id: consumer,
        consumer,
        lastEventId: null,
        lastTimestampMs: 0,
        updatedAt: 0,
      },
    });
  }

  return c.json({ cursor: serializeAgentConsumerCursorRow(row) });
});

ponder.post("/api/v1/agents/cursors/:consumer", async (c) => {
  if (!hasWorkerWriteAccess(c.req.header("authorization"))) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const consumer = parseText(c.req.param("consumer")).trim();
  if (!consumer) {
    return c.json({ error: "consumer is required" }, 400);
  }

  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return c.json({ error: "invalid body" }, 400);
  }

  const input = body as Record<string, unknown>;
  const lastTimestampMs = BigInt(
    Math.max(0, Math.floor(safeNumber(input.lastTimestampMs, 0))),
  );
  const lastEventId = parseOptionalText(input.lastEventId);
  const updatedAt = BigInt(Date.now());

  const existing = await c.db
    .select()
    .from(agentConsumerCursor)
    .where(eq(agentConsumerCursor.id, consumer))
    .limit(1);

  const values = {
    consumer,
    lastEventId,
    lastTimestampMs,
    updatedAt,
  };

  if (existing[0]) {
    await c.db
      .update(agentConsumerCursor)
      .set(values)
      .where(eq(agentConsumerCursor.id, consumer));
  } else {
    await c.db.insert(agentConsumerCursor).values({
      id: consumer,
      ...values,
    });
  }

  return c.json({
    ok: true,
    cursor: {
      id: consumer,
      consumer,
      lastEventId,
      lastTimestampMs: Number(lastTimestampMs),
      updatedAt: Number(updatedAt),
    },
  });
});

// ----------------------------------------------------------------------------
// AI usage API (durable provider telemetry and budget inputs)
// ----------------------------------------------------------------------------

ponder.get("/api/v1/ai/usage", async (c) => {
  const unauthorized = requireWorkerAccess(c);
  if (unauthorized) return unauthorized;

  const limit = Math.min(parseLimit(c.req.query("limit")), 200);
  const since = parseTimestamp(c.req.query("since"));
  const cursor = parseTimestamp(c.req.query("cursor"));
  const task = parseOptionalText(c.req.query("task"));
  const provider = parseOptionalText(c.req.query("provider"));
  const status = parseOptionalText(c.req.query("status"));

  if (c.req.query("since") && since === undefined) {
    return c.json({ error: "invalid since (expected unix ms)" }, 400);
  }
  if (c.req.query("cursor") && cursor === undefined) {
    return c.json({ error: "invalid cursor (expected unix ms)" }, 400);
  }

  const conditions = [];
  if (since !== undefined) conditions.push(gte(aiInvocation.createdAt, since));
  if (cursor !== undefined) conditions.push(lt(aiInvocation.createdAt, cursor));
  if (task) conditions.push(eq(aiInvocation.task, task));
  if (provider) conditions.push(eq(aiInvocation.provider, provider));
  if (status) conditions.push(eq(aiInvocation.status, status));

  const whereClause =
    conditions.length === 0 ? null : conditions.length === 1 ? conditions[0]! : and(...conditions);

  const rows = await (whereClause
    ? c.db
        .select()
        .from(aiInvocation)
        .where(whereClause)
        .orderBy(desc(aiInvocation.createdAt))
        .limit(limit + 1)
    : c.db
        .select()
        .from(aiInvocation)
        .orderBy(desc(aiInvocation.createdAt))
        .limit(limit + 1));

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  return c.json({
    items: items.map(serializeAIInvocationRow),
    count: items.length,
    meta: {
      limit,
      task: task ?? null,
      provider: provider ?? null,
      status: status ?? null,
      nextCursor: hasMore ? items[items.length - 1]!.createdAt.toString() : null,
      generatedAt: Date.now(),
    },
  });
});

ponder.post("/api/v1/ai/usage", async (c) => {
  if (!hasWorkerWriteAccess(c.req.header("authorization"))) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return c.json({ error: "invalid body" }, 400);
  }

  const input = normalizeAIInvocationInput(body);
  if (!input) {
    return c.json({ error: "invalid ai invocation payload" }, 400);
  }

  const row = await persistAIInvocation(c, input);
  return c.json({
    ok: true,
    invocation: serializeAIInvocationRow(row),
  });
});

ponder.get("/api/v1/ai/usage/summary", async (c) => {
  const unauthorized = requireWorkerAccess(c);
  if (unauthorized) return unauthorized;

  const since = parseTimestamp(c.req.query("since"));
  const hours = Math.max(1, Math.min(24 * 30, Math.floor(safeNumber(c.req.query("hours"), 24))));
  const effectiveSince = since ?? BigInt(Date.now() - hours * 60 * 60 * 1000);
  const task = parseOptionalText(c.req.query("task"));

  if (c.req.query("since") && since === undefined) {
    return c.json({ error: "invalid since (expected unix ms)" }, 400);
  }

  const conditions = [gte(aiInvocation.createdAt, effectiveSince)];
  if (task) conditions.push(eq(aiInvocation.task, task));

  const rows = await c.db
    .select()
    .from(aiInvocation)
    .where(conditions.length === 1 ? conditions[0]! : and(...conditions))
    .orderBy(desc(aiInvocation.createdAt));

  const totals = {
    invocations: 0,
    success: 0,
    error: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    latencyMs: 0,
    estimatedCostMicrousd: 0,
  };

  const providerMap = new Map<string, typeof totals>();
  const modelMap = new Map<string, typeof totals>();
  const taskMap = new Map<string, typeof totals>();

  const mergeIntoBucket = (map: Map<string, typeof totals>, key: string, row: typeof aiInvocation.$inferSelect) => {
    const bucket = map.get(key) ?? {
      invocations: 0,
      success: 0,
      error: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      latencyMs: 0,
      estimatedCostMicrousd: 0,
    };
    bucket.invocations += 1;
    bucket.success += row.status === "success" ? 1 : 0;
    bucket.error += row.status === "success" ? 0 : 1;
    bucket.inputTokens += row.inputTokens ?? 0;
    bucket.outputTokens += row.outputTokens ?? 0;
    bucket.totalTokens += row.totalTokens ?? 0;
    bucket.latencyMs += row.latencyMs ?? 0;
    bucket.estimatedCostMicrousd += Number(row.estimatedCostMicrousd ?? 0n);
    map.set(key, bucket);
  };

  for (const row of rows) {
    totals.invocations += 1;
    totals.success += row.status === "success" ? 1 : 0;
    totals.error += row.status === "success" ? 0 : 1;
    totals.inputTokens += row.inputTokens ?? 0;
    totals.outputTokens += row.outputTokens ?? 0;
    totals.totalTokens += row.totalTokens ?? 0;
    totals.latencyMs += row.latencyMs ?? 0;
    totals.estimatedCostMicrousd += Number(row.estimatedCostMicrousd ?? 0n);

    mergeIntoBucket(providerMap, row.provider, row);
    mergeIntoBucket(modelMap, row.model, row);
    mergeIntoBucket(taskMap, row.task, row);
  }

  const summarizeBuckets = (map: Map<string, typeof totals>, keyName: string) =>
    Array.from(map.entries())
      .map(([key, bucket]) => ({
        [keyName]: key,
        ...bucket,
        avgLatencyMs: bucket.invocations > 0 ? Math.round(bucket.latencyMs / bucket.invocations) : 0,
        estimatedCostUsd: bucket.estimatedCostMicrousd / 1_000_000,
      }))
      .sort((a, b) => {
        const left = Number(a.estimatedCostMicrousd ?? 0);
        const right = Number(b.estimatedCostMicrousd ?? 0);
        return right - left || Number(b.invocations ?? 0) - Number(a.invocations ?? 0);
      });

  return c.json({
    window: {
      since: Number(effectiveSince),
      until: Date.now(),
      hours: Math.round((Date.now() - Number(effectiveSince)) / 3_600_000),
    },
    totals: {
      ...totals,
      avgLatencyMs: totals.invocations > 0 ? Math.round(totals.latencyMs / totals.invocations) : 0,
      estimatedCostUsd: totals.estimatedCostMicrousd / 1_000_000,
    },
    providers: summarizeBuckets(providerMap, "provider"),
    models: summarizeBuckets(modelMap, "model"),
    tasks: summarizeBuckets(taskMap, "task"),
    meta: {
      task: task ?? null,
      generatedAt: Date.now(),
    },
  });
});

// ----------------------------------------------------------------------------
// Scanner API (persistent, DB-backed)
// ----------------------------------------------------------------------------

ponder.get("/api/v1/scanner/launches", async (c) => {
  const limit = parseLimit(c.req.query("limit"));
  const minScore = parseMinScore(c.req.query("minScore"));
  const cursor = parseTimestamp(c.req.query("cursor"));
  const dex = parseScannerDex(c.req.query("dex"));
  const source = c.req.query("source");

  if (c.req.query("cursor") && cursor === undefined) {
    return c.json({ error: "invalid cursor (expected unix seconds)" }, 400);
  }
  if (c.req.query("dex") && dex === undefined) {
    return c.json({ error: "invalid dex (expected uniswap-v3|aerodrome)" }, 400);
  }

  const conditions = [];
  if (cursor !== undefined) conditions.push(lt(scannerLaunch.discoveredAt, cursor));
  if (minScore > 0) conditions.push(gte(scannerLaunch.score, minScore));
  if (dex) conditions.push(eq(scannerLaunch.dex, dex));
  if (source) conditions.push(eq(scannerLaunch.source, source));

  const whereClause =
    conditions.length === 0 ? null : conditions.length === 1 ? conditions[0]! : and(...conditions);

  const totalStored = (
    await (whereClause
      ? c.db.select().from(scannerLaunch).where(whereClause)
      : c.db.select().from(scannerLaunch))
  ).length;

  const rows = await (whereClause
    ? c.db
        .select()
        .from(scannerLaunch)
        .where(whereClause)
        .orderBy(desc(scannerLaunch.discoveredAt))
        .limit(limit + 1)
    : c.db
        .select()
        .from(scannerLaunch)
        .orderBy(desc(scannerLaunch.discoveredAt))
        .limit(limit + 1));

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  return c.json({
    items: items.map(serializeScannerLaunch),
    count: items.length,
    totalStored,
    meta: {
      limit,
      minScore,
      dex: dex ?? null,
      source: source ?? null,
      nextCursor: hasMore ? items[items.length - 1]!.discoveredAt.toString() : null,
      generatedAt: Date.now(),
    },
  });
});

ponder.get("/api/v1/scanner/launches/:address", async (c) => {
  const address = parseAddress(c.req.param("address"));
  if (!address) {
    return c.json({ error: "invalid address" }, 400);
  }

  const byPool = await c.db
    .select()
    .from(scannerLaunch)
    .where(eq(scannerLaunch.poolAddress, address))
    .limit(1);

  const row =
    byPool[0] ??
    (
      await c.db
        .select()
        .from(scannerLaunch)
        .where(eq(scannerLaunch.tokenAddress, address))
        .limit(1)
    )[0];

  if (!row) {
    return c.json({ error: "launch not found" }, 404);
  }

  return c.json({
    launch: serializeScannerLaunch(row),
    meta: { generatedAt: Date.now() },
  });
});

const handleScannerSync = async (c: any) => {
  if (!hasWorkerWriteAccess(c.req.header("authorization"))) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const query = (c.req.query("q") ?? "base").trim() || "base";
  const limit = parseLimit(c.req.query("limit"));

  const res = await fetch(`${DEXSCREENER_SEARCH_API}${encodeURIComponent(query)}`, {
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    return c.json({ error: `dexscreener ${res.status}` }, 502);
  }

  const json = (await res.json()) as { pairs?: Array<Record<string, unknown>> };
  const pairs = Array.isArray(json.pairs) ? json.pairs : [];

  const nowMs = Date.now();
  const nowSec = BigInt(Math.floor(nowMs / 1000));
  let upserted = 0;
  const emittedEvents: AgentEventInput[] = [];
  let highScoreEvents = 0;

  for (const pair of pairs) {
    if (upserted >= limit) break;
    if (String(pair.chainId ?? "").toLowerCase() !== "base") continue;

    const pairAddress = parseAddressLoose(pair.pairAddress);
    const baseToken = (pair.baseToken ?? {}) as Record<string, unknown>;
    const quoteToken = (pair.quoteToken ?? {}) as Record<string, unknown>;
    const baseAddress = parseAddressLoose(baseToken.address);
    const quoteAddress = parseAddressLoose(quoteToken.address);

    if (!pairAddress || !baseAddress || !quoteAddress) continue;

    const baseKnown = KNOWN_QUOTE_TOKENS.has(baseAddress);
    const quoteKnown = KNOWN_QUOTE_TOKENS.has(quoteAddress);

    let tokenAddress = baseAddress;
    let pairedAsset = quoteAddress;
    let tokenName = typeof baseToken.name === "string" ? baseToken.name : null;
    let tokenSymbol = typeof baseToken.symbol === "string" ? baseToken.symbol : null;

    if (baseKnown && !quoteKnown) {
      tokenAddress = quoteAddress;
      pairedAsset = baseAddress;
      tokenName = typeof quoteToken.name === "string" ? quoteToken.name : null;
      tokenSymbol = typeof quoteToken.symbol === "string" ? quoteToken.symbol : null;
    } else if (baseKnown && quoteKnown) {
      continue;
    }

    const liquidity = (pair.liquidity ?? {}) as Record<string, unknown>;
    const volume = (pair.volume ?? {}) as Record<string, unknown>;
    const txns = (pair.txns ?? {}) as Record<string, unknown>;
    const txns24 = (txns.h24 ?? {}) as Record<string, unknown>;
    const buys24h = safeNumber(txns24.buys);
    const sells24h = safeNumber(txns24.sells);
    const txns24h = Math.max(0, Math.floor(buys24h + sells24h));
    const liquidityUsd = Math.max(0, Math.floor(safeNumber(liquidity.usd)));
    const volume24h = Math.max(0, Math.floor(safeNumber(volume.h24)));
    const pairCreatedMs = safeNumber(pair.pairCreatedAt, nowMs);
    const pairCreatedSec = BigInt(Math.floor(pairCreatedMs / 1000));
    const ageMinutes = Math.max(0, Math.floor((nowMs - pairCreatedMs) / (60 * 1000)));

    const score = scorePair({
      liquidityUsd,
      volume24h,
      txns24h,
      ageMinutes,
    });

    const dex = normalizeDex(typeof pair.dexId === "string" ? pair.dexId : undefined);
    const priceUsd = typeof pair.priceUsd === "string" ? pair.priceUsd : String(safeNumber(pair.priceUsd));
    const pairUrl = typeof pair.url === "string" ? pair.url : null;

    const existing = await c.db
      .select()
      .from(scannerLaunch)
      .where(eq(scannerLaunch.id, pairAddress))
      .limit(1);

    const previous = existing[0];
    const discoveredAt = previous?.discoveredAt ?? pairCreatedSec;
    const launchSnapshot = serializeScannerLaunch({
      id: pairAddress,
      tokenAddress,
      poolAddress: pairAddress,
      pairedAsset,
      dex,
      source: "dexscreener-search",
      score,
      tokenSymbol,
      tokenName,
      priceUsd,
      liquidityUsd,
      volume24h,
      txns24h,
      pairUrl,
      pairCreatedAt: pairCreatedSec,
      discoveredAt,
      updatedAt: nowSec,
      enriched: true,
    });

    if (previous) {
      await c.db
        .update(scannerLaunch, { id: pairAddress })
        .set({
          tokenAddress,
          poolAddress: pairAddress,
          pairedAsset,
          dex,
          source: "dexscreener-search",
          score,
          tokenSymbol,
          tokenName,
          priceUsd,
          liquidityUsd,
          volume24h,
          txns24h,
          pairUrl,
          pairCreatedAt: pairCreatedSec,
          updatedAt: nowSec,
          enriched: true,
        });

      emittedEvents.push({
        id: `${pairAddress}:token-enriched:${Number(nowSec)}`,
        from: "launch-scanner",
        to: "*",
        topic: "token-enriched",
        payload: launchSnapshot,
        timestamp: nowMs,
      });
    } else {
      await c.db.insert(scannerLaunch).values({
        id: pairAddress,
        tokenAddress,
        poolAddress: pairAddress,
        pairedAsset,
        dex,
        source: "dexscreener-search",
        score,
        tokenSymbol,
        tokenName,
        priceUsd,
        liquidityUsd,
        volume24h,
        txns24h,
        pairUrl,
        pairCreatedAt: pairCreatedSec,
        discoveredAt: pairCreatedSec,
        updatedAt: nowSec,
        enriched: true,
      });

      emittedEvents.push({
        id: `${pairAddress}:new-token-launch:${Number(nowSec)}`,
        from: "launch-scanner",
        to: "*",
        topic: "new-token-launch",
        payload: launchSnapshot,
        timestamp: nowMs,
      });
    }

    if (score >= 50 && (!previous || (previous.score ?? 0) < 50)) {
      emittedEvents.push({
        id: `${pairAddress}:high-score-launch:${Number(nowSec)}`,
        from: "launch-scanner",
        to: "*",
        topic: "high-score-launch",
        payload: launchSnapshot,
        timestamp: nowMs,
      });
      emittedEvents.push({
        id: `${pairAddress}:trade-candidate:${Number(nowSec)}`,
        from: "coordinator",
        to: "*",
        topic: "trade-candidate",
        payload: {
          ...launchSnapshot,
          signalSource: "scanner-threshold",
        },
        timestamp: nowMs,
      });
      highScoreEvents += 1;
    }

    upserted += 1;
  }

  emittedEvents.push({
    id: `scanner-sync:${query}:${Number(nowSec)}`,
    from: "launch-scanner",
    to: "*",
    topic: "scanner-sync-complete",
    payload: {
      query,
      upserted,
      scannedPairs: pairs.length,
      highScoreEvents,
    },
    timestamp: nowMs,
  });

  if (emittedEvents.length > 0) {
    await persistAgentEvents(c, emittedEvents, "scanner-sync");
  }

  const latest = await c.db
    .select()
    .from(scannerLaunch)
    .orderBy(desc(scannerLaunch.discoveredAt))
    .limit(Math.min(limit, 50));

  return c.json({
    ok: true,
    upserted,
    items: latest.map(serializeScannerLaunch),
    emittedEvents: emittedEvents.length,
    meta: {
      query,
      generatedAt: Date.now(),
    },
  });
};

ponder.get("/api/v1/scanner/sync", async (c) => {
  return c.json({ error: "method not allowed" }, 405);
});
ponder.post("/api/v1/scanner/sync", handleScannerSync);

// ----------------------------------------------------------------------------
// Worker runtime state APIs (persisted swarm + trader snapshots)
// ----------------------------------------------------------------------------

ponder.get("/api/v1/swarm/latest", async (c) => {
  const unauthorized = requireWorkerAccess(c);
  if (unauthorized) return unauthorized;

  const rows = await c.db
    .select()
    .from(swarmState)
    .where(eq(swarmState.id, WORKER_STATE_ROW_ID))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return c.json({ error: "swarm state not found" }, 404);
  }

  return c.json(serializeSwarmStateRow(row));
});

ponder.post("/api/v1/swarm/latest", async (c) => {
  if (!hasWorkerWriteAccess(c.req.header("authorization"))) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return c.json({ error: "invalid body" }, 400);
  }

  const input = body as Record<string, unknown>;
  const generatedAt = parseOptionalText(input.generatedAt);
  const scannedItems = Math.max(0, Math.floor(safeNumber(input.scannedItems)));
  const clusters = Array.isArray(input.clusters) ? input.clusters : [];
  const contradictionFlags = Array.isArray(input.contradictionFlags)
    ? input.contradictionFlags
    : [];

  if (!generatedAt) {
    return c.json({ error: "generatedAt is required" }, 400);
  }

  const updatedAt = BigInt(Math.floor(Date.now() / 1000));
  const eventTimestampMs = Date.now();
  const existing = await c.db
    .select()
    .from(swarmState)
    .where(eq(swarmState.id, WORKER_STATE_ROW_ID))
    .limit(1);

  const values = {
    generatedAt,
    scannedItems,
    clustersJson: JSON.stringify(clusters),
    contradictionFlagsJson: JSON.stringify(contradictionFlags),
    updatedAt,
  };

  if (existing[0]) {
    await c.db
      .update(swarmState)
      .set(values)
      .where(eq(swarmState.id, WORKER_STATE_ROW_ID));
  } else {
    await c.db.insert(swarmState).values({
      id: WORKER_STATE_ROW_ID,
      ...values,
    });
  }

  const previousClusters = new Map<string, string>();
  const previousContradictions = new Set<string>();
  if (existing[0]) {
    const priorClusters = safeJsonParse(existing[0].clustersJson, [] as Array<Record<string, unknown>>);
    const priorFlags = safeJsonParse(
      existing[0].contradictionFlagsJson,
      [] as Array<Record<string, unknown>>,
    );
    for (const cluster of priorClusters) {
      const clusterId = parseText(cluster.clusterId).trim();
      if (!clusterId) continue;
      previousClusters.set(
        clusterId,
        JSON.stringify({
          itemCount: safeNumber(cluster.itemCount),
          latestPubDate: parseText(cluster.latestPubDate),
          contradictions: Array.isArray(cluster.contradictionFlags)
            ? cluster.contradictionFlags.length
            : 0,
        }),
      );
    }
    for (const flag of priorFlags) {
      const id = parseText(flag.id).trim();
      if (id) previousContradictions.add(id);
    }
  }

  const emittedEvents: AgentEventInput[] = [];
  for (const cluster of clusters.slice(0, 20)) {
    if (!cluster || typeof cluster !== "object") continue;
    const record = cluster as Record<string, unknown>;
    const clusterId = parseText(record.clusterId).trim();
    if (!clusterId) continue;

    const fingerprint = JSON.stringify({
      itemCount: safeNumber(record.itemCount),
      latestPubDate: parseText(record.latestPubDate),
      contradictions: Array.isArray(record.contradictionFlags)
        ? record.contradictionFlags.length
        : 0,
    });

    if (previousClusters.get(clusterId) === fingerprint) {
      continue;
    }

    emittedEvents.push({
      id: `emerging-event:${clusterId}:${updatedAt.toString()}`,
      from: "research-swarm",
      to: "*",
      topic: "emerging-event",
      payload: {
        clusterId,
        title: parseText(record.title),
        canonicalClaim: parseText(record.canonicalClaim),
        itemCount: Math.max(0, Math.floor(safeNumber(record.itemCount))),
        latestPubDate: parseText(record.latestPubDate),
        tags: parseStringArray(record.tags),
        sources: parseStringArray(record.sources),
        hasContradictions:
          Array.isArray(record.contradictionFlags) && record.contradictionFlags.length > 0,
        contradictionFlags: Array.isArray(record.contradictionFlags)
          ? record.contradictionFlags
          : [],
      },
      timestamp: eventTimestampMs,
    });
  }

  const newContradictions = contradictionFlags.filter((flag) => {
    if (!flag || typeof flag !== "object") return false;
    const id = parseText((flag as Record<string, unknown>).id).trim();
    return Boolean(id) && !previousContradictions.has(id);
  });

  if (newContradictions.length > 0) {
    emittedEvents.push({
      id: `contradictions-detected:${updatedAt.toString()}`,
      from: "research-swarm",
      to: "*",
      topic: "contradictions-detected",
      payload: {
        count: newContradictions.length,
        flags: newContradictions.slice(0, 10),
      },
      timestamp: eventTimestampMs,
    });
    emittedEvents.push({
      id: `research-escalation:${updatedAt.toString()}`,
      from: "coordinator",
      to: "*",
      topic: "research-escalation",
      payload: {
        reason: "contradictions-detected",
        count: newContradictions.length,
      },
      timestamp: eventTimestampMs,
    });
  }

  emittedEvents.push({
    id: `swarm-snapshot:${updatedAt.toString()}`,
    from: "research-swarm",
    to: "*",
    topic: "swarm-snapshot",
    payload: {
      generatedAt,
      scannedItems,
      clusters: clusters.length,
      contradictionFlags: contradictionFlags.length,
    },
    timestamp: eventTimestampMs,
  });

  if (emittedEvents.length > 0) {
    await persistAgentEvents(c, emittedEvents, "swarm-state");
  }

  return c.json({
    ok: true,
    state: {
      generatedAt,
      scannedItems,
      clusters,
      contradictionFlags,
      updatedAt: Number(updatedAt),
    },
    emittedEvents: emittedEvents.length,
  });
});

ponder.get("/api/v1/trading/state", async (c) => {
  const unauthorized = requireWorkerAccess(c);
  if (unauthorized) return unauthorized;

  const rows = await c.db
    .select()
    .from(traderState)
    .where(eq(traderState.id, WORKER_STATE_ROW_ID))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return c.json({ error: "trading state not found" }, 404);
  }

  return c.json(serializeTraderStateRow(row));
});

ponder.post("/api/v1/trading/state", async (c) => {
  if (!hasWorkerWriteAccess(c.req.header("authorization"))) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return c.json({ error: "invalid body" }, 400);
  }

  const input = body as Record<string, unknown>;
  const executionMode = parseText(input.executionMode, "worker");
  const updatedAt = BigInt(Math.floor(Date.now() / 1000));
  const eventTimestampMs = Date.now();
  const existing = await c.db
    .select()
    .from(traderState)
    .where(eq(traderState.id, WORKER_STATE_ROW_ID))
    .limit(1);

  const values = {
    executionMode,
    configJson: JSON.stringify(input.config ?? null),
    primaryReportJson: JSON.stringify(input.report ?? null),
    parallelReportsJson: JSON.stringify(Array.isArray(input.parallel) ? input.parallel : []),
    primaryReadinessJson: JSON.stringify(input.readiness ?? null),
    parallelReadinessJson: JSON.stringify(
      Array.isArray(input.parallelReadiness) ? input.parallelReadiness : [],
    ),
    primaryPerformanceJson: JSON.stringify(input.performance ?? null),
    parallelPerformanceJson: JSON.stringify(
      Array.isArray(input.parallelPerformance) ? input.parallelPerformance : [],
    ),
    primaryPositionsJson: JSON.stringify(Array.isArray(input.positions) ? input.positions : []),
    parallelPositionsJson: JSON.stringify(
      Array.isArray(input.parallelPositions) ? input.parallelPositions : [],
    ),
    updatedAt,
  };

  if (existing[0]) {
    await c.db
      .update(traderState)
      .set(values)
      .where(eq(traderState.id, WORKER_STATE_ROW_ID));
  } else {
    await c.db.insert(traderState).values({
      id: WORKER_STATE_ROW_ID,
      ...values,
    });
  }

  const report = input.report && typeof input.report === "object"
    ? (input.report as Record<string, unknown>)
    : null;
  const entries = Array.isArray(report?.entries) ? report.entries : [];
  const exits = Array.isArray(report?.exits) ? report.exits : [];
  const errors = Array.isArray(report?.errors) ? report.errors : [];
  const emittedEvents: AgentEventInput[] = [];

  for (const entry of entries.slice(0, 20)) {
    if (!entry || typeof entry !== "object") continue;
    const position = entry as Record<string, unknown>;
    const id = parseText(position.id).trim();
    if (!id) continue;
    emittedEvents.push({
      id: `trade-executed:${id}:${updatedAt.toString()}`,
      from: "trader",
      to: "*",
      topic: "trade-executed",
      payload: position,
      timestamp: eventTimestampMs,
    });
  }

  for (const exit of exits.slice(0, 20)) {
    if (!exit || typeof exit !== "object") continue;
    const position = exit as Record<string, unknown>;
    const id = parseText(position.id).trim();
    if (!id) continue;
    emittedEvents.push({
      id: `trade-closed:${id}:${updatedAt.toString()}`,
      from: "trader",
      to: "*",
      topic: "trade-closed",
      payload: position,
      timestamp: eventTimestampMs,
    });
  }

  emittedEvents.push({
    id: `trader-cycle-complete:${updatedAt.toString()}`,
    from: "trader",
    to: "*",
    topic: "trader-cycle-complete",
    payload: {
      executionMode,
      entries: entries.length,
      exits: exits.length,
      errors: errors.length,
      openPositions: safeNumber(report?.openPositions),
      dryRun: Boolean(report?.dryRun),
      executionVenue: parseText(report?.executionVenue),
    },
    timestamp: eventTimestampMs,
  });

  if (emittedEvents.length > 0) {
    await persistAgentEvents(c, emittedEvents, "trader-state");
  }

  return c.json({
    ok: true,
    state: {
      executionMode,
      config: input.config ?? null,
      report: input.report ?? null,
      parallel: Array.isArray(input.parallel) ? input.parallel : [],
      readiness: input.readiness ?? null,
      parallelReadiness: Array.isArray(input.parallelReadiness)
        ? input.parallelReadiness
        : [],
      performance: input.performance ?? null,
      parallelPerformance: Array.isArray(input.parallelPerformance)
        ? input.parallelPerformance
        : [],
      positions: Array.isArray(input.positions) ? input.positions : [],
      parallelPositions: Array.isArray(input.parallelPositions)
        ? input.parallelPositions
        : [],
      updatedAt: Number(updatedAt),
    },
    emittedEvents: emittedEvents.length,
  });
});

// ----------------------------------------------------------------------------
// Durable archive APIs (article/editorial persistence)
// ----------------------------------------------------------------------------

ponder.get("/api/v1/archive/articles", async (c) => {
  const limit = parseArchiveLimit(c.req.query("limit"));
  const cursor = parseOptionalText(c.req.query("cursor"));
  const whereClause = cursor ? lt(articleArchive.lastSeenAt, cursor) : undefined;

  const rows = await (whereClause
    ? c.db
        .select()
        .from(articleArchive)
        .where(whereClause)
        .orderBy(desc(articleArchive.lastSeenAt))
        .limit(limit + 1)
    : c.db
        .select()
        .from(articleArchive)
        .orderBy(desc(articleArchive.lastSeenAt))
        .limit(limit + 1));

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  return c.json({
    items: items.map(serializeArticleArchiveRow),
    count: items.length,
    meta: {
      limit,
      nextCursor: hasMore ? items[items.length - 1]!.lastSeenAt : null,
      generatedAt: Date.now(),
    },
  });
});

ponder.get("/api/v1/archive/articles/:hash", async (c) => {
  const hash = parseEntityHash(c.req.param("hash"));
  if (!hash) {
    return c.json({ error: "invalid hash" }, 400);
  }

  const rows = await c.db
    .select()
    .from(articleArchive)
    .where(eq(articleArchive.id, hash))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return c.json({ error: "article not found" }, 404);
  }

  return c.json({
    item: serializeArticleArchiveRow(row),
    meta: { generatedAt: Date.now() },
  });
});

ponder.post("/api/v1/archive/articles/upsert", async (c) => {
  if (!hasWorkerWriteAccess(c.req.header("authorization"))) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const body = await c.req.json().catch(() => null);
  const rawItems = Array.isArray(body)
    ? body
    : body && typeof body === "object" && Array.isArray((body as Record<string, unknown>).items)
      ? ((body as Record<string, unknown>).items as unknown[])
      : [];

  if (rawItems.length === 0) {
    return c.json({ error: "expected items[]" }, 400);
  }

  const nowIso = new Date().toISOString();
  let inserted = 0;
  let updated = 0;

  for (const rawItem of rawItems) {
    const normalized = normalizeArchivedArticleInput(rawItem, nowIso);
    if (!normalized) continue;

    const outcome = await upsertArticleArchiveRow(c, normalized);
    if (outcome === "inserted") inserted += 1;
    else updated += 1;
  }

  return c.json({
    ok: true,
    inserted,
    updated,
    processed: inserted + updated,
    meta: { generatedAt: Date.now() },
  });
});

ponder.get("/api/v1/archive/editorials/hashes", async (c) => {
  const limit = parseArchiveLimit(c.req.query("limit"));
  const rows = await c.db
    .select()
    .from(editorialArchive)
    .orderBy(desc(editorialArchive.generatedAt))
    .limit(limit);

  return c.json({
    hashes: rows.map((row) => row.id),
    count: rows.length,
    meta: { generatedAt: Date.now() },
  });
});

ponder.get("/api/v1/archive/editorials/market-impact", async (c) => {
  const limit = parseArchiveLimit(c.req.query("limit"), 200);
  const rows = await c.db
    .select()
    .from(editorialArchive)
    .where(eq(editorialArchive.hasMarketImpact, true))
    .orderBy(desc(editorialArchive.generatedAt))
    .limit(limit);

  const records = rows
    .map(serializeEditorialArchiveRow)
    .filter((payload) => payload && typeof payload === "object")
    .map((payload) => {
      const record = payload as Record<string, unknown>;
      return {
        entityHash: parseText(record.entityHash),
        generatedAt: parseText(record.generatedAt),
        claim: parseText(record.claim),
        marketImpact: record.marketImpact ?? null,
      };
    })
    .filter(
      (record) =>
        Boolean(record.entityHash) &&
        Boolean(record.generatedAt) &&
        Boolean(record.claim) &&
        Boolean(record.marketImpact),
    );

  return c.json({
    records,
    count: records.length,
    meta: { generatedAt: Date.now() },
  });
});

ponder.get("/api/v1/archive/editorials/:hash", async (c) => {
  const hash = parseEntityHash(c.req.param("hash"));
  if (!hash) {
    return c.json({ error: "invalid hash" }, 400);
  }

  const rows = await c.db
    .select()
    .from(editorialArchive)
    .where(eq(editorialArchive.id, hash))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return c.json({ error: "editorial not found" }, 404);
  }

  return c.json({
    editorial: serializeEditorialArchiveRow(row),
    meta: { generatedAt: Date.now() },
  });
});

ponder.post("/api/v1/archive/editorials/upsert", async (c) => {
  if (!hasWorkerWriteAccess(c.req.header("authorization"))) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return c.json({ error: "invalid body" }, 400);
  }

  const hash = parseEntityHash((body as Record<string, unknown>).hash as string | undefined);
  const editorial = (body as Record<string, unknown>).editorial;
  const generatedBy = (body as Record<string, unknown>).generatedBy;

  if (!hash || !editorial || typeof editorial !== "object") {
    return c.json({ error: "expected hash and editorial" }, 400);
  }

  const payload = await upsertEditorialArchiveRow(
    c,
    hash,
    editorial as Record<string, unknown>,
    generatedBy,
  );

  return c.json({
    ok: true,
    editorial: payload,
    meta: { generatedAt: Date.now() },
  });
});

ponder.post("/api/v1/archive/editorials/:hash/mark-onchain", async (c) => {
  if (!hasWorkerWriteAccess(c.req.header("authorization"))) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const hash = parseEntityHash(c.req.param("hash"));
  if (!hash) {
    return c.json({ error: "invalid hash" }, 400);
  }

  const body = await c.req.json().catch(() => null);
  const txHash = body && typeof body === "object" ? parseOptionalText((body as Record<string, unknown>).txHash) : null;
  if (!txHash || !isHexHash(txHash)) {
    return c.json({ error: "invalid txHash" }, 400);
  }

  const rows = await c.db
    .select()
    .from(editorialArchive)
    .where(eq(editorialArchive.id, hash))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return c.json({ error: "editorial not found" }, 404);
  }

  const nowIso = new Date().toISOString();
  const payload = serializeEditorialArchiveRow(row) as Record<string, unknown>;
  const updatedPayload = {
    ...payload,
    onchainTxHash: txHash,
    onchainTimestamp: nowIso,
  };

  await c.db
    .update(editorialArchive)
    .set({
      onchainTxHash: txHash,
      onchainTimestamp: nowIso,
      payloadJson: JSON.stringify(updatedPayload),
    })
    .where(eq(editorialArchive.id, hash));

  return c.json({
    ok: true,
    editorial: updatedPayload,
    meta: { generatedAt: Date.now() },
  });
});

// ----------------------------------------------------------------------------
// Agent Memory — persistent key/value store for agent learning + recall
// ----------------------------------------------------------------------------

ponder.post("/api/v1/memory/remember", async (c) => {
  if (!hasWorkerWriteAccess(c.req.header("authorization"))) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return c.json({ error: "invalid body" }, 400);
  }

  const input = body as Record<string, unknown>;
  const scope = typeof input.scope === "string" ? input.scope.trim() : "";
  const key = typeof input.key === "string" ? input.key.trim() : "";
  const content = typeof input.content === "string" ? input.content.trim() : "";

  if (!scope || !key || !content) {
    return c.json({ error: "scope, key, and content are required" }, 400);
  }

  const compositeKey = `${scope}:${key}`;
  const nowMs = BigInt(Date.now());

  const existing = await c.db
    .select()
    .from(agentMemory)
    .where(eq(agentMemory.key, compositeKey))
    .limit(1);

  if (existing[0]) {
    await c.db
      .update(agentMemory)
      .set({ content, updatedAt: nowMs })
      .where(eq(agentMemory.key, compositeKey));
  } else {
    await c.db.insert(agentMemory).values({
      key: compositeKey,
      scope,
      content,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
  }

  return c.json({ ok: true, key: compositeKey });
});

ponder.get("/api/v1/memory/recall", async (c) => {
  if (!hasWorkerWriteAccess(c.req.header("authorization"))) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const scope = c.req.query("scope")?.trim();
  const key = c.req.query("key")?.trim();
  const limitParam = c.req.query("limit");
  const limit = Math.min(Math.max(1, Math.floor(Number(limitParam ?? 50))), 200);

  if (!scope) {
    return c.json({ error: "scope is required" }, 400);
  }

  if (key) {
    const compositeKey = `${scope}:${key}`;
    const rows = await c.db
      .select()
      .from(agentMemory)
      .where(eq(agentMemory.key, compositeKey))
      .limit(1);

    return c.json({
      memories: rows.map((r) => ({
        key: r.key,
        scope: r.scope,
        content: r.content,
        createdAt: Number(r.createdAt),
        updatedAt: Number(r.updatedAt),
      })),
    });
  }

  const rows = await c.db
    .select()
    .from(agentMemory)
    .where(eq(agentMemory.scope, scope))
    .orderBy(desc(agentMemory.updatedAt))
    .limit(limit);

  return c.json({
    memories: rows.map((r) => ({
      key: r.key,
      scope: r.scope,
      content: r.content,
      createdAt: Number(r.createdAt),
      updatedAt: Number(r.updatedAt),
    })),
  });
});

ponder.post("/api/v1/memory/forget", async (c) => {
  if (!hasWorkerWriteAccess(c.req.header("authorization"))) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return c.json({ error: "invalid body" }, 400);
  }

  const input = body as Record<string, unknown>;
  const scope = typeof input.scope === "string" ? input.scope.trim() : "";
  const key = typeof input.key === "string" ? input.key.trim() : "";

  if (!scope || !key) {
    return c.json({ error: "scope and key are required" }, 400);
  }

  const compositeKey = `${scope}:${key}`;
  await c.db
    .delete(agentMemory)
    .where(eq(agentMemory.key, compositeKey));

  return c.json({ ok: true, deleted: compositeKey });
});

ponder.get("/api/v1/memory/count", async (c) => {
  if (!hasWorkerWriteAccess(c.req.header("authorization"))) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const scope = c.req.query("scope")?.trim();

  if (!scope) {
    return c.json({ error: "scope is required" }, 400);
  }

  const rows = await c.db
    .select()
    .from(agentMemory)
    .where(eq(agentMemory.scope, scope));

  return c.json({ scope, count: rows.length });
});

ponder.get("/api/v1/memory/all", async (c) => {
  if (!hasWorkerWriteAccess(c.req.header("authorization"))) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const limitParam = c.req.query("limit");
  const limit = Math.min(Math.max(1, Math.floor(Number(limitParam ?? 100))), 500);

  const rows = await c.db
    .select()
    .from(agentMemory)
    .orderBy(desc(agentMemory.updatedAt))
    .limit(limit);

  return c.json({
    memories: rows.map((r) => ({
      key: r.key,
      scope: r.scope,
      content: r.content,
      createdAt: Number(r.createdAt),
      updatedAt: Number(r.updatedAt),
    })),
    count: rows.length,
  });
});

// ============================================================================
// MARKETPLACE ORDERS — Seaport 1.6 NFT marketplace (Nouns + PEPE)
// ============================================================================

const VALID_COLLECTIONS = new Set(["nouns", "emblem-vault-legacy", "emblem-vault-curated"]);
const VALID_ORDER_STATUSES = new Set(["ACTIVE", "FILLED", "CANCELLED", "EXPIRED"]);

/**
 * GET /api/v1/marketplace/orders
 * List marketplace orders with optional filters.
 * Query params: collection, tokenId, tokenContract, maker, status, limit
 */
ponder.get("/api/v1/marketplace/orders", async (c) => {
  const collection = c.req.query("collection");
  const tokenId = c.req.query("tokenId");
  const tokenContract = c.req.query("tokenContract")?.toLowerCase();
  const maker = c.req.query("maker")?.toLowerCase();
  const status = c.req.query("status")?.toUpperCase() || "ACTIVE";
  const limit = parseLimit(c.req.query("limit"));

  const conditions = [];

  if (status && VALID_ORDER_STATUSES.has(status)) {
    conditions.push(eq(marketplaceOrder.status, status));
  }
  if (collection && VALID_COLLECTIONS.has(collection)) {
    conditions.push(eq(marketplaceOrder.collection, collection));
  }
  if (tokenContract) {
    conditions.push(eq(marketplaceOrder.tokenContract, tokenContract));
  }
  if (tokenId) {
    conditions.push(eq(marketplaceOrder.tokenId, tokenId));
  }
  if (maker) {
    conditions.push(eq(marketplaceOrder.maker, maker));
  }

  // Filter out expired orders
  const nowBigint = BigInt(Math.floor(Date.now() / 1000));
  conditions.push(gte(marketplaceOrder.expiresAt, nowBigint));

  const rows = await c.db
    .select()
    .from(marketplaceOrder)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(marketplaceOrder.createdAt))
    .limit(limit);

  return c.json({
    orders: rows.map((r) => ({
      orderHash: r.id,
      tokenContract: r.tokenContract,
      tokenId: r.tokenId,
      maker: r.maker,
      priceWei: r.priceWei,
      expiresAt: Number(r.expiresAt),
      status: r.status,
      orderJson: r.orderJson,
      signature: r.signature,
      collection: r.collection,
      taker: r.taker,
      txHash: r.txHash,
      createdAt: Number(r.createdAt),
    })),
    count: rows.length,
    meta: { generatedAt: Date.now() },
  });
});

/**
 * GET /api/v1/marketplace/orders/:hash
 * Get a single order by hash.
 */
ponder.get("/api/v1/marketplace/orders/:hash", async (c) => {
  const hash = c.req.param("hash");
  if (!hash) return c.json({ error: "missing hash" }, 400);

  const rows = await c.db
    .select()
    .from(marketplaceOrder)
    .where(eq(marketplaceOrder.id, hash))
    .limit(1);

  const row = rows[0];
  if (!row) return c.json({ error: "not found" }, 404);

  return c.json({
    orderHash: row.id,
    tokenContract: row.tokenContract,
    tokenId: row.tokenId,
    maker: row.maker,
    priceWei: row.priceWei,
    expiresAt: Number(row.expiresAt),
    status: row.status,
    orderJson: row.orderJson,
    signature: row.signature,
    collection: row.collection,
    taker: row.taker,
    txHash: row.txHash,
    createdAt: Number(row.createdAt),
  });
});

/**
 * POST /api/v1/marketplace/orders
 * Submit a new signed Seaport order.
 * Auth: The signed order IS the authentication (EIP-712 signature matches maker).
 */
ponder.post("/api/v1/marketplace/orders", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return c.json({ error: "invalid body" }, 400);
  }

  const {
    orderHash,
    tokenContract,
    tokenId,
    maker,
    priceWei,
    expiresAt,
    orderJson,
    signature,
    collection,
  } = body as Record<string, unknown>;

  // Validate required fields
  if (
    typeof orderHash !== "string" || !orderHash ||
    typeof tokenContract !== "string" || !tokenContract ||
    typeof tokenId !== "string" || !tokenId ||
    typeof maker !== "string" || !maker ||
    typeof priceWei !== "string" || !priceWei ||
    typeof orderJson !== "string" || !orderJson ||
    typeof signature !== "string" || !signature ||
    typeof collection !== "string" || !VALID_COLLECTIONS.has(collection)
  ) {
    return c.json({ error: "missing or invalid required fields" }, 400);
  }

  const expiresAtBigint = BigInt(Number(expiresAt) || 0);
  if (expiresAtBigint <= BigInt(Math.floor(Date.now() / 1000))) {
    return c.json({ error: "order already expired" }, 400);
  }

  // Validate the orderJson parses correctly
  try {
    JSON.parse(orderJson);
  } catch {
    return c.json({ error: "invalid orderJson" }, 400);
  }

  const nowBigint = BigInt(Math.floor(Date.now() / 1000));

  // Check if order already exists
  const existing = await c.db
    .select()
    .from(marketplaceOrder)
    .where(eq(marketplaceOrder.id, orderHash))
    .limit(1);

  if (existing.length > 0) {
    return c.json({ error: "order already exists", orderHash }, 409);
  }

  await c.db.insert(marketplaceOrder).values({
    id: orderHash,
    tokenContract: tokenContract.toLowerCase(),
    tokenId,
    maker: maker.toLowerCase(),
    priceWei,
    expiresAt: expiresAtBigint,
    status: "ACTIVE",
    orderJson,
    signature,
    collection,
    taker: null,
    txHash: null,
    createdAt: nowBigint,
  });

  return c.json({ ok: true, orderHash });
});

/**
 * PUT /api/v1/marketplace/orders/:hash/fill
 * Mark an order as filled (purchased).
 */
ponder.post("/api/v1/marketplace/orders/:hash/fill", async (c) => {
  const hash = c.req.param("hash");
  if (!hash) return c.json({ error: "missing hash" }, 400);

  const body = await c.req.json().catch(() => null);
  const txHash = (body as Record<string, unknown>)?.txHash;
  const taker = (body as Record<string, unknown>)?.taker;

  if (typeof txHash !== "string" || !txHash) {
    return c.json({ error: "missing txHash" }, 400);
  }

  const existing = await c.db
    .select()
    .from(marketplaceOrder)
    .where(eq(marketplaceOrder.id, hash))
    .limit(1);

  if (existing.length === 0) return c.json({ error: "not found" }, 404);
  if (existing[0].status !== "ACTIVE") {
    return c.json({ error: `order is ${existing[0].status}` }, 409);
  }

  await c.db
    .update(marketplaceOrder, { id: hash })
    .set({
      status: "FILLED",
      txHash: typeof txHash === "string" ? txHash : null,
      taker: typeof taker === "string" ? taker.toLowerCase() : null,
    });

  return c.json({ ok: true, orderHash: hash, status: "FILLED" });
});

/**
 * PUT /api/v1/marketplace/orders/:hash/cancel
 * Mark an order as cancelled.
 */
ponder.post("/api/v1/marketplace/orders/:hash/cancel", async (c) => {
  const hash = c.req.param("hash");
  if (!hash) return c.json({ error: "missing hash" }, 400);

  const body = await c.req.json().catch(() => null);
  const txHash = (body as Record<string, unknown>)?.txHash;

  const existing = await c.db
    .select()
    .from(marketplaceOrder)
    .where(eq(marketplaceOrder.id, hash))
    .limit(1);

  if (existing.length === 0) return c.json({ error: "not found" }, 404);
  if (existing[0].status !== "ACTIVE") {
    return c.json({ error: `order is ${existing[0].status}` }, 409);
  }

  await c.db
    .update(marketplaceOrder, { id: hash })
    .set({
      status: "CANCELLED",
      txHash: typeof txHash === "string" ? txHash : null,
    });

  return c.json({ ok: true, orderHash: hash, status: "CANCELLED" });
});

// Keep GraphQL API available when custom API routes are registered.
ponder.use("/graphql", graphql());
