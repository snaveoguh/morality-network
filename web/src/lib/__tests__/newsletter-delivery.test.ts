import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  deliverIndividually,
  RESEND_BATCH_LIMIT,
  type OutgoingEmail,
} from "../newsletter/delivery";

// No real email is ever sent from here: `fetch` is replaced for every test and
// the stub fails any request that is not the Resend batch endpoint.

interface ResendEmail {
  from: string;
  to: string[];
  subject: string;
  html: string;
  headers?: Record<string, string>;
  [key: string]: unknown;
}

interface Call {
  headers: Headers;
  body: string;
  emails: ResendEmail[];
}

let calls: Call[];
let sleeps: number[];

const options = {
  apiKey: "re_test_key",
  from: "pooter <daily@pooter.world>",
  sleep: async (ms: number) => {
    sleeps.push(ms);
  },
};

function accept(emails: ResendEmail[]): Response {
  return Response.json({ data: emails.map((_, i) => ({ id: `email-${i}` })) });
}

function resendError(status: number, name: string, message: string, headers?: HeadersInit): Response {
  return Response.json({ statusCode: status, name, message }, { status, headers });
}

function stubResend(respond: (emails: ResendEmail[], attempt: number) => Response | Promise<Response>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url) !== "https://api.resend.com/emails/batch" || init?.method !== "POST") {
        throw new Error(`Unexpected request: ${init?.method} ${String(url)}`);
      }
      const body = String(init?.body);
      const call = { headers: new Headers(init?.headers), body, emails: JSON.parse(body) };
      calls.push(call);
      return respond(call.emails, calls.length);
    }),
  );
}

function emailsFor(addresses: string[]): OutgoingEmail[] {
  return addresses.map((to) => ({
    to,
    subject: "The Daily Pooter",
    html: `<p>edition for ${to}</p>`,
    headers: { "List-Unsubscribe": `<https://pooter.world/u/${to}>` },
  }));
}

function addresses(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `reader${i}@example.com`);
}

/** How many times each address was accepted by the stubbed Resend. */
function acceptedCounts(accepted: ResendEmail[][]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const email of accepted.flat()) {
    counts.set(email.to[0], (counts.get(email.to[0]) ?? 0) + 1);
  }
  return counts;
}

