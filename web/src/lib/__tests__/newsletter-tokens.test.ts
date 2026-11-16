import crypto from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createNewsletterToken,
  newsletterTokensConfigured,
  verifyNewsletterToken,
} from "../newsletter/tokens";

const SECRET = "test-newsletter-token-secret-0123456789abcdef";
const EMAIL = "reader@example.com";

beforeEach(() => {
  vi.stubEnv("NEWSLETTER_TOKEN_SECRET", SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("newsletter tokens", () => {
  it("round-trips the address for both purposes", () => {
    for (const purpose of ["confirm", "unsubscribe"] as const) {
      const token = createNewsletterToken(purpose, EMAIL);
      expect(verifyNewsletterToken(purpose, token)).toEqual({ email: EMAIL, expiresAt: 0 });
    }
  });

  it("round-trips addresses with plus tags, dots and non-ASCII characters", () => {
    for (const email of ["first.last+pooter@sub.example.co.uk", "jörg@exämple.de"]) {
      const token = createNewsletterToken("unsubscribe", email);
      expect(verifyNewsletterToken("unsubscribe", token)?.email).toBe(email);
    }
  });

  it("is URL-safe without encoding", () => {
    const token = createNewsletterToken("unsubscribe", "first.last+pooter@example.com");
    expect(token).toMatch(/^[A-Za-z0-9_.-]+$/);
    expect(encodeURIComponent(token)).toBe(token);
  });

  it("rejects a token with any single character changed", () => {
    const token = createNewsletterToken("unsubscribe", EMAIL);
    for (let i = 0; i < token.length; i++) {
      const replacement = token[i] === "A" ? "B" : "A";
      const tampered = token.slice(0, i) + replacement + token.slice(i + 1);
      expect(verifyNewsletterToken("unsubscribe", tampered), `position ${i}`).toBeNull();
    }
  });

  it("rejects a valid signature moved onto another address", () => {
    const mine = createNewsletterToken("unsubscribe", "attacker@example.com");
    const signature = mine.split(".")[2];
    const victim = Buffer.from("victim@example.com", "utf8").toString("base64url");
    expect(verifyNewsletterToken("unsubscribe", `${victim}.0.${signature}`)).toBeNull();
  });

  it("rejects a token signed with a different key", () => {
    const body = `${Buffer.from(EMAIL, "utf8").toString("base64url")}.0`;
    const forged = crypto
      .createHmac("sha256", "a-key-the-attacker-made-up-0123456789abcdef")
      .update(`pooter-newsletter:v1:unsubscribe:${body}`)
      .digest("base64url");
    expect(verifyNewsletterToken("unsubscribe", `${body}.${forged}`)).toBeNull();

    const token = createNewsletterToken("unsubscribe", EMAIL);
    vi.stubEnv("NEWSLETTER_TOKEN_SECRET", "a-rotated-secret-0123456789abcdef-0123456789");
    expect(verifyNewsletterToken("unsubscribe", token)).toBeNull();
  });

  it("binds the purpose: a confirm token cannot unsubscribe and vice versa", () => {
    const confirm = createNewsletterToken("confirm", EMAIL);
    const unsubscribe = createNewsletterToken("unsubscribe", EMAIL);
    expect(verifyNewsletterToken("unsubscribe", confirm)).toBeNull();
    expect(verifyNewsletterToken("confirm", unsubscribe)).toBeNull();
  });

  it("honours the expiry and cannot have it extended", () => {
    const now = Date.UTC(2026, 10, 16);
    const token = createNewsletterToken("confirm", EMAIL, { expiresAt: now + 60_000 });
    expect(verifyNewsletterToken("confirm", token, now)).toEqual({
      email: EMAIL,
      expiresAt: now + 60_000,
    });
    expect(verifyNewsletterToken("confirm", token, now + 61_000)).toBeNull();

    const [email, expiry, signature] = token.split(".");
    const extended = `${email}.${Number(expiry) + 86_400}.${signature}`;
    expect(verifyNewsletterToken("confirm", extended, now)).toBeNull();
    // Dropping the expiry altogether is not a way round it either.
    expect(verifyNewsletterToken("confirm", `${email}.0.${signature}`, now)).toBeNull();
  });

  it("never expires when minted without an expiry", () => {
    const token = createNewsletterToken("unsubscribe", EMAIL);
    const tenYears = Date.now() + 10 * 365 * 86_400_000;
    expect(verifyNewsletterToken("unsubscribe", token, tenYears)?.email).toBe(EMAIL);
  });

  it("rejects malformed input without throwing", () => {
    for (const junk of [null, undefined, "", ".", "..", "a.b.c", "not-a-token", "a.0", "a.0.b.c"]) {
      expect(verifyNewsletterToken("unsubscribe", junk)).toBeNull();
    }
  });

  it("fails closed when the secret is missing or too short", () => {
    const token = createNewsletterToken("unsubscribe", EMAIL);

    for (const secret of [undefined, "", "   ", "too-short"]) {
      vi.stubEnv("NEWSLETTER_TOKEN_SECRET", secret);
      expect(newsletterTokensConfigured()).toBe(false);
      expect(() => createNewsletterToken("unsubscribe", EMAIL)).toThrow(/NEWSLETTER_TOKEN_SECRET/);
      expect(verifyNewsletterToken("unsubscribe", token)).toBeNull();
    }

    vi.stubEnv("NEWSLETTER_TOKEN_SECRET", SECRET);
    expect(newsletterTokensConfigured()).toBe(true);
  });
});
