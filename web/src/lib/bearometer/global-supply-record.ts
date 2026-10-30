import "server-only";

import { createHash } from "node:crypto";
import { sql } from "../db";
import type { RegionReading } from "./global-supply-score";

// ============================================================================
// BEAROMETER — GLOBAL SIGNAL RECORD (migration 016)
// One row per indicator per snapshot, plus each scored headline once, so the
// readings can be checked against prices later. Same rules as the China
// record: separate from pooter.signals (the trader reads that), fail-soft,
// at most one write per 20 minutes per process.
// ============================================================================

const MIN_RECORD_GAP_MS = 20 * 60 * 1000;
let lastRecordedAt = 0;

export async function recordGlobalSupplySnapshot(generatedAt: string, regions: RegionReading[]): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  const now = Date.now();
  if (now - lastRecordedAt < MIN_RECORD_GAP_MS) return;
  lastRecordedAt = now;

  const recordedAt = new Date(generatedAt);
  try {
    for (const region of regions) {
      for (const reading of region.data) {
        await sql`
          INSERT INTO pooter.bearometer_global_readings (
            recorded_at, indicator_id, region, kind, label, pressure, latest, baseline, change, as_of, assets
          ) VALUES (
            ${recordedAt}, ${reading.def.id}, ${region.region.id}, 'data', ${reading.label},
            ${reading.pressure}, ${reading.latest}, ${reading.baseline}, ${reading.change},
            ${reading.asOf}, ${reading.def.assets.map((a) => a.asset)}
          )
          ON CONFLICT (indicator_id, recorded_at) DO NOTHING
        `;
      }
      for (const reading of region.news) {
        await sql`
          INSERT INTO pooter.bearometer_global_readings (
            recorded_at, indicator_id, region, kind, label, pressure, item_count, assets
          ) VALUES (
            ${recordedAt}, ${reading.def.id}, ${region.region.id}, 'news', ${reading.label},
            ${reading.pressure}, ${reading.itemCount}, ${reading.def.assets.map((a) => a.asset)}
          )
          ON CONFLICT (indicator_id, recorded_at) DO NOTHING
        `;
        for (const h of reading.headlines) {
          await sql`
            INSERT INTO pooter.bearometer_global_items (
              id, indicator_id, pub_date, source, direction, title, link
            ) VALUES (
              ${createHash("sha256").update(h.link || h.id).digest("hex")},
              ${reading.def.id},
              ${Number.isFinite(Date.parse(h.pubDate)) ? new Date(h.pubDate) : null},
              ${h.source}, ${h.direction}, ${h.title}, ${h.link}
            )
            ON CONFLICT (id) DO NOTHING
          `;
        }
      }
    }
  } catch (error) {
    console.warn(
      `[bearometer] global record failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
