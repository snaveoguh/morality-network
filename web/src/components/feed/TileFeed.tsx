"use client";

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { isAddress } from "viem";
import { computeEntityHash } from "@/lib/entity";
import { TipButton } from "@/components/entity/TipButton";
import { StarRating } from "@/components/shared/StarRating";
import {
  type Proposal,
  getTimeRemaining,
  getVotePercentage,
  isDelegationActivityProposal,
} from "@/lib/governance";
import type { FeedItem as FeedItemType } from "@/lib/rss";
import type { Cast } from "@/lib/farcaster";
import type { VideoItem } from "@/lib/video";
import { BiasPill, BiasBar } from "@/components/feed/BiasBar";
import type { SourceBias } from "@/lib/bias";
import { LiveCommentColumn } from "@/components/feed/LiveCommentColumn";
import { openCenteredPopup, shouldKeepDefaultLinkBehavior } from "@/lib/popup";

// ============================================================================
// TYPES
// ============================================================================

type VisualWeight = "hero" | "major" | "standard" | "minor" | "filler";

type TileItem =
  | { type: "rss"; data: FeedItemType; category: string; sortTime: number }
  | { type: "cast"; data: Cast; category: string; sortTime: number }
  | { type: "governance"; data: Proposal; category: string; sortTime: number }
  | { type: "video"; data: VideoItem; category: string; sortTime: number };

interface BiasDigest {
  insight: string;
  source: "ai" | "computed";
  avgFactuality: string;
  tilt: number;
  tiltLabel: string;
}

interface TileFeedProps {
  rssItems: FeedItemType[];
  casts: Cast[];
  proposals: Proposal[];
  videos?: VideoItem[];
  biasDigest?: BiasDigest | null;
  publishedHashList?: string[];
}

const FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "world", label: "World" },
  { value: "tech", label: "Tech" },
  { value: "crypto", label: "Crypto" },
  { value: "environment", label: "Environment" },
  { value: "science", label: "Science" },
  { value: "governance", label: "Governance" },
  { value: "candidates", label: "Candidates" },
  { value: "parliament", label: "UK Parl." },
  { value: "congress", label: "US Cong." },
  { value: "eu", label: "EU" },
  { value: "canada", label: "Canada" },
  { value: "australia", label: "Australia" },
  { value: "sec", label: "SEC" },
  { value: "farcaster", label: "Farcaster" },
  { value: "video", label: "Video" },
];

const BIAS_FILTER_OPTIONS = [
  { value: "all", label: "All Bias" },
  { value: "left", label: "Left" },
  { value: "lean-left", label: "Lean L" },
  { value: "center", label: "Center" },
  { value: "lean-right", label: "Lean R" },
  { value: "right", label: "Right" },
];

function getProposalCategory(proposal: Proposal): string {
  if (proposal.source === "parliament") return "parliament";
  if (proposal.source === "congress") return "congress";
  if (proposal.source === "eu") return "eu";
  if (proposal.source === "canada") return "canada";
  if (proposal.source === "australia") return "australia";
  if (proposal.source === "sec") return "sec";
  if (proposal.status === "candidate") return "candidates";
  return "governance";
}

// ============================================================================
// VISUAL WEIGHT — assigns chaotic column spans
// ============================================================================

function assignWeight(item: TileItem, index: number, publishedHashes?: Set<string>): VisualWeight {
  // Published articles always get hero (first) or major weight
  if (item.type === "rss" && publishedHashes?.size) {
    const hash = computeEntityHash(item.data.link);
    if (publishedHashes.has(hash)) {
      return index === 0 ? "hero" : "major";
    }
  }

  const ageMs = Date.now() - item.sortTime;
  const ageHours = ageMs / (1000 * 60 * 60);
  const isRecent = ageHours < 4;
  const isVeryRecent = ageHours < 1;

  // First item is always the hero
  if (index === 0) return "hero";

  if (item.type === "rss") {
    const rss = item.data;
    const hasImage = !!rss.imageUrl;
    // Breaking news with image = hero (max 1 hero)
    if (isVeryRecent && hasImage && index < 3) return "hero";
    // Recent with image = major
    if (isRecent && hasImage) return "major";
    // Has image but older = standard
    if (hasImage) return "standard";
    // No image, recent = standard
    if (isRecent) return "standard";
    // Old, no image = minor or filler
    return ageHours > 24 ? "filler" : "minor";
  }

  if (item.type === "cast") {
    const cast = item.data;
    const engagement = cast.likes + cast.recasts + cast.replies;
    if (engagement > 100) return "major";
    if (engagement > 30) return "standard";
    return "minor";
  }

  if (item.type === "video") {
    // Videos always get major weight — they need space for the embed
    return isRecent ? "major" : "standard";
  }

  if (item.type === "governance") {
    const p = item.data;
    if (p.status === "active" && isRecent) return "major";
    if (p.status === "active") return "standard";
    if (p.status === "candidate") return "minor";
    return "standard";
  }

  return "standard";
}

const WEIGHT_CSS: Record<VisualWeight, string> = {
  hero: "newspaper-cell newspaper-hero",
  major: "newspaper-cell newspaper-major",
  standard: "newspaper-cell newspaper-standard",
  minor: "newspaper-cell newspaper-minor",
  filler: "newspaper-cell newspaper-filler",
};

// ============================================================================
// CHAOTIC LAYOUT — deterministic pseudo-random variety
// ============================================================================

