import "server-only";

import crypto from "node:crypto";

import { Redis } from "@upstash/redis";

/**
 * Where The Daily Pooter keeps its mailing list (Upstash Redis).
 *
 *   newsletter:subscribers   SET   confirmed addresses — the only list of
 *                                  addresses the send route reads from Redis
 *   newsletter:pending       ZSET  signed up, not yet confirmed; the score is
 *                                  the sign-up time in ms, which the emailed
 *                                  link is bound to
 *   newsletter:unsubscribed  SET   opt-outs, stored as a SHA-256 of the
 *                                  address: enough to never mail it again,
 *                                  without keeping the address of someone
 *                                  who left
 *   newsletter:confirmations:<day>:<hash>
 *                            INT   confirmation emails sent to one address
 *                                  today (expires on its own)
 *
 * Addresses are stored NFKC-normalised, lower-cased and trimmed.
 */

export const SUBSCRIBERS_KEY = "newsletter:subscribers";
export const PENDING_KEY = "newsletter:pending";
export const UNSUBSCRIBED_KEY = "newsletter:unsubscribed";

/** How long a sign-up may sit unconfirmed before its link stops working. */
export const PENDING_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Confirmation emails one address can be sent per UTC day, so the sign-up
 * form cannot be used to fill somebody's inbox.
 */
export const MAX_CONFIRMATIONS_PER_ADDRESS_PER_DAY = 3;

type NewsletterRedis = Pick<
  Redis,
  | "sadd"
  | "srem"
  | "sismember"
  | "smembers"
  | "scard"
  | "zadd"
  | "zscore"
  | "zrem"
  | "zremrangebyscore"
  | "incr"
  | "decr"
  | "expire"
>;

export function getNewsletterRedis(): NewsletterRedis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

/**
 * One spelling per mailbox. NFKC folds look-alike characters (a full-width
 * "＠" or "，") into the ASCII ones the validator below rejects.
 */
export function normalizeEmail(email: string): string {
  return email.normalize("NFKC").trim().toLowerCase();
}

// One mailbox, nothing else: no whitespace, no second "@", and none of the
// characters that would let a string be read as a display name, a group or a
// list of addresses (`Name <a@b.c>`, `a@b.c,d@e.f`).
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]+$/;

export function isValidEmail(email: string): boolean {
  if (email.length > 254 || !EMAIL_RE.test(email)) return false;
  for (let i = 0; i < email.length; i++) {
    const code = email.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return false;
  }
  return true;
}

/**
 * Addresses from the NEWSLETTER_RECIPIENTS env var: comma-separated, each
 * either `address` or `Name <address>` (the name is not used).
 */
export function parseOperatorRecipients(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((entry) => (/<([^<>]*)>\s*$/.exec(entry)?.[1] ?? entry).trim())
    .filter(Boolean);
}

/** What `newsletter:unsubscribed` holds for an address. */
export function optOutId(email: string): string {
  // The prefix keeps the Upstash client from ever reading a member as JSON.
  return `sha256:${crypto.createHash("sha256").update(email).digest("hex")}`;
}

function confirmationCountKey(email: string, now: number): string {
  const day = new Date(now).toISOString().slice(0, 10);
  const address = crypto.createHash("sha256").update(email).digest("hex").slice(0, 32);
  return `newsletter:confirmations:${day}:${address}`;
}

/**
 * Redis errors from Upstash end with ", command was: [...]", which contains
 * the address being handled. Keep that out of the logs.
 */
export function describeStoreError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split(", command was:")[0];
}

export async function isSubscribed(redis: NewsletterRedis, email: string): Promise<boolean> {
  return (await redis.sismember(SUBSCRIBERS_KEY, email)) === 1;
}

/**
 * Take one of today's confirmation emails for this address; false when the
 * day's allowance is used up. The count is a single atomic INCR, so sign-ups
 * racing each other cannot all get through.
 */
export async function claimConfirmation(
  redis: NewsletterRedis,
  email: string,
  now: number,
): Promise<boolean> {
  const key = confirmationCountKey(email, now);
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 2 * 24 * 60 * 60);
  return count <= MAX_CONFIRMATIONS_PER_ADDRESS_PER_DAY;
}

