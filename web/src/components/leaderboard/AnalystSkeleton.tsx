export function AnalystSkeleton({ lines = 5 }: { lines?: number }) {
  return (
    <div className="mb-6 border border-[var(--rule-light)] p-4">
      <div className="mb-2 h-3 w-28 animate-pulse bg-[var(--rule-light)]" />
      <div className="mb-3 h-2 w-44 animate-pulse bg-[var(--rule-light)]/40" />
      <div className="space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className="grid grid-cols-[28px_1fr_auto] items-center gap-3 border-b border-[var(--rule-light)]/40 pb-2 last:border-0"
          >
            <div className="h-3 w-3 animate-pulse bg-[var(--rule-light)]/30" />
            <div className="space-y-1">
              <div
                className="h-2.5 animate-pulse bg-[var(--rule-light)]/50"
                style={{ width: `${50 + (i * 11) % 40}%` }}
              />
              <div className="h-2 w-32 animate-pulse bg-[var(--rule-light)]/30" />
            </div>
            <div className="h-5 w-8 animate-pulse bg-[var(--rule-light)]/40" />
          </div>
        ))}
      </div>
    </div>
  );
}
