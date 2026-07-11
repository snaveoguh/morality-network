import Link from "next/link";
import { getRecentPartyDonations } from "@/lib/funding/party-donations";
import { BRAND_NAME, withBrand } from "@/lib/brand";

export const revalidate = 3600;

export const metadata = {
  title: withBrand("Who Funds the Parties — The Claim Ledger"),
  description:
    "Donations to UK political parties as recorded in the Electoral Commission register.",
};

function formatGbp(amount: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "not stated in register";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function FundingPage() {
  const { recentDonations, partyTotals, windowFrom, windowTo } =
    await getRecentPartyDonations();

  const isEmpty = recentDonations.length === 0 && partyTotals.length === 0;

  return (
    <section className="mx-auto max-w-4xl py-8">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="mb-8 border-b-2 border-[var(--rule)] pb-6">
        <div className="mb-3 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-faint)]">
          <Link
            href="/ledger"
            className="transition-colors hover:text-[var(--ink)]"
          >
            &larr; The Ledger
          </Link>
          <span className="text-[var(--rule-light)]">|</span>
          <span>Party Funding</span>
        </div>
        <h1 className="font-headline text-4xl text-[var(--ink)] md:text-5xl">
          Who Funds the Parties
        </h1>
        <p className="mt-3 max-w-2xl font-body-serif text-base leading-relaxed text-[var(--ink-light)]">
          Donations as recorded in the Electoral Commission register. Every row
          links to its register entry. Absence of a party means no recorded
          donations in the window — nothing more.
        </p>
        <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
          Window: {formatDate(windowFrom)} — {formatDate(windowTo)} &bull;
          Source: Electoral Commission donations register
        </p>
      </header>

      {isEmpty ? (
        /* ── Empty state (registry downtime) ─────────────────────────────── */
        <div className="py-12 text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-faint)]">
            Register data temporarily unavailable
          </p>
          <p className="mt-2 font-body-serif text-sm text-[var(--ink-light)]">
            The Electoral Commission register could not be reached. No data is
            inferred. Check back shortly.
          </p>
          <p className="mt-4">
            <a
              href="https://search.electoralcommission.org.uk/English/Donations"
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-faint)] underline hover:text-[var(--ink)]"
            >
              Electoral Commission register &rarr;
            </a>
          </p>
        </div>
      ) : (
        <>
          {/* ── Per-party 12-month totals ─────────────────────────────────── */}
          {partyTotals.length > 0 && (
            <div className="mb-12">
              <h2 className="mb-4 font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-faint)]">
                12-Month Totals by Party
              </h2>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-[var(--rule)]">
                    <th className="py-2 text-left font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
                      Party
                    </th>
                    <th className="py-2 text-right font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
                      Total Received
                    </th>
                    <th className="py-2 text-right font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
                      Donations
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--rule-light)]">
                  {partyTotals.map((row) => (
                    <tr key={row.party} className="group">
                      <td className="py-3 font-body-serif text-sm text-[var(--ink)]">
                        {row.party}
                      </td>
                      <td className="py-3 text-right font-mono text-sm tabular-nums text-[var(--ink)]">
                        {formatGbp(row.total)}
                      </td>
                      <td className="py-3 text-right font-mono text-[10px] tabular-nums text-[var(--ink-faint)]">
                        {row.count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Recent donations list ─────────────────────────────────────── */}
          {recentDonations.length > 0 && (
            <div>
              <h2 className="mb-4 font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-faint)]">
                Recent Donations
              </h2>
              <ul className="divide-y divide-[var(--rule-light)]">
                {recentDonations.map((edge) => (
                  <li key={edge.registryRef} className="py-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      {/* Donor */}
                      <div className="min-w-0 flex-1">
                        <span className="font-body-serif text-sm text-[var(--ink)]">
                          {edge.from.name}
                        </span>
                        <span className="ml-2 font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--ink-faint)]">
                          {edge.from.role}
                        </span>
                      </div>
                      {/* Amount */}
                      <span className="shrink-0 font-mono text-sm font-bold tabular-nums text-[var(--ink)]">
                        {edge.amountGbp !== undefined
                          ? formatGbp(edge.amountGbp)
                          : "not stated in register"}
                      </span>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                      {/* Party */}
                      <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-light)]">
                        {edge.to.name}
                      </span>
                      <span className="text-[var(--rule-light)]">&middot;</span>
                      {/* Date */}
                      <span className="font-mono text-[9px] text-[var(--ink-faint)]">
                        {formatDate(edge.date)}
                      </span>
                      {edge.description && (
                        <>
                          <span className="text-[var(--rule-light)]">
                            &middot;
                          </span>
                          <span className="font-mono text-[9px] text-[var(--ink-faint)]">
                            {edge.description}
                          </span>
                        </>
                      )}
                      <span className="text-[var(--rule-light)]">&middot;</span>
                      {/* Register link */}
                      <a
                        href={edge.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-faint)] underline transition-colors hover:text-[var(--ink)]"
                      >
                        Source: Register ({edge.registryRef})
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {/* ── Footer colophon ───────────────────────────────────────────────── */}
      <footer className="mt-12 border-t-2 border-[var(--rule)] pt-4 pb-8 text-center">
        <p className="font-mono text-[8px] uppercase tracking-[0.3em] text-[var(--ink-faint)]">
          {BRAND_NAME} &bull; the claim ledger &bull; data as recorded in the
          electoral commission register &bull; no inference
        </p>
      </footer>
    </section>
  );
}
