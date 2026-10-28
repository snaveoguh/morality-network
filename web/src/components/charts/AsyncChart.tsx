import { CHARTS, type ChartId } from "@/lib/charts/queries";
import { NewsChart } from "./NewsChart";

// Async server wrapper: runs one cached chart query and renders it, or
// nothing when its data is unavailable. Wrap in <Suspense> so a slow feed
// read never holds up the rest of the page.

export async function AsyncChart({ id }: { id: ChartId }) {
  const chart = await CHARTS[id]();
  if (!chart) return null;
  return <NewsChart chart={chart} />;
}

export function ChartSkeleton() {
  return (
    <div
      aria-hidden
      className="mx-auto h-72 w-full max-w-2xl animate-pulse border-t-2"
      style={{ background: "#f5f0e4", borderColor: "#0d0d0d" }}
    />
  );
}
