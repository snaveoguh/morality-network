// signals repo — unified signal feed.
//
// Producers (swarm, editorial, scanner, web-intel, council, pattern,
// wallet-flow, technical, market-data) write here. Trader reads from here.
// TTL trims stale rows.

import { sql, type SignalRow } from "../db";

export type SignalDirection = "bullish" | "bearish" | "neutral";

export type SignalProducer =
  | "swarm"
  | "editorial"
  | "scanner"
  | "web-intel"
  | "council"
  | "pattern"
  | "wallet-flow"
  | "technical"
  | "market-data";

export interface RecordSignalInput {
  id: string;
  producedAt: Date;
  producedBy: SignalProducer;
  symbol: string;
  direction: SignalDirection;
  strength: number;
  score?: number | null;
  claim?: string | null;
  entityHash?: string | null;
  marketImpact?: unknown | null;
  clusterId?: string | null;
  contradictionCount?: number | null;
  tokenAddress?: string | null;
  supportLevels?: number[];
  resistanceLevels?: number[];
  regime?: string | null;
  sourceDetail?: unknown | null;
  ttlExpiresAt?: Date | null;
}

export async function recordSignal(input: RecordSignalInput): Promise<void> {
  await sql`
    INSERT INTO pooter.signals (
      id, produced_at, produced_by, symbol, direction, strength, score, claim,
      entity_hash, market_impact_json, cluster_id, contradiction_count,
      token_address, support_levels, resistance_levels, regime, source_detail,
      ttl_expires_at
    ) VALUES (
      ${input.id},
      ${input.producedAt},
      ${input.producedBy},
      ${input.symbol},
      ${input.direction},
      ${input.strength},
      ${input.score ?? null},
      ${input.claim ?? null},
      ${input.entityHash ?? null},
      ${input.marketImpact ? sql.json(input.marketImpact as Parameters<typeof sql.json>[0]) : null},
      ${input.clusterId ?? null},
      ${input.contradictionCount ?? null},
      ${input.tokenAddress ?? null},
      ${input.supportLevels ?? []},
      ${input.resistanceLevels ?? []},
      ${input.regime ?? null},
      ${input.sourceDetail ? sql.json(input.sourceDetail as Parameters<typeof sql.json>[0]) : null},
      ${input.ttlExpiresAt ?? null}
    )
    ON CONFLICT (id) DO NOTHING
  `;
}

export async function recordSignalsBatch(
  inputs: RecordSignalInput[],
): Promise<void> {
  if (inputs.length === 0) return;
  // postgres-js handles arrays of objects via insert-many. Loop is fine for
  // batch sizes typical here (<500/cycle).
  for (const input of inputs) {
    await recordSignal(input);
  }
}

export async function getRecentSignalsForSymbols(
  symbols: string[],
  lookbackHours = 72,
): Promise<SignalRow[]> {
  if (symbols.length === 0) return [];
  const cutoff = new Date(Date.now() - lookbackHours * 3600_000);
  return sql<SignalRow[]>`
    SELECT * FROM pooter.signals
    WHERE symbol = ANY(${symbols}::text[])
      AND produced_at >= ${cutoff}
      AND (ttl_expires_at IS NULL OR ttl_expires_at > NOW())
    ORDER BY produced_at DESC
    LIMIT 500
  `;
}

export async function getRecentSignalsByProducer(
  producer: SignalProducer,
  lookbackHours = 24,
  limit = 200,
): Promise<SignalRow[]> {
  const cutoff = new Date(Date.now() - lookbackHours * 3600_000);
  return sql<SignalRow[]>`
    SELECT * FROM pooter.signals
    WHERE produced_by = ${producer}
      AND produced_at >= ${cutoff}
    ORDER BY produced_at DESC
    LIMIT ${limit}
  `;
}

/** Run periodically to delete signals past their TTL. Safe to call on every cycle. */
export async function pruneExpiredSignals(): Promise<number> {
  const rows = await sql`
    DELETE FROM pooter.signals
    WHERE ttl_expires_at IS NOT NULL AND ttl_expires_at < NOW()
    RETURNING id
  `;
  return rows.length;
}
