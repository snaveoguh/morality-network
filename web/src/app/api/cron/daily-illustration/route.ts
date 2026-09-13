import { NextRequest, NextResponse } from "next/server";
import { computeEntityHash } from "@/lib/entity";
import { getArchivedEditorial, saveEditorial } from "@/lib/editorial-archive";
import { pickSourceImage } from "@/lib/image-generation";
import { feedItemToCandidate, rankCoverCandidates, type CoverCandidate } from "@/lib/cover-image-rank";
import { getIllustration, saveIllustration } from "@/lib/illustration-store";
import { verifyCronAuth } from "@/lib/cron-auth";
import { fetchAllFeeds } from "@/lib/rss";

export const dynamic = "force-dynamic";
export const maxDuration = 55;

/**
 * GET /api/cron/daily-illustration — pick today's cover image from sources
 *
 * Runs AFTER the daily edition cron. Finds the best editorial image from
 * today's RSS sources — real journalism photography, not AI-generated.
 * Images are served grayscale via CSS to match the newspaper aesthetic.
 *
 * Auth: Requires CRON_SECRET Bearer token.
 * Query: ?date=YYYY-MM-DD (target another edition), ?force=1 (re-pick).
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  try {
    // ?date=YYYY-MM-DD re-targets an edition; ?force=1 re-picks even when a
    // cover already exists (used to replace a wrong or stale cover).
    const url = new URL(request.url);
    const dateParam = url.searchParams.get("date");
    const force = url.searchParams.get("force") === "1";
    const today = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
      ? dateParam
      : new Date().toISOString().slice(0, 10);
    const dailyId = `pooter-daily-${today}`;
    const hash = computeEntityHash(dailyId);

    // Load today's editorial
    const editorial = await getArchivedEditorial(hash).catch(() => null);
    if (!editorial?.isDailyEdition) {
      return NextResponse.json({
        status: "skipped",
        reason: "No daily edition found for today",
        date: today,
      });
    }

    // Check if illustration already exists
    if (editorial.hasIllustration && !force) {
      const existing = await getIllustration(hash).catch(() => null);
      if (existing?.base64) {
        return NextResponse.json({
          status: "cached",
          date: today,
          hash,
          size: `${Math.round(existing.base64.length / 1024)}KB`,
        });
      }
      if (editorial.illustrationBase64) {
        return NextResponse.json({
          status: "cached",
          date: today,
          hash,
          size: `${Math.round(editorial.illustrationBase64.length / 1024)}KB`,
          source: "inline",
        });
      }
    }

    // Gather candidate images, then rank by relevance to the story.
    const headline = editorial.primary?.title || "Daily Edition";
    console.log(`[cron/daily-illustration] Picking source image for "${headline.slice(0, 60)}..."`);

    const candidates: CoverCandidate[] = [];
    const seen = new Set<string>();
    const push = (c: CoverCandidate | null) => {
      if (!c || seen.has(c.url)) return;
      seen.add(c.url);
      candidates.push(c);
    };

    // 1. The stories the edition was written from (sourceRefs), then any
    //    related sources — these are the only story-relevant images we have.
    for (const item of editorial.sourceRefs ?? []) push(feedItemToCandidate(item, true));
    for (const item of editorial.relatedSources ?? []) push(feedItemToCandidate(item, true));
    if (editorial.primary?.imageUrl) push(feedItemToCandidate(editorial.primary, true));

    // 2. Fallback: the live feed, ranked the same way (never just "newest").
    if (candidates.filter((c) => c.fromEdition).length < 3) {
      try {
        const feeds = await fetchAllFeeds();
        for (const item of feeds.slice(0, 120)) push(feedItemToCandidate(item, false));
      } catch (err) {
        console.warn("[cron/daily-illustration] RSS fallback failed:", err);
      }
    }

    if (!candidates.length) {
      return NextResponse.json({
        status: "skipped",
        reason: "No source images available",
        date: today,
      });
    }

    const ranked = rankCoverCandidates(candidates, {
      headline,
      subheadline: editorial.subheadline,
      tags: editorial.primary?.tags ?? [],
      body: editorial.editorialBody,
    });
    console.log(
      `[cron/daily-illustration] ${ranked.length} candidates; top: ` +
        ranked.slice(0, 3).map((r) => `${r.source} "${r.title.slice(0, 40)}" (${r.score.toFixed(1)}: ${r.why.join(", ")})`).join(" | "),
    );

    // Pick the best image
    const illustration = await pickSourceImage(ranked);

    if (!illustration) {
      return NextResponse.json({
        status: "skipped",
        reason: "No suitable images could be downloaded",
        date: today,
        candidatesChecked: ranked.length,
      });
    }

    const sizeKB = Math.round(illustration.base64.length / 1024);
    console.log(`[cron/daily-illustration] Picked source image (${sizeKB}KB)`);

    // Save to illustration store
    const storePersisted = await saveIllustration(hash, {
      base64: illustration.base64,
      prompt: illustration.prompt,
      revisedPrompt: illustration.revisedPrompt,
    });

    // Save inline on editorial as fallback
    editorial.hasIllustration = true;
    editorial.illustrationBase64 = illustration.base64;
    try {
      await saveEditorial(hash, editorial, editorial.generatedBy || "claude-ai");
    } catch (err) {
      console.warn("[cron/daily-illustration] Failed to re-save editorial:", err instanceof Error ? err.message : err);
    }

    return NextResponse.json({
      status: "picked",
      date: today,
      hash,
      size: `${sizeKB}KB`,
      storePersisted,
      imageSource: illustration.prompt,
      originalUrl: illustration.revisedPrompt,
      topCandidates: ranked.slice(0, 3).map((r) => ({ source: r.source, title: r.title, score: r.score, why: r.why })),
    });
  } catch (err) {
    console.error("[cron/daily-illustration] Failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
