import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as confirmRoute from "@/app/api/newsletter/confirm/route";
import * as sendRoute from "@/app/api/newsletter/send/route";
import * as subscribeRoute from "@/app/api/newsletter/subscribe/route";
import * as unsubscribeRoute from "@/app/api/newsletter/unsubscribe/route";

import {
  CONFIRMATION_COOLDOWN_MS,
  PENDING_KEY,
  PENDING_TTL_MS,
  SUBSCRIBERS_KEY,
  UNSUBSCRIBED_KEY,
} from "../newsletter/store";
import { verifyNewsletterToken } from "../newsletter/tokens";
import { fakeRedis } from "./stubs/fake-redis";

// The newsletter routes, end to end, with nothing real behind them: Redis is
// the in-memory fake and `fetch` is a stub that answers for Resend and for the
// site's own content APIs and throws on anything else. No email is ever sent.

vi.mock("@upstash/redis", async () => {
  const { FakeRedis } = await import("./stubs/fake-redis");
  return { Redis: FakeRedis };
});

const SITE = "https://pooter.world";
const CRON_SECRET = "cron-secret-for-tests";
const AUTH = { authorization: `Bearer ${CRON_SECRET}` };

interface ResendEmail {
  from: string;
  to: string[];
  subject: string;
  html: string;
  headers?: Record<string, string>;
  [key: string]: unknown;
}

let resendCalls: ResendEmail[][];
let respondResend: (emails: ResendEmail[]) => Response;
let fetchMock: ReturnType<typeof vi.fn>;

function accept(emails: ResendEmail[]): Response {
  return Response.json({ data: emails.map((_, i) => ({ id: `email-${i}` })) });
}

beforeEach(() => {
  fakeRedis.reset();
  resendCalls = [];
  respondResend = accept;

  vi.stubEnv("CRON_SECRET", CRON_SECRET);
  vi.stubEnv("RESEND_API_KEY", "re_test_key");
  vi.stubEnv("NEWSLETTER_TOKEN_SECRET", "test-newsletter-token-secret-0123456789abcdef");
  vi.stubEnv("NEWSLETTER_RECIPIENTS", "");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.test");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "redis-token");

  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "https://api.resend.com/emails/batch" && init?.method === "POST") {
      const emails = JSON.parse(String(init.body)) as ResendEmail[];
      resendCalls.push(emails);
      return respondResend(emails);
    }
    if (url === `${SITE}/api/feed?limit=20`) {
      return Response.json({
        items: [
          {
            title: "Budget statement <moved> to March",
            link: "https://example.org/budget",
            source: "Example Wire",
            category: "Politics",
            description: "The Treasury confirmed the new date.",
          },
        ],
      });
    }
    if (url === `${SITE}/api/signals/latest`) return Response.json({ signals: [] });
    if (url === `${SITE}/api/trading/performance`) return Response.json({ openPositions: 0 });
    throw new Error(`Unexpected outbound request: ${init?.method ?? "GET"} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ── helpers ─────────────────────────────────────────────────────────

function send(headers: Record<string, string> = AUTH) {
  return sendRoute.POST(new NextRequest(`${SITE}/api/newsletter/send`, { method: "POST", headers }));
}

function subscribe(email: unknown) {
  return subscribeRoute.POST(
    new NextRequest(`${SITE}/api/newsletter/subscribe`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    }),
  );
}

function confirm(token: string | null) {
  const query = token === null ? "" : `?token=${encodeURIComponent(token)}`;
  return confirmRoute.POST(
    new NextRequest(`${SITE}/api/newsletter/confirm${query}`, { method: "POST" }),
  );
}

/** What a mail client's own "Unsubscribe" button sends (RFC 8058). */
function oneClickUnsubscribe(url: string) {
  return unsubscribeRoute.POST(
    new NextRequest(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "List-Unsubscribe=One-Click",
    }),
  );
}

function sentMessages(): ResendEmail[] {
  return resendCalls.flat();
}

function recipientsOf(messages: ResendEmail[]): string[] {
  return messages.map((message) => message.to[0]).sort();
}

function seedSubscribers(...emails: string[]) {
  for (const email of emails) fakeRedis.set(SUBSCRIBERS_KEY).add(email);
}

function isSubscribed(email: string): boolean {
  return fakeRedis.set(SUBSCRIBERS_KEY).has(email);
}

function linkIn(html: string, path: string): string {
  const match = html.match(new RegExp(`href="(${SITE}${path}\\?token=[^"]+)"`));
  if (!match) throw new Error(`No ${path} link in the email`);
  return match[1];
}

