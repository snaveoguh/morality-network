"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { StumbleItem } from "@/lib/stumble";
import { getEmbeddableUrl, normalizeStumbleUrl } from "@/lib/stumble";
import { computeEntityHash } from "@/lib/entity";
import { saveStumbleContext } from "@/lib/stumble-context";
import { RatingWidget } from "@/components/entity/RatingWidget";
import { TipButton } from "@/components/entity/TipButton";
import { CommentThread } from "@/components/entity/CommentThread";

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
  const [items, setItems] = useState<StumbleItem[]>(initialItems);
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
      .then((newItems: StumbleItem[]) => {
        if (Array.isArray(newItems) && newItems.length > 0) {
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
        <div className="max-w-xl border-2 border-[var(--rule)] bg-[var(--paper)] p-6 text-center">
          <h2 className="font-headline text-2xl text-[var(--ink)]">Stumble is empty</h2>
          <p className="mt-2 font-body-serif text-sm text-[var(--ink-light)]">
            Could not load random pages right now. Try another jump.
          </p>
          <button
            onClick={stumble}
            className="mt-4 border border-[var(--rule)] bg-[var(--ink)] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--paper)] transition-colors hover:bg-[var(--paper)] hover:text-[var(--ink)]"
          >
            Load Stumble
          </button>
        </div>
      </div>
    );
  }

  const typeLabel = TYPE_LABELS[currentItem.type] ?? "Link";

  return (
    <div className="stumble-page relative overflow-hidden bg-[var(--paper-dark)]">
      <iframe
        key={embedUrl}
        src={embedUrl}
        title={currentItem.title}
        className="h-[calc(100vh-3rem)] w-full border-0 bg-white"
        loading="eager"
        referrerPolicy="no-referrer"
        allow="accelerometer; autoplay; encrypted-media; picture-in-picture; fullscreen"
      />

      <div className="pointer-events-none absolute inset-0 p-3 sm:p-4">
        <div className="pointer-events-auto flex items-start justify-between gap-3">
          <div className="w-[min(22rem,72vw)] border border-[var(--rule)] bg-[var(--paper)]/32 p-2 shadow-sm backdrop-blur-[1px] transition-all duration-200 hover:bg-[var(--paper)]/74 hover:shadow-lg sm:w-[min(24rem,56vw)] sm:p-2.5">
            <div className="mb-1 flex items-center gap-1.5 font-mono text-[7px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
              <span>Stumble</span>
              <span>&bull;</span>
              <span>{typeLabel}</span>
              <span>&bull;</span>
              <span>{currentItem.source}</span>
            </div>

            <h1 className="line-clamp-2 font-headline-serif text-base font-bold leading-snug text-[var(--ink)] sm:text-lg">
              {currentItem.title}
            </h1>

            {currentItem.description && (
              <p className="mt-1 line-clamp-2 font-body-serif text-[11px] leading-snug text-[var(--ink-light)]">
                {currentItem.description}
              </p>
            )}

            <div className="mt-1.5 border-t border-[var(--rule-light)] pt-1.5 font-mono text-[7px] text-[var(--ink-faint)]">
              Asset hash: {entityHash.slice(0, 12)}...{entityHash.slice(-8)}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <button
              onClick={goBack}
              disabled={history.length <= 1}
              className="pointer-events-auto border border-[var(--rule)] bg-[var(--paper)]/38 px-2 py-1 font-mono text-[8px] uppercase tracking-[0.14em] text-[var(--ink)] transition-all duration-200 hover:bg-[var(--paper)]/78 disabled:opacity-40"
            >
              Back
            </button>
            <button
              onClick={stumble}
              disabled={isRefreshing}
              className="pointer-events-auto border border-[var(--rule)] bg-[var(--ink)]/72 px-2 py-1 font-mono text-[8px] uppercase tracking-[0.14em] text-[var(--paper)] transition-all duration-200 hover:bg-[var(--ink)]/90 disabled:opacity-40"
            >
              {isRefreshing ? "Loading" : "Stumble"}
            </button>
            <a
              href={canonicalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="pointer-events-auto border border-[var(--rule-light)] bg-[var(--paper)]/32 px-2 py-1 text-center font-mono text-[8px] uppercase tracking-[0.14em] text-[var(--ink)] transition-all duration-200 hover:border-[var(--rule)] hover:bg-[var(--paper)]/72"
            >
              Open Source
            </a>
            {entityContextHref && (
              <Link
                href={entityContextHref}
                className="pointer-events-auto border border-[var(--rule-light)] bg-[var(--paper)]/32 px-2 py-1 text-center font-mono text-[8px] uppercase tracking-[0.14em] text-[var(--ink)] transition-all duration-200 hover:border-[var(--rule)] hover:bg-[var(--paper)]/72"
              >
                Entity
              </Link>
            )}
            <button
              onClick={() => setPanelOpen((p) => !p)}
              className="pointer-events-auto border border-[var(--rule-light)] bg-[var(--paper)]/32 px-2 py-1 font-mono text-[8px] uppercase tracking-[0.14em] text-[var(--ink)] transition-all duration-200 hover:border-[var(--rule)] hover:bg-[var(--paper)]/72"
            >
              {panelOpen ? "Hide Panel" : "Show Panel"}
            </button>
          </div>
        </div>

        {panelOpen && (
          <aside className="pointer-events-auto absolute bottom-3 right-3 max-h-[15vh] w-[min(20rem,72vw)] overflow-y-auto border border-[var(--rule)] bg-[var(--paper)]/30 p-2 shadow-sm backdrop-blur-[1px] transition-all duration-200 hover:bg-[var(--paper)]/80 hover:shadow-xl">
            <div className="mb-1.5 flex items-center justify-between">
              <h2 className="font-mono text-[7px] uppercase tracking-[0.22em] text-[var(--ink)]">
                Onchain Layer
              </h2>
              <span className="font-mono text-[7px] text-[var(--ink-faint)]">
                #{currentIndex + 1}/{items.length}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1 border border-[var(--rule-light)] bg-[var(--paper)]/65 p-1.5">
                <RatingWidget entityHash={entityHash} />
              </div>
              {isConnected && <TipButton entityHash={entityHash} />}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
