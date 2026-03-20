import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { getIllustration, saveIllustration } from "@/lib/illustration-store";
import { generateIllustration, buildIllustrationPrompt } from "@/lib/image-generation";
import { getArchivedEditorial, saveEditorial } from "@/lib/editorial-archive";
import { computeEntityHash } from "@/lib/entity";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min — DALL-E takes ~15s per image

/**
 * POST /api/editorial/backfill-illustrations
 *
 * Generates DALL-E illustrations for daily editions that don't have one.
 * Costs ~$0.08 per image (DALL-E 3 HD).
 * Requires CRON_SECRET bearer token.
 */
export async function POST(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;
  const results: Array<{ hash: string; title: string; status: string }> = [];

  // Check last 14 days of daily editions
  const dailyHashes: string[] = [];

  // Daily editions use hash = keccak256("pooter-daily-YYYY-MM-DD")
  // Check the last 14 days
  for (let i = 0; i < 14; i++) {
    const d = new Date(Date.now() - i * 86400000);
    const dateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    const hash = computeEntityHash(`pooter-daily-${dateStr}`);
    dailyHashes.push(hash);
  }

  for (const hash of dailyHashes) {
    // Check if editorial exists
    const editorial = await getArchivedEditorial(hash).catch(() => null);
    if (!editorial || !editorial.isDailyEdition) continue;

    // Check if illustration already exists
    const existing = await getIllustration(hash);
    if (existing) {
      results.push({ hash, title: editorial.dailyTitle ?? editorial.primary.title, status: "already-exists" });
      continue;
    }

    // Generate illustration
    const headline = editorial.primary.title;
    const dailyTitle = editorial.dailyTitle ?? "DAILY EDITION";

    try {
      console.log(`[backfill] Generating illustration for "${dailyTitle}" — ${headline.slice(0, 50)}...`);
      const illustration = await generateIllustration(headline, dailyTitle);

      if (illustration) {
        await saveIllustration(hash, {
          base64: illustration.base64,
          prompt: illustration.prompt,
          revisedPrompt: illustration.revisedPrompt,
        });

        // Mark editorial as having illustration
        if (!editorial.hasIllustration) {
          await saveEditorial(hash, { ...editorial, hasIllustration: true }, editorial.generatedBy);
        }

        results.push({ hash, title: dailyTitle, status: "generated" });
        console.log(`[backfill] ✓ Generated illustration for "${dailyTitle}"`);
      } else {
        results.push({ hash, title: dailyTitle, status: "generation-returned-null" });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      results.push({ hash, title: dailyTitle, status: `error: ${msg}` });
      console.error(`[backfill] ✗ Failed for "${dailyTitle}":`, msg);
    }
  }

  return NextResponse.json({
    results,
    generated: results.filter((r) => r.status === "generated").length,
    skipped: results.filter((r) => r.status === "already-exists").length,
    errors: results.filter((r) => r.status.startsWith("error")).length,
  });
}
