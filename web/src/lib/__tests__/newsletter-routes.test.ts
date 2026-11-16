import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as confirmRoute from "@/app/api/newsletter/confirm/route";
import * as sendRoute from "@/app/api/newsletter/send/route";
import * as subscribeRoute from "@/app/api/newsletter/subscribe/route";
import * as unsubscribeRoute from "@/app/api/newsletter/unsubscribe/route";

import {
  MAX_CONFIRMATIONS_PER_ADDRESS_PER_DAY,
  optOutId,
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

// Next runs after() callbacks once the response has gone out. Here they are
// held back so a test can look at the reply first, then let the deferred work
// run with `settle()`.
const { deferred } = vi.hoisted(() => ({ deferred: [] as Array<() => unknown> }));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (task: () => unknown) => {
      deferred.push(task);
    },
  };
});

const SITE = "https://pooter.world";
const CRON_SECRET = "cron-secret-for-tests";
const AUTH = { authorization: `Bearer ${CRON_SECRET}` };
const DAY_MS = 24 * 60 * 60 * 1000;

interface ResendEmail {
  from: string;
  to: string[];
  subject: string;
  html: string;
  headers?: Record<string, string>;
  [key: string]: unknown;
}

/** Every batch posted to the stubbed Resend, and the ones it accepted. */
let resendCalls: ResendEmail[][];
let acceptedBatches: ResendEmail[][];
let respondResend: (emails: ResendEmail[]) => Response;
let fetchMock: ReturnType<typeof vi.fn>;

function accept(emails: ResendEmail[]): Response {
  return Response.json({ data: emails.map((_, i) => ({ id: `email-${i}` })) });
}

function resendError(status: number, name: string, message: string): Response {
  return Response.json({ statusCode: status, name, message }, { status });
}

