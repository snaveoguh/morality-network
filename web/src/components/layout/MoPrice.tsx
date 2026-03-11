"use client";

import { useEffect, useState, useCallback } from "react";

const MO_TOKEN_ADDRESS = "0x8729c70061739140ee6bE00A3875Cbf6d09A746C";
const DEXSCREENER_API = `https://api.dexscreener.com/latest/dex/tokens/${MO_TOKEN_ADDRESS}`;
const POLL_INTERVAL = 60_000; // 60s

interface PriceData {
  priceUsd: string;
  priceChange24h: number;
  url: string;
  // Synthetic sparkline points derived from price change data
  sparkline: number[];
}

/**
 * Generate a synthetic sparkline from the price change percentages.
 * DexScreener gives us h1, h6, h24 change — we interpolate
 * a plausible 24-point curve from current price + those deltas.
 */
function buildSparkline(
  currentPrice: number,
  changeH1: number,
  changeH6: number,
  changeH24: number
): number[] {
  // Work backwards from current price using % changes
  const priceH1Ago = currentPrice / (1 + changeH1 / 100);
  const priceH6Ago = currentPrice / (1 + changeH6 / 100);
  const priceH24Ago = currentPrice / (1 + changeH24 / 100);

  // Key points: 24h ago, 6h ago, 1h ago, now (at indices 0, 18, 23, 24)
  const keyPoints = [
    { idx: 0, price: priceH24Ago },
    { idx: 18, price: priceH6Ago },
    { idx: 23, price: priceH1Ago },
    { idx: 24, price: currentPrice },
  ];

  // Linearly interpolate between key points, add slight noise for realism
  const points: number[] = [];
  for (let i = 0; i <= 24; i++) {
    let segStart = keyPoints[0];
    let segEnd = keyPoints[1];
    for (let k = 0; k < keyPoints.length - 1; k++) {
      if (i >= keyPoints[k].idx && i <= keyPoints[k + 1].idx) {
        segStart = keyPoints[k];
        segEnd = keyPoints[k + 1];
        break;
      }
    }
    const t =
      segEnd.idx === segStart.idx
        ? 1
        : (i - segStart.idx) / (segEnd.idx - segStart.idx);
    const base = segStart.price + t * (segEnd.price - segStart.price);
    // Deterministic pseudo-noise based on index
    const noise = Math.sin(i * 7.3 + 2.1) * 0.003 * currentPrice;
    points.push(base + noise);
  }

  return points;
}

function formatPrice(priceStr: string): string {
  const n = parseFloat(priceStr);
  if (n === 0) return "$0";
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  if (n >= 0.0001) return `$${n.toFixed(6)}`;
  // For very small prices, show significant digits
  const s = n.toFixed(10);
  const match = s.match(/^0\.(0+)/);
  const zeros = match ? match[1].length : 0;
  return `$0.${"0".repeat(zeros)}${n.toFixed(zeros + 2).split(".")[1].slice(zeros)}`;
}

function formatChange(change: number): string {
  const sign = change >= 0 ? "+" : "";
  return `${sign}${change.toFixed(1)}%`;
}

function Sparkline({ points, isUp }: { points: number[]; isUp: boolean }) {
  const W = 48;
  const H = 16;
  const pad = 1;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  const coords = points.map((p, i) => {
    const x = pad + (i / (points.length - 1)) * (W - pad * 2);
    const y = pad + (1 - (p - min) / range) * (H - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      className="inline-block align-middle"
      style={{ shapeRendering: "geometricPrecision" }}
    >
      <polyline
        points={coords.join(" ")}
        fill="none"
        stroke={isUp ? "var(--ink)" : "var(--accent-red)"}
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MoPrice() {
  const [data, setData] = useState<PriceData | null>(null);
  const [error, setError] = useState(false);

  const fetchPrice = useCallback(async () => {
    try {
      const res = await fetch(DEXSCREENER_API);
      if (!res.ok) throw new Error("API error");
      const json = await res.json();

      // Find the best Base pair (highest liquidity)
      const basePairs = (json.pairs || []).filter(
        (p: { chainId: string }) => p.chainId === "base"
      );
      if (basePairs.length === 0) {
        setError(true);
        return;
      }

      // Sort by liquidity USD descending
      basePairs.sort(
        (
          a: { liquidity?: { usd?: number } },
          b: { liquidity?: { usd?: number } }
        ) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
      );

      const pair = basePairs[0];
      const priceUsd = pair.priceUsd || "0";
      const pc = pair.priceChange || {};
      const changeH24 = pc.h24 ?? 0;
      const changeH6 = pc.h6 ?? 0;
      const changeH1 = pc.h1 ?? 0;

      const sparkline = buildSparkline(
        parseFloat(priceUsd),
        changeH1,
        changeH6,
        changeH24
      );

      setData({
        priceUsd,
        priceChange24h: changeH24,
        url: pair.url || `https://dexscreener.com/base/${MO_TOKEN_ADDRESS}`,
        sparkline,
      });
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    fetchPrice();
    const interval = setInterval(fetchPrice, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchPrice]);

  if (error || !data) return null;

  const isUp = data.priceChange24h >= 0;

  return (
    <a
      href={data.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors hover:bg-[var(--paper-dark)]"
      title={`MO token — ${formatChange(data.priceChange24h)} (24h)`}
    >
      {/* Token label */}
      <span
        className="font-mono uppercase tracking-wider text-[var(--ink-faint)]"
        style={{ fontSize: "8px", lineHeight: 1 }}
      >
        $MO
      </span>

      {/* Sparkline */}
      <Sparkline points={data.sparkline} isUp={isUp} />

      {/* Price */}
      <span
        className="font-mono text-[var(--ink)]"
        style={{ fontSize: "9px", lineHeight: 1 }}
      >
        {formatPrice(data.priceUsd)}
      </span>

      {/* 24h change */}
      <span
        className="font-mono"
        style={{
          fontSize: "8px",
          lineHeight: 1,
          color: isUp ? "var(--ink)" : "var(--accent-red)",
        }}
      >
        {formatChange(data.priceChange24h)}
      </span>
    </a>
  );
}
