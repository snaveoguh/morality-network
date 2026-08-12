import "server-only";

import crypto from "node:crypto";

import { sql } from "@/lib/db";

/**
 * Bearer API tokens (migration 011) — identity contract v1.
 *
 * Long-lived personal access tokens for cookieless clients (extension,
 * mobile). The raw token is `pat_<base64url>` and is shown exactly once at
 * mint time; only its SHA-256 ever touches the database.
 */

const TOKEN_TTL_DAYS = 90;

export const FULL_ACCESS_SCOPES = ["*"];

export interface ApiTokenIdentity {
  accountId: string | null;
  address: string | null;
  scopes: string[];
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Mint a bearer token for an authenticated subject. At least one of accountId
 * and address must be present (the DB CHECK enforces it too).
 */
export async function mintApiToken(params: {
  accountId?: string | null;
  address?: string | null;
  scopes?: string[];
}): Promise<{ token: string; expiresAt: string }> {
  const accountId = params.accountId ?? null;
  const address = params.address ?? null;
  if (!accountId && !address) {
    throw new Error("mintApiToken: need an accountId or an address");
  }
  const scopes = params.scopes?.length ? params.scopes : FULL_ACCESS_SCOPES;

  const token = `pat_${crypto.randomBytes(32).toString("base64url")}`;
  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60_000);

  await sql`
    INSERT INTO pooter.api_tokens (account_id, address, token_hash, scopes, expires_at)
    VALUES (${accountId}, ${address}, ${hashToken(token)}, ${scopes}, ${expiresAt})
  `;
  return { token, expiresAt: expiresAt.toISOString() };
}

/**
 * Resolve a presented token to its identity, touching last_used_at. Returns
 * null for unknown or expired tokens.
 */
export async function resolveApiToken(token: string): Promise<ApiTokenIdentity | null> {
  if (!token.startsWith("pat_")) return null;
  const rows = await sql<{ account_id: string | null; address: string | null; scopes: string[] }[]>`
    UPDATE pooter.api_tokens
    SET last_used_at = NOW()
    WHERE token_hash = ${hashToken(token)}
      AND expires_at > NOW()
    RETURNING account_id::TEXT, address, scopes
  `;
  const row = rows[0];
  if (!row) return null;
  return { accountId: row.account_id, address: row.address, scopes: row.scopes ?? [] };
}

/** Revoke a token (bearer logout). No-op if it doesn't exist. */
export async function revokeApiToken(token: string): Promise<void> {
  if (!token.startsWith("pat_")) return;
  await sql`DELETE FROM pooter.api_tokens WHERE token_hash = ${hashToken(token)}`;
}
