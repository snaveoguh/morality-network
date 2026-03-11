import { fetchProtocolWireActivity } from "@/lib/live-comments";
import type { ProtocolActivity } from "@/lib/live-comments";
import Link from "next/link";

export async function RoomList() {
  let activity: ProtocolActivity[] = [];
  try {
    activity = await fetchProtocolWireActivity(50);
  } catch {
    // Empty
  }

  // Group by entityHash
  const roomMap = new Map<
    string,
    {
      entityHash: string;
      commentCount: number;
      lastTimestamp: bigint;
      lastAuthor: string;
    }
  >();

  for (const item of activity) {
    if (item.kind !== "comment") continue;
    const hash = item.entityHash;
    const existing = roomMap.get(hash);
    if (existing) {
      existing.commentCount++;
      if (item.timestamp > existing.lastTimestamp) {
        existing.lastTimestamp = item.timestamp;
        existing.lastAuthor = item.author;
      }
    } else {
      roomMap.set(hash, {
        entityHash: hash,
        commentCount: 1,
        lastTimestamp: item.timestamp,
        lastAuthor: item.author,
      });
    }
  }

  const rooms = Array.from(roomMap.values()).sort((a, b) =>
    a.lastTimestamp > b.lastTimestamp ? -1 : 1
  );

  if (rooms.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="font-body-serif text-sm italic text-[var(--ink-faint)]">
          No active discussion rooms yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rooms.map((room) => {
        const timeAgoStr = (() => {
          const now = Math.floor(Date.now() / 1000);
          const diff = now - Number(room.lastTimestamp);
          if (diff < 60) return "just now";
          if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
          if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
          return `${Math.floor(diff / 86400)}d ago`;
        })();

        return (
          <Link
            key={room.entityHash}
            href={`/discuss/${room.entityHash}`}
            className="block border border-[var(--rule-light)] p-3 transition-colors hover:border-[var(--rule)]"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
                <span className="font-mono text-[11px] font-bold text-[var(--ink)]">
                  {room.entityHash.slice(0, 10)}...{room.entityHash.slice(-6)}
                </span>
              </div>
              <span className="font-mono text-[8px] text-[var(--ink-faint)]">
                {timeAgoStr}
              </span>
            </div>
            <div className="mt-1 font-mono text-[9px] text-[var(--ink-faint)]">
              {room.commentCount} message
              {room.commentCount !== 1 ? "s" : ""} &bull; Last:{" "}
              {room.lastAuthor.slice(0, 6)}...{room.lastAuthor.slice(-4)}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
