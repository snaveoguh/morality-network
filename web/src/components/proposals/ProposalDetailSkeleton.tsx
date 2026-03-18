export function ProposalDetailSkeleton() {
  return (
    <div>
      {/* Title */}
      <div className="mb-2 h-6 w-3/4 animate-pulse bg-[var(--rule-light)]" />
      <div className="mb-4 h-6 w-1/2 animate-pulse bg-[var(--rule-light)]" />

      {/* Status badges */}
      <div className="mb-4 flex gap-2">
        <div className="h-5 w-16 animate-pulse bg-[var(--rule-light)]/60" />
        <div className="h-5 w-20 animate-pulse bg-[var(--rule-light)]/40" />
      </div>

      {/* Vote bars */}
      <div className="mb-6 space-y-2">
        <div className="h-4 w-full animate-pulse bg-[var(--rule-light)]/30" />
        <div className="flex gap-4">
          <div className="h-3 w-20 animate-pulse bg-[var(--rule-light)]/40" />
          <div className="h-3 w-20 animate-pulse bg-[var(--rule-light)]/40" />
        </div>
      </div>

      {/* Description */}
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-3 animate-pulse bg-[var(--rule-light)]/40"
            style={{ width: `${90 - i * 5}%` }}
          />
        ))}
      </div>
    </div>
  );
}