beforeEach(() => {
  calls = [];
  sleeps = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("deliverIndividually", () => {
  it("sends one message per recipient, never more than one address in `to`", async () => {
    stubResend(accept);
    const recipients = addresses(7);

    const report = await deliverIndividually(emailsFor(recipients), options);

    expect(report).toEqual({ sent: 7, failures: [] });
    const sent = calls.flatMap((call) => call.emails);
    expect(sent).toHaveLength(7);
    for (const email of sent) {
      expect(email.to).toHaveLength(1);
      expect(email).not.toHaveProperty("cc");
      expect(email).not.toHaveProperty("bcc");
    }
    expect(sent.map((email) => email.to[0])).toEqual(recipients);
  });

  it("puts no other recipient's address anywhere in a message", async () => {
    stubResend(accept);
    const recipients = addresses(5);

    await deliverIndividually(emailsFor(recipients), options);

    for (const email of calls.flatMap((call) => call.emails)) {
      const serialized = JSON.stringify(email);
      for (const other of recipients.filter((address) => address !== email.to[0])) {
        expect(serialized).not.toContain(other);
      }
    }
  });

  it("splits into batches of at most 100, Resend's per-call limit", async () => {
    stubResend(accept);
    expect(RESEND_BATCH_LIMIT).toBe(100);

    const report = await deliverIndividually(emailsFor(addresses(250)), options);

    expect(report).toEqual({ sent: 250, failures: [] });
    expect(calls.map((call) => call.emails.length)).toEqual([100, 100, 50]);
    for (const call of calls) {
      for (const email of call.emails) expect(email.to).toHaveLength(1);
    }
    // Every recipient exactly once across the batches.
    const counts = acceptedCounts(calls.map((call) => call.emails));
    expect(counts.size).toBe(250);
    expect([...counts.values()].every((count) => count === 1)).toBe(true);
  });

  it("authenticates, identifies itself and sends a fresh idempotency key per batch", async () => {
    stubResend(accept);

    await deliverIndividually(emailsFor(addresses(150)), options);

    const keys = calls.map((call) => call.headers.get("idempotency-key"));
    expect(new Set(keys).size).toBe(2);
    for (const call of calls) {
      expect(call.headers.get("authorization")).toBe("Bearer re_test_key");
      expect(call.headers.get("user-agent")).toBeTruthy();
      expect(call.headers.get("idempotency-key")).toMatch(/^[0-9a-f-]{36}$/);
      expect(call.emails[0].from).toBe("pooter <daily@pooter.world>");
      expect(call.emails[0].headers?.["List-Unsubscribe"]).toContain(call.emails[0].to[0]);
    }
  });

  it("isolates an address Resend rejects so only that recipient fails", async () => {
    const accepted: ResendEmail[][] = [];
    stubResend((emails) => {
      // Resend rejects the whole batch if any one email in it is invalid.
      if (emails.some((email) => email.to[0] === "reader37@example.com")) {
        return resendError(422, "validation_error", "Invalid `to` field.");
      }
      accepted.push(emails);
      return accept(emails);
    });
    const recipients = addresses(120);

    const report = await deliverIndividually(emailsFor(recipients), options);

    expect(report.sent).toBe(119);
    expect(report.failures).toEqual([
      { email: "reader37@example.com", error: "Invalid `to` field.", status: 422 },
    ]);
    const counts = acceptedCounts(accepted);
    expect(counts.has("reader37@example.com")).toBe(false);
    expect(counts.size).toBe(119);
    expect([...counts.values()].every((count) => count === 1)).toBe(true);
  });

  it("reports every recipient of a batch that fails for a non-validation reason, without retrying", async () => {
    stubResend(() => resendError(403, "validation_error", "The pooter.world domain is not verified."));
    const recipients = addresses(3);

    const report = await deliverIndividually(emailsFor(recipients), options);

    expect(calls).toHaveLength(1);
    expect(report.sent).toBe(0);
    expect(report.failures).toEqual(
      recipients.map((email) => ({
        email,
        error: "The pooter.world domain is not verified.",
        status: 403,
      })),
    );
  });

  it("retries a server error with the same body and idempotency key", async () => {
    stubResend((emails, attempt) =>
      attempt === 1 ? resendError(500, "application_error", "An unexpected error occurred.") : accept(emails),
    );

    const report = await deliverIndividually(emailsFor(addresses(4)), options);

    expect(report).toEqual({ sent: 4, failures: [] });
    expect(calls).toHaveLength(2);
    expect(calls[1].body).toBe(calls[0].body);
    expect(calls[1].headers.get("idempotency-key")).toBe(calls[0].headers.get("idempotency-key"));
  });

  it("waits for `retry-after` when rate limited, then succeeds", async () => {
    stubResend((emails, attempt) =>
      attempt === 1
        ? resendError(429, "rate_limit_exceeded", "Too many requests.", { "retry-after": "2" })
        : accept(emails),
    );

    const report = await deliverIndividually(emailsFor(addresses(2)), options);

    expect(report).toEqual({ sent: 2, failures: [] });
    expect(calls).toHaveLength(2);
    expect(sleeps).toContain(2000);
  });

  it("does not retry an exhausted quota", async () => {
    stubResend(() =>
      resendError(429, "daily_quota_exceeded", "You have exceeded your daily email sending quota."),
    );

    const report = await deliverIndividually(emailsFor(addresses(2)), options);

    expect(calls).toHaveLength(1);
    expect(report.sent).toBe(0);
    expect(report.failures.map((failure) => failure.status)).toEqual([429, 429]);
  });

  it("gives up after three attempts when Resend cannot be reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls.push({ headers: new Headers(), body: "", emails: [] });
        throw new Error("connect ECONNREFUSED");
      }),
    );

    const report = await deliverIndividually(emailsFor(["reader@example.com"]), options);

    expect(calls).toHaveLength(3);
    expect(report.sent).toBe(0);
    expect(report.failures).toEqual([
      { email: "reader@example.com", error: "Could not reach Resend: connect ECONNREFUSED" },
    ]);
  });

  it("never hands Resend a `to` that is not one plain address", async () => {
    stubResend(accept);
    const junk = [
      "a@example.com, b@example.com",
      "a@example.com,b@example.com",
      "a@example.com;b@example.com",
      "Someone <a@example.com>",
      "a@example.com\nBcc: b@example.com",
      "not-an-address",
      "",
    ];

    const report = await deliverIndividually(emailsFor([...junk, "good@example.com"]), options);

    expect(report.sent).toBe(1);
    expect(report.failures.map((failure) => failure.email)).toEqual(junk);
    const sent = calls.flatMap((call) => call.emails);
    expect(sent.map((email) => email.to)).toEqual([["good@example.com"]]);
  });

  it("reports a recipient Resend returned no id for", async () => {
    stubResend(() => Response.json({ data: [{ id: "email-0" }] }));

    const report = await deliverIndividually(emailsFor(addresses(2)), options);

    expect(report.sent).toBe(1);
    expect(report.failures.map((failure) => failure.email)).toEqual(["reader1@example.com"]);
  });

  it("stops starting requests once the deadline has passed", async () => {
    stubResend(accept);

    const report = await deliverIndividually(emailsFor(addresses(3)), {
      ...options,
      deadline: Date.now() - 1,
    });

    expect(calls).toHaveLength(0);
    expect(report.sent).toBe(0);
    expect(report.failures).toHaveLength(3);
    expect(report.failures[0].error).toMatch(/ran out of time/);
  });
});
