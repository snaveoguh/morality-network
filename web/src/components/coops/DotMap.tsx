import type { Society, Town } from "@/lib/coops/types";

// Registered offices plotted by latitude/longitude (equirectangular, scaled
// by cos(lat) so distances look right at the area's latitude). No basemap: the
// shape of the coast emerges from the dots, and town labels give bearings.
//
// Small sets draw one dot per society. Large sets (the UK) are binned into a
// grid and each occupied square gets one dot whose area is proportional to
// its count, so the page never carries thousands of circles.

const BIN_ABOVE = 600;
const W = 1000;

interface Dot {
  key: string;
  x: number;
  y: number;
  r: number;
  label: string;
}

export function DotMap({
  societies,
  towns,
  title,
  source,
  className = "",
}: {
  societies: Society[];
  towns: Town[];
  title: string;
  source: string;
  className?: string;
}) {
  const placed = societies.filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng));
  if (placed.length === 0) return null;

  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const s of placed) {
    if (s.lat < minLat) minLat = s.lat;
    if (s.lat > maxLat) maxLat = s.lat;
    if (s.lng < minLng) minLng = s.lng;
    if (s.lng > maxLng) maxLng = s.lng;
  }
  const pad = Math.max(0.04, (maxLat - minLat) * 0.02);
  minLat -= pad;
  maxLat += pad;
  minLng -= pad;
  maxLng += pad;
  const kx = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const H = Math.round((W * (maxLat - minLat)) / ((maxLng - minLng) * kx));
  const x = (lng: number) => ((lng - minLng) / (maxLng - minLng)) * W;
  const y = (lat: number) => ((maxLat - lat) / (maxLat - minLat)) * H;

  // A tall map is capped in height on screen, so scale labels to stay legible.
  const k = Math.max(1, H / 1000);
  const binned = placed.length > BIN_ABOVE;

  let dots: Dot[];
  if (binned) {
    const cell = 16 * k;
    const bins = new Map<string, { sx: number; sy: number; count: number; names: string[] }>();
    for (const s of placed) {
      const px = x(s.lng);
      const py = y(s.lat);
      const key = `${Math.floor(px / cell)}:${Math.floor(py / cell)}`;
      const bin = bins.get(key) ?? { sx: 0, sy: 0, count: 0, names: [] };
      bin.sx += px;
      bin.sy += py;
      bin.count += 1;
      if (bin.names.length < 3) bin.names.push(s.name);
      bins.set(key, bin);
    }
    const max = Math.max(...[...bins.values()].map((b) => b.count));
    const rMin = 2.5 * k;
    const rMax = cell * 1.6;
    dots = [...bins.entries()]
      .sort((a, b) => b[1].count - a[1].count) // big dots underneath
      .map(([key, b]) => ({
        key,
        x: b.sx / b.count,
        y: b.sy / b.count,
        r: rMin + (rMax - rMin) * Math.sqrt((b.count - 1) / Math.max(1, max - 1)),
        label:
          b.count === 1
            ? b.names[0]
            : `${b.count} societies, including ${b.names.slice(0, 2).join(" and ")}`,
      }));
  } else {
    dots = placed.map((s) => ({
      key: s.regNo,
      x: x(s.lng),
      y: y(s.lat),
      r: 7 * k,
      label: `${s.name} — ${s.district}`,
    }));
  }

  return (
    <figure className={`bg-[#f2ede2] p-4 text-[#0d0d0d] sm:p-5 ${className}`}>
      <figcaption className="font-headline text-lg leading-snug">{title}</figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-4 h-auto max-h-[760px] w-full"
        role="img"
        aria-label={title}
      >
        {dots.map((d) => (
          <circle key={d.key} cx={Math.round(d.x)} cy={Math.round(d.y)} r={Math.round(d.r * 10) / 10} fill="#0d0d0d" fillOpacity={binned ? 0.5 : 0.55}>
            <title>{d.label}</title>
          </circle>
        ))}
        {towns
          .filter((t) => t.lat > minLat && t.lat < maxLat && t.lng > minLng && t.lng < maxLng)
          .map((t) => (
            <text
              key={t.name}
              x={x(t.lng) + (t.anchor === "start" ? 6 : t.anchor === "end" ? -6 : 0) * k}
              y={y(t.lat) - 14 * k}
              textAnchor={t.anchor ?? "middle"}
              fontSize={22 * k}
              fontFamily="Inter, sans-serif"
              fill="#0d0d0d"
              stroke="#f2ede2"
              strokeWidth={5 * k}
              paintOrder="stroke"
            >
              {t.name}
            </text>
          ))}
      </svg>
      <p className="mt-3 text-xs text-[#0d0d0d]/70">
        {binned ? "Larger dots mean more societies in that part of the map. " : ""}
        {source}
      </p>
    </figure>
  );
}
