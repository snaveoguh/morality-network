import "server-only";

import { createHash } from "node:crypto";
import { sql } from "../db";
import type { SupplyChainIndicator, TaggedSupplyChainItem } from "./supply-chain-score";

// ============================================================================
// BEAROMETER — SIGNAL RECORD
// Every fresh snapshot is written to Postgres with a timestamp so the
// indicators can be scored against price moves later (migration 015).
// Separate tables from pooter.signals on purpose: the trader reads that one.
// Fail-soft: no DATABASE_URL or a DB error never breaks the page.
// ============================================================================

const MIN_RECORD_GAP_MS = 20 * 60 * 1000;
let lastRecordedAt = 0;

function itemKey(item: TaggedSupplyChainItem): string {
  return createHash("sha256").update(item.link || item.id).digest("hex");
}

function toDate(value: string): Date | null {
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? new Date(ts) : null;
}

export async function recordSupplyChainSnapshot(
  generatedAt: string,
  tagged: TaggedSupplyChainItem[],
  indicators: SupplyChainIndicator[],
): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  const now = Date.now();
  if (now - lastRecordedAt < MIN_RECORD_GAP_MS) return;
  lastRecordedAt = now;

  try {
    for (const item of tagged) {
      await sql`
        INSERT INTO pooter.bearometer_supply_items (
          id, pub_date, source, source_kind, groups, direction, direction_by, title, link
        ) VALUES (
          ${itemKey(item)},
          ${toDate(item.pubDate)},
          ${item.source},
          ${item.sourceKind},
          ${item.groups},
          ${item.direction},
          ${item.directionBy},
          ${item.title},
          ${item.link}
        )
        ON CONFLICT (id) DO NOTHING
      `;
    }

    const recordedAt = new Date(generatedAt);
    for (const indicator of indicators) {
      await sql`
        INSERT INTO pooter.bearometer_supply_indicators (
          recorded_at, group_id, label, pressure, activity, item_count, ex_china_supply, exposed
        ) VALUES (
          ${recordedAt},
          ${indicator.group.id},
          ${indicator.label},
          ${indicator.pressure},
          ${indicator.activity},
          ${indicator.itemCount},
          ${indicator.group.exChinaSupply.map((t) => t.symbol)},
          ${indicator.group.exposed.map((t) => t.symbol)}
        )
        ON CONFLICT (group_id, recorded_at) DO NOTHING
      `;
    }
  } catch (error) {
    console.warn(
      `[bearometer] signal record failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