function hashTitle(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// ONE triangle float shape — used for a single "feature" item per page
const FEATURE_SHAPES: [string, string, "left" | "right"][] = [
  ["polygon(100% 0, 8% 50%, 100% 100%)", "polygon(100% 0, 0% 50%, 100% 100%)", "right"],
  ["polygon(0 0, 92% 50%, 0 100%)", "polygon(0 0, 100% 50%, 0 100%)", "left"],
];

const TILT_CLASSES = ["", "", "", "", "tilt-cw-sm", "tilt-ccw-sm", "", "", "tilt-cw-md", "tilt-ccw-md", "", "", ""];

/** Returns true when the preview text is just a restatement of the headline. */
function isDuplicateOfTitle(preview: string, title: string): boolean {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  const p = normalize(preview);
  const t = normalize(title);
  if (!p || !t) return false;
  if (p === t || t.startsWith(p) || p.startsWith(t)) return true;
  const pWords = new Set(p.split(" "));
  const tWords = new Set(t.split(" "));
  const overlap = [...pWords].filter((w) => tWords.has(w)).length;
  return overlap / Math.max(pWords.size, tWords.size) > 0.8;
}

// ============================================================================
// MOBILE TAB BAR — swipe indicator for Feed ↔ Wire
// ============================================================================

function MobileTabBar({
  scrollRef,
  activeTab,
  setActiveTab,
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  activeTab: number;
  setActiveTab: (tab: number) => void;
}) {
  const scrollTo = (idx: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ left: idx * el.clientWidth, behavior: "smooth" });
    setActiveTab(idx);
  };

  return (
    <div className="mb-2 flex items-center gap-0 lg:hidden">
      <button
        onClick={() => scrollTo(0)}
        className={`border border-[var(--rule-light)] px-3 py-1 font-mono text-[8px] font-bold uppercase tracking-[0.2em] transition-colors ${
          activeTab === 0
            ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]"
            : "bg-[var(--paper)] text-[var(--ink-faint)] hover:text-[var(--ink)]"
        }`}
      >
        Feed
      </button>
      <button
        onClick={() => scrollTo(1)}
        className={`border border-[var(--rule-light)] border-l-0 px-3 py-1 font-mono text-[8px] font-bold uppercase tracking-[0.2em] transition-colors ${
          activeTab === 1
            ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]"
            : "bg-[var(--paper)] text-[var(--ink-faint)] hover:text-[var(--ink)]"
        }`}
      >
        Wire
      </button>
      <span className="ml-2 font-mono text-[7px] uppercase tracking-[0.15em] text-[var(--ink-faint)] lg:hidden">
        swipe &lsaquo;&rsaquo;
      </span>
    </div>
  );
}

// ============================================================================
// MAIN FEED
// ============================================================================

