import "server-only";

// ============================================================================
// ILLUSTRATION GENERATION — DALL-E 3 edition cover art
//
// Generates one hero image per daily edition. This is the primary NFT artwork
// — the thing people see on OpenSea, in the modal, on social shares.
//
// Style: dystopian black & white cinematic photograph. Epic, haunting,
// editorial. Think Sebastião Salgado meets Blade Runner meets AP wire photo.
//
// The prompt reads the headline + daily title and creates a symbolic scene
// that captures the emotional weight of the day's news.
// ============================================================================

const DALLE_TIMEOUT_MS = 60_000;
const DALLE_SIZE = "1024x1024" as const;
const DALLE_QUALITY = "hd" as const; // HD for the mint artwork — worth the extra $0.04

// ── STYLE SYSTEM PROMPT ─────────────────────────────────────────────────────
// This prefix is prepended to every generation for visual consistency.
// The style is locked across all editions — only the subject changes.

const STYLE_PREFIX = [
  `Dystopian black and white photograph with extreme cinematic contrast.`,
  `Shot on large-format film — deep blacks, blown-out whites, heavy grain.`,
  `The lighting is dramatic and oppressive: harsh directional light cutting through smoke, fog, or dust.`,
  `The composition is epic in scale — either vast landscapes dwarfing human figures, or extreme close-ups that feel uncomfortably intimate.`,
  `The mood is haunting, prophetic, beautiful in a way that makes you uneasy.`,
  `Think: Sebastião Salgado's documentary grandeur, the loneliness of a Tarkovsky still, the grit of a Magnum Photos wire image from a conflict zone.`,
  `Absolutely NO text, NO lettering, NO watermarks, NO captions, NO UI elements in the image.`,
  `No color whatsoever — pure monochrome. No sepia, no tinting.`,
  `The image should feel like it was pulled from the front page of a newspaper that arrived from a darker timeline.`,
].join(" ");

/**
 * Build a DALL-E prompt from the editorial headline and daily title.
 *
 * The headline provides the SUBJECT — what the image depicts.
 * The daily title provides the MOOD — the emotional register.
 *
 * Together they create a symbolic scene, not a literal illustration.
 */
export function buildIllustrationPrompt(
  headline: string,
  dailyTitle: string,
): string {
  const subjectLine = [
    `Subject: Create a single powerful photographic image that captures the essence of this headline: "${headline}".`,
    `Do not illustrate it literally — find the symbolic image, the metaphor made visual.`,
    `Show the human cost, the scale of the moment, or the eerie calm before impact.`,
    `One arresting composition. The kind of photograph that wins a World Press Photo award.`,
  ].join(" ");

  const moodLine =
    dailyTitle && dailyTitle !== "DAILY EDITION"
      ? `The emotional register of this image is: "${dailyTitle}". Let that feeling saturate every shadow and highlight.`
      : "";

  return [STYLE_PREFIX, subjectLine, moodLine].filter(Boolean).join(" ");
}

export interface IllustrationResult {
  base64: string;
  prompt: string;
  revisedPrompt: string | null;
}

/**
 * Generate the daily edition cover art using DALL-E 3.
 *
 * Returns the image as a base64-encoded PNG string, or null on failure.
 * Failures are non-fatal — the editorial works without an illustration.
 */
export async function generateIllustration(
  headline: string,
  dailyTitle: string,
): Promise<IllustrationResult | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    console.warn("[image-generation] OPENAI_API_KEY not configured, skipping illustration");
    return null;
  }

  const prompt = buildIllustrationPrompt(headline, dailyTitle);
  const baseUrl = (process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/$/, "");

  try {
    console.log(`[image-generation] Generating cover art for "${headline.slice(0, 60)}..."`);

    const response = await fetch(`${baseUrl}/images/generations`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt,
        n: 1,
        size: DALLE_SIZE,
        quality: DALLE_QUALITY,
        response_format: "b64_json",
        style: "vivid", // vivid for maximum drama
      }),
      signal: AbortSignal.timeout(DALLE_TIMEOUT_MS),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error(`[image-generation] DALL-E API error ${response.status}: ${body.slice(0, 300)}`);
      return null;
    }

    const payload = (await response.json()) as {
      data?: Array<{ b64_json?: string; revised_prompt?: string }>;
    };

    const imageData = payload.data?.[0];
    if (!imageData?.b64_json) {
      console.error("[image-generation] DALL-E returned no image data");
      return null;
    }

    console.log(
      `[image-generation] Cover art generated (${Math.round(imageData.b64_json.length / 1024)}KB base64)`,
    );

    return {
      base64: imageData.b64_json,
      prompt,
      revisedPrompt: imageData.revised_prompt || null,
    };
  } catch (err) {
    console.error(
      "[image-generation] Cover art generation failed:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
