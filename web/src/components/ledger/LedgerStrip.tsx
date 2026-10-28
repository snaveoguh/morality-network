import Link from "next/link";
import { sql } from "@/lib/db";
import type { LedgerContext } from "@/lib/ledger/types";

// Front-page Claim Ledger (direction C). Phone: cards that scroll sideways
// with snap. ≥1024: a right-hand rail beside the lead story. Each card is
// speaker → verbatim quote in serif → a quiet status line. No badges, no
// stamps, no verdict seals (pooter-brand). One cheap query; without a DB or
// on any failure the rail still renders as a plain link to /ledger.

export const dynamic = "force-dynamic";

const CONTEXT_LABEL: Record<LedgerContext, string> = {
  pmqs: "PMQs",
  budget: "Budget",
  manifesto: "Manifesto",
};

interface FrontClaim {
  id: string;
  memberId: number | null;
  speaker: string;
  party: string | null;
  quote: string;
  utteredAt: string;
  context: LedgerContext;
  hasVerdict: boolean;
}

interface LedgerFront {
  claims: number;
  verdicts: number;
  latest: FrontClaim[];
}

function isoDate(v: string | Date | null): string {
  if (!v) return "";
  return (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10);
}

function shortDate(iso: string): string {
  if (!iso) return "";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

async function ledgerFront(): Promise<LedgerFront | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const [counts, rows] = await Promise.all([
      sql<Array<{ claims: number; verdicts: number }>>`
        SELECT
          (SELECT COUNT(*)::int FROM pooter.ledger_claims) AS claims,
          (SELECT COUNT(*)::int FROM pooter.ledger_resolutions WHERE status = 'published') AS verdicts
      `,
      sql<
        Array<{
          id: string;
          member_id: number | null;
          speaker_name: string;
          party: string | null;
          verbatim_quote: string;
          uttered_at: string | Date | null;
          context: LedgerContext;
          has_verdict: boolean;
        }>
      >`
        SELECT c.id, c.member_id, c.speaker_name, c.party, c.verbatim_quote,
               c.uttered_at, c.context,
               EXISTS (
                 SELECT 1 FROM pooter.ledger_resolutions r
                 WHERE r.claim_id = c.id AND r.status = 'published'
               ) AS has_verdict
        FROM pooter.ledger_claims c
        WHERE c.claim_type = 'retrodictable'
        ORDER BY c.uttered_at DESC, c.occurrences DESC, c.created_at ASC
        LIMIT 6
      `,
    ]);
    const row = counts[0];
    if (!row || row.claims === 0) return null;
    return {
      claims: row.claims,
      verdicts: row.verdicts,
      latest: rows.map((r) => ({
        id: r.id,
        memberId: r.member_id,
        speaker: r.speaker_name,
        party: r.party,
        quote: r.verbatim_quote,
        utteredAt: isoDate(r.uttered_at),
        context: r.context,
        hasVerdict: r.has_verdict,
      })),
    };
  } catch {
    return null;
  }
}

/** Shared frame — the Suspense skeleton uses it too so nothing jumps. */
export function LedgerFrame({ meta, children }: { meta: React.ReactNode; children: React.ReactNode }) {
  return (
    <section
      aria-label="The Claim Ledger"
      className="order-3 -mx-4 border-b border-[var(--rule-light)] py-6 lg:col-span-3 lg:col-start-10 lg:row-span-2 lg:row-start-2 lg:mx-0 lg:border-b-0 lg:border-l lg:py-0 lg:pl-6 lg:pt-7"
    >
      <div className="px-4 lg:px-0">
        <Link
          href="/ledger"
          className="news-label text-[26px] leading-tight text-[var(--ink)] underline decoration-[var(--ink-faint)] decoration-1 underline-offset-[5px] lg:font-sans lg:text-[17px] lg:font-bold lg:decoration-[var(--ink)] lg:underline-offset-4"
        >
          The Claim Ledger ›
        </Link>
        <p className="mb-4 mt-1.5 text-[13px] text-[var(--ink-faint)] lg:mb-1.5 lg:mt-1 lg:text-xs">{meta}</p>
      </div>
      {children}
    </section>
  );
}

const SCROLLER =
  "scrollbar-hide flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 lg:flex-col lg:gap-0 lg:overflow-visible lg:px-0";
const CARD =
  "flex w-[280px] shrink-0 snap-start flex-col gap-2 border border-[var(--rule-light)] bg-[var(--paper-dark)] p-4 lg:w-auto lg:border-0 lg:border-b lg:bg-transparent lg:px-0 lg:py-3.5";

export function LedgerCardsSkeleton() {
  return (
    <LedgerFrame meta={<span className="inline-block h-3 w-40 animate-pulse bg-[var(--rule-light)]" />}>
      <div className={SCROLLER}>
        {[0, 1, 2].map((i) => (
          <div key={i} className={CARD}>
            <div className="h-3 w-32 animate-pulse bg-[var(--rule-light)]" />
            <div className="h-4 w-full animate-pulse bg-[var(--rule-light)]" />
            <div className="h-4 w-11/12 animate-pulse bg-[var(--rule-light)]" />
            <div className="h-4 w-3/5 animate-pulse bg-[var(--rule-light)]" />
            <div className="h-3 w-36 animate-pulse bg-[var(--rule-light)]/60" />
          </div>
        ))}
      </div>
    </LedgerFrame>
  );
}

export async function LedgerStrip() {
  const data = await ledgerFront();

  if (!data) {
    return (
      <LedgerFrame meta="Claims from Prime Minister’s Questions, quoted verbatim and linked to Hansard.">
        {null}
      </LedgerFrame>
    );
  }

  const latestSitting = data.latest[0];
  const meta = [
    `${data.claims.toLocaleString("en-GB")} claims`,
    `${data.verdicts} ${data.verdicts === 1 ? "verdict" : "verdicts"}`,
    latestSitting ? `${CONTEXT_LABEL[latestSitting.context]} ${shortDate(latestSitting.utteredAt)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <LedgerFrame meta={meta}>
      <div className={SCROLLER}>
        {data.latest.map((claim) => (
          <Link
            key={claim.id}
            href={claim.memberId ? `/ledger/member/${claim.memberId}` : "/ledger"}
            className={`${CARD} group`}
          >
            <span className="text-[13px] text-[var(--ink-light)]">
              {claim.speaker}
              {claim.party ? ` · ${claim.party}` : ""}
            </span>
            <span className="news-head line-clamp-5 text-xl leading-[1.22] text-[var(--ink)] group-hover:underline group-hover:decoration-[var(--ink-faint)] group-hover:decoration-1 group-hover:underline-offset-4 lg:line-clamp-4 lg:text-lg">
              &ldquo;{claim.quote}&rdquo;
            </span>
            <span className="mt-auto text-xs text-[var(--ink-faint)]">
              {CONTEXT_LABEL[claim.context]} {shortDate(claim.utteredAt)} &middot;{" "}
              {claim.hasVerdict ? "verdict published" : "awaiting review"}
            </span>
          </Link>
        ))}
      </div>
    </LedgerFrame>
  );
}
