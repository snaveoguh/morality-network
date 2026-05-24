"use client";

/**
 * Legacy Header — kept as an export for back-compat. The NeXTSTEP reskin
 * moves the global menu to `@/components/nextstep/MenuBar`, which is
 * mounted by the root layout. This component re-exports the MenuBar so
 * any stragglers that still import { Header } don't break.
 */

export { MenuBar as Header } from "@/components/nextstep/MenuBar";
