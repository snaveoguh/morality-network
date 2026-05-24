"use client";

import type { ReactNode } from "react";

/**
 * A NeXT-style window with etched dark slate title bar.
 *
 *  ┌──────────────────────────────────────────────┐
 *  │ ◢◣  Pooter Reader — daily-edition.po    ◢◣  │  <- titlebar (etched scan lines)
 *  ├──────────────────────────────────────────────┤
 *  │                                               │
 *  │   content                                     │
 *  │                                               │
 *  ├──────────────────────────────────────────────┤
 *  │ status bar                                    │
 *  └──────────────────────────────────────────────┘
 */

type Props = {
  title: string;
  subtitle?: string;
  statusBar?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function NeXTWindow({
  title,
  subtitle,
  statusBar,
  children,
  className = "",
}: Props) {
  return (
    <div className={`next-window ${className}`}>
      {/* Title bar */}
      <div className="titlebar flex h-6 items-center px-1.5 select-none">
        {/* Close button — NeXT triangular arrow style */}
        <button
          type="button"
          className="titlebar-button"
          aria-label="Close window"
          title="Close"
        >
          <svg
            width="8"
            height="8"
            viewBox="0 0 8 8"
            shapeRendering="crispEdges"
            aria-hidden
          >
            <rect x="1" y="1" width="6" height="6" fill="#444" />
            <rect x="2" y="2" width="4" height="1" fill="#000" />
            <rect x="2" y="5" width="4" height="1" fill="#000" />
            <rect x="2" y="2" width="1" height="4" fill="#000" />
            <rect x="5" y="2" width="1" height="4" fill="#000" />
          </svg>
        </button>

        <div className="mx-2 flex-1 truncate text-center titlebar-text text-[11px]">
          {title}
          {subtitle ? (
            <span className="ml-2 opacity-70 text-[10px] font-normal">
              {subtitle}
            </span>
          ) : null}
        </div>

        {/* Zoom button — NeXT square in square */}
        <button
          type="button"
          className="titlebar-button"
          aria-label="Zoom window"
          title="Zoom"
        >
          <svg
            width="8"
            height="8"
            viewBox="0 0 8 8"
            shapeRendering="crispEdges"
            aria-hidden
          >
            <rect x="0" y="0" width="8" height="8" fill="#444" />
            <rect x="1" y="1" width="6" height="6" fill="none" stroke="#000" strokeWidth="1" />
            <rect x="3" y="3" width="2" height="2" fill="#000" />
          </svg>
        </button>
      </div>

      {/* Content area */}
      <div className="bg-[var(--bg)]">{children}</div>

      {/* Status bar */}
      {statusBar ? (
        <div className="next-panel border-t border-black/30 px-2 py-1 text-[10px] text-[var(--ink-soft)] font-mono">
          {statusBar}
        </div>
      ) : null}
    </div>
  );
}
