import "server-only";

import { Redis } from "@upstash/redis";

/**
 * Where The Daily Pooter keeps its mailing list (Upstash Redis).
 *
 *   newsletter:subscribers   SET   confirmed addresses — the only list the
 *                                  send route ever reads from Redis
 *   newsletter:pending       ZSET  signed up, not yet confirmed; the score is
 *                                  the request time in ms so stale entries
 *                                  can be dropped
 *   newsletter:unsubscribed  SET   opted out; never mailed again until the
 *                                  address confirms a new sign-up
 *
 * Addresses are stored lower-cased and trimmed.
 */

export const SUBSCRIBERS_KEY = "newsletter:subscribers";
export const PENDING_KEY = "newsletter:pending";
export const UNSUBSCRIBED_KEY = "newsletter:unsubscribed";

/** How long a sign-up may sit unconfirmed before it is forgotten. */
export const PENDING_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Minimum gap between confirmation emails to one address, so the sign-up form
 * cannot be used to fill somebody's inbox.
 */
export const CONFIRMATION_COOLDOWN_MS = 10 * 60 * 1000;

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
>;

export function getNewsletterRedis(): NewsletterRedis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
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

type SignupOutcome = "already_subscribed" | "recently_requested" | "pending";

/**
 * Record a sign-up as pending. Nothing is added to the subscriber list here —
 * that only happens in `confirmSubscriber`, once the owner of the mailbox has
 * followed the emailed link.
 */
export async function addPendingSubscriber(
  redis: NewsletterRedis,
  email: string,
  now: number = Date.now(),
): Promise<SignupOutcome> {
  if (await redis.sismember(SUBSCRIBERS_KEY, email)) return "already_subscribed";

  // Unconfirmed addresses are other people's data until proven otherwise:
  // drop the ones whose link has expired.
  await redis.zremrangebyscore(PENDING_KEY, 0, now - PENDING_TTL_MS);

  const requestedAt = await redis.zscore(PENDING_KEY, email);
  if (requestedAt !== null && now - Number(requestedAt) < CONFIRMATION_COOLDOWN_MS) {
    return "recently_requested";
  }

  await redis.zadd(PENDING_KEY, { score: now, member: email });
  return "pending";
}

/** Undo `addPendingSubscriber` when the confirmation email could not be sent. */
export async function removePendingSubscriber(
  redis: NewsletterRedis,
  email: string,
): Promise<void> {
  await redis.zrem(PENDING_KEY, email);
}

type ConfirmOutcome = "confirmed" | "already_subscribed" | "not_pending";

/**
 * Move an address from pending to subscribed. A confirmation link only works
 * while its sign-up is still pending, so it is single-use and cannot bring a
 * subscription back after the address has unsubscribed.
 */
export async function confirmSubscriber(
  redis: NewsletterRedis,
  email: string,
  now: number = Date.now(),
): Promise<ConfirmOutcome> {
  const requestedAt = await redis.zscore(PENDING_KEY, email);
  if (requestedAt === null || now - Number(requestedAt) > PENDING_TTL_MS) {
    return (await redis.sismember(SUBSCRIBERS_KEY, email))
      ? "already_subscribed"
      : "not_pending";
  }

  await redis.sadd(SUBSCRIBERS_KEY, email);
  await redis.srem(UNSUBSCRIBED_KEY, email);
  await redis.zrem(PENDING_KEY, email);
  return "confirmed";
}

/**
 * Take an address off the list for good. The opt-out is written first, so if
 * anything fails part-way the address errs on the side of not being mailed.
 * It also covers addresses that are not in Redis at all (NEWSLETTER_RECIPIENTS).
 */
export async function unsubscribeEmail(redis: NewsletterRedis, email: string): Promise<void> {
  await redis.sadd(UNSUBSCRIBED_KEY, email);
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

  const optedOut = new Set(unsubscribed.map((entry) => normalizeEmail(String(entry))));
  const recipients = new Set<string>();
  for (const entry of [...operatorRecipients, ...subscribers]) {
    const email = normalizeEmail(String(entry));
    if (email && !optedOut.has(email)) recipients.add(email);
  }
  return Array.from(recipients);
}
