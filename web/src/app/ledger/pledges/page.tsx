import Link from "next/link";
import {
  PLEDGE_STATUSES,
  countByStatus,
  formatGbp,
  loadPledges,
  pledgeLeafHash,
  type Pledge,
} from "@/lib/ledger/pledges";
import { merkleRoot } from "@/lib/ledger/merkle";
import { BRAND_NAME, withBrand } from "@/lib/brand";
import { DeclaredInterest } from "./declared-interest";
import { STATUS_LABEL, StatusBadge } from "./status-badge";

export const revalidate = 3600;

export const metadata = {
  title: withBrand("Pledges — The Ledger"),
  description:
    "What governments and strategic authorities promise with public money, quoted verbatim, and whether it is delivered.",
};

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function PledgeRow({ pledge, lines }: { pledge: Pledge; lines: Pledge[] }) {
  return (
    <li className="py-6">
      <Link href={`/ledger/pledges/${pledge.id}`} className="group block">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h3 className="font-headline-serif text-xl font-bold text-[var(--ink)] transition-colors group-hover:text-[var(--accent-red)]">
            {pledge.title}
          </h3>
          <span className="font-headline text-3xl text-[var(--ink)]">
            {formatGbp(pledge.amountGbp, pledge.approx)}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
          <StatusBadge status={pledge.status} />
          <span>{pledge.owner}</span>
          <span className="text-[var(--rule-light)]">|</span>
          <span>announced {formatDate(pledge.announcedOn)}</span>
          {pledge.declaredInterest && (
            <span className="font-bold text-[var(--accent-red)]">declared interest</span>
          )}
        </div>
        <blockquote className="mt-3 border-l-2 border-[var(--rule)] pl-3 font-body-serif text-sm italic leading-relaxed text-[var(--ink-light)]">
          &ldquo;{pledge.verbatimQuote}&rdquo;
        </blockquote>
      </Link>

      {lines.length > 0 && (
        <ul className="mt-4 divide-y divide-[var(--rule-light)] border-t border-[var(--rule-light)] pl-4 sm:pl-8">
          {lines.map((line) => (
            <li key={line.id}>
              <Link
                href={`/ledger/pledges/${line.id}`}
                className="group flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3"
              >
                <span className="flex flex-wrap items-center gap-3">
                  <StatusBadge status={line.status} />
                  <span className="font-headline-serif text-base font-bold text-[var(--ink)] group-hover:text-[var(--accent-red)]">
                    {line.title}
                  </span>
                  {line.declaredInterest && (
                    <span className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--accent-red)]">
                      declared interest
                    </span>
                  )}
                </span>
                <span className="font-headline text-xl text-[var(--ink)]">
                  {formatGbp(line.amountGbp, line.approx)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export default function PledgesPage() {
  const pledges = loadPledges();
  const counts = countByStatus(pledges);
  const registerRoot = merkleRoot(pledges.map(pledgeLeafHash));
  const lastChecked = pledges.map((p) => p.lastCheckedOn).sort().at(-1);

  const topLevel = pledges.filter((p) => p.parentId === null);
  const groups = new Map<string, Pledge[]>();
  for (const p of topLevel) {
    const list = groups.get(p.jurisdiction) ?? [];
    list.push(p);
    groups.set(p.jurisdiction, list);
  }

  return (
    <section className="mx-auto max-w-4xl py-8">
      <header className="mb-8 border-b-2 border-[var(--rule)] pb-6">
        <div className="mb-3 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-faint)]">
          <Link href="/ledger" className="transition-colors hover:text-[var(--ink)]">
            &larr; The Ledger
          </Link>
          <span className="text-[var(--rule-light)]">|</span>
          <span>Pledges</span>
        </div>
        <h1 className="font-headline text-4xl text-[var(--ink)] md:text-6xl">
          The Pledge Ledger
        </h1>
        <p className="mt-3 max-w-2xl font-body-serif text-base leading-relaxed text-[var(--ink-light)]">
          What government and strategic authorities say they will spend, quoted
          verbatim from their own announcements, and whether the money is
          allocated, spent and delivered. A pledge moves along the track only
          when the public record shows it. Where the record can&rsquo;t settle
          it, the status is unknown.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-0 border border-[var(--ink)] sm:grid-cols-6">
          <div className="col-span-2 border-b border-[var(--ink)] bg-[var(--ink)] p-4 sm:border-b-0">
            <span className="font-headline text-3xl text-[var(--paper)]">{pledges.length}</span>
            <p className="mt-1 font-mono text-[8px] uppercase tracking-wider text-[var(--paper)]/70">
              pledges tracked &middot; figures overlap, so no grand total
            </p>
          </div>
          {PLEDGE_STATUSES.filter((s) => s !== "spent").map((s) => (
            <div key={s} className="border-l border-[var(--rule-light)] p-4 first:border-l-0 sm:first:border-l">
              <span className="font-headline text-3xl text-[var(--ink)]">{counts[s]}</span>
              <p className="mt-1 font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
                {STATUS_LABEL[s]}
                {s === "delivered" && counts.spent > 0 ? ` · ${counts.spent} spent` : ""}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-5">
          <DeclaredInterest />
        </div>
      </header>

      {[...groups.entries()].map(([jurisdiction, list]) => (
        <section key={jurisdiction} className="mb-10">
          <h2 className="border-b-2 border-[var(--ink)] pb-2 font-mono text-[11px] font-bold uppercase tracking-[0.25em] text-[var(--ink)]">
            {jurisdiction}
          </h2>
          <ul className="divide-y divide-[var(--rule-light)]">
            {list.map((p) => (
              <PledgeRow
                key={p.id}
                pledge={p}
                lines={pledges.filter((l) => l.parentId === p.id)}
              />
            ))}
          </ul>
        </section>
      ))}

      <footer className="mt-12 border-t-2 border-[var(--rule)] pt-4 pb-8">
        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
          Register fingerprint{" "}
          <code className="break-all normal-case tracking-normal text-[var(--ink-light)]">
            {registerRoot}
          </code>
        </p>
        <p className="mt-2 font-body-serif text-xs leading-relaxed text-[var(--ink-faint)]">
          Every pledge state is hashed into the same daily Merkle root as the
          Claim Ledger on the day it is checked, so a status can&rsquo;t be
          quietly rewritten later. Last checked {lastChecked ? formatDate(lastChecked) : "—"}.
        </p>
        <p className="mt-6 text-center font-mono text-[8px] uppercase tracking-[0.3em] text-[var(--ink-faint)]">
          {BRAND_NAME} &bull; the pledge ledger &bull; quotes are verbatim from
          the published announcements
        </p>
      </footer>
    </section>
  );
}
