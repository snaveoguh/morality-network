export function SentimentSkeleton() {
  return (
    <div>
      {/* Global index card skeleton */}
      <div className="mb-8 border border-[var(--rule-light)] p-6">
        <div className="mb-4 flex items-center gap-4">
          <div className="h-12 w-20 animate-pulse bg-[var(--rule-light)]" />
          <div className="space-y-1">
            <div className="h-3 w-24 animate-pulse bg-[var(--rule-light)]/60" />
            <div className="h-2.5 w-32 animate-pulse bg-[var(--rule-light)]/40" />
          </div>
        </div>
        <div className="h-2.5 w-2/3 animate-pulse bg-[var(--rule-light)]/30" />
      </div>

      {/* Topic grid skeleton */}
      <div className="mb-6 border-b border-[var(--rule)] pb-2">
        <div className="h-5 w-32 animate-pulse bg-[var(--rule-light)]" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="border border-[var(--rule-light)] p-4">
            <div className="mb-2 h-3 w-20 animate-pulse bg-[var(--rule-light)]" />
            <div className="mb-1 h-6 w-12 animate-pulse bg-[var(--rule-light)]/60" />
            <div className="space-y-1">
              <div className="h-2 w-full animate-pulse bg-[var(--rule-light)]/30" />
              <div className="h-2 w-4/5 animate-pulse bg-[var(--rule-light)]/30" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
