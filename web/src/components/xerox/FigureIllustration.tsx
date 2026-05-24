// ============================================================================
// FigureIllustration — research-paper figure with numbered italic caption.
// Rough hand-drawn-feel SVGs of a mouse, cat, lion, dog, owl.
// stroke-1, slightly irregular paths — feels like Tektronix tablet sketches.
// ============================================================================

import type { ReactNode } from "react";

export type IllustrationKind = "mouse" | "cat" | "lion" | "dog" | "owl" | "monitor" | "diskette";

interface FigureIllustrationProps {
  kind: IllustrationKind;
  number: number;
  caption: string;
  size?: number;
}

export function FigureIllustration({ kind, number, caption, size = 110 }: FigureIllustrationProps) {
  return (
    <figure className="figure">
      <IllustrationSVG kind={kind} size={size} />
      <figcaption className="figure-caption">
        <b>Figure {number}.</b> {caption}
      </figcaption>
    </figure>
  );
}

const SVG_PROPS = {
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  shapeRendering: "geometricPrecision" as const,
};

export function IllustrationSVG({ kind, size = 110 }: { kind: IllustrationKind; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 120 120", ...SVG_PROPS };
  switch (kind) {
    case "mouse":
      return (
        <svg {...common}>
          {/* Mouse from behind, curled tail */}
          <path d="M40,80 C40,60 55,52 60,52 C65,52 80,60 80,80 C80,92 70,98 60,98 C50,98 40,92 40,80 Z" />
          <ellipse cx="50" cy="58" rx="6" ry="7" />
          <ellipse cx="70" cy="58" rx="6" ry="7" />
          <path d="M60,76 L60,82" />
          <path d="M55,84 Q60,88 65,84" />
          <path d="M80,84 C92,82 96,72 92,64 C88,58 86,62 88,68" />
          <circle cx="58" cy="78" r="0.8" fill="currentColor" />
          <circle cx="62" cy="78" r="0.8" fill="currentColor" />
        </svg>
      );
    case "cat":
      return (
        <svg {...common}>
          {/* Cat curled up */}
          <path d="M22,80 C22,58 44,46 70,52 C92,58 100,72 98,84 C96,94 82,98 60,98 C36,98 22,92 22,80 Z" />
          <path d="M30,70 L34,58 L40,68" />
          <path d="M52,52 L56,42 L62,52" />
          <circle cx="44" cy="76" r="1.2" fill="currentColor" />
          <circle cx="58" cy="76" r="1.2" fill="currentColor" />
          <path d="M48,82 L52,84 L56,82" />
          <path d="M96,84 C108,82 112,76 108,72" />
          <path d="M28,90 Q26,86 30,82" />
        </svg>
      );
    case "lion":
      return (
        <svg {...common}>
          {/* Lion standing — mane and tail */}
          <circle cx="40" cy="48" r="20" />
          <path d="M22,38 L18,30 M28,28 L26,18 M40,24 L42,14 M52,28 L56,20 M60,38 L66,32" />
          <path d="M40,68 L40,82 L34,98 M40,82 L48,98" />
          <path d="M48,52 L88,54 L92,72 L88,86" />
          <path d="M88,86 L82,98 M88,86 L94,98" />
          <path d="M92,72 L100,70 L102,80 L98,86 L94,84" />
          <path d="M88,54 L100,52 L96,46" />
          <circle cx="34" cy="44" r="1.2" fill="currentColor" />
          <circle cx="44" cy="44" r="1.2" fill="currentColor" />
          <path d="M36,52 L40,54 L44,52" />
        </svg>
      );
    case "dog":
      return (
        <svg {...common}>
          {/* Dog sitting */}
          <ellipse cx="50" cy="44" rx="14" ry="16" />
          <path d="M38,34 L32,22 L42,30" />
          <path d="M60,32 L66,20 L62,32" />
          <circle cx="44" cy="44" r="1.2" fill="currentColor" />
          <circle cx="54" cy="44" r="1.2" fill="currentColor" />
          <path d="M46,52 L50,54 L54,52" />
          <path d="M50,60 L52,80 L70,86 L72,98 L62,98 L62,90" />
          <path d="M52,80 L42,86 L40,98 L48,98 L50,90" />
          <path d="M70,86 L86,80 L90,70 C88,62 80,58 70,60" />
          <path d="M86,80 L96,78 L94,86" />
        </svg>
      );
    case "owl":
      return (
        <svg {...common}>
          {/* Owl on a branch */}
          <ellipse cx="60" cy="56" rx="22" ry="28" />
          <circle cx="50" cy="48" r="6" />
          <circle cx="70" cy="48" r="6" />
          <circle cx="50" cy="48" r="2" fill="currentColor" />
          <circle cx="70" cy="48" r="2" fill="currentColor" />
          <path d="M60,54 L56,62 L60,64 L64,62 Z" fill="currentColor" />
          <path d="M44,32 L40,22 M76,32 L80,22" />
          <path d="M40,60 Q44,72 42,80 M80,60 Q76,72 78,80" />
          <path d="M52,84 L52,92 L56,92 L56,86 M64,84 L64,92 L68,92 L68,86" />
          <path d="M20,96 L100,96" strokeWidth="1.5" />
          <path d="M30,98 L40,100 M70,98 L80,100" />
        </svg>
      );
    case "monitor":
      return (
        <svg {...common}>
          {/* Alto-style portrait CRT monitor */}
          <rect x="30" y="14" width="60" height="78" />
          <rect x="36" y="20" width="48" height="58" />
          <path d="M36,28 L84,28" />
          <path d="M40,38 L80,38 M40,44 L72,44 M40,50 L80,50 M40,56 L66,56 M40,62 L76,62" />
          <path d="M48,92 L72,92 L74,102 L46,102 Z" />
          <path d="M30,102 L90,102" />
        </svg>
      );
    case "diskette":
      return (
        <svg {...common}>
          {/* 5.25" floppy */}
          <rect x="18" y="18" width="84" height="84" />
          <rect x="36" y="18" width="48" height="34" />
          <path d="M44,24 L44,46 M50,24 L50,46 M56,24 L56,46" />
          <rect x="38" y="60" width="44" height="22" />
          <path d="M44,68 L78,68 M44,74 L70,74" />
        </svg>
      );
  }
}
