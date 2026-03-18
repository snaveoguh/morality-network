export function StumbleSkeleton() {
  return (
    <div className="mx-auto max-w-2xl py-12">
      <div className="border border-[var(--rule-light)] p-6">
        {/* Source */}
        <div className="mb-3 h-2.5 w-20 animate-pulse bg-[var(--rule-light)]/50" />
        {/* Title */}
        <div className="mb-2 h-5 w-4/5 animate-pulse bg-[var(--rule-light)]" />
        <div className="mb-4 h-5 w-3/5 animate-pulse bg-[var(--rule-light)]" />
        {/* Description */}
        <div className="space-y-1.5">
          <div className="h-3 w-full animate-pulse bg-[var(--rule-light)]/40" />
          <div className="h-3 w-5/6 animate-pulse bg-[var(--rule-light)]/40" />
          <div className="h-3 w-2/3 animate-pulse bg-[var(--rule-light)]/40" />
        </div>
        {/* Action bar */}
        <div className="mt-6 flex justify-center gap-4">
          <div className="h-8 w-24 animate-pulse bg-[var(--rule-light)]/30" />
          <div className="h-8 w-24 animate-pulse bg-[var(--rule-light)]/30" />
        </div>
      </div>
    </div>
  );
}
