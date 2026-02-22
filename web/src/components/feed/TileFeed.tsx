"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { computeEntityHash } from "@/lib/entity";
import { TipButton } from "@/components/entity/TipButton";
import { StarRating } from "@/components/shared/StarRating";
import { AddressDisplay } from "@/components/shared/AddressDisplay";
import {
  type Proposal,
  getTimeRemaining,
  getVotePercentage,
} from "@/lib/governance";
import type { FeedItem as FeedItemType } from "@/lib/rss";
import type { Cast } from "@/lib/farcaster";
import { BiasPill, BiasBar } from "@/components/feed/BiasBar";
import type { SourceBias } from "@/lib/bias";

// ============================================================================
// TYPES
// ============================================================================

type TileItem =
  | { type: "rss"; data: FeedItemType; category: string; sortTime: number }
  | { type: "cast"; data: Cast; category: string; sortTime: number }
  | { type: "governance"; data: Proposal; category: string; sortTime: number };

interface TileFeedProps {
  rssItems: FeedItemType[];
  casts: Cast[];
  proposals: Proposal[];
}

const FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "world", label: "World" },
  { value: "tech", label: "Tech" },
  { value: "crypto", label: "Crypto" },
  { value: "governance", label: "Governance" },
  { value: "candidates", label: "Candidates" },
  { value: "parliament", label: "Parliament" },
  { value: "farcaster", label: "Farcaster" },
];

const BIAS_FILTER_OPTIONS = [
  { value: "all", label: "All Bias" },
  { value: "left", label: "Left" },
  { value: "lean-left", label: "Lean Left" },
  { value: "center", label: "Center" },
  { value: "lean-right", label: "Lean Right" },
  { value: "right", label: "Right" },
];

// ============================================================================
// MAIN FEED
// ============================================================================

