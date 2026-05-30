/**
 * Clean AI-generated editorial text for display.
 *
 * The daily-edition writer is prompted to emit labelled sections
 * (HEADLINE:, SUBHEADLINE:, DAILY TITLE: …) and occasionally wraps text in
 * markdown bold despite instructions not to. Both can leak into the stored
 * title/subheadline fields. This strips:
 *   - stray markdown bold/italic/heading markers (**, _, leading #)
 *   - a leaked leading section label (HEADLINE:, SUBHEADLINE:, SUBHEADER:,
 *     TITLE:, SUBTITLE:, DAILY TITLE:), even repeated
 *
 * Single source of truth — used by the article page, masthead, archive list
 * and the generator so every surface renders the same clean text.
 */
const LABEL_PREFIX =
  /^\s*(?:daily\s+title|sub[-\s]?head(?:line|er)?|head(?:line|er)?|subtitle|title)\s*:\s*/i;

export function stripMd(s: string | null | undefined): string {
  if (!s) return "";
  let out = s.replace(/\*{1,3}/g, "").replace(/_{1,3}/g, "").replace(/^#+\s+/, "");
  // A leaked label can appear more than once ("HEADLINE: SUBHEADER: …") — peel them all.
  let prev: string;
  do {
    prev = out;
    out = out.replace(LABEL_PREFIX, "");
  } while (out !== prev);
  return out.trim();
}
