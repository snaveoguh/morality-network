import { and, desc, eq, gte, graphql, inArray, lte, lt } from "@ponder/core";
import { ponder } from "@/generated";
import { entity, feedItem } from "../../ponder.schema";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const ZERO_ENTITY_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";

function parseLimit(value: string | undefined): number {
  const parsed = Number(value ?? DEFAULT_LIMIT);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(parsed), MAX_LIMIT);
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

ponder.get("/", (c) => {
  return c.json({
    service: "pooter-world-indexer",
    endpoints: [
      "/graphql",
      "/api/v1/health",
      "/api/v1/entities/:entityHash",
      "/api/v1/entities/:entityHash/feed",
      "/api/v1/feed/global",
    ],
    timestamp: Date.now(),
  });
});

ponder.get("/api/v1/health", (c) => {
  return c.json({ ok: true, timestamp: Date.now() });
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

  return c.json({
    data: {
      entity: serializeEntityRow(row),
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

// Keep GraphQL API available when custom API routes are registered.
ponder.use("/graphql", graphql());
