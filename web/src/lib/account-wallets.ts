import "server-only";

import crypto from "node:crypto";
import { getAddress, isAddress, verifyMessage, type Address } from "viem";

import { sql } from "@/lib/db";

/**
 * Self-custody wallets linked to platform accounts (migration 007).
 *
 * The server never sees a private key or a mnemonic. A wallet is generated in
 * the browser; all that arrives here is an address and a signature proving the
 * user controlled it at link time.
 */

export interface LinkedWallet {
  id: string;
  address: Address;
  isPrimary: boolean;
  origin: "generated" | "connected";
  linkedAt: string;
}

const NONCE_TTL_MINUTES = 15;

/**
 * The joining rule of identity contract v1: a wallet address that exists in
 * pooter.account_wallets resolves to that account — one identity whether the
 * user arrived via SIWE or via email login.
 */
export async function findAccountIdByAddress(address: string): Promise<string | null> {
  if (!isAddress(address)) return null;
  const rows = await sql<{ account_id: string }[]>`
    SELECT account_id::TEXT FROM pooter.account_wallets
    WHERE LOWER(address) = ${address.toLowerCase()}
    LIMIT 1
  `;
  return rows[0]?.account_id ?? null;
}

export async function getLinkedWallets(accountId: string): Promise<LinkedWallet[]> {
  const rows = await sql<
    { id: string; address: string; is_primary: boolean; origin: string; linked_at: Date }[]
  >`
    SELECT id::TEXT, address, is_primary, origin, linked_at
    FROM pooter.account_wallets
    WHERE account_id = ${accountId}
    ORDER BY is_primary DESC, linked_at DESC
  `;
  return rows.map((r) => ({
    id: r.id,
    address: getAddress(r.address),
    isPrimary: r.is_primary,
    origin: r.origin as LinkedWallet["origin"],
    linkedAt: r.linked_at.toISOString(),
  }));
}

/** Mint a single-use challenge for the user to sign. */
export async function createLinkNonce(accountId: string): Promise<string> {
  const nonce = crypto.randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + NONCE_TTL_MINUTES * 60_000);
  await sql`
    INSERT INTO pooter.wallet_link_nonces (nonce, account_id, expires_at)
    VALUES (${nonce}, ${accountId}, ${expiresAt})
  `;
  return nonce;
}

/** The exact text the user signs. Must be reproduced byte-for-byte client-side. */
export function buildLinkMessage(params: { email: string; address: string; nonce: string }): string {
  return [
    "pooter.world — link this wallet to your account",
    "",
    `Account: ${params.email}`,
    `Wallet: ${getAddress(params.address)}`,
    `Nonce: ${params.nonce}`,
    "",
    "Signing this proves you control the wallet. It costs nothing and grants",
    "pooter.world no ability to move your funds.",
  ].join("\n");
}

export type LinkResult =
  | { ok: true; wallet: LinkedWallet }
  | { ok: false; error: string };

/**
 * Verify a signature and link the wallet.
 *
 * The nonce is consumed atomically (UPDATE ... WHERE used_at IS NULL) so a
 * replay loses the race rather than linking twice.
 */
export async function linkWallet(params: {
  accountId: string;
  email: string;
  address: string;
  signature: string;
  nonce: string;
  origin: "generated" | "connected";
}): Promise<LinkResult> {
  const { accountId, email, address, signature, nonce, origin } = params;

  if (!isAddress(address)) return { ok: false, error: "That is not a valid Ethereum address" };
  const checksummed = getAddress(address);

  const consumed = await sql<{ nonce: string }[]>`
    UPDATE pooter.wallet_link_nonces
    SET used_at = NOW()
    WHERE nonce = ${nonce}
      AND account_id = ${accountId}
      AND used_at IS NULL
      AND expires_at > NOW()
    RETURNING nonce
  `;
  if (consumed.length === 0) {
    return { ok: false, error: "That link request expired. Start again." };
  }

  const message = buildLinkMessage({ email, address: checksummed, nonce });
  let valid = false;
  try {
    valid = await verifyMessage({ address: checksummed, message, signature: signature as `0x${string}` });
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, error: "Signature did not match that address" };

  // Claimed by someone else? Refuse — one address, one account, so a payout
  // can never be routed to a wallet two accounts both claim.
  const existing = await sql<{ account_id: string }[]>`
    SELECT account_id::TEXT FROM pooter.account_wallets WHERE LOWER(address) = ${checksummed.toLowerCase()}
  `;
  if (existing.length > 0 && existing[0].account_id !== accountId) {
    return { ok: false, error: "That wallet is already linked to another account" };
  }
  if (existing.length > 0) {
    return { ok: false, error: "That wallet is already linked to your account" };
  }

  const rows = await sql<
    { id: string; address: string; is_primary: boolean; origin: string; linked_at: Date }[]
  >`
    WITH demoted AS (
      UPDATE pooter.account_wallets SET is_primary = FALSE
      WHERE account_id = ${accountId} AND is_primary
      RETURNING 1
    )
    INSERT INTO pooter.account_wallets
      (account_id, address, is_primary, origin, proof_message, proof_signature)
    VALUES
      (${accountId}, ${checksummed}, TRUE, ${origin}, ${message}, ${signature})
    RETURNING id::TEXT, address, is_primary, origin, linked_at
  `;

  const r = rows[0];
  return {
    ok: true,
    wallet: {
      id: r.id,
      address: getAddress(r.address),
      isPrimary: r.is_primary,
      origin: r.origin as LinkedWallet["origin"],
      linkedAt: r.linked_at.toISOString(),
    },
  };
}
