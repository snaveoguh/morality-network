import { NextResponse } from "next/server";
import { fetchProtocolWireActivity } from "@/lib/live-comments";

const CACHE_TTL_MS = 20_000;

type ProtocolWireApiActivity =
  | {
      kind: "comment";
      id: string;
      entityHash: `0x${string}`;
      author: `0x${string}`;
      content: string;
      parentId: string;
      score: string;
      tipTotal: string;
      timestamp: string;
    }
  | {
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

interface CachedProtocolWireEntry {
  expiresAt: number;
  payload: {
    activities: ProtocolWireApiActivity[];
    generatedAt: number;
  };
}

const protocolWireCache = new Map<number, CachedProtocolWireEntry>();

function parseLimit(rawLimit: string | null): number {
  const parsed = Number(rawLimit ?? "40");
  if (!Number.isFinite(parsed)) return 40;
  return Math.min(Math.max(Math.trunc(parsed), 1), 100);
}

function cacheControlHeader(ttlMs: number): string {
  const sMaxAge = Math.max(1, Math.floor(ttlMs / 1000));
  const staleWhileRevalidate = sMaxAge * 2;
  return `public, s-maxage=${sMaxAge}, stale-while-revalidate=${staleWhileRevalidate}`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams.get("limit"));
  const now = Date.now();

  const cached = protocolWireCache.get(limit);
  if (cached && cached.expiresAt > now) {
    return NextResponse.json(cached.payload, {
      headers: {
        "cache-control": cacheControlHeader(CACHE_TTL_MS),
        "x-cache": "HIT",
      },
    });
  }

  try {
    const activities = await fetchProtocolWireActivity(limit);

    const normalizedActivities: ProtocolWireApiActivity[] = activities.map((activity) => {
      if (activity.kind === "comment") {
        return {
          kind: "comment" as const,
          id: activity.id.toString(),
          entityHash: activity.entityHash,
          author: activity.author,
          content: activity.content,
          parentId: activity.parentId.toString(),
          score: activity.score.toString(),
          tipTotal: activity.tipTotal.toString(),
          timestamp: activity.timestamp.toString(),
        };
      }

      return {
        kind: "tip" as const,
        id: activity.id,
        timestamp: activity.timestamp.toString(),
        tipper: activity.tipper,
        recipient: activity.recipient,
        amount: activity.amount.toString(),
        tipType: activity.tipType,
        entityHash: activity.entityHash ?? null,
        commentId:
          activity.commentId !== undefined ? activity.commentId.toString() : null,
      };
    });

    const payload = {
      activities: normalizedActivities,
      generatedAt: now,
    };

    protocolWireCache.set(limit, {
      expiresAt: now + CACHE_TTL_MS,
      payload,
    });

    return NextResponse.json(
      payload,
      {
        headers: {
          "cache-control": cacheControlHeader(CACHE_TTL_MS),
          "x-cache": "MISS",
        },
      }
    );
  } catch (error) {
    console.error("[ProtocolWireAPI] failed:", error);

    const stale = protocolWireCache.get(limit);
    if (stale) {
      return NextResponse.json(stale.payload, {
        headers: {
          "cache-control": cacheControlHeader(CACHE_TTL_MS),
          "x-cache": "STALE",
        },
      });
    }

    return NextResponse.json(
      { activities: [], error: "Failed to fetch protocol activity" },
      { status: 500 }
    );
  }
}
