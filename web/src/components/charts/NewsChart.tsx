import type { ReactNode } from "react";
import type { ChartPoint, ChartSpec } from "@/lib/charts/types";

// ============================================================================
// NEWS CHART — server-rendered SVG, no chart library.
//
// pooter-brand Charts rules: cream panel, black marks, one ink colour, a title
// that states the finding, and a source line with the date + "updates live".
// The panel keeps fixed colours in both themes — it is a printed insert, so
// there is never red text on black.
//
// Mobile-first: every chart draws on a 360-unit-wide viewBox and scales to
// the column, so type and bars are sized for a phone and simply grow wider.
// ============================================================================

const W = 360;
const INK = "#0d0d0d";
const FAINT = "#6e6a61";
const GRID = "#dcd5c5";
const PAPER = "#f5f0e4";
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "var(--font-inter), 'Helvetica Neue', Arial, sans-serif";

/** Integer step that gives roughly `target` gridlines up to `max`. */
function niceStep(max: number, target = 4): number {
  if (max <= 0) return 1;
  const raw = max / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return Math.max(1, step * mag);
}

function axisTicks(max: number): { top: number; ticks: number[] } {
  const step = niceStep(max);
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks: number[] = [];
  for (let t = 0; t <= top; t += step) ticks.push(t);
  return { top, ticks };
}

function fmt(n: number): string {
  return n.toLocaleString("en-GB");
}

