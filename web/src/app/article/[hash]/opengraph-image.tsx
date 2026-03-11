import { ImageResponse } from "next/og";
import { fetchAllFeeds } from "@/lib/rss";
import { computeEntityHash } from "@/lib/entity";
import { getArchivedFeedItemByHash } from "@/lib/archive";
import { formatDateline } from "@/lib/article";
import { BIAS_LABELS, BIAS_COLORS } from "@/lib/bias";
import type { BiasRating } from "@/lib/bias";
import { BRAND_DOMAIN, BRAND_NAME } from "@/lib/brand";

export const revalidate = 300;

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

export default async function ArticleOGImage({
  params,
}: {
  params: Promise<{ hash: string }>;
}) {
  const { hash } = await params;

  // Load fonts
  const [serifBold, mono, monoBold] = await Promise.all([
    fetch(NOTO_SERIF_BOLD).then((res) => res.arrayBuffer()),
    fetch(IBM_PLEX_MONO).then((res) => res.arrayBuffer()),
    fetch(IBM_PLEX_MONO_BOLD).then((res) => res.arrayBuffer()),
  ]);

  // Fetch article data
  const allItems = await fetchAllFeeds();
  const liveItem = allItems.find((i) => computeEntityHash(i.link) === hash);
  const archivedItem = liveItem
    ? null
    : await getArchivedFeedItemByHash(hash as `0x${string}`);
  const item = liveItem ?? archivedItem;

  if (!item) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#F5F0E8",
            fontFamily: "Mono",
            fontSize: 24,
            color: "#4A4A4A",
          }}
        >
          Article not found
        </div>
      ),
      {
        ...size,
        fonts: [
          { name: "Mono", data: mono, style: "normal" as const, weight: 400 as const },
        ],
      }
    );
  }

  const dateline = formatDateline(item.pubDate);
  const category = (item.category || "World").toUpperCase();
  const source = item.source;
  const biasRating = item.bias?.bias;
  const biasLabel = biasRating ? BIAS_LABELS[biasRating] : null;
  const biasColor = biasRating
    ? OG_BIAS_COLORS[biasRating] || BIAS_COLORS[biasRating]
    : null;

  // Truncate title for display
  const title =
    item.title.length > 120 ? item.title.slice(0, 117) + "..." : item.title;

  // Truncate description
  const description = item.description
    ? item.description.length > 160
      ? item.description.slice(0, 157) + "..."
      : item.description
    : null;

  // Dynamic font size based on title length
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
        {/* Paper texture overlay */}
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

        {/* Top double rule */}
        <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
          <div style={{ height: 3, backgroundColor: "#1A1A1A", width: "100%", display: "flex" }} />
          <div style={{ height: 2, width: "100%", display: "flex" }} />
          <div style={{ height: 1, backgroundColor: "#1A1A1A", width: "100%", display: "flex" }} />
        </div>

        {/* Main content area */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            padding: "0 48px",
          }}
        >
          {/* Masthead row */}
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
              <span
                style={{
                  fontFamily: "Mono",
                  fontSize: 18,
                  color: "#1A1A1A",
                  display: "flex",
                }}
              >
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

          {/* Category + Source + Date line */}
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
              {category}
            </span>
            <span style={{ color: "#C8C0B0" }}>{"\u00B7"}</span>
            <span>{source.toUpperCase()}</span>
            <span style={{ color: "#C8C0B0" }}>{"\u00B7"}</span>
            <span>{dateline.toUpperCase()}</span>
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

          {/* Main content: headline + optional image */}
          <div
            style={{
              display: "flex",
              flex: 1,
              gap: 40,
              paddingTop: 8,
              paddingBottom: 16,
            }}
          >
            {/* Left column: headline + description */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                flex: 1,
                justifyContent: "flex-start",
                minWidth: 0,
              }}
            >
              {/* Headline */}
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

              {/* Description / lede */}
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

              {/* Tags row */}
              {item.tags && item.tags.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    marginTop: 20,
                    flexWrap: "wrap",
                  }}
                >
                  {item.tags.slice(0, 5).map((tag) => (
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
              )}
            </div>

            {/* Right column: article image with halftone/grayscale treatment */}
            {item.imageUrl && (
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
                {/* Diagonal clip shape */}
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
                    src={item.imageUrl}
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
                {/* Halftone overlay dot pattern */}
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundImage:
                      "radial-gradient(circle, #1A1A1A 0.5px, transparent 0.5px)",
                    backgroundSize: "3px 3px",
                    opacity: 0.08,
                    display: "flex",
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Bottom double rule */}
        <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
          <div style={{ height: 1, backgroundColor: "#1A1A1A", width: "100%", display: "flex" }} />
          <div style={{ height: 2, width: "100%", display: "flex" }} />
          <div style={{ height: 3, backgroundColor: "#1A1A1A", width: "100%", display: "flex" }} />
        </div>

        {/* Footer text */}
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
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Serif", data: serifBold, style: "normal" as const, weight: 700 as const },
        { name: "Mono", data: mono, style: "normal" as const, weight: 400 as const },
        { name: "MonoBold", data: monoBold, style: "normal" as const, weight: 700 as const },
      ],
    }
  );
}
