import { ImageResponse } from "next/og";
import { fetchAllFeeds } from "@/lib/rss";
import { computeEntityHash } from "@/lib/entity";
import { getArchivedFeedItemByHash } from "@/lib/archive";
import { getArchivedEditorial } from "@/lib/editorial-archive";
import { formatDateline } from "@/lib/article";
import { BIAS_LABELS, BIAS_COLORS } from "@/lib/bias";
import type { BiasRating } from "@/lib/bias";
import { BRAND_DOMAIN, BRAND_NAME } from "@/lib/brand";

// 24h revalidation — the image is deterministic per article hash.
// Once an article exists, its OG image never changes.
export const revalidate = 86400;
export const maxDuration = 55;

export const alt = `${BRAND_NAME} article`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Font URLs — static weights known to work with Satori
const NOTO_SERIF_BOLD =
  "https://fonts.gstatic.com/s/notoserif/v33/ga6iaw1J5X9T9RW6j9bNVls-hfgvz8JcMofYTa32J4wsL2JAlAhZT1ejwA.ttf";
const IBM_PLEX_MONO =
  "https://fonts.gstatic.com/s/ibmplexmono/v20/-F63fjptAgt5VM-kVkqdyU8n5ig.ttf";
const IBM_PLEX_MONO_BOLD =
  "https://fonts.gstatic.com/s/ibmplexmono/v20/-F6qfjptAgt5VM-kVkqdyU8n3pQP8lc.ttf";

// Bias pill colors for OG image (desaturated for e-ink feel)
const OG_BIAS_COLORS: Record<BiasRating, string> = {
  "far-left": "#4A6FA5",
  left: "#5A80B0",
  "lean-left": "#7A9FC0",
  center: "#888888",
  "lean-right": "#C08A7A",
  right: "#B07060",
  "far-right": "#A05050",
};

// ============================================================================
// Normalized article shape for OG rendering
// ============================================================================

interface OGArticle {
  title: string;
  description: string | null;
  source: string;
  category: string;
  dateline: string;
  imageUrl: string | null;
  tags: string[];
  biasRating: BiasRating | null;
  /** Daily editions only — e.g. "STRAIT OF CONVERGENCE" */
  dailyTitle: string | null;
  isDailyEdition: boolean;
}

export default async function ArticleOGImage({
  params,
}: {
  params: Promise<{ hash: string }>;
}) {
  const { hash } = await params;

  // Load fonts in parallel with data
  const [serifBold, mono, monoBold] = await Promise.all([
    fetch(NOTO_SERIF_BOLD).then((res) => res.arrayBuffer()),
    fetch(IBM_PLEX_MONO).then((res) => res.arrayBuffer()),
    fetch(IBM_PLEX_MONO_BOLD).then((res) => res.arrayBuffer()),
  ]);

  const fonts = [
    { name: "Serif", data: serifBold, style: "normal" as const, weight: 700 as const },
    { name: "Mono", data: mono, style: "normal" as const, weight: 400 as const },
    { name: "MonoBold", data: monoBold, style: "normal" as const, weight: 700 as const },
  ];

  // ── Resolve article data: RSS → feed archive → editorial archive ──
  const article = await resolveArticle(hash);

  if (!article) {
    return renderNotFound(fonts);
  }

  if (article.imageUrl) {
    return renderWithImage(article, fonts);
  }

  return renderTypography(article, fonts);
}

// ============================================================================
// DATA RESOLUTION — three-tier lookup
// ============================================================================

/** Race a promise against a timeout — returns fallback on timeout */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

