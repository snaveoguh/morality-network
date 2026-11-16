import "server-only";

import { SITE_URL } from "@/lib/brand";

import { PENDING_TTL_MS } from "./store";
import { createNewsletterToken } from "./tokens";

/**
 * Links that go into newsletter mail. Built from the canonical site URL, not
 * from `request.url`: behind Railway's proxy that is the container origin.
 */

function site(): string {
  return SITE_URL.replace(/\/+$/, "");
}

/**
 * The two addresses of one recipient's unsubscribe link:
 *   page     — the footer link; a page with a single confirm button
 *   oneClick — the List-Unsubscribe header target; unsubscribes on POST
 *              (RFC 8058), which is what a mail client's own button sends
 */
export function unsubscribeLinks(email: string): { page: string; oneClick: string } {
  const token = createNewsletterToken("unsubscribe", email);
  return {
    page: `${site()}/unsubscribe?token=${token}`,
    oneClick: `${site()}/api/newsletter/unsubscribe?token=${token}`,
  };
}

/** Where the footer link lands, for a token that arrived at the API by GET. */
export function unsubscribePageUrl(token: string): string {
  return `${site()}/unsubscribe${token ? `?token=${encodeURIComponent(token)}` : ""}`;
}

/** The link in a confirmation email. Valid for as long as the sign-up stays pending. */
export function confirmationLink(email: string, now: number = Date.now()): string {
  const token = createNewsletterToken("confirm", email, { expiresAt: now + PENDING_TTL_MS });
  return `${site()}/subscribe/confirm?token=${token}`;
}