function tokenOf(url: string): string {
  return new URL(url).searchParams.get("token") ?? "";
}

function oneClickUrlOf(message: ResendEmail): string {
  const header = message.headers?.["List-Unsubscribe"] ?? "";
  expect(header).toMatch(/^<https:\/\/[^<>\s]+>$/);
  return header.slice(1, -1);
}

function addresses(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `reader${i}@example.com`);
}

/** Sign up and return the confirmation link from the email that was "sent". */
async function signUp(email: string): Promise<string> {
  const before = sentMessages().length;
  const response = await subscribe(email);
  expect(response.status).toBe(200);
  const [confirmation] = sentMessages().slice(before);
  return linkIn(confirmation.html, "/subscribe/confirm");
}

// ── send: auth ──────────────────────────────────────────────────────

describe("POST /api/newsletter/send — auth fails closed", () => {
  beforeEach(() => seedSubscribers("reader@example.com"));

  it.each([
    ["no Authorization header", {}],
    ["an empty bearer", { authorization: "Bearer " }],
    ["the literal 'Bearer undefined'", { authorization: "Bearer undefined" }],
    ["a guess", { authorization: "Bearer guess" }],
  ])("returns 401 when CRON_SECRET is not set (%s)", async (_label, headers) => {
    for (const unset of [undefined, "", "   "]) {
      vi.stubEnv("CRON_SECRET", unset);

      const response = await send(headers as Record<string, string>);

      expect(response.status).toBe(401);
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fakeRedis.commands).toBe(0);
  });

  it.each([
    ["no Authorization header", {}],
    ["the wrong secret", { authorization: "Bearer not-the-secret" }],
    ["the secret without the scheme", { authorization: CRON_SECRET }],
    ["a prefix of the secret", { authorization: `Bearer ${CRON_SECRET.slice(0, -1)}` }],
  ])("returns 401 when the secret is wrong (%s)", async (_label, headers) => {
    const response = await send(headers as Record<string, string>);

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fakeRedis.commands).toBe(0);
  });

  it("sends when the secret matches", async () => {
    const response = await send();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "sent", recipients: 1, sent: 1, failed: 0 });
  });
});

// ── send: one message per recipient ─────────────────────────────────

describe("POST /api/newsletter/send — recipient privacy", () => {
  it("sends N recipients N messages, each addressed to one person only", async () => {
    const subscribers = addresses(205);
    seedSubscribers(...subscribers);
    vi.stubEnv("NEWSLETTER_RECIPIENTS", "Owner@Example.com, reader0@example.com");
    const everyone = [...subscribers, "owner@example.com"].sort();

    const response = await send();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "sent",
      recipients: 206,
      sent: 206,
      failed: 0,
      failures: [],
    });

    // 206 messages over three batch calls (Resend takes at most 100 per call).
    expect(resendCalls.map((batch) => batch.length)).toEqual([100, 100, 6]);
    const messages = sentMessages();
    expect(messages).toHaveLength(206);
    for (const message of messages) {
      expect(message.to).toHaveLength(1);
      expect(message).not.toHaveProperty("cc");
      expect(message).not.toHaveProperty("bcc");
    }
    // Everyone exactly once — including the address listed in both places.
    expect(recipientsOf(messages)).toEqual(everyone);
  });

  it("puts no other subscriber's address, or their unsubscribe token, in anyone's message", async () => {
    const subscribers = addresses(12);
    seedSubscribers(...subscribers);

    await send();

    const messages = sentMessages();
    const tokens = new Map(messages.map((m) => [m.to[0], tokenOf(oneClickUrlOf(m))]));
    for (const message of messages) {
      const serialized = JSON.stringify(message);
      for (const other of subscribers.filter((address) => address !== message.to[0])) {
        expect(serialized).not.toContain(other);
        expect(serialized).not.toContain(tokens.get(other));
      }
    }
  });

  it("gives every message its own unsubscribe link, in the footer and the headers", async () => {
    seedSubscribers(...addresses(4));

    await send();

    const messages = sentMessages();
    expect(messages).toHaveLength(4);
    for (const message of messages) {
      const oneClick = oneClickUrlOf(message);
      const footer = linkIn(message.html, "/unsubscribe");

      expect(message.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
      expect(oneClick.startsWith(`${SITE}/api/newsletter/unsubscribe?token=`)).toBe(true);
      expect(message.html).toContain(">Unsubscribe</a>");
      // Same token in both places, and it is this recipient's.
      expect(tokenOf(footer)).toBe(tokenOf(oneClick));
      expect(verifyNewsletterToken("unsubscribe", tokenOf(oneClick))).toBe(message.to[0]);
    }
    expect(new Set(messages.map((m) => tokenOf(oneClickUrlOf(m)))).size).toBe(4);
  });

  it("still escapes feed content in the edition", async () => {
    seedSubscribers("reader@example.com");

    await send();

    expect(sentMessages()[0].html).toContain("Budget statement &lt;moved&gt; to March");
  });
});

