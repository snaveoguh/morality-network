export function GovernanceSocialSkeleton() {
  return (
    <div className="mb-6 space-y-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 border-b border-[var(--rule-light)]/40 pb-2">
          <div className="h-6 w-6 shrink-0 animate-pulse rounded-full bg-[var(--rule-light)]/50" />
          <div className="flex-1 space-y-1">
            <div className="h-2.5 w-24 animate-pulse bg-[var(--rule-light)]/50" />
            <div
              className="h-2.5 animate-pulse bg-[var(--rule-light)]/40"
              style={{ width: `${70 + (i * 11) % 25}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
