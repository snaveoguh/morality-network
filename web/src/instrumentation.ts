// Runs once when the Next.js server starts (Node runtime only).
//
// Keeps the expensive crawls warm so no visitor waits for them: the news
// feed (86 RSS sources plus scrapers) and governance proposals are loaded at
// boot and refreshed every few minutes in the background, and the home page
// "Your day" brief is written from the fresh feed. The caches serve the last
// result instantly while refreshing (see lib/ttl-cache.ts and fetchAllFeeds
// in lib/rss.ts).

const WARM_INTERVAL_MS = 4 * 60 * 1000;

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // `next build` also loads this file; only warm a running server.
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.WARM_CACHES === "false") return;

  const { fetchAllFeeds } = await import("./lib/rss");
  const { fetchAllProposals } = await import("./lib/governance");
  const { getDayBrief } = await import("./lib/day-brief");

  const warm = () => {
    fetchAllProposals().catch((error) => console.warn("[warm] proposals failed:", error));
    fetchAllFeeds()
      .then(() => getDayBrief("all"))
      .catch((error) => console.warn("[warm] feed or day brief failed:", error));
  };

  warm();
  setInterval(warm, WARM_INTERVAL_MS).unref();
}
