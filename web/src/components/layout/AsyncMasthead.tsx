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

type MastheadEdition = {
  hash: string;
  dailyTitle: string;
  headline: string;
  subheadline: string;
  generatedAt: string;
};

/** Race a promise against a timeout — returns null on timeout */
function withTimeout<T>(promise: Promise<T | null>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

async function resolveMasthead(): Promise<MastheadEdition | null> {
  // 1. Try today's daily edition (3s cap — don't block the page)
  try {
    const hash = getDailyEditionHash();
    const cached = await withTimeout(getArchivedEditorial(hash), 3000);
    if (cached?.isDailyEdition) {
      return {
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

  // 2. Fallback: most recent Pooter Original within 7 days (2s cap)
  try {
    const originals = await withTimeout(getRecentPooterOriginals(false), 2000);
    const best = originals?.[0];
    if (best) {
      return {
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

  // 3. Last resort: any-age Pooter Original (1s cap — local JSON only at this point)
  try {
    const anyAge = await withTimeout(getRecentPooterOriginals(false, 1, true), 1000);
    const pick = anyAge?.[0];
    if (pick) {
      return {
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

  return null;
}

export async function AsyncMasthead() {
  // Hard 4s ceiling — if the entire resolution chain hangs, show brand fallback
  const dailyEdition = await withTimeout(resolveMasthead(), 4000);

  return (
    <Masthead
      dailyTitle={dailyEdition?.dailyTitle}
      dailyHeadline={dailyEdition?.headline}
      dailySubheadline={dailyEdition?.subheadline}
      dailyHash={dailyEdition?.hash}
    />
  );
}
