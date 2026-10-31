"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Slide } from "@/lib/politics-slider";
import { timeAgo } from "@/lib/front";

// Home page politics slider (lib/politics-slider.ts picks the stories).
//
// Phone: one slide at a time, swiped with CSS scroll-snap. From 1024: three
// across, scrolling one at a time when there are more. Auto-advances every
// 6s, pauses on hover, focus and touch, and never moves under
// prefers-reduced-motion. Polls /api/front/slider and swaps in new stories
// without changing the slider's size. A slide whose image fails to load is
// dropped; under three slides the slider renders nothing.

const MIN_SLIDES = 3;
const ADVANCE_MS = 6_000;
const POLL_MS = 150_000;
const TOUCH_PAUSE_MS = 15_000;

const SECTION = "border-b border-[var(--rule)] pb-3 pt-2 lg:pb-5 lg:pt-4";
const TRACK =
  "relative -mx-4 flex snap-x snap-mandatory gap-8 overflow-x-auto scroll-px-4 px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:mx-0 lg:gap-6 lg:scroll-px-0 lg:px-0";
const SLIDE = "w-full shrink-0 snap-start lg:w-[calc((100%-3rem)/3)]";
const HEADLINE =
  "news-head mt-2 line-clamp-2 min-h-[2.5em] text-[17px] leading-[1.25] text-[var(--ink)] lg:text-[19px]";
const META = "mt-1 truncate pr-16 text-[12px] leading-4 text-[var(--ink-faint)] lg:pr-0 lg:text-[13px]";