/** Hand back a claim whose email could not be sent, so the failure does not count. */
export async function releaseConfirmation(
  redis: NewsletterRedis,
  email: string,
  now: number,
): Promise<void> {
  await redis.decr(confirmationCountKey(email, now));
}

/**
 * Record a sign-up as pending. Called only once its confirmation email is on
 * its way, with the same timestamp the emailed link was minted for. Nothing is
 * added to the subscriber list here — that only happens in `confirmSubscriber`.
 */
export async function recordPendingSubscriber(
  redis: NewsletterRedis,
  email: string,
  requestedAt: number,
): Promise<void> {
  await pruneExpiredPending(redis, requestedAt);
  await redis.zadd(PENDING_KEY, { score: requestedAt, member: email });
}

/**
 * Forget sign-ups that were never confirmed. Runs on every sign-up and every
 * send; while the daily send is running, an unconfirmed address is gone
 * within a day of its link expiring.
 */
export async function pruneExpiredPending(redis: NewsletterRedis, now: number): Promise<void> {
  await redis.zremrangebyscore(PENDING_KEY, 0, now - PENDING_TTL_MS);
}

type ConfirmOutcome = "confirmed" | "already_subscribed" | "not_pending";

/**
 * Move an address from pending to subscribed.
 *
 * `linkExpiresAt` comes from the confirmation token and must be the expiry of
 * the sign-up that is pending right now. So a link works once, only the most
 * recently emailed link works, and an old link cannot be brought back to life
 * by signing the address up again — including after it has unsubscribed.
 */
export async function confirmSubscriber(
  redis: NewsletterRedis,
  email: string,
  linkExpiresAt: number,
  now: number = Date.now(),
): Promise<ConfirmOutcome> {
  const score = await redis.zscore(PENDING_KEY, email);
  const requestedAt = score === null ? null : Number(score);
  const live =
    requestedAt !== null &&
    now - requestedAt <= PENDING_TTL_MS &&
    pendingLinkExpiry(requestedAt) === linkExpiresAt;

  if (!live) {
    return (await redis.sismember(SUBSCRIBERS_KEY, email)) ? "already_subscribed" : "not_pending";
  }

  await redis.sadd(SUBSCRIBERS_KEY, email);
  await redis.srem(UNSUBSCRIBED_KEY, optOutId(email));
  await redis.zrem(PENDING_KEY, email);
  return "confirmed";
}

/**
 * When the link for a sign-up made at `requestedAt` expires, to the second
 * (the precision a token carries).
 */
export function pendingLinkExpiry(requestedAt: number): number {
  return Math.floor((requestedAt + PENDING_TTL_MS) / 1000) * 1000;
}

/**
 * Take an address off the list for good. The opt-out is written first, so if
 * anything fails part-way the address errs on the side of not being mailed.
 * It also covers addresses that are not in Redis at all (NEWSLETTER_RECIPIENTS).
 */
export async function unsubscribeEmail(redis: NewsletterRedis, email: string): Promise<void> {
  await redis.sadd(UNSUBSCRIBED_KEY, optOutId(email));
  await redis.srem(SUBSCRIBERS_KEY, email);
  await redis.zrem(PENDING_KEY, email);
}

/**
 * Everyone the next edition goes to: operator-configured addresses plus
 * confirmed subscribers, minus anyone who has unsubscribed. Pending sign-ups
 * are deliberately not read. Throws if Redis is unreachable — the caller must
 * not send without knowing who has opted out.
 */
export async function listNewsletterRecipients(
  redis: NewsletterRedis,
  operatorRecipients: string[],
): Promise<string[]> {
  const [subscribers, unsubscribed] = await Promise.all([
    redis.smembers(SUBSCRIBERS_KEY),
    redis.smembers(UNSUBSCRIBED_KEY),
  ]);

  const optedOut = new Set(unsubscribed.map(String));
  const recipients = new Set<string>();
  for (const entry of [...operatorRecipients, ...subscribers]) {
    const email = normalizeEmail(String(entry));
    if (email && !optedOut.has(optOutId(email))) recipients.add(email);
  }
  return Array.from(recipients);
}
