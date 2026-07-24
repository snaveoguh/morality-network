// Claim Ledger — the ONE place a published verdict is presented.
//
// Consolidated after the media solicitor's review (2026-07-24). Every public
// surface (the ledger, entity pages, manifesto pages) renders verdicts through
// these components so the legally-reviewed presentation cannot drift or be
// dropped on one page:
//   - the label is framed as the Ledger's ASSESSMENT AGAINST THE LINKED RECORD,
//     not a bare factual adjudication (Defamation Act 2013 s.3 honest opinion);
//   - "Partially true" always carries its qualifying sentence;
//   - a short basis summary sits beside the label where present.
//
// Never render `resolution.verdict` as a bare label anywhere else.

import type { LedgerResolution, LedgerVerdict } from "@/lib/ledger/types";

// Published verdict vocabulary (spec Principles §4 — fixed, no motive).
export const VERDICT_LABEL: Record<LedgerVerdict, string> = {
  true: "Resolved true",
  false: "Resolved false",
  partial: "Partially true",
  unresolved: "Unresolved",
};

// Shown wherever "Partially true" appears, so the reader can tell that the
// records support part but not all of the claim (solicitor Q2).
export const PARTIAL_QUALIFIER =
  "The records reviewed support part, but not all, of this claim.";

// The framing that turns a label from a bald adjudication into a reviewable
// opinion tied to the cited records (solicitor Q1).
export const ASSESSMENT_FRAMING =
  "The Claim Ledger's assessment against the linked public record.";

function isNegative(v: LedgerVerdict): boolean {
  return v === "false" || v === "partial";
}

/** The inline verdict chip. Same visual weight everywhere. */
export function VerdictBadge({ verdict }: { verdict: LedgerVerdict }) {
  return (
    <span
      className={`border px-1.5 py-0.5 font-bold ${
        isNegative(verdict)
          ? "border-[var(--accent-red)] bg-[var(--accent-red)] text-[var(--paper)]"
          : "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]"
      }`}
    >
      {VERDICT_LABEL[verdict]}
    </span>
  );
}

/**
 * The block that sits directly under the meta row for a published verdict:
 * the assessment framing, the "Partially true" qualifier when relevant, and
 * the published basis summary when present. Renders nothing for an
 * unpublished or absent resolution.
 */
export function VerdictRationale({
  resolution,
}: {
  resolution?: LedgerResolution | null;
}) {
  if (!resolution || resolution.status !== "published") return null;

  return (
    <div className="mt-2 pl-4">
      <p className="font-body-serif text-xs italic leading-relaxed text-[var(--ink-faint)]">
        {ASSESSMENT_FRAMING}
      </p>
      {resolution.verdict === "partial" && (
        <p className="mt-1 font-body-serif text-xs leading-relaxed text-[var(--ink-light)]">
          {PARTIAL_QUALIFIER}
        </p>
      )}
      {resolution.basisSummary && (
        <p className="mt-1 font-body-serif text-xs leading-relaxed text-[var(--ink-light)]">
          <span className="font-mono text-[8px] uppercase tracking-[0.25em] text-[var(--ink-faint)]">
            Basis
          </span>{" "}
          {resolution.basisSummary}
        </p>
      )}
    </div>
  );
}
