import "server-only";

import type { IronSession } from "iron-session";
import { SiweMessage } from "siwe";

import { findAccountIdByAddress } from "@/lib/account-wallets";
import { getAccountById } from "@/lib/accounts";
import type { SessionData } from "@/lib/session";

/**
 * Shared SIWE login: verify a message + signature against the session nonce,
 * then populate the session. Used by POST /api/auth/verify (cookie login) and
 * POST /api/auth/token (bearer token mint) so the two can never drift.
 *
 * Identity join: if the address is linked in pooter.account_wallets, the
 * session also gains accountId/accountEmail — a SIWE login lands in the same
 * identity as an email login. The join is best-effort; a DB outage must not
 * break wallet login.
 */

export type SiweLoginResult =
  | { ok: true; address: string; chainId: number; accountId: string | null }
  | { ok: false; status: number; error: string; debug?: Record<string, unknown> };

/** How far a client-nonce SIWE message's issuedAt may sit from server time. */
const ISSUED_AT_WINDOW_MS = 10 * 60_000;

/**
 * Stateless SIWE verification for cookieless clients (extension, mobile) —
 * used by POST /api/auth/token when the message carries a CLIENT-generated
 * nonce instead of one minted by GET /api/auth/nonce.
 *
 * Replay protection here is the issued-at freshness window (±10 min) plus the
 * signature itself; there is no server-stored nonce to consume. The blast
 * radius of a replay is another bearer token for the same address, which the
 * attacker would already need a TLS-intercepted signature to obtain.
 */
export async function siweVerifyStateless(
  message: string,
  signature: string,
): Promise<SiweLoginResult> {
  let siweMessage: SiweMessage;
  try {
    siweMessage = new SiweMessage(message);
  } catch (error) {
    return {
      ok: false,
      status: 400,
      error: "Verification failed",
      debug: { detail: error instanceof Error ? error.message : "unknown" },
    };
  }

  const issuedAtMs = Date.parse(siweMessage.issuedAt ?? "");
  if (!Number.isFinite(issuedAtMs) || Math.abs(Date.now() - issuedAtMs) > ISSUED_AT_WINDOW_MS) {
    return {
      ok: false,
      status: 401,
      error: "Message issuedAt is missing or outside the freshness window",
      debug: { issuedAt: siweMessage.issuedAt ?? null, windowMs: ISSUED_AT_WINDOW_MS },
    };
  }

  // Signature + address only — nonce is client-generated, domain skipped for
  // the same Cloudflare/Railway hostname reasons as the cookie flow below.
  const result = await siweMessage.verify({ signature }, { suppressExceptions: true });
  if (!result.success) {
    return {
      ok: false,
      status: 401,
      error: "Invalid signature",
      debug: { verifyError: String(result.error?.type ?? result.error ?? "unknown") },
    };
  }

  let accountId: string | null = null;
  try {
    accountId = await findAccountIdByAddress(result.data.address);
  } catch {
    accountId = null; // best-effort join
  }
  return { ok: true, address: result.data.address, chainId: result.data.chainId, accountId };
}

export async function siweLogin(
  session: IronSession<SessionData>,
  message: string,
  signature: string,
): Promise<SiweLoginResult> {
  if (!session.nonce) {
    return {
      ok: false,
      status: 400,
      error: "Missing SIWE nonce — session cookie not found. Clear cookies and retry.",
    };
  }

  let siweMessage: SiweMessage;
  try {
    siweMessage = new SiweMessage(message);
  } catch (error) {
    session.destroy();
    return {
      ok: false,
      status: 400,
      error: "Verification failed",
      debug: { detail: error instanceof Error ? error.message : "unknown" },
    };
  }

  const sessionNonce = session.nonce;

  // Verify signature + nonce only. Skip domain verification because
  // behind Cloudflare + Railway the server-side hostname often differs
  // from the browser origin (pooter.world). The request is same-origin
  // (enforced by SameSite cookie + CORS), so domain spoofing isn't a risk.
  const result = await siweMessage.verify(
    { signature, nonce: sessionNonce },
    { suppressExceptions: true },
  );

  if (!result.success) {
    session.destroy();
    return {
      ok: false,
      status: 401,
      error: "Invalid signature",
      debug: {
        nonceMatch: sessionNonce === siweMessage.nonce,
        sessionNonceLen: sessionNonce.length,
        messageNonceLen: siweMessage.nonce?.length ?? 0,
        messageDomain: siweMessage.domain,
        verifyError: String(result.error?.type ?? result.error ?? "unknown"),
      },
    };
  }

  session.address = result.data.address;
  session.chainId = result.data.chainId;
  session.siweIssuedAt = result.data.issuedAt ?? new Date().toISOString();
  delete session.nonce;

  let accountId: string | null = null;
  try {
    accountId = await findAccountIdByAddress(result.data.address);
    if (accountId) {
      const account = await getAccountById(accountId);
      if (account) {
        session.accountId = accountId;
        session.accountEmail = account.email;
      } else {
        accountId = null;
      }
    }
  } catch {
    accountId = null; // best-effort join — never block a valid SIWE login
  }

  await session.save();
  return { ok: true, address: result.data.address, chainId: result.data.chainId, accountId };
}
