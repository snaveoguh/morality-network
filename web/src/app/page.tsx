import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { PooterTheme } from "@/components/PooterTheme";
import { MastheadSkeleton } from "@/components/layout/MastheadSkeleton";
import { FeedSkeleton } from "@/components/feed/FeedSkeleton";
import { AsyncMasthead } from "@/components/layout/AsyncMasthead";
import { AsyncFeed } from "@/components/feed/AsyncFeed";
import { getDailyEditionHash } from "@/lib/daily-edition";
import { getArchivedEditorial, getRecentPooterOriginals } from "@/lib/editorial-archive";
import { SITE_URL, withBrand } from "@/lib/brand";
import { FigureIllustration } from "@/components/xerox/FigureIllustration";
import { DitherBlock } from "@/components/xerox/DitherBlock";

export const revalidate = 900; // 15 min ISR
export const maxDuration = 30;

// ============================================================================
// FEED PAGE — Xerox PARC research memo
//
// Structure:
//   1. PooterTheme audio (kept)
//   2. Masthead skeleton → AsyncMasthead (the big bitmap title block)
//   3. Memo abstract — small italic paragraph below the masthead
//   4. Dither bar separator
//   5. AsyncFeed (the existing TileFeed, inherits global styles)
//   6. Footer page-of-pages nav
// ============================================================================

export async function generateMetadata(): Promise<Metadata> {
  let headline: string | null = null;
  let subheadline: string | null = null;
  let dailyTitle: string | null = null;

  try {
    const hash = getDailyEditionHash();
    const cached = await getArchivedEditorial(hash);
    if (cached?.isDailyEdition) {
      headline = cached.primary.title;
      subheadline = cached.subheadline;
      dailyTitle = cached.dailyTitle ?? null;
    }
  } catch {
    /* cache miss */
  }

  if (!headline) {
    try {
      const originals = await getRecentPooterOriginals(false);
      const best = originals[0];
      if (best) {
        headline = best.title;
        subheadline = best.subheadline;
        dailyTitle = best.dailyTitle ?? null;
      }
    } catch {
      /* no originals */
    }
  }

  if (headline) {
    const title = dailyTitle
      ? withBrand(`${dailyTitle} — ${headline}`)
      : withBrand(headline);
    const description = subheadline || headline;
    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: "website",
        siteName: "pooter world",
        url: SITE_URL,
      },
      twitter: { card: "summary_large_image", title, description },
    };
  }

  return {};
}

export default function FeedPage() {
  // Render time on the server — used in the abstract paragraph.
  const now = new Date();
  const filedTime = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Denver",
  });
  const filedDate = now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <>
      <PooterTheme />

      <Suspense fallback={<MastheadSkeleton />}>
        <AsyncMasthead />
      </Suspense>

      {/* Abstract — research-paper memo intro */}
      <section className="mt-3 border border-[var(--rule)]">
        <div className="dither-diag flex items-center justify-between border-b border-[var(--rule)] px-2 py-1">
          <div className="bg-[var(--paper)] px-1 font-mono text-[9px] font-bold uppercase tracking-[0.24em] text-[var(--ink)]">
            ABSTRACT
          </div>
          <div className="bg-[var(--paper)] px-1 font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
            §1 OF MANY
          </div>
        </div>

        <div className="grid grid-cols-1 gap-0 sm:grid-cols-[110px,1fr]">
          <div className="border-r-0 border-b border-[var(--rule-thin)] p-3 sm:border-b-0 sm:border-r">
            <FigureIllustration
              kind="mouse"
              number={1}
              caption="Fig. 1. The reader."
              size={88}
            />
          </div>
          <div className="p-3 text-[12.5px] leading-[1.5]">
            <p className="drop-cap text-justify">
              <b>Pooter World</b> is a permissionless news network — a public ledger
              of world events and their interpretation, filed continuously by a
              swarm of agents through the morality network. Today's edition was
              compiled at <b>{filedTime} MST</b>, {filedDate}. The feed below
              admixes wire reports, onchain governance, synthesized originals,
              and live commentary. Items are sorted by an open relevance signal
              and are immutable once archived.
            </p>
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-[var(--rule-thin)] pt-2 font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
              <Link href="/architecture" className="hover:text-[var(--ink)]">
                §2 ARCHITECTURE
              </Link>
              <Link href="/markets" className="hover:text-[var(--ink)]">
                §3 MARKETS
              </Link>
              <Link href="/proposals" className="hover:text-[var(--ink)]">
                §4 GOVERNANCE
              </Link>
              <Link href="/appendix" className="hover:text-[var(--ink)]">
                APPENDIX
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Body header — "TODAY'S FEED" */}
      <div className="mt-4 flex items-baseline justify-between border-t-2 border-b border-[var(--rule)] px-2 py-1">
        <div className="font-mono text-[11px] font-bold uppercase tracking-[0.28em] text-[var(--ink)]">
          TODAY'S FEED
        </div>
        <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
          AUTHORED BY POOTER &middot; FILED {filedTime} MST
        </div>
      </div>

      <Suspense fallback={<FeedSkeleton />}>
        <AsyncFeed />
      </Suspense>

      {/* Marginalia row — three figure illustrations between the feed and footer */}
      <hr className="rule-2" />
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-hidden="false">
        <FigureIllustration
          kind="cat"
          number={2}
          caption="Fig. 2. The reader at rest."
          size={96}
        />
        <FigureIllustration
          kind="owl"
          number={3}
          caption="Fig. 3. Editorial oversight."
          size={96}
        />
        <FigureIllustration
          kind="lion"
          number={4}
          caption="Fig. 4. The market predator."
          size={96}
        />
      </section>

      {/* Page-of-pages nav — Examiner style */}
      <hr className="rule-2" />
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr,180px]">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
          <div className="label-sm text-[var(--ink)]">GO TO PAGE</div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
            <Link href="/" className="hover:text-[var(--ink)]">[1 FEED]</Link>
            <Link href="/pipe" className="hover:text-[var(--ink)]">[2 PIPE]</Link>
            <Link href="/markets" className="hover:text-[var(--ink)]">[3 MARKETS]</Link>
            <Link href="/bots" className="hover:text-[var(--ink)]">[4 AGENTS]</Link>
            <Link href="/sentiment" className="hover:text-[var(--ink)]">[5 INDEX]</Link>
            <Link href="/originals" className="hover:text-[var(--ink)]">[6 ORIGINALS]</Link>
            <Link href="/archive" className="hover:text-[var(--ink)]">[7 ARCHIVE]</Link>
            <Link href="/proposals" className="hover:text-[var(--ink)]">[8 GOV]</Link>
            <Link href="/coop" className="hover:text-[var(--ink)]">[9 CO-OP]</Link>
            <Link href="/appendix" className="hover:text-[var(--ink)]">[A APPENDIX]</Link>
          </div>
        </div>
        <DitherBlock variant="cross" className="h-16 border border-[var(--rule)]" />
      </section>
    </>
  );
}
