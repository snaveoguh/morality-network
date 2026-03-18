import { Suspense } from "react";
import { PooterTheme } from "@/components/PooterTheme";
import { MastheadSkeleton } from "@/components/layout/MastheadSkeleton";
import { FeedSkeleton } from "@/components/feed/FeedSkeleton";
import { AsyncMasthead } from "@/components/layout/AsyncMasthead";
import { AsyncFeed } from "@/components/feed/AsyncFeed";

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
