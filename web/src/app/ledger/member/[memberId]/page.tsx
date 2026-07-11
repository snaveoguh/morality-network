import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublishedVerdicts } from "@/lib/ledger/service";
import { computeCalibration } from "@/lib/ledger/score";
import type { LedgerClaim, LedgerResolution } from "@/lib/ledger/types";
import { BRAND_NAME, withBrand } from "@/lib/brand";
import { getMemberInterestEdges } from "@/lib/funding/member-profile";

export const revalidate = 1800;

// Per-entity record page (spec Phase C). Sworn style: quotes, sources,
// verdicts with evidence. The calibration score is WITHHELD below the n≥20
// display threshold — progress toward it is shown instead, and the
// checkability rate publishes regardless (it is itself signal).

export const metadata = {
  title: withBrand("Member Record — The Claim Ledger"),
  description:
    "Longitudinal claim record for a UK Member of Parliament: verbatim quotes, sources, resolved verdicts.",
};

const VERDICT_LABEL: Record<LedgerResolution["verdict"], string> = {
  true: "Resolved true",
  false: "Resolved false",
  partial: "Partially true",
  unresolved: "Unresolved",
};

const CLAIM_TYPE_LABEL: Record<LedgerClaim["claimType"], string> = {
  retrodictable: "Checkable now",
  predictive: "Checkable later",
  unfalsifiable: "Not checkable",
};

async function loadMemberClaims(memberId: number): Promise<LedgerClaim[]> {
  if (!process.env.DATABASE_URL) return [];
  try {
    const { listLedgerClaimsForMember } = await import(
      "@/lib/db/ledger-claims"
    );
    return await listLedgerClaimsForMember(memberId);
  } catch (error) {
    console.warn("[ledger/member] claims read failed:", error);
    return [];
  }
}

