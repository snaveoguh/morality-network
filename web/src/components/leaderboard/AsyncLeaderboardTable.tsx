import { LeaderboardTable } from "@/components/leaderboard/LeaderboardTable";
import { buildUniversalLedger } from "@/lib/universal-ledger";

export async function AsyncLeaderboardTable() {
  const entries = await buildUniversalLedger();
  return <LeaderboardTable entries={entries} />;
}
