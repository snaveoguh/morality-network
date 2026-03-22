"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createChart,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type Time,
  ColorType,
  LineStyle,
  CrosshairMode,
} from "lightweight-charts";

/* ─────────────────────────  Types  ───────────────────────── */

interface CandleResponse {
  coin: string;
  interval: string;
  count: number;
  candles: Array<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
}

interface IndicatorResponse {
  symbol: string;
  direction: "long" | "short" | "neutral";
  strength: number;
  confidence: number;
  indicators: {
    rsi14: number;
    ichimoku: {
      tenkanSen: number;
      kijunSen: number;
      senkouSpanA: number;
      senkouSpanB: number;
      priceVsCloud: string;
      cloudColor: string;
    };
    macd: { macd: number; signal: number; histogram: number; crossover: string };
    ema: { ema9: number; ema21: number; ema55: number; trendAlignment: string };
    bollinger: { upper: number; middle: number; lower: number; percentB: number };
    volume: { vwap: number; volumeRatio: number; isHighVolume: boolean };
  };
  reasons: string[];
}

type Interval = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

interface TradingChartProps {
  defaultCoin?: string;
  defaultInterval?: Interval;
  height?: number;
  watchMarkets?: string[];
}

/* ─────────────────────────  Ichimoku helpers  ───────────────── */

function highestHigh(candles: Array<{ high: number }>, start: number, period: number): number {
  let max = -Infinity;
  for (let i = start; i > start - period && i >= 0; i--) {
    if (candles[i].high > max) max = candles[i].high;
  }
  return max;
}

function lowestLow(candles: Array<{ low: number }>, start: number, period: number): number {
  let min = Infinity;
  for (let i = start; i > start - period && i >= 0; i--) {
    if (candles[i].low < min) min = candles[i].low;
  }
  return min;
}

interface IchimokuPoint {
  time: Time;
  tenkanSen: number;
  kijunSen: number;
}

interface IchimokuCloud {
  time: Time;
  spanA: number;
  spanB: number;
}

function computeIchimoku(
  candles: Array<{ time: number; open: number; high: number; low: number; close: number }>,
  tenkanPeriod = 9,
  kijunPeriod = 26,
  senkouBPeriod = 52,
  displacement = 26,
): { lines: IchimokuPoint[]; cloud: IchimokuCloud[] } {
  const lines: IchimokuPoint[] = [];
  const cloud: IchimokuCloud[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (i >= tenkanPeriod - 1 && i >= kijunPeriod - 1) {
      const tenkan = (highestHigh(candles, i, tenkanPeriod) + lowestLow(candles, i, tenkanPeriod)) / 2;
      const kijun = (highestHigh(candles, i, kijunPeriod) + lowestLow(candles, i, kijunPeriod)) / 2;
      lines.push({ time: candles[i].time as Time, tenkanSen: tenkan, kijunSen: kijun });

      // Senkou Span A = (Tenkan + Kijun) / 2, displaced forward
      const spanA = (tenkan + kijun) / 2;

      // Senkou Span B = (52-period high + 52-period low) / 2, displaced forward
      const spanB = i >= senkouBPeriod - 1
        ? (highestHigh(candles, i, senkouBPeriod) + lowestLow(candles, i, senkouBPeriod)) / 2
        : spanA;

      // Displace cloud forward by `displacement` periods
      const futureIdx = i + displacement;
      const futureTime = futureIdx < candles.length
        ? candles[futureIdx].time
        : candles[candles.length - 1].time + (displacement - (candles.length - 1 - i)) * (candles[1]?.time - candles[0]?.time || 60);

      cloud.push({ time: futureTime as Time, spanA, spanB });
    }
  }

  return { lines, cloud };
}

/* ─────────────────────────  Component  ───────────────────── */

const INTERVALS: Interval[] = ["1m", "5m", "15m", "1h", "4h", "1d"];
const DEFAULT_MARKETS = ["BTC", "ETH", "SOL"];

