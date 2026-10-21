#!/usr/bin/env node
/**
 * backfill-corrections.ts — corrections register backfill (prototype).
 *
 * Fetches ministerial corrections made in the window (default: last 12
 * months) from questions-statements-api (corrected written answers +
 * "Correction …" written statements) and Hansard (point-of-order oral
 * self-correction CANDIDATES), and writes the checked-in seed that lets
 * /ledger/corrections render without DATABASE_URL.
 *
 * With DATABASE_URL set it also upserts into pooter.ministerial_corrections
 * (migration 013). No AI calls anywhere.
 *
 * Usage (from web/):
 *   npm run ledger:backfill-corrections
 *   npm run ledger:backfill-corrections -- --from 2025-10-20 --to 2026-10-20 --no-oral
 */

import { writeFileSync } from "node:fs";
import path from "node:path";
import {
  computeCorrectionsStats,
  fetchCorrectionsWindow,
} from "../src/lib/ledger/corrections";

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const to = arg("--to") ?? new Date().toISOString().slice(0, 10);
const fromDefault = new Date(`${to}T00:00:00Z`);
fromDefault.setUTCFullYear(fromDefault.getUTCFullYear() - 1);
const from = arg("--from") ?? fromDefault.toISOString().slice(0, 10);
const includeOral = !args.includes("--no-oral");
const out = path.resolve(
  arg("--out") ?? path.join(__dirname, "..", "src", "data", "ledger-corrections-seed.json"),
);

async function main() {
  console.log(`[corrections] window ${from} → ${to} (oral candidates: ${includeOral})`);
  const corrections = await fetchCorrectionsWindow(from, to, { includeOral });
  const stats = computeCorrectionsStats(corrections);

  const seed = {
    generatedAt: new Date().toISOString(),
    window: { from, to },
    sources: [
      "https://questions-statements-api.parliament.uk/api/writtenquestions/questions?correctedWhenFrom=…",
      "https://questions-statements-api.parliament.uk/api/writtenstatements/statements (titles: Correction …)",
      ...(includeOral ? ["https://hansard-api.parliament.uk/search/contributions/Spoken.json (points of order)"] : []),
    ],
    corrections,
  };
  writeFileSync(out, `${JSON.stringify(seed, null, 1)}\n`);

  const byKind = corrections.reduce<Record<string, number>>((acc, c) => {
    acc[c.kind] = (acc[c.kind] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`[corrections] wrote ${corrections.length} rows → ${path.relative(process.cwd(), out)}`);
  console.log(`[corrections] by kind`, byKind);
  console.log(
    `[corrections] confirmed=${stats.total} review=${stats.needingReview} dated=${stats.dated} ` +
      `median=${stats.medianDays}d over30=${(stats.over30Days * 100).toFixed(0)}%`,
  );
  console.log(`[corrections] median by kind`, stats.medianDaysByKind);
  console.log(`[corrections] top departments`, stats.byDepartment.slice(0, 5));

  if (process.env.DATABASE_URL) {
    const { upsertCorrections } = await import("../src/lib/db/ledger-corrections");
    const n = await upsertCorrections(corrections);
    console.log(`[corrections] upserted ${n} rows into pooter.ministerial_corrections`);
    process.exit(0);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
