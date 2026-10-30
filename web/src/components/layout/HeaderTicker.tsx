"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import type { TickerStory } from "@/lib/impact";

// ============================================================================
// HEADER TICKER — the day's top stories by impact (lib/impact.ts), scrolling
// right to left under the masthead line.
//
// CSS animation only (.ticker in globals.css). Hover pauses it; keyboard
// focus stops it and lets the strip scroll so the focused link is in view.
// prefers-reduced-motion shows the first story, static. The second copy of
// the list exists only to make the loop seamless: hidden from assistive tech
// and out of the tab order.
// ============================================================================

const SECONDS_PER_STORY = 7;

const LONDON_DATE = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  weekday: "short",
  day: "numeric",
  month: "short",
});
const LONDON_ISO = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" });

/** "Thu 29 Oct", in London time. */
export function londonDate(now: Date = new Date()): { label: string; iso: string } {
  return { label: LONDON_DATE.format(now).replace(",", ""), iso: LONDON_ISO.format(now) };
}

const noSubscribe = () => () => {};
const dateSnapshot = () => {
  const { label, iso } = londonDate();
  return `${iso}|${label}`;
};

/** Today's London date on the client; null on the server and during
 *  hydration, so an ISR page cached before midnight can't show yesterday. */
export function useLondonDate(): { label: string; iso: string } | null {
  const snap = useSyncExternalStore(noSubscribe, dateSnapshot, () => null);
  if (!snap) return null;
  const [iso, label] = snap.split("|");
  return { iso, label };
}

function StoryList({ stories, copy }: { stories: TickerStory[]; copy?: boolean }) {
  return (
    <ul className="ticker-list" aria-hidden={copy || undefined}>
      {stories.map((s) => (
        <li key={s.id}>
          <Link
            href={s.href}
            tabIndex={copy ? -1 : undefined}
            className="text-[var(--ink)] hover:underline hover:underline-offset-4 focus-visible:underline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--ink)]"
          >
            {s.headline}
          </Link>
          {s.signals.length > 0 && (
            <span className="ml-1.5 font-mono text-[11px] text-[var(--ink-faint)]" title="Touches a Bearometer signal">
              <span className="sr-only">Bearometer: </span>
              {s.signals.join(" · ")}
            </span>
          )}
          <span aria-hidden className="ticker-sep text-[var(--ink-faint)]">
            ·
          </span>
        </li>
      ))}
    </ul>
  );
}

export function HeaderTicker() {
  const [stories, setStories] = useState<TickerStory[]>([]);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/ticker", { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : { stories: [] }))
      .then((d: { stories?: TickerStory[] }) => setStories(d.stories ?? []))
      .catch(() => {});
    return () => ctrl.abort();
  }, []);

  return (
    <section
      aria-label="Today's top stories"
      className="ticker h-8 text-[13px] leading-8"
      // Focus stops the animation, which moves the link; bring it into view
      // once the strip has settled.
      onFocus={(e) => {
        const link = e.target;
        requestAnimationFrame(() => link.scrollIntoView({ block: "nearest", inline: "nearest" }));
      }}
    >
      {stories.length > 0 && (
        <div
          className="ticker-track"
          style={{ "--ticker-duration": `${stories.length * SECONDS_PER_STORY}s` } as React.CSSProperties}
        >
          <StoryList stories={stories} />
          <StoryList stories={stories} copy />
        </div>
      )}
    </section>
  );
}
