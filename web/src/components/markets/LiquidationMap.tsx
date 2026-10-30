"use client";

import { Fragment, useState } from "react";
import {
  describeCluster,
  formatPrice,
  formatUsdCompact,
  LEVERAGE_MIX,
} from "@/lib/liquidation-map";
import type { LiquidationMapEntry, LiquidationMapSnapshot } from "@/lib/liquidation-map-data";
import { describeSignal } from "@/lib/liquidation-signal";
import type { PriceLevel } from "@/lib/price-levels";

const INK = "#0d0d0d";
// Shorts are hatched, longs solid: one ink, no colour coding. The estimated
// share is the same ink at lower opacity.
const HATCH = `repeating-linear-gradient(135deg, ${INK} 0 2px, transparent 2px 4px)`;
const EST_OPACITY = 0.35;

const GROUPS = [
  { key: "crypto", label: "Crypto" },
  { key: "stocks", label: "Stocks & indices" },
] as const;

function formatFunding(hourly: number): string {
  const pct = hourly * 100;
  const sign = pct < 0 ? "−" : "";
  return `${sign}${Math.abs(pct).toFixed(4)}% per hour`;
}

function formatUtc(ts: number): string {
  const d = new Date(ts);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${hh}:${mm} UTC`;
}

function Bar({
  usd,
  max,
  hatched,
  faded = false,
}: {
  usd: number;
  max: number;
  hatched: boolean;
  faded?: boolean;
}) {
  const pct = max > 0 ? (usd / max) * 100 : 0;
  if (pct <= 0) return null;
  return (
    <span
      className="h-full"
      style={{
        width: `${Math.max(pct, 0.75)}%`,
        background: hatched ? HATCH : INK,
        boxShadow: hatched ? `inset 0 0 0 1px ${INK}` : undefined,
        opacity: faded ? EST_OPACITY : undefined,
      }}
    />
  );
}

function formatPct(x: number): string {
  const pct = x * 100;
  return pct > 0 && pct < 1 ? "<1%" : `${Math.round(pct)}%`;
}

function levelText(l: PriceLevel): string {
  const name = l.kind === "support" ? "Support" : "Resistance";
  const turns = l.touches === 1 ? "turned once" : `turned ${l.touches} times`;
  return `${name} near ${formatPrice(l.price)}: price ${turns} there in 7 days`;
}

function LevelMarker({ level }: { level: PriceLevel }) {
  return (
    <div className="grid grid-cols-[60px_1fr] items-center gap-2 sm:grid-cols-[80px_1fr]">
      <span className="text-right font-mono text-[10px] font-bold leading-none sm:text-[11px]">
        {formatPrice(level.price)}
      </span>
      <span className="border-t border-dashed border-[#0d0d0d] pt-[1px] text-[10px] font-bold leading-tight sm:text-[11px]">
        {level.kind === "support" ? "Support" : "Resistance"} · turned {level.touches}×
      </span>
    </div>
  );
}

interface Row {
  lo: number;
  hi: number;
  /** Real positions (or the whole estimate when there is no exact layer). */
  exactUsd: number;
  /** Estimated share. */
  estUsd: number;
}

function Chart({ entry }: { entry: LiquidationMapEntry }) {
  const { map, exact } = entry;
  const step = map.bucketSize;
  // Without an exact layer the whole bar is the estimate, drawn as before.
  const rows = exact
    ? exact.combined.buckets.map((b) => ({
        lo: b.lo,
        hi: b.hi,
        long: { exactUsd: b.exactLongUsd, estUsd: b.estLongUsd },
        short: { exactUsd: b.exactShortUsd, estUsd: b.estShortUsd },
      }))
    : map.buckets.map((b) => ({
        lo: b.lo,
        hi: b.hi,
        long: { exactUsd: b.longUsd, estUsd: 0 },
        short: { exactUsd: b.shortUsd, estUsd: 0 },
      }));
  const shorts = rows.filter((b) => b.hi > map.price);
  const longs = rows.filter((b) => b.lo <= map.price);
  const max = Math.max(
    0,
    ...rows.map((b) => Math.max(b.long.exactUsd + b.long.estUsd, b.short.exactUsd + b.short.estUsd)),
  );

  const levelsIn = (lo: number, hi: number, kind: PriceLevel["kind"]) =>
    entry.levels.filter((l) => l.kind === kind && l.price >= lo && l.price < hi);

  const row = (r: Row, hatched: boolean, key: string) => {
    const usd = r.exactUsd + r.estUsd;
    return (
      <div
        key={key}
        className="grid h-[14px] grid-cols-[60px_1fr_40px] items-center gap-2 sm:h-4 sm:grid-cols-[80px_1fr_48px]"
      >
        <span className="text-right font-mono text-[10px] leading-none text-[#383734] sm:text-[11px]">
          {formatPrice(r.lo, step)}
        </span>
        <span className="flex h-[10px] items-stretch sm:h-3">
          <Bar usd={r.exactUsd} max={max} hatched={hatched} faded={!exact} />
          <Bar usd={r.estUsd} max={max} hatched={hatched} faded />
        </span>
        <span className="font-mono text-[10px] leading-none sm:text-[11px]">
          {usd >= max * 0.02 && usd > 0 ? formatUsdCompact(usd) : ""}
        </span>
      </div>
    );
  };

  return (
    <figure
      aria-label={`${exact ? "" : "Estimated "}${entry.label} liquidations by price level`}
      className="flex flex-col gap-[2px]"
    >
      <p className="mb-1 text-[12px] text-[#383734]">
        Shorts, liquidated if price rises (hatched) · lower edge of each{" "}
        {formatPrice(step, step)} band
      </p>
      {shorts.map((b) => (
        <Fragment key={`s${b.lo}`}>
          {levelsIn(b.lo, b.hi, "resistance").map((l) => (
            <LevelMarker key={`r${l.price}`} level={l} />
          ))}
          {row({ lo: b.lo, hi: b.hi, ...b.short }, true, `s${b.lo}`)}
        </Fragment>
      ))}
      <div className="my-1 flex items-center gap-2 border-y-2 border-[#0d0d0d] py-1 text-[12px] font-bold">
        <span>Current price {formatPrice(map.price)}</span>
      </div>
      {longs.map((b) => (
        <Fragment key={`l${b.lo}`}>
          {levelsIn(b.lo, b.hi, "support").map((l) => (
            <LevelMarker key={`p${l.price}`} level={l} />
          ))}
          {row({ lo: b.lo, hi: b.hi, ...b.long }, false, `l${b.lo}`)}
        </Fragment>
      ))}
      <p className="mt-1 text-[12px] text-[#383734]">Longs, liquidated if price falls (solid)</p>
      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[#383734]">
        {exact && (
          <span className="flex items-center gap-1">
            <span className="inline-block h-[10px] w-4" style={{ background: INK }} /> Real positions
          </span>
        )}
        <span className="flex items-center gap-1">
          <span className="inline-block h-[10px] w-4" style={{ background: INK, opacity: EST_OPACITY }} />{" "}
          Estimated{exact ? `, for the ${formatPct(1 - exact.map.coverage)} not scanned` : ""}
        </span>
      </p>
    </figure>
  );
}

export function LiquidationMap({ snapshot }: { snapshot: LiquidationMapSnapshot | null }) {
  const entries = snapshot?.entries ?? [];
  const [coin, setCoin] = useState(entries[0]?.map.coin ?? "");
  const entry = entries.find((e) => e.map.coin === coin) ?? entries[0];

  return (
    <section aria-labelledby="liq-map-title" className="mb-10">
      <div className="mb-4 border-b-2 border-[var(--rule)] pb-3">
        <h2 id="liq-map-title" className="font-headline text-2xl text-[var(--ink)]">
          Liquidation map
        </h2>
        <p className="mt-1 font-body-serif text-sm italic text-[var(--ink-light)]">
          Where leveraged positions on Hyperliquid would be forced to close, by price level.
        </p>
      </div>

      {!entry || !snapshot ? (
        <p className="border border-[var(--rule-light)] p-4 text-sm text-[var(--ink-light)]">
          Live data from Hyperliquid is unavailable right now, so no map is shown. It refreshes every
          five minutes.
        </p>
      ) : (
        <div className="flex flex-col gap-4 border border-[var(--rule-light)] bg-[#f2ede2] p-4 text-[#0d0d0d] lg:grid lg:grid-cols-12 lg:gap-6 lg:px-6 lg:py-5">
          <div className="flex min-w-0 flex-col gap-4 lg:col-span-4">
            {GROUPS.map((g) => {
              const items = entries.filter((e) => e.group === g.key);
              if (!items.length) return null;
              return (
                <div key={g.key} className="min-w-0">
                  <p className="mb-1 text-[12px] font-bold">{g.label}</p>
                  <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:flex-wrap lg:overflow-visible">
                    {items.map((e) => {
                      const active = e.map.coin === entry.map.coin;
                      return (
                        <button
                          key={e.map.coin}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setCoin(e.map.coin)}
                          className={`shrink-0 border border-[#0d0d0d] px-2 py-1 text-[13px] ${
                            active ? "bg-[#0d0d0d] text-[#f2ede2]" : "bg-transparent"
                          }`}
                        >
                          {e.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            <div>
              <h3 className="news-label text-xl leading-tight">
                {entry.label}: {entry.exact ? "" : "estimated "}liquidation levels
              </h3>
              {entry.exact ? (
                <p className="mt-1 text-[13px] leading-snug">
                  <span className="font-bold">
                    Exact: {entry.exact.map.accounts.toLocaleString("en-US")}{" "}
                    {entry.exact.map.accounts === 1 ? "account" : "accounts"},{" "}
                    {formatPct(entry.exact.map.coverage)} of Hyperliquid open interest.
                  </span>{" "}
                  The other {formatPct(1 - entry.exact.map.coverage)} is estimated.
                </p>
              ) : (
                <p className="mt-1 text-[13px] leading-snug">
                  {snapshot.scannedAt
                    ? `Estimated. No scanned account holds ${entry.label} yet.`
                    : "Estimated. Real positions appear after the first scan of Hyperliquid accounts, about 5 minutes after a restart."}
                </p>
              )}
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[13px]">
                <dt className="text-[#383734]">Price</dt>
                <dd>{formatPrice(entry.map.price)}</dd>
                <dt className="text-[#383734]">Open interest</dt>
                <dd>{formatUsdCompact(entry.map.oiUsd)} each side</dd>
                <dt className="text-[#383734]">Funding</dt>
                <dd>{formatFunding(entry.funding)}</dd>
                <dt className="text-[#383734]">Max leverage</dt>
                <dd>{entry.maxLeverage}x</dd>
              </dl>
            </div>

            {entry.clusters.length > 0 && (
              <div>
                <p className="mb-1 text-[12px] font-bold">Biggest clusters</p>
                <ul className="flex flex-col gap-1 text-[13px] leading-snug">
                  {entry.clusters.map((c) => (
                    <li key={`${c.side}${c.lo}`}>
                      {describeCluster(c, entry.map.bucketSize, { estimated: !entry.exact })}.
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <p className="mb-1 text-[12px] font-bold">Nearest large clusters</p>
              <p className="text-[13px] leading-snug">
                {describeSignal(entry.signal, formatUsdCompact, (p) => formatPrice(p, entry.map.bucketSize))}
              </p>
              <p className="mt-1 text-[12px] text-[#383734]">
                Large means at least 10% of that side&rsquo;s liquidations on the chart. Recorded as an
                untested signal. The trading bot does not use it.
              </p>
            </div>

            {entry.levels.length > 0 && (
              <div>
                <p className="mb-1 text-[12px] font-bold">Support and resistance</p>
                <ul className="flex flex-col gap-1 text-[13px] leading-snug">
                  {entry.levels.map((l) => (
                    <li key={`${l.kind}${l.price}`}>{levelText(l)}.</li>
                  ))}
                </ul>
                <p className="mt-1 text-[12px] text-[#383734]">
                  {(["support", "resistance"] as const)
                    .filter((k) => !entry.levels.some((l) => l.kind === k))
                    .map((k) =>
                      k === "support"
                        ? "No turn below the current price in the last 7 days. "
                        : "No turn above the current price in the last 7 days. ",
                    )}
                  Where the price turned before, not a forecast. Dashed lines on the chart.
                </p>
              </div>
            )}

            <p className="text-[13px] font-bold leading-snug">
              {entry.exact
                ? `Real positions for ${formatPct(entry.exact.map.coverage)} of open interest. The rest is estimated from open interest and an assumed leverage mix.`
                : "Estimated from open interest and an assumed leverage mix."}{" "}
              Signals and data, not financial advice.
            </p>
          </div>

          <div className="min-w-0 lg:col-span-8">
            <Chart entry={entry} />
            {(() => {
              const beyond = entry.exact?.combined.beyondRange ?? entry.map.beyondRange;
              if (beyond.longUsd <= 0 && beyond.shortUsd <= 0) return null;
              return (
                <p className="mt-2 text-[12px] text-[#383734]">
                  Outside this range (±12% of price): ≈{formatUsdCompact(beyond.shortUsd)} of shorts
                  above, ≈{formatUsdCompact(beyond.longUsd)} of longs below.
                </p>
              );
            })()}
            {entry.exact &&
              (entry.exact.map.noLiquidation.longUsd > 0 || entry.exact.map.noLiquidation.shortUsd > 0) && (
                <p className="mt-1 text-[12px] text-[#383734]">
                  Not on the chart: {formatUsdCompact(entry.exact.map.noLiquidation.longUsd)} of longs and{" "}
                  {formatUsdCompact(entry.exact.map.noLiquidation.shortUsd)} of shorts in scanned accounts
                  have no liquidation price, because their margin covers any move.
                </p>
              )}
          </div>

          <details className="text-[13px] leading-snug lg:col-span-12">
            <summary className="cursor-pointer font-bold">How this is worked out</summary>
            <p className="mt-2 font-bold">Real positions</p>
            <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-[#383734]">
              <li>
                Hyperliquid runs on its own blockchain, so every account&rsquo;s open positions are
                public. For each position it publishes the size, entry price, leverage and the price at
                which the exchange would liquidate it.
              </li>
              <li>
                Accounts are found from the public trade feed, which names both sides of every trade,
                from Hyperliquid&rsquo;s public leaderboard (largest accounts and highest 30-day
                volume) and from its list of vaults. Positions are re-read about every 5 minutes, within
                Hyperliquid&rsquo;s published rate limits, and are dropped if older than 20 minutes.
              </li>
              <li>
                Each bar adds up position size times liquidation price. Coverage is the size held by
                the scanned accounts divided by twice the open interest, because every contract has a
                long and a short.
              </li>
              <li>
                Binance, Bybit and other centralised exchanges do not publish positions, so for them
                only an estimate like the one below is possible. They are not shown.
              </li>
            </ul>
            <p className="mt-3 font-bold">Estimated share</p>
            <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-[#383734]">
              <li>
                The open interest not covered by scanned accounts is modelled, not observed. Before the
                first scan finishes, or for a market no scanned account trades, the whole map is
                modelled.
              </li>
              <li>
                Size: Hyperliquid open interest times mark price. Every perp contract has one long and
                one short, so both sides are the same size.
              </li>
              <li>
                Entry prices: open positions are assumed to have been opened over the last 7 days, in
                proportion to each hour&rsquo;s dollar volume, at that hour&rsquo;s average of high, low
                and close.
              </li>
              <li>
                Leverage mix (assumed):{" "}
                {LEVERAGE_MIX.map((m) => `${m.leverage}x ${Math.round(m.weight * 100)}%`).join(", ")}.
                Leverage above the asset&rsquo;s maximum on Hyperliquid counts at the maximum (
                {entry.map.mix.map((m) => `${m.leverage}x ${Math.round(m.weight * 100)}%`).join(", ")}{" "}
                for {entry.label}).
              </li>
              <li>
                Liquidation price uses isolated margin with maintenance margin at half the initial
                margin at max leverage ({(entry.map.maintenanceMarginRate * 100).toFixed(2)}% for{" "}
                {entry.label}). Fees, funding, cross margin and tiered margin are ignored.
              </li>
              <li>
                Positions whose liquidation price has already been reached since entry are treated as
                closed, and the rest are scaled up to today&rsquo;s open interest, then down to the
                share not scanned.
              </li>
              <li>
                Support and resistance: an hour whose high (or low) is the highest (or lowest) of the
                6 hours either side counts as a turn. Turns within 0.6% of price of each other are
                merged into one level. Levels below the price are support, above are resistance. The
                two with the most turns on each side are shown.
              </li>
              <li>
                Stocks and indices are HIP-3 perps on the trade.xyz market on Hyperliquid. They show
                positions on Hyperliquid only, not in the underlying stock market.
              </li>
            </ul>
          </details>

          <p className="text-[11px] text-[#6e6a61] lg:col-span-12">
            Source: Hyperliquid public API (open interest, mark price, funding, 1h candles
            {snapshot.scannedAt ? ", account positions" : ""}), fetched {formatUtc(snapshot.fetchedAt)}
            {snapshot.scannedAt ? <> &middot; positions scanned {formatUtc(snapshot.scannedAt)}</> : null}{" "}
            &middot; updates every 5 minutes
          </p>
        </div>
      )}
    </section>
  );
}
