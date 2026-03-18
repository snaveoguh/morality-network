import { getAggregatedMarketSignals } from "@/lib/trading/signals";
import { SignalDashboard } from "@/components/trading/SignalDashboard";

export async function AsyncSignalDashboard() {
  const signals = await getAggregatedMarketSignals({
    limit: 250,
    minAbsScore: 0.1,
  });

  return <SignalDashboard signals={signals} />;
}
