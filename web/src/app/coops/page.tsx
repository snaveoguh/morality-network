import Link from "next/link";
import { withBrand } from "@/lib/brand";
import { economyStats, getSnapshot, listAreas } from "@/lib/coops/economy";

export const metadata = {
  title: withBrand("Co-op tracker"),
  description: "Public tracker of co-operatives by area: what is already registered, and how each new co-op is doing.",
};

export default function CoopsIndexPage() {
  const areas = listAreas().map((area) => {
    const snapshot = getSnapshot(area.slug);
    return { area, active: snapshot ? economyStats(snapshot, area).active.length : 0 };
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-10">
      <h1 className="font-headline text-4xl text-[var(--ink)] sm:text-5xl">Co-op tracker</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-[var(--ink-light)]">
        A public record of the co-operative economy in each area: every registered society, and how each new co-op is
        doing as it starts up. Built by{" "}
        <Link href="/coop" className="text-[var(--ink)] underline">Morality Co-operative</Link>. The data is open to
        download.
      </p>

      <ul className="mt-8 divide-y divide-[var(--rule-light)] border-y border-[var(--rule-light)]">
        {areas.map(({ area, active }) => (
          <li key={area.slug}>
            <Link href={`/coops/${area.slug}`} className="flex items-baseline justify-between gap-4 py-4 hover:bg-[var(--paper-dark)]">
              <span>
                <span className="block font-headline text-2xl text-[var(--ink)]">{area.name}</span>
                <span className="block text-sm text-[var(--ink-light)]">{area.authority}</span>
              </span>
              <span className="shrink-0 text-sm text-[var(--ink-faint)]">{active} societies</span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-8 bg-[#f2ede2] p-5 text-[#0d0d0d]">
        <p className="font-headline text-xl">Starting a co-op?</p>
        <p className="mt-1 text-[15px]">Get a plan for your kind of co-op and join the tracker.</p>
        <Link href="/coops/start" className="mt-3 inline-block bg-[#0d0d0d] px-4 py-2 text-sm font-medium text-[#f2ede2]">
          Start a co-op
        </Link>
      </div>
    </div>
  );
}
