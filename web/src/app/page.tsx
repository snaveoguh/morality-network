import { Suspense } from "react";
import { PooterTheme } from "@/components/PooterTheme";
import { MastheadSkeleton } from "@/components/layout/MastheadSkeleton";
import { FeedSkeleton } from "@/components/feed/FeedSkeleton";
import { AsyncMasthead } from "@/components/layout/AsyncMasthead";
import { AsyncFeed } from "@/components/feed/AsyncFeed";

// Cache the rendered page for 24h via ISR — prevents re-generating the daily
// editorial (which costs AI credits) on every single page refresh.
// Vercel's serverless FS is ephemeral so the local editorial-archive.json
// doesn't survive between invocations; ISR caching at the CDN layer is the
// only thing keeping us from burning credits on every hit.
export const revalidate = 86400; // 24 hours
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
