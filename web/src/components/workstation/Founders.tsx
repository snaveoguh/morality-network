/**
 * Founders portraits — the four cartoon line-drawings from the FrameMaker 1.0
 * Demo.doc reference image. Steve (mouse), Charles (lion), Vickie (cat),
 * David (dog). Drawn as 1-bit SVG line art.
 *
 * Pooter reuse: these stand in for the platform's "operators" — the agents
 * and humans who steward the system. Names are kept as a wink to the source.
 */

function Mouse() {
  return (
    <svg viewBox="0 0 60 60" width="60" height="60" shapeRendering="crispEdges" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round">
      {/* head */}
      <ellipse cx="30" cy="34" rx="14" ry="11" />
      {/* ears */}
      <circle cx="20" cy="22" r="6" />
      <circle cx="40" cy="22" r="6" />
      {/* inner ears */}
      <circle cx="20" cy="22" r="2.5" />
      <circle cx="40" cy="22" r="2.5" />
      {/* eyes */}
      <circle cx="25" cy="32" r="1" fill="currentColor" />
      <circle cx="35" cy="32" r="1" fill="currentColor" />
      {/* nose */}
      <ellipse cx="30" cy="38" rx="2" ry="1.2" fill="currentColor" />
      {/* mouth */}
      <path d="M30 39 Q26 43 24 42 M30 39 Q34 43 36 42" />
      {/* whiskers */}
      <path d="M22 39 L14 38 M22 41 L14 42 M38 39 L46 38 M38 41 L46 42" />
    </svg>
  );
}

function Lion() {
  return (
    <svg viewBox="0 0 60 60" width="60" height="60" shapeRendering="crispEdges" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round">
      {/* mane (zig-zag circle) */}
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (i / 12) * Math.PI * 2;
        const cx = 30 + Math.cos(a) * 22;
        const cy = 30 + Math.sin(a) * 22;
        const cx2 = 30 + Math.cos(a + 0.26) * 22;
        const cy2 = 30 + Math.sin(a + 0.26) * 22;
        const mx = 30 + Math.cos(a + 0.13) * 16;
        const my = 30 + Math.sin(a + 0.13) * 16;
        return <path key={i} d={`M${cx} ${cy} L${mx} ${my} L${cx2} ${cy2}`} />;
      })}
      {/* face */}
      <circle cx="30" cy="30" r="13" />
      {/* eyes */}
      <circle cx="25" cy="28" r="1" fill="currentColor" />
      <circle cx="35" cy="28" r="1" fill="currentColor" />
      {/* nose triangle */}
      <path d="M30 32 L28 34 L32 34 Z" fill="currentColor" />
      {/* mouth */}
      <path d="M30 34 L30 36 M30 36 Q27 38 25 37 M30 36 Q33 38 35 37" />
    </svg>
  );
}

function Cat() {
  return (
    <svg viewBox="0 0 60 60" width="60" height="60" shapeRendering="crispEdges" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round">
      {/* head */}
      <path d="M16 38 Q14 18 22 14 L30 22 L38 14 Q46 18 44 38 Q44 48 30 48 Q16 48 16 38 Z" />
      {/* ears (inner) */}
      <path d="M19 18 L22 14 L24 22 Z" />
      <path d="M41 18 L38 14 L36 22 Z" />
      {/* eyes — almond */}
      <path d="M22 30 Q25 27 28 30 Q25 33 22 30 Z" />
      <path d="M32 30 Q35 27 38 30 Q35 33 32 30 Z" />
      <circle cx="25" cy="30" r="0.8" fill="currentColor" />
      <circle cx="35" cy="30" r="0.8" fill="currentColor" />
      {/* nose */}
      <path d="M30 35 L28 37 L32 37 Z" fill="currentColor" />
      {/* mouth */}
      <path d="M30 37 L30 39 M30 39 Q27 41 25 40 M30 39 Q33 41 35 40" />
      {/* whiskers */}
      <path d="M20 36 L14 35 M20 38 L14 39 M40 36 L46 35 M40 38 L46 39" />
    </svg>
  );
}

function Dog() {
  return (
    <svg viewBox="0 0 60 60" width="60" height="60" shapeRendering="crispEdges" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round">
      {/* floppy ears */}
      <path d="M14 18 Q10 32 16 40 L20 32 Z" fill="currentColor" />
      <path d="M46 18 Q50 32 44 40 L40 32 Z" fill="currentColor" />
      {/* head */}
      <ellipse cx="30" cy="32" rx="14" ry="13" />
      {/* eyes */}
      <circle cx="25" cy="29" r="1.2" fill="currentColor" />
      <circle cx="35" cy="29" r="1.2" fill="currentColor" />
      {/* snout */}
      <ellipse cx="30" cy="40" rx="6" ry="4" />
      {/* nose */}
      <ellipse cx="30" cy="38" rx="2" ry="1.3" fill="currentColor" />
      {/* mouth */}
      <path d="M30 41 L30 43 M30 43 Q27 45 25 44 M30 43 Q33 45 35 44" />
      {/* tongue */}
      <path d="M30 44 Q31 47 32 45" />
    </svg>
  );
}

const FOUNDERS = [
  { name: "Steve", role: "the mouse", draw: Mouse },
  { name: "Charles", role: "the lion", draw: Lion },
  { name: "Vickie", role: "the cat", draw: Cat },
  { name: "David", role: "the dog", draw: Dog },
];

export function Founders() {
  return (
    <figure className="my-4">
      <div className="grid grid-cols-2 gap-0 border border-[var(--ink)] mx-auto" style={{ maxWidth: 280 }}>
        {FOUNDERS.map((f, i) => {
          const Draw = f.draw;
          return (
            <div
              key={f.name}
              className="flex flex-col items-center justify-end gap-1 p-2"
              style={{
                borderRight: i % 2 === 0 ? "1px solid var(--ink)" : "none",
                borderBottom: i < 2 ? "1px solid var(--ink)" : "none",
                color: "var(--ink)",
              }}
            >
              <Draw />
              <div className="font-mono text-[9px] uppercase tracking-wider">{f.name}</div>
            </div>
          );
        })}
      </div>
      <figcaption className="fm-caption">Figure 1: The founders</figcaption>
    </figure>
  );
}
