import type { Tally } from "@/lib/coops/economy";

// Cream chart panel, one ink, plain-language title stating the finding
// (pooter-brand: Charts).

export function BarPanel({
  title,
  rows,
  source,
  limit,
}: {
  title: string;
  rows: Tally[];
  source: string;
  limit?: number;
}) {
  const shown = limit ? rows.slice(0, limit) : rows;
  const max = Math.max(1, ...shown.map((r) => r.count));
  const rest = limit ? rows.slice(limit).reduce((sum, r) => sum + r.count, 0) : 0;
  return (
    <figure className="bg-[#f2ede2] p-4 text-[#0d0d0d] sm:p-5">
      <figcaption className="font-headline text-lg leading-snug">{title}</figcaption>
      <ul className="mt-4 space-y-2">
        {shown.map((row) => (
          <li key={row.label} className="grid grid-cols-[minmax(0,10rem)_1fr_2.5rem] sm:grid-cols-[minmax(0,12rem)_1fr_2.5rem] items-center gap-3 text-sm">
            <span className="truncate">{row.label}</span>
            <span className="h-3 bg-[#0d0d0d]/10" aria-hidden>
              <span className="block h-3 bg-[#0d0d0d]" style={{ width: `${(row.count / max) * 100}%` }} />
            </span>
            <span className="text-right font-mono text-xs tabular-nums">{row.count}</span>
          </li>
        ))}
      </ul>
      {rest > 0 && <p className="mt-3 text-xs text-[#0d0d0d]/70">Plus {rest} in other categories.</p>}
      <p className="mt-4 text-xs text-[#0d0d0d]/70">{source}</p>
    </figure>
  );
}
