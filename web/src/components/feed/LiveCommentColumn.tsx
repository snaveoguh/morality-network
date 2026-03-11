"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatEth, shortenAddress, timeAgo } from "@/lib/entity";

const POLL_MS = 25_000;
const FEED_LIMIT = 40;

type WireCommentActivity = {
  kind: "comment";
  id: string;
  entityHash: `0x${string}`;
  author: `0x${string}`;
  content: string;
  parentId: string;
  score: string;
  tipTotal: string;
  timestamp: string;
};

type WireTipActivity = {
  kind: "tip";
  id: string;
  timestamp: string;
  tipper: `0x${string}`;
  recipient: `0x${string}`;
  amount: string;
  tipType: "entity" | "comment";
  entityHash: `0x${string}` | null;
  commentId: string | null;
};

type WireActivity = WireCommentActivity | WireTipActivity;

type ProtocolWireResponse = {
  activities?: WireActivity[];
};

interface WireEntityMeta {
  category: string;
  bias?: string;
  tags?: string[];
}

interface LiveCommentColumnProps {
  categoryFilter?: string;
  biasFilter?: string;
  tagFilter?: string;
  entityMetaByHash?: Record<string, WireEntityMeta>;
}

export function LiveCommentColumn({
  categoryFilter = "all",
  biasFilter = "all",
  tagFilter = "all",
  entityMetaByHash = {},
}: LiveCommentColumnProps) {
  const [activities, setActivities] = useState<WireActivity[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;

    async function refresh() {
      if (cancelled || inFlight) return;
      if (document.visibilityState !== "visible") return;

      inFlight = true;
      try {
        const response = await fetch(`/api/protocol-wire?limit=${FEED_LIMIT}`, {
          cache: "no-store",
        });
        if (!response.ok) return;
        const json = (await response.json()) as ProtocolWireResponse;
        if (!cancelled && Array.isArray(json.activities)) {
          setActivities((prev) =>
            areActivityListsEqual(prev, json.activities!) ? prev : json.activities!
          );
          setLoaded(true);
        }
      } catch {
        // Network hiccups are expected; keep current rail state.
      } finally {
        inFlight = false;
      }
    }

    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, POLL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const hasActiveFilters =
    categoryFilter !== "all" || biasFilter !== "all" || tagFilter !== "all";

  const items = useMemo(
    () =>
      activities.filter((activity) =>
        matchesActivityFilters(
          activity,
          categoryFilter,
          biasFilter,
          tagFilter,
          entityMetaByHash
        )
      ),
    [activities, categoryFilter, biasFilter, tagFilter, entityMetaByHash]
  );
  const hasActivity = items.length > 0;

  return (
    <div className="sticky top-16 overflow-hidden">
      <div className="mb-3 border-b-2 border-[var(--rule)] pb-2">
        <h2 className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
          Protocol Wire
        </h2>
        <p className="mt-0.5 font-mono text-[9px] text-[var(--ink-faint)]">
          Live onchain comments + tips
        </p>
      </div>

      <div className="max-h-[calc(100vh-170px)] space-y-0 overflow-y-auto pr-1">
        {items.map((activity) =>
          activity.kind === "comment" ? (
            <CommentActivityCard
              key={`comment-${activity.id}`}
              comment={activity}
            />
          ) : (
            <TipActivityCard key={activity.id} tip={activity} />
          )
        )}

        {!hasActivity && loaded && (
          <p className="py-6 text-center font-body-serif text-sm italic text-[var(--ink-faint)]">
            {hasActiveFilters
              ? "No protocol activity for current filters."
              : "No protocol activity yet."}
          </p>
        )}

        {!hasActivity && !loaded && (
          <p className="py-6 text-center font-body-serif text-sm italic text-[var(--ink-faint)]">
            Loading protocol wire…
          </p>
        )}
      </div>
    </div>
  );
}

function CommentActivityCard({ comment }: { comment: WireCommentActivity }) {
  const timestamp = Number(comment.timestamp);
  const parentId = BigInt(comment.parentId);
  const score = BigInt(comment.score);
  const tipTotal = BigInt(comment.tipTotal);

  return (
    <article className="border-t border-[var(--rule-light)] py-2.5 transition-colors hover:bg-[var(--paper-dark)]">
      <div className="mb-1 flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
        <span>#{comment.id}</span>
        {parentId > BigInt(0) && <span>reply</span>}
        <span className="ml-auto">{timeAgo(timestamp)}</span>
      </div>

      <p className="line-clamp-4 font-body-serif text-xs leading-snug text-[var(--ink)]">
        {comment.content}
      </p>

      <div className="mt-1.5 flex items-center justify-between font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
        <span>{shortenAddress(comment.author)}</span>
        <span
          className={
            score > BigInt(0)
              ? "font-bold text-[var(--ink)]"
              : score < BigInt(0)
                ? "font-bold text-[var(--accent-red)]"
                : ""
          }
        >
          score {score.toString()}
        </span>
      </div>

      {tipTotal > BigInt(0) && (
        <div className="mt-1 font-mono text-[8px] uppercase tracking-wider text-[var(--ink)]">
          tipped {formatEth(tipTotal)}
        </div>
      )}

      <Link
        href={`/entity/${comment.entityHash}`}
        className="mt-1 block truncate font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
      >
        Entity {shortenAddress(comment.entityHash, 6)}
      </Link>
    </article>
  );
}

function TipActivityCard({ tip }: { tip: WireTipActivity }) {
  const timestamp = Number(tip.timestamp);
  const amount = BigInt(tip.amount);

  return (
    <article className="border-t border-[var(--rule-light)] bg-[var(--paper-dark)] py-2.5 transition-colors hover:bg-[#e6decf]">
      <div className="mb-1 flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
        <span className="font-bold text-[var(--ink)]">Tip</span>
        {tip.tipType === "comment" && tip.commentId && <span>#{tip.commentId}</span>}
        <span className="ml-auto">{timeAgo(timestamp)}</span>
      </div>

      <p className="font-body-serif text-xs leading-snug text-[var(--ink)]">
        <span className="font-mono">{shortenAddress(tip.tipper)}</span> tipped{" "}
        <span className="font-bold">{formatEth(amount)}</span>
      </p>

      <div className="mt-1.5 flex items-center justify-between font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
        <span>to {shortenAddress(tip.recipient)}</span>
        <span>{tip.tipType === "comment" ? "comment" : "entity"}</span>
      </div>

      {tip.entityHash && (
        <Link
          href={`/entity/${tip.entityHash}`}
          className="mt-1 block truncate font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
        >
          Entity {shortenAddress(tip.entityHash, 6)}
        </Link>
      )}
    </article>
  );
}

function areActivityListsEqual(current: WireActivity[], next: WireActivity[]): boolean {
  if (current.length !== next.length) return false;
  for (let i = 0; i < current.length; i++) {
    if (activityIdentity(current[i]) !== activityIdentity(next[i])) {
      return false;
    }
  }
  return true;
}

function activityIdentity(activity: WireActivity): string {
  if (activity.kind === "comment") {
    return `comment:${activity.id}:${activity.timestamp}:${activity.score}:${activity.tipTotal}`;
  }
  return `tip:${activity.id}:${activity.timestamp}:${activity.amount}`;
}

function matchesActivityFilters(
  activity: WireActivity,
  categoryFilter: string,
  biasFilter: string,
  tagFilter: string,
  entityMetaByHash: Record<string, WireEntityMeta>
): boolean {
  if (categoryFilter === "all" && biasFilter === "all" && tagFilter === "all") {
    return true;
  }

  const entityHash = activity.entityHash;
  if (!entityHash) return false;

  const meta = entityMetaByHash[entityHash.toLowerCase()];
  if (!meta) return false;

  if (categoryFilter !== "all" && meta.category !== categoryFilter) {
    return false;
  }

  if (biasFilter !== "all") {
    const bias = meta.bias;
    if (!bias) return false;
    if (biasFilter === "left") {
      if (bias !== "left" && bias !== "far-left") return false;
    } else if (biasFilter === "right") {
      if (bias !== "right" && bias !== "far-right") return false;
    } else if (bias !== biasFilter) {
      return false;
    }
  }

  if (tagFilter !== "all") {
    const tags = meta.tags ?? [];
    if (!tags.includes(tagFilter)) return false;
  }

  return true;
}
