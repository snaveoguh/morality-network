"use client";

import { useMemo, useState } from "react";
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
  id: string;
  proposalNumber?: number;
  isActive: boolean;
};

type Filter = "all" | "nouns" | "lilnouns" | "snapshot";

const STATUS_COLORS: Record<string, string> = {
  Active: "text-[var(--ink)]",
  Pending: "text-[var(--ink-light)]",
  ObjectionPeriod: "text-[var(--ink-light)]",
  Updatable: "text-[var(--ink-light)]",
  Succeeded: "text-[var(--ink)]",
  Queued: "text-[var(--ink-light)]",
  Executed: "text-[var(--ink-faint)]",
  Defeated: "text-[var(--ink-faint)]",
  Canceled: "text-[var(--ink-faint)]",
  Expired: "text-[var(--ink-faint)]",
  Vetoed: "text-[var(--ink-faint)]",
  active: "text-[var(--ink)]",
  pending: "text-[var(--ink-light)]",
  closed: "text-[var(--ink-faint)]",
  succeeded: "text-[var(--ink)]",
  defeated: "text-[var(--ink-faint)]",
  executed: "text-[var(--ink-faint)]",
  queued: "text-[var(--ink-light)]",
};

function normalizeOnchain(p: NounsProposal): FeedItem {
  const isNouns = p.dao === "nouns";
  return {
    key: `${p.dao}-${p.id}`,
    type: p.dao,
    title: p.title,
    proposer: p.proposer,
    dao: isNouns ? "Nouns" : "Lil Nouns",
    daoLogo: isNouns ? "https://noun.pics/1" : "https://noun.pics/100",
    status: p.status,
    forVotes: p.forVotes,
    againstVotes: p.againstVotes,
    abstainVotes: p.abstainVotes,
    quorum: p.quorumVotes,
    id: `${p.dao}-${p.id}`,
    proposalNumber: p.id,
    isActive:
      p.status === "Active" ||
      p.status === "ObjectionPeriod" ||
      p.status === "Updatable",
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

    items.sort((a, b) => {
      if (a.isActive && !b.isActive) return -1;
      if (!a.isActive && b.isActive) return 1;
      return (b.proposalNumber ?? 0) - (a.proposalNumber ?? 0);
    });

    return items;
  }, [nounsProposals, lilNounsProposals, snapshotProposals]);

  const filtered = useMemo(
    () =>
      allItems.filter((item) => {
        if (filter !== "all" && item.type !== filter) return false;
        if (search) {
          const q = search.toLowerCase();
          if (
            !item.title.toLowerCase().includes(q) &&
            !item.dao.toLowerCase().includes(q) &&
            !item.proposer.toLowerCase().includes(q)
          ) {
            return false;
          }
        }
        return true;
      }),
    [allItems, filter, search]
  );

  const activeCount = allItems.filter((item) => item.isActive).length;
  const nounsCount = allItems.filter((item) => item.type === "nouns").length;
  const lilCount = allItems.filter((item) => item.type === "lilnouns").length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-wider">
        <span className="flex items-center gap-1.5 border border-[var(--rule-light)] px-3 py-1.5">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--ink)]" />
          <span className="font-bold text-[var(--ink)]">{activeCount} Active</span>
        </span>
        <span className="text-[var(--ink-faint)]">
          {allItems.length} Total · {nounsCount} Nouns · {lilCount} Lil Nouns
        </span>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-0 border-b border-[var(--rule-light)] pb-3 font-mono text-[10px] uppercase tracking-wider">
        {(
          [
            ["all", "All"],
            ["nouns", "Nouns"],
            ["lilnouns", "Lil Nouns"],
            ["snapshot", "DAOs"],
          ] as const
        ).map(([value, label], index) => (
          <span key={value} className="flex items-center">
            {index > 0 && <span className="mx-1.5 text-[var(--rule-light)]">|</span>}
            <button
              onClick={() => setFilter(value)}
              className={`transition-colors ${
                filter === value
                  ? "font-bold text-[var(--ink)] underline underline-offset-4 decoration-[var(--rule)]"
                  : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
              }`}
            >
              {label}
            </button>
          </span>
        ))}

        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="ml-auto border border-[var(--rule-light)] bg-[var(--paper)] px-3 py-1.5 font-mono text-[10px] text-[var(--ink)] placeholder-[var(--ink-faint)] outline-none transition-colors focus:border-[var(--rule)]"
        />
      </div>

      <div className="border-t-2 border-[var(--rule)]">
        {filtered.length === 0 ? (
          <div className="py-12 text-center font-body-serif text-sm italic text-[var(--ink-faint)]">
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
  const { forPct, againstPct } = getVotePercentage(item.forVotes, item.againstVotes);
  const colors = STATUS_COLORS[item.status] || "text-[var(--ink-faint)]";
  const href = `/proposals/${encodeURIComponent(item.id)}`;

  return (
    <Link href={href}>
      <div className="group flex items-center gap-4 border-b border-[var(--rule-light)] px-4 py-3 transition-colors hover:bg-[var(--paper-dark)]">
        <img
          src={item.daoLogo}
          alt={item.dao}
          className="newspaper-img h-7 w-7 shrink-0 rounded-full"
          style={{ imageRendering: "pixelated" }}
          loading="lazy"
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
            {item.proposalNumber != null && <span className="font-bold">#{item.proposalNumber}</span>}
            <span>{item.dao}</span>
            <span>·</span>
            <span>{shortenAddress(item.proposer, 3)}</span>
          </div>
          <h3 className="mt-0.5 truncate font-headline-serif text-sm font-semibold text-[var(--ink)] transition-colors group-hover:text-[var(--accent-red)]">
            {item.title}
          </h3>
        </div>

        <div className="hidden w-24 shrink-0 sm:block">
          <div className="flex h-1 overflow-hidden bg-[var(--paper-dark)]">
            <div className="bg-[var(--ink)]" style={{ width: `${forPct}%` }} />
            <div className="bg-[var(--rule-light)]" style={{ width: `${againstPct}%` }} />
          </div>
          <p className="mt-0.5 text-center font-mono text-[8px] text-[var(--ink-faint)]">
            {forPct}% / {againstPct}%
          </p>
        </div>

        <span className={`shrink-0 font-mono text-[9px] font-bold uppercase tracking-widest ${colors}`}>
          {item.status}
        </span>
      </div>
    </Link>
  );
}
