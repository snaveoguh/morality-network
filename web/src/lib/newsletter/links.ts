import "server-only";

import { SITE_URL } from "@/lib/brand";

import { pendingLinkExpiry } from "./store";
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

/**
 * The link in a confirmation email. `requestedAt` is the sign-up time the
 * pending entry is recorded with; the link works only for that sign-up.
 */
export function confirmationLink(email: string, requestedAt: number): string {
  const token = createNewsletterToken("confirm", email, {
    expiresAt: pendingLinkExpiry(requestedAt),
  });
  return `${site()}/subscribe/confirm?token=${token}`;
}