function truncate(label: string, max: number): string {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

/** Show at most ~6 x labels, always including the last. */
function showXLabel(i: number, n: number): boolean {
  const every = Math.ceil(n / 6);
  return i === n - 1 || (i % every === 0 && n - 1 - i >= every / 2);
}

function BarChart({ data, title }: { data: ChartPoint[]; title: string }) {
  const labelW = 112;
  const valueW = 40;
  const row = 24;
  const barH = 14;
  const top = 4;
  const max = Math.max(1, ...data.map((d) => d.value));
  const span = W - labelW - valueW;
  const h = top + data.length * row;

  return (
    <svg viewBox={`0 0 ${W} ${h}`} width="100%" role="img" aria-label={title}>
      {data.map((d, i) => {
        const y = top + i * row;
        const w = Math.max(d.value > 0 ? 1.5 : 0, (d.value / max) * span);
        return (
          <g key={d.label}>
            <text x={0} y={y + barH - 3} fontSize={11} fill={INK} fontFamily={SANS}>
              {truncate(d.label, 19)}
            </text>
            <rect x={labelW} y={y} width={w} height={barH} fill={INK} />
            <text
              x={labelW + w + 4}
              y={y + barH - 3}
              fontSize={11}
              fill={INK}
              fontFamily={SANS}
              fontWeight={600}
            >
              {fmt(d.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Shared frame for column + line: y gridlines on the left, labels below. */
function Plot({
  data,
  title,
  children,
}: {
  data: ChartPoint[];
  title: string;
  children: (geo: { x: (i: number) => number; y: (v: number) => number; step: number; base: number }) => ReactNode;
}) {
  const h = 200;
  const left = 30;
  const right = 8;
  const topPad = 14;
  const base = h - 22;
  const { top, ticks } = axisTicks(Math.max(0, ...data.map((d) => d.value)));
  const step = (W - left - right) / Math.max(1, data.length);
  const x = (i: number) => left + step * i + step / 2;
  const y = (v: number) => base - (v / top) * (base - topPad);

  return (
    <svg viewBox={`0 0 ${W} ${h}`} width="100%" role="img" aria-label={title}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={left} x2={W - right} y1={y(t)} y2={y(t)} stroke={t === 0 ? INK : GRID} strokeWidth={t === 0 ? 1 : 0.75} />
          <text x={left - 4} y={y(t) + 3.5} fontSize={10} fill={FAINT} textAnchor="end" fontFamily={SANS}>
            {fmt(t)}
          </text>
        </g>
      ))}
      {children({ x, y, step, base })}
      {data.map((d, i) =>
        showXLabel(i, data.length) ? (
          <text key={`${d.label}-${i}`} x={x(i)} y={h - 6} fontSize={10} fill={FAINT} textAnchor="middle" fontFamily={SANS}>
            {d.label}
          </text>
        ) : null,
      )}
    </svg>
  );
}

function ColumnChart({ data, title }: { data: ChartPoint[]; title: string }) {
  const labelValues = data.length <= 12;
  return (
    <Plot data={data} title={title}>
      {({ x, y, step, base }) =>
        data.map((d, i) => {
          const bw = Math.min(28, step * 0.7);
          return (
            <g key={`${d.label}-${i}`}>
              <rect x={x(i) - bw / 2} y={y(d.value)} width={bw} height={base - y(d.value)} fill={INK} />
              {labelValues && (
                <text x={x(i)} y={y(d.value) - 3} fontSize={9.5} fill={INK} textAnchor="middle" fontFamily={SANS} fontWeight={600}>
                  {fmt(d.value)}
                </text>
              )}
            </g>
          );
        })
      }
    </Plot>
  );
}

function LineChart({ data, title }: { data: ChartPoint[]; title: string }) {
  return (
    <Plot data={data} title={title}>
      {({ x, y }) => {
        const last = data.length - 1;
        const points = data.map((d, i) => `${x(i)},${y(d.value)}`).join(" ");
        return (
          <>
            <polyline points={points} fill="none" stroke={INK} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {last >= 0 && (
              <>
                <circle cx={x(last)} cy={y(data[last].value)} r={3} fill={INK} />
                <text x={x(last) - 5} y={y(data[last].value) - 7} fontSize={10.5} fill={INK} textAnchor="end" fontFamily={SANS} fontWeight={600}>
                  {fmt(data[last].value)}
                </text>
              </>
            )}
          </>
        );
      }}
    </Plot>
  );
}

function formatAsOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })}, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC`;
}

export function NewsChart({ chart }: { chart: ChartSpec }) {
  const { kind, title, data } = chart;
  return (
    <figure
      id={chart.id}
      className="mx-auto w-full max-w-2xl scroll-mt-20 border-t-2 px-4 pb-3 pt-3 sm:px-5"
      style={{ background: PAPER, borderColor: INK, color: INK }}
    >
      <h3 className="text-lg font-bold leading-snug sm:text-xl" style={{ fontFamily: SERIF }}>
        {title}
      </h3>
      {chart.dek && (
        <p className="mt-1 text-sm leading-snug" style={{ fontFamily: SERIF, color: FAINT }}>
          {chart.dek}
        </p>
      )}
      {/* Cap the drawing so viewBox scaling never pushes type past ~1.3x. */}
      <div className="mt-3 max-w-[480px]">
        {data.length === 0 ? (
          <p className="py-6 text-sm" style={{ color: FAINT }}>No data yet.</p>
        ) : kind === "bar" ? (
          <BarChart data={data} title={title} />
        ) : kind === "column" ? (
          <ColumnChart data={data} title={title} />
        ) : (
          <LineChart data={data} title={title} />
        )}
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">{kind === "bar" ? "Category" : "Period"}</th>
            <th scope="col">{chart.unit}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d, i) => (
            <tr key={`${d.label}-${i}`}>
              <td>{d.label}</td>
              <td>{d.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {chart.note && (
        <p className="mt-2 text-xs leading-snug" style={{ color: FAINT }}>
          {chart.note}
        </p>
      )}
      <figcaption
        className="mt-2 border-t pt-1.5 font-mono text-[10px] uppercase tracking-[0.12em]"
        style={{ borderColor: GRID, color: FAINT }}
      >
        Source:{" "}
        {chart.source.href ? (
          <a href={chart.source.href} className="underline underline-offset-2" style={{ color: INK }}>
            {chart.source.name}
          </a>
        ) : (
          chart.source.name
        )}
        {" · "}
        {formatAsOf(chart.asOf)} · updates live
      </figcaption>
    </figure>
  );
}
