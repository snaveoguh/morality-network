// Helpers shared by the direction C front page and the Search page.
// Pure functions only — safe on the server and in client components.

import type { BiasRating } from "./bias";

/** Rated bias in plain words (pooter-brand: no red/blue colour coding). */
const BIAS_WORDS: Record<BiasRating, string> = {
  "far-left": "Far left",
  left: "Left",
  "lean-left": "Lean left",
  center: "Centre",
  "lean-right": "Lean right",
  right: "Right",
  "far-right": "Far right",
};

export function biasWords(bias: BiasRating | null | undefined): string | null {
  return bias ? BIAS_WORDS[bias] : null;
}

/** Three-way bucket for the feed-mix chart. */
export function biasBucket(bias: BiasRating): "Left" | "Centre" | "Right" {
  if (bias === "far-left" || bias === "left" || bias === "lean-left") return "Left";
  if (bias === "far-right" || bias === "right" || bias === "lean-right") return "Right";
  return "Centre";
}

/** "41 min ago", "3 hours ago", "2 days ago", else "21 Oct". */
export function timeAgo(dateStr: string | undefined, now: number = Date.now()): string | null {
  if (!dateStr) return null;
  const ts = new Date(dateStr).getTime();
  if (!Number.isFinite(ts)) return null;
  const mins = Math.max(0, Math.round((now - ts) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return days === 1 ? "1 day ago" : `${days} days ago`;
  return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Display form of an auto-tag: "war" → "War", "ai" → "AI". */
export function tagLabel(tag: string): string {
  const upper = new Set(["ai", "uk", "us", "eu", "un", "nato", "sec", "defi", "nft"]);
  if (upper.has(tag.toLowerCase())) return tag.toUpperCase();
  return tag.charAt(0).toUpperCase() + tag.slice(1).replace(/[-_]/g, " ");
}

/** Most frequent tags across items, highest count first. */
export function topTags(items: Array<{ tags?: string[] }>, limit: number): string[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const tag of item.tags ?? []) {
      const key = tag.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag]) => tag);
}
