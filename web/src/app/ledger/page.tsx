import Link from "next/link";
import {
  getAnsweredDisputes,
  getLedgerWeekSnapshot,
  getPublishedVerdicts,
} from "@/lib/ledger/service";
import type { LedgerDispute } from "@/lib/db/ledger-disputes";
import type {
  LedgerClaim,
  LedgerResolution,
  LedgerWeekSnapshot,
} from "@/lib/ledger/types";
import { BRAND_NAME, withBrand } from "@/lib/brand";

export const revalidate = 1800; // 30 min ISR
export const maxDuration = 120; // first render may run live extraction

export const metadata = {
  title: withBrand("The Claim Ledger"),
  description:
    "Checkable claims made at Prime Minister's Questions, quoted verbatim and linked to Hansard. No verdicts — sources only.",
};

// Ledger style is sworn: quote, source, date, classification. The copy on
// this page must never editorialise a claim or infer motive (spec Principles).

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

const CLAIM_TYPE_LABEL: Record<LedgerClaim["claimType"], string> = {
  retrodictable: "Checkable now",
  predictive: "Checkable later",
  unfalsifiable: "Not checkable",
};

const TOPIC_LABEL: Record<LedgerClaim["topic"], string> = {
  statistics: "Statistics",
  "voting-record": "Voting record",
  "policy-outcome": "Policy outcome",
  spending: "Spending",
  other: "Other",
};

function formatSittingDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function groupBySpeaker(claims: LedgerClaim[]): Array<[string, LedgerClaim[]]> {
  const groups = new Map<string, LedgerClaim[]>();
  for (const claim of claims) {
    const key = claim.speaker.name;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(claim);
  }
  return [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
}

// Published verdict vocabulary (spec Principles §4 — fixed, no motive).
const VERDICT_LABEL: Record<LedgerResolution["verdict"], string> = {
  true: "Resolved true",
  false: "Resolved false",
  partial: "Partially true",
  unresolved: "Unresolved",
};

function ClaimRow({
  claim,
  resolution,
  disputes,
}: {
  claim: LedgerClaim;
  resolution?: LedgerResolution;
  disputes?: LedgerDispute[];
}) {
  return (
    <li className="py-5">
      <blockquote className="border-l-2 border-[var(--rule)] pl-4 font-body-serif text-base leading-relaxed text-[var(--ink)]">
        &ldquo;{claim.verbatimQuote}&rdquo;
      </blockquote>

      <p className="mt-2 pl-4 font-body-serif text-sm text-[var(--ink-light)]">
        {claim.normalizedClaim}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2 pl-4 font-mono text-[9px] uppercase tracking-[0.2em]">
        {resolution ? (
          <span
            className={`border px-1.5 py-0.5 font-bold ${
              resolution.verdict === "false" || resolution.verdict === "partial"
                ? "border-[var(--accent-red)] bg-[var(--accent-red)] text-[var(--paper)]"
                : "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]"
            }`}
          >
            {VERDICT_LABEL[resolution.verdict]}
          </span>
        ) : (
          <span className="border border-[var(--ink)] px-1.5 py-0.5 font-bold text-[var(--ink)]">
            {CLAIM_TYPE_LABEL[claim.claimType]}
          </span>
        )}
        <span className="border border-[var(--rule-light)] px-1.5 py-0.5 text-[var(--ink-light)]">
          {TOPIC_LABEL[claim.topic]}
        </span>
        {claim.resolutionDue && (
          <span className="text-[var(--ink-faint)]">
            due {claim.resolutionDue}
          </span>
        )}
        {claim.occurrences > 1 && (
          <span className="text-[var(--ink-faint)]">
            repeated &times;{claim.occurrences}
          </span>
        )}
        <span className="text-[var(--rule-light)]">|</span>
        <a
          href={claim.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--accent-red)] underline decoration-1 underline-offset-2 transition-colors hover:text-[var(--ink)]"
        >
          Source: Hansard
        </a>
        <span className="text-[var(--rule-light)]">|</span>
        <Link
          href={`/ledger/dispute?claim=${claim.id}`}
          className="text-[var(--ink-faint)] underline decoration-1 underline-offset-2 transition-colors hover:text-[var(--accent-red)]"
        >
          Dispute
        </Link>
      </div>

      {disputes && disputes.length > 0 && (
        <div className="mt-3 border-l-2 border-[var(--accent-red)] pl-4">
          {disputes.map((d) => (
            <div key={d.id} className="mt-1">
              <p className="font-mono text-[8px] uppercase tracking-[0.25em] text-[var(--accent-red)]">
                Disputed — right of reply
              </p>
              <p className="mt-1 font-body-serif text-xs leading-relaxed text-[var(--ink-light)]">
                {d.body}
              </p>
              {d.response && (
                <p className="mt-1 font-body-serif text-xs italic leading-relaxed text-[var(--ink-faint)]">
                  Ledger response: {d.response}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {resolution && resolution.evidence.length > 0 && (
        <div className="mt-3 pl-4">
          <p className="font-mono text-[8px] uppercase tracking-[0.25em] text-[var(--ink-faint)]">
            Evidence
          </p>
          <ul className="mt-1 space-y-1">
            {resolution.evidence.map((e, i) => (
              <li
                key={i}
                className="font-body-serif text-xs leading-relaxed text-[var(--ink-light)]"
              >
                <a
                  href={e.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--accent-red)] underline decoration-1 underline-offset-2"
                >
                  [{e.kind}]
                </a>{" "}
                {e.excerpt}
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

export default async function LedgerPage() {
  const snapshot = await withTimeout<LedgerWeekSnapshot | null>(
    getLedgerWeekSnapshot(),
    90_000,
    null,
  );

  const claims = snapshot?.claims ?? [];
  const claimIds = claims.map((c) => c.id);
  const [verdicts, disputes] = await Promise.all([
    getPublishedVerdicts(claimIds),
    getAnsweredDisputes(claimIds),
  ]);
  const bySpeaker = groupBySpeaker(claims);
  const checkable = claims.filter((c) => c.claimType !== "unfalsifiable");

  return (
    <section className="mx-auto max-w-4xl py-8">
      <header className="mb-8 border-b-2 border-[var(--rule)] pb-6">
        <div className="mb-3 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-faint)]">
          <Link href="/" className="transition-colors hover:text-[var(--ink)]">
            &larr; Front Page
          </Link>
          <span className="text-[var(--rule-light)]">|</span>
          <span>The Claim Ledger</span>
        </div>
        <h1 className="font-headline text-4xl text-[var(--ink)] md:text-6xl">
          This Week&rsquo;s Checkable Claims
        </h1>
        <p className="mt-3 max-w-2xl font-body-serif text-base leading-relaxed text-[var(--ink-light)]">
          Claims made at Prime Minister&rsquo;s Questions, quoted verbatim and
          linked to the official record. No verdicts are published here. Each
          claim is classified by whether records could check it — resolution
          against primary sources comes next.
        </p>

        {/* Ledger section grid — same hub pattern as /coop's Playground:
            a visible card grid beats a nav dropdown for a growing set of
            sub-pages. */}
        <div className="mt-5 grid grid-cols-1 gap-0 sm:grid-cols-3">
          <Link
            href="/ledger"
            className="group border border-[var(--ink)] bg-[var(--ink)] p-4"
          >
            <span className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--paper)]">
              This Week&rsquo;s Claims
            </span>
            <p className="mt-1 font-mono text-[8px] uppercase tracking-wider text-[var(--paper)]/70">
              PMQs, quoted &amp; sourced
            </p>
          </Link>
          <Link
            href="/ledger/manifestos"
            className="group border border-l-0 border-[var(--rule-light)] p-4 transition-colors hover:bg-[var(--paper-dark)] sm:border-l"
          >
            <span className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--ink)] group-hover:underline">
              Manifesto Commitments
            </span>
            <p className="mt-1 font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
              What the parties wrote down
            </p>
          </Link>
          <Link
            href="/ledger/funding"
            className="group border border-l-0 border-[var(--rule-light)] p-4 transition-colors hover:bg-[var(--paper-dark)] sm:border-l"
          >
            <span className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--ink)] group-hover:underline">
              Who Funds the Parties
            </span>
            <p className="mt-1 font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
              Electoral Commission register
            </p>
          </Link>
        </div>

        {snapshot && (
          <div className="mt-4 flex flex-wrap gap-4 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
            <span>
              <strong className="text-[var(--ink)]">
                {formatSittingDate(snapshot.debate.date)}
              </strong>
            </span>
            <span className="text-[var(--rule-light)]">|</span>
            <span>
              <strong className="text-[var(--ink)]">{claims.length}</strong>{" "}
              claims
            </span>
            <span className="text-[var(--rule-light)]">|</span>
            <span>
              <strong className="text-[var(--ink)]">{checkable.length}</strong>{" "}
              checkable
            </span>
            <span className="text-[var(--rule-light)]">|</span>
            <span>
              <strong className="text-[var(--ink)]">{verdicts.size}</strong>{" "}
              resolved
            </span>
            <span className="text-[var(--rule-light)]">|</span>
            <span>
              <strong className="text-[var(--ink)]">
                {snapshot.contributionsScanned}
              </strong>{" "}
              contributions scanned
            </span>
            <span className="text-[var(--rule-light)]">|</span>
            <a
              href={snapshot.debate.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--accent-red)] underline decoration-1 underline-offset-2"
            >
              Full transcript
            </a>
          </div>
        )}

        {snapshot &&
          Date.now() - new Date(snapshot.debate.date).getTime() >
            13 * 24 * 60 * 60 * 1000 && (
            <div className="mt-4 border-2 border-[var(--ink)] bg-[var(--paper-dark)]/40 px-4 py-3">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
                The House is not sitting
              </p>
              <p className="mt-1 font-body-serif text-sm italic text-[var(--ink-light)]">
                No Prime Minister&rsquo;s Questions has been held since{" "}
                {formatSittingDate(snapshot.debate.date)} — the Commons is in
                recess. The ledger checks Hansard every Wednesday and resumes
                automatically at the next sitting PMQs.
              </p>
            </div>
          )}
      </header>

      {claims.length === 0 && (
        <div className="border border-[var(--rule-light)] bg-[var(--paper-dark)]/30 p-8 text-center">
          <p className="font-headline-serif text-xl text-[var(--ink)]">
            {snapshot
              ? "Extraction for the latest session has not run yet."
              : "The latest session is still being prepared."}
          </p>
          <p className="mt-2 font-body-serif text-sm italic text-[var(--ink-light)]">
            Claims publish after each Prime Minister&rsquo;s Questions. Check
            back shortly.
          </p>
        </div>
      )}

      <div className="space-y-10">
        {bySpeaker.map(([speaker, speakerClaims]) => {
          const meta = speakerClaims[0].speaker;
          return (
            <section key={speaker}>
              <div className="mb-1 flex items-baseline justify-between border-b border-[var(--rule-light)] pb-2">
                <h2 className="font-headline-serif text-xl font-bold text-[var(--ink)]">
                  {meta.memberId ? (
                    <Link
                      href={`/ledger/member/${meta.memberId}`}
                      className="transition-colors hover:text-[var(--accent-red)]"
                    >
                      {speaker}
                    </Link>
                  ) : (
                    speaker
                  )}
                </h2>
                <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
                  {[meta.constituency, meta.party].filter(Boolean).join(" · ") ||
                    "—"}{" "}
                  · {speakerClaims.length}{" "}
                  {speakerClaims.length === 1 ? "claim" : "claims"}
                </span>
              </div>
              <ul className="divide-y divide-[var(--rule-light)]">
                {speakerClaims.map((claim) => (
                  <ClaimRow
                    key={claim.id}
                    claim={claim}
                    resolution={verdicts.get(claim.id)}
                    disputes={disputes.get(claim.id)}
                  />
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <footer className="mt-12 border-t-2 border-[var(--rule)] pt-4 pb-8">
        <p className="text-center font-mono text-[8px] uppercase tracking-[0.3em] text-[var(--ink-faint)]">
          {BRAND_NAME} &bull; the claim ledger &bull; quotes are verbatim from
          Hansard &bull; classifications are machine-proposed
          {claims[0] &&
            ` (${claims[0].extractedBy.model}, ${claims[0].extractedBy.version})`}
        </p>
        <p className="mt-2 text-center font-mono text-[8px] uppercase tracking-[0.3em] text-[var(--ink-faint)]">
          errors in extraction are visible by construction — every quote links
          its source
        </p>
      </footer>
    </section>
  );
}
