"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  ColorType,
  LineStyle,
  CrosshairMode,
  type Time,
} from "lightweight-charts";

interface EquityCurveProps {
  data: { time: number; value: number }[];
}

export default function EquityCurve({ data }: EquityCurveProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);

  // Detect theme
  const isDark = typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "dark";

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: isDark ? "#6A6A6A" : "#8A8A8A",
        fontFamily: "monospace",
        fontSize: 9,
      },
      grid: {
        vertLines: { color: isDark ? "#1A1A1A" : "#EDE6D6", style: LineStyle.Dotted },
        horzLines: { color: isDark ? "#1A1A1A" : "#EDE6D6", style: LineStyle.Dotted },
      },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: { color: isDark ? "#333" : "#C8C0B0", style: LineStyle.Dashed, width: 1, labelVisible: false },
        horzLine: { color: isDark ? "#333" : "#C8C0B0", style: LineStyle.Dashed, width: 1 },
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: false,
      handleScale: false,
    });

    const series = chart.addSeries(LineSeries, {
      color: "#22C55E",
      lineWidth: 2,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 3,
      lastValueVisible: true,
      priceLineVisible: false,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const resizeObserver = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      chart.applyOptions({ width, height });
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, [isDark]);

  // Update data
  useEffect(() => {
    if (!seriesRef.current || data.length === 0) return;

    // Convert to lightweight-charts format (time in seconds)
    const chartData = data.map((d) => ({
      time: Math.floor(d.time / 1000) as Time,
      value: d.value,
    }));

    // Color line based on P&L direction
    const lastValue = data[data.length - 1]?.value ?? 0;
    const lineColor = lastValue >= 0 ? "#22C55E" : "#EF4444";

    seriesRef.current.applyOptions({ color: lineColor });
    seriesRef.current.setData(chartData);
    chartRef.current?.timeScale().fitContent();
  }, [data]);

  if (data.length === 0) {
    return (
      <div ref={containerRef} className="flex h-full w-full items-center justify-center">
        <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
          Accumulating equity data...
        </span>
      </div>
    );
  }

  return <div ref={containerRef} className="h-full w-full" />;
}
