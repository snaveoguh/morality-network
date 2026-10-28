// ============================================================================
// MASTHEAD SKELETON — placeholder for the lead story while the edition loads
// Same placement as <Masthead>: image above headline on phone, text 4 +
// image 5 of the page's first 9 columns at ≥1024.
// ============================================================================

const BAR = "animate-pulse bg-[var(--rule-light)]";

export function MastheadSkeleton() {
  return (
    <div
      aria-hidden
      className="order-1 flex flex-col pt-[18px] lg:col-span-9 lg:row-start-2 lg:grid lg:grid-cols-9 lg:gap-x-6 lg:pt-7"
    >
      <div className="flex min-h-11 items-center gap-2 pb-1 text-[15px] font-bold text-[var(--ink)] lg:col-span-4 lg:row-start-1 lg:min-h-0 lg:items-start">
        <span className="h-2.5 w-2.5 bg-[var(--ink)]" />
        Today&rsquo;s edition ›
      </div>
      <div className="-mx-4 lg:col-span-5 lg:col-start-5 lg:row-span-2 lg:row-start-1 lg:mx-0">
        <div className="halftone aspect-[3/2] w-full lg:aspect-[4/3]" />
      </div>
      <div className="flex flex-col gap-2.5 pt-3.5 lg:col-span-4 lg:row-start-2 lg:border-r lg:border-[var(--rule-light)] lg:pr-6 lg:pt-3">
        <div className={`h-8 w-11/12 ${BAR}`} />
        <div className={`h-8 w-4/5 ${BAR}`} />
        <div className={`h-8 w-3/5 ${BAR}`} />
        <div className={`mt-1 h-4 w-full ${BAR} opacity-60`} />
        <div className={`h-4 w-2/3 ${BAR} opacity-60`} />
      </div>
    </div>
  );
}
