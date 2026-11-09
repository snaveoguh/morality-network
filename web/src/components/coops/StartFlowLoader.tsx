"use client";

import dynamic from "next/dynamic";

// The flow restores an unfinished plan from localStorage, so it renders on
// the client only.
export const StartFlowLoader = dynamic(() => import("./StartFlow").then((m) => m.StartFlow), {
  ssr: false,
  loading: () => <p className="text-[15px] text-[var(--ink-faint)]">Loading…</p>,
});
