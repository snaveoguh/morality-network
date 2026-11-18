import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublishedVerdicts } from "@/lib/ledger/service";
import { computeCalibration } from "@/lib/ledger/score";
import type { LedgerClaim, LedgerResolution } from "@/lib/ledger/types";
import { BRAND_NAME, withBrand } from "@/lib/brand";
import { getMemberInterestEdges } from "@/lib/funding/member-profile";
import { getCorrectionsRegister } from "@/lib/ledger/corrections-service";
import { median } from "@/lib/ledger/corrections";
import { buildGovernmentNetwork, colleaguesOf, memberKey } from "@/lib/ledger/government-network";
import { currentPosts, getMemberIdentity } from "@/lib/ledger/member-identity";
import { CorrectionRow, days, formatDate } from "@/components/ledger/CorrectionRow";

export const revalidate = 1800;

// Per-entity record page (spec Phase C) — the profile every name in the
// ledger links to. Who they are (Parliament Members API), what they corrected
// (Corrections Register), what they claimed (ledger), what they registered
// (Register of Interests), and who else answers for the same departments.
// A member appears if they have a claim OR a correction on record.
// Sworn style: quotes, sources, verdicts with evidence. The calibration score is WITHHELD below the n≥20
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

  const [claims, register] = await Promise.all([
    loadMemberClaims(memberId),
    getCorrectionsRegister(),
  ]);
  const corrections = register.corrections.filter(
    (c) => c.member.memberId === memberId && !c.needsReview,
  );
  if (claims.length === 0 && corrections.length === 0) notFound();

  const [verdicts, interestGroups, identity] = await Promise.all([
    getPublishedVerdicts(claims.map((c) => c.id)),
    getMemberInterestEdges(memberId),
    getMemberIdentity(memberId),
  ]);
  const calibration = computeCalibration(claims, verdicts);

  const network = buildGovernmentNetwork(register.corrections);
  const colleagues = colleaguesOf(network, memberKey({ memberId, name: "" }));

  const who = identity?.member ?? null;
  const name = who?.nameDisplay ?? claims[0]?.speaker.name ?? corrections[0].member.name;
  const party = who?.latestPartyName ?? claims[0]?.speaker.party ?? corrections[0]?.member.party ?? null;
  const seat = who?.constituencyName ?? claims[0]?.speaker.constituency ?? null;
  const posts = currentPosts(identity?.periods ?? []);
  const recordedRole = corrections.find((c) => c.member.role)?.member.role ?? null;
  const pastPosts = (identity?.periods ?? [])
    .filter((p) => (p.kind === "government_post" || p.kind === "opposition_post") && p.endDate)
    .sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? ""));
  const committees = (identity?.periods ?? []).filter((p) => p.kind === "committee" && !p.endDate);
  const correctionDays = corrections.map((c) => c.daysToCorrect).filter((d): d is number => d !== null);

  const facts: Array<[string, string | null]> = [
    ["Party", party],
    [who?.house === "Lords" ? "House" : "Constituency", who?.house === "Lords" ? "House of Lords" : seat],
    ["In Parliament since", who?.membershipStartDate ? formatDate(who.membershipStartDate) : null],
    ["Status", who?.statusDescription ?? null],
  ];
  const label = "font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-faint)]";

  return (
    <section className="mx-auto max-w-4xl py-8">
      <header className="mb-8 border-b-2 border-[var(--rule)] pb-6">
        <div className="mb-3 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-faint)]">
          <Link href="/ledger" className="transition-colors hover:text-[var(--ink)]">
            &larr; The Ledger
          </Link>
          <span className="text-[var(--rule-light)]">|</span>
          <Link href="/ledger/network" className="transition-colors hover:text-[var(--ink)]">
            Government Network
          </Link>
          <span className="text-[var(--rule-light)]">|</span>
          <span>Member Record</span>
        </div>

        <div className="flex items-start gap-4">
          {who?.thumbnailUrl && (
            // Parliament's own portrait, served from its API.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={who.thumbnailUrl}
              alt={`Official portrait of ${name}`}
              width={96}
              height={96}
              loading="lazy"
              className="h-20 w-20 shrink-0 border border-[var(--rule-light)] object-cover grayscale md:h-24 md:w-24"
            />
          )}
          <div className="min-w-0">
            <h1 className="font-headline text-4xl text-[var(--ink)] md:text-5xl">{name}</h1>
            {(posts.length > 0 || recordedRole) && (
              <p className="mt-1 font-body-serif text-base leading-snug text-[var(--ink-light)]">
                {posts.length > 0 ? posts.map((p) => p.name).filter(Boolean).join(" · ") : recordedRole}
              </p>
            )}
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-light)]">
              <a
                href={`https://members.parliament.uk/member/${memberId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--accent-red)] underline decoration-1 underline-offset-2"
              >
                Parliament profile
              </a>
            </p>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-4">
          {facts
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k}>
                <dt className={label}>{k}</dt>
                <dd className="font-body-serif text-sm text-[var(--ink)]">{v}</dd>
              </div>
            ))}
        </dl>

        <div className="mt-5 grid grid-cols-2 gap-4 border border-[var(--rule-light)] p-4 md:grid-cols-4">
          <div>
            <p className="font-headline text-3xl text-[var(--ink)]">{corrections.length}</p>
            <p className={label}>corrections to the record</p>
          </div>
          <div>
            <p className="font-headline text-3xl text-[var(--ink)]">
              {correctionDays.length > 0 ? days(median(correctionDays)) : "\u2014"}
            </p>
            <p className={label}>median: statement &rarr; correction</p>
          </div>
          <div>
            <p className="font-headline text-3xl text-[var(--ink)]">{calibration.nClaims}</p>
            <p className={label}>claims on record</p>
          </div>
          <div>
            <p className="font-headline text-3xl text-[var(--ink)]">{calibration.nResolved}</p>
            <p className={label}>claims resolved</p>
          </div>
        </div>
        {claims.length > 0 && (
          <p className="mt-2 font-mono text-[8px] uppercase tracking-[0.25em] text-[var(--ink-faint)]">
            checkability rate {calibration.checkabilityRate}% &middot;{" "}
            {calibration.scoreVisible
              ? `${calibration.pctTrue}% resolved true (n=${calibration.nResolved})`
              : `no score displays below 20 resolved claims (${calibration.resolvedNeeded} to go) \u2014 small samples mislead in both directions`}
          </p>
        )}
      </header>

      {colleagues.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-1 font-headline-serif text-2xl font-bold text-[var(--ink)]">In government</h2>
          <p className="mb-4 font-body-serif text-sm italic text-[var(--ink-light)]">
            Departments {name} has corrected the record for, and the other ministers who did the same.{" "}
            <Link href="/ledger/network" className="underline decoration-1 underline-offset-2">
              See the whole network
            </Link>
            .
          </p>
          <ul className="divide-y divide-[var(--rule-light)] border-y border-[var(--rule-light)]">
            {colleagues.map(({ department, members }) => (
              <li key={department.id} className="py-3">
                <p className="font-body-serif text-base text-[var(--ink)]">
                  {department.name}
                  <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--ink-faint)]">
                    {department.count} {department.count === 1 ? "correction" : "corrections"} in all
                  </span>
                </p>
                {members.length > 0 && (
                  <p className="mt-1 font-body-serif text-sm leading-relaxed text-[var(--ink-light)]">
                    {members.map((m, i) => (
                      <span key={m.key}>
                        {i > 0 && " \u00b7 "}
                        {m.memberId ? (
                          <Link
                            href={`/ledger/member/${m.memberId}`}
                            className="text-[var(--ink)] underline decoration-[var(--rule-light)] decoration-1 underline-offset-2 hover:decoration-[var(--ink)]"
                          >
                            {m.name}
                          </Link>
                        ) : (
                          m.name
                        )}
                      </span>
                    ))}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {(pastPosts.length > 0 || committees.length > 0 || posts.length > 0) && (
        <section className="mb-10">
          <h2 className="mb-1 font-headline-serif text-2xl font-bold text-[var(--ink)]">Posts held</h2>
          <p className={`mb-3 ${label}`}>Source: Parliament Members API &middot; in its own words</p>
          <ul className="divide-y divide-[var(--rule-light)]">
            {[...posts, ...pastPosts, ...committees].map((p, i) => (
              <li key={i} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:justify-between sm:gap-4">
                <span className="font-body-serif text-sm text-[var(--ink)]">
                  {p.name}
                  {p.kind === "committee" ? " (committee)" : p.kind === "opposition_post" ? " (opposition)" : ""}
                </span>
                <span className="shrink-0 font-mono text-[11px] text-[var(--ink-light)]">
                  {formatDate(p.startDate)} &ndash; {p.endDate ? formatDate(p.endDate) : "present"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {corrections.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-1 font-headline-serif text-2xl font-bold text-[var(--ink)]">Corrections to the record</h2>
          <p className="mb-2 font-body-serif text-sm italic text-[var(--ink-light)]">
            Each time {name} corrected something told to Parliament, with the date of the original
            statement and the time between the two. From the{" "}
            <Link href="/ledger/corrections" className="underline decoration-1 underline-offset-2">
              Corrections Register
            </Link>
            .
          </p>
          <ul className="divide-y divide-[var(--rule-light)]">
            {corrections.map((c) => (
              <CorrectionRow key={c.id} c={c} showMember={false} />
            ))}
          </ul>
        </section>
      )}

      {claims.length > 0 && (
        <h2 className="mb-1 font-headline-serif text-2xl font-bold text-[var(--ink)]">Claims on record</h2>
      )}
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
