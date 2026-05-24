"use client";

/**
 * CpuMeter — animated SVG sine waveform.
 * The classic 1989 SunOS cpu meter loop. Pure SVG, animated via CSS.
 */
import { useId } from "react";

export interface CpuMeterProps {
  /** label rendered to the left of the trace (default "cpu") */
  label?: string;
  /** numeric reading rendered after the trace (default 100) */
  value?: number | string;
  /** width in px */
  width?: number;
  /** height in px */
  height?: number;
}

export function CpuMeter({
  label = "cpu",
  value = 100,
  width = 56,
  height = 14,
}: CpuMeterProps) {
  const id = useId();
  // build a repeating zig-zag/sine path wide enough to scroll
  const segments = 24;
  const segWidth = 4;
  const mid = height / 2;
  let d = `M 0 ${mid}`;
  for (let i = 0; i < segments * 2; i++) {
    const x = (i + 1) * segWidth;
    const y = i % 2 === 0 ? 2 : height - 2;
    d += ` L ${x} ${y}`;
  }
  const totalWidth = segments * 2 * segWidth;

  return (
    <span className="inline-flex items-center gap-1 font-terminal" aria-label={`${label} ${value}`}>
      <span>{label}</span>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="cpu-wave"
        style={{ overflow: "hidden" }}
      >
        <clipPath id={`clip-${id}`}>
          <rect x={0} y={0} width={width} height={height} />
        </clipPath>
        <g clipPath={`url(#clip-${id})`}>
          <path d={d} fill="none" stroke="currentColor" strokeWidth={1} />
          <path
            d={d}
            fill="none"
            stroke="currentColor"
            strokeWidth={1}
            transform={`translate(${totalWidth} 0)`}
          />
        </g>
      </svg>
      <span>{value}</span>
    </span>
  );
}
