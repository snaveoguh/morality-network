// ============================================================================
// FEED SKELETON — direction C placeholders while the feed streams in
//
// Emits the same grid children as <FrontFeed> (trending row, secondaries,
// Bearometer, chart, latest) with the same order/placement classes, so the
// page doesn't jump when real content replaces it.
// ============================================================================

const BAR = "animate-pulse bg-[var(--rule-light)]";

export function FeedSkeleton() {
  return (
    <>
      <div
        aria-hidden
        className="order-0 -mx-4 flex h-11 items-center gap-[18px] overflow-hidden border-y border-[var(--rule-light)] px-4 lg:col-span-12 lg:row-start-1 lg:mx-0 lg:h-12 lg:justify-center"
      >
        <span className="text-sm font-bold text-[var(--ink)]">Trending</span>
        {[64, 48, 72, 56, 60].map((w, i) => (
          <span key={i} className={`h-3 shrink-0 ${BAR}`} style={{ width: w }} />
        ))}
      </div>

      <div
        aria-hidden
        className="order-2 mt-5 border-t border-[var(--rule-light)] lg:col-span-9 lg:row-start-3 lg:mt-0 lg:grid lg:grid-cols-9 lg:gap-x-6 lg:border-t-0 lg:pt-6"
      >
        {[4, 5].map((span) => (
          <div
            key={span}
            className={`flex flex-col gap-2 border-b border-[var(--rule-light)] py-4 lg:border-b-0 lg:border-t ${
              span === 4 ? "lg:col-span-4 lg:pr-6" : "lg:col-span-5"
            }`}
          >
            <div className={`h-5 w-11/12 ${BAR}`} />
            <div className={`h-5 w-3/5 ${BAR}`} />
            <div className={`h-3 w-28 ${BAR} opacity-60`} />
          </div>
        ))}
      </div>

      <div aria-hidden className="order-4 mt-5 flex h-24 flex-col gap-2 border border-[var(--rule)] p-4 lg:order-[12] lg:col-span-4 lg:mt-7">
        <div className={`h-3 w-24 ${BAR}`} />
        <div className={`h-5 w-4/5 ${BAR}`} />
      </div>

      <div aria-hidden className="order-6 flex flex-col pt-[22px] lg:order-[13] lg:col-span-8 lg:pt-7">
        <span className="pb-1 text-[15px] font-bold text-[var(--ink)]">Latest ›</span>
        <div className="grid md:grid-cols-2 md:gap-x-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2 border-b border-[var(--rule-light)] py-3.5">
              <div className={`h-3 w-40 ${BAR} opacity-60`} />
              <div className={`h-5 w-11/12 ${BAR}`} />
              <div className={`h-5 w-2/3 ${BAR}`} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
