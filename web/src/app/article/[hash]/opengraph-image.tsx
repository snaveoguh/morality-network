import { ImageResponse } from "next/og";
import { readFile } from "fs/promises";
import { join } from "path";
import { getArchivedFeedItemByHash } from "@/lib/archive";
import { getArchivedEditorial } from "@/lib/editorial-archive";
import { formatDateline } from "@/lib/article";
import { BRAND_DOMAIN, BRAND_NAME, SITE_URL } from "@/lib/brand";

// 24h revalidation — the image is deterministic per article hash.
export const revalidate = 86400;
export const maxDuration = 15; // reduced — no more feed fetching fallback

export const alt = `${BRAND_NAME} article`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Font URLs
const NOTO_SERIF_BOLD =
  "https://fonts.gstatic.com/s/notoserif/v33/ga6iaw1J5X9T9RW6j9bNVls-hfgvz8JcMofYTa32J4wsL2JAlAhZT1ejwA.ttf";
const IBM_PLEX_MONO =
  "https://fonts.gstatic.com/s/ibmplexmono/v20/-F63fjptAgt5VM-kVkqdyU8n5ig.ttf";
const IBM_PLEX_MONO_BOLD =
  "https://fonts.gstatic.com/s/ibmplexmono/v20/-F6qfjptAgt5VM-kVkqdyU8n3pQP8lc.ttf";

// ============================================================================
// Normalized article shape
// ============================================================================

interface OGArticle {
  title: string;
  description: string | null;
  source: string;
  category: string;
  dateline: string;
  imageUrl: string | null;
  illustrationUrl: string | null;
  tags: string[];
  dailyTitle: string | null;
  isDailyEdition: boolean;
}

export default async function ArticleOGImage({
  params,
}: {
  params: Promise<{ hash: string }>;
}) {
  const { hash } = await params;

  const [serifBold, mono, monoBold, imgBuf] = await Promise.all([
    fetch(NOTO_SERIF_BOLD).then((res) => res.arrayBuffer()),
    fetch(IBM_PLEX_MONO).then((res) => res.arrayBuffer()),
    fetch(IBM_PLEX_MONO_BOLD).then((res) => res.arrayBuffer()),
    readFile(join(process.cwd(), "public", "astraea-bw.jpg")),
  ]);

  const fonts = [
    { name: "Serif", data: serifBold, style: "normal" as const, weight: 700 as const },
    { name: "Mono", data: mono, style: "normal" as const, weight: 400 as const },
    { name: "MonoBold", data: monoBold, style: "normal" as const, weight: 700 as const },
  ];

  const bgBase64 = `data:image/jpeg;base64,${imgBuf.toString("base64")}`;
  const article = await resolveArticle(hash);

  if (!article) {
    return renderFallback(bgBase64, fonts);
  }

  return renderArticle(article, bgBase64, fonts);
}

// ============================================================================
// DATA RESOLUTION
// ============================================================================

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

const EDITION_EPOCH_MS = 1741651200 * 1000; // March 11 2025 00:00 UTC

function resolveIllustrationUrl(editorial: Awaited<ReturnType<typeof getArchivedEditorial>> | null): string | null {
  if (!editorial?.isDailyEdition || !editorial.hasIllustration) return null;
  const editorialDate = editorial.generatedAt ? new Date(editorial.generatedAt).getTime() : Date.now();
  const daysSinceEpoch = Math.floor((editorialDate - EDITION_EPOCH_MS) / 86400000);
  if (daysSinceEpoch < 0) return null;
  return `${SITE_URL}/api/edition/${daysSinceEpoch + 1}/illustration`;
}

async function resolveArticle(hash: string): Promise<OGArticle | null> {
  const editorial = await getArchivedEditorial(hash).catch(() => null);
  if (editorial) {
    return {
      title: editorial.primary.title,
      description: editorial.subheadline,
      source: BRAND_NAME,
      category: editorial.isDailyEdition ? "Daily Edition" : "Editorial",
      dateline: formatDateline(editorial.generatedAt),
      imageUrl: editorial.primary.imageUrl || null,
      illustrationUrl: resolveIllustrationUrl(editorial),
      tags: editorial.tags || [],
      dailyTitle: editorial.dailyTitle || null,
      isDailyEdition: editorial.isDailyEdition || false,
    };
  }

  const archivedItem = await withTimeout(
    getArchivedFeedItemByHash(hash as `0x${string}`).catch(() => null),
    10000,
    null,
  );
  if (archivedItem) {
    return {
      title: archivedItem.title,
      description: archivedItem.description || null,
      source: archivedItem.source,
      category: archivedItem.category || "World",
      dateline: formatDateline(archivedItem.pubDate),
      imageUrl: archivedItem.imageUrl || null,
      illustrationUrl: null,
      tags: archivedItem.tags || [],
      dailyTitle: null,
      isDailyEdition: false,
    };
  }

  // Removed fetchAllFeeds() fallback — it was fetching 100+ RSS sources
  // just for OG images, costing ~$50+/mo in function duration. If the article
  // isn't in the archive, just return the generic fallback image.
  return null;
}

// ============================================================================
// RENDER: ARTICLE — always B&W editorial with painting background
// ============================================================================

