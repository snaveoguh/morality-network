import { Suspense } from "react";
import type { Metadata } from "next";
import { PooterTheme } from "@/components/PooterTheme";
import { MastheadSkeleton } from "@/components/layout/MastheadSkeleton";
import { FeedSkeleton } from "@/components/feed/FeedSkeleton";
import { AsyncMasthead } from "@/components/layout/AsyncMasthead";
import { AsyncFeed } from "@/components/feed/AsyncFeed";
import { getDailyEditionHash } from "@/lib/daily-edition";
import { getArchivedEditorial, getRecentPooterOriginals } from "@/lib/editorial-archive";
import { SITE_URL, withBrand } from "@/lib/brand";

export const revalidate = 60; // 1 min ISR
export const maxDuration = 30;

// ============================================================================
// FEED PAGE — instant shell, data streams in via Suspense
//
// The page shell (PooterTheme + skeleton placeholders) renders immediately.
// AsyncMasthead and AsyncFeed are async server components that fetch data
// independently — each streams into its Suspense boundary as soon as ready.
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
  let subheadline: string | null = null;
  let dailyTitle: string | null = null;

  try {
    // Try today's daily edition first
    const hash = getDailyEditionHash();
    const cached = await getArchivedEditorial(hash);
    if (cached?.isDailyEdition) {
      headline = cached.primary.title;
      subheadline = cached.subheadline;
      dailyTitle = cached.dailyTitle ?? null;
    }
  } catch {
    // Cache miss
  }

  // Fallback: most recent Pooter Original (no time cutoff)
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
      // No originals
    }
  }

  // If we have a real article, use it for metadata
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
      twitter: {
        card: "summary_large_image",
        title,
        description,
      },
    };
  }

  // No article available — use defaults (layout.tsx metadata applies)
  return {};
}

export default function FeedPage() {
  return (
    <>
      <PooterTheme />
      <Suspense fallback={<MastheadSkeleton />}>
        <AsyncMasthead />
      </Suspense>
      <div className="mt-4">
        <Suspense fallback={<FeedSkeleton />}>
          <AsyncFeed />
        </Suspense>
      </div>
    </>
  );
}
