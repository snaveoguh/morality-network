import { Suspense } from "react";
import type { Metadata } from "next";
import { PooterTheme } from "@/components/PooterTheme";
import { MastheadSkeleton } from "@/components/layout/MastheadSkeleton";
import { FeedSkeleton } from "@/components/feed/FeedSkeleton";
import { AsyncMasthead } from "@/components/layout/AsyncMasthead";
import { AsyncFeed } from "@/components/feed/AsyncFeed";
import { LedgerStrip, LedgerCardsSkeleton } from "@/components/ledger/LedgerStrip";
import { RecordBand, RecordBandSkeleton, RECORD_LINE } from "@/components/ledger/RecordBand";
import { FrontGrid } from "@/components/feed/FrontFeed";
import { AsyncSignals, SignalsSkeleton } from "@/components/feed/AsyncSignals";
import { AsyncCommentary, CommentarySkeleton } from "@/components/feed/AsyncCommentary";
import { getDailyEditionHash } from "@/lib/daily-edition";
import { getArchivedEditorial, getRecentPooterOriginals } from "@/lib/editorial-archive";
import { SITE_URL, withBrand } from "@/lib/brand";
import { isFrontStory } from "@/lib/front-filter";

export const revalidate = 900; // 15 min ISR (was 60s — $70+/mo savings)
export const maxDuration = 30;

// ============================================================================
// FEED PAGE — instant shell, data streams in via Suspense
//
// The record leads: the Accountability record band (corrections, PMQs
// claims, pledges) sits above everything, then the Claim Ledger cards, then
// the news, signals and commentary.
//
// The page shell (PooterTheme + skeleton placeholders) renders immediately.
// AsyncMasthead, AsyncFeed and LedgerStrip are async server components that
// fetch data independently — each streams into its Suspense boundary as soon
// as ready.
//
// Result: user sees the newspaper layout + lofi skeletons in <100ms,
// content fills in progressively over the next few seconds.
// ============================================================================

/**
 * Dynamic OG metadata — shows today's masthead article in social previews
 * instead of the generic "pooter world" fallback.
 */
export async function generateMetadata(): Promise<Metadata> {
  let headline: string | null = null;
  let dailyTitle: string | null = null;

  try {
    // Try today's daily edition first
    const hash = getDailyEditionHash();
    const cached = await getArchivedEditorial(hash);
    // Same rule as the masthead: a crypto or market edition never titles the
    // home page (lib/front-filter.ts).
    if (cached?.isDailyEdition && isFrontStory({ title: cached.primary.title, category: cached.primary.category })) {
      headline = cached.primary.title;
      dailyTitle = cached.dailyTitle ?? null;
    }
  } catch {
    // Cache miss
  }

  // Fallback: most recent Pooter Original (no time cutoff)
  if (!headline) {
    try {
      const originals = await getRecentPooterOriginals(false);
      const best = originals.find(isFrontStory);
      if (best) {
        headline = best.title;
        dailyTitle = best.dailyTitle ?? null;
      }
    } catch {
      // No originals
    }
  }

  // If we have a real article, use it for metadata
  if (headline) {
    const title = dailyTitle
      ? withBrand(`${dailyTitle} — ${headline}`)
      : withBrand(headline);
    // Record-first: the description says what the site is; the title
    // carries today's lead story.
    const description = RECORD_LINE;

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
      twitter: {
        card: "summary_large_image",
        title,
        description,
      },
    };
  }

  // No article available — record-first title and description.
  const title = withBrand("Accountability record");
  return {
    title,
    description: RECORD_LINE,
    openGraph: {
      title,
      description: RECORD_LINE,
      type: "website",
      siteName: "pooter world",
      url: SITE_URL,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: RECORD_LINE,
    },
  };
}

export default function FeedPage() {
  // Independent Suspense boundaries share one grid: the feed's blocks, the
  // lead story, the ledger rail, the Bearometer signals and the commentary
  // column each place themselves (see FrontFeed). The record band sits above
  // the grid. On phone the ledger cards are lifted to the top of the grid so
  // they follow the band; from 1024 they stay the right-hand rail beside the
  // lead (display: contents keeps their grid placement).
  return (
    <>
      <PooterTheme />
      <Suspense fallback={<RecordBandSkeleton />}>
        <RecordBand />
      </Suspense>
      <FrontGrid>
        <Suspense fallback={<FeedSkeleton />}>
          <AsyncFeed />
        </Suspense>
        <Suspense fallback={<MastheadSkeleton />}>
          <AsyncMasthead />
        </Suspense>
        <div className="contents max-lg:[&>section]:-order-1">
          <Suspense fallback={<LedgerCardsSkeleton />}>
            <LedgerStrip />
          </Suspense>
        </div>
        <Suspense fallback={<SignalsSkeleton />}>
          <AsyncSignals />
        </Suspense>
        <Suspense fallback={<CommentarySkeleton />}>
          <AsyncCommentary />
        </Suspense>
      </FrontGrid>
    </>
  );
}
