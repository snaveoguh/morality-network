// Reusable memo-tee design. Server component — same JSX is used by the /drop
// page and (later) by the server-side renderer that uploads to Printful.
//
// All styles inline to keep the component standalone and easy to render in
// isolation (no Tailwind, no globals.css dependency). The visual is screen-
// print white-on-charcoal, mimicking a heavyweight Comfort Colors 1717.

interface MemoTeeDesignProps {
  headline: string;
  docNumber?: string;
  dateText?: string;
  bodyText?: string;
}

const FONT_MONO =
  "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

const INK = "#ece5d3";
const INK_DIM = "#cdc6b5";
const INK_FAINT = "#8a8470";
const STAMP = "#b03a2b";
const TEE_BG = "#101012";

export function MemoTeeDesign({
  headline,
  docNumber = "PW-0001-A",
  dateText,
  bodyText,
}: MemoTeeDesignProps) {
  const defaultDate = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).toUpperCase();

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        maxWidth: 600,
        aspectRatio: "600 / 750",
        margin: "0 auto",
        background: `
          repeating-linear-gradient(45deg, rgba(255,255,255,.012) 0 1px, transparent 1px 3px),
          repeating-linear-gradient(-45deg, rgba(0,0,0,.18) 0 1px, transparent 1px 3px),
          radial-gradient(120% 80% at 50% 30%, #1a1a1d 0%, ${TEE_BG} 60%, #08080a 100%)
        `,
        boxShadow:
          "0 24px 60px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.04), inset 0 -40px 80px rgba(0,0,0,.35)",
        borderRadius: 8,
        color: INK,
        fontFamily: FONT_MONO,
        overflow: "hidden",
        padding: "32px 38px 28px",
      }}
    >
      {/* EYES-ONLY corner stamp */}
      <div
        style={{
          position: "absolute",
          top: 14,
          right: 14,
          border: `1.5px solid ${INK}`,
          padding: "2px 6px",
          fontSize: 8,
          letterSpacing: "0.22em",
          fontWeight: 700,
          transform: "rotate(2deg)",
        }}
      >
        EYES · ONLY
      </div>

      {/* Header */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          borderBottom: `1.5px solid ${INK}`,
          paddingBottom: 8,
          marginBottom: 14,
          fontWeight: 700,
        }}
      >
        <div style={{ fontSize: 12, letterSpacing: "0.16em" }}>
          POOTER<span style={{ opacity: 0.55 }}>.</span>WORLD
          <span
            style={{
              display: "block",
              fontSize: 9,
              fontWeight: 500,
              letterSpacing: "0.24em",
              color: INK_DIM,
              marginTop: 2,
            }}
          >
            EDITORIAL DESK / INTERNAL CIRCULATION
          </span>
        </div>
        <div
          style={{
            textAlign: "right",
            fontSize: 9,
            letterSpacing: "0.14em",
            lineHeight: 1.4,
          }}
        >
          <b style={{ display: "block", letterSpacing: "0.18em" }}>
            DOC&nbsp;&nbsp;{docNumber}
          </b>
          FORM 17.4 &nbsp;REV&nbsp;05/26
          <br />
          CLASS&nbsp;&nbsp;III · HOLD
        </div>
      </header>

      {/* Memo title */}
      <h1
        style={{
          textAlign: "center",
          fontWeight: 700,
          fontSize: 15,
          letterSpacing: "0.42em",
          margin: "2px 0 16px",
          padding: "4px 0",
          borderTop: `1px solid ${INK}`,
          borderBottom: `1px solid ${INK}`,
        }}
      >
        M E M O R A N D U M
      </h1>

      {/* Fields */}
      <dl
        style={{
          display: "grid",
          gridTemplateColumns: "56px 1fr",
          rowGap: 5,
          columnGap: 10,
          fontSize: 10.5,
          marginBottom: 14,
        }}
      >
        <dt style={{ fontWeight: 700, letterSpacing: "0.16em" }}>TO:</dt>
        <dd
          style={{
            margin: 0,
            fontWeight: 500,
            letterSpacing: "0.04em",
            borderBottom: `1px dotted rgba(236,229,211,.35)`,
            paddingBottom: 2,
          }}
        >
          ALL DESKS / INDEXING / FIELD AGENTS
        </dd>

        <dt style={{ fontWeight: 700, letterSpacing: "0.16em" }}>FROM:</dt>
        <dd
          style={{
            margin: 0,
            fontWeight: 500,
            letterSpacing: "0.04em",
            borderBottom: `1px dotted rgba(236,229,211,.35)`,
            paddingBottom: 2,
          }}
        >
          P. OOTER — EDITORIAL AUTOMATON, ROOM 8C
        </dd>

        <dt style={{ fontWeight: 700, letterSpacing: "0.16em" }}>DATE:</dt>
        <dd
          style={{
            margin: 0,
            fontWeight: 500,
            letterSpacing: "0.04em",
            borderBottom: `1px dotted rgba(236,229,211,.35)`,
            paddingBottom: 2,
          }}
        >
          {dateText ?? defaultDate}
        </dd>

        <dt style={{ fontWeight: 700, letterSpacing: "0.16em" }}>RE:</dt>
        <dd
          style={{
            margin: 0,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            lineHeight: 1.35,
            borderBottom: `1px dotted rgba(236,229,211,.35)`,
            paddingBottom: 2,
          }}
        >
          {headline}
        </dd>
      </dl>

      <hr
        style={{
          border: 0,
          borderTop: `1px solid ${INK}`,
          margin: "12px 0",
        }}
      />

      {/* Body */}
      {bodyText && (
        <div
          style={{
            fontSize: 10,
            lineHeight: 1.55,
            letterSpacing: "0.02em",
            textAlign: "justify",
            hyphens: "auto",
          }}
        >
          <p style={{ margin: "0 0 9px", textIndent: "2.4em" }}>{bodyText}</p>
        </div>
      )}

      {/* Signature */}
      <div
        style={{
          marginTop: 10,
          fontSize: 9.5,
          letterSpacing: "0.08em",
        }}
      >
        <span
          style={{
            display: "inline-block",
            width: 140,
            borderBottom: `1px solid ${INK}`,
            marginRight: 8,
            verticalAlign: "middle",
            height: 10,
          }}
        />
        P. OOTER, ed.
        <small
          style={{
            display: "block",
            fontSize: 8.5,
            letterSpacing: "0.18em",
            color: INK_DIM,
            marginTop: 3,
          }}
        >
          SIGNED IN SOFTWARE · KEY 0xA1F3…7C2D
        </small>
      </div>

      {/* Diagonal stamp */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: "50%",
          top: "58%",
          transform: "translate(-50%, -50%) rotate(-14deg)",
          border: `3px double ${STAMP}`,
          color: STAMP,
          padding: "8px 22px 6px",
          fontSize: 22,
          letterSpacing: "0.22em",
          fontWeight: 700,
          textAlign: "center",
          opacity: 0.78,
          backgroundImage:
            "repeating-linear-gradient(0deg, rgba(0,0,0,.18) 0 1px, transparent 1px 4px)",
          mixBlendMode: "screen",
          whiteSpace: "nowrap",
          pointerEvents: "none",
        }}
      >
        CONFIDENTIAL
        <small
          style={{
            display: "block",
            fontSize: 9,
            letterSpacing: "0.32em",
            marginTop: 2,
            fontWeight: 600,
          }}
        >
          REVIEWED · DECLASSIFIED 2026
        </small>
      </div>

      {/* Bottom strip */}
      <div
        style={{
          position: "absolute",
          left: 26,
          right: 26,
          bottom: 14,
          display: "flex",
          justifyContent: "space-between",
          fontSize: 8.5,
          letterSpacing: "0.22em",
          borderTop: `1.5px solid ${INK}`,
          paddingTop: 6,
          fontWeight: 700,
          color: INK,
        }}
      >
        <span>PAGE 1 / 1</span>
        <span>POOTER&nbsp;DROP&nbsp;№001</span>
        <span>DO&nbsp;NOT&nbsp;REPRODUCE</span>
      </div>

      {/* Registration marks */}
      {[
        { left: "5%", top: "5%" },
        { right: "5%", top: "5%" },
        { left: "5%", bottom: "5%" },
        { right: "5%", bottom: "5%" },
      ].map((pos, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            ...pos,
            color: INK_FAINT,
            opacity: 0.55,
            fontSize: 14,
            lineHeight: "14px",
            width: 14,
            height: 14,
            textAlign: "center",
            pointerEvents: "none",
          }}
        >
          +
        </div>
      ))}
    </div>
  );
}
