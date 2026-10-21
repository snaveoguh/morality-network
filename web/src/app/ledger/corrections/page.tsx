import Link from "next/link";
import { getCorrectionsRegister } from "@/lib/ledger/corrections-service";
import type { CorrectionKind, MinisterialCorrection } from "@/lib/ledger/corrections";
import { BRAND_NAME, withBrand } from "@/lib/brand";

export const revalidate = 3600;

export const metadata = {
  title: withBrand("The Corrections Register"),
  description:
    "Prototype: every time a minister corrected the official record in the last twelve months, dated and linked — and how long it took.",
};

// Same sworn style as /ledger: dates, sources, counts. A correction is a fact
// on the record; this page never characterises the original error or infers
// motive. Match proposals are labelled as proposals.

const KIND_LABEL: Record<CorrectionKind, string> = {
  "written-answer": "Written answer",
  "written-statement": "Correction statement",
  "oral-point-of-order": "Oral (point of order)",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function days(n: number | null): string {
  if (n === null) return "—";
  return n === 1 ? "1 day" : `${Number.isInteger(n) ? n : n.toFixed(1)} days`;
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="border border-[var(--rule-light)] p-4">
      <p className="font-headline text-3xl text-[var(--ink)] md:text-4xl">{value}</p>
      <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
        {label}
      </p>
    </div>
  );
}

function SectionHead({ title, note }: { title: string; note?: string }) {
  return (
    <div className="mb-3 border-b-2 border-[var(--rule)] pb-2">
      <h2 className="font-headline-serif text-2xl font-bold text-[var(--ink)]">{title}</h2>
      {note && (
        <p className="mt-1 font-body-serif text-sm italic text-[var(--ink-light)]">{note}</p>
      )}
    </div>
  );
}

function CorrectionRow({ c }: { c: MinisterialCorrection }) {
  return (
    <li className="py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-headline-serif text-lg font-bold text-[var(--ink)]">
          {c.member.memberId ? (
            <Link
              href={`/ledger/member/${c.member.memberId}`}
              className="transition-colors hover:text-[var(--accent-red)]"
            >
              {c.member.name}
            </Link>
          ) : (
            c.member.name
          )}
          <span className="ml-2 font-body-serif text-sm font-normal text-[var(--ink-light)]">
            {c.heading}
          </span>
        </p>
        <span
          className={`border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.2em] ${
            c.daysToCorrect !== null && c.daysToCorrect > 30
              ? "border-[var(--accent-red)] bg-[var(--accent-red)] text-[var(--paper)]"
              : "border-[var(--ink)] text-[var(--ink)]"
          }`}
        >
          {c.daysToCorrect === null ? "date unknown" : `${days(c.daysToCorrect)} to correct`}
        </span>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
        <span>{KIND_LABEL[c.kind]}</span>
        <span className="text-[var(--rule-light)]">|</span>
        <span>{c.house}{c.alsoLaidIn ? ` + ${c.alsoLaidIn}` : ""}</span>
        {c.department && (
          <>
            <span className="text-[var(--rule-light)]">|</span>
            <span>{c.department}</span>
          </>
        )}
        <span className="text-[var(--rule-light)]">|</span>
        <span>
          said {formatDate(c.originalDate)} &rarr; corrected {formatDate(c.correctedOn)}
        </span>
      </div>

      <details className="mt-2 pl-4">
        <summary className="cursor-pointer font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-light)] hover:text-[var(--accent-red)]">
          Show the record
        </summary>
        {c.originalText && (
          <blockquote className="mt-2 border-l-2 border-[var(--rule-light)] pl-4 font-body-serif text-sm leading-relaxed text-[var(--ink-faint)] line-through decoration-[var(--accent-red)]/60">
            {c.originalText}
          </blockquote>
        )}
        <blockquote className="mt-2 border-l-2 border-[var(--rule)] pl-4 font-body-serif text-sm leading-relaxed text-[var(--ink)]">
          {c.correctedText}
        </blockquote>
      </details>

      <div className="mt-2 flex flex-wrap gap-3 pl-4 font-mono text-[9px] uppercase tracking-[0.2em]">
        <a
          href={c.correctionUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--accent-red)] underline decoration-1 underline-offset-2 hover:text-[var(--ink)]"
        >
          Correction
        </a>
        {c.originalUrl && c.originalUrl !== c.correctionUrl && (
          <a
            href={c.originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent-red)] underline decoration-1 underline-offset-2 hover:text-[var(--ink)]"
          >
            Original statement{c.originalRef ? ` (${c.originalRef})` : ""}
          </a>
        )}
      </div>
    </li>
  );
}

