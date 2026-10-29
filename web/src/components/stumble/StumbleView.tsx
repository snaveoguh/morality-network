"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { StumbleItem } from "@/lib/stumble";
import {
  canRenderStumble,
  getEmbeddableUrl,
  isStumbleImage,
  normalizeStumbleUrl,
} from "@/lib/stumble";
import { computeEntityHash } from "@/lib/entity";
import { saveStumbleContext } from "@/lib/stumble-context";
import { RatingWidget } from "@/components/entity/RatingWidget";
import { TipButton } from "@/components/entity/TipButton";

interface StumbleViewProps {
  initialItems: StumbleItem[];
}

const TYPE_LABELS: Record<string, string> = {
  article: "Article",
  video: "Video",
  image: "Image",
  discussion: "Discussion",
  wiki: "Wiki",
  tool: "Tool",
  music: "Music",
};

export function StumbleView({ initialItems }: StumbleViewProps) {
  const { isConnected } = useAccount();
  const [items, setItems] = useState<StumbleItem[]>(() => initialItems.filter(canRenderStumble));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [history, setHistory] = useState<number[]>([0]);
  const [panelOpen, setPanelOpen] = useState(true);

  const currentItem = items[currentIndex];
  const canonicalUrl = useMemo(
    () => (currentItem ? normalizeStumbleUrl(currentItem.url) : ""),
    [currentItem],
  );
  const embedUrl = useMemo(
    () => (canonicalUrl ? getEmbeddableUrl(canonicalUrl) : ""),
    [canonicalUrl],
  );
  // Items are pre-filtered with canRenderStumble, so it is an image or a frame.
  const showImage = useMemo(
    () => (currentItem ? isStumbleImage(currentItem) : false),
    [currentItem],
  );
  const entityHash = useMemo(
    () => (canonicalUrl ? computeEntityHash(canonicalUrl) : null),
    [canonicalUrl],
  );
  const entityContextHref = useMemo(() => {
    if (!entityHash || !canonicalUrl || !currentItem) return "";
    const params = new URLSearchParams({
      url: canonicalUrl,
      title: currentItem.title,
      source: currentItem.source,
      type: currentItem.type,
    });
    return `/entity/${entityHash}?${params.toString()}`;
  }, [entityHash, canonicalUrl, currentItem]);

  useEffect(() => {
    if (!entityHash || !currentItem || !canonicalUrl) return;
    saveStumbleContext({
      hash: entityHash,
      url: canonicalUrl,
      title: currentItem.title,
      source: currentItem.source,
      type: currentItem.type,
      description: currentItem.description || "",
      savedAt: new Date().toISOString(),
    });
  }, [entityHash, canonicalUrl, currentItem]);

  const stumble = useCallback(() => {
    if (currentIndex < items.length - 1) {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      setHistory((prev) => [...prev, nextIndex]);
      return;
    }

    setIsRefreshing(true);
    fetch("/api/stumble", { cache: "no-store" })
      .then((res) => res.json())
      .then((res: StumbleItem[]) => {
        const newItems = Array.isArray(res) ? res.filter(canRenderStumble) : [];
        if (newItems.length > 0) {
          setItems(newItems);
          setCurrentIndex(0);
          setHistory([0]);
        }
      })
      .catch((err) => {
        console.error("[stumble] refresh failed", err);
      })
      .finally(() => setIsRefreshing(false));
  }, [currentIndex, items.length]);

  const goBack = useCallback(() => {
    if (history.length <= 1) return;
    const newHistory = [...history];
    newHistory.pop();
    setHistory(newHistory);
    setCurrentIndex(newHistory[newHistory.length - 1]!);
  }, [history]);

  if (!currentItem || !entityHash) {
    return (
      <div className="stumble-page flex items-center justify-center px-4">
        <div className="max-w-xl border border-[var(--rule)] bg-[var(--paper)] p-6 text-center">
          <h2 className="news-head text-2xl text-[var(--ink)]">Nothing to stumble on</h2>
          <p className="mt-2 text-sm text-[var(--ink-light)]">
            We could not load any pages right now.
          </p>
          <button
            onClick={stumble}
            disabled={isRefreshing}
            className="mt-4 min-h-12 bg-[var(--ink)] px-6 text-[15px] font-semibold text-[var(--paper)] disabled:opacity-50"
          >
            {isRefreshing ? "Loading…" : "Try again"}
          </button>
        </div>
      </div>
    );
  }

  const typeLabel = TYPE_LABELS[currentItem.type] ?? "Link";

  return (
    <div className="stumble-page relative overflow-hidden bg-[var(--paper-dark)]">
      {showImage ? (
        <div className="stumble-frame relative w-full bg-[var(--paper-dark)]">
          <img
            src={currentItem.imageUrl || canonicalUrl}
            alt={currentItem.title}
            className="h-full w-full object-contain"
            loading="eager"
          />
        </div>
      ) : (
        <iframe
          key={embedUrl}
          src={embedUrl}
          title={currentItem.title}
          className="stumble-frame w-full border-0 bg-white"
          loading="eager"
          referrerPolicy="no-referrer"
          allow="accelerometer; autoplay; encrypted-media; picture-in-picture; fullscreen"
        />
      )}

      {/* Info card — what this is, where it's from, rate it */}
      {panelOpen ? (
        <div className="absolute left-3 top-3 w-[min(22rem,calc(100%-1.5rem))] border border-[var(--rule)] bg-[var(--paper)]/95 p-3 shadow-lg">
          <p className="article-byline">
            {typeLabel} &middot; {currentItem.source}
          </p>
          <h1 className="news-head mt-0.5 line-clamp-2 text-xl leading-[1.2] text-[var(--ink)]">
            {currentItem.title}
          </h1>
          {currentItem.description && (
            <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-[var(--ink-light)]">
              {currentItem.description}
            </p>
          )}

          <div className="mt-2 flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <RatingWidget entityHash={entityHash} />
            </div>
            {isConnected && <TipButton entityHash={entityHash} />}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 border-t border-[var(--rule-light)] pt-1 text-[13px] text-[var(--ink)]">
            <a
              href={canonicalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 items-center hover:underline hover:underline-offset-4"
            >
              Open site &#8599;
            </a>
            {entityContextHref && (
              <Link
                href={entityContextHref}
                className="flex min-h-11 items-center hover:underline hover:underline-offset-4"
              >
                Discuss
              </Link>
            )}
            <button
              onClick={() => setPanelOpen(false)}
              className="ml-auto flex min-h-11 items-center text-[var(--ink-faint)] hover:text-[var(--ink)]"
            >
              Hide
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setPanelOpen(true)}
          className="absolute left-3 top-3 min-h-11 border border-[var(--rule)] bg-[var(--paper)]/95 px-4 text-[13px] font-semibold text-[var(--ink)] shadow-lg"
        >
          Info
        </button>
      )}

      {/* Stumble controls — bottom right, thumb reach on phone; left of the
          desktop mascot (fixed bottom-4 right-4) on lg */}
      <div className="absolute bottom-4 right-4 flex items-center gap-2 lg:right-28">
        <button
          onClick={goBack}
          disabled={history.length <= 1}
          aria-label="Previous page"
          className="flex h-14 w-14 items-center justify-center border border-[var(--rule)] bg-[var(--paper)] text-xl text-[var(--ink)] shadow-lg disabled:opacity-40"
        >
          &larr;
        </button>
        <button
          onClick={stumble}
          disabled={isRefreshing}
          className="flex h-14 min-w-[9.5rem] items-center justify-center gap-2 bg-[var(--ink)] px-6 text-[17px] font-semibold text-[var(--paper)] shadow-lg transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {isRefreshing ? "Loading…" : <>Stumble <span aria-hidden>&rarr;</span></>}
        </button>
      </div>
    </div>
  );
}
