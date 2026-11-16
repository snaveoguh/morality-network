import "server-only";

import crypto from "node:crypto";

import { isValidEmail } from "./store";

/**
 * Sends newsletter mail through Resend, one message per recipient.
 *
 * Every message has exactly one address in `to` and no cc/bcc, so no
 * subscriber can see another's address. Messages go out through Resend's
 * batch endpoint, which takes many separate emails in one HTTP call.
 *
 * Limits below are from Resend's docs as read on 2026-11-16:
 *   - POST /emails/batch accepts up to 100 emails per call
 *     (resend.com/docs/api-reference/emails/send-batch-emails)
 *   - a batch is rejected whole if any one email in it is invalid
 *     (resend.com/docs/dashboard/emails/batch-sending)
 *   - 10 requests per second per team by default; 429 with `retry-after`
 *     (resend.com/docs/api-reference/rate-limit)
 *   - requests need a User-Agent header
 *     (resend.com/docs/knowledge-base/403-error-1010)
 */

const RESEND_BATCH_URL = "https://api.resend.com/emails/batch";

/** Most emails Resend accepts in one batch call. */
export const RESEND_BATCH_LIMIT = 100;

/** Keeps a burst of calls under the default 10 requests/second team limit. */
const MIN_REQUEST_INTERVAL_MS = 120;

const MAX_ATTEMPTS = 3;
const MAX_RETRY_DELAY_MS = 5_000;

/** A request that hangs is abandoned and retried under the same idempotency key. */
const REQUEST_TIMEOUT_MS = 15_000;

export interface OutgoingEmail {
  /** Exactly one address. There is deliberately no way to pass several. */
  to: string;
  subject: string;
  html: string;
  headers?: Record<string, string>;
}

export interface DeliveryFailure {
  email: string;
  error: string;
  /** HTTP status from Resend, when the failure came from Resend. */
  status?: number;
}

interface DeliveryReport {
  /** Messages Resend accepted for delivery. */
  sent: number;
  failures: DeliveryFailure[];
}

interface DeliveryOptions {
  apiKey: string;
  from: string;
  /** Millisecond timestamp after which no further request is started. */
  deadline?: number;
  /** Test seam; defaults to a real timer. */
  sleep?: (ms: number) => Promise<void>;
}

interface ResendEmail {
  from: string;
  to: [string];
  subject: string;
  html: string;
  headers?: Record<string, string>;
}

type BatchOutcome =
  | { ok: true; ids: unknown[] | null }
  | { ok: false; error: string; status?: number; isolate: boolean };

interface DeliveryContext {
  apiKey: string;
  from: string;
  deadline: number;
  sleep: (ms: number) => Promise<void>;
  lastRequestAt: number;
  report: DeliveryReport;
}

/**
 * Send each email to its single recipient and report, per recipient, what
 * could not be sent. Never throws for a delivery problem.
 */
export async function deliverIndividually(
  emails: OutgoingEmail[],
  options: DeliveryOptions,
): Promise<DeliveryReport> {
  const context: DeliveryContext = {
    apiKey: options.apiKey,
    from: options.from,
    deadline: options.deadline ?? Number.POSITIVE_INFINITY,
    sleep: options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
    lastRequestAt: 0,
    report: { sent: 0, failures: [] },
  };

  // Anything that is not one plain address is reported, not sent: it would
  // either sink its whole batch or be read by the mail provider as something
  // other than a single mailbox.
  const deliverable: OutgoingEmail[] = [];
  for (const email of emails) {
    if (isValidEmail(email.to)) {
      deliverable.push(email);
    } else {
      context.report.failures.push({
        email: email.to,
        error: "Not a valid email address — not sent",
      });
    }
  }

  for (let start = 0; start < deliverable.length; start += RESEND_BATCH_LIMIT) {
    await deliverChunk(deliverable.slice(start, start + RESEND_BATCH_LIMIT), context);
  }
  return context.report;
}