export function TileFeed({ rssItems, casts, proposals, videos = [], biasDigest, publishedHashList }: TileFeedProps) {
  const publishedHashes = useMemo(() => new Set(publishedHashList ?? []), [publishedHashList]);
  const [filter, setFilter] = useState("all");
  const [biasFilter, setBiasFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");

  // Mobile swipe state — Feed ↔ Wire
  const [mobileTab, setMobileTab] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const handleMobileScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || el.clientWidth === 0) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    setMobileTab(idx);
  }, []);

  // Pre-generate editorials for top RSS items so they're ready before users click.
  // Fires once after mount — picks the first 8 RSS items (the ones most likely clicked).
  const pregenerateTriggered = useRef(false);
  useEffect(() => {
    if (pregenerateTriggered.current || rssItems.length === 0) return;
    pregenerateTriggered.current = true;

    const hashes = rssItems
      .slice(0, 8)
      .map((item) => computeEntityHash(item.link));

    fetch("/api/editorial/pregenerate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hashes }),
    }).catch(() => {
      // Silent — pre-generation is best-effort
    });
  }, [rssItems]);

  const allBiasSources = useMemo(() => {
    const sources: SourceBias[] = [];
    for (const item of rssItems) {
      if (item.bias) sources.push(item.bias);
    }
    const seen = new Set<string>();
    return sources.filter((s) => {
      if (seen.has(s.domain)) return false;
      seen.add(s.domain);
      return true;
    });
  }, [rssItems]);

  const items = useMemo(() => {
    const all: TileItem[] = [];

    for (const item of rssItems) {
      all.push({
        type: "rss",
        data: item,
        category: item.category.toLowerCase(),
        sortTime: new Date(item.pubDate).getTime(),
      });
    }

    for (const cast of casts) {
      all.push({
        type: "cast",
        data: cast,
        category: "farcaster",
        sortTime: new Date(cast.timestamp).getTime(),
      });
    }

    for (const proposal of proposals) {
      const category = getProposalCategory(proposal);

      all.push({
        type: "governance",
        data: proposal,
        category,
        sortTime: proposal.startTime * 1000,
      });
    }

    for (const video of videos) {
      all.push({
        type: "video",
        data: video,
        category: "video",
        sortTime: new Date(video.pubDate).getTime(),
      });
    }

    all.sort((a, b) => b.sortTime - a.sortTime);

    // Published articles float to top while maintaining their relative order
    if (publishedHashes && publishedHashes.size > 0) {
      const published: TileItem[] = [];
      const rest: TileItem[] = [];
      for (const item of all) {
        if (
          item.type === "rss" &&
          publishedHashes.has(computeEntityHash(item.data.link))
        ) {
          published.push(item);
        } else {
          rest.push(item);
        }
      }
      return [...published, ...rest];
    }

    return all;
  }, [rssItems, casts, proposals, videos, publishedHashList]);

  const wireEntityMetaByHash = useMemo(() => {
    const map: Record<
      string,
      {
        category: string;
        bias?: string;
        tags: string[];
      }
    > = {};

    function upsert(
      entityHash: `0x${string}`,
      next: { category: string; bias?: string; tags: string[] }
    ) {
      const key = entityHash.toLowerCase();
      const existing = map[key];

      if (!existing) {
        map[key] = {
          category: next.category,
          bias: next.bias,
          tags: Array.from(new Set(next.tags)),
        };
        return;
      }

      const mergedTags = Array.from(new Set([...existing.tags, ...next.tags]));
      map[key] = {
        category: existing.category,
        bias: existing.bias ?? next.bias,
        tags: mergedTags,
      };
    }

    for (const item of rssItems) {
      upsert(computeEntityHash(item.link), {
        category: item.category.toLowerCase(),
        bias: item.bias?.bias ? item.bias.bias.toLowerCase() : undefined,
        tags: (item.tags || []).map((tag) => tag.toLowerCase()),
      });
    }

    for (const cast of casts) {
      const tippableAddress = cast.author.verifiedAddresses?.[0] || "";
      const hash = tippableAddress
        ? computeEntityHash(tippableAddress)
        : computeEntityHash(`farcaster://${cast.author.username}`);
      upsert(hash, {
        category: "farcaster",
        tags: ["farcaster"],
      });
    }

    for (const proposal of proposals) {
      upsert(computeEntityHash(proposal.id), {
        category: getProposalCategory(proposal),
        tags: (proposal.tags || []).map((tag) => tag.toLowerCase()),
      });
    }

    return map;
  }, [rssItems, casts, proposals]);

  const tagOptions = useMemo(() => {
    const counts = new Map<string, number>();

    for (const item of rssItems) {
      for (const tag of item.tags || []) {
        const normalized = tag.toLowerCase();
        counts.set(normalized, (counts.get(normalized) || 0) + 1);
      }
    }

    for (const proposal of proposals) {
      for (const tag of proposal.tags || []) {
        const normalized = tag.toLowerCase();
        counts.set(normalized, (counts.get(normalized) || 0) + 1);
      }
    }

    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 12)
      .map(([tag]) => tag);
  }, [rssItems, proposals]);

  const filtered = useMemo(() => {
    let result = items;
    if (filter !== "all") {
      result = result.filter((item) => item.category === filter);
    }
    if (biasFilter !== "all") {
      result = result.filter((item) => {
        if (item.type !== "rss") return true;
        const bias = item.data.bias;
        if (!bias) return false;
        if (biasFilter === "left") return bias.bias === "left" || bias.bias === "far-left";
        if (biasFilter === "right") return bias.bias === "right" || bias.bias === "far-right";
        return bias.bias === biasFilter;
      });
    }
    if (tagFilter !== "all") {
      result = result.filter((item) => {
        if (item.type === "rss") {
          return (item.data.tags || []).some((tag) => tag.toLowerCase() === tagFilter);
        }
        if (item.type === "governance") {
          return (item.data.tags || []).some((tag) => tag.toLowerCase() === tagFilter);
        }
        return false;
      });
    }
    return result;
  }, [items, filter, biasFilter, tagFilter]);

  // Track hero count to prevent multiple heroes
  let heroCount = 0;
  // Only one triangle-float "feature" per page
  let featureUsed = false;

  return (
    <div>
      {/* ── Filters — monospace text buttons with pipe separators ── */}
      <div className="mb-4 flex items-center gap-0 overflow-x-auto border-b border-[var(--rule-light)] pb-3 font-mono text-[10px] uppercase tracking-wider scrollbar-hide sm:flex-wrap sm:overflow-x-visible">
        {FILTER_OPTIONS.map((opt, i) => (
          <span key={opt.value} className="flex shrink-0 items-center whitespace-nowrap">
            {i > 0 && <span className="mx-1.5 text-[var(--rule-light)]">|</span>}
            <button
              onClick={() => setFilter(opt.value)}
              className={`transition-colors ${
                filter === opt.value
                  ? "font-bold text-[var(--ink)] underline underline-offset-4 decoration-[var(--rule)]"
                  : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
              }`}
            >
              {opt.label}
            </button>
          </span>
        ))}

        <span className="mx-3 shrink-0 text-[var(--rule-light)]">·</span>

        {BIAS_FILTER_OPTIONS.map((opt, i) => (
          <span key={opt.value} className="flex shrink-0 items-center whitespace-nowrap">
            {i > 0 && <span className="mx-1 text-[var(--rule-light)]">|</span>}
            <button
              onClick={() => setBiasFilter(opt.value)}
              className={`transition-colors ${
                biasFilter === opt.value
                  ? "font-bold text-[var(--ink)] underline underline-offset-4"
                  : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
              }`}
            >
              {opt.label}
            </button>
          </span>
        ))}

        {tagOptions.length > 0 && (
          <>
            <span className="mx-3 shrink-0 text-[var(--rule-light)]">·</span>

            <span className="mr-1 shrink-0 text-[var(--ink-faint)]">Tags</span>

            <button
              onClick={() => setTagFilter("all")}
              className={`shrink-0 whitespace-nowrap transition-colors ${
                tagFilter === "all"
                  ? "font-bold text-[var(--ink)] underline underline-offset-4"
                  : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
              }`}
            >
              all
            </button>

            {tagOptions.map((tag) => (
              <span key={tag} className="flex shrink-0 items-center whitespace-nowrap">
                <span className="mx-1 text-[var(--rule-light)]">|</span>
                <button
                  onClick={() => setTagFilter(tag)}
                  className={`transition-colors ${
                    tagFilter === tag
                      ? "font-bold text-[var(--ink)] underline underline-offset-4"
                      : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
                  }`}
                >
                  #{tag}
                </button>
              </span>
            ))}
          </>
        )}

        <span className="ml-auto shrink-0 text-[var(--ink-faint)]">{filtered.length} items</span>
      </div>

      {/* Bias distribution — after filters */}
      {allBiasSources.length > 0 && (
        <div className="mb-4">
          <BiasBar sources={allBiasSources} digest={biasDigest ?? undefined} />
        </div>
      )}

      {/* ── Mobile tabs: Feed ↔ Wire ── */}
      <MobileTabBar scrollRef={scrollRef} activeTab={mobileTab} setActiveTab={setMobileTab} />

      <div
        ref={scrollRef}
        onScroll={handleMobileScroll}
        className="flex w-full snap-x snap-mandatory gap-0 overflow-x-auto overflow-y-hidden lg:snap-none lg:overflow-x-hidden scrollbar-hide"
      >
        <div className="min-w-0 w-full shrink-0 snap-start overflow-hidden border-r-2 border-[var(--rule)] pr-0 lg:w-auto lg:shrink lg:flex-1 lg:overflow-visible lg:pr-4">
          {/* ── NEWSPAPER GRID ── */}
          <div className="newspaper-grid">
            {filtered.flatMap((item, i) => {
              const elements: React.ReactNode[] = [];

              // ── Pull quote every ~12 items ──
              if (i > 0 && i % 12 === 0) {
                const quoteItem = filtered.slice(Math.max(0, i - 8), i).find(
                  (it) =>
                    it.type === "rss" &&
                    it.data.description &&
                    it.data.description.length > 50
                );
                if (quoteItem && quoteItem.type === "rss") {
                  const desc = quoteItem.data.description || "";
                  const snippet =
                    desc.length > 140
                      ? desc.slice(0, 140).replace(/\s\S*$/, "") + "\u2026"
                      : desc;
                  elements.push(
                    <div key={`pq-${i}`} className="pull-quote-row">
                      <p className="font-headline text-lg italic leading-relaxed text-[var(--ink-light)] sm:text-xl">
                        &ldquo;{snippet}&rdquo;
                      </p>
                      <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.3em] text-[var(--ink-faint)]">
                        &mdash; {quoteItem.data.source}
                      </p>
                    </div>
                  );
                }
              }

              let weight = assignWeight(item, i, publishedHashes);
              if (weight === "hero") {
                if (heroCount > 0) weight = "major";
                else heroCount++;
              }

              // Chaotic properties from title hash
              const titleStr =
                item.type === "rss"
                  ? item.data.title
                  : item.type === "governance"
                    ? item.data.title
                    : item.type === "video"
                      ? item.data.title
                      : item.data.text;
              const seed = hashTitle(titleStr);
              const tilt = TILT_CLASSES[seed % TILT_CLASSES.length];
              const isInverted = seed % 19 === 0 && weight !== "hero";

              // One triangle feature per page — only a major rss item with image
              let isFeature = false;
              if (
                !featureUsed &&
                weight === "major" &&
                item.type === "rss" &&
                item.data.imageUrl &&
                i > 2 &&
                seed % 5 === 0
              ) {
                isFeature = true;
                featureUsed = true;
              }

              const isPublished = item.type === "rss" && !!publishedHashes?.has(computeEntityHash(item.data.link));

              elements.push(
                <div
                  key={`${item.type}-${i}`}
                  className={`${WEIGHT_CSS[weight]} ${tilt} ${isInverted ? "ink-block" : ""}`}
                >
                  {renderTile(item, weight, seed, isFeature, isPublished)}
                </div>
              );

              return elements;
            })}
          </div>

          {/* Section rule */}
          {filtered.length > 0 && <hr className="newspaper-rule mt-0" />}

          {filtered.length === 0 && (
            <div className="py-16 text-center font-body-serif text-sm italic text-[var(--ink-faint)]">
              No dispatches match the current edition.
            </div>
          )}
        </div>

        <div className="w-full shrink-0 snap-start overflow-hidden pl-4 lg:block lg:w-56 lg:max-w-56 lg:shrink-0 lg:overflow-visible">
          <LiveCommentColumn
            categoryFilter={filter}
            biasFilter={biasFilter}
            tagFilter={tagFilter}
            entityMetaByHash={wireEntityMetaByHash}
          />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// TILE ROUTER — picks component based on type
