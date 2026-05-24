// ============================================================================
// MarginGloss — italic side-note in the gutter. Inline figure or commentary.
// ============================================================================

import type { ReactNode } from "react";

export function MarginGloss({ children }: { children: ReactNode }) {
  return <div className="margin-gloss">{children}</div>;
}
