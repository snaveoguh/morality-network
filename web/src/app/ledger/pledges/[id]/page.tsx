import Link from "next/link";
import { notFound } from "next/navigation";
import {
  PLEDGE_STATUSES,
  formatGbp,
  getPledge,
  loadPledges,
  pledgeLeafHash,
  pledgeLines,
} from "@/lib/ledger/pledges";
import { BRAND_NAME, withBrand } from "@/lib/brand";
import { DeclaredInterest } from "../declared-interest";
import { STATUS_LABEL, StatusBadge } from "../status-badge";

export const revalidate = 3600;

export function generateStaticParams() {
  return loadPledges().map((p) => ({ id: p.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const pledge = getPledge(id);
  return {
    title: withBrand(
      pledge ? `${pledge.title} — The Pledge Ledger` : "The Pledge Ledger",
    ),
    description: pledge?.verbatimQuote,
  };
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

// The delivery track, left to right. "unknown" sits off the track.
const TRACK = PLEDGE_STATUSES.filter((s) => s !== "unknown");

export default async function PledgePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const pledge = getPledge(id);
  if (!pledge) notFound();

  const parent = pledge.parentId ? getPledge(pledge.parentId) : null;
  const lines = pledgeLines(pledge.id);
  const reached = TRACK.indexOf(pledge.status as (typeof TRACK)[number]);

  return (
    <section className="mx-auto max-w-4xl py-8">
      <header className="mb-8 border-b-2 border-[var(--rule)] pb-6">
        <div className="mb-3 flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-faint)]">
          <Link href="/ledger/pledges" className="transition-colors hover:text-[var(--ink)]">
            &larr; Pledges
          </Link>
          {parent && (
            <>
              <span className="text-[var(--rule-light)]">|</span>
              <Link
                href={`/ledger/pledges/${parent.id}`}
                className="transition-colors hover:text-[var(--ink)]"
              >
                Part of {parent.title}
              </Link>
            </>
          )}
        </div>
        <p className="font-headline text-5xl text-[var(--ink)] md:text-7xl">
          {formatGbp(pledge.amountGbp, pledge.approx)}
        </p>
        <h1 className="mt-2 font-headline-serif text-2xl font-bold text-[var(--ink)] md:text-3xl">
          {pledge.title}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
          <StatusBadge status={pledge.status} />
          <span>{pledge.owner}</span>
          <span className="text-[var(--rule-light)]">|</span>
          <span>{pledge.jurisdiction}</span>
        </div>
      </header>

      <blockquote className="border-l-4 border-[var(--ink)] pl-5 font-body-serif text-xl leading-relaxed text-[var(--ink)]">
        &ldquo;{pledge.verbatimQuote}&rdquo;
      </blockquote>
      <p className="mt-3 pl-5 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--ink-faint)]">
        Source:{" "}
        <a
          href={pledge.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--accent-red)] underline decoration-1 underline-offset-2"
        >
          {pledge.sourceTitle}
        </a>
      </p>

      <h2 className="mt-10 border-b-2 border-[var(--ink)] pb-2 font-mono text-[11px] font-bold uppercase tracking-[0.25em] text-[var(--ink)]">
        Delivery
      </h2>
      <ol className="mt-4 grid grid-cols-2 gap-0 border border-[var(--ink)] sm:grid-cols-4">
        {TRACK.map((s, i) => {
          const done = reached >= 0 && i <= reached;
          return (
            <li
              key={s}
              className={`border-[var(--rule-light)] p-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em] sm:border-l sm:first:border-l-0 ${
                done ? "bg-[var(--ink)] text-[var(--paper)]" : "text-[var(--ink-faint)]"
              }`}
            >
              {STATUS_LABEL[s]}
            </li>
          );
        })}
      </ol>
      {pledge.status === "unknown" && (
        <p className="mt-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--accent-red)]">
          Status unknown — the record does not yet settle this pledge.
        </p>
      )}

      <dl className="mt-6 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-3">
        <div>
          <dt className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">Announced</dt>
          <dd className="mt-1 font-body-serif text-base text-[var(--ink)]">{formatDate(pledge.announcedOn)}</dd>
        </div>
        <div>
          <dt className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">Last checked</dt>
          <dd className="mt-1 font-body-serif text-base text-[var(--ink)]">{formatDate(pledge.lastCheckedOn)}</dd>
        </div>
        <div>
          <dt className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">Owner</dt>
          <dd className="mt-1 font-body-serif text-base text-[var(--ink)]">{pledge.owner}</dd>
        </div>
      </dl>

      {pledge.notes && (
        <p className="mt-6 font-body-serif text-base leading-relaxed text-[var(--ink-light)]">
          {pledge.notes}
        </p>
      )}

      <h2 className="mt-10 border-b-2 border-[var(--ink)] pb-2 font-mono text-[11px] font-bold uppercase tracking-[0.25em] text-[var(--ink)]">
        Evidence
      </h2>
      {pledge.evidence.length === 0 ? (
        <p className="mt-3 font-body-serif text-sm italic text-[var(--ink-faint)]">
          No delivery evidence on the record yet beyond the announcement.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {pledge.evidence.map((e) => (
            <li key={e.url} className="font-body-serif text-sm text-[var(--ink)]">
              <a
                href={e.url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-[var(--accent-red)] decoration-1 underline-offset-2 hover:text-[var(--accent-red)]"
              >
                {e.label}
              </a>
            </li>
          ))}
        </ul>
      )}

      {lines.length > 0 && (
        <>
          <h2 className="mt-10 border-b-2 border-[var(--ink)] pb-2 font-mono text-[11px] font-bold uppercase tracking-[0.25em] text-[var(--ink)]">
            Lines in this package
          </h2>
          <ul className="divide-y divide-[var(--rule-light)]">
            {lines.map((line) => (
              <li key={line.id}>
                <Link
                  href={`/ledger/pledges/${line.id}`}
                  className="group flex flex-wrap items-baseline justify-between gap-4 py-3"
                >
                  <span className="flex items-center gap-3">
                    <StatusBadge status={line.status} />
                    <span className="font-headline-serif text-base font-bold text-[var(--ink)] group-hover:text-[var(--accent-red)]">
                      {line.title}
                    </span>
                  </span>
                  <span className="font-headline text-xl text-[var(--ink)]">
                    {formatGbp(line.amountGbp, line.approx)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-10">
        <DeclaredInterest />
        {pledge.declaredInterest && (
          <p className="mt-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--accent-red)]">
            This programme is one Morality Co-operative may apply to.
          </p>
        )}
      </div>

      <footer className="mt-12 border-t-2 border-[var(--rule)] pt-4 pb-8">
        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
          Leaf hash{" "}
          <code className="break-all normal-case tracking-normal text-[var(--ink-light)]">
            {pledgeLeafHash(pledge)}
          </code>
        </p>
        <p className="mt-6 text-center font-mono text-[8px] uppercase tracking-[0.3em] text-[var(--ink-faint)]">
          {BRAND_NAME} &bull; the pledge ledger
        </p>
      </footer>
    </section>
  );
}
