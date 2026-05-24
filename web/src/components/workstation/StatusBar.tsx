"use client";

/**
 * StatusBar — bottom strip.
 * Renders: page indicator, CPU meter, agent activity ticker.
 * Lives below the document window. Reads like a system status strip.
 */
import { CpuMeter } from "./CpuMeter";

export interface StatusBarProps {
  page?: string;
  totalPages?: number;
  ticker?: string;
}

export function StatusBar({
  page = "1",
  totalPages = 26,
  ticker = "agents/pooter1: idle  | hub: ready  | indexer: synced",
}: StatusBarProps) {
  return (
    <div className="statusbar" role="status">
      <div className="statusbar-cell">
        <span>Page</span>
        <span className="font-terminal">
          {page} of {totalPages}
        </span>
      </div>
      <div className="statusbar-cell">
        <CpuMeter label="cpu" value="100" />
      </div>
      <div className="statusbar-cell">
        <CpuMeter label="net" value="42" />
      </div>
      <div className="statusbar-cell flex-1 overflow-hidden">
        <span className="font-terminal truncate">{ticker}</span>
      </div>
      <div className="statusbar-cell" style={{ borderRight: "none" }}>
        <span className="font-chrome-tiny">POOTER.FRM</span>
      </div>
    </div>
  );
}