// ── unsubscribe ─────────────────────────────────────────────────────

describe("unsubscribe links", () => {
  it("work: one POST removes that address and the next edition skips it", async () => {
    seedSubscribers("a@example.com", "b@example.com", "c@example.com");
    // An operator-configured address is not in Redis at all; it must still be able to leave.
    vi.stubEnv("NEWSLETTER_RECIPIENTS", "owner@example.com");
    await send();
    const byRecipient = new Map(sentMessages().map((message) => [message.to[0], message]));
    expect([...byRecipient.keys()].sort()).toEqual([
      "a@example.com",
      "b@example.com",
      "c@example.com",
      "owner@example.com",
    ]);

    // b uses the mail client's one-click button (the List-Unsubscribe header).
    const first = await oneClickUnsubscribe(oneClickUrlOf(byRecipient.get("b@example.com")!));
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ status: "unsubscribed" });

    // The owner uses the footer link: the page's button posts the same token.
    const footer = linkIn(byRecipient.get("owner@example.com")!.html, "/unsubscribe");
    const second = await unsubscribeRoute.POST(
      new NextRequest(`${SITE}/api/newsletter/unsubscribe?token=${tokenOf(footer)}`, {
        method: "POST",
      }),
    );
    expect(second.status).toBe(200);

    expect(isSubscribed("b@example.com")).toBe(false);
    expect(isSubscribed("a@example.com")).toBe(true);
    expect(isSubscribed("c@example.com")).toBe(true);
    expect([...fakeRedis.set(UNSUBSCRIBED_KEY)].sort()).toEqual([
      "b@example.com",
      "owner@example.com",
    ]);

    resendCalls = [];
    await send();
    expect(recipientsOf(sentMessages())).toEqual(["a@example.com", "c@example.com"]);
  });

  it("do nothing on GET — a link scanner cannot unsubscribe anyone", async () => {
    seedSubscribers("a@example.com");
    await send();
    const [message] = sentMessages();
    const oneClick = oneClickUrlOf(message);

    const response = await unsubscribeRoute.GET(new NextRequest(oneClick));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(linkIn(message.html, "/unsubscribe"));
    expect(isSubscribed("a@example.com")).toBe(true);
    expect(fakeRedis.set(UNSUBSCRIBED_KEY).size).toBe(0);
  });

  it("reject a tampered token, another address's signature and a missing token", async () => {
    seedSubscribers("a@example.com", "victim@example.com");
    await send();
    const mine = tokenOf(
      oneClickUrlOf(sentMessages().find((message) => message.to[0] === "a@example.com")!),
    );
    const [, expiry, signature] = mine.split(".");
    const victim = Buffer.from("victim@example.com", "utf8").toString("base64url");
    const commandsBefore = fakeRedis.commands;

    for (const token of [`${victim}.${expiry}.${signature}`, `${mine.slice(0, -1)}x`, "junk", ""]) {
      const response = await oneClickUnsubscribe(
        `${SITE}/api/newsletter/unsubscribe?token=${token}`,
      );
      expect(response.status).toBe(400);
    }
    const missing = await oneClickUnsubscribe(`${SITE}/api/newsletter/unsubscribe`);
    expect(missing.status).toBe(400);

    expect(isSubscribed("victim@example.com")).toBe(true);
    expect(isSubscribed("a@example.com")).toBe(true);
    expect(fakeRedis.commands).toBe(commandsBefore);
  });

  it("are idempotent", async () => {
    seedSubscribers("a@example.com");
    await send();
    const oneClick = oneClickUrlOf(sentMessages()[0]);

    expect((await oneClickUnsubscribe(oneClick)).status).toBe(200);
    expect((await oneClickUnsubscribe(oneClick)).status).toBe(200);
    expect(isSubscribed("a@example.com")).toBe(false);
  });
});

