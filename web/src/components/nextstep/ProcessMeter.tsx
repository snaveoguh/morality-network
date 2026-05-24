"use client";

import { useEffect, useState } from "react";

const MO_TOKEN_ADDRESS = "0x8729c70061739140ee6bE00A3875Cbf6d09A746C";
const MARKETS_API = "/api/markets";
const POLL_MS = 60_000;
const HISTORY = 7;

/**
 * NeXT-style Processes meter — vertical bar chart that doubles as a
 * MO-token price ticker. Each bar is one polling tick; rightmost is now.
 */
export function ProcessMeter() {
  const [bars, setBars] = useState<number[]>([0.3, 0.4, 0.5, 0.6, 0.5, 0.7, 0.6]);
  const [price, setPrice] = useState<number | null>(null);
  const [change, setChange] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchPrice() {
      try {
        const res = await fetch(MARKETS_API, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        const pairs = data?.dexscreener?.pairs;
        if (!Array.isArray(pairs)) return;
        const basePairs = pairs
          .filter((p: any) => String(p.chainId ?? "").toLowerCase() === "base")
          .sort(
            (a: any, b: any) =>
              (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0),
          );
        const best = basePairs[0];
        if (!best || cancelled) return;
        const p = Number(best.priceUsd);
        const c = Number(best.priceChange?.h24);
        if (Number.isFinite(p)) {
          setPrice(p);
          setBars((prev) => {
            const next = [...prev.slice(1)];
            // Normalize to 0..1 by clamping to recent range
            const min = Math.min(...prev, p);
            const max = Math.max(...prev, p);
            const norm = max > min ? (p - min) / (max - min) : 0.5;
            next.push(Math.max(0.05, Math.min(1, norm)));
            return next;
          });
        }
        if (Number.isFinite(c)) setChange(c);
      } catch {
        /* silent */
      }
    }

    fetchPrice();
    const id = setInterval(fetchPrice, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const isUp = (change ?? 0) >= 0;
  const labelColor = isUp ? "text-[var(--ink)]" : "text-[var(--accent-red)]";

  return (
    <a
      href={`https://dexscreener.com/base/${MO_TOKEN_ADDRESS}`}
      target="_blank"
      rel="noopener noreferrer"
      className="dock-tile flex h-12 w-12 flex-col items-center justify-center"
      title={`MO ${price !== null ? `$${price.toFixed(6)}` : "—"}`}
    >
      <div className="flex h-7 w-9 items-end justify-between gap-[1px] bg-white bevel-sunken px-[2px] py-[1px]">
        {bars.map((v, i) => (
          <div
            key={i}
            className={`w-[2px] ${
              i === bars.length - 1
                ? "bg-[var(--accent-red)] meter-bar-active"
                : "bg-black"
            }`}
            style={{ height: `${Math.max(8, v * 100)}%` }}
          />
        ))}
      </div>
      <span className={`mt-0.5 text-[7px] font-bold uppercase leading-none ${labelColor}`}>
        MO {price !== null ? (isUp ? "▲" : "▼") : ""}
      </span>
    </a>
  );
}
