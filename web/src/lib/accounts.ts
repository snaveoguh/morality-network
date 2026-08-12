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

/**
 * Fetch an account, creating it if this email has never been seen.
 *
 * There is deliberately no separate "sign up" flow: the same form does both.
 * A legacy morality.network holder finds their existing row and their MO
 * balance with it; anyone else gets a fresh account opening at zero. The user
 * cannot tell which happened from the response, which is the point — the
 * sign-in endpoint must not become a way to test whether an address is one of
 * the 401 legacy holders.
 */
export async function getOrCreateAccountByEmail(
  email: string,
): Promise<{ account: AccountRow; created: boolean }> {
  const normalized = normalizeEmail(email);
  const rows = await sql<(AccountRow & { is_new: boolean })[]>`
    INSERT INTO pooter.accounts (email)
    VALUES (${normalized})
    ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
    RETURNING *, (xmax = 0) AS is_new
  `;
  const { is_new, ...account } = rows[0];
  return { account: account as AccountRow, created: is_new };
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

export interface EthClaim {
  amountWei: string;
  amountEth: string;
  status: "pending" | "recovered" | "paid" | "void";
  legacyAddress: string;
  paidTxHash: string | null;
}

/**
 * The ETH this account is owed from the wallet the old platform held for them.
 * Amounts are exact wei — formatted here rather than stored as a float.
 */
export async function getEthClaim(accountId: string): Promise<EthClaim | null> {
  const rows = await sql<
    { amount_wei: string; status: string; legacy_address: string; paid_tx_hash: string | null }[]
  >`
    SELECT amount_wei::TEXT, status, legacy_address, paid_tx_hash
    FROM pooter.eth_claims
    WHERE account_id = ${accountId} AND status <> 'void'
    ORDER BY id
    LIMIT 1
  `;
  const r = rows[0];
  if (!r) return null;
  const wei = BigInt(r.amount_wei);
  return {
    amountWei: r.amount_wei,
    // 18 decimals, trailing zeros trimmed, never a float.
    amountEth: (() => {
      const s = wei.toString().padStart(19, "0");
      const whole = s.slice(0, -18);
      const frac = s.slice(-18).replace(/0+$/, "");
      return frac ? `${whole}.${frac}` : whole;
    })(),
    status: r.status as EthClaim["status"],
    legacyAddress: r.legacy_address,
    paidTxHash: r.paid_tx_hash,
  };
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
