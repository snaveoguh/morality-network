"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { Console } from "./Console";
import { CpuMeter } from "./CpuMeter";
import { AnalogClock } from "./AnalogClock";

/**
 * DesktopFrame — wraps the entire site in a SunOS desktop frame.
 *
 * Layout:
 *   ┌─[Console]──────────────[EN TOOLS HELP INFO]──[Clock]─┐
 *   │                                                       │
 *   │              ( site content: header, masthead,        │
 *   │                FrameMaker document window, etc. )     │
 *   │                                                       │
 *   │  [CPU meter]                                          │
 *   └───────────────────────────────────────────────────────┘
 *
 * The top strip is in document flow so the header sits below it.
 * The CPU meter is fixed bottom-left and overlays content.
 */
export function DesktopFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen">
      {/* ── Top desktop strip ── */}
      <div className="flex items-start justify-between px-2 py-1 gap-2 border-b border-[var(--rule-soft)]">
        <div className="hidden md:block">
          <Console />
        </div>
        <div className="md:hidden font-mono text-[10px] uppercase tracking-wider px-1 py-1">
          upernavik# pooter.world
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-2 h-2 border border-[var(--ink)] bg-[var(--ink)]" />
              EN
            </span>
            <span className="text-[var(--rule-soft)]">|</span>
            <Link href="/style-guide" className="hover:underline">TOOLS</Link>
            <span className="text-[var(--rule-soft)]">|</span>
            <Link href="/architecture" className="hover:underline">HELP</Link>
            <span className="text-[var(--rule-soft)]">|</span>
            <Link href="/status" className="hover:underline">INFO</Link>
          </div>
          <AnalogClock size={44} />
        </div>
      </div>

      {/* ── Main desktop surface ── */}
      {children}

      {/* ── Bottom-left CPU meter — floating, decorative ── */}
      <div
        className="hidden lg:block fixed bottom-2 left-2 z-30 pointer-events-none"
        aria-hidden
      >
        <div className="pointer-events-auto">
          <CpuMeter />
        </div>
      </div>
    </div>
  );
}