async function resolveArticle(hash: string): Promise<OGArticle | null> {
  // Check fast sources first: editorial archive + feed archive (both are
  // file/DB lookups, no external HTTP). This avoids the expensive fetchAllFeeds()
  // for daily editions and archived articles.

  // 1. Editorial archive (AI-generated editorials + daily editions)
  const editorial = await getArchivedEditorial(hash).catch(() => null);
  if (editorial) {
    return {
      title: editorial.primary.title,
      description: editorial.subheadline,
      source: BRAND_NAME,
      category: editorial.isDailyEdition ? "Daily Edition" : "Editorial",
      dateline: formatDateline(editorial.generatedAt),
      imageUrl: editorial.primary.imageUrl || null,
      tags: editorial.tags || [],
      biasRating: null,
      dailyTitle: editorial.dailyTitle || null,
      isDailyEdition: editorial.isDailyEdition || false,
    };
  }

  // 2. Feed archive (persisted RSS items — fast local/remote lookup)
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
      tags: archivedItem.tags || [],
      biasRating: archivedItem.bias?.bias || null,
      dailyTitle: null,
      isDailyEdition: false,
    };
  }

  // 3. Live RSS feed (expensive — fetches 70+ sources, 7-15s cold start)
  const allItems = await withTimeout(fetchAllFeeds(), 20000, []);
  const liveItem = allItems.find((i) => computeEntityHash(i.link) === hash);
  if (liveItem) {
    return {
      title: liveItem.title,
      description: liveItem.description || null,
      source: liveItem.source,
      category: liveItem.category || "World",
      dateline: formatDateline(liveItem.pubDate),
      imageUrl: liveItem.imageUrl || null,
      tags: liveItem.tags || [],
      biasRating: liveItem.bias?.bias || null,
      dailyTitle: null,
      isDailyEdition: false,
    };
  }

  return null;
}

// ============================================================================
// SHARED COMPONENTS
// ============================================================================

function PaperTexture() {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundImage:
          "radial-gradient(circle at 20% 50%, rgba(0,0,0,0.02) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(0,0,0,0.015) 0%, transparent 40%), radial-gradient(circle at 50% 80%, rgba(0,0,0,0.02) 0%, transparent 45%)",
        display: "flex",
      }}
    />
  );
}

function DoubleRuleTop() {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
      <div style={{ height: 3, backgroundColor: "#1A1A1A", width: "100%", display: "flex" }} />
      <div style={{ height: 2, width: "100%", display: "flex" }} />
      <div style={{ height: 1, backgroundColor: "#1A1A1A", width: "100%", display: "flex" }} />
    </div>
  );
}

function DoubleRuleBottom() {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
      <div style={{ height: 1, backgroundColor: "#1A1A1A", width: "100%", display: "flex" }} />
      <div style={{ height: 2, width: "100%", display: "flex" }} />
      <div style={{ height: 3, backgroundColor: "#1A1A1A", width: "100%", display: "flex" }} />
    </div>
  );
}

function MastheadRow() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        paddingTop: 16,
        paddingBottom: 12,
        borderBottom: "1px solid #C8C0B0",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span
          style={{
            fontFamily: "Serif",
            fontSize: 28,
            fontWeight: 700,
            color: "#1A1A1A",
            letterSpacing: "-0.02em",
          }}
        >
          {BRAND_NAME}
        </span>
        <span style={{ fontFamily: "Mono", fontSize: 18, color: "#1A1A1A", display: "flex" }}>
          {"( o_o )"}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          fontFamily: "Mono",
          fontSize: 11,
          color: "#8A8A8A",
          letterSpacing: "0.15em",
        }}
      >
        <span>PERMISSIONLESS NEWS</span>
        <span style={{ color: "#C8C0B0" }}>|</span>
        <span>ONCHAIN</span>
        <span style={{ color: "#C8C0B0" }}>|</span>
        <span>BASE L2</span>
      </div>
    </div>
  );
}

function FooterRow() {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "10px 48px",
        fontFamily: "Mono",
        fontSize: 10,
        color: "#8A8A8A",
        letterSpacing: "0.25em",
        gap: 16,
      }}
    >
      <span>PERMISSIONLESS NEWS</span>
      <span style={{ color: "#C8C0B0" }}>{"\u00B7"}</span>
      <span>ONCHAIN</span>
      <span style={{ color: "#C8C0B0" }}>{"\u00B7"}</span>
      <span>BASE L2</span>
      <span style={{ color: "#C8C0B0" }}>{"\u00B7"}</span>
      <span>{BRAND_DOMAIN}</span>
    </div>
  );
}

function TagPills({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {tags.slice(0, 5).map((tag) => (
        <span
          key={tag}
          style={{
            fontFamily: "Mono",
            fontSize: 9,
            letterSpacing: "0.15em",
            color: "#8A8A8A",
            border: "1px solid #C8C0B0",
            padding: "3px 8px",
            display: "flex",
          }}
        >
          {tag.toUpperCase()}
        </span>
      ))}
    </div>
  );
}