beforeEach(() => {
  fakeRedis.reset();
  deferred.length = 0;
  resendCalls = [];
  acceptedBatches = [];
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
      const response = respondResend(emails);
      if (response.ok) acceptedBatches.push(emails);
      return response;
    }
    if (url === `${SITE}/api/feed?limit=20`) {
      return Response.json({
        items: [
          {
            title: "Budget statement <moved> to March",
            link: "https://example.org/budget?a=1&b=2",
            source: "Example Wire",
            category: "Politics",
            description: "The Treasury confirmed the new date.",
          },
          {
            title: "A link that tries to break out",
            link: 'https://example.org/"><img src=x onerror=alert(1)>',
            source: "Example Wire",
            category: "World",
          },
          { title: "A link that is not a web address", link: "javascript:alert(1)" },
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

function send(headers: Record<string, string> = AUTH, origin: string = SITE) {
  return sendRoute.POST(
    new NextRequest(`${origin}/api/newsletter/send`, { method: "POST", headers }),
  );
}

/** Calls the sign-up endpoint. The confirmation email is not sent until `settle()`. */
function subscribe(email: unknown, headers: Record<string, string> = {}) {
  return subscribeRoute.POST(
    new NextRequest(`${SITE}/api/newsletter/subscribe`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ email }),
    }),
  );
}

/** Runs whatever the routes scheduled for after their response. */
async function settle(): Promise<void> {
  while (deferred.length > 0) await deferred.shift()!();
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

function hasOptedOut(email: string): boolean {
  return fakeRedis.set(UNSUBSCRIBED_KEY).has(optOutId(email));
}

function pendingAddresses(): string[] {
  return [...fakeRedis.sortedSet(PENDING_KEY).keys()];
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

/** Sign up, let the confirmation go out, and return the token from the emailed link. */
async function signUp(email: string): Promise<string> {
  const before = sentMessages().length;
  const response = await subscribe(email);
  expect(response.status).toBe(200);
  await settle();
  const [confirmation] = sentMessages().slice(before);
  if (!confirmation) throw new Error(`No confirmation email was sent to ${email}`);
  return tokenOf(linkIn(confirmation.html, "/subscribe/confirm"));
}

function freezeTime(at = "2026-11-16T09:00:00Z") {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(at));
}

function advanceTime(ms: number) {
  vi.setSystemTime(Date.now() + ms);
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
    ["the secret in another case", { authorization: `Bearer ${CRON_SECRET.toUpperCase()}` }],
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
      expect(verifyNewsletterToken("unsubscribe", tokenOf(oneClick))?.email).toBe(message.to[0]);
    }
    expect(new Set(messages.map((m) => tokenOf(oneClickUrlOf(m)))).size).toBe(4);
  });

  it("builds links from the site URL, not from the origin the request arrived on", async () => {
    seedSubscribers("reader@example.com");

    // Behind the hosting proxy the request's own URL is the container's.
    await send(AUTH, "https://localhost:3000");

    const [message] = sentMessages();
    expect(oneClickUrlOf(message).startsWith(`${SITE}/`)).toBe(true);
    expect(linkIn(message.html, "/unsubscribe").startsWith(`${SITE}/`)).toBe(true);
    expect(JSON.stringify(message)).not.toContain("localhost");
  });

  it("accepts `Name <address>` entries in NEWSLETTER_RECIPIENTS", async () => {
    vi.stubEnv("NEWSLETTER_RECIPIENTS", "Hugo <Owner@Example.com>, plain@example.com");

    const response = await send();

    expect(response.status).toBe(200);
    expect(recipientsOf(sentMessages())).toEqual(["owner@example.com", "plain@example.com"]);
    for (const message of sentMessages()) expect(message.to).toHaveLength(1);
  });

  it("escapes feed content, including links, in the edition", async () => {
    seedSubscribers("reader@example.com");

    await send();

    const { html } = sentMessages()[0];
    expect(html).toContain("Budget statement &lt;moved&gt; to March");
    expect(html).toContain('href="https://example.org/budget?a=1&amp;b=2"');
    // A feed link cannot close its href and add markup, or carry a script URL.
    expect(html).not.toContain("<img");
    expect(html).not.toContain("javascript:");
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
    expect(hasOptedOut("b@example.com")).toBe(true);
    expect(hasOptedOut("owner@example.com")).toBe(true);
    expect(fakeRedis.set(UNSUBSCRIBED_KEY).size).toBe(2);

    resendCalls = [];
    await send();
    expect(recipientsOf(sentMessages())).toEqual(["a@example.com", "c@example.com"]);
  });

  it("record the opt-out without keeping the address", async () => {
    seedSubscribers("a@example.com");
    await send();

    await oneClickUnsubscribe(oneClickUrlOf(sentMessages()[0]));

    const stored = JSON.stringify({
      sets: [...fakeRedis.sets].map(([key, members]) => [key, [...members]]),
      sortedSets: [...fakeRedis.sortedSets].map(([key, members]) => [key, [...members.keys()]]),
      counters: [...fakeRedis.counters.keys()],
    });
    expect(stored).not.toContain("a@example.com");
    expect(hasOptedOut("a@example.com")).toBe(true);
  });

  it("do nothing on GET — a link scanner cannot unsubscribe anyone", async () => {
    seedSubscribers("a@example.com");
    await send();
    const [message] = sentMessages();
    const token = tokenOf(oneClickUrlOf(message));

    // The request arrives on the container's own origin; the redirect must not follow it.
    const response = await unsubscribeRoute.GET(
      new NextRequest(`https://localhost:3000/api/newsletter/unsubscribe?token=${token}`),
    );

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

  it("keep working years after the email was sent", async () => {
    freezeTime();
    seedSubscribers("a@example.com");
    await send();
    const oneClick = oneClickUrlOf(sentMessages()[0]);

    advanceTime(5 * 365 * DAY_MS);

    expect((await oneClickUnsubscribe(oneClick)).status).toBe(200);
    expect(isSubscribed("a@example.com")).toBe(false);
  });
});

// ── double opt-in ───────────────────────────────────────────────────

describe("double opt-in", () => {
  it("holds a new sign-up as pending and emails only that address a confirmation link", async () => {
    const response = await subscribe("  New.Reader@Example.com ");
    await settle();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "pending" });
    expect(isSubscribed("new.reader@example.com")).toBe(false);
    expect(pendingAddresses()).toEqual(["new.reader@example.com"]);

    const messages = sentMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0].to).toEqual(["new.reader@example.com"]);
    expect(messages[0].subject).toMatch(/confirm/i);
    const link = linkIn(messages[0].html, "/subscribe/confirm");
    expect(verifyNewsletterToken("confirm", tokenOf(link))?.email).toBe("new.reader@example.com");
  });

  it("never sends an edition to an address that has not confirmed", async () => {
    seedSubscribers("confirmed@example.com");
    const token = await signUp("pending@example.com");

    resendCalls = [];
    expect((await send()).status).toBe(200);
    expect(recipientsOf(sentMessages())).toEqual(["confirmed@example.com"]);

    // Once the owner of the address confirms, the next edition includes them.
    const confirmed = await confirm(token);
    expect(confirmed.status).toBe(200);
    expect(await confirmed.json()).toEqual({ status: "confirmed" });
    expect(isSubscribed("pending@example.com")).toBe(true);
    expect(pendingAddresses()).toEqual([]);

    resendCalls = [];
    await send();
    expect(recipientsOf(sentMessages())).toEqual(["confirmed@example.com", "pending@example.com"]);
  });

  it("cannot be confirmed by fetching the link — the confirm endpoint has no GET", () => {
    expect(Object.keys(confirmRoute)).not.toContain("GET");
  });

  it("rejects a forged or altered confirmation token", async () => {
    const token = await signUp("pending@example.com");
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
    const confirmToken = await signUp("pending@example.com");

    // A subscriber's unsubscribe token for an address that is also pending.
    fakeRedis.sortedSet(PENDING_KEY).set("reader@example.com", Date.now());
    expect((await confirm(unsubscribeToken)).status).toBe(400);

    const response = await oneClickUnsubscribe(
      `${SITE}/api/newsletter/unsubscribe?token=${confirmToken}`,
    );
    expect(response.status).toBe(400);
    expect(pendingAddresses()).toContain("pending@example.com");
    expect(fakeRedis.set(UNSUBSCRIBED_KEY).size).toBe(0);
  });

  it("makes the confirmation link single-use: it cannot re-subscribe after an unsubscribe", async () => {
    const token = await signUp("reader@example.com");
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

  it("keeps a used link dead even when someone signs the address up again", async () => {
    freezeTime();
    const used = await signUp("reader@example.com");
    await confirm(used);
    await send();
    await oneClickUnsubscribe(oneClickUrlOf(sentMessages().at(-1)!));

    // Anyone can submit the address again; that must not revive the old link.
    advanceTime(60_000);
    const fresh = await signUp("reader@example.com");
    expect(fresh).not.toBe(used);

    expect((await confirm(used)).status).toBe(400);
    expect(isSubscribed("reader@example.com")).toBe(false);
    expect(hasOptedOut("reader@example.com")).toBe(true);

    // The link from the new email, which only the mailbox owner has, does work.
    expect(await (await confirm(fresh)).json()).toEqual({ status: "confirmed" });
    expect(isSubscribed("reader@example.com")).toBe(true);
  });

  it("honours only the most recently emailed link", async () => {
    freezeTime();
    const first = await signUp("reader@example.com");
    advanceTime(5 * 60_000);
    const second = await signUp("reader@example.com");

    expect((await confirm(first)).status).toBe(400);
    expect(isSubscribed("reader@example.com")).toBe(false);
    expect(await (await confirm(second)).json()).toEqual({ status: "confirmed" });
  });

  it("lets someone who unsubscribed come back by confirming a new sign-up", async () => {
    seedSubscribers("reader@example.com");
    await send();
    await oneClickUnsubscribe(oneClickUrlOf(sentMessages()[0]));
    expect(hasOptedOut("reader@example.com")).toBe(true);

    const token = await signUp("reader@example.com");
    // Signing up alone changes nothing; they stay off the list until they confirm.
    resendCalls = [];
    expect((await send()).status).toBe(400);
    expect(sentMessages()).toHaveLength(0);

    await confirm(token);
    expect(hasOptedOut("reader@example.com")).toBe(false);
    await send();
    expect(recipientsOf(sentMessages())).toEqual(["reader@example.com"]);
  });

  it("expires an unconfirmed sign-up, and the next sign-up or send forgets the address", async () => {
    freezeTime();
    const token = await signUp("slow@example.com");

    advanceTime(PENDING_TTL_MS + 60_000);
    expect((await confirm(token)).status).toBe(400);
    expect(isSubscribed("slow@example.com")).toBe(false);
    expect(pendingAddresses()).toEqual(["slow@example.com"]);

    // The daily send clears expired sign-ups out of Redis...
    seedSubscribers("member@example.com");
    await send();
    expect(pendingAddresses()).toEqual([]);

    // ...and so does the next sign-up by anyone.
    fakeRedis.sortedSet(PENDING_KEY).set("stale@example.com", Date.now() - PENDING_TTL_MS - 1);
    await signUp("someone.else@example.com");
    expect(pendingAddresses()).toEqual(["someone.else@example.com"]);
  });

  it("gives the same reply, after the same work, for a new, a pending and a subscribed address", async () => {
    seedSubscribers("member@example.com");
    await signUp("pending@example.com");
    fakeRedis.log = [];
    resendCalls = [];
    fetchMock.mockClear();

    const replies = [];
    const workBeforeReply = [];
    for (const email of ["fresh@example.com", "pending@example.com", "member@example.com"]) {
      const before = fakeRedis.log.length;
      const response = await subscribe(email);
      replies.push({ status: response.status, body: await response.json() });
      workBeforeReply.push(fakeRedis.log.slice(before));
    }

    // Identical status and body, one Redis read each, and nothing sent yet.
    expect(replies[1]).toEqual(replies[0]);
    expect(replies[2]).toEqual(replies[0]);
    expect(replies[0].status).toBe(200);
    expect(workBeforeReply).toEqual([
      [`sismember ${SUBSCRIBERS_KEY}`],
      [`sismember ${SUBSCRIBERS_KEY}`],
      [`sismember ${SUBSCRIBERS_KEY}`],
    ]);
    expect(fetchMock).not.toHaveBeenCalled();

    // Afterwards: a confirmation for the two that are not subscribed, none for the member.
    await settle();
    expect(recipientsOf(sentMessages())).toEqual(["fresh@example.com", "pending@example.com"]);
    expect(pendingAddresses()).not.toContain("member@example.com");
  });

  it("gives the same reply when the confirmation email cannot be sent, and keeps nothing", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    respondResend = () => resendError(403, "validation_error", "The domain is not verified.");

    const failed = await subscribe("fresh@example.com");
    await settle();
    respondResend = accept;
    const worked = await subscribe("other@example.com");
    await settle();

    expect(failed.status).toBe(200);
    expect(await failed.json()).toEqual(await worked.json());
    expect(pendingAddresses()).toEqual(["other@example.com"]);
    expect(isSubscribed("fresh@example.com")).toBe(false);
    expect(JSON.stringify(logged.mock.calls)).toContain("The domain is not verified.");
    expect(JSON.stringify(logged.mock.calls)).not.toContain("fresh@example.com");
  });

  it("does not count a failed send against the address", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    respondResend = () => resendError(403, "validation_error", "The domain is not verified.");
    for (let i = 0; i < MAX_CONFIRMATIONS_PER_ADDRESS_PER_DAY + 2; i++) {
      await subscribe("fresh@example.com");
      await settle();
    }
    expect(pendingAddresses()).toEqual([]);

    respondResend = accept;
    resendCalls = [];
    await signUp("fresh@example.com");

    expect(pendingAddresses()).toEqual(["fresh@example.com"]);
  });

  it("leaves an earlier, delivered link working when a later confirmation fails to send", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    freezeTime();
    const delivered = await signUp("reader@example.com");

    advanceTime(60 * 60_000);
    respondResend = () => resendError(403, "validation_error", "The domain is not verified.");
    await subscribe("reader@example.com");
    await settle();

    expect(await (await confirm(delivered)).json()).toEqual({ status: "confirmed" });
  });

  it("sends one address at most three confirmation emails a day", async () => {
    freezeTime("2026-11-16T09:00:00Z");
    for (let i = 0; i < 6; i++) {
      advanceTime(10 * 60_000);
      await subscribe("fresh@example.com");
      await settle();
    }
    expect(MAX_CONFIRMATIONS_PER_ADDRESS_PER_DAY).toBe(3);
    expect(recipientsOf(sentMessages())).toEqual(Array(3).fill("fresh@example.com"));

    // Another address is unaffected, and the allowance comes back the next day.
    await signUp("other@example.com");
    advanceTime(DAY_MS);
    resendCalls = [];
    await signUp("fresh@example.com");
    expect(recipientsOf(sentMessages())).toEqual(["fresh@example.com"]);

    // The counters expire on their own.
    expect(fakeRedis.counters.size).toBe(3);
    expect([...fakeRedis.expiries.keys()].sort()).toEqual([...fakeRedis.counters.keys()].sort());
  });

  it("holds that limit when many sign-ups for one address arrive at once", async () => {
    await Promise.all(Array.from({ length: 10 }, () => subscribe("fresh@example.com")));
    expect(deferred).toHaveLength(10);

    // All ten run interleaved, as they would on a busy server.
    await Promise.all(deferred.splice(0).map((task) => task()));

    expect(recipientsOf(sentMessages())).toEqual(Array(3).fill("fresh@example.com"));
  });

  it("rejects anything that is not one plain address", async () => {
    for (const email of [
      "a@example.com, b@example.com",
      "a@example.com,b@example.com",
      "a@example.com，b＠example.com", // full-width comma and @
      "Someone <a@example.com>",
      "not-an-address",
      "",
      null,
      42,
    ]) {
      expect((await subscribe(email)).status).toBe(400);
    }
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fakeRedis.commands).toBe(0);
  });

  it("refuses sign-ups when links cannot be signed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("NEWSLETTER_TOKEN_SECRET", undefined);

    const response = await subscribe("fresh@example.com");
    await settle();

    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(pendingAddresses()).toEqual([]);
  });

  it("reports a Redis outage without logging the address", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    fakeRedis.down = true;

    const response = await subscribe("private.person@example.com");

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("private.person");
    expect(logged).toHaveBeenCalled();
    expect(JSON.stringify(logged.mock.calls)).not.toContain("command was");
  });

  it("never puts the confirmation link in the reply or, with a mail provider, in the log", async () => {
    const logs = [
      vi.spyOn(console, "log").mockImplementation(() => {}),
      vi.spyOn(console, "info").mockImplementation(() => {}),
      vi.spyOn(console, "warn").mockImplementation(() => {}),
      vi.spyOn(console, "error").mockImplementation(() => {}),
    ];

    const response = await subscribe("fresh@example.com");
    const body = JSON.stringify(await response.json());
    await settle();

    const token = tokenOf(linkIn(sentMessages()[0].html, "/subscribe/confirm"));
    expect(body).not.toContain("token");
    expect(body).not.toContain(token);
    for (const log of logs) expect(JSON.stringify(log.mock.calls)).not.toContain(token);
  });

  it("without a mail provider, logs the link for local use and still keeps it out of the reply", async () => {
    const warned = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("RESEND_API_KEY", undefined);

    const response = await subscribe("fresh@example.com");
    const body = JSON.stringify(await response.json());
    await settle();

    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(pendingAddresses()).toEqual(["fresh@example.com"]);
    const link = String(warned.mock.calls[0]?.[0]).match(/https:\/\/\S+/)?.[0] ?? "";
    expect(body).not.toContain(tokenOf(link));
    // The logged link is a working one.
    expect(await (await confirm(tokenOf(link))).json()).toEqual({ status: "confirmed" });
  });

  it("limits how many sign-ups one client can make in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const client = { "x-forwarded-for": "203.0.113.77" };

    const statuses = [];
    for (let i = 0; i < 12; i++) {
      statuses.push((await subscribe(`reader${i}@example.com`, client)).status);
    }

    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(200));
    expect(statuses.slice(10)).toEqual([429, 429]);
  });
});

