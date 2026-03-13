// ============================================================================
// ASYNC MASTHEAD — server component that fetches daily edition, then renders
//
// Wrapped in <Suspense fallback={<MastheadSkeleton />}> by the page.
// Streams into the page as soon as getDailyEdition() resolves.
// ============================================================================

import { Masthead } from "./Masthead";
import { getDailyEdition } from "@/lib/daily-edition";

/** Race a promise against a timeout — returns fallback on timeout */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export async function AsyncMasthead() {
  const dailyEdition = await withTimeout(
    getDailyEdition().catch(() => null),
    10000,
    null,
  );

  return (
    <Masthead
      dailyTitle={dailyEdition?.dailyTitle}
      dailyHeadline={dailyEdition?.headline}
      dailySubheadline={dailyEdition?.subheadline}
      dailyHash={dailyEdition?.hash}
    />
  );
}
