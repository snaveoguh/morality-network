import "server-only";

import Link from "next/link";
import seed from "@/data/ledger-corrections-seed.json";
import {
  computeCorrectionsStats,
  type CorrectionsStats,
  type MinisterialCorrection,
} from "@/lib/ledger/corrections";
import { getLedgerWeekSnapshot } from "@/lib/ledger/service";
import { loadPledges } from "@/lib/ledger/pledges";
import { BRAND_NAME } from "@/lib/brand";

// Front-page "Accountability record" band: the first thing on the home page.
// Live figures from the same sources as /ledger/corrections, /ledger and
// /ledger/pledges. Nothing is hard-coded: without DATABASE_URL the
// corrections come from the checked-in seed, the PMQs count from the cached
// week snapshot, the pledges from the pledges seed. Plain figures and plain
// links; no badges or seals (pooter-brand).

/** The one line that says what the site is. Also the home meta description. */
export const RECORD_LINE = `${BRAND_NAME} is an independent public record of what politicians say and promise, checked against the official record, so anyone can follow politics and take part.`;

const PMQS_TIMEOUT_MS = 4_000;

interface SeedFile {
  window: { from: string; to: string };
  corrections: MinisterialCorrection[];
}

interface RecordFigures {
  corrections: CorrectionsStats;
  window: { from: string; to: string } | null;
  pmqs: { checkable: number; date: string } | null;
  pledges: number;
}

// Light read of the register: the corrections page also runs claim
// matching (and writes proposals), which the front page does not need.
async function loadCorrections(): Promise<{
  rows: MinisterialCorrection[];
  window: { from: string; to: string } | null;
}> {
  const file = seed as unknown as SeedFile;
  if (process.env.DATABASE_URL) {
    try {
      const { listCorrections } = await import("@/lib/db/ledger-corrections");
      const rows = await listCorrections();
      if (rows.length > 0) {
        const dates = rows.map((c) => c.correctedOn).sort();
        return { rows, window: { from: dates[0], to: dates[dates.length - 1] } };
      }
    } catch (error) {
      console.warn("[record-band] corrections DB read failed, using seed:", error);
    }
  }
  return { rows: file.corrections, window: file.window };
}

async function loadPmqs(): Promise<RecordFigures["pmqs"]> {
  // The snapshot is cached for 6h; on a cold cache it fetches Hansard, so it
  // gets a short budget and the band renders without it rather than wait.
  const snapshot = await Promise.race([
    getLedgerWeekSnapshot().catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), PMQS_TIMEOUT_MS)),
  ]);
  // An empty snapshot means extraction has not run (no DB, no AI provider),
  // not that PMQs had no claims: show no figure rather than a zero.
  if (!snapshot || snapshot.claims.length === 0) return null;
  return {
    checkable: snapshot.claims.filter((c) => c.claimType !== "unfalsifiable").length,
    date: snapshot.debate.date,
  };
}

async function loadFigures(): Promise<RecordFigures> {
  const [{ rows, window }, pmqs] = await Promise.all([loadCorrections(), loadPmqs()]);
  let pledges = 0;
  try {
    pledges = loadPledges().length;
  } catch {
    // Invalid seed: show the link without a count.
  }
  return { corrections: computeCorrectionsStats(rows), window, pmqs, pledges };
}