export default async function CorrectionsPage() {
  const register = await getCorrectionsRegister();
  const { stats } = register;
  const confirmed = register.corrections.filter((c) => !c.needsReview);
  const candidates = register.corrections.filter((c) => c.needsReview);
  const slowest = [...confirmed]
    .filter((c) => c.daysToCorrect !== null)
    .sort((a, b) => (b.daysToCorrect ?? 0) - (a.daysToCorrect ?? 0))
    .slice(0, 5);

  return (
    <section className="mx-auto max-w-4xl py-8">
      <header className="mb-8 border-b-2 border-[var(--rule)] pb-6">
        <div className="mb-3 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-faint)]">
          <Link href="/ledger" className="transition-colors hover:text-[var(--ink)]">
            &larr; The Claim Ledger
          </Link>
          <span className="text-[var(--rule-light)]">|</span>
          <span>Corrections Register</span>
          <span className="border border-[var(--accent-red)] px-1.5 py-0.5 font-bold text-[var(--accent-red)]">
            Prototype
          </span>
        </div>
        <h1 className="font-headline text-4xl text-[var(--ink)] md:text-6xl">
          The Corrections Register
        </h1>
        <p className="mt-3 max-w-2xl font-body-serif text-base leading-relaxed text-[var(--ink-light)]">
          The Ministerial Code says ministers should correct any inadvertent
          error to Parliament &ldquo;at the earliest opportunity&rdquo;. Nobody
          measures what that means in practice. This register lists every
          correction ministers placed on the official record in the last twelve
          months, the date of the statement it corrects, and the time between
          the two.
        </p>
        <p className="mt-2 max-w-2xl font-body-serif text-sm italic text-[var(--ink-faint)]">
          Prototype. Built from the public written questions and statements
          record and Hansard. Figures are machine-collected and may contain
          parsing errors; every entry links its source.
        </p>
        {register.window && (
          <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
            Window {formatDate(register.window.from)} &ndash; {formatDate(register.window.to)}
            {" · "}source: {register.source === "seed" ? "checked-in backfill" : "database"}
          </p>
        )}
      </header>

      <div className="grid grid-cols-2 gap-0 md:grid-cols-4">
        <Stat value={String(stats.total)} label="Corrections on record" />
        <Stat value={days(stats.medianDays)} label="Median: statement → correction" />
        <Stat value={`${Math.round(stats.over30Days * 100)}%`} label="Took more than 30 days" />
        <Stat value={String(stats.byDepartment.length)} label="Departments" />
      </div>
      <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
        Median by route:{" "}
        {(Object.entries(stats.medianDaysByKind) as Array<[CorrectionKind, number | null]>)
          .map(([kind, d]) => `${KIND_LABEL[kind]} ${days(d)}`)
          .join(" · ")}
        {" · "}
        {stats.dated} of {stats.total} dated
      </p>

      <section className="mt-10">
        <SectionHead
          title="Corrections owed"
          note="Claims from the ledger that a human reviewer has marked inaccurate, with the days elapsed since they were made. Nothing appears here on a machine's say-so."
        />
        {register.owed.length === 0 ? (
          <div className="border border-[var(--rule-light)] bg-[var(--paper-dark)]/30 p-6 text-center">
            <p className="font-headline-serif text-lg text-[var(--ink)]">
              No claims are currently marked inaccurate by a reviewer.
            </p>
            <p className="mt-1 font-body-serif text-sm italic text-[var(--ink-light)]">
              {register.claimsAvailable
                ? "When a reviewer publishes a false or partially-true verdict on a ledger claim, it is listed here until a matching correction appears."
                : "The ledger database is not connected in this environment, so reviewed claims cannot be listed."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--rule-light)]">
            {register.owed.map((o) => (
              <li key={o.claim.id} className="py-4">
                <blockquote className="border-l-2 border-[var(--accent-red)] pl-4 font-body-serif text-base text-[var(--ink)]">
                  &ldquo;{o.claim.verbatimQuote}&rdquo;
                </blockquote>
                <div className="mt-2 flex flex-wrap gap-2 pl-4 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
                  <span className="font-bold text-[var(--ink)]">{o.claim.speaker.name}</span>
                  <span>{formatDate(o.claim.utteredAt)}</span>
                  <span className="text-[var(--accent-red)]">
                    {o.verdict === "false" ? "Resolved false" : "Partially true"}
                  </span>
                  <span>{days(o.daysOutstanding)} since statement</span>
                  <span>
                    {o.possibleCorrection
                      ? `possible correction ${formatDate(o.possibleCorrection.correctedOn)} — needs review`
                      : "no correction found"}
                  </span>
                  <a
                    href={o.claim.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--accent-red)] underline decoration-1 underline-offset-2"
                  >
                    Source: Hansard
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {register.matches.length > 0 && (
        <section className="mt-10">
          <SectionHead
            title="Proposed claim matches"
            note="Corrections that may relate to a claim in the ledger. Same speaker, then date and wording. Proposals for human review only — a match never sets a verdict."
          />
          <ul className="divide-y divide-[var(--rule-light)]">
            {register.matches.slice(0, 20).map((m) => (
              <li key={`${m.correctionId}:${m.claimId}`} className="py-3 font-body-serif text-sm text-[var(--ink-light)]">
                <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink)]">
                  {m.confidence} · {m.score.toFixed(2)}
                </span>{" "}
                &ldquo;{m.claim.verbatimQuote.slice(0, 160)}&rdquo; — {m.reasons.join("; ")}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-10 grid grid-cols-1 gap-8 md:grid-cols-2">
        <section>
          <SectionHead title="By department" />
          <table className="w-full font-mono text-[10px] uppercase tracking-[0.1em]">
            <thead>
              <tr className="border-b border-[var(--rule)] text-left text-[var(--ink-faint)]">
                <th className="py-1 font-normal">Department</th>
                <th className="py-1 text-right font-normal">Count</th>
                <th className="py-1 pl-3 text-right font-normal">Median</th>
              </tr>
            </thead>
            <tbody>
              {stats.byDepartment.map((d) => (
                <tr key={d.department} className="border-b border-[var(--rule-light)] text-[var(--ink)]">
                  <td className="py-1.5 pr-2 normal-case tracking-normal">{d.department}</td>
                  <td className="py-1.5 pl-2 text-right font-bold">{d.count}</td>
                  <td className="whitespace-nowrap py-1.5 pl-3 text-right">{days(d.medianDays)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section>
          <SectionHead title="By minister" />
          <table className="w-full font-mono text-[10px] uppercase tracking-[0.1em]">
            <thead>
              <tr className="border-b border-[var(--rule)] text-left text-[var(--ink-faint)]">
                <th className="py-1 font-normal">Minister</th>
                <th className="py-1 text-right font-normal">Count</th>
                <th className="py-1 pl-3 text-right font-normal">Median</th>
              </tr>
            </thead>
            <tbody>
              {stats.byMinister.slice(0, 25).map((m) => (
                <tr key={`${m.memberId ?? m.name}`} className="border-b border-[var(--rule-light)] text-[var(--ink)]">
                  <td className="py-1.5 pr-2 normal-case tracking-normal">{m.name}</td>
                  <td className="py-1.5 pl-2 text-right font-bold">{m.count}</td>
                  <td className="whitespace-nowrap py-1.5 pl-3 text-right">{days(m.medianDays)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {stats.byMinister.length > 25 && (
            <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
              + {stats.byMinister.length - 25} more ministers
            </p>
          )}
        </section>
      </div>

      {slowest.length > 0 && (
        <section className="mt-10">
          <SectionHead title="Longest gaps" note="Corrections made furthest from the statement they correct." />
          <ul className="divide-y divide-[var(--rule-light)]">
            {slowest.map((c) => (
              <CorrectionRow key={c.id} c={c} />
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10">
        <SectionHead
          title="The running register"
          note={`${confirmed.length} corrections, newest first.`}
        />
        <ul className="divide-y divide-[var(--rule-light)]">
          {confirmed.map((c) => (
            <CorrectionRow key={c.id} c={c} />
          ))}
        </ul>
      </section>

      {candidates.length > 0 && (
        <section className="mt-10">
          <SectionHead
            title="Awaiting review"
            note="Possible oral self-corrections found in points of order, and entries with no recoverable original date. Not counted in any figure above until a human confirms them."
          />
          <ul className="divide-y divide-[var(--rule-light)] opacity-80">
            {candidates.map((c) => (
              <CorrectionRow key={c.id} c={c} />
            ))}
          </ul>
        </section>
      )}

      <footer className="mt-12 border-t-2 border-[var(--rule)] pt-4 pb-8">
        <p className="text-center font-mono text-[8px] uppercase tracking-[0.3em] text-[var(--ink-faint)]">
          {BRAND_NAME} &bull; corrections register (prototype) &bull; sources:
          questions-statements.parliament.uk &amp; hansard.parliament.uk &bull;
          no AI is used to collect or match corrections
        </p>
      </footer>
    </section>
  );
}
