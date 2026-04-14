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

  const isDark = typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "dark";

  // Only create chart when we have data
  const hasData = data.length > 0;

  useEffect(() => {
    if (!containerRef.current || !hasData) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: isDark ? "#6A6A6A" : "#8A8A8A",
        fontFamily: "monospace",
        fontSize: 9,
        attributionLogo: false,
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
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [isDark, hasData]);

  // Update data
  useEffect(() => {
    if (!seriesRef.current || data.length === 0) return;

    const chartData = data.map((d) => ({
      time: Math.floor(d.time / 1000) as Time,
      value: d.value,
    }));

    const lastValue = data[data.length - 1]?.value ?? 0;
    const lineColor = lastValue >= 0 ? "#22C55E" : "#EF4444";

    seriesRef.current.applyOptions({ color: lineColor });
    seriesRef.current.setData(chartData);
    chartRef.current?.timeScale().fitContent();
  }, [data]);

  if (!hasData) {
    return (
      <div className="flex h-full w-full items-center justify-center border border-[var(--rule-light)]">
        <div className="text-center">
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink-faint)]">
            No Trade Data
          </div>
          <div className="mt-1 font-mono text-[7px] tracking-[0.1em] text-[var(--ink-faint)]">
            Chart populates as the trader executes positions
          </div>
        </div>
      </div>
    );
  }

  return <div ref={containerRef} className="h-full w-full" />;
}
