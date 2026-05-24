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
import { Window } from "@/components/workstation/Window";
import { MenuBar } from "@/components/workstation/MenuBar";
import { ToolPalette } from "@/components/workstation/ToolPalette";

export const revalidate = 900;
export const maxDuration = 30;

// ============================================================================
// FEED PAGE — workstation aesthetic: the homepage is a FrameMaker document
// open on a SunOS desktop. Tool palette docks to the right.
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
  } catch {}

  if (!headline) {
    try {
      const originals = await getRecentPooterOriginals(false);
      const best = originals[0];
      if (best) {
        headline = best.title;
        subheadline = best.subheadline;
        dailyTitle = best.dailyTitle ?? null;
      }
    } catch {}
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

const DOC_MENU = [
  { label: "Document" },
  { label: "Edit" },
  { label: "Format" },
  { label: "TextRects" },
  { label: "Guides" },
  { label: "Page" },
];

export default function FeedPage() {
  return (
    <>
      <PooterTheme />
      <div className="flex gap-2 items-start">
        <div className="flex-1 min-w-0">
          <Window
            title="POOTER.FRM — pooter-world/daily-edition.frm"
            subtitle="/usr/pooter/bin/.makerinit/daily.doc"
            menuBar={<MenuBar items={DOC_MENU} />}
            ruler
            flush
            footer={
              <>
                <span className="font-mono text-[10px]">
                  [Left] V = Go to Previous Page &nbsp;&nbsp;
                  [Control] V = Go to Next Page
                </span>
                <span className="font-mono text-[10px]">Page 1 of ∞</span>
              </>
            }
          >
            <div className="fm-doc">
              <Suspense fallback={<MastheadSkeleton />}>
                <AsyncMasthead />
              </Suspense>
              <div className="mt-4">
                <Suspense fallback={<FeedSkeleton />}>
                  <AsyncFeed />
                </Suspense>
              </div>
            </div>
          </Window>
        </div>
        {/* Floating tool palette — hidden below xl to give the doc room */}
        <div className="hidden xl:block sticky top-[28px]">
          <ToolPalette />
        </div>
      </div>
    </>
  );
}
