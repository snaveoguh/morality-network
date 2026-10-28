import Link from "next/link";
import { isChartId, type ChartId } from "@/lib/charts/queries";
import { AsyncChart } from "./AsyncChart";

// One chart on the front page, off by default. Turn on with
// HOME_CHART_ENABLED=true; pick which with HOME_CHART_ID (a /data chart id,
// default "feed-bias").

const DEFAULT_HOME_CHART: ChartId = "feed-bias";

export function homeChartId(): ChartId | null {
  if (process.env.HOME_CHART_ENABLED !== "true") return null;
  const id = process.env.HOME_CHART_ID?.trim();
  return id && isChartId(id) ? id : DEFAULT_HOME_CHART;
}

export async function HomeChartSlot({ id }: { id: ChartId }) {
  return (
    <section className="mx-auto mt-4 max-w-2xl px-3 sm:px-0">
      <AsyncChart id={id} />
      <Link
        href={`/data#${id}`}
        className="mt-1 block text-right font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-faint)] hover:text-[var(--ink)]"
      >
        More charts &rarr;
      </Link>
    </section>
  );
}
