export function ArticleSkeleton() {
  return (
    <section className="mx-auto max-w-4xl py-10">
      {/* Category + source */}
      <div className="mb-3 flex gap-2">
        <div className="h-2.5 w-16 animate-pulse bg-[var(--rule-light)]" />
        <div className="h-2.5 w-1 bg-[var(--rule-light)]/40" />
        <div className="h-2.5 w-24 animate-pulse bg-[var(--rule-light)]/60" />
      </div>

      {/* Headline */}
      <div className="border-b-2 border-[var(--rule)] pb-6">
        <div className="mb-2 h-8 w-11/12 animate-pulse bg-[var(--rule-light)]" />
        <div className="mb-4 h-8 w-3/4 animate-pulse bg-[var(--rule-light)]" />

        {/* Subheadline */}
        <div className="mb-4 h-4 w-5/6 animate-pulse bg-[var(--rule-light)]/60" />

        {/* Dateline + read time */}
        <div className="flex gap-4">
          <div className="h-2.5 w-32 animate-pulse bg-[var(--rule-light)]/40" />
          <div className="h-2.5 w-20 animate-pulse bg-[var(--rule-light)]/40" />
        </div>
      </div>

      {/* Editorial body paragraphs */}
      <div className="mt-6 space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <div className="h-3 w-full animate-pulse bg-[var(--rule-light)]/40" />
            <div
              className="h-3 animate-pulse bg-[var(--rule-light)]/40"
              style={{ width: `${90 - i * 5}%` }}
            />
            <div
              className="h-3 animate-pulse bg-[var(--rule-light)]/40"
              style={{ width: `${80 - i * 3}%` }}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
