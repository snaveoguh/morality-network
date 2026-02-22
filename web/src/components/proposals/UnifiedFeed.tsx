"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { Proposal } from "@/lib/governance";
import type { NounsProposal } from "@/lib/nouns";
import { getVotePercentage } from "@/lib/governance";
import { shortenAddress } from "@/lib/entity";

interface UnifiedFeedProps {
  snapshotProposals: Proposal[];
  nounsProposals: NounsProposal[];
  lilNounsProposals: NounsProposal[];
}

type FeedItem = {
  key: string;
  type: "nouns" | "lilnouns" | "snapshot";
  title: string;
  proposer: string;
  dao: string;
  daoLogo: string;
  status: string;
  forVotes: number;
  againstVotes: number;
  abstainVotes: number;
  quorum?: number;
  id: string; // for linking
  proposalNumber?: number;
  isActive: boolean;
};

function normalizeOnchain(p: NounsProposal): FeedItem {
  const isNouns = p.dao === "nouns";
  return {
    key: `${p.dao}-${p.id}`,
    type: p.dao,
    title: p.title,
    proposer: p.proposer,
    dao: isNouns ? "Nouns" : "Lil Nouns",
    daoLogo: isNouns
      ? "https://noun.pics/1"
      : "https://noun.pics/100",
    status: p.status,
    forVotes: p.forVotes,
    againstVotes: p.againstVotes,
    abstainVotes: p.abstainVotes,
    quorum: p.quorumVotes,
    id: `${p.dao}-${p.id}`,
    proposalNumber: p.id,
    isActive: p.status === "Active" || p.status === "ObjectionPeriod" || p.status === "Updatable",
  };
}

function normalizeSnapshot(p: Proposal): FeedItem {
  return {
    key: `snap-${p.id}`,
    type: "snapshot",
    title: p.title,
    proposer: p.proposer,
    dao: p.dao,
    daoLogo: p.daoLogo,
    status: p.status,
    forVotes: p.votesFor,
    againstVotes: p.votesAgainst,
    abstainVotes: p.votesAbstain,
    quorum: p.quorum,
    id: p.id,
    isActive: p.status === "active" || p.status === "pending",
  };
}

type Filter = "all" | "nouns" | "lilnouns" | "snapshot";

const STATUS_COLORS: Record<string, string> = {
  Active: "bg-[#31F387]/10 text-[#31F387]",
  Pending: "bg-yellow-400/10 text-yellow-400",
  ObjectionPeriod: "bg-orange-400/10 text-orange-400",
  Updatable: "bg-purple-400/10 text-purple-400",
  Succeeded: "bg-[#2F80ED]/10 text-[#2F80ED]",
  Queued: "bg-purple-400/10 text-purple-400",
  Executed: "bg-zinc-700/50 text-zinc-400",
  Defeated: "bg-[#D0021B]/10 text-[#D0021B]",
  Canceled: "bg-zinc-700/50 text-zinc-500",
  Expired: "bg-zinc-700/50 text-zinc-500",
  Vetoed: "bg-[#D0021B]/10 text-[#D0021B]",
  // snapshot statuses (lowercase)
  active: "bg-[#31F387]/10 text-[#31F387]",
  pending: "bg-yellow-400/10 text-yellow-400",
  closed: "bg-zinc-700/50 text-zinc-500",
  succeeded: "bg-[#2F80ED]/10 text-[#2F80ED]",
  defeated: "bg-[#D0021B]/10 text-[#D0021B]",
  executed: "bg-zinc-700/50 text-zinc-400",
  queued: "bg-purple-400/10 text-purple-400",
};

