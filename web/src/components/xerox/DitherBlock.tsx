// ============================================================================
// DitherBlock — reusable PARC-style dither pattern block.
// Variants map to the .dither-* utilities in globals.css.
// ============================================================================

import type { CSSProperties, ReactNode } from "react";

export type DitherVariant = "25" | "50" | "75" | "diag" | "cross" | "dots";

interface DitherBlockProps {
  variant?: DitherVariant;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  ariaHidden?: boolean;
}

export function DitherBlock({
  variant = "50",
  className = "",
  style,
  children,
  ariaHidden = true,
}: DitherBlockProps) {
  return (
    <div
      className={`dither-${variant} ${className}`}
      style={style}
      aria-hidden={ariaHidden}
    >
      {children}
    </div>
  );
}
