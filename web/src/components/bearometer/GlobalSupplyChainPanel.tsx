import { getGlobalSupplySnapshot } from "@/lib/bearometer/global-supply";
import type {
  DataReading,
  GlobalLabel,
  NewsReading,
  RegionReading,
} from "@/lib/bearometer/global-supply-score";
import {
  ASSET_LABEL,
  type AssetLink,
  type DataIndicatorDef,
} from "@/lib/bearometer/global-supply-taxonomy";
import { ChinaSupplyChainBody, chinaSnapshotMeta } from "./SupplyChainPanel";

// Server component: supply-chain strain by region, with the China
// critical-minerals cards kept intact inside East Asia. Rendered under
// Suspense on /signals so slow sources never hold up the page.
// One ink colour throughout (brand rule: no red on black, no badges);
// status is plain small text.

const LABEL_TEXT: Record<GlobalLabel, string> = {
  STRAINED: "Strained",
  EASING: "Easing",
  STEADY: "Steady",
  STALE: "Out of date",
  "NO DATA": "No data",
};

const DIRECTION_MARK = { disrupting: "▲", easing: "▼", neutral: "·" } as const;

function ago(pubDate: string): string {
  const hours = Math.max(0, (Date.now() - Date.parse(pubDate)) / 3_600_000);
  if (!Number.isFinite(hours)) return "";
  if (hours < 1) return "<1h";
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

function signed(n: number, digits = 2): string {
  return `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(digits)}`;
}

function formatValue(n: number): string {
  const abs = Math.abs(n);
  return n.toLocaleString("en-GB", { maximumFractionDigits: abs >= 1000 ? 0 : abs >= 10 ? 1 : 2 });
}

function formatAsOf(date: string): string {
  const monthly = /^\d{4}-\d{2}$/.test(date);
  const d = new Date(monthly ? `${date}-01T00:00:00Z` : `${date}T00:00:00Z`);
  if (!Number.isFinite(d.getTime())) return date;
  return d.toLocaleDateString("en-GB", monthly ? { month: "short", year: "numeric", timeZone: "UTC" } : { day: "numeric", month: "short", timeZone: "UTC" });
}

function changeText(def: DataIndicatorDef, reading: DataReading): string | null {
  if (reading.change === null) return null;
  if (def.compare.kind === "level-vs") {
    const pts = Math.abs(reading.change).toFixed(1);
    return `${pts} ${reading.change >= 0 ? "above" : "below"} the ${def.compare.versus}`;
  }
  return `${signed(reading.change * 100, 0)}% vs ${def.compare.versus}`;
}

/** Pressure bar from a centre rule; one ink, grows right for strain, left for easing. */
function PressureBar({ pressure, muted = false }: { pressure: number; muted?: boolean }) {
  const width = `${Math.min(50, Math.abs(pressure) * 50)}%`;
  const side = pressure >= 0 ? { left: "50%" } : { right: "50%" };
  return (
    <span className="relative block h-2 w-full" aria-hidden>
      <span className="absolute inset-y-0 left-1/2 w-px bg-[var(--rule)]" />
      <span
        className={`absolute inset-y-0.5 ${muted ? "bg-[var(--rule-light)]" : "bg-[var(--ink)]"}`}
        style={{ ...side, width }}
      />
    </span>
  );
}

function Status({ label, pressure }: { label: GlobalLabel; pressure: number }) {
  const scored = label !== "STALE" && label !== "NO DATA";
  return (
    <span className="shrink-0 font-mono text-[10px] text-[var(--ink-light)]">
      {LABEL_TEXT[label]}
      {scored && ` ${signed(pressure)}`}
    </span>
  );
}

function Assets({ links }: { links: AssetLink[] }) {
  const order = ["documented", "plausible", "speculative"] as const;
  const groups = order
    .map((strength) => ({ strength, links: links.filter((l) => l.strength === strength) }))
    .filter((g) => g.links.length > 0);
  return (
    <p className="mt-1 text-[11px] leading-snug text-[var(--ink-faint)]">
      <span className="text-[var(--ink-light)]">When strained, has tended to move: </span>
      {groups.map((g, i) => (
        <span key={g.strength}>
          {i > 0 && "; "}
          {g.links.map((l) => `${ASSET_LABEL[l.asset]} ${l.whenStrained === "up" ? "↑" : "↓"}`).join(", ")}{" "}
          ({g.strength})
        </span>
      ))}
    </p>
  );
}

function DataRow({ reading }: { reading: DataReading }) {
  const { def } = reading;
  const change = changeText(def, reading);
  return (
    <li className="border-t border-[var(--rule-light)] py-2.5 first:border-t-0">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="text-[13px] font-bold leading-tight text-[var(--ink)]">{def.label}</h4>
        <Status label={reading.label} pressure={reading.pressure} />
      </div>
      <div className="mt-1.5">
        <PressureBar pressure={reading.pressure} muted={reading.label === "STALE" || reading.label === "NO DATA"} />
      </div>
      <p className="mt-1 font-mono text-[10px] text-[var(--ink-light)]">
        {reading.latest === null ? (
          "Source did not return data this cycle"
        ) : (
          <>
            {formatValue(reading.latest)} {def.unit}
            {change && ` · ${change}`}
            {reading.asOf && ` · ${formatAsOf(reading.asOf)}`}
          </>
        )}
      </p>
      <p className="mt-1 font-body-serif text-[12px] leading-snug text-[var(--ink)]">{def.why}</p>
      <Assets links={def.assets} />
      <p className="mt-0.5 text-[10px] text-[var(--ink-faint)]">
        <a href={def.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
          {def.sourceName}
        </a>
        {" · "}
        {def.measures}
      </p>
    </li>
  );
}

function NewsRow({ reading }: { reading: NewsReading }) {
  const { def } = reading;
  return (
    <li className="border-t border-[var(--rule-light)] py-2.5 first:border-t-0">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="text-[13px] font-bold leading-tight text-[var(--ink)]">News: {def.label}</h4>
        <Status label={reading.label} pressure={reading.pressure} />
      </div>
      <div className="mt-1.5">
        <PressureBar pressure={reading.pressure} muted={reading.label === "NO DATA"} />
      </div>
      <p className="mt-1 font-mono text-[10px] text-[var(--ink-light)]">
        {reading.itemCount} headlines, 7 days · {reading.disruptingCount} disrupting · {reading.easingCount} easing
      </p>
      <p className="mt-1 font-body-serif text-[12px] leading-snug text-[var(--ink)]">{def.why}</p>
      <Assets links={def.assets} />
      {reading.headlines.length > 0 && (
        <ul className="mt-1.5 space-y-1">
          {reading.headlines.map((h) => (
            <li key={h.id} className="font-body-serif text-[12px] leading-snug text-[var(--ink)]">
              <span className="mr-1 font-mono text-[9px] text-[var(--ink-faint)]">{DIRECTION_MARK[h.direction]}</span>
              <a href={h.link} target="_blank" rel="noopener noreferrer" className="hover:underline">
                {h.title}
              </a>
              <span className="ml-1 text-[10px] text-[var(--ink-faint)]">
                {h.source}
                {h.bias?.fundingModel === "state" && " (state)"} · {ago(h.pubDate)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function RegionOverviewRow({ region }: { region: RegionReading }) {
  return (
    <a
      href={`#supply-${region.region.id}`}
      className="group grid grid-cols-[minmax(0,1fr)_72px_96px] items-center gap-3 text-[13px] text-[var(--ink)] md:grid-cols-[220px_minmax(0,1fr)_110px]"
    >
      <span className="truncate group-hover:underline group-hover:underline-offset-4">{region.region.label}</span>
      <PressureBar pressure={region.pressure} muted={region.label === "NO DATA"} />
      <span className="text-right">
        <Status label={region.label} pressure={region.pressure} />
      </span>
    </a>
  );
}

export async function GlobalSupplyChainPanel() {
  const snapshot = await getGlobalSupplySnapshot();
  const { regions, china } = snapshot;
  const failed = [...snapshot.dataSourcesFailed, ...snapshot.newsSourcesEmpty];

  return (
    <section className="mb-8" aria-label="Global supply chain">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--rule)] pb-2">
        <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-[var(--ink)]">
          Supply chain — global
        </h2>
        <p className="font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
          {new Date(snapshot.generatedAt).toUTCString().slice(5, 22)} UTC
        </p>
      </div>
      <p className="mb-2 font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
        Signals and data, not financial advice
      </p>
      <p className="mb-4 font-body-serif text-xs italic text-[var(--ink-light)]">
        Shipping through the main sea chokepoints, freight and commodity prices, factory surveys and a weekly news
        sweep for each region. Each reading runs from easing (−1) to strained (+1) against its own normal level; a
        region is the plain average of its readings. The assets listed are where such strain has tended to show up,
        not a forecast. Untested: every reading is recorded so it can be checked against prices, and nothing trades
        on it.
      </p>

      <div className="mb-6 space-y-2 border-y border-[var(--rule-light)] py-3">
        {regions.map((region) => (
          <RegionOverviewRow key={region.region.id} region={region} />
        ))}
      </div>

      <div className="space-y-6">
        {regions.map((region) => (
          <section key={region.region.id} id={`supply-${region.region.id}`} className="scroll-mt-20">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 border-b-4 border-double border-[var(--rule)] pb-1">
              <h3 className="news-label text-[20px] leading-tight text-[var(--ink)]">{region.region.label}</h3>
              <Status label={region.label} pressure={region.pressure} />
            </div>
            <p className="mt-1 text-[11px] text-[var(--ink-faint)]">
              {region.region.covers} · {region.scoredCount} readings scored
            </p>
            <ul className="mt-1 md:columns-2 md:gap-6 [&>li]:break-inside-avoid">
              {region.data.map((reading) => (
                <DataRow key={reading.def.id} reading={reading} />
              ))}
              {region.news.map((reading) => (
                <NewsRow key={reading.def.id} reading={reading} />
              ))}
            </ul>

            {region.region.id === "east-asia" && (
              <div className="mt-4 border-t border-[var(--rule-light)] pt-3">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <h4 className="news-label text-[17px] leading-tight text-[var(--ink)]">China — critical minerals</h4>
                  <p className="font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
                    {chinaSnapshotMeta(china)}
                  </p>
                </div>
                <ChinaSupplyChainBody snapshot={china} />
              </div>
            )}
          </section>
        ))}
      </div>

      {failed.length > 0 && (
        <p className="mt-3 font-mono text-[8px] text-[var(--ink-faint)]">No data this cycle from: {failed.join(", ")}</p>
      )}
    </section>
  );
}

export function GlobalSupplyChainPanelSkeleton() {
  return (
    <section className="mb-8">
      <div className="mb-3 border-b border-[var(--rule)] pb-2">
        <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-[var(--ink)]">
          Supply chain — global
        </h2>
      </div>
      <p className="font-body-serif text-sm italic text-[var(--ink-faint)]">Reading shipping, price and news sources…</p>
    </section>
  );
}