/** Same footprint as the live slider, for the Suspense fallback. */
export function SliderSkeleton() {
  return (
    <section aria-hidden className={SECTION}>
      <div className={`${TRACK} overflow-hidden`}>
        {[0, 1, 2].map((i) => (
          <div key={i} className={`${SLIDE} ${i > 0 ? "max-lg:hidden" : ""}`}>
            <div className="aspect-video w-full animate-pulse bg-[var(--rule-light)]" />
            <div className={`${HEADLINE} flex flex-col justify-center gap-2`}>
              <span className="h-3 w-11/12 animate-pulse bg-[var(--rule-light)]" />
              <span className="h-3 w-2/3 animate-pulse bg-[var(--rule-light)]" />
            </div>
            <div className={META}>
              <span className="inline-block h-2.5 w-28 animate-pulse bg-[var(--rule-light)]" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function sameSlides(a: Slide[], b: Slide[]): boolean {
  return a.length === b.length && a.every((s, i) => s.id === b[i].id);
}

export function PoliticsSlider({ initialSlides, generatedAt }: { initialSlides: Slide[]; generatedAt: string }) {
  const [slides, setSlides] = useState(initialSlides);
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  // Server time first, so the "2 hours ago" text hydrates without a mismatch.
  const [now, setNow] = useState(() => Date.parse(generatedAt) || 0);
  const [index, setIndex] = useState(0);
  const [canScroll, setCanScroll] = useState(true);

  const trackRef = useRef<HTMLDivElement>(null);
  const hoverRef = useRef(false);
  const focusRef = useRef(false);
  const touchedAtRef = useRef(0);
  const pendingRef = useRef<Slide[] | null>(null);

  const visible = slides.filter((s) => !failed.has(s.id));
  const initialCount = initialSlides.length;

  const markFailed = useCallback((id: string) => {
    setFailed((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }, []);

  const interacting = () => hoverRef.current || focusRef.current || Date.now() - touchedAtRef.current < TOUCH_PAUSE_MS;

  // Clock for the source lines.
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  // Images that failed before hydration never fire onError in React.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    track.querySelectorAll<HTMLImageElement>("img[data-slide]").forEach((img) => {
      if (img.complete && img.naturalWidth === 0) markFailed(img.dataset.slide!);
    });
  }, [slides, markFailed]);

  // Poll for new stories. A swap waits until the reader is not using the
  // slider, and puts it back on the first slide.
  useEffect(() => {
    let cancelled = false;
    const apply = (next: Slide[]) => {
      pendingRef.current = null;
      setSlides((prev) => (sameSlides(prev, next) ? prev : next));
      setFailed(new Set());
      trackRef.current?.scrollTo({ left: 0 });
    };
    const poll = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/front/slider", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { slides?: Slide[] };
        const next = Array.isArray(data.slides) ? data.slides : [];
        if (cancelled || next.length < MIN_SLIDES) return;
        if (interacting()) pendingRef.current = next;
        else apply(next);
      } catch {
        // Keep the current slides.
      }
    };
    // The cached page can carry no slides (a cold crawl at render time): ask
    // straight away rather than leave the top empty until the first poll.
    const first = initialCount < MIN_SLIDES ? setTimeout(() => void poll(), 1_500) : undefined;
    const id = setInterval(() => {
      if (pendingRef.current && !interacting()) apply(pendingRef.current);
      else void poll();
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(id);
    };
  }, [initialCount]);

  // Which slide is first in view, and whether there is anything to scroll.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const measure = () => {
      const first = track.children[0] as HTMLElement | undefined;
      const second = track.children[1] as HTMLElement | undefined;
      const step = first && second ? second.offsetLeft - first.offsetLeft : track.clientWidth;
      setIndex(step > 0 ? Math.round(track.scrollLeft / step) : 0);
      setCanScroll(track.scrollWidth > track.clientWidth + 2);
    };
    measure();
    track.addEventListener("scroll", measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(track);
    return () => {
      track.removeEventListener("scroll", measure);
      ro.disconnect();
    };
  }, [visible.length]);

  const go = useCallback((to: number) => {
    const track = trackRef.current;
    if (!track) return;
    const slidesEls = track.children;
    if (slidesEls.length === 0) return;
    const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;
    const target = to < 0 ? slidesEls.length - 1 : to >= slidesEls.length || (to > 0 && atEnd && to > index) ? 0 : to;
    const el = slidesEls[target] as HTMLElement;
    const left = el.offsetLeft - (slidesEls[0] as HTMLElement).offsetLeft;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    track.scrollTo({ left, behavior: reduce ? "auto" : "smooth" });
  }, [index]);

  // Auto-advance. Off under reduced motion, paused while in use or hidden.
  useEffect(() => {
    if (!canScroll || visible.length < MIN_SLIDES) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motion.matches) return;
    const id = setInterval(() => {
      if (document.hidden || interacting() || motion.matches) return;
      go(index + 1);
    }, ADVANCE_MS);
    return () => clearInterval(id);
  }, [canScroll, visible.length, index, go]);

  if (visible.length < MIN_SLIDES) return null;

  const btn =
    "px-1 text-[13px] text-[var(--ink-light)] underline decoration-[var(--ink-faint)] decoration-1 underline-offset-4 hover:decoration-[var(--ink)]";

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Politics"
      className={`relative ${SECTION}`}
      onMouseEnter={() => (hoverRef.current = true)}
      onMouseLeave={() => (hoverRef.current = false)}
      onFocus={() => (focusRef.current = true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) focusRef.current = false;
      }}
      onTouchStart={() => (touchedAtRef.current = Date.now())}
      onPointerDown={() => (touchedAtRef.current = Date.now())}
    >
      <div ref={trackRef} className={TRACK}>
        {visible.map((s, i) => {
          const meta = [s.source, s.bias, timeAgo(s.pubDate, now)].filter(Boolean).join(" · ");
          return (
            <article
              key={s.id}
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${visible.length}`}
              className={SLIDE}
            >
              <Link href={s.href} className="group block">
                <div className="relative aspect-video w-full overflow-hidden bg-[var(--rule-light)]">
                  {/* eslint-disable-next-line @next/next/no-img-element -- feed images come from dozens of outlet CDNs that next/image remotePatterns do not list */}
                  <img
                    src={s.imageUrl}
                    alt=""
                    data-slide={s.id}
                    loading={i === 0 ? "eager" : "lazy"}
                    fetchPriority={i === 0 ? "high" : "auto"}
                    decoding="async"
                    referrerPolicy="no-referrer"
                    onError={() => markFailed(s.id)}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                </div>
                <h3 className={`${HEADLINE} group-hover:underline group-hover:decoration-1 group-hover:underline-offset-4`}>
                  {s.headline}
                </h3>
              </Link>
              <p className={META}>{meta}</p>
            </article>
          );
        })}
      </div>
      {canScroll && (
        <div className="pointer-events-none absolute bottom-3 right-0 flex items-center gap-2 text-[12px] leading-4 text-[var(--ink-faint)] lg:static lg:mt-2 lg:justify-end lg:text-[13px]">
          <button type="button" onClick={() => go(index - 1)} className={`${btn} pointer-events-auto max-lg:hidden`}>
            Previous
          </button>
          <span aria-live="off" className="tabular-nums">
            {Math.min(index + 1, visible.length)} / {visible.length}
          </span>
          <button type="button" onClick={() => go(index + 1)} className={`${btn} pointer-events-auto max-lg:hidden`}>
            Next
          </button>
        </div>
      )}
    </section>
  );
}