// ============================================================================

function renderTile(item: TileItem, weight: VisualWeight, seed: number = 0, isFeature: boolean = false, isPublished: boolean = false) {
  switch (item.type) {
    case "rss":
      return <RssTile item={item.data} weight={weight} seed={seed} isFeature={isFeature} isPublished={isPublished} />;
    case "cast":
      return <CastTile cast={item.data} weight={weight} />;
    case "video":
      return <VideoTile video={item.data} weight={weight} />;
    case "governance": {
      const p = item.data;
      if (p.status === "candidate") return <CandidateTile proposal={p} weight={weight} />;
      if (["parliament", "congress", "eu", "canada", "australia"].includes(p.source)) {
        return <ParliamentTile proposal={p} weight={weight} />;
      }
      if (p.source === "sec") return <SECTile proposal={p} weight={weight} />;
      return <GovernanceTile proposal={p} weight={weight} />;
    }
  }
}

// ============================================================================
// RSS TILE — newspaper article with Playfair headlines
// ============================================================================

const HEADLINE_SIZES: Record<VisualWeight, string> = {
  hero: "text-3xl sm:text-4xl lg:text-5xl leading-[1.05] font-headline",
  major: "text-xl sm:text-2xl leading-tight font-headline",
  standard: "text-base leading-snug font-headline",
  minor: "text-sm leading-snug font-headline-serif font-bold",
  filler: "text-xs leading-snug font-headline-serif font-semibold",
};