async function deliverChunk(chunk: OutgoingEmail[], context: DeliveryContext): Promise<void> {
  const outcome = await postBatch(chunk, context);

  if (outcome.ok) {
    chunk.forEach((email, index) => {
      // Resend returns one `{ id }` per email, in request order.
      if (outcome.ids && !hasId(outcome.ids[index])) {
        context.report.failures.push({
          email: email.to,
          error: "Resend accepted the batch but returned no id for this message",
        });
      } else {
        context.report.sent += 1;
      }
    });
    return;
  }

  // Resend rejects a whole batch when one email in it is invalid. Halve the
  // batch and try again so the problem address is the only one that fails.
  if (outcome.isolate && chunk.length > 1) {
    const middle = Math.ceil(chunk.length / 2);
    await deliverChunk(chunk.slice(0, middle), context);
    await deliverChunk(chunk.slice(middle), context);
    return;
  }

  for (const email of chunk) {
    context.report.failures.push({
      email: email.to,
      error: outcome.error,
      ...(outcome.status ? { status: outcome.status } : {}),
    });
  }
}

async function postBatch(chunk: OutgoingEmail[], context: DeliveryContext): Promise<BatchOutcome> {
  const payload: ResendEmail[] = chunk.map((email) => ({
    from: context.from,
    to: [email.to],
    subject: email.subject,
    html: email.html,
    ...(email.headers ? { headers: email.headers } : {}),
  }));

  // Last line of defence for the property this module exists for.
  for (const email of payload) {
    if (!Array.isArray(email.to) || email.to.length !== 1) {
      throw new Error("Refusing to send: a newsletter message must have exactly one recipient");
    }
  }

  const body = JSON.stringify(payload);
  // Reused across retries of this exact body, so a retry after a dropped
  // response cannot deliver the batch twice (Resend keeps keys for 24 hours).
  const idempotencyKey = crypto.randomUUID();

  let failure: BatchOutcome = { ok: false, error: "Not attempted", isolate: false };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (Date.now() > context.deadline) {
      return { ok: false, error: "Not attempted — the send ran out of time", isolate: false };
    }

    const wait = context.lastRequestAt + MIN_REQUEST_INTERVAL_MS - Date.now();
    if (wait > 0) await context.sleep(wait);
    context.lastRequestAt = Date.now();

    let response: Response;
    try {
      response = await fetch(RESEND_BATCH_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${context.apiKey}`,
          "Content-Type": "application/json",
          "User-Agent": "pooter-newsletter/1.0",
          "Idempotency-Key": idempotencyKey,
        },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      failure = {
        ok: false,
        error: `Could not reach Resend: ${error instanceof Error ? error.message : String(error)}`,
        isolate: false,
      };
      if (attempt < MAX_ATTEMPTS) await context.sleep(attempt * 500);
      continue;
    }

    if (response.ok) {
      const data = await response.json().catch(() => null);
      return { ok: true, ids: Array.isArray(data?.data) ? data.data : null };
    }

    const { name, message } = await readResendError(response);
    failure = {
      ok: false,
      status: response.status,
      error: message,
      // 400/422 are Resend's validation errors, the only kind one bad
      // address can cause.
      isolate: response.status === 400 || response.status === 422,
    };

    const retryable =
      response.status >= 500 ||
      name === "concurrent_idempotent_requests" ||
      // A quota that has run out (daily_quota_exceeded, monthly_quota_exceeded)
      // will not come back by waiting a second; only the rate limit will.
      (response.status === 429 && (name === "rate_limit_exceeded" || name === ""));
    if (!retryable) return failure;

    if (attempt < MAX_ATTEMPTS) await context.sleep(retryDelay(response, attempt));
  }

  return failure;
}

function hasId(entry: unknown): boolean {
  return (
    typeof entry === "object" &&
    entry !== null &&
    typeof (entry as { id?: unknown }).id === "string"
  );
}

function retryDelay(response: Response, attempt: number): number {
  const seconds = Number(response.headers.get("retry-after"));
  const requested = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : attempt * 500;
  return Math.min(requested, MAX_RETRY_DELAY_MS);
}

async function readResendError(response: Response): Promise<{ name: string; message: string }> {
  const text = await response.text().catch(() => "");
  try {
    const parsed = JSON.parse(text) as { name?: unknown; message?: unknown };
    return {
      name: typeof parsed.name === "string" ? parsed.name : "",
      message:
        typeof parsed.message === "string" && parsed.message
          ? parsed.message
          : `Resend returned HTTP ${response.status}`,
    };
  } catch {
    return {
      name: "",
      message: text.trim().slice(0, 300) || `Resend returned HTTP ${response.status}`,
    };
  }
}
