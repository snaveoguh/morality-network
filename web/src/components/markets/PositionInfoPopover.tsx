"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ── tiny ASCII diagrams rendered in monospace ────────────────────── */
function Illustration({ art }: { art: string }) {
  return (
    <pre className="mb-2 select-none whitespace-pre text-center font-mono text-[9px] leading-[1.3] text-[var(--ink-faint)]">
      {art}
    </pre>
  );
}

/* ── slide data ───────────────────────────────────────────────────── */
const SLIDES: readonly { title: string; art: string; body: string }[] = [
  {
    title: "The engine",
    art: `  ┌─ news ──┐
  │ tech    │──▶ composite ──▶ trade
  └─ AI  ───┘    signal`,
    body: "Pooter runs an autonomous trading engine that executes every ~90 seconds. It combines three independent signal sources — technical indicators, AI pattern detection, and news sentiment — into a single composite score. Positions are only opened when at least two of three sources agree on direction with confidence above 55%.",
  },
  {
    title: "Signal pipeline",
    art: `  RSI ─────┐
  MACD ────┤ 40%
  Ichimoku ┤        ┌──────────┐
  EMA ─────┤   ──▶  │ composite│
  Boll ────┘        │  score   │
  AI patterns  30%  └────┬─────┘
  News feeds   30%       ▼
                      direction`,
    body: "Technical analysis runs six indicators on 15-minute candles: RSI(14), Ichimoku Cloud, MACD(12/26/9), triple EMA crossovers (9/21/55), Bollinger Bands(20,2), and volume-weighted average price. In parallel, an LLM scans the last 50 candles for chart patterns (head & shoulders, flags, wedges, breakouts). News signals score recent editorial and market-impact records with a 72-hour decay. Default weights: 40% technical, 30% AI, 30% news.",
  },
  {
    title: "How entries work",
    art: `  signal ──▶ Kelly ──▶ size
              │
     phase ───┘
     cold  0.25x  (<10 trades)
     warm  0.50x  (10–99)
     hot   0.67x  (100+)`,
    body: "When the composite signal clears the confidence threshold, the engine computes position size using the Kelly Criterion — a formula that optimises growth rate given win probability and payoff ratio. In early phases (< 10 trades), Kelly is scaled to quarter-size to protect capital while the system calibrates. Maximum single position is $150, and total portfolio exposure is capped at $600 across 8 concurrent positions.",
  },
  {
    title: "Execution venues",
    art: `  ┌── Base spot ──── Uniswap V3
  │                  Aerodrome
  ├── ETH spot ───── Uniswap V3
  └── Perps ──────── Hyperliquid`,
    body: "The engine can route to three venues. Base and Ethereum spot trades swap WETH or USDC for tokens through Uniswap V3 (or Aerodrome on Base). Hyperliquid perpetual futures trade BTC, ETH, and SOL with cross-margin leverage (default 2x, max 40x). Perps let you take short positions and trade with leverage without holding the underlying asset.",
  },
  {
    title: "Risk management",
    art: `          entry
            │
  ──────────┼──────────
   -20% ◀───┤───▶ +45%
   stop      │     take
   loss      │     profit
             │
         trailing
         stop (5%)`,
    body: "Every position gets a 20% stop-loss and 45% take-profit, checked each cycle. On Hyperliquid, a trailing stop activates after +5% unrealised profit and follows at 5% below the high-water mark. If the composite signal flips direction with > 70% confidence, the position closes early. A circuit breaker pauses trading for one hour after three consecutive losses.",
  },
  {
    title: "Copy trading",
    art: `  your app
    │
    ▼
  GET /positions ──▶ open trades
  GET /signals/live ──▶ real-time
  GET /performance ──▶ track record`,
    body: "You can mirror the engine's trades through two access tiers. Operator routes like /api/trading/positions and /api/trading/performance still require bearer auth. Premium market intelligence routes on /markets, including /api/trading/signals/live and the full metrics feed, unlock for SIWE-authenticated wallets holding at least 100,000 MO.",
  },
  {
    title: "API reference",
    art: `  /api/trading/
    ├── execute      trigger cycle
    ├── positions    open & closed
    ├── performance  PnL & metrics
    ├── signals      news scores
    ├── signals/live composite
    ├── candles      OHLCV data
    ├── indicators   tech readings
    └── readiness    status gate`,
    body: "All endpoints are on pooter.world. Operator routes (positions, performance, readiness) require bearer auth. Market-data primitives like /candles and /indicators stay public. Premium desk routes like /api/trading/metrics full detail, /api/trading/signals/live, and the /markets terminal require a verified wallet session holding 100,000 MO.",
  },
  {
    title: "PnL and fees",
    art: `  gross PnL
    │
    ├── wins ──▶ 5% fee
    │
    └── losses ──▶ no fee
         ─────────
         net PnL`,
    body: "Unrealised PnL updates live from Hyperliquid mark price (or DexScreener for spot). A 5% performance fee is applied only to realised profits — you never pay fees on losses or open positions. The performance endpoint returns gross PnL, fee deducted, net PnL, win rate, average win/loss, max drawdown, and Sharpe ratio.",
  },
];

