import { NextRequest, NextResponse } from "next/server";
import { computeEntityHash } from "@/lib/entity";
import { getArchivedEditorial, saveEditorial } from "@/lib/editorial-archive";
import { generateIllustration } from "@/lib/image-generation";
import { getIllustration, saveIllustration } from "@/lib/illustration-store";
import { verifyCronAuth } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 55;

/**
 * GET /api/cron/daily-illustration — generate today's cover illustration
 *
 * Runs AFTER the daily edition cron. Checks if today's daily edition exists
 * and doesn't have an illustration yet. If so, generates one via DALL-E 3.
 *
 * Separate from daily-edition generation because DALL-E takes 10-30s and
 * the editorial writer+extractor already use most of Vercel's 55s limit.
 *
 * Storage strategy: illustration-store (Redis + local file) is primary,
 * but as a fallback also stores base64 inline on the editorial itself.
 * The illustration endpoint checks both locations.
 *
 * Auth: Requires CRON_SECRET Bearer token (sent automatically by Vercel cron).
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;
  try {
    // Compute today's daily edition hash
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

    // Check if illustration already exists in store
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
      // Also check inline on editorial
      if (editorial.illustrationBase64) {
        return NextResponse.json({
          status: "cached",
          date: today,
          hash,
          size: `${Math.round(editorial.illustrationBase64.length / 1024)}KB`,
          source: "inline",
        });
      }
      // hasIllustration is true but no data anywhere — regenerate
      console.warn("[cron/daily-illustration] hasIllustration=true but no data found — regenerating");
    }

    // Get headline + daily title for the prompt
    const headline = editorial.primary?.title || "Daily Edition";
    const dailyTitle = editorial.dailyTitle || "DAILY EDITION";

    console.log(`[cron/daily-illustration] Generating cover art for "${headline.slice(0, 60)}..."`);

    // Generate illustration via DALL-E 3
    const illustration = await generateIllustration(headline, dailyTitle);

    if (!illustration) {
      return NextResponse.json({
        status: "skipped",
        reason: "DALL-E generation failed or OPENAI_API_KEY not configured",
        date: today,
      });
    }

    const sizeKB = Math.round(illustration.base64.length / 1024);
    console.log(`[cron/daily-illustration] Generated (${sizeKB}KB)`);

    // Save illustration to store (Redis + local file)
    const storePersisted = await saveIllustration(hash, {
      base64: illustration.base64,
      prompt: illustration.prompt,
      revisedPrompt: illustration.revisedPrompt,
    });

    // FALLBACK: also save base64 inline on the editorial itself
    // This ensures the illustration endpoint can always find it,
    // even if Redis is unavailable and Vercel FS is read-only.
    editorial.hasIllustration = true;
    editorial.illustrationBase64 = illustration.base64;
    try {
      await saveEditorial(hash, editorial, editorial.generatedBy || "claude-ai");
      console.log("[cron/daily-illustration] Saved illustration inline on editorial (fallback)");
    } catch (err) {
      console.warn("[cron/daily-illustration] Failed to re-save editorial:", err instanceof Error ? err.message : err);
    }

    return NextResponse.json({
      status: "generated",
      date: today,
      hash,
      size: `${sizeKB}KB`,
      storePersisted,
      revisedPrompt: illustration.revisedPrompt?.slice(0, 200),
    });
  } catch (err) {
    console.error("[cron/daily-illustration] Failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
