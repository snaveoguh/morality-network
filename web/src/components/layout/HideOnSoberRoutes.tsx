"use client";

// Sober routes (the MP Record) render without the crypto ticker, wallet
// banner or mascot: MP_RECORD_SPEC §1 — no crypto, no ticker, no AI chrome
// beside register facts.

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

export function isSoberRoute(pathname: string | null): boolean {
  return pathname === "/mp" || Boolean(pathname?.startsWith("/mp/"));
}

export function HideOnSoberRoutes({ children }: { children: ReactNode }) {
  return isSoberRoute(usePathname()) ? null : <>{children}</>;
}
