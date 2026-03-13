"use client";

import Link from "next/link";
import { isAddress } from "viem";
import { AddressDisplay } from "@/components/shared/AddressDisplay";
import { computeEntityHash } from "@/lib/entity";
import type { GovernanceSocialSignal } from "@/lib/governance";

interface GovernanceSocialListProps {
  signals: GovernanceSocialSignal[];
}

function formatRelativeTime(timestamp: number): string {
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - timestamp);

  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d ago`;

  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function GovernanceSocialList({ signals }: GovernanceSocialListProps) {
  const items = signals.slice(0, 8);

  if (items.length === 0) return null;

  return (
    <section className="mb-8 border-b-2 border-[var(--rule)] pb-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-headline text-2xl text-[var(--ink)]">
            Farcaster Wire
          </h2>
          <p className="mt-1 max-w-3xl font-body-serif text-sm text-[var(--ink-faint)]">
            Social signal, not a proposal. These are casts mentioning Nouns governance,
            delegation, or voting activity.
          </p>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
          {signals.length} tracked casts
        </span>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {items.map((signal) => {
          const primaryAddress = signal.author.verifiedAddresses.find((value) =>
            isAddress(value)
          );
          const entityHash = primaryAddress ? computeEntityHash(primaryAddress) : null;

          return (
            <article
              key={signal.id}
              className="rounded-none border border-[var(--rule-light)] bg-[var(--paper)] p-4"
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  {signal.author.pfpUrl ? (
                    <img
                      src={signal.author.pfpUrl}
                      alt=""
                      className="h-10 w-10 rounded-full border border-[var(--rule-light)] object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full border border-[var(--rule-light)] bg-[var(--paper-dark)]" />
                  )}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <a
                        href={signal.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--ink)] transition-colors hover:text-[var(--accent-red)]"
                      >
                        @{signal.author.username}
                      </a>
                      <span className="truncate font-body-serif text-sm text-[var(--ink-light)]">
                        {signal.author.displayName}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--ink-faint)]">
                      <span>{formatRelativeTime(signal.timestamp)}</span>
                      {signal.channel && (
                        <>
                          <span>&middot;</span>
                          <span>/{signal.channel}</span>
                        </>
                      )}
                      {signal.relatedDao && (
                        <>
                          <span>&middot;</span>
                          <span>{signal.relatedDao}</span>
                        </>
                      )}
                    </div>
                    {primaryAddress && (
                      <div className="mt-2">
                        {entityHash ? (
                          <Link href={`/entity/${entityHash}`}>
                            <AddressDisplay
                              address={primaryAddress}
                              className="text-[11px] text-[var(--ink-light)] hover:text-[var(--ink)]"
                            />
                          </Link>
                        ) : (
                          <AddressDisplay
                            address={primaryAddress}
                            className="text-[11px] text-[var(--ink-light)]"
                          />
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <a
                  href={signal.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
                >
                  Warpcast
                </a>
              </div>

              <p className="font-body-serif text-[15px] leading-relaxed text-[var(--ink)]">
                {signal.text}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-[var(--rule-light)] pt-2 font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--ink-faint)]">
                <span>{signal.engagement.likes} likes</span>
                <span>{signal.engagement.recasts} recasts</span>
                <span>{signal.engagement.replies} replies</span>
                {signal.tags.slice(0, 3).map((tag) => (
                  <span key={tag}>#{tag}</span>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
