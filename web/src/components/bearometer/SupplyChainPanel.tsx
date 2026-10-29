import { getSupplyChainSnapshot } from "@/lib/bearometer/supply-chain";
import type {
  PressureLabel,
  SupplyChainIndicator,
  SupplyChainSnapshot,
  TaggedSupplyChainItem,
} from "@/lib/bearometer/supply-chain-score";
import type { WatchTicker } from "@/lib/bearometer/supply-chain-taxonomy";

// Server component: China supply-chain pressure per component group.
// Rendered under Suspense on /signals so slow feeds never hold up the page.

const LABEL_CLASS: Record<PressureLabel, string> = {
  TIGHTENING: "border-[var(--accent-red)] text-[var(--accent-red)]",
  EASING: "border-[var(--ink)] text-[var(--ink)]",
  MIXED: "border-[var(--ink-light)] text-[var(--ink-light)]",
  QUIET: "border-[var(--rule-light)] text-[var(--ink-faint)]",
};

const DIRECTION_MARK: Record<TaggedSupplyChainItem["direction"], string> = {
  tightening: "▲",
  easing: "▼",
  neutral: "·",
};

function ago(pubDate: string): string {
  const hours = Math.max(0, (Date.now() - Date.parse(pubDate)) / 3_600_000);
  if (!Number.isFinite(hours)) return "";
  if (hours < 1) return "<1h";
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

function PressureBar({ pressure }: { pressure: number }) {
  const width = `${Math.min(50, Math.abs(pressure) * 50)}%`;
  const side = pressure >= 0 ? { left: "50%" } : { right: "50%" };
  return (
    <div className="relative h-1.5 w-full bg-[var(--rule-light)]" aria-hidden>
      <div className="absolute top-0 h-full w-px bg-[var(--ink-faint)]" style={{ left: "50%" }} />
      <div
        className={`absolute top-0 h-full ${pressure >= 0 ? "bg-[var(--accent-red)]" : "bg-[var(--ink)]"}`}
        style={{ ...side, width }}
      />
    </div>
  );
}

function Tickers({ title, tickers, lean }: { title: string; tickers: WatchTicker[]; lean: string | null }) {
  return (
    <div>
      <p className="font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
        {title}
        {lean && <span className="block text-[var(--ink-light)]">{lean}</span>}
      </p>
      <p className="mt-0.5 font-mono text-[10px] text-[var(--ink)]">
        {tickers.map((t, i) => (
          <span key={t.symbol} title={t.name}>
            {i > 0 && ", "}
            {t.symbol}
          </span>
        ))}
      </p>
    </div>
  );
}

function leans(label: PressureLabel): { exChina: string | null; exposed: string | null } {
  if (label === "TIGHTENING") return { exChina: "signal leans for", exposed: "signal leans against" };
  if (label === "EASING") return { exChina: "signal leans against", exposed: "signal leans for" };
  return { exChina: null, exposed: null };
}

function IndicatorCard({ indicator }: { indicator: SupplyChainIndicator }) {
  const { group, label, pressure, itemCount, tighteningCount, easingCount, headlines } = indicator;
  const lean = leans(label);
  return (
    <div className="border border-[var(--rule-light)] p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-headline text-base leading-tight text-[var(--ink)]">{group.label}</h3>
          <p className="mt-0.5 font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
            {group.components} → {group.endUses}
          </p>
        </div>
        <span className={`shrink-0 border px-1.5 py-0.5 font-mono text-[8px] font-bold tracking-wider ${LABEL_CLASS[label]}`}>
          {label}
        </span>
      </div>

      <div className="mt-2">
        <PressureBar pressure={pressure} />
        <p className="mt-1 font-mono text-[8px] text-[var(--ink-faint)]">
          pressure {pressure >= 0 ? "+" : ""}
          {pressure.toFixed(2)} · {itemCount} items · {tighteningCount} tightening · {easingCount} easing
        </p>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <Tickers title="Ex-China supply" tickers={group.exChinaSupply} lean={lean.exChina} />
        <Tickers title="Exposed buyers" tickers={group.exposed} lean={lean.exposed} />
      </div>

      {headlines.length > 0 && (
        <ul className="mt-2 space-y-1 border-t border-[var(--rule-light)] pt-2">
          {headlines.map((h) => (
            <li key={h.id} className="font-body-serif text-[11px] leading-snug text-[var(--ink)]">
              <span className="mr-1 font-mono text-[9px] text-[var(--ink-faint)]">{DIRECTION_MARK[h.direction]}</span>
              <a href={h.link} target="_blank" rel="noopener noreferrer" className="hover:underline">
                {h.title}
              </a>
              <span className="ml-1 font-mono text-[8px] text-[var(--ink-faint)]">
                {h.source}
                {h.bias?.fundingModel === "state" && " (state)"} · {ago(h.pubDate)}
                {h.directionBy === "llm" && " · AI-labelled"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** China cards, intro and source notes, without the section heading. Reused by the global panel. */
export function ChinaSupplyChainBody({ snapshot }: { snapshot: SupplyChainSnapshot }) {
  return (
    <>
      <p className="mb-3 font-body-serif text-xs italic text-[var(--ink-light)]">
        Chinese government notices and press on rare earths, chip metals and battery materials, grouped by the
        components they feed. Pressure runs from easing (−1) to tightening (+1), weighted toward official notices
        and recent news. Watchlists show which side of each chain the signal points at. Untested indicator:
        every reading is recorded so it can be scored against prices, and nothing trades on it.
      </p>
      {snapshot.itemsScanned === 0 ? (
        <div className="border border-[var(--rule-light)] p-6 text-center">
          <p className="font-body-serif text-sm italic text-[var(--ink-faint)]">
            Supply-chain feeds are unavailable right now.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {snapshot.indicators.map((indicator) => (
            <IndicatorCard key={indicator.group.id} indicator={indicator} />
          ))}
        </div>
      )}
      {snapshot.sourcesEmpty.length > 0 && (
        <p className="mt-2 font-mono text-[8px] text-[var(--ink-faint)]">
          No items this cycle from: {snapshot.sourcesEmpty.join(", ")}
        </p>
      )}
    </>
  );
}

export function chinaSnapshotMeta(snapshot: SupplyChainSnapshot): string {
  return (
    `${snapshot.itemsTagged} tagged of ${snapshot.itemsScanned} headlines · ${snapshot.sourcesOk.length}/` +
    `${snapshot.sourcesOk.length + snapshot.sourcesEmpty.length} sources`
  );
}

export async function SupplyChainPanel() {
  const snapshot = await getSupplyChainSnapshot();
  return (
    <section className="mb-8">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--rule)] pb-2">
        <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-[var(--ink)]">
          Supply chain — China
        </h2>
        <p className="font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
          {chinaSnapshotMeta(snapshot)} · {new Date(snapshot.generatedAt).toUTCString().slice(5, 22)} UTC
        </p>
      </div>
      <ChinaSupplyChainBody snapshot={snapshot} />
    </section>
  );
}

export function SupplyChainPanelSkeleton() {
  return (
    <section className="mb-8">
      <div className="mb-3 border-b border-[var(--rule)] pb-2">
        <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-[var(--ink)]">
          Supply chain — China
        </h2>
      </div>
      <p className="font-body-serif text-sm italic text-[var(--ink-faint)]">Reading Chinese supply-chain sources…</p>
    </section>
  );
}
