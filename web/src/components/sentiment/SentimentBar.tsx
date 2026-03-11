"use client";

interface SentimentBarProps {
  score: number; // 0-100
  height?: number;
  showLabels?: boolean;
  className?: string;
}

/**
 * Horizontal sentiment gauge bar.
 * 0 = left (fear), 100 = right (optimism).
 * Grayscale newspaper aesthetic.
 */
export function SentimentBar({
  score,
  height = 6,
  showLabels = false,
  className = "",
}: SentimentBarProps) {
  const clampedScore = Math.max(0, Math.min(100, score));

  return (
    <div className={className}>
      {showLabels && (
        <div className="mb-1 flex justify-between font-mono text-[7px] uppercase tracking-wider text-[var(--ink-faint)]">
          <span>Fear</span>
          <span>Neutral</span>
          <span>Optimism</span>
        </div>
      )}
      <div
        className="relative w-full overflow-hidden bg-[var(--paper-dark)]"
        style={{ height }}
      >
        {/* Filled portion */}
        <div
          className="absolute inset-y-0 left-0 bg-[var(--ink)] transition-all duration-500"
          style={{ width: `${clampedScore}%` }}
        />
        {/* Center line at 50% */}
        <div
          className="absolute inset-y-0 w-px bg-[var(--rule-light)]"
          style={{ left: "50%" }}
        />
        {/* Score marker */}
        <div
          className="absolute top-0 h-full w-0.5 bg-[var(--accent-red)]"
          style={{ left: `${clampedScore}%`, transform: "translateX(-50%)" }}
        />
      </div>
    </div>
  );
}