export function UnifiedFeed({
  snapshotProposals,
  nounsProposals,
  lilNounsProposals,
}: UnifiedFeedProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  const allItems = useMemo(() => {
    const items: FeedItem[] = [
      ...nounsProposals.map(normalizeOnchain),
      ...lilNounsProposals.map(normalizeOnchain),
      ...snapshotProposals.map(normalizeSnapshot),
    ];

    // Sort: active first, then by proposal number (newest first)
    items.sort((a, b) => {
      if (a.isActive && !b.isActive) return -1;
      if (!a.isActive && b.isActive) return 1;
      return (b.proposalNumber ?? 0) - (a.proposalNumber ?? 0);
    });

    return items;
  }, [nounsProposals, lilNounsProposals, snapshotProposals]);

  const filtered = useMemo(() => {
    return allItems.filter((item) => {
      if (filter !== "all" && item.type !== filter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !item.title.toLowerCase().includes(q) &&
          !item.dao.toLowerCase().includes(q) &&
          !item.proposer.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [allItems, filter, search]);

  const activeCount = allItems.filter((i) => i.isActive).length;
  const nounsCount = allItems.filter((i) => i.type === "nouns").length;
  const lilCount = allItems.filter((i) => i.type === "lilnouns").length;

  return (
    <div>
      {/* Stats */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {activeCount > 0 && (
          <div className="flex items-center gap-1.5 rounded-full bg-[#31F387]/10 px-3 py-1.5">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#31F387]" />
            <span className="text-xs font-medium text-[#31F387]">
              {activeCount} Active
            </span>
          </div>
        )}
        <span className="text-xs text-zinc-500">
          {allItems.length} proposals &middot; {nounsCount} Nouns &middot;{" "}
          {lilCount} Lil Nouns
        </span>
      </div>

      {/* Filters */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex gap-1 rounded-lg bg-zinc-900/50 p-1">
          {(
            [
              ["all", "All"],
              ["nouns", "⌐◨-◨ Nouns"],
              ["lilnouns", "Lil Nouns"],
              ["snapshot", "DAOs"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === value
                  ? "bg-zinc-700 text-white"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ml-auto rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-white placeholder-zinc-600 outline-none focus:border-zinc-600"
        />
      </div>

      {/* Feed items */}
      <div className="space-y-1">
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-zinc-500">
            No proposals found.
          </div>
        ) : (
          filtered.map((item) => <FeedRow key={item.key} item={item} />)
        )}
      </div>
    </div>
  );
}

function FeedRow({ item }: { item: FeedItem }) {
  const { forPct, againstPct } = getVotePercentage(
    item.forVotes,
    item.againstVotes
  );
  const colors = STATUS_COLORS[item.status] || "bg-zinc-700/50 text-zinc-500";

  const href =
    item.type === "snapshot"
      ? `/proposals/${encodeURIComponent(item.id)}`
      : `/proposals/${encodeURIComponent(item.id)}`;

  return (
    <Link href={href}>
      <div className="group flex items-center gap-3 rounded-lg border border-transparent px-3 py-3 transition-all hover:border-zinc-800 hover:bg-zinc-900/60">
        {/* DAO icon */}
        <img
          src={item.daoLogo}
          alt={item.dao}
          className="h-7 w-7 shrink-0 rounded-full"
          style={{ imageRendering: "pixelated" }}
          loading="lazy"
        />

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {item.proposalNumber != null && (
              <span className="text-[10px] font-bold text-zinc-600">
                {item.proposalNumber}
              </span>
            )}
            <h3 className="truncate text-sm text-zinc-200 transition-colors group-hover:text-white">
              {item.title}
            </h3>
          </div>
          <p className="mt-0.5 text-[10px] text-zinc-600">
            {item.dao} &middot; {shortenAddress(item.proposer, 3)}
          </p>
        </div>

        {/* Vote bar */}
        <div className="hidden w-20 shrink-0 sm:block">
          <div className="flex h-1 overflow-hidden rounded-full bg-zinc-800">
            <div className="bg-[#31F387]" style={{ width: `${forPct}%` }} />
            <div className="bg-[#D0021B]" style={{ width: `${againstPct}%` }} />
          </div>
        </div>

        {/* Status */}
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${colors}`}
        >
          {item.status}
        </span>
      </div>
    </Link>
  );
}
