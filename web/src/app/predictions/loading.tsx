export default function PredictionsLoading() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 border-b-2 border-[var(--rule)] pb-4">
        <div className="h-7 w-48 animate-pulse bg-[var(--rule-light)]" />
        <div className="mt-2 h-4 w-80 animate-pulse bg-[var(--rule-light)]" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border-2 border-[var(--rule-light)] p-4">
            <div className="mb-2 h-3 w-24 animate-pulse bg-[var(--rule-light)]" />
            <div className="mb-3 h-5 w-full animate-pulse bg-[var(--rule-light)]" />
            <div className="mb-2 h-6 w-full animate-pulse bg-[var(--rule-light)]" />
            <div className="h-3 w-32 animate-pulse bg-[var(--rule-light)]" />
          </div>
        ))}
      </div>
    </main>
  );
}
