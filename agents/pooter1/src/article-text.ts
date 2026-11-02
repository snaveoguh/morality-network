/**
 * Fetch the body text of a news article so pooter1 comments on what the
 * piece says, not on the 300-character RSS blurb. Without this the
 * "what's missing from the coverage" instinct fired on every story,
 * because from a blurb almost everything is missing.
 *
 * Regex extraction, no DOM dependency: JSON-LD articleBody first, then the
 * <p> tags inside <article>/<main>, then every <p> on the page. Returns
 * null when the page is blocked, paywalled or too thin to be the article.
 */

const FETCH_TIMEOUT_MS = 10_000;
const MAX_HTML_BYTES = 3_000_000;
const MIN_BODY_CHARS = 400;
const DEFAULT_MAX_CHARS = 6_000;

export async function fetchArticleText(
  url: string | undefined,
  maxChars = DEFAULT_MAX_CHARS,
): Promise<string | null> {
  if (!url || !/^https?:\/\//i.test(url)) return null;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PooterWorld/1.0; +https://pooter.world)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) return null;
    if (!/text\/html|application\/xhtml\+xml/i.test(res.headers.get("content-type") || "")) return null;

    const html = (await res.text()).slice(0, MAX_HTML_BYTES);
    const body = fromJsonLd(html) ?? fromParagraphs(html);
    if (!body || body.length < MIN_BODY_CHARS) return null;
    return body.length > maxChars ? `${body.slice(0, maxChars).replace(/\s+\S*$/, "")} …` : body;
  } catch {
    return null;
  }
}

function fromJsonLd(html: string): string | null {
  let best = "";
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const found = findArticleBody(JSON.parse(m[1]));
      if (found && found.length > best.length) best = found;
    } catch {
      // Ignore invalid JSON-LD blocks.
    }
  }
  const text = clean(best);
  return text.length >= MIN_BODY_CHARS ? text : null;
}

function findArticleBody(node: unknown): string | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const entry of node) {
      const found = findArticleBody(entry);
      if (found) return found;
    }
    return null;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key.toLowerCase() === "articlebody" && typeof value === "string") return value;
    const found = findArticleBody(value);
    if (found) return found;
  }
  return null;
}

function fromParagraphs(html: string): string | null {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<(nav|header|footer|aside|form|figure)\b[\s\S]*?<\/\1>/gi, " ");

  const scope =
    stripped.match(/<article\b[\s\S]*<\/article>/i)?.[0] ??
    stripped.match(/<main\b[\s\S]*<\/main>/i)?.[0] ??
    stripped;

  const paragraphs: string[] = [];
  for (const m of scope.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    const text = clean(m[1]);
    // Short <p>s are bylines, captions, "Sign up" prompts and share buttons.
    if (text.length >= 50 && !BOILERPLATE.test(text)) paragraphs.push(text);
  }
  return paragraphs.length ? paragraphs.join("\n\n") : null;
}

const BOILERPLATE =
  /\b(cookies?|subscribe|sign up|newsletter|all rights reserved|your browser|enable javascript|advertisement|read more:|follow us)\b/i;

function clean(raw: string): string {
  return decodeEntities(raw.replace(/<[^>]+>/g, " "))
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&(?:apos|#39|rsquo|lsquo);/g, "'")
    .replace(/&(?:rdquo|ldquo);/g, '"')
    .replace(/&(?:mdash|ndash);/g, "—")
    .replace(/&hellip;/g, "…");
}
