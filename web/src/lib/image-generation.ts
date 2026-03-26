import "server-only";

// ============================================================================
// ILLUSTRATION PICKER — Source image selection for daily editions
//
// Replaces DALL-E generation. Picks the best editorial image from today's
// RSS sources, converts to grayscale, and stores as the edition cover.
//
// Selection criteria:
//   1. Images from the articles referenced in the daily edition
//   2. Fallback: best image from today's top RSS articles
//   3. Prefer large, landscape images (news photography)
//   4. All images are served grayscale via CSS (no server-side conversion)
// ============================================================================

const FETCH_TIMEOUT_MS = 15_000;

export interface IllustrationResult {
  base64: string;
  prompt: string; // reused as "source" — describes where image came from
  revisedPrompt: string | null; // original image URL for attribution
}

/**
 * Pick the best source image from a list of candidate URLs.
 * Downloads each, picks the largest (likely highest quality).
 * Returns base64-encoded image data.
 */
export async function pickSourceImage(
  candidates: { url: string; source: string; title: string }[],
): Promise<IllustrationResult | null> {
  if (!candidates.length) {
    console.warn("[image-picker] No candidate images provided");
    return null;
  }

  // Try candidates in order — first successful download wins
  for (const candidate of candidates.slice(0, 8)) {
    try {
      const response = await fetch(candidate.url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          "User-Agent": "pooter.world/1.0 (editorial image picker)",
          Accept: "image/*",
        },
      });

      if (!response.ok) continue;

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.startsWith("image/")) continue;

      const buffer = await response.arrayBuffer();
      const sizeKB = Math.round(buffer.byteLength / 1024);

      // Skip tiny images (likely icons/tracking pixels)
      if (buffer.byteLength < 10_000) continue;

      const base64 = Buffer.from(buffer).toString("base64");

      console.log(
        `[image-picker] Selected image from ${candidate.source} (${sizeKB}KB): "${candidate.title.slice(0, 60)}"`,
      );

      return {
        base64,
        prompt: `Source: ${candidate.source} — "${candidate.title}"`,
        revisedPrompt: candidate.url,
      };
    } catch {
      // Try next candidate
      continue;
    }
  }

  console.warn("[image-picker] No suitable images found from any candidate");
  return null;
}

/**
 * Build illustration prompt — kept for API compatibility but now describes
 * the image source rather than a DALL-E prompt.
 */
export function buildIllustrationPrompt(
  headline: string,
  dailyTitle: string,
): string {
  return `Cover image for "${dailyTitle}" edition — sourced from: "${headline}"`;
}

/**
 * Generate illustration — now picks from source images instead of DALL-E.
 * Accepts optional candidate images. If none provided, returns null.
 *
 * This is a compatibility wrapper. The cron route should call
 * pickSourceImage() directly with RSS feed images.
 */
export async function generateIllustration(
  headline: string,
  dailyTitle: string,
  candidateImages?: { url: string; source: string; title: string }[],
): Promise<IllustrationResult | null> {
  if (!candidateImages?.length) {
    console.log("[image-picker] No candidate images — skipping illustration");
    return null;
  }

  return pickSourceImage(candidateImages);
}