// ── send: failures and misconfiguration ─────────────────────────────

describe("POST /api/newsletter/send — failures", () => {
  it("reports each recipient that could not be sent to, and still sends to the rest", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    seedSubscribers("a@example.com", "broken@example.com", "c@example.com");
    respondResend = (emails) =>
      emails.some((email) => email.to[0] === "broken@example.com")
        ? resendError(422, "validation_error", "Invalid `to` field.")
        : accept(emails);

    const response = await send();

    // Not a 2xx: the scheduled job only fails on a 5xx, and it should fail here.
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      status: "partial",
      error: "Some recipients were not sent to",
      recipients: 3,
      sent: 2,
      failed: 1,
      failures: [{ email: "broken@example.com", error: "Invalid `to` field.", status: 422 }],
    });
    // Each good address was accepted exactly once while the bad one was narrowed down.
    expect(recipientsOf(acceptedBatches.flat())).toEqual(["a@example.com", "c@example.com"]);
    // The server log names the reason but not the full address.
    expect(JSON.stringify(logged.mock.calls)).toContain("Invalid `to` field.");
    expect(JSON.stringify(logged.mock.calls)).not.toContain("broken@example.com");
  });

  it("returns 502 and lists everyone when nothing could be sent", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    seedSubscribers("a@example.com", "b@example.com");
    respondResend = () => resendError(403, "validation_error", "The domain is not verified.");

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

    expect(response.status).toBe(502);
    expect(recipientsOf(sentMessages())).toEqual(["a@example.com"]);
    const body = await response.json();
    expect(body.status).toBe("partial");
    expect(body.failures).toEqual([
      { email: "a@example.com,b@example.com", error: expect.stringMatching(/not a valid email/i) },
    ]);
  });

  it("stops when its time is up and reports who was not reached", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    freezeTime();
    seedSubscribers(...addresses(150));
    respondResend = (emails) => {
      advanceTime(41_000); // the first batch takes longer than the whole budget
      return accept(emails);
    };

    const response = await send();

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body).toMatchObject({ status: "partial", recipients: 150, sent: 100, failed: 50 });
    expect(resendCalls).toHaveLength(1);
    expect(body.failures[0].error).toMatch(/ran out of time/);
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

  it.each([
    ["the list of opt-outs", UNSUBSCRIBED_KEY],
    ["the subscriber list", SUBSCRIBERS_KEY],
  ])("sends nothing when %s cannot be read", async (_label, key) => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    seedSubscribers("a@example.com");
    vi.stubEnv("NEWSLETTER_RECIPIENTS", "owner@example.com");
    fakeRedis.failingKeys.add(key);

    const response = await send();

    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(JSON.stringify(logged.mock.calls)).not.toContain("command was");
  });

  it("still sends when only the clean-up of expired sign-ups fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    seedSubscribers("a@example.com");
    fakeRedis.failingKeys.add(PENDING_KEY);

    const response = await send();

    expect(response.status).toBe(200);
    expect(recipientsOf(sentMessages())).toEqual(["a@example.com"]);
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

  it("does not show the addresses to anyone when CRON_SECRET is not set", async () => {
    seedSubscribers("a@example.com");
    vi.stubEnv("CRON_SECRET", undefined);

    const attempts: Record<string, string>[] = [
      {},
      { authorization: "Bearer undefined" },
      { authorization: "Bearer " },
    ];
    for (const headers of attempts) {
      expect(await (await list(headers)).json()).toEqual({ count: 1 });
    }
  });
});