function MetaRow({ article }: { article: OGArticle }) {
  const biasLabel = article.biasRating ? BIAS_LABELS[article.biasRating] : null;
  const biasColor = article.biasRating
    ? OG_BIAS_COLORS[article.biasRating] || BIAS_COLORS[article.biasRating]
    : null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        paddingTop: 14,
        paddingBottom: 10,
        fontFamily: "Mono",
        fontSize: 11,
        letterSpacing: "0.2em",
        color: "#8A8A8A",
      }}
    >
      <span style={{ color: "#8B0000", fontFamily: "MonoBold" }}>
        {article.category.toUpperCase()}
      </span>
      <span style={{ color: "#C8C0B0" }}>{"\u00B7"}</span>
      <span>{article.source.toUpperCase()}</span>
      <span style={{ color: "#C8C0B0" }}>{"\u00B7"}</span>
      <span>{article.dateline.toUpperCase()}</span>
      {biasLabel && biasColor && (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ color: "#C8C0B0" }}>{"\u00B7"}</span>
          <span
            style={{
              display: "flex",
              alignItems: "center",
              backgroundColor: biasColor,
              color: "#FFFFFF",
              padding: "2px 8px",
              fontSize: 9,
              fontFamily: "MonoBold",
              letterSpacing: "0.15em",
            }}
          >
            {biasLabel.toUpperCase()}
          </span>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// LAYOUT: NOT FOUND
// ============================================================================

function renderNotFound(fonts: { name: string; data: ArrayBuffer; style: "normal"; weight: 400 | 700 }[]) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#F5F0E8",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <PaperTexture />
        <DoubleRuleTop />
        <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "0 48px" }}>
          <MastheadRow />
          <div
            style={{
              display: "flex",
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <span style={{ fontFamily: "Serif", fontSize: 36, fontWeight: 700, color: "#1A1A1A" }}>
              {BRAND_NAME}
            </span>
            <span style={{ fontFamily: "Mono", fontSize: 14, color: "#8A8A8A", letterSpacing: "0.2em" }}>
              A PUBLIC LEDGER OF WORLD EVENTS
            </span>
          </div>
        </div>
        <DoubleRuleBottom />
        <FooterRow />
      </div>
    ),
    { ...size, fonts },
  );
}

// ============================================================================
// LAYOUT: WITH IMAGE — newspaper broadsheet (headline left, image right)
// ============================================================================

function renderWithImage(
  article: OGArticle,
  fonts: { name: string; data: ArrayBuffer; style: "normal"; weight: 400 | 700 }[],
) {
  const title =
    article.title.length > 120 ? article.title.slice(0, 117) + "..." : article.title;
  const description = article.description
    ? article.description.length > 160
      ? article.description.slice(0, 157) + "..."
      : article.description
    : null;
  const titleFontSize = title.length > 80 ? 36 : title.length > 50 ? 42 : 48;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#F5F0E8",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <PaperTexture />
        <DoubleRuleTop />

        <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "0 48px" }}>
          <MastheadRow />
          <MetaRow article={article} />

          {/* Main content: headline left + image right */}
          <div style={{ display: "flex", flex: 1, gap: 40, paddingTop: 8, paddingBottom: 16 }}>
            {/* Left column */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                flex: 1,
                justifyContent: "flex-start",
                minWidth: 0,
              }}
            >
              <div
                style={{
                  fontFamily: "Serif",
                  fontSize: titleFontSize,
                  fontWeight: 700,
                  color: "#1A1A1A",
                  lineHeight: 1.1,
                  letterSpacing: "-0.02em",
                  display: "flex",
                  marginBottom: 20,
                }}
              >
                {title}
              </div>

              {description && (
                <div
                  style={{
                    fontFamily: "Mono",
                    fontSize: 14,
                    color: "#4A4A4A",
                    lineHeight: 1.6,
                    display: "flex",
                  }}
                >
                  {description}
                </div>
              )}

              <div style={{ marginTop: 20, display: "flex" }}>
                <TagPills tags={article.tags} />
              </div>
            </div>

            {/* Right column: image with halftone/grayscale */}
            <div
              style={{
                display: "flex",
                width: 340,
                height: 340,
                position: "relative",
                flexShrink: 0,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "flex",
                  width: "100%",
                  height: "100%",
                  overflow: "hidden",
                  clipPath: "polygon(15% 0%, 100% 0%, 100% 100%, 0% 100%)",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={article.imageUrl!}
                  alt=""
                  width={340}
                  height={340}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    filter: "grayscale(100%) contrast(1.3) brightness(1.05)",
                  }}
                />
              </div>
              {/* Halftone dot overlay */}
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundImage: "radial-gradient(circle, #1A1A1A 0.5px, transparent 0.5px)",
                  backgroundSize: "3px 3px",
                  opacity: 0.08,
                  display: "flex",
                }}
              />
            </div>
          </div>
        </div>

        <DoubleRuleBottom />
        <FooterRow />
      </div>
    ),
    { ...size, fonts },
  );
}

