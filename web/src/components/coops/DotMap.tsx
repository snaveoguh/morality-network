import type { Society } from "@/lib/coops/types";

// Registered offices plotted by latitude/longitude (equirectangular, scaled
// by cos(lat) so distances look right at ~51°N). No basemap: the shape of
// the coast emerges from the dots, and town labels give bearings.

const TOWNS: Array<{ name: string; lat: number; lng: number }> = [
  { name: "Brighton", lat: 50.8225, lng: -0.1372 },
  { name: "Chichester", lat: 50.8365, lng: -0.7792 },
  { name: "Worthing", lat: 50.8179, lng: -0.3729 },
  { name: "Crawley", lat: 51.1092, lng: -0.1872 },
  { name: "Horsham", lat: 51.0629, lng: -0.3259 },
  { name: "Lewes", lat: 50.8739, lng: 0.0088 },
  { name: "Eastbourne", lat: 50.768, lng: 0.2905 },
  { name: "Hastings", lat: 50.8543, lng: 0.5735 },
];

export function DotMap({
  societies,
  title,
  source,
  className = "",
}: {
  societies: Society[];
  title: string;
  source: string;
  className?: string;
}) {
  const lats = societies.map((s) => s.lat);
  const lngs = societies.map((s) => s.lng);
  const pad = 0.04;
  const minLat = Math.min(...lats) - pad;
  const maxLat = Math.max(...lats) + pad;
  const minLng = Math.min(...lngs) - pad;
  const maxLng = Math.max(...lngs) + pad;
  const kx = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const W = 1000;
  const H = Math.round((W * (maxLat - minLat)) / ((maxLng - minLng) * kx));
  const x = (lng: number) => ((lng - minLng) / (maxLng - minLng)) * W;
  const y = (lat: number) => ((maxLat - lat) / (maxLat - minLat)) * H;

  return (
    <figure className={`bg-[#f2ede2] p-4 text-[#0d0d0d] sm:p-5 ${className}`}>
      <figcaption className="font-headline text-lg leading-snug">{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 h-auto w-full" role="img" aria-label={title}>
        {societies.map((s) => (
          <circle key={s.regNo} cx={x(s.lng)} cy={y(s.lat)} r={7} fill="#0d0d0d" fillOpacity={0.55}>
            <title>{`${s.name} — ${s.district}`}</title>
          </circle>
        ))}
        {TOWNS.filter((t) => t.lat > minLat && t.lat < maxLat && t.lng > minLng && t.lng < maxLng).map((t) => (
          <text
            key={t.name}
            x={x(t.lng)}
            y={y(t.lat) - 14}
            textAnchor="middle"
            fontSize={22}
            fontFamily="Inter, sans-serif"
            fill="#0d0d0d"
            stroke="#f2ede2"
            strokeWidth={5}
            paintOrder="stroke"
          >
            {t.name}
          </text>
        ))}
      </svg>
      <p className="mt-3 text-xs text-[#0d0d0d]/70">{source}</p>
    </figure>
  );
}