function RssTile({ item, weight, seed = 0, isFeature = false, isPublished = false }: { item: FeedItemType; weight: VisualWeight; seed?: number; isFeature?: boolean; isPublished?: boolean }) {
  const { isConnected } = useAccount();
  const timeSince = getTimeSince(item.pubDate);
  const entityHash = computeEntityHash(item.link);
  const isHero = weight === "hero";
  const isBreaking = (Date.now() - new Date(item.pubDate).getTime()) < 3600000;
  const rawPreview = item.canonicalClaim || item.description;
  const previewText = rawPreview && !isDuplicateOfTitle(rawPreview, item.title)
    ? rawPreview
    : undefined;

  // ─── HERO: full-width stretch banner ───
  if (isHero) {
    return (
      <article className="relative">
        {isBreaking && <span className="breaking-stamp">Breaking</span>}

        {/* Full-width banner image — no crop, no triangle */}
        {item.imageUrl && (
          <Link href={`/article/${entityHash}`} className="block">
            <div className="newspaper-img-hero overflow-hidden" style={{ height: "clamp(280px, 40vw, 480px)" }}>
              <img
                src={item.imageUrl}
                alt=""
                className="newspaper-img h-full w-full object-cover"
                loading="eager"
              />
            </div>
          </Link>
        )}

        {/* Dateline */}
        <div className="mt-3 mb-1 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
          {isPublished && <span className="font-bold text-[var(--accent-red)]">Editorial</span>}
          {isPublished && <span>&middot;</span>}
          <span className="font-bold text-[var(--ink-light)]">{item.source}</span>
          {item.bias && <BiasPill bias={item.bias} />}
          <span>&middot;</span>
          <span>{item.category}</span>
          <span className="ml-auto">{timeSince}</span>
        </div>

        {/* Giant headline */}
        <Link href={`/article/${entityHash}`}>
          <h3 className={`${HEADLINE_SIZES.hero} text-[var(--ink)] transition-colors hover:text-[var(--accent-red)]`}>
            {item.title}
          </h3>
        </Link>

        {/* Body with drop cap */}
        {previewText && (
          <p className="mt-3 font-body-serif text-base leading-relaxed text-[var(--ink-light)] drop-cap">
            {previewText}
          </p>
        )}

        {/* Footer */}
        <div className="flex items-center gap-3 border-t border-[var(--rule-light)] pt-2 mt-4 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
          <Link href={`/article/${entityHash}`} className="font-bold text-[var(--ink-light)] transition-colors hover:text-[var(--ink)]">Read</Link>
          <a href={item.link} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-[var(--ink)]">Source&nbsp;&rsaquo;</a>
          <Link href={`/entity/${entityHash}`} className="transition-colors hover:text-[var(--ink)]">Discuss</Link>
          {isConnected && <TipButton entityHash={entityHash} />}
        </div>
      </article>
    );
  }

  // ─── FEATURE: single triangle float (only one per page) ───
  if (isFeature && item.imageUrl) {
    const shape = FEATURE_SHAPES[seed % FEATURE_SHAPES.length];
    return (
      <article className="relative">
        {isBreaking && <span className="breaking-stamp">Breaking</span>}

        <div
          className="newspaper-img-hero overflow-hidden"
          style={{
            float: shape[2],
            width: "42%",
            height: "260px",
            clipPath: shape[0],
            shapeOutside: shape[1],
            ...(shape[2] === "right"
              ? { marginLeft: "16px", marginBottom: "8px" }
              : { marginRight: "16px", marginBottom: "8px" }),
          }}
        >
          <img src={item.imageUrl} alt="" className="newspaper-img h-full w-full object-cover" loading="lazy" />
        </div>

        <div className="mb-1 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
          {isPublished && <span className="font-bold text-[var(--accent-red)]">Editorial</span>}
          {isPublished && <span>&middot;</span>}
          <span className="font-bold text-[var(--ink-light)]">{item.source}</span>
          {item.bias && <BiasPill bias={item.bias} />}
          <span>&middot;</span>
          <span>{item.category}</span>
          <span className="ml-auto">{timeSince}</span>
        </div>

        <Link href={`/article/${entityHash}`}>
          <h3 className={`${HEADLINE_SIZES[weight]} text-[var(--ink)] transition-colors hover:text-[var(--accent-red)]`}>
            {item.title}
          </h3>
        </Link>

        {previewText && (
          <p className="mt-2 font-body-serif text-sm leading-relaxed text-[var(--ink-light)] line-clamp-4">
            {previewText}
          </p>
        )}

        <div style={{ clear: "both" }} />

        <div className="flex items-center gap-3 border-t border-[var(--rule-light)] pt-2 mt-3 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
          <Link href={`/article/${entityHash}`} className="font-bold text-[var(--ink-light)] transition-colors hover:text-[var(--ink)]">Read</Link>
          <a href={item.link} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-[var(--ink)]">Source&nbsp;&rsaquo;</a>
          <Link href={`/entity/${entityHash}`} className="transition-colors hover:text-[var(--ink)]">Discuss</Link>
          {isConnected && <TipButton entityHash={entityHash} />}
        </div>
      </article>
    );
  }

  // ─── STANDARD / MAJOR / MINOR / FILLER: clean square images ───
  return (
    <article className="relative flex h-full flex-col">
      {isBreaking && <span className="breaking-stamp">Breaking</span>}

      {/* Square image — no clip-path, clean rectangle */}
      {item.imageUrl && (
        <Link href={`/article/${entityHash}`} className="block">
          <div className={`newspaper-img-hero mb-3 overflow-hidden ${weight === "major" ? "h-44" : "h-28"}`}>
            <img
              src={item.imageUrl}
              alt=""
              className="newspaper-img h-full w-full object-cover"
              loading="lazy"
            />
          </div>
        </Link>
      )}

      {/* Dateline */}
      <div className="mb-1 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
        {isPublished && <span className="font-bold text-[var(--accent-red)]">Editorial</span>}
        {isPublished && <span>&middot;</span>}
        <span className="font-bold text-[var(--ink-light)]">{item.source}</span>
        {item.bias && <BiasPill bias={item.bias} />}
        <span>&middot;</span>
        <span>{item.category}</span>
        <span className="ml-auto">{timeSince}</span>
      </div>

      {/* Headline */}
      <Link href={`/article/${entityHash}`}>
        <h3 className={`${HEADLINE_SIZES[weight]} text-[var(--ink)] transition-colors hover:text-[var(--accent-red)] line-clamp-3`}>
          {item.title}
        </h3>
      </Link>

      {/* Body — on major and standard */}
      {previewText && (weight === "standard" || weight === "major") && (
        <p className={`mt-1 font-body-serif text-xs leading-relaxed text-[var(--ink-light)] ${weight === "major" ? "line-clamp-3" : "line-clamp-2"}`}>
          {previewText}
        </p>
      )}

      {/* Footer */}
      <div className="mt-auto flex items-center gap-3 border-t border-[var(--rule-light)] pt-2 mt-3 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
        <Link href={`/article/${entityHash}`} className="font-bold text-[var(--ink-light)] transition-colors hover:text-[var(--ink)]">Read</Link>
        <a href={item.link} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-[var(--ink)]">Source&nbsp;&rsaquo;</a>
        <Link href={`/entity/${entityHash}`} className="transition-colors hover:text-[var(--ink)]">Discuss</Link>
        {isConnected && <TipButton entityHash={entityHash} />}
      </div>
    </article>
  );
}