// ── double opt-in ───────────────────────────────────────────────────

describe("double opt-in", () => {
  it("holds a new sign-up as pending and emails only that address a confirmation link", async () => {
    const response = await subscribe("  New.Reader@Example.com ");

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "pending" });
    expect(isSubscribed("new.reader@example.com")).toBe(false);
    expect([...fakeRedis.sortedSet(PENDING_KEY).keys()]).toEqual(["new.reader@example.com"]);

    const messages = sentMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0].to).toEqual(["new.reader@example.com"]);
    expect(messages[0].subject).toMatch(/confirm/i);
    const link = linkIn(messages[0].html, "/subscribe/confirm");
    expect(verifyNewsletterToken("confirm", tokenOf(link))).toBe("new.reader@example.com");
  });

  it("never sends an edition to an address that has not confirmed", async () => {
    seedSubscribers("confirmed@example.com");
    const link = await signUp("pending@example.com");

    resendCalls = [];
    expect((await send()).status).toBe(200);
    expect(recipientsOf(sentMessages())).toEqual(["confirmed@example.com"]);

    // Once the owner of the address confirms, the next edition includes them.
    const confirmed = await confirm(tokenOf(link));
    expect(confirmed.status).toBe(200);
    expect(await confirmed.json()).toEqual({ status: "confirmed" });
    expect(isSubscribed("pending@example.com")).toBe(true);
    expect(fakeRedis.sortedSet(PENDING_KEY).size).toBe(0);

    resendCalls = [];
    await send();
    expect(recipientsOf(sentMessages())).toEqual(["confirmed@example.com", "pending@example.com"]);
  });

  it("cannot be confirmed by fetching the link — the confirm endpoint has no GET", () => {
    expect(Object.keys(confirmRoute)).not.toContain("GET");
  });

  it("rejects a forged or altered confirmation token", async () => {
    const link = await signUp("pending@example.com");
    const token = tokenOf(link);
    const [, expiry, signature] = token.split(".");
    const other = Buffer.from("someone.else@example.com", "utf8").toString("base64url");

    for (const bad of [`${other}.${expiry}.${signature}`, `${token.slice(0, -1)}x`, "junk", null]) {
      expect((await confirm(bad)).status).toBe(400);
    }

    expect(fakeRedis.set(SUBSCRIBERS_KEY).size).toBe(0);
  });

  it("does not let an unsubscribe token confirm, or a confirm token unsubscribe", async () => {
    seedSubscribers("reader@example.com");
    await send();
    const unsubscribeToken = tokenOf(oneClickUrlOf(sentMessages()[0]));
    const confirmToken = tokenOf(await signUp("pending@example.com"));

    // A subscriber's unsubscribe token for an address that is also pending.
    fakeRedis.sortedSet(PENDING_KEY).set("reader@example.com", Date.now());
    expect((await confirm(unsubscribeToken)).status).toBe(400);

    const response = await oneClickUnsubscribe(
      `${SITE}/api/newsletter/unsubscribe?token=${confirmToken}`,
    );
    expect(response.status).toBe(400);
    expect(fakeRedis.sortedSet(PENDING_KEY).has("pending@example.com")).toBe(true);
    expect(fakeRedis.set(UNSUBSCRIBED_KEY).size).toBe(0);
  });

  it("makes the confirmation link single-use: it cannot re-subscribe after an unsubscribe", async () => {
    const token = tokenOf(await signUp("reader@example.com"));
    expect(await (await confirm(token)).json()).toEqual({ status: "confirmed" });
    // Following the link a second time is harmless.
    expect(await (await confirm(token)).json()).toEqual({ status: "already_subscribed" });

    resendCalls = [];
    await send();
    await oneClickUnsubscribe(oneClickUrlOf(sentMessages()[0]));
    expect(isSubscribed("reader@example.com")).toBe(false);

    expect((await confirm(token)).status).toBe(400);
    expect(isSubscribed("reader@example.com")).toBe(false);
  });

  it("lets someone who unsubscribed come back by confirming a new sign-up", async () => {
    seedSubscribers("reader@example.com");
    await send();
    await oneClickUnsubscribe(oneClickUrlOf(sentMessages()[0]));
    expect(fakeRedis.set(UNSUBSCRIBED_KEY).has("reader@example.com")).toBe(true);

    const token = tokenOf(await signUp("reader@example.com"));
    // Signing up alone changes nothing; they stay off the list until they confirm.
    resendCalls = [];
    expect((await send()).status).toBe(400);
    expect(sentMessages()).toHaveLength(0);

    await confirm(token);
    expect(fakeRedis.set(UNSUBSCRIBED_KEY).has("reader@example.com")).toBe(false);
    await send();
    expect(recipientsOf(sentMessages())).toEqual(["reader@example.com"]);
  });

  it("expires an unconfirmed sign-up and forgets the address", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-16T09:00:00Z"));
    const token = tokenOf(await signUp("slow@example.com"));

    vi.setSystemTime(Date.now() + PENDING_TTL_MS + 60_000);
    expect((await confirm(token)).status).toBe(400);
    expect(isSubscribed("slow@example.com")).toBe(false);

    // The next sign-up by anyone clears expired entries out of Redis.
    await subscribe("someone.else@example.com");
    expect([...fakeRedis.sortedSet(PENDING_KEY).keys()]).toEqual(["someone.else@example.com"]);
  });

  it("answers the same for a new, a pending and an already-subscribed address", async () => {
    seedSubscribers("member@example.com");

    const fresh = await subscribe("fresh@example.com");
    const repeat = await subscribe("fresh@example.com");
    const member = await subscribe("member@example.com");

    const body = await fresh.json();
    expect(await repeat.json()).toEqual(body);
    expect(await member.json()).toEqual(body);
    expect([fresh.status, repeat.status, member.status]).toEqual([200, 200, 200]);
    // One confirmation only: none for the member, none for the immediate repeat.
    expect(recipientsOf(sentMessages())).toEqual(["fresh@example.com"]);
    expect(fakeRedis.sortedSet(PENDING_KEY).has("member@example.com")).toBe(false);
  });

  it("sends a fresh confirmation once the cooldown has passed", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-16T09:00:00Z"));
    await subscribe("fresh@example.com");

    vi.setSystemTime(Date.now() + CONFIRMATION_COOLDOWN_MS + 1_000);
    await subscribe("fresh@example.com");

    expect(recipientsOf(sentMessages())).toEqual(["fresh@example.com", "fresh@example.com"]);
  });

  it("rejects anything that is not one plain address", async () => {
    for (const email of [
      "a@example.com, b@example.com",
      "a@example.com,b@example.com",
      "Someone <a@example.com>",
      "not-an-address",
      "",
      null,
      42,
    ]) {
      expect((await subscribe(email)).status).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fakeRedis.commands).toBe(0);
  });

  it("says so, and keeps nothing, when the confirmation email cannot be sent", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    respondResend = () =>
      Response.json(
        { statusCode: 403, name: "validation_error", message: "The domain is not verified." },
        { status: 403 },
      );

    const response = await subscribe("fresh@example.com");

    expect(response.status).toBe(502);
    expect(fakeRedis.sortedSet(PENDING_KEY).size).toBe(0);
    expect(isSubscribed("fresh@example.com")).toBe(false);
  });

  it("refuses sign-ups when links cannot be signed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("NEWSLETTER_TOKEN_SECRET", undefined);

    const response = await subscribe("fresh@example.com");

    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fakeRedis.sortedSet(PENDING_KEY).size).toBe(0);
  });
});

