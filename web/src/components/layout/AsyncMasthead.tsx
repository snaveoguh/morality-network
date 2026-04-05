// ============================================================================
// ASYNC MASTHEAD — server component that renders the daily edition masthead
//
// CACHE-ONLY: never generates AI content. Daily editions are pre-generated
// by the newsroom cron. If no daily edition exists, falls back to the most
// recent Pooter Original so the masthead is never empty.
// ============================================================================

import { Masthead } from "./Masthead";
import { getDailyEditionHash } from "@/lib/daily-edition";
import { getArchivedEditorial, getRecentPooterOriginals } from "@/lib/editorial-archive";

export async function AsyncMasthead() {
  let dailyEdition: {
    hash: string;
    dailyTitle: string;
    headline: string;
    subheadline: string;
    generatedAt: string;
  } | null = null;

  // 1. Try today's daily edition
  try {
    const hash = getDailyEditionHash();
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
    // Cache miss
  }

  // 2. Fallback: most recent Pooter Original (7-day window)
  if (!dailyEdition) {
    try {
      const originals = await getRecentPooterOriginals(false);
      const best = originals[0];
      if (best) {
        dailyEdition = {
          hash: best.hash,
          dailyTitle: best.dailyTitle ?? "POOTER ORIGINAL",
          headline: best.title,
          subheadline: best.subheadline,
          generatedAt: best.generatedAt,
        };
      }
    } catch {
      // No originals available
    }
  }

  // 3. Last resort: any-age Pooter Original — masthead should never be empty
  if (!dailyEdition) {
    try {
      const anyAge = await getRecentPooterOriginals(false, 1, true);
      const pick = anyAge[0];
      if (pick) {
        dailyEdition = {
          hash: pick.hash,
          dailyTitle: pick.dailyTitle ?? "FROM THE ARCHIVE",
          headline: pick.title,
          subheadline: pick.subheadline,
          generatedAt: pick.generatedAt,
        };
      }
    } catch {
      // Archive unavailable — Masthead will show brand fallback
    }
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