// ============================================================================
// CAST TILE — "Social Dispatch" — reader letters style
// ============================================================================

function CastTile({ cast, weight }: { cast: Cast; weight: VisualWeight }) {
  const { isConnected } = useAccount();
  const engagement = cast.likes + cast.recasts + cast.replies;
  const isHot = engagement > 50;

  const tippableAddress = cast.author.verifiedAddresses?.[0]?.trim() || "";
  const directTipAddress = isAddress(tippableAddress) ? tippableAddress : null;
  const entityHash = tippableAddress
    ? computeEntityHash(tippableAddress)
    : computeEntityHash(`farcaster://${cast.author.username}`);

  return (
    <article className="flex flex-col h-full">
      {/* Author — tiny grayscale PFP + name */}
      <div className="mb-2 flex items-center gap-2">
        <img
          src={cast.author.pfpUrl || "https://picsum.photos/seed/fc/24/24"}
          alt=""
          className="newspaper-img h-4 w-4 rounded-full"
          loading="lazy"
        />
        <span className="truncate font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-light)]">
          {cast.author.displayName}
        </span>
        <span className="font-mono text-[8px] uppercase tracking-widest text-[var(--ink-faint)]">
          FC
        </span>
        {isHot && (
          <span className="font-mono text-[8px] font-bold uppercase tracking-widest text-[var(--accent-red)]">
            HOT
          </span>
        )}
      </div>

      {/* Cast body — Baskerville italic, like a reader letter */}
      <p className="line-clamp-4 font-body-serif text-sm italic leading-relaxed text-[var(--ink-light)]">
        &ldquo;{cast.text}&rdquo;
      </p>

      {/* Embed image */}
      {(() => {
        const imageEmbed = cast.embeds.find(
          (e) => e.metadata?.image || e.url?.match(/\.(jpg|jpeg|png|gif|webp)/i)
        );
        const imageUrl = imageEmbed?.metadata?.image || imageEmbed?.url;
        if (!imageUrl) return null;
        return (
          <div className="newspaper-img-hero mt-2 h-24 w-full overflow-hidden">
            <img src={imageUrl} alt="" className="newspaper-img h-full w-full object-cover" loading="lazy" />
          </div>
        );
      })()}

      {/* Engagement + Actions — monospace stats */}
      <div className="mt-auto flex items-center gap-3 border-t border-[var(--rule-light)] pt-2 mt-3 font-mono text-[9px] text-[var(--ink-faint)]">
        <span>{cast.likes} ♥</span>
        <span>{cast.recasts} ⟳</span>
        <span>{cast.replies} ✎</span>
        <Link
          href={`/entity/${entityHash}`}
          className="uppercase tracking-wider transition-colors hover:text-[var(--ink)]"
        >
          Discuss
        </Link>
        {isConnected && directTipAddress && (
          <TipButton recipientAddress={directTipAddress} />
        )}
      </div>
    </article>
  );
}

// ============================================================================
// GOVERNANCE TILE — "Legislative Notice"
// ============================================================================

