export function ProposalsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="border-b border-[var(--rule-light)]/40 pb-3"
        >
          <div className="flex items-center gap-2 mb-1">
            <div className="h-2.5 w-12 animate-pulse bg-[var(--rule-light)]/60" />
            <div className="h-2.5 w-16 animate-pulse bg-[var(--rule-light)]/40" />
          </div>
          <div
            className="mb-1 h-3.5 animate-pulse bg-[var(--rule-light)]"
            style={{ width: `${65 + (i * 13) % 30}%` }}
          />
          <div className="h-2.5 w-2/3 animate-pulse bg-[var(--rule-light)]/40" />
        </div>
      ))}
    </div>
  );
}
