export function SignalsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 border-b border-[var(--rule-light)]/40 pb-3"
        >
          <div className="h-8 w-12 animate-pulse bg-[var(--rule-light)]/50" />
          <div className="flex-1 space-y-1">
            <div
              className="h-3 animate-pulse bg-[var(--rule-light)]/60"
              style={{ width: `${50 + (i * 11) % 40}%` }}
            />
            <div className="h-2 w-28 animate-pulse bg-[var(--rule-light)]/30" />
          </div>
          <div className="h-4 w-16 animate-pulse bg-[var(--rule-light)]/40" />
        </div>
      ))}
    </div>
  );
}
