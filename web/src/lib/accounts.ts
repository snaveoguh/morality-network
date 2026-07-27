import "server-only";

import crypto from "node:crypto";
import { sql } from "@/lib/db";

/**
 * Platform accounts + MO balances (migration 006).
 *
 * Non-custodial by design: an account is an email address and a balance. The
 * legacy morality.network exports carried an encrypted private key per user;
 * none of it is stored here, and none of it should ever be imported.
 */

export interface AccountRow {
  id: string;
  email: string;
  display_name: string | null;
  legacy_address: string | null;
  legacy_source: string | null;
  legacy_mainnet_mo: string;
  legacy_eth: string;
  created_at: Date;
  last_login_at: Date | null;
}

export interface LedgerEntry {
  id: string;
  delta: string;
  reason: string;
  ref: string | null;
  created_at: Date;
}

export interface AccountSummary {
  id: string;
  email: string;
  displayName: string | null;
  balanceMo: string;
  legacyAddress: string | null;
  legacyMainnetMo: string;
  legacyEth: string;
  createdAt: string;
  lastLoginAt: string | null;
}

const TOKEN_TTL_MINUTES = 20;

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function getAccountByEmail(email: string): Promise<AccountRow | null> {
  const rows = await sql<AccountRow[]>`
    SELECT * FROM pooter.accounts WHERE email = ${normalizeEmail(email)} LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function getAccountById(id: string): Promise<AccountRow | null> {
  const rows = await sql<AccountRow[]>`
    SELECT * FROM pooter.accounts WHERE id = ${id} LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function getBalanceMo(accountId: string): Promise<string> {
  const rows = await sql<{ balance_mo: string }[]>`
    SELECT COALESCE(SUM(delta), 0)::TEXT AS balance_mo
    FROM pooter.mo_ledger WHERE account_id = ${accountId}
  `;
  return rows[0]?.balance_mo ?? "0";
}

export async function getLedger(accountId: string, limit = 100): Promise<LedgerEntry[]> {
  return sql<LedgerEntry[]>`
    SELECT id::TEXT, delta::TEXT, reason, ref, created_at
    FROM pooter.mo_ledger
    WHERE account_id = ${accountId}
    ORDER BY created_at DESC, id DESC
    LIMIT ${limit}
  `;
}

export async function getAccountSummary(accountId: string): Promise<AccountSummary | null> {
  const account = await getAccountById(accountId);
  if (!account) return null;
  const balanceMo = await getBalanceMo(accountId);
  return {
    id: String(account.id),
    email: account.email,
    displayName: account.display_name,
    balanceMo,
    legacyAddress: account.legacy_address,
    legacyMainnetMo: account.legacy_mainnet_mo,
    legacyEth: account.legacy_eth,
    createdAt: account.created_at.toISOString(),
    lastLoginAt: account.last_login_at ? account.last_login_at.toISOString() : null,
  };
}

/**
 * Mint a single-use login token for an account.
 *
 * Only the SHA-256 of the token is persisted — a database leak yields no
 * usable login links. The caller emails the raw token and then discards it.
 */
export async function createLoginToken(accountId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60_000);

  // One live link at a time — requesting a new one invalidates the previous.
  await sql`
    UPDATE pooter.login_tokens
    SET used_at = NOW()
    WHERE account_id = ${accountId} AND used_at IS NULL
  `;
  await sql`
    INSERT INTO pooter.login_tokens (token_hash, account_id, expires_at)
    VALUES (${hashToken(token)}, ${accountId}, ${expiresAt})
  `;
  return token;
}

/**
 * Redeem a login token. Returns the account id, or null if the token is
 * unknown, expired, or already used. The UPDATE ... WHERE used_at IS NULL is
 * what makes redemption atomic — two concurrent requests cannot both win.
 */
export async function consumeLoginToken(token: string): Promise<string | null> {
  if (!token) return null;
  const rows = await sql<{ account_id: string }[]>`
    UPDATE pooter.login_tokens
    SET used_at = NOW()
    WHERE token_hash = ${hashToken(token)}
      AND used_at IS NULL
      AND expires_at > NOW()
    RETURNING account_id::TEXT
  `;
  const accountId = rows[0]?.account_id;
  if (!accountId) return null;

  await sql`UPDATE pooter.accounts SET last_login_at = NOW() WHERE id = ${accountId}`;
  return accountId;
}

/** Format a NUMERIC(38,8) string for display — thousands separators, no dust. */
export function formatMo(value: string): string {
  const n = Number.parseFloat(value || "0");
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits: n < 1 ? 8 : 2,
  });
}
