import { MastheadSkeleton } from "@/components/layout/MastheadSkeleton";
import { FeedSkeleton } from "@/components/feed/FeedSkeleton";
import { FrontGrid } from "@/components/feed/FrontFeed";
import { LedgerCardsSkeleton } from "@/components/ledger/LedgerStrip";

// ============================================================================
// ROOT LOADING — lofi newspaper skeleton (replaces old spinner)
//
// Shows the same skeleton layout that the Suspense fallbacks use,
// so the visual transition from loading → content is seamless.
// ============================================================================

export default function Loading() {
  return (
    <FrontGrid>
      <FeedSkeleton />
      <MastheadSkeleton />
      <LedgerCardsSkeleton />
    </FrontGrid>
  );
}
