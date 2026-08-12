import "server-only";

import { findAccountIdByAddress } from "@/lib/account-wallets";
import { resolveApiToken } from "@/lib/api-tokens";
import { getSession } from "@/lib/session";

/**
 * The single auth helper — identity contract v1.
 *
 * Accepts either `Authorization: Bearer pat_...` (see lib/api-tokens.ts) or
 * the iron-session cookie, and resolves both to the same shape. Routes that
 * take getAuthContext work for the web app, the extension and mobile alike.
 *
 * Joining rule: a wallet address present in pooter.account_wallets resolves
 * to that account's accountId, so a SIWE login and an email login by the same
 * person are one identity.
 */

export interface AuthContext {
  accountId?: string;
  address?: string;
  scopes: string[];
  /** How the caller authenticated — lets logout revoke the right thing. */
  via: "bearer" | "session";
}

const BEARER_PREFIX = "Bearer ";

/** The raw pat_ token from the request, if one was presented. */
export function bearerToken(request: Request | undefined): string | null {
  const header = request?.headers.get("authorization")?.trim();
  if (!header || !header.startsWith(BEARER_PREFIX)) return null;
  const token = header.slice(BEARER_PREFIX.length).trim();
  return token.startsWith("pat_") ? token : null;
}

/**
 * Resolve the caller's identity, or null if unauthenticated.
 *
 * The joining lookup is best-effort: if Postgres is unreachable the session
 * identity still comes back, just without the cross-populated accountId.
 */
export async function getAuthContext(request?: Request): Promise<AuthContext | null> {
  const token = bearerToken(request);
  if (token) {
    const identity = await resolveApiToken(token);
    if (!identity) return null;
    let accountId = identity.accountId ?? undefined;
    if (!accountId && identity.address) {
      try {
        accountId = (await findAccountIdByAddress(identity.address)) ?? undefined;
      } catch {
        // best-effort join
      }
    }
    return {
      accountId,
      address: identity.address ?? undefined,
      scopes: identity.scopes,
      via: "bearer",
    };
  }

  const session = await getSession();
  if (!session.accountId && !session.address) return null;

  let accountId = session.accountId;
  if (!accountId && session.address) {
    try {
      accountId = (await findAccountIdByAddress(session.address)) ?? undefined;
    } catch {
      // best-effort join
    }
  }
  return {
    accountId,
    address: session.address,
    scopes: ["*"], // a full login is not scope-limited
    via: "session",
  };
}

/** True if the context may exercise the given scope ('*' grants everything). */
export function hasScope(ctx: AuthContext, scope: string): boolean {
  return ctx.scopes.includes("*") || ctx.scopes.includes(scope);
}
