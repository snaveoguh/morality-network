import "server-only";

import { getDayBrief } from "@/lib/day-brief";
import { DayBrief } from "./DayBrief";

// Server half of "Your day": renders the default brief into the HTML. The
// brief is cached and kept warm (instrumentation.ts), so this is normally
// instant; on a cold boot it gets a short budget and the section is skipped
// rather than holding the page.

const BRIEF_TIMEOUT_MS = 15_000;

export async function AsyncDayBrief() {
  const brief = await Promise.race([
    getDayBrief("all").catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), BRIEF_TIMEOUT_MS)),
  ]);
  if (!brief) return null;
  return <DayBrief initial={brief} />;
}
