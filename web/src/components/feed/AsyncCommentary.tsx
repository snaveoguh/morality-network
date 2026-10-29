import Link from "next/link";
import { fetchProtocolWideComments, type ProtocolComment } from "@/lib/live-comments";
import { getArchivedFeedItemByHash } from "@/lib/archive";
import { fetchFarcasterContent, type Cast } from "@/lib/farcaster";
import { timeAgo } from "@/lib/front";

// ============================================================================
// COMMENTARY — what our bot said about today's stories (onchain comments on
// Base) and the Farcaster conversation, one column beside the news.
//
// phone: order 6, after the news          ≥1024: left 4 cols beside the news
// ============================================================================

// pooter1's commenting wallet. Override with POOTER1_COMMENT_ADDRESSES
// (comma-separated) if the bot key is rotated.
const BOT_AUTHORS = new Set(
  (process.env.POOTER1_COMMENT_ADDRESSES ?? "0xc9F138aCAE59C5b832b5F71242EFe5b01cD316f6")
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean),
);

const SHOWN = 4;

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

const COLUMN = "order-6 flex flex-col pt-7 lg:order-[12] lg:col-span-4 lg:self-start lg:pr-2";

function Heading({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="pb-1 text-[15px] font-bold text-[var(--ink)]">
      {children}
    </Link>
  );
}

export function CommentarySkeleton() {
  return (
    <div className={COLUMN}>
      <span className="text-[15px] font-bold text-[var(--ink)]">pooter1 on the news ›</span>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex flex-col gap-2 border-b border-[var(--rule-light)] py-3.5">
          <div className="h-3 w-40 animate-pulse bg-[var(--rule-light)]" />
          <div className="h-4 w-full animate-pulse bg-[var(--rule-light)]" />
          <div className="h-4 w-4/5 animate-pulse bg-[var(--rule-light)]" />
        </div>
      ))}
    </div>
  );
}

async function botComments(): Promise<Array<{ comment: ProtocolComment; title: string | null }>> {
  const all = await withTimeout(fetchProtocolWideComments(30).catch(() => []), 5000, [] as ProtocolComment[]);
  const mine = all
    .filter((c) => BOT_AUTHORS.has(c.author.toLowerCase()) && c.parentId === BigInt(0))
    .sort((a, b) => Number(b.timestamp - a.timestamp))
    .slice(0, SHOWN);
  return Promise.all(
    mine.map(async (comment) => {
      const item = await withTimeout(getArchivedFeedItemByHash(comment.entityHash).catch(() => null), 1500, null);
      return { comment, title: item?.title ?? null };
    }),
  );
}

export async function AsyncCommentary() {
  const [comments, casts] = await Promise.all([
    botComments(),
    withTimeout(fetchFarcasterContent("pip").catch(() => []), 5000, [] as Cast[]),
  ]);

  if (comments.length === 0 && casts.length === 0) return null;

  return (
    <div className={COLUMN}>
      {comments.length > 0 && (
        <section aria-label="pooter1 on the news" className="flex flex-col">
          <Heading href="/discuss">pooter1 on the news ›</Heading>
          {comments.map(({ comment, title }) => (
            <Link
              key={comment.id.toString()}
              href={`/article/${comment.entityHash}`}
              className="group flex flex-col gap-1.5 border-b border-[var(--rule-light)] py-3.5"
            >
              <span className="text-xs text-[var(--ink-faint)]">
                {["pooter1, our bot", timeAgo(new Date(Number(comment.timestamp) * 1000).toISOString())]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <span className="line-clamp-4 text-[15px] leading-normal text-[var(--ink)]">{comment.content}</span>
              {title && (
                <span className="news-head line-clamp-2 text-[13px] leading-snug text-[var(--ink-light)] group-hover:underline group-hover:underline-offset-4">
                  On: {title}
                </span>
              )}
            </Link>
          ))}
        </section>
      )}

      {casts.length > 0 && (
        <section aria-label="Conversation" className={`flex flex-col ${comments.length > 0 ? "pt-7" : ""}`}>
          <Heading href="/discuss">Conversation ›</Heading>
          {casts.slice(0, SHOWN).map((c) => (
            <a
              key={c.hash}
              href={`https://warpcast.com/${c.author.username}/${c.hash.slice(0, 10)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col gap-1.5 border-b border-[var(--rule-light)] py-3.5"
            >
              <span className="text-xs text-[var(--ink-faint)]">
                {[`@${c.author.username}`, timeAgo(c.timestamp), c.replies ? `${c.replies} ${c.replies === 1 ? "reply" : "replies"}` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <span className="line-clamp-4 text-[15px] leading-normal text-[var(--ink)] group-hover:underline group-hover:decoration-[var(--ink-faint)] group-hover:underline-offset-4">
                {c.text}
              </span>
            </a>
          ))}
        </section>
      )}
    </div>
  );
}
