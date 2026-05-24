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
import { NeXTWindow } from "@/components/nextstep/NeXTWindow";
import { Inspector } from "@/components/nextstep/Inspector";

export const revalidate = 900;
export const maxDuration = 30;

// ============================================================================
// FEED PAGE — wrapped in a NeXTSTEP Workspace document window
//
// Title bar:   "Pooter Reader.app — daily-edition.po"
// Window:      AsyncMasthead + AsyncFeed
// Status bar:  edition + timestamp
// Floating Inspector palette to the right of the window.
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
    // Cache miss
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
      // No originals
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
      twitter: {
        card: "summary_large_image",
        title,
        description,
      },
    };
  }

  return {};
}

function formatNow(): string {
  const d = new Date();
  return d.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export default function FeedPage() {
  const editionNumber =
    Math.floor(
      (Date.now() - new Date("2026-03-11T00:00:00Z").getTime()) / 86400000,
    ) + 1;

  return (
    <>
      <PooterTheme />
      <Inspector />
      <NeXTWindow
        title="Pooter Reader.app"
        subtitle="— daily-edition.po"
        statusBar={
          <div className="flex items-center justify-between gap-3">
            <span className="small-caps">
              Edition {editionNumber} · Base L2 · Updated {formatNow()}
            </span>
            <span className="hidden sm:inline">12.3 MB</span>
          </div>
        }
        className="lg:mr-60"
      >
        <Suspense fallback={<MastheadSkeleton />}>
          <AsyncMasthead />
        </Suspense>
        <div className="mt-2">
          <Suspense fallback={<FeedSkeleton />}>
            <AsyncFeed />
          </Suspense>
        </div>
      </NeXTWindow>
    </>
  );
}