export function PositionInfoPopover() {
  const [open, setOpen] = useState(false);
  const [slide, setSlide] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setSlide(0);
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        close();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight" && slide < SLIDES.length - 1)
        setSlide((s) => s + 1);
      if (e.key === "ArrowLeft" && slide > 0) setSlide((s) => s - 1);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open, slide, close]);

  const current = SLIDES[slide];

  return (
    <span className="relative inline-block align-middle" ref={ref}>
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        className="ml-2 inline-flex h-[16px] w-[16px] items-center justify-center rounded-full border border-[var(--rule-light)] font-mono text-[9px] leading-none text-[var(--ink-faint)] transition-colors hover:border-[var(--ink-light)] hover:text-[var(--ink)]"
        aria-label="How positions work"
        title="How positions work"
      >
        i
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-[340px] border border-[var(--rule-light)] bg-[var(--paper)] p-4 shadow-md">
          {/* Header */}
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono text-[9px] tracking-normal text-[var(--ink-faint)]">
              {slide + 1} / {SLIDES.length}
            </span>
            <button
              type="button"
              onClick={close}
              className="font-mono text-[10px] text-[var(--ink-faint)] hover:text-[var(--ink)]"
              aria-label="Close"
            >
              &times;
            </button>
          </div>

          {/* Illustration */}
          <Illustration art={current.art} />

          {/* Slide content */}
          <h3 className="font-mono text-[11px] font-bold tracking-normal text-[var(--ink)]">
            {current.title}
          </h3>
          <p className="mt-2 font-body-serif text-[12px] leading-[1.6] text-[var(--ink-light)]">
            {current.body}
          </p>

          {/* Dots */}
          <div className="mt-3 flex items-center gap-1.5">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setSlide(i)}
                className={`h-[5px] w-[5px] rounded-full transition-colors ${
                  i === slide
                    ? "bg-[var(--ink)]"
                    : "bg-[var(--rule-light)] hover:bg-[var(--ink-faint)]"
                }`}
                aria-label={`Slide ${i + 1}`}
              />
            ))}
          </div>

          {/* Navigation */}
          <div className="mt-3 flex justify-between">
            <button
              type="button"
              onClick={() => setSlide((s) => s - 1)}
              disabled={slide === 0}
              className="font-mono text-[9px] tracking-normal text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)] disabled:invisible"
            >
              &larr; prev
            </button>
            {slide < SLIDES.length - 1 ? (
              <button
                type="button"
                onClick={() => setSlide((s) => s + 1)}
                className="font-mono text-[9px] tracking-normal text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
              >
                next &rarr;
              </button>
            ) : (
              <button
                type="button"
                onClick={close}
                className="font-mono text-[9px] tracking-normal text-[var(--ink)] transition-colors hover:text-[var(--ink-faint)]"
              >
                Got it
              </button>
            )}
          </div>
        </div>
      )}
    </span>
  );
}
