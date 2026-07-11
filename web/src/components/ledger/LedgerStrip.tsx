import Link from "next/link";
import { sql } from "@/lib/db";

// Front-page strip for the Claim Ledger — counts only, sworn style, one
// cheap query. Renders nothing without a DB or on any failure.

export const dynamic = "force-dynamic";

async function ledgerCounts(): Promise<{
  claims: number;
  verdicts: number;
  latestSitting: string | null;
} | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const rows = await sql<
      Array<{ claims: number; verdicts: number; latest: string | Date | null }>
    >`
      SELECT
        (SELECT COUNT(*)::int FROM pooter.ledger_claims) AS claims,
        (SELECT COUNT(*)::int FROM pooter.ledger_resolutions WHERE status = 'published') AS verdicts,
        (SELECT MAX(uttered_at) FROM pooter.ledger_claims WHERE context = 'pmqs') AS latest
    `;
    const row = rows[0];
    if (!row || row.claims === 0) return null;
    return {
      claims: row.claims,
      verdicts: row.verdicts,
      latestSitting: row.latest
        ? (row.latest instanceof Date
            ? row.latest.toISOString()
            : String(row.latest)
          ).slice(0, 10)
        : null,
    };
  } catch {
    return null;
  }
}

export async function LedgerStrip() {
  const counts = await ledgerCounts();
  if (!counts) return null;

  return (
    <Link
      href="/ledger"
      className="group mx-auto mt-3 flex max-w-5xl items-baseline justify-between gap-3 border-y border-[var(--rule)] px-3 py-2"
    >
      <span className="flex items-baseline gap-2">
        <span className="blackletter text-base leading-none text-[var(--ink)]">
          The Claim Ledger
        </span>
        <span className="hidden font-body-serif text-xs italic text-[var(--ink-light)] sm:inline">
          what they claimed vs what the records show
        </span>
      </span>
      <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-faint)] transition-colors group-hover:text-[var(--accent-red)]">
        {counts.claims} claims &middot; {counts.verdicts}{" "}
        {counts.verdicts === 1 ? "verdict" : "verdicts"}
        {counts.latestSitting && ` · latest PMQs ${counts.latestSitting}`}{" "}
        &rarr;
      </span>
    </Link>
  );
}
