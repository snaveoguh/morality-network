export function RelatedSkeleton() {
  return (
    <aside className="space-y-3">
      <div className="mb-2 h-3 w-28 animate-pulse bg-[var(--rule-light)]" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="border-b border-[var(--rule-light)]/40 pb-3"
        >
          <div className="mb-1 h-2 w-16 animate-pulse bg-[var(--rule-light)]/40" />
          <div className="mb-1 h-3 w-full animate-pulse bg-[var(--rule-light)]/60" />
          <div className="h-3 w-3/4 animate-pulse bg-[var(--rule-light)]/60" />
        </div>
      ))}
    </aside>
  );
}
