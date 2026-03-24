import { NextRequest, NextResponse } from "next/server";
import { computeEntityHash } from "@/lib/entity";
import { getArchivedEditorial, saveEditorial } from "@/lib/editorial-archive";
import { generateIllustration } from "@/lib/image-generation";
import { getIllustration, saveIllustration } from "@/lib/illustration-store";
import { verifyCronAuth } from "@/lib/cron-auth";
import { isImageVaultEnabled, mintImage } from "@/lib/server/image-vault";

export const dynamic = "force-dynamic";
export const maxDuration = 55;

/** PooterEditions epoch: March 11 2026 00:00 UTC */
const EDITIONS_EPOCH = 1741651200;
const SECONDS_PER_DAY = 86400;

/** Compute today's edition number (matches PooterEditions.currentEditionNumber) */
function computeEditionNumber(): number {
  const now = Math.floor(Date.now() / 1000);
  if (now < EDITIONS_EPOCH) return 0;
  return Math.floor((now - EDITIONS_EPOCH) / SECONDS_PER_DAY) + 1;
}

/**
 * GET /api/cron/daily-illustration — generate today's cover illustration
 *
 * Runs AFTER the daily edition cron. Checks if today's daily edition exists
 * and doesn't have an illustration yet. If so, generates one via DALL-E 3.
 *
 * Separate from daily-edition generation because DALL-E takes 10-30s and
 * the editorial writer+extractor already use most of Vercel's 55s limit.
 *
 * Storage strategy (layered, most durable first):
 *   1. IPFS + PooterImageVault on-chain (permanent, if PINATA_JWT configured)
 *   2. Upstash Redis via illustration-store (30-day TTL)
 *   3. Inline base64 on the editorial record (fallback)
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

    // ── IPFS + On-chain mint (if configured) ──────────────────────────
    // This is the primary storage path — permanent, content-addressed.
    // Falls through to Redis/inline if not configured.
    let ipfsCID: string | null = null;
    let mintTokenId: string | null = null;
    let mintTxHash: string | null = null;

    if (isImageVaultEnabled()) {
      const editionNumber = computeEditionNumber();
      try {
        const mintResult = await mintImage(
          illustration.base64,
          `pooter-edition-${editionNumber}-${today}`,
          editionNumber > 0 ? editionNumber : undefined,
        );
        ipfsCID = mintResult.cid;
        mintTokenId = mintResult.tokenId.toString();
        mintTxHash = mintResult.txHash;
        console.log(
          `[cron/daily-illustration] IPFS+mint success: cid=${ipfsCID}, tokenId=${mintTokenId}`,
        );
      } catch (err) {
        // Non-fatal — fall through to Redis/inline storage
        console.warn(
          "[cron/daily-illustration] IPFS+mint failed (falling back to Redis):",
          err instanceof Error ? err.message : err,
        );
      }
    }

    // ── Redis + local file storage (existing fallback) ────────────────
    const storePersisted = await saveIllustration(hash, {
      base64: illustration.base64,
      prompt: illustration.prompt,
      revisedPrompt: illustration.revisedPrompt,
    });

    // ── Inline fallback on editorial ──────────────────────────────────
    editorial.hasIllustration = true;
    editorial.illustrationBase64 = illustration.base64;
    // Store IPFS CID on editorial if available (tiny string vs 1MB base64)
    if (ipfsCID) {
      (editorial as Record<string, unknown>).illustrationIPFS = `ipfs://${ipfsCID}`;
    }
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
      // IPFS fields (null if not configured)
      ipfsCID,
      mintTokenId,
      mintTxHash,
    });
  } catch (err) {
    console.error("[cron/daily-illustration] Failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
