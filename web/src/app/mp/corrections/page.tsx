import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { LegalReviewBanner } from "@/components/mp/LegalReviewBanner";
import { withBrand } from "@/lib/brand";
import { mpLaunchGate } from "@/lib/mp-record/launch-gate";
import { formatLongDate } from "@/lib/mp-record/stats";

// Site-wide MP Record corrections log (MP_RECORD_SPEC §9). Our errors, what
// changed and when. Register-side changes are not listed here: they show as
// new versions of the entry.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: withBrand("MP Record corrections"),
  robots: mpLaunchGate().signedOff ? undefined : { index: false, follow: false },
};

export default async function MpCorrectionsPage() {
  if (!mpLaunchGate().visible) notFound();
  const corrections = process.env.DATABASE_URL
    ? await (await import("@/lib/db/mp-record")).listAllCorrections()
    : [];
  return (
    <article className="mx-auto max-w-3xl py-6">
      <LegalReviewBanner />
      <h1 className="font-headline text-3xl text-[var(--ink)]">MP Record corrections</h1>
      <p className="mt-3 font-body-serif text-sm leading-relaxed text-[var(--ink)]">
        Every error we make on the MP Record is logged here: what was wrong, what changed and when. Nothing is changed
        silently. Changes made by a Member to their own register entries are not corrections; they appear in the
        entry&rsquo;s history.
      </p>
      {corrections.length === 0 ? (
        <p className="mt-6 font-body-serif text-sm text-[var(--ink-light)]">No corrections have been made.</p>
      ) : (
        <ul className="mt-6 divide-y divide-[var(--rule-light)]">
          {corrections.map((c) => (
            <li key={c.id} className="py-3 font-body-serif text-sm text-[var(--ink)]">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
                {formatLongDate(c.correctedAt)}
                {c.memberId !== null ? (
                  <> · <Link href={`/mp/${c.memberId}`} className="text-[var(--accent-red)] underline">Member {c.memberId}</Link></>
                ) : " · site-wide"}
                {c.subjectRecord ? ` · ${c.subjectRecord}` : ""}
              </p>
              <p className="mt-1">Was wrong: {c.whatWasWrong}</p>
              <p>Changed: {c.whatChanged}</p>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
