import "server-only";

import crypto from "node:crypto";

/**
 * Signed links for The Daily Pooter (confirm a sign-up, unsubscribe).
 *
 * A token is `<base64url(email)>.<expiry>.<base64url(HMAC-SHA256)>`. It carries
 * the address it is for, so the routes need no lookup table, and the MAC is
 * keyed with NEWSLETTER_TOKEN_SECRET, so only this server can mint one.
 *
 * The purpose is mixed into the MAC rather than stored in the token: a
 * confirmation link can never be replayed as an unsubscribe link or the other
 * way round.
 */

type NewsletterTokenPurpose = "confirm" | "unsubscribe";

/** Below this an offline guess at the key becomes realistic. */
const MIN_SECRET_LENGTH = 32;

const TOKEN_RE = /^([A-Za-z0-9_-]+)\.(\d{1,12})\.([A-Za-z0-9_-]{43})$/;

function getSecret(): string | null {
  const secret = process.env.NEWSLETTER_TOKEN_SECRET?.trim();
  return secret && secret.length >= MIN_SECRET_LENGTH ? secret : null;
}

/** False when NEWSLETTER_TOKEN_SECRET is unset or too short to be safe. */
export function newsletterTokensConfigured(): boolean {
  return getSecret() !== null;
}

function sign(secret: string, purpose: NewsletterTokenPurpose, body: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(`pooter-newsletter:v1:${purpose}:${body}`)
    .digest("base64url");
}

/**
 * Mint a token for one address. `expiresAt` is a millisecond timestamp; leave
 * it out for a link that must keep working (unsubscribe links sit in inboxes
 * for years).
 *
 * Throws when the secret is not configured — callers check
 * `newsletterTokensConfigured()` first so they can answer with a clean error
 * instead of sending mail whose links cannot work.
 */
export function createNewsletterToken(
  purpose: NewsletterTokenPurpose,
  email: string,
  options: { expiresAt?: number } = {},
): string {
  const secret = getSecret();
  if (!secret) {
    throw new Error(
      `NEWSLETTER_TOKEN_SECRET must be set to at least ${MIN_SECRET_LENGTH} characters`,
    );
  }
  const expiry = options.expiresAt ? Math.floor(options.expiresAt / 1000) : 0;
  const body = `${Buffer.from(email, "utf8").toString("base64url")}.${expiry}`;
  return `${body}.${sign(secret, purpose, body)}`;
}

/**
 * Returns the address a token was minted for, or null if the token is
 * malformed, altered, minted for another purpose, expired, or the secret is
 * not configured. Never throws.
 */
export function verifyNewsletterToken(
  purpose: NewsletterTokenPurpose,
  token: string | null | undefined,
  now: number = Date.now(),
): string | null {
  const secret = getSecret();
  if (!secret || typeof token !== "string") return null;

  const match = TOKEN_RE.exec(token);
  if (!match) return null;
  const [, encodedEmail, expiryText, signature] = match;

  // The MAC covers the exact characters received, so there is no second
  // spelling of a valid token. Compared in constant time.
  const expected = sign(secret, purpose, `${encodedEmail}.${expiryText}`);
  const given = Buffer.from(signature, "utf8");
  const wanted = Buffer.from(expected, "utf8");
  if (given.length !== wanted.length || !crypto.timingSafeEqual(given, wanted)) {
    return null;
  }

  const expiry = Number(expiryText);
  if (expiry !== 0 && now > expiry * 1000) return null;

  return Buffer.from(encodedEmail, "base64url").toString("utf8");
}
