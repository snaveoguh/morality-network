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
  imageUrl: string | null;
  imageCaption: string | null;
};

/** Edition illustration if there is one, else the source story's photo. */
function pickImage(illustration: string | null, photo: string | undefined, source: string | undefined) {
  if (illustration) return { imageUrl: illustration, imageCaption: "Illustration for today’s edition" };
  if (photo) return { imageUrl: photo, imageCaption: source ? `Photo: ${source}` : null };
  return { imageUrl: null, imageCaption: null };
}

// Edition illustrations are served by token id: days since 11 Mar 2025 + 1
// (same epoch as /api/edition/[tokenId]/illustration and the article page).
const EDITION_EPOCH_MS = 1741651200 * 1000;

function editionIllustrationUrl(generatedAt: string | undefined): string | null {
  const ts = generatedAt ? new Date(generatedAt).getTime() : Date.now();
  if (!Number.isFinite(ts)) return null;
  const days = Math.floor((ts - EDITION_EPOCH_MS) / 86400000);
  return days >= 0 ? `/api/edition/${days + 1}/illustration` : null;
}

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
        ...pickImage(
          cached.hasIllustration ? editionIllustrationUrl(cached.generatedAt) : null,
          cached.primary.imageUrl,
          cached.primary.source,
        ),
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
        ...pickImage(
          best.isDailyEdition && best.hasIllustration ? editionIllustrationUrl(best.generatedAt) : null,
          best.imageUrl,
          best.source,
        ),
      };
    }
  } catch {
    // No originals available
  }

  // 3. Last resort: any-age Pooter Original — masthead must NEVER be empty
  // Give 3s — inner indexer fetch has its own 2s cap, so local JSON always
  // has headroom to complete.
  try {
    const anyAge = await withTimeout(getRecentPooterOriginals(false, 1, true), 3000);
    const pick = anyAge?.[0];
    if (pick) {
      return {
        hash: pick.hash,
        dailyTitle: pick.dailyTitle ?? "FROM THE ARCHIVE",
        headline: pick.title,
        subheadline: pick.subheadline,
        generatedAt: pick.generatedAt,
        ...pickImage(
          pick.isDailyEdition && pick.hasIllustration ? editionIllustrationUrl(pick.generatedAt) : null,
          pick.imageUrl,
          pick.source,
        ),
      };
    }
  } catch {
    // Archive unavailable — Masthead will show brand fallback
  }

  return null;
}

export async function AsyncMasthead() {
  // Hard 8s ceiling — each tier has internal timeouts so this is a safety net
  const dailyEdition = await withTimeout(resolveMasthead(), 8000);

  return (
    <Masthead
      dailyTitle={dailyEdition?.dailyTitle}
      dailyHeadline={dailyEdition?.headline}
      dailySubheadline={dailyEdition?.subheadline}
      dailyHash={dailyEdition?.hash}
      imageUrl={dailyEdition?.imageUrl}
      imageCaption={dailyEdition?.imageCaption}
    />
  );
}
