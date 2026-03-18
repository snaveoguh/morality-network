export function LeaderboardSkeleton() {
  return (
    <div className="space-y-2">
      {/* Table header */}
      <div className="grid grid-cols-[40px_1fr_80px_60px] gap-3 border-b border-[var(--rule)] pb-2">
        <div className="h-2.5 w-6 animate-pulse bg-[var(--rule-light)]/40" />
        <div className="h-2.5 w-20 animate-pulse bg-[var(--rule-light)]/40" />
        <div className="h-2.5 w-12 animate-pulse bg-[var(--rule-light)]/40" />
        <div className="h-2.5 w-10 animate-pulse bg-[var(--rule-light)]/40" />
      </div>
      {/* Table rows */}
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="grid grid-cols-[40px_1fr_80px_60px] items-center gap-3 border-b border-[var(--rule-light)]/40 py-2"
        >
          <div className="h-3 w-4 animate-pulse bg-[var(--rule-light)]/30" />
          <div className="space-y-1">
            <div
              className="h-3 animate-pulse bg-[var(--rule-light)]/50"
              style={{ width: `${60 + (i * 7) % 30}%` }}
            />
            <div className="h-2 w-20 animate-pulse bg-[var(--rule-light)]/30" />
          </div>
          <div className="h-3 w-10 animate-pulse bg-[var(--rule-light)]/40" />
          <div className="h-3 w-8 animate-pulse bg-[var(--rule-light)]/40" />
        </div>
      ))}
    </div>
  );
}
