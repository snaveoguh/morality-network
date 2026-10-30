"use client";

import { useState } from "react";
import {
  describeCluster,
  formatPrice,
  formatUsdCompact,
  LEVERAGE_MIX,
} from "@/lib/liquidation-map";
import type { LiquidationMapEntry, LiquidationMapSnapshot } from "@/lib/liquidation-map-data";

const INK = "#0d0d0d";
// Shorts are hatched, longs solid: one ink, no colour coding.
const HATCH = `repeating-linear-gradient(135deg, ${INK} 0 2px, transparent 2px 4px)`;

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

function Bar({ usd, max, hatched }: { usd: number; max: number; hatched: boolean }) {
  const pct = max > 0 ? (usd / max) * 100 : 0;
  if (pct <= 0) return <span className="h-full" />;
  return (
    <span
      className="h-full"
      style={{
        width: `${Math.max(pct, 0.75)}%`,
        background: hatched ? HATCH : INK,
        boxShadow: hatched ? `inset 0 0 0 1px ${INK}` : undefined,
      }}
    />
  );
}

function Chart({ entry }: { entry: LiquidationMapEntry }) {
  const { map } = entry;
  const step = map.bucketSize;
  const shorts = map.buckets.filter((b) => b.hi > map.price);
  const longs = map.buckets.filter((b) => b.lo <= map.price);
  const max = Math.max(0, ...map.buckets.map((b) => Math.max(b.longUsd, b.shortUsd)));

  const row = (lo: number, usd: number, hatched: boolean, key: string) => (
    <div
      key={key}
      className="grid h-[14px] grid-cols-[60px_1fr_40px] items-center gap-2 sm:h-4 sm:grid-cols-[80px_1fr_48px]"
    >
      <span className="text-right font-mono text-[10px] leading-none text-[#383734] sm:text-[11px]">
        {formatPrice(lo, step)}
      </span>
      <span className="flex h-[10px] items-stretch sm:h-3">
        <Bar usd={usd} max={max} hatched={hatched} />
      </span>
      <span className="font-mono text-[10px] leading-none sm:text-[11px]">
        {usd >= max * 0.02 && usd > 0 ? formatUsdCompact(usd) : ""}
      </span>
    </div>
  );

  return (
    <figure
      aria-label={`Estimated ${entry.label} liquidations by price level`}
      className="flex flex-col gap-[2px]"
    >
      <p className="mb-1 text-[12px] text-[#383734]">
        Shorts, liquidated if price rises (hatched) · lower edge of each{" "}
        {formatPrice(step, step)} band
      </p>
      {shorts.map((b) => row(b.lo, b.shortUsd, true, `s${b.lo}`))}
      <div className="my-1 flex items-center gap-2 border-y-2 border-[#0d0d0d] py-1 text-[12px] font-bold">
        <span>Current price {formatPrice(map.price)}</span>
      </div>
      {longs.map((b) => row(b.lo, b.longUsd, false, `l${b.lo}`))}
      <p className="mt-1 text-[12px] text-[#383734]">Longs, liquidated if price falls (solid)</p>
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
                {entry.label}: estimated liquidation levels
              </h3>
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
                    <li key={`${c.side}${c.lo}`}>{describeCluster(c, entry.map.bucketSize)}.</li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-[13px] font-bold leading-snug">
              Estimated from open interest and an assumed leverage mix. Signals and data, not financial
              advice.
            </p>
          </div>

          <div className="min-w-0 lg:col-span-8">
            <Chart entry={entry} />
            {(entry.map.beyondRange.longUsd > 0 || entry.map.beyondRange.shortUsd > 0) && (
              <p className="mt-2 text-[12px] text-[#383734]">
                Outside this range (±12% of price): ≈{formatUsdCompact(entry.map.beyondRange.shortUsd)} of
                shorts above, ≈{formatUsdCompact(entry.map.beyondRange.longUsd)} of longs below.
              </p>
            )}
          </div>

          <details className="text-[13px] leading-snug lg:col-span-12">
            <summary className="cursor-pointer font-bold">How this is estimated</summary>
            <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-[#383734]">
              <li>
                Exchanges do not publish positions or liquidation prices. Every figure here is a model,
                not a record of real positions.
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
                closed, and the rest are scaled up to today&rsquo;s open interest.
              </li>
              <li>
                Stocks and indices are HIP-3 perps on the trade.xyz market on Hyperliquid. They show
                positions on Hyperliquid only, not in the underlying stock market.
              </li>
            </ul>
          </details>

          <p className="text-[11px] text-[#6e6a61] lg:col-span-12">
            Source: Hyperliquid public API (open interest, mark price, funding, 1h candles), fetched{" "}
            {formatUtc(snapshot.fetchedAt)} &middot; updates every 5 minutes
          </p>
        </div>
      )}
    </section>
  );
}
