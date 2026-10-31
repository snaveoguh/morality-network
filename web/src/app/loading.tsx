import { MastheadSkeleton } from "@/components/layout/MastheadSkeleton";
import { FeedSkeleton } from "@/components/feed/FeedSkeleton";
import { FrontGrid } from "@/components/feed/FrontFeed";
import { PoliticsSliderSkeleton } from "@/components/feed/AsyncPoliticsSlider";
import { SignalsSkeleton } from "@/components/feed/AsyncSignals";
import { CommentarySkeleton } from "@/components/feed/AsyncCommentary";
import { LedgerCardsSkeleton } from "@/components/ledger/LedgerStrip";
import { RecordBandSkeleton } from "@/components/ledger/RecordBand";

// ============================================================================
// ROOT LOADING — lofi newspaper skeleton (replaces old spinner)
//
// Mirrors page.tsx block for block, using the same Suspense fallbacks, so
// the loading → content transition is seamless: politics slider, the
// Accountability record band, then the grid with the ledger cards lifted to
// follow the band on phone.
// ============================================================================

export default function Loading() {
  return (
    <>
      <PoliticsSliderSkeleton />
      <RecordBandSkeleton />
      <FrontGrid>
        <FeedSkeleton />
        <MastheadSkeleton />
        <div className="contents max-lg:[&>section]:-order-1">
          <LedgerCardsSkeleton />
        </div>
        <SignalsSkeleton />
        <CommentarySkeleton />
      </FrontGrid>
    </>
  );
}