// ============================================================================
// LAYOUT: TYPOGRAPHY — full-bleed headline (no image)
//
// Used for daily editions + any article without an image.
// The headline fills the canvas at 56-72px for maximum visual impact.
// ============================================================================

function renderTypography(
  article: OGArticle,
  fonts: { name: string; data: ArrayBuffer; style: "normal"; weight: 400 | 700 }[],
) {
  const title =
    article.title.length > 140 ? article.title.slice(0, 137) + "..." : article.title;
  const description = article.description
    ? article.description.length > 200
      ? article.description.slice(0, 197) + "..."
      : article.description
    : null;

  // Larger font sizes for the full-bleed layout
  const titleFontSize = title.length > 100 ? 44 : title.length > 70 ? 52 : title.length > 50 ? 60 : 68;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#F5F0E8",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <PaperTexture />
        <DoubleRuleTop />

        <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "0 48px" }}>
          <MastheadRow />

          {/* Full-bleed content area */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              justifyContent: "center",
              alignItems: "center",
              textAlign: "center",
              padding: "0 24px",
            }}
          >
            {/* Daily title signal word — only for daily editions */}
            {article.dailyTitle && (
              <div
                style={{
                  fontFamily: "MonoBold",
                  fontSize: 13,
                  color: "#8B0000",
                  letterSpacing: "0.35em",
                  marginBottom: 20,
                  display: "flex",
                }}
              >
                {article.dailyTitle}
              </div>
            )}

            {/* Category + date for non-daily editions */}
            {!article.isDailyEdition && (
              <div
                style={{
                  fontFamily: "Mono",
                  fontSize: 11,
                  color: "#8A8A8A",
                  letterSpacing: "0.2em",
                  marginBottom: 16,
                  display: "flex",
                  gap: 12,
                }}
              >
                <span style={{ color: "#8B0000", fontFamily: "MonoBold" }}>
                  {article.category.toUpperCase()}
                </span>
                <span style={{ color: "#C8C0B0" }}>{"\u00B7"}</span>
                <span>{article.source.toUpperCase()}</span>
                <span style={{ color: "#C8C0B0" }}>{"\u00B7"}</span>
                <span>{article.dateline.toUpperCase()}</span>
              </div>
            )}

            {/* HEADLINE — the hero */}
            <div
              style={{
                fontFamily: "Serif",
                fontSize: titleFontSize,
                fontWeight: 700,
                color: "#1A1A1A",
                lineHeight: 1.08,
                letterSpacing: "-0.02em",
                display: "flex",
                textAlign: "center",
                maxWidth: 1050,
              }}
            >
              {title}
            </div>

            {/* Subheadline / description */}
            {description && (
              <div
                style={{
                  fontFamily: "Serif",
                  fontSize: 18,
                  fontWeight: 700,
                  color: "#4A4A4A",
                  lineHeight: 1.5,
                  marginTop: 24,
                  display: "flex",
                  textAlign: "center",
                  maxWidth: 900,
                  fontStyle: "italic",
                }}
              >
                {description}
              </div>
            )}

            {/* Tags */}
            <div style={{ marginTop: 24, display: "flex" }}>
              <TagPills tags={article.tags} />
            </div>
          </div>
        </div>

        <DoubleRuleBottom />
        <FooterRow />
      </div>
    ),
    { ...size, fonts },
  );
}
