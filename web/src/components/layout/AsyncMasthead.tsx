// ============================================================================
// ASYNC MASTHEAD — server component that renders the daily edition masthead
//
// CACHE-ONLY: never generates AI content. Daily editions are pre-generated
// by the newsroom cron. If no daily edition exists, falls back to the most
// recent Pooter Original so the masthead is never empty.
//
// The lead is never a crypto or market story (lib/front-filter.ts) while a
// politics or news original is available; one is used only as a last resort.
// ============================================================================

import { Masthead } from "./Masthead";
import { getDailyEditionHash } from "@/lib/daily-edition";
import { getArchivedEditorial, getRecentPooterOriginals, type PooterOriginal } from "@/lib/editorial-archive";
import { isFrontStory } from "@/lib/front-filter";

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

function originalToEdition(o: PooterOriginal, dailyTitle: string): MastheadEdition {
  return {
    hash: o.hash,
    dailyTitle: o.dailyTitle ?? dailyTitle,
    headline: o.title,
    subheadline: o.subheadline,
    generatedAt: o.generatedAt,
    ...pickImage(
      o.isDailyEdition && o.hasIllustration ? editionIllustrationUrl(o.generatedAt) : null,
      o.imageUrl,
      o.source,
    ),
  };
}

async function resolveMasthead(): Promise<MastheadEdition | null> {
  // A crypto or market lead, held back in case nothing else turns up.
  let marketLead: MastheadEdition | null = null;

  // 1. Try today's daily edition (3s cap — don't block the page)
  try {
    const hash = getDailyEditionHash();
    const cached = await withTimeout(getArchivedEditorial(hash), 3000);
    if (cached?.isDailyEdition) {
      const edition: MastheadEdition = {
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
      if (isFrontStory({ title: edition.headline, category: cached.primary.category })) return edition;
      marketLead = edition;
    }
  } catch {
    // Cache miss
  }

  // 2. Fallback: most recent front-eligible Pooter Original within 7 days (2s cap)
  try {
    const originals = await withTimeout(getRecentPooterOriginals(false), 2000);
    const best = originals?.find(isFrontStory);
    if (best) return originalToEdition(best, "POOTER ORIGINAL");
    if (!marketLead && originals?.[0]) marketLead = originalToEdition(originals[0], "POOTER ORIGINAL");
  } catch {
    // No originals available
  }

  // 3. Any-age Pooter Original — masthead must NEVER be empty. A
  // front-eligible one from the archive beats a crypto or market lead; the
  // market lead is used only if the archive has nothing else.
  // Give 3s — inner indexer fetch has its own 2s cap, so local JSON always
  // has headroom to complete.
  try {
    const anyAge = await withTimeout(getRecentPooterOriginals(false, 30, true), 3000);
    const front = anyAge?.find(isFrontStory);
    if (front) return originalToEdition(front, "FROM THE ARCHIVE");
    if (marketLead) return marketLead;
    if (anyAge?.[0]) return originalToEdition(anyAge[0], "FROM THE ARCHIVE");
  } catch {
    // Archive unavailable — Masthead will show brand fallback
  }

  return marketLead;
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
