#!/usr/bin/env node
/**
 * Build the reconciled legacy MO ledger from the two morality.network exports.
 *
 * Sources (both live outside the repo — they carry PII and key material):
 *   1. account_profiles.csv          — app DB export, Jul 2024, 388 accounts
 *   2. morality_balance_sheet_*.csv  — audited balance sheet, Feb 2021, 140 rows
 *
 * Reconciliation rule (decided 2026-07-27):
 *   The 2021 balance sheet WINS for the 140 emails it covers — it is the
 *   audited figure. The 2024 profiles export fills in the other 261 accounts.
 *
 *   MainNetAmountMo is NOT credited. Those 10 users already moved that MO to
 *   Ethereum mainnet and hold it themselves; crediting it again would double-
 *   issue. It is carried as `legacy_mainnet_mo` for the record only.
 *
 * NOTHING derived from EncryptedPrivateKey or Salt is emitted. Those columns
 * are read past and dropped on the floor — the new platform is non-custodial.
 *
 * Usage:
 *   node scripts/build-legacy-ledger.mjs            # writes legacy-ledger.json
 *   node scripts/build-legacy-ledger.mjs --sql      # also writes seed SQL
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const HOME = os.homedir();
const PROFILES = process.env.LEGACY_PROFILES_CSV ||
  path.join(HOME, "account_profiles.csv");
const SHEET = process.env.LEGACY_SHEET_CSV ||
  path.join(HOME, "Downloads/Telegram Desktop/morality_balance_sheet_2_18_2021.csv");

const OUT_DIR = path.join(process.cwd(), "scripts", "out");

// ── CSV parsing ────────────────────────────────────────────────────────────
// Both files are simple comma-separated with no quoted commas. Verified by
// field-count check below — bail loudly rather than silently mis-parse.
function readRows(file, expectedFields) {
  const text = fs.readFileSync(file, "utf8").replace(/^﻿/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = lines[0].split(",");
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",");
    if (cells.length !== expectedFields) {
      throw new Error(
        `${path.basename(file)} line ${i + 1}: expected ${expectedFields} fields, got ${cells.length}`,
      );
    }
    rows.push(cells);
  }
  return { header, rows };
}

const norm = (s) => (s || "").trim().toLowerCase();
const num = (s) => {
  const v = Number.parseFloat((s || "0").trim() || "0");
  return Number.isFinite(v) ? v : 0;
};

// ── 1. account_profiles.csv ────────────────────────────────────────────────
// Columns: Id, Email, Id, Address, EncryptedPrivateKey, Salt,
//          VirtualMOBalance, ETHBalance, MOBalance
const profiles = new Map();
{
  const { rows } = readRows(PROFILES, 9);
  for (const c of rows) {
    const email = norm(c[1]);
    if (!email.includes("@")) continue;
    profiles.set(email, {
      email,
      legacyId: c[2].trim(),
      address: norm(c[3]),
      // c[4] EncryptedPrivateKey and c[5] Salt are deliberately not read.
      virtualMo: num(c[6]),
    });
  }
}

// ── 2. morality_balance_sheet_2_18_2021.csv ────────────────────────────────
// NOTE: the header row is MISLABELLED. Declared order is
//   Email, CreditAmountMo, MainNetAmountMo, AmountEth, EthereumAddress
// but columns 4 and 5 are swapped in the data. Real order is
//   Email, CreditAmountMo, MainNetAmountMo, EthereumAddress, AmountEth
// Verified: every one of the 127 overlapping rows has an address identical to
// the same user's Address in account_profiles.csv.
const sheet = new Map();
{
  const { rows } = readRows(SHEET, 5);
  for (const c of rows) {
    const email = norm(c[0]);
    if (!email.includes("@")) continue;
    const addr = norm(c[3]);
    if (addr && !addr.startsWith("0x")) {
      throw new Error(`balance sheet column 4 is not an address for ${email.slice(0, 3)}*** — check column order`);
    }
    sheet.set(email, {
      email,
      creditMo: num(c[1]),
      mainnetMo: num(c[2]),
      address: addr,
      eth: num(c[4]),
    });
  }
}

// ── 3. Reconcile ───────────────────────────────────────────────────────────
const emails = [...new Set([...profiles.keys(), ...sheet.keys()])].sort();
const accounts = emails.map((email) => {
  const p = profiles.get(email);
  const s = sheet.get(email);
  // 2021 audited sheet wins where it exists; 2024 export fills the gaps.
  const source = s ? "balance_sheet_2021" : "account_profiles_2024";
  const openingMo = s ? s.creditMo : p.virtualMo;
  return {
    email,
    openingMo,
    source,
    legacyAddress: (s && s.address) || (p && p.address) || null,
    legacyMainnetMo: s ? s.mainnetMo : 0,
    legacyEth: s ? s.eth : 0,
    // kept for audit: what the other source said
    profilesVirtualMo: p ? p.virtualMo : null,
    sheetCreditMo: s ? s.creditMo : null,
  };
});

// ── 4. Report ──────────────────────────────────────────────────────────────
const funded = accounts.filter((a) => a.openingMo > 0);
const total = accounts.reduce((t, a) => t + a.openingMo, 0);
const fromSheet = accounts.filter((a) => a.source === "balance_sheet_2021");
const withMainnet = accounts.filter((a) => a.legacyMainnetMo > 0);

console.log("── reconciled legacy MO ledger ──");
console.log(`profiles export (2024): ${profiles.size} accounts`);
console.log(`balance sheet (2021):   ${sheet.size} accounts`);
console.log(`union:                  ${accounts.length} accounts`);
console.log(`  from 2021 sheet:      ${fromSheet.length}`);
console.log(`  from 2024 export:     ${accounts.length - fromSheet.length}`);
console.log(`funded (MO > 0):        ${funded.length}`);
console.log(`total opening MO:       ${total.toFixed(8)}`);
console.log(`\nnot credited (already on mainnet): ${withMainnet.length} accounts, ` +
  `${withMainnet.reduce((t, a) => t + a.legacyMainnetMo, 0).toFixed(8)} MO`);

fs.mkdirSync(OUT_DIR, { recursive: true });
const jsonPath = path.join(OUT_DIR, "legacy-ledger.json");
fs.writeFileSync(jsonPath, JSON.stringify(accounts, null, 2));
console.log(`\nwrote ${jsonPath}`);

// ── 5. Optional SQL seed ───────────────────────────────────────────────────
if (process.argv.includes("--sql")) {
  const q = (v) => (v === null || v === undefined ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
  const lines = [
    "-- Generated by scripts/build-legacy-ledger.mjs — do not edit by hand.",
    "-- Idempotent: re-running will not double-credit (see ON CONFLICT).",
    "BEGIN;",
    "",
  ];
  for (const a of accounts) {
    lines.push(
      `INSERT INTO pooter.accounts (email, legacy_address, legacy_source, legacy_mainnet_mo, legacy_eth) ` +
        `VALUES (${q(a.email)}, ${q(a.legacyAddress)}, ${q(a.source)}, ${a.legacyMainnetMo}, ${a.legacyEth}) ` +
        `ON CONFLICT (email) DO NOTHING;`,
    );
  }
  lines.push("");
  for (const a of funded) {
    lines.push(
      `INSERT INTO pooter.mo_ledger (account_id, delta, reason, ref) ` +
        `SELECT id, ${a.openingMo}, 'legacy_migration', ${q(a.source)} FROM pooter.accounts WHERE email = ${q(a.email)} ` +
        `ON CONFLICT (account_id) WHERE reason = 'legacy_migration' DO NOTHING;`,
    );
  }
  lines.push("", "COMMIT;", "");
  const sqlPath = path.join(OUT_DIR, "legacy-ledger.sql");
  fs.writeFileSync(sqlPath, lines.join("\n"));
  console.log(`wrote ${sqlPath}`);
}
