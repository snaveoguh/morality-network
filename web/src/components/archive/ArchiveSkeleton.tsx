export function ArchiveSkeleton() {
  return (
    <div className="space-y-8">
      {Array.from({ length: 3 }).map((_, catIdx) => (
        <section key={catIdx}>
          <div className="mb-3 flex items-center gap-2 border-b border-[var(--rule-light)] pb-2">
            <div className="h-3 w-20 animate-pulse bg-[var(--rule-light)]" />
            <div className="h-2.5 w-12 animate-pulse bg-[var(--rule-light)]/40" />
          </div>
          <div className="space-y-2">
            {Array.from({ length: 4 + catIdx }).map((_, i) => (
              <div
                key={i}
                className="flex items-start gap-3 border-b border-[var(--rule-light)]/40 pb-2"
              >
                <div className="w-24 shrink-0 space-y-1">
                  <div className="h-2 w-16 animate-pulse bg-[var(--rule-light)]/40" />
                  <div className="h-2 w-12 animate-pulse bg-[var(--rule-light)]/30" />
                </div>
                <div className="flex-1 space-y-1">
                  <div
                    className="h-3 animate-pulse bg-[var(--rule-light)]/60"
                    style={{ width: `${60 + (i * 13) % 35}%` }}
                  />
                  <div className="h-2.5 w-3/4 animate-pulse bg-[var(--rule-light)]/30" />
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
