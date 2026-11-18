import Link from "next/link";
import type { CorrectionKind, MinisterialCorrection } from "@/lib/ledger/corrections";

// One register entry: who, what, how long, and both links. Shared by the
// Corrections Register and the member profile. Sworn style — the row states
// the record and never characterises the original error.

export const KIND_LABEL: Record<CorrectionKind, string> = {
  "written-answer": "Written answer",
  "written-statement": "Correction statement",
  "oral-point-of-order": "Oral (point of order)",
};

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function days(n: number | null): string {
  if (n === null) return "—";
  return n === 1 ? "1 day" : `${Number.isInteger(n) ? n : n.toFixed(1)} days`;
}

export function CorrectionRow({ c, showMember = true }: { c: MinisterialCorrection; showMember?: boolean }) {
  return (
    <li className="py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-headline-serif text-lg font-bold text-[var(--ink)]">
          {!showMember ? null : c.member.memberId ? (
            <Link
              href={`/ledger/member/${c.member.memberId}`}
              className="transition-colors hover:text-[var(--accent-red)]"
            >
              {c.member.name}
            </Link>
          ) : (
            c.member.name
          )}
          <span className={`${showMember ? "ml-2 " : ""}font-body-serif text-sm font-normal text-[var(--ink-light)]`}>
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
