import { and, desc, eq, gte, graphql, inArray, lte, lt } from "@ponder/core";
import { ponder } from "@/generated";
import { entity, feedItem, scannerLaunch } from "../../ponder.schema";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
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

ponder.get("/", (c) => {
  return c.json({
    service: "pooter-world-indexer",
    endpoints: [
      "/graphql",
      "/api/v1/health",
      "/api/v1/entities/:entityHash",
      "/api/v1/entities/:entityHash/feed",
      "/api/v1/feed/global",
      "/api/v1/scanner/launches",
      "/api/v1/scanner/sync",
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

ponder.post("/api/v1/scanner/sync", async (c) => {
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

    await c.db
      .insert(scannerLaunch)
      .values({
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
      })
      .onConflictDoUpdate({
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

    upserted += 1;
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
    meta: {
      query,
      generatedAt: Date.now(),
    },
  });
});

// Keep GraphQL API available when custom API routes are registered.
ponder.use("/graphql", graphql());
