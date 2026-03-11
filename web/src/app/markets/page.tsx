import { AgentMarketDashboard } from "@/components/markets/AgentMarketDashboard";
import { withBrand } from "@/lib/brand";

export const metadata = {
  title: withBrand("Agent Markets"),
  description:
    "Live agent trading telemetry, PnL, balances, and public funding flow.",
};

export default function MarketsPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <AgentMarketDashboard />
    </main>
  );
}
