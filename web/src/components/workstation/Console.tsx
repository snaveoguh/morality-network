"use client";

import { useEffect, useState } from "react";

const FAKE_LINES = [
  "upernavik# screendump",
  "upernavik# ls -la /usr/frame/bin/",
  "upernavik# tail -f /var/log/pooter.log",
  "[pooter1] editorial.draft: composing daily edition",
  "[hyperliquid] tick: ETH/USD 3,412.18 +0.4%",
  "[indexer] block 28,944,712 archived",
  "[hub] inference: 12 prompts/min, $0.04/min",
  "[newsroom] cron: bias-digest computed",
  "[pooter1] post: cast queued for farcaster",
  "upernavik# screendump",
];

/**
 * Console window — small live-activity terminal in the top-left.
 * Shows fake-but-thematic agent log lines.
 */
export function Console() {
  const [lineIdx, setLineIdx] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setLineIdx((i) => (i + 1) % FAKE_LINES.length);
    }, 2400);
    return () => window.clearInterval(id);
  }, []);

  // Show two visible lines: the current "command" and a static prompt
  const current = FAKE_LINES[lineIdx];

  return (
    <div className="win" style={{ width: 240 }}>
      <div className="win-titlebar">
        <div className="win-titlebar-corner" aria-hidden />
        <div className="win-titlebar-text">
          <span>console</span>
        </div>
        <div className="win-titlebar-corner right" aria-hidden />
      </div>
      <div
        className="win-body"
        style={{
          padding: "4px 6px",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          lineHeight: "13px",
          minHeight: 44,
          background: "var(--bg)",
        }}
      >
        <div>{current}</div>
        <div>
          upernavik# <span className="console-cursor">_</span>
        </div>
      </div>
    </div>
  );
}
