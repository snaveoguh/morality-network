"use client";

/**
 * MO Glyph Loader — pixel-art logo with heartbeat pulse animation.
 * The glyph is reconstructed as SVG rects from the mo.network brand glyph.
 * Each pixel pulses with a staggered heartbeat effect.
 */

// Pixel grid representation of the MO glyph (14x14 grid, 1 = filled)
// Reconstructed from the mo.network brand/glyph.png
const GLYPH: number[][] = [
  [0,0,0,0,1,0,0,0,0,0,1,0,0,0],
  [0,0,0,1,1,0,0,0,0,0,1,1,0,0],
  [0,0,1,1,1,1,1,1,1,1,1,1,1,0],
  [0,1,1,1,0,0,0,0,0,0,1,1,1,0],
  [0,1,1,0,0,1,0,0,1,0,0,1,1,0],
  [1,1,1,0,0,1,1,1,1,0,0,1,1,1],
  [1,1,0,0,0,0,1,1,0,0,0,0,1,1],
  [1,1,0,0,0,0,0,0,0,0,0,0,1,1],
  [1,1,0,0,1,0,0,0,0,1,0,0,1,1],
  [1,1,1,0,0,1,0,0,1,0,0,1,1,1],
  [0,1,1,0,0,0,1,1,0,0,0,1,1,0],
  [0,1,1,1,0,0,0,0,0,0,1,1,1,0],
  [0,0,1,1,1,1,1,1,1,1,1,1,0,0],
  [0,0,0,1,1,1,1,1,1,1,1,0,0,0],
];

const PIXEL_SIZE = 4;
const GRID_W = GLYPH[0].length;
const GRID_H = GLYPH.length;

interface MoLoaderProps {
  size?: number; // scale multiplier (default 1 = 56px)
  className?: string;
}

export function MoLoader({ size = 1, className }: MoLoaderProps) {
  const scale = size * PIXEL_SIZE;
  const w = GRID_W * scale;
  const h = GRID_H * scale;

  return (
    <div className={`flex items-center justify-center ${className || ""}`}>
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${GRID_W * PIXEL_SIZE} ${GRID_H * PIXEL_SIZE}`}
        xmlns="http://www.w3.org/2000/svg"
        className="mo-heartbeat"
        style={{ imageRendering: "pixelated" }}
      >
        {GLYPH.flatMap((row, y) =>
          row.map((cell, x) =>
            cell ? (
              <rect
                key={`${x}-${y}`}
                x={x * PIXEL_SIZE}
                y={y * PIXEL_SIZE}
                width={PIXEL_SIZE}
                height={PIXEL_SIZE}
                fill="var(--ink)"
                className="mo-pixel"
                style={{
                  animationDelay: `${(x + y) * 30}ms`,
                }}
              />
            ) : null
          )
        )}
      </svg>
    </div>
  );
}
