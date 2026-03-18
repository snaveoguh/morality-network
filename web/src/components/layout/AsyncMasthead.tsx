// ============================================================================
// ASYNC MASTHEAD — server component that renders the daily edition masthead
//
// CACHE-ONLY: never generates AI content. Daily editions are pre-generated
// by the newsroom cron. If no cached edition exists, shows default masthead.
// ============================================================================

import { Masthead } from "./Masthead";
import { getDailyEditionHash } from "@/lib/daily-edition";
import { getArchivedEditorial } from "@/lib/editorial-archive";

export async function AsyncMasthead() {
  // Cache-only lookup — no AI generation on page load
  const hash = getDailyEditionHash();
  let dailyEdition: {
    hash: string;
    dailyTitle: string;
    headline: string;
    subheadline: string;
    generatedAt: string;
  } | null = null;

  try {
    const cached = await getArchivedEditorial(hash);
    if (cached?.isDailyEdition) {
      dailyEdition = {
        hash,
        dailyTitle: cached.dailyTitle ?? "DAILY EDITION",
        headline: cached.primary.title,
        subheadline: cached.subheadline,
        generatedAt: cached.generatedAt,
      };
    }
  } catch {
    // Cache miss — show default masthead
  }

  return (
    <Masthead
      dailyTitle={dailyEdition?.dailyTitle}
      dailyHeadline={dailyEdition?.headline}
      dailySubheadline={dailyEdition?.subheadline}
      dailyHash={dailyEdition?.hash}
    />
  );
}
