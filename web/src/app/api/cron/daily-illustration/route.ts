import { NextRequest, NextResponse } from "next/server";
import { computeEntityHash } from "@/lib/entity";
import { getArchivedEditorial, saveEditorial } from "@/lib/editorial-archive";
import { pickSourceImage } from "@/lib/image-generation";
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
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  try {
    const today = new Date().toISOString().slice(0, 10);
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
    if (editorial.hasIllustration) {
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

    // Gather candidate images from today's RSS articles
    const headline = editorial.primary?.title || "Daily Edition";
    console.log(`[cron/daily-illustration] Picking source image for "${headline.slice(0, 60)}..."`);

    // Build candidates from editorial's related sources first
    const candidates: { url: string; source: string; title: string }[] = [];

    // 1. Images from the editorial's own related sources
    if (editorial.relatedSources && Array.isArray(editorial.relatedSources)) {
      for (const src of editorial.relatedSources) {
        if (src.imageUrl) {
          candidates.push({
            url: src.imageUrl,
            source: src.source || src.sourceUrl || "unknown",
            title: src.title || headline,
          });
        }
      }
    }

    // 2. Primary article image
    if (editorial.primary?.imageUrl) {
      candidates.unshift({
        url: editorial.primary.imageUrl,
        source: editorial.primary.source || "primary",
        title: editorial.primary.title || headline,
      });
    }

    // 3. Fallback: fetch fresh RSS and grab top images
    if (candidates.length < 3) {
      try {
        const feeds = await fetchAllFeeds();
        const withImages = feeds
          .filter((item: { imageUrl?: string }) => item.imageUrl)
          .slice(0, 10);
        for (const item of withImages) {
          candidates.push({
            url: item.imageUrl!,
            source: item.source,
            title: item.title,
          });
        }
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

    // Pick the best image
    const illustration = await pickSourceImage(candidates);

    if (!illustration) {
      return NextResponse.json({
        status: "skipped",
        reason: "No suitable images could be downloaded",
        date: today,
        candidatesChecked: candidates.length,
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
    });
  } catch (err) {
    console.error("[cron/daily-illustration] Failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
