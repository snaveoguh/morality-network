#!/usr/bin/env node
/**
 * Run all SQL migrations in web/migrations/ in alphabetical order.
 * Skips files already recorded in pooter.schema_migrations.
 *
 * Usage:
 *   DATABASE_URL='...' node scripts/migrate.js
 *
 * Idempotent: re-running is a no-op once migrations are applied.
 * Each migration runs in a single transaction. SQL files should themselves
 * be idempotent (use IF NOT EXISTS) so partial application is recoverable.
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const postgres = require("postgres");

const MIGRATIONS_DIR = path.join(__dirname, "..", "migrations");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const sql = postgres(url, { max: 1 });

  // Make sure the migrations table exists before we query it. The first
  // migration should also create it, but if it doesn't exist yet we need to
  // bootstrap before recording anything.
  await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS pooter`);
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS pooter.schema_migrations (
      filename    TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      checksum    TEXT
    )
  `);

  const applied = new Set(
    (await sql`SELECT filename FROM pooter.schema_migrations`).map(
      (r) => r.filename,
    ),
  );

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let appliedThisRun = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`  skip   ${file}`);
      continue;
    }
    const fullPath = path.join(MIGRATIONS_DIR, file);
    const body = fs.readFileSync(fullPath, "utf-8");
    const checksum = crypto.createHash("sha256").update(body).digest("hex");
    console.log(`  apply  ${file} (${checksum.slice(0, 8)})`);

    try {
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`INSERT INTO pooter.schema_migrations (filename, checksum) VALUES (${file}, ${checksum})`;
      });
      appliedThisRun += 1;
    } catch (err) {
      console.error(`\n  FAIL   ${file}`);
      console.error(`  ${err.message}\n`);
      await sql.end();
      process.exit(1);
    }
  }

  if (appliedThisRun === 0) {
    console.log("  (no pending migrations)");
  } else {
    console.log(`  ${appliedThisRun} migration(s) applied`);
  }
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