// ── send: failures and misconfiguration ─────────────────────────────

describe("POST /api/newsletter/send — failures", () => {
  it("reports each recipient that could not be sent to, and still sends to the rest", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    seedSubscribers("a@example.com", "broken@example.com", "c@example.com");
    respondResend = (emails) =>
      emails.some((email) => email.to[0] === "broken@example.com")
        ? Response.json(
            { statusCode: 422, name: "validation_error", message: "Invalid `to` field." },
            { status: 422 },
          )
        : accept(emails);

    const response = await send();

    expect(response.status).toBe(207);
    expect(await response.json()).toEqual({
      status: "partial",
      recipients: 3,
      sent: 2,
      failed: 1,
      failures: [{ email: "broken@example.com", error: "Invalid `to` field.", status: 422 }],
    });
    // The server log names the reason but not the full address.
    expect(JSON.stringify(logged.mock.calls)).toContain("Invalid `to` field.");
    expect(JSON.stringify(logged.mock.calls)).not.toContain("broken@example.com");
  });

  it("returns 502 and lists everyone when nothing could be sent", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    seedSubscribers("a@example.com", "b@example.com");
    respondResend = () =>
      Response.json(
        { statusCode: 403, name: "validation_error", message: "The domain is not verified." },
        { status: 403 },
      );

    const response = await send();

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body).toMatchObject({ status: "failed", recipients: 2, sent: 0, failed: 2 });
    expect(body.failures.map((failure: { email: string }) => failure.email).sort()).toEqual([
      "a@example.com",
      "b@example.com",
    ]);
  });

  it("reports a malformed entry on the list without sending to it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    seedSubscribers("a@example.com", "a@example.com,b@example.com");

    const response = await send();

    expect(response.status).toBe(207);
    expect(recipientsOf(sentMessages())).toEqual(["a@example.com"]);
    const body = await response.json();
    expect(body.failures).toEqual([
      { email: "a@example.com,b@example.com", error: expect.stringMatching(/not a valid email/i) },
    ]);
  });

  it("sends nothing when unsubscribe links cannot be signed", async () => {
    seedSubscribers("a@example.com");
    for (const secret of [undefined, "too-short"]) {
      vi.stubEnv("NEWSLETTER_TOKEN_SECRET", secret);

      const response = await send();

      expect(response.status).toBe(500);
      expect((await response.json()).error).toMatch(/NEWSLETTER_TOKEN_SECRET/);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends nothing when the list of who has unsubscribed cannot be read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    seedSubscribers("a@example.com");
    vi.stubEnv("NEWSLETTER_RECIPIENTS", "owner@example.com");
    fakeRedis.down = true;

    const response = await send();

    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends nothing when Redis is not configured", async () => {
    vi.stubEnv("NEWSLETTER_RECIPIENTS", "owner@example.com");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", undefined);

    const response = await send();

    expect(response.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 400 when there is nobody to send to", async () => {
    const response = await send();

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ── operator endpoints ──────────────────────────────────────────────

describe("/api/newsletter/subscribe — operator access", () => {
  function remove(email: string, headers: Record<string, string> = {}) {
    return subscribeRoute.DELETE(
      new NextRequest(`${SITE}/api/newsletter/subscribe`, {
        method: "DELETE",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({ email }),
      }),
    );
  }

  function list(headers: Record<string, string> = {}) {
    return subscribeRoute.GET(new NextRequest(`${SITE}/api/newsletter/subscribe`, { headers }));
  }

  it("does not let an anonymous caller remove an address", async () => {
    seedSubscribers("a@example.com");

    expect((await remove("a@example.com")).status).toBe(401);
    vi.stubEnv("CRON_SECRET", undefined);
    expect((await remove("a@example.com", { authorization: "Bearer undefined" })).status).toBe(401);

    expect(isSubscribed("a@example.com")).toBe(true);
  });

  it("lets the operator remove an address, which also stops future sends to it", async () => {
    seedSubscribers("a@example.com", "b@example.com");

    expect((await remove("A@Example.com", AUTH)).status).toBe(200);

    await send();
    expect(recipientsOf(sentMessages())).toEqual(["b@example.com"]);
  });

  it("shows the count to anyone and the addresses only to the operator", async () => {
    seedSubscribers("a@example.com", "b@example.com");
    fakeRedis.sortedSet(PENDING_KEY).set("pending@example.com", Date.now());

    expect(await (await list()).json()).toEqual({ count: 2 });
    expect(await (await list({ authorization: "Bearer nope" })).json()).toEqual({ count: 2 });

    const body = await (await list(AUTH)).json();
    expect(body.count).toBe(2);
    expect(body.subscribers.sort()).toEqual(["a@example.com", "b@example.com"]);
  });
});
