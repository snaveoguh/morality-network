import { ImageResponse } from "next/og";
import { readFile } from "fs/promises";
import { join } from "path";
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
  const [serifBold, mono, imgBuf] = await Promise.all([
    fetch(NOTO_SERIF_BOLD).then((res) => res.arrayBuffer()),
    fetch(IBM_PLEX_MONO).then((res) => res.arrayBuffer()),
    readFile(join(process.cwd(), "public", "astraea-bw.jpg")),
  ]);

  const imgBase64 = `data:image/jpeg;base64,${imgBuf.toString("base64")}`;

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
        {/* Astraea painting — full bleed, B&W */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imgBase64}
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
            opacity: 0.55,
          }}
        />

        {/* Dark gradient overlay for text legibility */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background:
              "linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.15) 40%, rgba(0,0,0,0.5) 75%, rgba(0,0,0,0.75) 100%)",
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
          <div style={{ height: 3, backgroundColor: "#FFFFFF", width: "100%", display: "flex", opacity: 0.4 }} />

          {/* Top bar */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              padding: "12px 48px 10px",
              fontFamily: "Mono",
              fontSize: 10,
              color: "rgba(255,255,255,0.5)",
              letterSpacing: "0.3em",
            }}
          >
            PERMISSIONLESS NEWS & ONCHAIN DISCUSSION
          </div>

          {/* Main content */}
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
            <div
              style={{
                fontFamily: "Serif",
                fontSize: 108,
                fontWeight: 700,
                color: "#FFFFFF",
                letterSpacing: "-0.03em",
                lineHeight: 1,
                display: "flex",
                textShadow: "0 2px 40px rgba(0,0,0,0.5)",
              }}
            >
              {BRAND_NAME}
            </div>

            {/* Thin rule */}
            <div
              style={{
                height: 1,
                backgroundColor: "#FFFFFF",
                width: 300,
                display: "flex",
                marginTop: 24,
                marginBottom: 20,
                opacity: 0.4,
              }}
            />

            <div
              style={{
                fontFamily: "Mono",
                fontSize: 11,
                color: "rgba(255,255,255,0.6)",
                letterSpacing: "0.25em",
                display: "flex",
                gap: 16,
              }}
            >
              <span>100+ SOURCES</span>
              <span style={{ opacity: 0.4 }}>{"\u00B7"}</span>
              <span>CROSS-SPECTRUM</span>
              <span style={{ opacity: 0.4 }}>{"\u00B7"}</span>
              <span>ONCHAIN</span>
              <span style={{ opacity: 0.4 }}>{"\u00B7"}</span>
              <span>BASE L2</span>
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "12px 48px",
              fontFamily: "Mono",
              fontSize: 9,
              color: "rgba(255,255,255,0.35)",
              letterSpacing: "0.2em",
            }}
          >
            <span>{BRAND_DOMAIN}</span>
            <span>SALVATOR ROSA, ASTRAEA, c. 1640</span>
          </div>

          {/* Bottom rule */}
          <div style={{ height: 3, backgroundColor: "#FFFFFF", width: "100%", display: "flex", opacity: 0.4 }} />
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
