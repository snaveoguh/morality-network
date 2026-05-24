"use client";

import { useEffect, useState } from "react";

/**
 * NeXT-style analog clock for the dock.
 * Tiny 48x48 bevel-framed face with hour + minute hands.
 * Re-renders every 30s to keep DOM thrash low.
 */
export function NeXTClock() {
  const [date, setDate] = useState<Date | null>(null);

  useEffect(() => {
    setDate(new Date());
    const id = setInterval(() => setDate(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  // SSR safe placeholder — render the face even before date hydrates
  const hours = date ? date.getHours() % 12 : 0;
  const minutes = date ? date.getMinutes() : 0;

  // Hands angles
  const minuteAngle = minutes * 6;
  const hourAngle = hours * 30 + minutes * 0.5;

  return (
    <div className="dock-tile flex h-12 w-12 items-center justify-center" title="Clock">
      <svg width="38" height="38" viewBox="0 0 38 38" shapeRendering="geometricPrecision">
        {/* face */}
        <circle cx="19" cy="19" r="17" fill="#FFFFFF" stroke="#000" strokeWidth="1" />
        {/* tick marks */}
        {Array.from({ length: 12 }).map((_, i) => {
          const a = (i * 30 * Math.PI) / 180;
          const r1 = 14;
          const r2 = 16;
          const x1 = 19 + Math.sin(a) * r1;
          const y1 = 19 - Math.cos(a) * r1;
          const x2 = 19 + Math.sin(a) * r2;
          const y2 = 19 - Math.cos(a) * r2;
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="#000"
              strokeWidth={i % 3 === 0 ? 1.6 : 0.8}
            />
          );
        })}
        {/* hour hand */}
        <line
          x1="19"
          y1="19"
          x2={19 + Math.sin((hourAngle * Math.PI) / 180) * 8}
          y2={19 - Math.cos((hourAngle * Math.PI) / 180) * 8}
          stroke="#000"
          strokeWidth="2"
          strokeLinecap="square"
        />
        {/* minute hand */}
        <line
          x1="19"
          y1="19"
          x2={19 + Math.sin((minuteAngle * Math.PI) / 180) * 12}
          y2={19 - Math.cos((minuteAngle * Math.PI) / 180) * 12}
          stroke="#000"
          strokeWidth="1.4"
          strokeLinecap="square"
        />
        {/* center pin */}
        <circle cx="19" cy="19" r="1.3" fill="#CC0000" />
      </svg>
    </div>
  );
}