export default function TradingChart({
  defaultCoin = "BTC",
  defaultInterval = "15m",
  height = 280,
  watchMarkets = DEFAULT_MARKETS,
}: TradingChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const priceSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const ema9Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ema21Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const tenkanRef = useRef<ISeriesApi<"Line"> | null>(null);
  const kijunRef = useRef<ISeriesApi<"Line"> | null>(null);
  const spanARef = useRef<ISeriesApi<"Line"> | null>(null);
  const spanBRef = useRef<ISeriesApi<"Line"> | null>(null);

  const [coin, setCoin] = useState(defaultCoin);
  const [interval, setInterval] = useState<Interval>(defaultInterval);
  const [indicators, setIndicators] = useState<IndicatorResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastPrice, setLastPrice] = useState<number | null>(null);
  const [priceChange, setPriceChange] = useState<number | null>(null);
  const [showIchimoku, setShowIchimoku] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [candleRes, indRes] = await Promise.all([
        fetch(`/api/trading/candles?coin=${coin}&interval=${interval}&count=200`),
        fetch(`/api/trading/indicators?coin=${coin}&interval=${interval}`),
      ]);

      if (!candleRes.ok) return;
      const candleData: CandleResponse = await candleRes.json();

      if (indRes.ok) {
        const indData: IndicatorResponse = await indRes.json();
        setIndicators(indData);
      }

      if (!chartRef.current || !priceSeriesRef.current) return;

      const closes = candleData.candles.map((c) => ({
        time: c.time as Time,
        value: c.close,
      }));

      priceSeriesRef.current.setData(closes);

      // Compute last price + 24h change
      if (candleData.candles.length > 1) {
        const last = candleData.candles[candleData.candles.length - 1].close;
        const first = candleData.candles[0].close;
        setLastPrice(last);
        setPriceChange(((last - first) / first) * 100);
      }

      // EMA overlays
      if (candleData.candles.length > 21) {
        const closePrices = candleData.candles.map((c) => c.close);
        const times = candleData.candles.map((c) => c.time as Time);

        const computeEma = (data: number[], period: number) => {
          const result: number[] = [];
          const k = 2 / (period + 1);
          result[0] = data[0];
          for (let i = 1; i < data.length; i++) {
            result[i] = data[i] * k + result[i - 1] * (1 - k);
          }
          return result;
        };

        const e9 = computeEma(closePrices, 9);
        const e21 = computeEma(closePrices, 21);

        ema9Ref.current?.setData(
          e9.slice(9).map((v, i) => ({ time: times[i + 9], value: v })),
        );
        ema21Ref.current?.setData(
          e21.slice(21).map((v, i) => ({ time: times[i + 21], value: v })),
        );
      }

      // Ichimoku cloud
      if (showIchimoku && candleData.candles.length > 52) {
        const ichi = computeIchimoku(candleData.candles);

        tenkanRef.current?.setData(
          ichi.lines.map((p) => ({ time: p.time, value: p.tenkanSen })),
        );
        kijunRef.current?.setData(
          ichi.lines.map((p) => ({ time: p.time, value: p.kijunSen })),
        );

        // Sort cloud points by time for lightweight-charts
        const sortedCloud = [...ichi.cloud].sort((a, b) => (a.time as number) - (b.time as number));
        spanARef.current?.setData(
          sortedCloud.map((p) => ({ time: p.time, value: p.spanA })),
        );
        spanBRef.current?.setData(
          sortedCloud.map((p) => ({ time: p.time, value: p.spanB })),
        );
      } else {
        tenkanRef.current?.setData([]);
        kijunRef.current?.setData([]);
        spanARef.current?.setData([]);
        spanBRef.current?.setData([]);
      }

      chartRef.current.timeScale().fitContent();
    } catch (error) {
      console.error("[TradingChart] fetch error:", error);
    } finally {
      setLoading(false);
    }
  }, [coin, interval, showIchimoku]);

  // Initialize chart — e-ink style: no background, minimal grid, thin lines
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "var(--ink-faint, #999)",
        fontFamily: "ui-monospace, monospace",
        fontSize: 9,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: "var(--rule-light, #e5e5e5)", style: LineStyle.Dotted },
      },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: { color: "var(--ink-faint, #aaa)", style: LineStyle.Dotted, width: 1 },
        horzLine: { color: "var(--ink-faint, #aaa)", style: LineStyle.Dotted, width: 1 },
      },
      rightPriceScale: {
        borderVisible: false,
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      handleScroll: { vertTouchDrag: false },
    });

    // Ichimoku cloud — Senkou Span A (upper bound, filled area)
    const spanA = chart.addSeries(LineSeries, {
      color: "rgba(76, 175, 80, 0.3)",
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    // Ichimoku cloud — Senkou Span B (lower bound)
    const spanB = chart.addSeries(LineSeries, {
      color: "rgba(244, 67, 54, 0.3)",
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    // Tenkan-Sen (conversion line) — thin blue
    const tenkan = chart.addSeries(LineSeries, {
      color: "rgba(33, 150, 243, 0.6)",
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    // Kijun-Sen (base line) — thin red
    const kijun = chart.addSeries(LineSeries, {
      color: "rgba(156, 39, 176, 0.6)",
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    // Main price line — thin, dark (on top of cloud)
    const priceSeries = chart.addSeries(LineSeries, {
      color: "var(--ink, #1a1a1a)",
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerRadius: 3,
      crosshairMarkerBorderWidth: 1,
      crosshairMarkerBackgroundColor: "var(--ink, #1a1a1a)",
      crosshairMarkerBorderColor: "var(--ink, #1a1a1a)",
    });

    // EMA 9 — faint dashed
    const ema9 = chart.addSeries(LineSeries, {
      color: "var(--ink-faint, #bbb)",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    // EMA 21 — faint dotted
    const ema21 = chart.addSeries(LineSeries, {
      color: "var(--ink-faint, #ccc)",
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    chartRef.current = chart;
    priceSeriesRef.current = priceSeries;
    ema9Ref.current = ema9;
    ema21Ref.current = ema21;
    tenkanRef.current = tenkan;
    kijunRef.current = kijun;
    spanARef.current = spanA;
    spanBRef.current = spanB;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chart.applyOptions({ width: entry.contentRect.width });
      }
    });
    resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [height]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const timer = globalThis.setInterval(fetchData, 30_000);
    return () => globalThis.clearInterval(timer);
  }, [fetchData]);

  const dirLabel =
    indicators?.direction === "long"
      ? "LONG"
      : indicators?.direction === "short"
        ? "SHORT"
        : "—";

  const dirClass =
    indicators?.direction === "long"
      ? "text-green-700"
      : indicators?.direction === "short"
        ? "text-red-600"
        : "text-[var(--ink-faint)]";

  const cloudLabel = indicators?.indicators?.ichimoku
    ? `${indicators.indicators.ichimoku.priceVsCloud} ${indicators.indicators.ichimoku.cloudColor} cloud`
    : null;

  return (
    <div className="w-full border border-[var(--rule-light)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--rule-light)]">
        {/* Market tabs — scrollable for many markets */}
        <div className="flex gap-0.5 overflow-x-auto max-w-[60%] scrollbar-hide">
          {watchMarkets.map((m) => (
            <button
              key={m}
              onClick={() => setCoin(m)}
              className={`px-2 py-0.5 font-mono text-[10px] tracking-[0.1em] uppercase border ${
                coin === m
                  ? "border-[var(--ink)] text-[var(--ink)] bg-[var(--ink)] text-white"
                  : "border-[var(--rule-light)] text-[var(--ink-faint)] hover:text-[var(--ink)]"
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        {/* Price + change */}
        <div className="flex items-center gap-3 font-mono text-[10px]">
          {lastPrice !== null && (
            <span className="text-[var(--ink)] font-bold">
              ${lastPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          )}
          {priceChange !== null && (
            <span className={priceChange >= 0 ? "text-green-700" : "text-red-600"}>
              {priceChange >= 0 ? "+" : ""}{priceChange.toFixed(2)}%
            </span>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowIchimoku((v) => !v)}
            className={`px-1.5 py-0.5 font-mono text-[8px] tracking-[0.08em] uppercase border ${
              showIchimoku
                ? "border-[var(--ink)] text-[var(--ink)]"
                : "border-[var(--rule-light)] text-[var(--ink-faint)]"
            }`}
          >
            ichi
          </button>
          <div className="flex gap-0.5">
            {INTERVALS.map((iv) => (
              <button
                key={iv}
                onClick={() => setInterval(iv)}
                className={`px-1.5 py-0.5 font-mono text-[9px] ${
                  interval === iv
                    ? "text-[var(--ink)] font-bold underline underline-offset-2"
                    : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
                }`}
              >
                {iv}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart area */}
      <div className="relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <span className="text-[var(--ink-faint)] text-[10px] font-mono tracking-[0.2em]">
              LOADING
            </span>
          </div>
        )}
        <div ref={chartContainerRef} />
      </div>

      {/* Signal strip */}
      {indicators && (
        <div className="flex items-center gap-3 px-3 py-1.5 border-t border-[var(--rule-light)] font-mono text-[9px] text-[var(--ink-faint)] overflow-x-auto">
          <span className={`font-bold ${dirClass}`}>{dirLabel}</span>
          <span>conf {(indicators.confidence * 100).toFixed(0)}%</span>
          <span>rsi {indicators.indicators.rsi14.toFixed(0)}</span>
          <span>macd {indicators.indicators.macd.crossover}</span>
          <span>ema {indicators.indicators.ema.trendAlignment}</span>
          <span>bb {indicators.indicators.bollinger.percentB.toFixed(2)}</span>
          {cloudLabel && <span>cloud {cloudLabel}</span>}
          <span className="ml-auto">{indicators.reasons.length} signals</span>
        </div>
      )}
    </div>
  );
}