function GovernanceTile({ proposal, weight }: { proposal: Proposal; weight: VisualWeight }) {
  const { isConnected } = useAccount();
  const { forPct, againstPct } = getVotePercentage(
    proposal.votesFor,
    proposal.votesAgainst
  );
  const isActive = proposal.status === "active";
  const isDelegationActivity = isDelegationActivityProposal(proposal);
  const proposer = proposal.proposer?.trim() || "";
  const hasProposerAddress = isAddress(proposer);
  const hasVotes = !isDelegationActivity && proposal.votesFor + proposal.votesAgainst > 0;

  return (
    <article className="flex flex-col h-full">
      {/* DAO header — monospace, ruled underline */}
      <div className="mb-2 flex items-center gap-2 border-b border-[var(--rule-light)] pb-1.5">
        <img
          src={proposal.daoLogo}
          alt={proposal.dao}
          className="newspaper-img h-4 w-4 rounded-full"
          loading="lazy"
        />
        <span className="truncate font-mono text-[10px] uppercase tracking-wider text-[var(--ink-light)]">
          {proposal.dao}
        </span>
        {proposal.source === "onchain" && (
          <span className="font-mono text-[8px] font-bold uppercase tracking-widest text-[var(--ink-faint)]">
            Onchain
          </span>
        )}
        <span className={`ml-auto font-mono text-[9px] uppercase tracking-wider ${isActive ? "font-bold text-[var(--ink)]" : "text-[var(--ink-faint)]"}`}>
          {isActive
            ? getTimeRemaining(proposal.endTime)
            : isDelegationActivity
              ? "delegation"
              : proposal.status}
        </span>
      </div>

      {/* Title — Playfair */}
      <Link href={`/proposals/${encodeURIComponent(proposal.id)}`}>
        <h3 className={`${weight === "major" ? "text-xl font-headline" : "text-sm font-headline-serif font-bold"} leading-snug text-[var(--ink)] line-clamp-3 transition-colors hover:text-[var(--accent-red)]`}>
          {proposal.title}
        </h3>
      </Link>

      {/* Monochrome vote tally — text, not colored bars */}
      {hasVotes && (
        <div className="mt-2">
          {/* Thin monochrome bar */}
          <div className="flex h-1 overflow-hidden bg-[var(--paper-dark)]">
            <div className="bg-[var(--ink)]" style={{ width: `${forPct}%` }} />
          </div>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-light)]">
            Ayes {forPct}% &mdash; Noes {againstPct}%
          </p>
        </div>
      )}
      {isDelegationActivity && (
        <p className="mt-2 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
          Onchain delegate change
        </p>
      )}

      {/* Tags */}
      {proposal.tags && proposal.tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {proposal.tags.slice(0, 4).map((tag) => (
            <span key={tag} className="font-mono text-[8px] text-[var(--ink-faint)]">
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="mt-auto flex items-center gap-3 border-t border-[var(--rule-light)] pt-2 mt-3 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
        <a
          href={proposal.link}
          target="_blank"
          rel="noopener noreferrer"
          className="transition-colors hover:text-[var(--ink)]"
        >
          {isDelegationActivity ? "View Activity" : "View Vote"}
        </a>
        {isConnected && hasProposerAddress && (
          <TipButton recipientAddress={proposer} />
        )}
      </div>
    </article>
  );
}

// ============================================================================
// CANDIDATE TILE — proposal seeking sponsors
// ============================================================================

function CandidateTile({ proposal, weight }: { proposal: Proposal; weight: VisualWeight }) {
  const { isConnected } = useAccount();
  const sponsorCount = proposal.candidateSignatures || 0;
  const threshold = proposal.candidateThreshold || 0;
  const sponsorPct = threshold > 0 ? Math.min(100, Math.round((sponsorCount / threshold) * 100)) : 0;
  const isPromotable = proposal.candidateIsPromotable;
  const proposer = proposal.proposer?.trim() || "";
  const hasProposerAddress = isAddress(proposer);

  const candidateHref = proposal.candidateSlug
    ? `/proposals/candidate/${encodeURIComponent(proposal.candidateSlug)}`
    : `/proposals/${encodeURIComponent(proposal.id)}`;

  return (
    <article className="flex flex-col h-full">
      {/* Header */}
      <div className="mb-2 flex items-center gap-2 border-b border-[var(--rule-light)] pb-1.5">
        <img
          src={proposal.daoLogo}
          alt={proposal.dao}
          className="newspaper-img h-4 w-4 rounded-full"
          loading="lazy"
        />
        <span className="truncate font-mono text-[10px] uppercase tracking-wider text-[var(--ink-light)]">
          {proposal.dao}
        </span>
        <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-[var(--ink)]">
          Candidate
        </span>
        {isPromotable && (
          <span className="font-mono text-[8px] font-bold italic uppercase tracking-widest text-[var(--ink)]">
            Ready
          </span>
        )}
      </div>

      {/* Title */}
      <Link href={candidateHref}>
        <h3 className="text-sm font-headline-serif font-bold leading-snug text-[var(--ink)] line-clamp-2 transition-colors hover:text-[var(--accent-red)]">
          {proposal.title}
        </h3>
      </Link>

      {/* Sponsor progress — monochrome bar */}
      <div className="mt-2">
        <div className="flex h-1 overflow-hidden bg-[var(--paper-dark)]">
          <div className="bg-[var(--ink)]" style={{ width: `${sponsorPct}%` }} />
        </div>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-light)]">
          {sponsorCount} / {threshold} sponsors &mdash; {sponsorPct}%
        </p>
      </div>

      {/* Footer */}
      <div className="mt-auto flex items-center gap-3 border-t border-[var(--rule-light)] pt-2 mt-3 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
        <Link href={candidateHref} className="transition-colors hover:text-[var(--ink)]">
          {isPromotable ? "Promote" : "Sponsor"}
        </Link>
        {isConnected && hasProposerAddress && (
          <TipButton recipientAddress={proposer} />
        )}
      </div>
    </article>
  );
}

// ============================================================================
// PARLIAMENT TILE — Government votes (UK, US, EU, CA, AU)
// ============================================================================

const GOV_FLAGS: Record<string, string> = {
  parliament: "🇬🇧",
  congress: "🇺🇸",
  eu: "🇪🇺",
  canada: "🇨🇦",
  australia: "🇦🇺",
};

const GOV_NAMES: Record<string, string> = {
  parliament: "UK Parliament",
  congress: "US Congress",
  eu: "EU Parliament",
  canada: "Canada Parliament",
  australia: "Australia Parliament",
};

function ParliamentTile({ proposal, weight }: { proposal: Proposal; weight: VisualWeight }) {
  const { forPct, againstPct } = getVotePercentage(
    proposal.votesFor,
    proposal.votesAgainst
  );
  const chamber = proposal.chamber || "";
  const hasVotes = proposal.votesFor + proposal.votesAgainst > 0;
  const flag = GOV_FLAGS[proposal.source] || "🏛️";
  const govName = proposal.dao || GOV_NAMES[proposal.source] || "Government";

  const divisionHref = proposal.divisionId
    ? `/proposals/division/${proposal.divisionId}?chamber=${(chamber || "commons").toLowerCase()}`
    : `/proposals/${encodeURIComponent(proposal.id)}`;

  return (
    <article className="flex flex-col h-full">
      {/* Header */}
      <div className="mb-2 flex items-center gap-2 border-b border-[var(--rule-light)] pb-1.5">
        <span className="text-sm">{flag}</span>
        <span className="truncate font-mono text-[10px] uppercase tracking-wider text-[var(--ink-light)]">
          {govName}
        </span>
        {chamber && (
          <span className="font-mono text-[8px] font-bold uppercase tracking-widest text-[var(--ink-faint)]">
            {chamber}
          </span>
        )}
        <span className="ml-auto font-mono text-[9px] text-[var(--ink-faint)]">
          {proposal.startTime > 0
            ? new Date(proposal.startTime * 1000).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
              })
            : ""}
        </span>
      </div>

      {/* Title */}
      <Link href={divisionHref}>
        <h3 className={`${weight === "major" ? "text-lg font-headline" : "text-sm font-headline-serif font-bold"} leading-snug text-[var(--ink)] line-clamp-2 transition-colors hover:text-[var(--accent-red)]`}>
          {proposal.title}
        </h3>
      </Link>

      {/* Proposer */}
      {proposal.proposer && (
        <p className="mt-0.5 font-mono text-[9px] italic text-[var(--ink-faint)] truncate">
          by {proposal.proposer}
        </p>
      )}

      {/* Vote tally — text style: "AYES 234 — NOES 123" */}
      {hasVotes && (
        <div className="mt-2">
          <div className="flex h-1 overflow-hidden bg-[var(--paper-dark)]">
            <div className="bg-[var(--ink)]" style={{ width: `${forPct}%` }} />
          </div>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-light)]">
            Ayes {proposal.votesFor} &mdash; Noes {proposal.votesAgainst}
          </p>
        </div>
      )}

      {/* Tags */}
      {proposal.tags && proposal.tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {proposal.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="font-mono text-[8px] text-[var(--ink-faint)]">
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="mt-auto flex items-center gap-3 border-t border-[var(--rule-light)] pt-2 mt-3 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
        {proposal.source === "parliament" && proposal.divisionId && (
          <Link href={divisionHref} className="transition-colors hover:text-[var(--ink)]">
            Details
          </Link>
        )}
        <a
          href={proposal.link}
          target="_blank"
          rel="noopener noreferrer"
          className="transition-colors hover:text-[var(--ink)]"
        >
          Source ↗
        </a>
      </div>
    </article>
  );
}

