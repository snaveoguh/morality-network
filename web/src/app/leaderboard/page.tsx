import { redirect } from "next/navigation";

// The leaderboard moved to /registry.
export default function LeaderboardPage() {
  redirect("/registry");
}