export default async function MemberLedgerPage({
  params,
}: {
  params: Promise<{ memberId: string }>;
}) {
  const { memberId: rawId } = await params;
  const memberId = Number.parseInt(rawId, 10);
  if (!Number.isFinite(memberId) || memberId <= 0) notFound();

  const claims = await loadMemberClaims(memberId);
  if (claims.length === 0) notFound();

  const [verdicts, interestGroups] = await Promise.all([
    getPublishedVerdicts(claims.map((c) => c.id)),
    getMemberInterestEdges(memberId),
  ]);
  const calibration = computeCalibration(claims, verdicts);
  const speaker = claims[0].speaker;

  return (
    <section className="mx-auto max-w-4xl py-8">
      <header className="mb-8 border-b-2 border-[var(--rule)] pb-6">
        <div className="mb-3 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-faint)]">
          <Link href="/ledger" className="transition-colors hover:text-[var(--ink)]">
            &larr; The Ledger
          </Link>
          <span className="text-[var(--rule-light)]">|</span>
          <span>Member Record</span>
        </div>
        <h1 className="font-headline text-4xl text-[var(--ink)] md:text-5xl">
          {speaker.name}
        </h1>
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-light)]">
          {[speaker.constituency, speaker.party].filter(Boolean).join(" · ") || "—"}
          {" · "}
          <a
            href={`https://members.parliament.uk/member/${memberId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent-red)] underline decoration-1 underline-offset-2"
          >
            Parliament profile
          </a>
        </p>

        <div className="mt-5 grid grid-cols-2 gap-4 border border-[var(--rule-light)] p-4 md:grid-cols-4">
          <div>
            <p className="font-headline text-3xl text-[var(--ink)]">
              {calibration.nClaims}
            </p>
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
              claims on record
            </p>
          </div>
          <div>
            <p className="font-headline text-3xl text-[var(--ink)]">
              {calibration.nResolved}
            </p>
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
              resolved
            </p>
          </div>
          <div>
            <p className="font-headline text-3xl text-[var(--ink)]">
              {calibration.checkabilityRate}%
            </p>
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
              checkability rate
            </p>
          </div>
          <div>
            {calibration.scoreVisible ? (
              <>
                <p className="font-headline text-3xl text-[var(--ink)]">
                  {calibration.pctTrue}%
                </p>
                <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
                  resolved true (n={calibration.nResolved})
                </p>
              </>
            ) : (
              <>
                <p className="font-headline text-3xl text-[var(--ink-faint)]">
                  &mdash;
                </p>
                <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
                  score at 20 resolved ({calibration.resolvedNeeded} to go)
                </p>
              </>
            )}
          </div>
        </div>
        <p className="mt-2 font-mono text-[8px] uppercase tracking-[0.25em] text-[var(--ink-faint)]">
          no score displays below 20 resolved claims — small samples mislead
          in both directions
        </p>
      </header>

      <ul className="divide-y divide-[var(--rule-light)]">
        {claims.map((claim) => {
          const resolution = verdicts.get(claim.id);
          return (
            <li key={claim.id} className="py-5">
              <blockquote className="border-l-2 border-[var(--rule)] pl-4 font-body-serif text-base leading-relaxed text-[var(--ink)]">
                &ldquo;{claim.verbatimQuote}&rdquo;
              </blockquote>
              <p className="mt-2 pl-4 font-body-serif text-sm text-[var(--ink-light)]">
                {claim.normalizedClaim}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 pl-4 font-mono text-[9px] uppercase tracking-[0.2em]">
                {resolution && resolution.verdict !== "unresolved" ? (
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
                <span className="text-[var(--ink-light)]">
                  {claim.context === "budget" ? "Budget" : "PMQs"} ·{" "}
                  {claim.utteredAt}
                </span>
                <span className="text-[var(--rule-light)]">|</span>
                <a
                  href={claim.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--accent-red)] underline decoration-1 underline-offset-2"
                >
                  Source: Hansard
                </a>
              </div>
              {resolution && resolution.evidence.length > 0 && (
                <ul className="mt-2 space-y-1 pl-4">
                  {resolution.evidence.map((e, i) => (
                    <li key={i} className="font-body-serif text-xs text-[var(--ink-light)]">
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
              )}
            </li>
          );
        })}
      </ul>

      {/* Register of Members' Financial Interests — registry edges only, no inferred. */}
      <section className="mt-12 border-t-2 border-[var(--rule)] pt-8">
        <h2 className="mb-1 font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--ink)]">
          Register of Members&rsquo; Financial Interests
        </h2>
        <p className="mb-6 font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
          Registry-based only &mdash; every row is a stated entry in the
          Parliament register &mdash; no inferred edges
        </p>

        {interestGroups.length === 0 ? (
          <p className="font-body-serif text-sm text-[var(--ink-light)]">
            No entries with stated counterparties in the Register of Members&rsquo; Financial Interests.
          </p>
        ) : (
          <div className="space-y-8">
            {interestGroups.map((group) => (
              <div key={group.category}>
                <h3 className="mb-3 font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-light)]">
                  {group.category}
                </h3>
                <ul className="divide-y divide-[var(--rule-light)]">
                  {group.edges.map((edge) => (
                    <li key={edge.registryRef} className="py-3">
                      <p className="font-body-serif text-sm text-[var(--ink)]">
                        {edge.description ?? edge.from.name}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[9px] uppercase tracking-[0.2em]">
                        <span className="text-[var(--ink-light)]">
                          {edge.from.name}
                          {edge.from.role && edge.from.role !== "(status not stated in register)"
                            ? ` · ${edge.from.role}`
                            : ""}
                        </span>
                        {edge.amountGbp !== undefined && (
                          <>
                            <span className="text-[var(--rule-light)]">|</span>
                            <span className="text-[var(--ink-light)]">
                              £{edge.amountGbp.toLocaleString("en-GB")}
                            </span>
                          </>
                        )}
                        {edge.date && (
                          <>
                            <span className="text-[var(--rule-light)]">|</span>
                            <span className="text-[var(--ink-faint)]">{edge.date}</span>
                          </>
                        )}
                        <span className="text-[var(--rule-light)]">|</span>
                        <a
                          href={edge.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[var(--accent-red)] underline decoration-1 underline-offset-2"
                        >
                          Source: Register
                        </a>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <footer className="mt-12 border-t-2 border-[var(--rule)] pt-4 pb-8 text-center">
        <p className="font-mono text-[8px] uppercase tracking-[0.3em] text-[var(--ink-faint)]">
          {BRAND_NAME} &bull; the claim ledger &bull; every verdict links its
          records &bull; disputes: any quoted figure may attach a response
        </p>
      </footer>
    </section>
  );
}