// ============================================================================
// SEC TILE — Corporate filing
// ============================================================================

function SECTile({ proposal, weight }: { proposal: Proposal; weight: VisualWeight }) {
  return (
    <article className="flex flex-col h-full">
      <div className="mb-2 flex items-center gap-2 border-b border-[var(--rule-light)] pb-1.5">
        <span className="text-sm">📊</span>
        <span className="truncate font-mono text-[10px] uppercase tracking-wider text-[var(--ink-light)]">
          {proposal.dao}
        </span>
        <span className="font-mono text-[8px] font-bold uppercase tracking-widest text-[var(--ink-faint)]">
          SEC
        </span>
        <span className="ml-auto font-mono text-[9px] text-[var(--ink-faint)]">
          {proposal.startTime > 0
            ? new Date(proposal.startTime * 1000).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })
            : ""}
        </span>
      </div>

      <a href={proposal.link} target="_blank" rel="noopener noreferrer">
        <h3 className="text-sm font-headline-serif font-bold leading-snug text-[var(--ink)] line-clamp-2 transition-colors hover:text-[var(--accent-red)]">
          {proposal.title}
        </h3>
      </a>

      {proposal.tags && proposal.tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {proposal.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="font-mono text-[8px] text-[var(--ink-faint)]">
              #{tag}
            </span>
          ))}
        </div>
      )}

      <div className="mt-auto flex items-center gap-3 border-t border-[var(--rule-light)] pt-2 mt-3 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
        <a
          href={proposal.link}
          target="_blank"
          rel="noopener noreferrer"
          className="transition-colors hover:text-[var(--ink)]"
        >
          EDGAR ↗
        </a>
      </div>
    </article>
  );
}

// ============================================================================
// VIDEO TILE — embedded YouTube player
// ============================================================================

function VideoTile({ video, weight }: { video: VideoItem; weight: VisualWeight }) {
  const [playing, setPlaying] = useState(false);
  const timeSince = getTimeSince(video.pubDate);
  const openMiniWindow = useCallback(() => {
    const popup = openCenteredPopup(video.url, {
      width: 980,
      height: 620,
      name: `yt_${video.id}`,
    });
    if (!popup) {
      window.open(video.url, "_blank", "noopener,noreferrer");
    }
  }, [video.id, video.url]);

  const onVideoLinkClick = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      if (shouldKeepDefaultLinkBehavior(event)) return;
      event.preventDefault();
      openMiniWindow();
    },
    [openMiniWindow]
  );

  return (
    <article className="flex flex-col h-full">
      {/* Channel header */}
      <div className="mb-2 flex items-center gap-2 border-b border-[var(--rule-light)] pb-1.5">
        <span className="text-sm">▶</span>
        <span className="truncate font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-light)]">
          {video.channel}
        </span>
        <span className="font-mono text-[8px] font-bold uppercase tracking-widest text-[var(--ink-faint)]">
          {video.category}
        </span>
        <span className="ml-auto font-mono text-[9px] text-[var(--ink-faint)]">
          {timeSince}
        </span>
      </div>

      {/* Video embed or thumbnail */}
      <div className="relative mb-2 w-full overflow-hidden bg-black" style={{ aspectRatio: "16/9" }}>
        {playing ? (
          <>
            <iframe
              src={`${video.embedUrl}?autoplay=1&rel=0`}
              title={video.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 h-full w-full border-0"
            />
          </>
        ) : (
          <button
            onClick={() => setPlaying(true)}
            className="group absolute inset-0 h-full w-full cursor-pointer"
          >
            <img
              src={video.thumbnail}
              alt=""
              className="h-full w-full object-cover grayscale contrast-105 saturate-50 brightness-95 transition-all duration-300 group-hover:scale-[1.02]"
              loading="lazy"
            />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(0,0,0,0.08))] mix-blend-luminosity" />
            {/* Play button overlay */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--ink)] bg-opacity-80 transition-transform group-hover:scale-110">
                <svg className="ml-1 h-5 w-5 text-[var(--paper)]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
          </button>
        )}
      </div>

      {/* Title */}
      <a href={video.url} target="_blank" rel="noopener noreferrer" onClick={onVideoLinkClick}>
        <h3 className={`${weight === "major" ? "text-base font-headline" : "text-sm font-headline-serif font-bold"} leading-snug text-[var(--ink)] line-clamp-2 transition-colors hover:text-[var(--accent-red)]`}>
          {video.title}
        </h3>
      </a>

      {/* Footer */}
      <div className="mt-auto flex items-center gap-3 border-t border-[var(--rule-light)] pt-2 mt-3 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
        <a
          href={video.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onVideoLinkClick}
          className="transition-colors hover:text-[var(--ink)]"
        >
          YouTube ↗
        </a>
        <button
          onClick={openMiniWindow}
          className="font-bold text-[var(--ink-light)] transition-colors hover:text-[var(--ink)]"
        >
          Mini Window
        </button>
        <button
          onClick={() => setPlaying(true)}
          className="font-bold text-[var(--ink-light)] transition-colors hover:text-[var(--ink)]"
        >
          {playing ? "Playing" : "Watch"}
        </button>
      </div>
    </article>
  );
}

// ============================================================================
// HELPERS
// ============================================================================

function getTimeSince(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}
