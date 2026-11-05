// Claim Ledger — non-MP entities (migration 018).
//
// Client-safe helpers only (no DB): the review UIs import these. The ledger's
// first non-MP kind is 'manufacturer' — hardware makers whose published
// privacy/security statements are recorded and checked against documented
// outcomes, through the same review gate as MPs' claims.

import type { LedgerContext } from "./types";

export const CONTEXT_LABEL: Record<LedgerContext, string> = {
  pmqs: "PMQs",
  budget: "Budget",
  manifesto: "Manifesto",
  "company-statement": "Company statement",
};

/** Plain-words label for a claim's source link (no hard-coded "Hansard"). */
export function claimSourceLabel(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host === "hansard.parliament.uk") return "Hansard";
    if (host === "web.archive.org") return "Internet Archive copy";
    return host;
  } catch {
    return "Source";
  }
}

/** Entity ids are slugs; validated before any DB read. */
export function isValidEntityId(id: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(id);
}
