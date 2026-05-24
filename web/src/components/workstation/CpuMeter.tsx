"use client";

import { useEffect, useState } from "react";

/**
 * CPU activity monitor — animated SVG waveform.
 * Sits in the bottom-left corner of the desktop frame.
 */
export function CpuMeter({ width = 160, height = 48 }: { width?: number; height?: number }) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    let raf: number;
    let t = 0;
    function tick() {
      t += 0.05;
      setPhase(t);
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // 40-sample waveform — combines a slow sine + jittered noise (steps for retro feel)
  const samples = 40;
  const points: string[] = [];
  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * width;
    const a = Math.sin(phase + i * 0.55) * 0.35;
    const b = Math.sin(phase * 0.7 + i * 1.3) * 0.25;
    const jitter = ((i * 9301 + 49297) % 233280) / 233280; // deterministic noise
    const y = height / 2 + (a + b + (jitter - 0.5) * 0.4) * (height * 0.35);
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }

  return (
    <div className="win" style={{ width: width + 18 }}>
      <div className="win-titlebar">
        <div className="win-titlebar-corner" aria-hidden />
        <div className="win-titlebar-text">
          <span>perfmeter</span>
        </div>
      </div>
      <div className="win-body" style={{ padding: 4 }}>
        <div className="flex items-end justify-between font-mono text-[9px] leading-none px-1">
          <span>cpu</span>
          <span>100</span>
        </div>
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          style={{ display: "block", imageRendering: "pixelated" }}
          shapeRendering="crispEdges"
        >
          {/* grid */}
          {[0.25, 0.5, 0.75].map((f) => (
            <line
              key={f}
              x1={0}
              y1={height * f}
              x2={width}
              y2={height * f}
              stroke="var(--rule-soft)"
              strokeWidth={1}
            />
          ))}
          {/* baseline */}
          <line x1={0} y1={height - 0.5} x2={width} y2={height - 0.5} stroke="var(--ink)" strokeWidth={1} />
          {/* waveform */}
          <polyline
            points={points.join(" ")}
            fill="none"
            stroke="var(--ink)"
            strokeWidth={1}
            strokeLinejoin="miter"
          />
        </svg>
      </div>
    </div>
  );
}
