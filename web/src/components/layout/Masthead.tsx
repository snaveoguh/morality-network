"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { EditionsPanel } from "@/components/editions/EditionsPanel";
import { stripMd } from "@/lib/strip-md";

// ============================================================================
// MASTHEAD — the front-page lead story (direction C)
//
// phone                         ≥1024 (9 of the page's 12 columns)
// ┌───────────────────────┐     ┌──────────────┬───────────────────┐
// │ Today's edition ›     │     │ Today's ed. ›│                   │
// │ ▓▓▓▓ lead image ▓▓▓▓▓ │     │ Headline     │   lead image      │
// │ caption               │     │ dek          │                   │
// │ Headline (serif)      │     │ byline       │   caption         │
// │ dek · byline          │     └──────────────┴───────────────────┘
// └───────────────────────┘
// The lead image sits above the headline (pooter-brand). No image → no
// placeholder; the text takes the full width.
// ============================================================================

interface MastheadProps {
  dailyTitle?: string | null;
  dailyHeadline?: string | null;
  dailySubheadline?: string | null;
  dailyHash?: string | null;
  imageUrl?: string | null;
}

export function Masthead({
  dailyTitle,
  dailyHeadline,
  dailySubheadline,
  dailyHash,
  imageUrl,
}: MastheadProps) {
  const normalizedDailyTitle = (dailyTitle || "").trim();
  const showDailyTitle =
    normalizedDailyTitle.length > 0 &&
    !/^daily edition$/i.test(normalizedDailyTitle) &&
    !/^pooter\s+world$/i.test(normalizedDailyTitle);

  const [showEditions, setShowEditions] = useState(false);

  const { dateStr, editionNumber } = useMemo(() => {
    const today = new Date();
    const num = Math.floor(
      (today.getTime() - new Date("2026-03-11T00:00:00Z").getTime()) / 86400000
    ) + 1;
    const ds = today.toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
    return { dateStr: ds, editionNumber: num };
  }, []);

  const href = dailyHash ? `/article/${dailyHash}` : "/daily";
  const hasStory = Boolean(dailyHeadline && dailyHash);

  return (
    <article
      aria-label="Lead story"
      className="order-1 flex flex-col pt-[18px] lg:col-span-9 lg:row-start-2 lg:grid lg:grid-cols-9 lg:gap-x-6 lg:pt-7"
    >
      {/* Image first on phone, right-hand column at ≥1024 */}
      {hasStory && imageUrl && (
        <figure className="order-2 -mx-4 mb-0 flex flex-col gap-2 lg:order-none lg:col-span-5 lg:col-start-5 lg:row-start-1 lg:mx-0">
          <Link href={href} className="block" tabIndex={-1} aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt=""
              className="newspaper-img halftone aspect-[3/2] w-full object-cover lg:aspect-[4/3]"
              fetchPriority="high"
            />
          </Link>
          <figcaption className="px-4 text-xs text-[var(--ink-faint)] lg:px-0">
            Illustration for today&rsquo;s edition
          </figcaption>
        </figure>
      )}

      <div
        className={`contents lg:flex lg:flex-col lg:gap-3.5 ${
          hasStory && imageUrl
            ? "lg:col-span-4 lg:row-start-1 lg:border-r lg:border-[var(--rule-light)] lg:pr-6"
            : "lg:col-span-9"
        }`}
      >
        <Link
          href={href}
          className="order-1 flex min-h-11 items-center gap-2 pb-1 text-[15px] font-bold text-[var(--ink)] lg:min-h-0 lg:pb-0"
        >
          <span aria-hidden className="h-2.5 w-2.5 bg-[var(--ink)]" />
          {showDailyTitle ? normalizedDailyTitle : "Today’s edition"} ›
        </Link>

        <div className="order-3 flex flex-col gap-2.5 pt-3.5 lg:pt-0">
          {hasStory ? (
            <>
              <Link href={href} className="group">
                <h1 className="news-head text-[32px] leading-[1.12] text-[var(--ink)] group-hover:underline group-hover:decoration-[var(--ink-faint)] group-hover:decoration-1 group-hover:underline-offset-4 lg:text-[34px] lg:leading-[1.1]">
                  {stripMd(dailyHeadline!)}
                </h1>
              </Link>
              {dailySubheadline && (
                <p className="text-base leading-normal text-[var(--ink-light)]">
                  {stripMd(dailySubheadline)}
                </p>
              )}
            </>
          ) : (
            <p className="news-head text-2xl leading-tight text-[var(--ink)]">
              Today&rsquo;s edition is not out yet.{" "}
              <Link href="/daily" className="underline decoration-[var(--ink-faint)] underline-offset-4">
                Read earlier editions
              </Link>
              .
            </p>
          )}
          <p className="text-[13px] text-[var(--ink-faint)]">
            By pooter world &middot; {dateStr} &middot;{" "}
            <button
              type="button"
              onClick={() => setShowEditions(true)}
              className="underline-offset-2 hover:text-[var(--ink)] hover:underline"
            >
              Edition {editionNumber}
            </button>
          </p>
        </div>
      </div>

      {showEditions && (
        <EditionsPanel
          currentEdition={editionNumber}
          onClose={() => setShowEditions(false)}
        />
      )}
    </article>
  );
}
