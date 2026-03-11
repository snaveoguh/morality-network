import { ImageResponse } from "next/og";
import { BRAND_DOMAIN, BRAND_NAME } from "@/lib/brand";

export const alt = `${BRAND_NAME} -- Permissionless News & Onchain Discussion`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Font URLs — static weights known to work with Satori
const NOTO_SERIF_BOLD =
  "https://fonts.gstatic.com/s/notoserif/v33/ga6iaw1J5X9T9RW6j9bNVls-hfgvz8JcMofYTa32J4wsL2JAlAhZT1ejwA.ttf";
const IBM_PLEX_MONO =
  "https://fonts.gstatic.com/s/ibmplexmono/v20/-F63fjptAgt5VM-kVkqdyU8n5ig.ttf";

export default async function SiteOGImage() {
  const [serifBold, mono] = await Promise.all([
    fetch(NOTO_SERIF_BOLD).then((res) => res.arrayBuffer()),
    fetch(IBM_PLEX_MONO).then((res) => res.arrayBuffer()),
  ]);

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
        {/* Paper texture */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundImage:
              "radial-gradient(circle at 25% 40%, rgba(0,0,0,0.025) 0%, transparent 50%), radial-gradient(circle at 75% 60%, rgba(0,0,0,0.02) 0%, transparent 40%)",
            display: "flex",
          }}
        />

        {/* Top double rule */}
        <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
          <div style={{ height: 4, backgroundColor: "#1A1A1A", width: "100%", display: "flex" }} />
          <div style={{ height: 3, width: "100%", display: "flex" }} />
          <div style={{ height: 1, backgroundColor: "#1A1A1A", width: "100%", display: "flex" }} />
        </div>

        {/* Date line */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            padding: "10px 48px 8px",
            fontFamily: "Mono",
            fontSize: 11,
            color: "#8A8A8A",
            letterSpacing: "0.2em",
          }}
        >
          PERMISSIONLESS NEWS & ONCHAIN DISCUSSION
        </div>

        {/* Thin rule */}
        <div
          style={{
            height: 1,
            backgroundColor: "#C8C0B0",
            marginLeft: 48,
            marginRight: 48,
            display: "flex",
          }}
        />

        {/* Main masthead area */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            flex: 1,
            padding: "0 48px",
          }}
        >
          {/* Noggles */}
          <div
            style={{
              fontFamily: "Mono",
              fontSize: 36,
              color: "#1A1A1A",
              marginBottom: 8,
              display: "flex",
            }}
          >
            {"( o_o )"}
          </div>

          {/* Masthead title */}
          <div
            style={{
              fontFamily: "Serif",
              fontSize: 96,
              fontWeight: 700,
              color: "#1A1A1A",
              letterSpacing: "-0.03em",
              lineHeight: 1,
              display: "flex",
              marginBottom: 24,
            }}
          >
            {BRAND_NAME}
          </div>

          {/* Thin rule under masthead */}
          <div
            style={{
              height: 1,
              backgroundColor: "#1A1A1A",
              width: 400,
              display: "flex",
              marginBottom: 20,
            }}
          />

          {/* Tagline */}
          <div
            style={{
              fontFamily: "Serif",
              fontSize: 22,
              color: "#4A4A4A",
              lineHeight: 1.4,
              textAlign: "center",
              display: "flex",
              maxWidth: 700,
            }}
          >
            Rate, discuss, and tip news content directly onchain. Censorship-resistant conversations powered by Base.
          </div>

          {/* Feature pills */}
          <div
            style={{
              display: "flex",
              gap: 16,
              marginTop: 32,
            }}
          >
            {["70+ SOURCES", "CROSS-SPECTRUM", "ONCHAIN RATINGS", "TIPPING"].map(
              (label) => (
                <div
                  key={label}
                  style={{
                    fontFamily: "Mono",
                    fontSize: 10,
                    letterSpacing: "0.2em",
                    color: "#4A4A4A",
                    border: "1px solid #C8C0B0",
                    padding: "6px 14px",
                    display: "flex",
                  }}
                >
                  {label}
                </div>
              )
            )}
          </div>
        </div>

        {/* Bottom double rule */}
        <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
          <div style={{ height: 1, backgroundColor: "#1A1A1A", width: "100%", display: "flex" }} />
          <div style={{ height: 3, width: "100%", display: "flex" }} />
          <div style={{ height: 4, backgroundColor: "#1A1A1A", width: "100%", display: "flex" }} />
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: "12px 48px",
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
      ],
    }
  );
}