export function TileFeed({ rssItems, casts, proposals }: TileFeedProps) {
  const [filter, setFilter] = useState("all");
  const [biasFilter, setBiasFilter] = useState("all");

  // Collect all bias data from RSS items for the distribution bar
  const allBiasSources = useMemo(() => {
    const sources: SourceBias[] = [];
    for (const item of rssItems) {
      if (item.bias) sources.push(item.bias);
    }
    // Deduplicate by domain
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
      let category = "governance";
      if (proposal.source === "parliament") category = "parliament";
      else if (proposal.status === "candidate") category = "candidates";

      all.push({
        type: "governance",
        data: proposal,
        category,
        sortTime: proposal.startTime * 1000,
      });
    }

    all.sort((a, b) => b.sortTime - a.sortTime);
    return all;
  }, [rssItems, casts, proposals]);

  const filtered = useMemo(() => {
    let result = items;
    if (filter !== "all") {
      result = result.filter((item) => item.category === filter);
    }
    if (biasFilter !== "all") {
      result = result.filter((item) => {
        if (item.type !== "rss") return true; // non-RSS items pass through
        const bias = item.data.bias;
        if (!bias) return false;
        // Group: "left" includes far-left + left, "right" includes right + far-right
        if (biasFilter === "left") return bias.bias === "left" || bias.bias === "far-left";
        if (biasFilter === "right") return bias.bias === "right" || bias.bias === "far-right";
        return bias.bias === biasFilter;
      });
    }
    return result;
  }, [items, filter, biasFilter]);

  return (
    <div>
      {/* Bias distribution bar */}
      {allBiasSources.length > 0 && (
        <div className="mb-4">
          <BiasBar sources={allBiasSources} />
        </div>
      )}

      {/* Filters row */}
      <div className="mb-5 flex items-center gap-2">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-medium text-white outline-none transition-colors focus:border-[#2F80ED] hover:border-zinc-600"
        >
          {FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select
          value={biasFilter}
          onChange={(e) => setBiasFilter(e.target.value)}
          className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-medium text-white outline-none transition-colors focus:border-[#2F80ED] hover:border-zinc-600"
        >
          {BIAS_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <span className="ml-auto text-xs text-zinc-600">{filtered.length} items</span>
      </div>

      {/* Tile grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((item, i) => {
          switch (item.type) {
            case "rss":
              return <RssTile key={`rss-${item.data.id}`} item={item.data} />;
            case "cast":
              return <CastTile key={`cast-${item.data.hash}`} cast={item.data} />;
            case "governance": {
              const p = item.data;
              if (p.status === "candidate") {
                return <CandidateTile key={`cand-${p.id}`} proposal={p} />;
              }
              if (p.source === "parliament") {
                return <ParliamentTile key={`parl-${p.id}`} proposal={p} />;
              }
              return <GovernanceTile key={`gov-${p.id}`} proposal={p} />;
            }
          }
        })}
      </div>

      {filtered.length === 0 && (
        <div className="py-16 text-center text-sm text-zinc-500">
          Nothing here yet.
        </div>
      )}
    </div>
  );
}

// ============================================================================
// RSS TILE — compact news card with rating + tip
// ============================================================================

function RssTile({ item }: { item: FeedItemType }) {
  const { isConnected } = useAccount();
  const timeSince = getTimeSince(item.pubDate);
  const entityHash = computeEntityHash(item.link);

  return (
    <div className="group flex flex-col rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 transition-colors hover:border-zinc-600">
      {/* Image */}
      {item.imageUrl && (
        <a href={item.link} target="_blank" rel="noopener noreferrer">
          <div className="mb-2 h-28 w-full overflow-hidden rounded-md">
            <img
              src={item.imageUrl}
              alt=""
              className="h-full w-full object-cover transition-transform group-hover:scale-105"
              loading="lazy"
            />
          </div>
        </a>
      )}

      {/* Meta */}
      <div className="mb-1 flex items-center gap-1.5 text-[10px]">
        <span className="font-semibold text-[#31F387]">{item.source}</span>
        {item.bias && <BiasPill bias={item.bias} />}
        <span className="text-zinc-600">&middot;</span>
        <span className="text-zinc-500">{item.category}</span>
        <span className="ml-auto text-zinc-600">{timeSince}</span>
      </div>

      {/* Title */}
      <a href={item.link} target="_blank" rel="noopener noreferrer">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-white transition-colors group-hover:text-[#2F80ED]">
          {item.title}
        </h3>
      </a>

      {/* Snippet */}
      {item.description && (
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-500">
          {item.description}
        </p>
      )}

      {/* Actions: Star rating + Discuss + Tip */}
      <div className="mt-auto flex items-center gap-3 border-t border-zinc-800/50 pt-2 mt-2">
        <StarRating rating={0} size="sm" count={0} />
        <Link
          href={`/entity/${entityHash}`}
          className="text-[10px] text-zinc-500 transition-colors hover:text-[#2F80ED]"
        >
          Discuss
        </Link>
        {isConnected && <TipButton entityHash={entityHash} />}
      </div>
    </div>
  );
}

// ============================================================================
// CAST TILE — compact Farcaster card with tip
// ============================================================================

function CastTile({ cast }: { cast: Cast }) {
  const { isConnected } = useAccount();
  const engagement = cast.likes + cast.recasts + cast.replies;
  const isHot = engagement > 50;

  const tippableAddress = cast.author.verifiedAddresses?.[0] || "";
  const entityHash = tippableAddress
    ? computeEntityHash(tippableAddress)
    : computeEntityHash(`farcaster://${cast.author.username}`);

  return (
    <div
      className={`group flex flex-col rounded-lg border p-3 transition-colors ${
        isHot
          ? "border-[#8A63D2]/30 bg-[#8A63D2]/5 hover:border-[#8A63D2]/50"
          : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-600"
      }`}
    >
      {/* Author row */}
      <div className="mb-1.5 flex items-center gap-2">
        <img
          src={cast.author.pfpUrl || "https://picsum.photos/seed/fc/24/24"}
          alt=""
          className="h-5 w-5 rounded-full"
          loading="lazy"
        />
        <span className="truncate text-xs font-semibold text-white">
          {cast.author.displayName}
        </span>
        <span className="shrink-0 rounded bg-[#8A63D2]/20 px-1 py-px text-[9px] font-medium text-[#8A63D2]">
          FC
        </span>
        {isHot && (
          <span className="shrink-0 rounded-full bg-[#D0021B]/10 px-1 py-px text-[9px] font-bold text-[#D0021B]">
            HOT
          </span>
        )}
      </div>

      {/* Cast text */}
      <p className="line-clamp-3 text-xs leading-relaxed text-zinc-300">
        {cast.text}
      </p>

      {/* Embed image */}
      {(() => {
        const imageEmbed = cast.embeds.find(
          (e) => e.metadata?.image || e.url?.match(/\.(jpg|jpeg|png|gif|webp)/i)
        );
        const imageUrl = imageEmbed?.metadata?.image || imageEmbed?.url;
        if (!imageUrl) return null;
        return (
          <div className="mt-2 h-24 w-full overflow-hidden rounded-md">
            <img src={imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
          </div>
        );
      })()}

      {/* Engagement + Actions */}
      <div className="mt-auto flex items-center gap-3 border-t border-zinc-800/50 pt-2 mt-2 text-[10px] text-zinc-500">
        <span>{cast.likes} ♥</span>
        <span>{cast.recasts} ⟳</span>
        <span>{cast.replies} 💬</span>
        <Link
          href={`/entity/${entityHash}`}
          className="transition-colors hover:text-[#2F80ED]"
        >
          Discuss
        </Link>
        {isConnected && tippableAddress && <TipButton entityHash={entityHash} />}
      </div>
    </div>
  );
}

// ============================================================================
// GOVERNANCE TILE — compact DAO vote card with tip
// ============================================================================

const STATUS_DOT: Record<string, string> = {
  active: "bg-[#31F387]",
  pending: "bg-yellow-400",
  succeeded: "bg-[#2F80ED]",
  queued: "bg-purple-400",
  executed: "bg-zinc-500",
  defeated: "bg-[#D0021B]",
  closed: "bg-zinc-600",
  candidate: "bg-amber-400",
};

function GovernanceTile({ proposal }: { proposal: Proposal }) {
  const { isConnected } = useAccount();
  const { forPct, againstPct } = getVotePercentage(
    proposal.votesFor,
    proposal.votesAgainst
  );
  const isActive = proposal.status === "active";
  const proposerHash = proposal.proposer ? computeEntityHash(proposal.proposer) : "";

  return (
    <div className="group flex flex-col rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 transition-colors hover:border-zinc-600">
      {/* DAO row */}
      <div className="mb-1.5 flex items-center gap-2">
        <img
          src={proposal.daoLogo}
          alt={proposal.dao}
          className="h-5 w-5 rounded-full"
          loading="lazy"
        />
        <span className="truncate text-xs font-medium text-zinc-400">
          {proposal.dao}
        </span>
        {proposal.source === "onchain" && (
          <span className="rounded bg-zinc-800 px-1 py-px text-[9px] font-medium uppercase text-zinc-500">
            Onchain
          </span>
        )}
        <span
          className={`ml-auto h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[proposal.status] || STATUS_DOT.closed} ${isActive ? "animate-pulse" : ""}`}
        />
        <span className="text-[10px] text-zinc-500">
          {isActive ? getTimeRemaining(proposal.endTime) : proposal.status}
        </span>
      </div>

      {/* Title */}
      <Link href={`/proposals/${encodeURIComponent(proposal.id)}`}>
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-white transition-colors group-hover:text-[#2F80ED]">
          {proposal.title}
        </h3>
      </Link>

      {/* Vote bar */}
      <div className="pt-2">
        <div className="flex h-1.5 overflow-hidden rounded-full bg-zinc-800">
          <div className="bg-[#31F387]" style={{ width: `${forPct}%` }} />
          <div className="bg-[#D0021B]" style={{ width: `${againstPct}%` }} />
        </div>
        <div className="mt-1 flex justify-between text-[10px]">
          <span className="text-[#31F387]">{forPct}% For</span>
          <span className="text-[#D0021B]">{againstPct}% Against</span>
        </div>
      </div>

      {/* Actions: Discuss + Tip proposer */}
      <div className="mt-auto flex items-center gap-3 border-t border-zinc-800/50 pt-2 mt-2 text-[10px] text-zinc-500">
        <a
          href={proposal.link}
          target="_blank"
          rel="noopener noreferrer"
          className="transition-colors hover:text-[#2F80ED]"
        >
          View Vote
        </a>
        {isConnected && proposerHash && <TipButton entityHash={proposerHash} />}
      </div>
    </div>
  );
}

// ============================================================================
// CANDIDATE TILE — amber-accented Nouns candidate card
// ============================================================================

function CandidateTile({ proposal }: { proposal: Proposal }) {
  const { isConnected } = useAccount();
  const sponsorCount = proposal.candidateSignatures || 0;
  const threshold = proposal.candidateThreshold || 0;
  const sponsorPct = threshold > 0 ? Math.min(100, Math.round((sponsorCount / threshold) * 100)) : 0;
  const isPromotable = proposal.candidateIsPromotable;
  const proposerHash = proposal.proposer ? computeEntityHash(proposal.proposer) : "";

  const candidateHref = proposal.candidateSlug
    ? `/proposals/candidate/${encodeURIComponent(proposal.candidateSlug)}`
    : `/proposals/${encodeURIComponent(proposal.id)}`;

  return (
    <div className="group flex flex-col rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 transition-colors hover:border-amber-500/40">
      {/* Header row */}
      <div className="mb-1.5 flex items-center gap-2">
        <img
          src={proposal.daoLogo}
          alt={proposal.dao}
          className="h-5 w-5 rounded-full"
          loading="lazy"
        />
        <span className="truncate text-xs font-medium text-zinc-400">
          {proposal.dao}
        </span>
        <span className="shrink-0 rounded bg-amber-500/20 px-1 py-px text-[9px] font-bold uppercase text-amber-400">
          Candidate
        </span>
        {isPromotable && (
          <span className="shrink-0 rounded-full bg-[#31F387]/10 px-1 py-px text-[9px] font-bold text-[#31F387]">
            Ready
          </span>
        )}
      </div>

      {/* Title */}
      <Link href={candidateHref}>
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-white transition-colors group-hover:text-amber-400">
          {proposal.title}
        </h3>
      </Link>

      {/* Sponsor progress bar */}
      <div className="pt-2">
        <div className="flex h-1.5 overflow-hidden rounded-full bg-zinc-800">
          <div
            className={`transition-all ${isPromotable ? "bg-[#31F387]" : "bg-amber-400"}`}
            style={{ width: `${sponsorPct}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[10px]">
          <span className="text-amber-400">
            {sponsorCount} / {threshold} sponsors
          </span>
          <span className="text-zinc-500">{sponsorPct}%</span>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-auto flex items-center gap-3 border-t border-amber-500/10 pt-2 mt-2 text-[10px] text-zinc-500">
        <Link href={candidateHref} className="transition-colors hover:text-amber-400">
          {isPromotable ? "Promote" : "Sponsor"}
        </Link>
        {isConnected && proposerHash && <TipButton entityHash={proposerHash} />}
      </div>
    </div>
  );
}

// ============================================================================
// PARLIAMENT TILE — UK Parliament division vote card
// ============================================================================

function ParliamentTile({ proposal }: { proposal: Proposal }) {
  const { forPct, againstPct } = getVotePercentage(
    proposal.votesFor,
    proposal.votesAgainst
  );
  const chamber = proposal.chamber || "Commons";
  const isCommons = chamber === "Commons";

  const divisionHref = proposal.divisionId
    ? `/proposals/division/${proposal.divisionId}?chamber=${chamber.toLowerCase()}`
    : `/proposals/${encodeURIComponent(proposal.id)}`;

  return (
    <div className="group flex flex-col rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 transition-colors hover:border-zinc-600">
      {/* Header row */}
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-sm" role="img" aria-label="UK">
          🇬🇧
        </span>
        <span className="truncate text-xs font-medium text-zinc-400">
          UK Parliament
        </span>
        <span
          className={`shrink-0 rounded px-1 py-px text-[9px] font-medium uppercase ${
            isCommons
              ? "bg-green-600/20 text-green-400"
              : "bg-red-600/20 text-red-400"
          }`}
        >
          {chamber}
        </span>
        <span className="ml-auto text-[10px] text-zinc-600">
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
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-white transition-colors group-hover:text-[#2F80ED]">
          {proposal.title}
        </h3>
      </Link>

      {/* Vote bar — Ayes vs Noes */}
      <div className="pt-2">
        <div className="flex h-1.5 overflow-hidden rounded-full bg-zinc-800">
          <div className="bg-[#31F387]" style={{ width: `${forPct}%` }} />
          <div className="bg-[#D0021B]" style={{ width: `${againstPct}%` }} />
        </div>
        <div className="mt-1 flex justify-between text-[10px]">
          <span className="text-[#31F387]">{proposal.votesFor} Ayes</span>
          <span className="text-[#D0021B]">{proposal.votesAgainst} Noes</span>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-auto flex items-center gap-3 border-t border-zinc-800/50 pt-2 mt-2 text-[10px] text-zinc-500">
        <Link href={divisionHref} className="transition-colors hover:text-[#2F80ED]">
          View Details
        </Link>
        <a
          href={proposal.link}
          target="_blank"
          rel="noopener noreferrer"
          className="transition-colors hover:text-[#2F80ED]"
        >
          Parliament ↗
        </a>
      </div>
    </div>
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
