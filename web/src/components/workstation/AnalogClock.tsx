"use client";

/**
 * AnalogClock — animated SVG clock face for the top-right.
 * Ticks once per minute; hour/minute hands derived from current time.
 * Hydration-safe: renders empty face on server, fills hands on client mount.
 */
import { useEffect, useState } from "react";

export interface AnalogClockProps {
  size?: number;
}

export function AnalogClock({ size = 18 }: AnalogClockProps) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const hours = now ? now.getHours() % 12 : 0;
  const minutes = now ? now.getMinutes() : 0;
  const hourAngle = (hours + minutes / 60) * 30 - 90;
  const minuteAngle = minutes * 6 - 90;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 1;
  const hourLen = r * 0.5;
  const minuteLen = r * 0.78;

  const hourX = cx + hourLen * Math.cos((hourAngle * Math.PI) / 180);
  const hourY = cy + hourLen * Math.sin((hourAngle * Math.PI) / 180);
  const minX = cx + minuteLen * Math.cos((minuteAngle * Math.PI) / 180);
  const minY = cy + minuteLen * Math.sin((minuteAngle * Math.PI) / 180);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-label="clock"
      role="img"
    >
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" strokeWidth={1} />
      {/* 12, 3, 6, 9 tick marks */}
      <line x1={cx} y1={1} x2={cx} y2={3} stroke="currentColor" strokeWidth={1} />
      <line x1={size - 1} y1={cy} x2={size - 3} y2={cy} stroke="currentColor" strokeWidth={1} />
      <line x1={cx} y1={size - 1} x2={cx} y2={size - 3} stroke="currentColor" strokeWidth={1} />
      <line x1={1} y1={cy} x2={3} y2={cy} stroke="currentColor" strokeWidth={1} />
      {now ? (
        <>
          <line x1={cx} y1={cy} x2={hourX} y2={hourY} stroke="currentColor" strokeWidth={1.5} />
          <line x1={cx} y1={cy} x2={minX} y2={minY} stroke="currentColor" strokeWidth={1} />
        </>
      ) : null}
    </svg>
  );
}