function renderArticle(
  article: OGArticle,
  bgBase64: string,
  fonts: { name: string; data: ArrayBuffer; style: "normal"; weight: 400 | 700 }[],
) {
  const title =
    article.title.length > 120 ? article.title.slice(0, 117) + "\u2026" : article.title;
  const description = article.description
    ? article.description.length > 180
      ? article.description.slice(0, 177) + "\u2026"
      : article.description
    : null;

  // Dynamic font sizing
  const titleFontSize =
    title.length > 100 ? 38 : title.length > 80 ? 44 : title.length > 50 ? 52 : 60;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          overflow: "hidden",
          backgroundColor: "#0A0A0A",
        }}
      >
        {/* Article image (grayscale) or fallback B&W painting */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={article.illustrationUrl || article.imageUrl || bgBase64}
          alt=""
          width={1200}
          height={630}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: article.illustrationUrl ? 0.4 : article.imageUrl ? 0.3 : 0.2,
            filter: "grayscale(100%)",
          }}
        />

        {/* Dark gradient for text */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background:
              "linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.1) 30%, rgba(0,0,0,0.3) 60%, rgba(0,0,0,0.7) 100%)",
            display: "flex",
          }}
        />

        {/* Content */}
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Top rule */}
          <div style={{ height: 3, backgroundColor: "#FFFFFF", width: "100%", display: "flex", opacity: 0.25 }} />

          {/* Masthead */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "14px 48px 12px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  fontFamily: "Serif",
                  fontSize: 22,
                  fontWeight: 700,
                  color: "#FFFFFF",
                  opacity: 0.8,
                }}
              >
                {BRAND_NAME}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                fontFamily: "Mono",
                fontSize: 9,
                color: "rgba(255,255,255,0.4)",
                letterSpacing: "0.2em",
                gap: 12,
              }}
            >
              <span>PERMISSIONLESS NEWS</span>
              <span style={{ opacity: 0.4 }}>|</span>
              <span>ONCHAIN</span>
              <span style={{ opacity: 0.4 }}>|</span>
              <span>BASE L2</span>
            </div>
          </div>

          {/* Thin rule */}
          <div style={{ height: 1, backgroundColor: "#FFFFFF", opacity: 0.15, marginLeft: 48, marginRight: 48, display: "flex" }} />

          {/* Main content area */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              justifyContent: "center",
              padding: "0 56px",
            }}
          >
            {/* Daily title */}
            {article.dailyTitle && (
              <div
                style={{
                  fontFamily: "MonoBold",
                  fontSize: 12,
                  color: "#C0392B",
                  letterSpacing: "0.4em",
                  marginBottom: 16,
                  display: "flex",
                }}
              >
                {article.dailyTitle}
              </div>
            )}

            {/* Category + meta line */}
            {!article.isDailyEdition && (
              <div
                style={{
                  fontFamily: "Mono",
                  fontSize: 10,
                  letterSpacing: "0.2em",
                  marginBottom: 16,
                  display: "flex",
                  gap: 10,
                }}
              >
                <span style={{ color: "#C0392B" }}>{article.category.toUpperCase()}</span>
                <span style={{ color: "rgba(255,255,255,0.25)" }}>{"\u00B7"}</span>
                <span style={{ color: "rgba(255,255,255,0.45)" }}>{article.source.toUpperCase()}</span>
                <span style={{ color: "rgba(255,255,255,0.25)" }}>{"\u00B7"}</span>
                <span style={{ color: "rgba(255,255,255,0.45)" }}>{article.dateline.toUpperCase()}</span>
              </div>
            )}

            {/* Headline */}
            <div
              style={{
                fontFamily: "Serif",
                fontSize: titleFontSize,
                fontWeight: 700,
                color: "#FFFFFF",
                lineHeight: 1.1,
                letterSpacing: "-0.02em",
                display: "flex",
                maxWidth: 1050,
                textShadow: "0 1px 20px rgba(0,0,0,0.4)",
              }}
            >
              {title}
            </div>

            {/* Subheadline */}
            {description && (
              <div
                style={{
                  fontFamily: "Serif",
                  fontSize: 16,
                  fontWeight: 700,
                  color: "rgba(255,255,255,0.6)",
                  lineHeight: 1.5,
                  marginTop: 20,
                  display: "flex",
                  maxWidth: 900,
                  fontStyle: "italic",
                }}
              >
                {description}
              </div>
            )}

            {/* Tags */}
            {article.tags.length > 0 && (
              <div style={{ display: "flex", gap: 8, marginTop: 20, flexWrap: "wrap" }}>
                {article.tags.slice(0, 5).map((tag) => (
                  <span
                    key={tag}
                    style={{
                      fontFamily: "Mono",
                      fontSize: 8,
                      letterSpacing: "0.15em",
                      color: "rgba(255,255,255,0.45)",
                      border: "1px solid rgba(255,255,255,0.2)",
                      padding: "3px 8px",
                      display: "flex",
                    }}
                  >
                    {tag.toUpperCase()}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "10px 48px",
              fontFamily: "Mono",
              fontSize: 9,
              color: "rgba(255,255,255,0.25)",
              letterSpacing: "0.2em",
            }}
          >
            <span>{BRAND_DOMAIN}</span>
            <span>ONCHAIN EDITORIAL</span>
          </div>

          {/* Bottom rule */}
          <div style={{ height: 3, backgroundColor: "#FFFFFF", width: "100%", display: "flex", opacity: 0.25 }} />
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}

// ============================================================================
// RENDER: FALLBACK — when article not found
// ============================================================================

function renderFallback(
  bgBase64: string,
  fonts: { name: string; data: ArrayBuffer; style: "normal"; weight: 400 | 700 }[],
) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          overflow: "hidden",
          backgroundColor: "#0A0A0A",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={bgBase64}
          alt=""
          width={1200}
          height={630}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: 0.35,
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.6) 100%)",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
          }}
        >
          <span style={{ fontFamily: "Serif", fontSize: 48, fontWeight: 700, color: "#FFFFFF" }}>
            {BRAND_NAME}
          </span>
          <span style={{ fontFamily: "Mono", fontSize: 12, color: "rgba(255,255,255,0.5)", letterSpacing: "0.3em" }}>
            A PUBLIC LEDGER OF WORLD EVENTS
          </span>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
