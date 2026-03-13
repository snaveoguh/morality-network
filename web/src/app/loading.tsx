import { MastheadSkeleton } from "@/components/layout/MastheadSkeleton";
import { FeedSkeleton } from "@/components/feed/FeedSkeleton";

// ============================================================================
// ROOT LOADING — lofi newspaper skeleton (replaces old spinner)
//
// Shows the same skeleton layout that the Suspense fallbacks use,
// so the visual transition from loading → content is seamless.
// ============================================================================

export default function Loading() {
  return (
    <>
      <MastheadSkeleton />
      <div className="mt-4">
        <FeedSkeleton />
      </div>
    </>
  );
}
