"use client";

import { useEffect, useState } from "react";

/**
 * Analog clock — pixel-crisp SunOS-style clock face.
 * Sits in the top-right of the desktop frame.
 */
export function AnalogClock({ size = 44 }: { size?: number }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    function tick() {
      setNow(new Date());
    }
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 2;

  // Render with default 12:00 on server so hydration matches
  const seconds = now ? now.getSeconds() : 0;
  const minutes = now ? now.getMinutes() + seconds / 60 : 0;
  const hours = now ? (now.getHours() % 12) + minutes / 60 : 0;

  const hAngle = (hours / 12) * Math.PI * 2 - Math.PI / 2;
  const mAngle = (minutes / 60) * Math.PI * 2 - Math.PI / 2;
  const sAngle = (seconds / 60) * Math.PI * 2 - Math.PI / 2;

  const hLen = r * 0.5;
  const mLen = r * 0.75;
  const sLen = r * 0.85;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ display: "block", imageRendering: "pixelated" }}
      shapeRendering="crispEdges"
      aria-label="clock"
    >
      <circle cx={cx} cy={cy} r={r} stroke="var(--ink)" strokeWidth={1} fill="var(--bg)" />
      {/* hour marks (12, 3, 6, 9) */}
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2 - Math.PI / 2;
        const x1 = cx + Math.cos(a) * (r - 1);
        const y1 = cy + Math.sin(a) * (r - 1);
        const x2 = cx + Math.cos(a) * (r - 4);
        const y2 = cy + Math.sin(a) * (r - 4);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--ink)" strokeWidth={1} />;
      })}
      {/* hour hand */}
      <line
        x1={cx}
        y1={cy}
        x2={cx + Math.cos(hAngle) * hLen}
        y2={cy + Math.sin(hAngle) * hLen}
        stroke="var(--ink)"
        strokeWidth={2}
      />
      {/* minute hand */}
      <line
        x1={cx}
        y1={cy}
        x2={cx + Math.cos(mAngle) * mLen}
        y2={cy + Math.sin(mAngle) * mLen}
        stroke="var(--ink)"
        strokeWidth={1}
      />
      {/* second hand */}
      {now && (
        <line
          x1={cx}
          y1={cy}
          x2={cx + Math.cos(sAngle) * sLen}
          y2={cy + Math.sin(sAngle) * sLen}
          stroke="var(--ink)"
          strokeWidth={1}
        />
      )}
      <circle cx={cx} cy={cy} r={1.5} fill="var(--ink)" />
    </svg>
  );
}