function shortDate(iso: string, year = true): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(year ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

function days(n: number | null): string {
  if (n === null) return "—";
  return n === 1 ? "1 day" : `${Number.isInteger(n) ? n : n.toFixed(1)} days`;
}

// ── Layout ──────────────────────────────────────────────────────────────────

const LINK =
  "text-[var(--ink)] underline decoration-[var(--ink-faint)] decoration-1 underline-offset-4 hover:decoration-[var(--ink)]";

/** Shared frame, so the Suspense skeleton has the same footprint. */
function RecordFrame({ figures, foot }: { figures: React.ReactNode; foot: React.ReactNode }) {
  return (
    <section
      aria-labelledby="record-band-title"
      className="border-b-4 border-double border-[var(--ink)] pb-4 pt-4 lg:grid lg:grid-cols-12 lg:gap-x-6 lg:pb-6 lg:pt-6"
    >
      <div className="lg:col-span-4">
        <h2 id="record-band-title" className="news-label text-[22px] leading-tight text-[var(--ink)] lg:text-[28px]">
          <Link href="/ledger" className="hover:underline hover:decoration-1 hover:underline-offset-4">
            Accountability record
          </Link>
        </h2>
        <p className="mt-1.5 text-[14px] leading-snug text-[var(--ink-light)] lg:mt-2 lg:text-[15px] lg:leading-normal">
          {RECORD_LINE}
        </p>
      </div>
      <div className="mt-3 lg:col-span-8 lg:mt-1">
        <div className="grid grid-cols-3 gap-x-3 gap-y-3 lg:gap-x-6 lg:gap-y-5">{figures}</div>
        <div className="mt-3 text-xs leading-relaxed text-[var(--ink-faint)] lg:mt-4 lg:text-[13px]">{foot}</div>
      </div>
    </section>
  );
}

function Figure({ value, label, href }: { value: React.ReactNode; label: string; href: string }) {
  return (
    <Link href={href} className="group flex flex-col gap-1 border-t border-[var(--rule-light)] pt-2">
      <span className="news-head text-[26px] leading-none text-[var(--ink)] lg:text-4xl">{value}</span>
      <span className="text-[12px] leading-snug text-[var(--ink-light)] group-hover:underline group-hover:decoration-1 group-hover:underline-offset-2 lg:text-[13px]">
        {label}
      </span>
    </Link>
  );
}

export function RecordBandSkeleton() {
  const bar = (w: string) => <span className={`inline-block h-3 ${w} animate-pulse bg-[var(--rule-light)]`} />;
  return (
    <RecordFrame
      figures={[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex flex-col gap-2 border-t border-[var(--rule-light)] pt-2">
          <span className="h-[26px] w-14 animate-pulse bg-[var(--rule-light)] lg:h-9" />
          {bar("w-20")}
        </div>
      ))}
      foot={bar("w-56")}
    />
  );
}

export async function RecordBand() {
  const { corrections: stats, window, pmqs, pledges } = await loadFigures();

  return (
    <RecordFrame
      figures={
        <>
          <Figure href="/ledger/corrections" value={stats.total.toLocaleString("en-GB")} label="corrections on record" />
          <Figure
            href="/ledger/corrections"
            value={days(stats.medianDays)}
            label="median, statement to correction"
          />
          <Figure
            href="/ledger/corrections"
            value={`${Math.round(stats.over30Days * 100)}%`}
            label="took more than 30 days"
          />
          <Figure href="/ledger/corrections" value={stats.byDepartment.length} label="departments" />
          <Figure
            href="/ledger"
            value={pmqs ? pmqs.checkable : "—"}
            label={pmqs ? `checkable claims, PMQs ${shortDate(pmqs.date, false)}` : "checkable claims, this week’s PMQs"}
          />
          <Figure href="/ledger/pledges" value={pledges || "—"} label="pledges tracked" />
        </>
      }
      foot={
        <>
          <p>
            Ministerial corrections to the official record
            {window ? `, ${shortDate(window.from)} to ${shortDate(window.to)}` : ""}. Source: Parliament written
            questions, statements and Hansard.
          </p>
          <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[13px] lg:text-sm">
            <Link href="/ledger" className={LINK}>
              Claim Ledger
            </Link>
            <Link href="/ledger/corrections" className={LINK}>
              Corrections Register
            </Link>
            <Link href="/ledger/pledges" className={LINK}>
              Pledges
            </Link>
          </p>
        </>
      }
    />
  );
}
