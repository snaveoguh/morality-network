import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CiteThis } from "@/components/mp/CiteThis";
import { LegalReviewBanner } from "@/components/mp/LegalReviewBanner";
import { BRAND_NAME, withBrand } from "@/lib/brand";
import { mpLaunchGate } from "@/lib/mp-record/launch-gate";
import { formatGbp } from "@/lib/mp-record/parse-utils";
import { loadMpStat, parseMemberId, todayIso } from "@/lib/mp-record/record";
import { formatLongDate, isStatId, STAT_DEFINITIONS } from "@/lib/mp-record/stats";

// Stat permalink (MP_RECORD_SPEC §7): the same URL returns the same figure
// forever, because it is recomputed from stored register versions as they
// stood at the end of the as-of day.

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ memberId: string; statId: string }>;
  searchParams: Promise<{ asOf?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { statId } = await params;
  const def = isStatId(statId) ? STAT_DEFINITIONS[statId] : null;
  return {
    title: withBrand(def ? def.label : "MP Record figure"),
    robots: mpLaunchGate().signedOff ? undefined : { index: false, follow: false },
  };
}

const linkClass = "text-[var(--accent-red)] underline decoration-1 underline-offset-2";
const labelClass = "font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-faint)]";

export default async function StatPage({ params, searchParams }: Props) {
  if (!mpLaunchGate().visible) notFound();
  const { memberId: rawId, statId } = await params;
  const memberId = parseMemberId(rawId);
  if (memberId === null || !isStatId(statId)) notFound();
  const asOf = (await searchParams).asOf ?? todayIso();
  const result = await loadMpStat(memberId, statId, asOf);
  if (!result.ok) {
    if (result.status === 404) notFound();
    return (
      <article className="mx-auto max-w-3xl py-6">
        <p className="font-body-serif text-base text-[var(--ink)]">{result.error}</p>
      </article>
    );
  }
  const s = result.stat;

  return (
    <article className="mx-auto max-w-3xl py-6">
      <LegalReviewBanner />
      <p className={labelClass}>
        <Link href={`/mp/${memberId}`} className={linkClass}>{s.memberName}</Link> · {BRAND_NAME} MP Record
      </p>
      <h1 className="mt-2 font-headline text-3xl text-[var(--ink)]">{s.label}</h1>
      <p className="mt-4 font-headline text-5xl text-[var(--ink)]">{s.available ? s.headline : "—"}</p>
      <p className="mt-2 font-body-serif text-sm text-[var(--ink-light)]">
        As of {formatLongDate(s.asOf)}
        {s.available ? <> · register data as of {formatLongDate(s.dataAsOf!)}</> : <> · not available: {s.unavailableReason}</>}
        {s.window.from ? (
          <> · covers {s.window.fromInclusive ? "from" : "after"} {formatLongDate(s.window.from)} up to and including {formatLongDate(s.window.to)}</>
        ) : null}
        {" · "}date basis: {s.window.basis}
      </p>
      <CiteThis citation={s.citation} permalink={s.permalink} />

      {s.breakdown.length > 0 && (
        <section className="mt-8">
          <h2 className={labelClass}>Breakdown</h2>
          <table className="mt-2 w-full font-body-serif text-sm">
            <tbody className="divide-y divide-[var(--rule-light)]">
              {s.breakdown.map((b) => (
                <tr key={b.key}>
                  <td className="py-2 pr-4 text-[var(--ink)]">{b.label}</td>
                  <td className="py-2 pr-4 text-right font-mono text-[var(--ink-light)]">{b.count}</td>
                  <td className="py-2 text-right font-mono text-[var(--ink)]">{b.display}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {s.notes.length > 0 && (
        <section className="mt-6">
          <h2 className={labelClass}>Not included</h2>
          <ul className="mt-2 list-disc pl-5 font-body-serif text-sm text-[var(--ink)]">
            {s.notes.map((n) => <li key={n}>{n}</li>)}
          </ul>
        </section>
      )}

      <section className="mt-6">
        <h2 className={labelClass}>Methodology</h2>
        <ol className="mt-2 list-decimal pl-5 font-body-serif text-sm leading-relaxed text-[var(--ink)]">
          {s.methodology.map((m) => <li key={m}>{m}</li>)}
        </ol>
        <p className="mt-2 font-body-serif text-xs text-[var(--ink-light)]">
          Source: <a href={s.sourceUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>{s.source}</a>. Computation version {s.version}.
        </p>
      </section>

      {s.rowsUsed.length > 0 && (
        <section className="mt-6">
          <h2 className={labelClass}>Entries used ({s.rowsUsed.length})</h2>
          <ul className="mt-2 divide-y divide-[var(--rule-light)] font-mono text-[11px]">
            {s.rowsUsed.map((r) => (
              <li key={r.sourceRecordId} className="flex justify-between gap-4 py-1.5">
                <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>{r.sourceRecordId}</a>
                <span className="text-[var(--ink-light)]">{r.valuePence === null ? "" : formatGbp(r.valuePence)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-8 font-body-serif text-xs text-[var(--ink-light)]">
        JSON: <a href={s.apiUrl} className={linkClass}>{s.apiUrl}</a>
      </p>
    </article>
  );
}
