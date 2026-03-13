"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useAccount } from "wagmi";
import type { ArticleContent } from "@/lib/article";
import { BiasPill } from "@/components/feed/BiasBar";
import { TipButton } from "@/components/entity/TipButton";
import { RatingWidget } from "@/components/entity/RatingWidget";
import { CommentThread } from "@/components/entity/CommentThread";
import { computeEntityHash } from "@/lib/entity";
import type { FeedItem } from "@/lib/rss";
import type { EntityMention } from "@/lib/types/entities";
import { EntityPopover } from "./EntityPopover";
import { ArchiveStatus } from "./ArchiveStatus";
import { MarketImpactSection } from "./MarketImpactSection";
import { YouTubeEmbed } from "./YouTubeEmbed";
import { SpotifyEmbed } from "./SpotifyEmbed";
import { PodcastEmbed } from "./PodcastEmbed";
import { ParallelWorldFooter } from "./ParallelWorldFooter";
import { MintEditionButton } from "./MintEditionButton";
import { buildFundingGraph } from "@/lib/funding-tree";

const FundingTree = dynamic(
  () => import("./FundingTree").then((m) => ({ default: m.FundingTree })),
  { ssr: false },
);

interface ArchivedRelatedItem extends FeedItem {
  hash: string;
}

interface ArchiveStatusData {
  generatedBy: "claude-ai" | "template-fallback";
  generatedAt: string;
  contentHash: string;
  onchainTxHash?: string;
}

interface ArticleTemplateProps {
  article: ArticleContent;
  dateline: string;
  readTime: number;
  entityHash: string;
  entities?: EntityMention[];
  archivedRelated?: ArchivedRelatedItem[];
  archiveStatus?: ArchiveStatusData;
  editionNumber?: number;
}

function renderParagraphWithEntities(
  paragraph: string,
  paragraphIndex: number,
  entities: EntityMention[],
): React.ReactNode {
  // Find all occurrences in this paragraph, sorted by startChar
  const occurrences: Array<{ entity: EntityMention; start: number; end: number }> = [];
  for (const entity of entities) {
    for (const occ of entity.occurrences) {
      if (occ.paragraphIndex === paragraphIndex) {
        occurrences.push({ entity, start: occ.startChar, end: occ.endChar });
      }
    }
  }

  if (occurrences.length === 0) return paragraph;

  // Sort by position and remove overlaps
  occurrences.sort((a, b) => a.start - b.start);
  const deduped: typeof occurrences = [];
  let lastEnd = -1;
  for (const occ of occurrences) {
    if (occ.start >= lastEnd) {
      deduped.push(occ);
      lastEnd = occ.end;
    }
  }

  // Build fragments
  const fragments: React.ReactNode[] = [];
  let cursor = 0;
  for (let i = 0; i < deduped.length; i++) {
    const { entity, start, end } = deduped[i];
    // Text before this entity
    if (start > cursor) {
      fragments.push(paragraph.slice(cursor, start));
    }
    // Entity with popover
    fragments.push(
      <EntityPopover key={`${paragraphIndex}-${i}`} entity={entity}>
        {paragraph.slice(start, end)}
      </EntityPopover>,
    );
    cursor = end;
  }
  // Remaining text
  if (cursor < paragraph.length) {
    fragments.push(paragraph.slice(cursor));
  }

  return <>{fragments}</>;
}

export function ArticleTemplate({
  article,
  dateline,
  readTime,
  entityHash,
  entities,
  archivedRelated = [],
  archiveStatus,
  editionNumber,
}: ArticleTemplateProps) {
  const { isConnected } = useAccount();

  // Broadcast context to extension when on pooter.world
  useEffect(() => {
    window.postMessage({
      type: 'POOTER_SITE_CONTEXT',
      payload: {
        entityHash,
        articleHash: entityHash,
        title: article.primary.title,
        identifier: article.primary.link,
        source: article.primary.source,
        category: article.primary.category,
      },
    }, '*');
  }, [entityHash, article.primary.title, article.primary.link, article.primary.source, article.primary.category]);

  const {
    primary,
    claim,
    relatedSources,
    subheadline,
    subheadlineEnglish,
    editorialBody,
    editorialBodyEnglish,
    wireSummary,
    biasContext,
    tags,
    contextSnippets,
    agentResearch,
    missingContext,
    historicalParallel,
    stakeholderAnalysis,
    marketImpact,
    podcastEpisode,
    musicPick,
    newsVideos,
    isDailyEdition,
  } =
    article;

  // Build funding graph from article sources
  const fundingGraph = useMemo(
    () => buildFundingGraph(primary, relatedSources),
    [primary, relatedSources],
  );

  return (
    <div className="mx-auto max-w-3xl">
      {/* ══════════════ BACK NAV ══════════════ */}
      <div className="mb-6 flex items-center gap-3 border-b border-[var(--rule-light)] pb-3 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
        <Link
          href="/"
          className="transition-colors hover:text-[var(--ink)]"
        >
          &larr; Back to Front Page
        </Link>
        <span className="mx-1 text-[var(--rule-light)]">|</span>
        <span>{primary.category}</span>
        <span className="mx-1 text-[var(--rule-light)]">|</span>
        <Link
          href="/archive"
          className="transition-colors hover:text-[var(--ink)]"
        >
          Archive
        </Link>
        <span className="ml-auto">{readTime} min read</span>
      </div>

      {/* ══════════════ ARTICLE HEADER ══════════════ */}
      <header className="mb-8">
        {/* Category + Source + Bias */}
        <div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
          <span className="font-bold text-[var(--accent-red)]">{primary.category}</span>
          <span>&middot;</span>
          <span>{primary.source}</span>
          {primary.bias && <BiasPill bias={primary.bias} />}
        </div>

        {/* Headline — Playfair Display, massive */}
        <h1 className="font-headline text-3xl leading-[1.1] text-[var(--ink)] sm:text-4xl lg:text-5xl">
          {primary.title}
        </h1>

        {/* Subheadline — editorial, italic */}
        <p className="mt-3 font-body-serif text-base italic leading-relaxed text-[var(--ink-light)] sm:text-lg">
          {subheadline}
        </p>
        {subheadlineEnglish &&
          subheadlineEnglish.trim() !== subheadline.trim() && (
            <p className="mt-1 font-body-serif text-sm leading-relaxed text-[var(--ink-faint)] sm:text-base">
              {subheadlineEnglish}
            </p>
          )}

        <aside className="mt-5 border-l-2 border-[var(--rule)] pl-4">
          <p className="mb-1 font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--ink-faint)]">
            Canonical Claim
          </p>
          <p className="font-body-serif text-base leading-relaxed text-[var(--ink)]">
            {claim}
          </p>
        </aside>

        {/* Dateline — monospace ruled */}
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-b border-[var(--rule-light)] py-2 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
          <span>{dateline}</span>
          <span>&middot;</span>
          <span>Source: {primary.source}</span>
          {primary.bias?.country && (
            <>
              <span>&middot;</span>
              <span>{primary.bias.country}</span>
            </>
          )}
          {primary.bias?.fundingModel && (
            <>
              <span>&middot;</span>
              <span className="capitalize">{primary.bias.fundingModel}</span>
            </>
          )}
        </div>
      </header>

      {/* ══════════════ HERO IMAGE ══════════════ */}
      {primary.imageUrl && (
        <figure className="mb-8">
          <div className="newspaper-img-hero overflow-hidden border border-[var(--rule-light)]">
            <img
              src={primary.imageUrl}
              alt={primary.title}
              className="newspaper-img w-full"
            />
          </div>
          <figcaption className="mt-1.5 font-mono text-[9px] italic text-[var(--ink-faint)]">
            Image via {primary.source}
          </figcaption>
        </figure>
      )}

      {podcastEpisode && <PodcastEmbed episode={podcastEpisode} sourceName={primary.source} />}

      {/* ══════════════ AGENT SWARM ATTRIBUTION ══════════════ */}
      <div className="mb-4 flex items-center gap-2 border-b border-[var(--rule-light)] pb-3">
        <span className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--ink-faint)]">
          Created &amp; moderated by the Morality Agent Swarm
        </span>
        {archiveStatus?.generatedBy === "claude-ai" && (
          <span className="border border-[var(--ink)] px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-[var(--ink)]">
            AI Editorial
          </span>
        )}
      </div>

      {/* ══════════════ ARTICLE BODY ══════════════ */}
      <article className="mb-8">
        {editorialBody.map((paragraph, i) => (
          <div key={i} className={`mb-5 ${i === 0 ? "mb-6" : ""}`}>
            <p
              className={`font-body-serif leading-[1.85] text-[var(--ink-light)] ${
                i === 0
                  ? "drop-cap text-[1.125rem] leading-[1.9] text-[var(--ink)]"
                  : "text-base"
              }`}
            >
              {renderParagraphWithEntities(paragraph, i, entities || [])}
            </p>
            {editorialBodyEnglish?.[i] &&
              editorialBodyEnglish[i].trim() !== paragraph.trim() && (
                <p className="mt-1 font-body-serif text-sm leading-relaxed text-[var(--ink-faint)]">
                  {editorialBodyEnglish[i]}
                </p>
              )}
          </div>
        ))}
      </article>

      {/* ══════════════ DAILY EDITION: MUSIC PICK ══════════════ */}
      {isDailyEdition && musicPick && (
        <section className="mb-8 border-t border-[var(--rule-light)] pt-6">
          <h2 className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--ink)]">
            Today&rsquo;s Pick
          </h2>
          {musicPick.spotifyId ? (
            <SpotifyEmbed
              trackId={musicPick.spotifyId}
              title={`${musicPick.artist} — ${musicPick.title}`}
              caption={musicPick.commentary || undefined}
            />
          ) : musicPick.videoId ? (
            <YouTubeEmbed
              videoId={musicPick.videoId}
              title={`${musicPick.artist} — ${musicPick.title}`}
              caption={musicPick.commentary || undefined}
            />
          ) : (
            <p className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
              {musicPick.artist} &mdash; {musicPick.title}
            </p>
          )}
        </section>
      )}

      {/* ══════════════ DAILY EDITION: NEWS VIDEOS ══════════════ */}
      {isDailyEdition && newsVideos && newsVideos.length > 0 && (
        <section className="mb-8 border-t border-[var(--rule-light)] pt-6">
          <h2 className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--ink)]">
            Today&rsquo;s Video Picks
          </h2>
          <div className="space-y-4">
            {newsVideos.map((video) => (
              <YouTubeEmbed
                key={video.videoId}
                videoId={video.videoId}
                title={video.title}
                caption={video.channel}
              />
            ))}
          </div>
        </section>
      )}

      {/* ══════════════ MARKET IMPACT ══════════════ */}
      {marketImpact && marketImpact.affectedMarkets.length > 0 && (
        <MarketImpactSection impact={marketImpact} />
      )}

      {/* ══════════════ DEEP CONTEXT — what's missing from the coverage ══════════════ */}
      {(missingContext || historicalParallel || stakeholderAnalysis) && (
        <section className="mb-8 border-t-2 border-[var(--rule)] pt-4">
          <h2 className="mb-4 font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-[var(--ink)]">
            Deeper Context
          </h2>

          {missingContext && (
            <div className="mb-4 border-l-2 border-[var(--accent-red)] pl-4">
              <p className="mb-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--accent-red)]">
                What&rsquo;s Missing
              </p>
              <p className="font-body-serif text-sm leading-[1.8] text-[var(--ink-light)]">
                {missingContext}
              </p>
            </div>
          )}

          {historicalParallel && (
            <div className="mb-4 border-l-2 border-[var(--ink-faint)] pl-4">
              <p className="mb-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--ink)]">
                Historical Parallel
              </p>
              <p className="font-body-serif text-sm leading-[1.8] text-[var(--ink-light)]">
                {historicalParallel}
              </p>
            </div>
          )}

          {stakeholderAnalysis && (
            <div className="mb-4 border-l-2 border-[var(--ink-faint)] pl-4">
              <p className="mb-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--ink)]">
                Who&rsquo;s Affected
              </p>
              <p className="font-body-serif text-sm leading-[1.8] text-[var(--ink-light)]">
                {stakeholderAnalysis}
              </p>
            </div>
          )}
        </section>
      )}

      {/* ══════════════ FUNDING TREE — media ownership visualization ══════════════ */}
      {fundingGraph.nodes.length > 1 && <FundingTree graph={fundingGraph} />}

      {/* ══════════════ ORIGINAL SOURCE TEXT — cited verbatim ══════════════ */}
      <section className="mb-8 border-t-2 border-b border-[var(--rule)] py-4">
        <h2 className="mb-1 font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--ink)]">
          Original Source Text
        </h2>
        <p className="mb-3 font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
          Verbatim descriptions from source feeds &mdash; unedited, as received
        </p>

        <div className="space-y-3">
          {/* Primary source */}
          <div className="border-l-2 border-[var(--rule)] pl-3">
            <p className="mb-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--ink-light)]">
              {primary.source}
              {primary.bias && (
                <span className="ml-2 font-normal text-[var(--ink-faint)]">
                  ({primary.bias.bias})
                </span>
              )}
            </p>
            <p className="font-body-serif text-sm leading-relaxed text-[var(--ink-light)]">
              {primary.description || primary.title}
            </p>
            <a
              href={primary.link}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)] underline decoration-[var(--rule-light)] underline-offset-2 hover:text-[var(--ink)]"
            >
              Read full original &rsaquo;
            </a>
          </div>

          {/* Related sources */}
          {relatedSources
            .filter((rel) => rel.description && rel.description.length > 10)
            .slice(0, 5)
            .map((rel, i) => (
              <div key={i} className="border-l border-[var(--rule-light)] pl-3">
                <p className="mb-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--ink-light)]">
                  {rel.source}
                  {rel.bias && (
                    <span className="ml-2 font-normal text-[var(--ink-faint)]">
                      ({rel.bias.bias})
                    </span>
                  )}
                </p>
                <p className="font-body-serif text-sm leading-relaxed text-[var(--ink-light)]">
                  {rel.description}
                </p>
                <a
                  href={rel.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)] underline decoration-[var(--rule-light)] underline-offset-2 hover:text-[var(--ink)]"
                >
                  Read full original &rsaquo;
                </a>
              </div>
            ))}
        </div>
      </section>

      {/* ══════════════ STORY CONTEXT — scraped + synthesized ══════════════ */}
      {contextSnippets.length > 0 && (
        <section className="mb-8 border-t border-b border-[var(--rule-light)] py-4">
          <h2 className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--ink)]">
            Story Context
          </h2>
          <div className="space-y-2.5">
            {contextSnippets.map((snippet) => (
              <div
                key={`${snippet.source}-${snippet.link}`}
                className="border-b border-[var(--rule-light)] pb-2.5 last:border-0 last:pb-0"
              >
                <p className="mb-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--ink-light)]">
                  {snippet.source}
                </p>
                <p className="font-body-serif text-sm leading-relaxed text-[var(--ink-light)]">
                  {snippet.summary}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ══════════════ AGENT RESEARCH PACK ══════════════ */}
      <section className="mb-8 border-t border-b-2 border-[var(--rule)] py-4">
        <h2 className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--ink)]">
          Agent Research Pack
        </h2>
        <p className="mb-3 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
          {agentResearch.sourceCount} sources · {agentResearch.evidence.length} evidence links
        </p>

        <div className="mb-3 border-l-2 border-[var(--rule)] pl-3">
          <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--ink-faint)]">Swarm Claim</p>
          <p className="font-body-serif text-sm leading-relaxed text-[var(--ink)]">{agentResearch.canonicalClaim}</p>
        </div>

        {agentResearch.contradictionFlags.length > 0 && (
          <div className="mb-3 border border-[var(--accent-red)]/50 bg-[color-mix(in_oklab,var(--paper)_94%,var(--accent-red)_6%)] p-2.5">
            <p className="mb-1 font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--accent-red)]">
              Conflicting Claims Detected
            </p>
            <div className="space-y-2">
              {agentResearch.contradictionFlags.slice(0, 2).map((flag) => (
                <div key={flag.id} className="text-[12px] leading-relaxed text-[var(--ink-light)]">
                  <span className="font-bold">{flag.sourceA}</span>: {flag.claimA}
                  {" "}vs{" "}
                  <span className="font-bold">{flag.sourceB}</span>: {flag.claimB}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          {agentResearch.evidence.slice(0, 4).map((evidence) => (
            <div key={`${evidence.source}-${evidence.link}`} className="border-b border-[var(--rule-light)] pb-2 last:border-0">
              <p className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
                {evidence.source} · {evidence.kind}
              </p>
              <a
                href={evidence.link}
                target="_blank"
                rel="noopener noreferrer"
                className="font-body-serif text-sm leading-relaxed text-[var(--ink)] underline decoration-[var(--rule-light)] underline-offset-2 transition-colors hover:text-[var(--accent-red)]"
              >
                {evidence.title}
              </a>
              <p className="mt-0.5 font-body-serif text-xs leading-relaxed text-[var(--ink-faint)]">
                {evidence.summary}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════ BIAS CONTEXT ══════════════ */}
      {biasContext && (
        <aside className="mb-8 border-l-2 border-[var(--rule)] pl-4">
          <p className="mb-1 font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--ink-faint)]">
            Source Context
          </p>
          <p className="font-body-serif text-sm italic leading-relaxed text-[var(--ink-light)]">
            {biasContext}
          </p>
        </aside>
      )}

      {/* ══════════════ THE WIRE — Multi-source coverage ══════════════ */}
      {relatedSources.length > 0 && (
        <section className="mb-8 border-t-2 border-b-2 border-[var(--rule)] py-4">
          <h2 className="mb-3 font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-[var(--ink)]">
            The Wire &mdash; Other Sources
          </h2>
          <div className="space-y-3">
            {relatedSources.map((rel, i) => {
              const relHash = computeEntityHash(rel.link);
              return (
                <div
                  key={i}
                  className="flex items-start gap-3 border-b border-[var(--rule-light)] pb-3 last:border-0 last:pb-0"
                >
                  {/* Source badge */}
                  <div className="flex shrink-0 flex-col items-center gap-0.5">
                    <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--ink-light)]">
                      {rel.source}
                    </span>
                    {rel.bias && (
                      <BiasPill bias={rel.bias} />
                    )}
                  </div>

                  {/* Title + description */}
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/article/${relHash}`}
                      className="font-headline-serif text-sm font-bold leading-snug text-[var(--ink)] transition-colors hover:text-[var(--accent-red)]"
                    >
                      {rel.title}
                    </Link>
                    {rel.description && (
                      <p className="mt-0.5 line-clamp-1 font-body-serif text-xs text-[var(--ink-faint)]">
                        {rel.description}
                      </p>
                    )}
                  </div>

                  {/* External link */}
                  <a
                    href={rel.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
                  >
                    Source&nbsp;&rsaquo;
                  </a>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ══════════════ ARCHIVE — Related archived coverage ══════════════ */}
      {archivedRelated.length > 0 && (
        <section className="mb-8 border-t border-b border-[var(--rule-light)] py-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--ink)]">
              From the Archive
            </h2>
            <Link
              href="/archive"
              className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)] transition-colors hover:text-[var(--accent-red)]"
            >
              Browse Archive &rsaquo;
            </Link>
          </div>
          <p className="mb-3 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
            {archivedRelated.length} archived {archivedRelated.length === 1 ? "story" : "stories"} related to this coverage
          </p>
          <div className="space-y-2.5">
            {archivedRelated.map((item) => (
              <div
                key={item.hash}
                className="flex items-start gap-3 border-b border-[var(--rule-light)] pb-2.5 last:border-0 last:pb-0"
              >
                <div className="flex shrink-0 flex-col items-center gap-0.5">
                  <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--ink-light)]">
                    {item.source}
                  </span>
                  {item.bias && <BiasPill bias={item.bias} />}
                </div>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/article/${item.hash}`}
                    className="font-headline-serif text-sm font-bold leading-snug text-[var(--ink)] transition-colors hover:text-[var(--accent-red)]"
                  >
                    {item.title}
                  </Link>
                  {item.description && (
                    <p className="mt-0.5 line-clamp-1 font-body-serif text-xs text-[var(--ink-faint)]">
                      {item.description}
                    </p>
                  )}
                  <span className="mt-0.5 block font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
                    {item.category} · archived
                  </span>
                </div>
                <a
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
                >
                  Source&nbsp;&rsaquo;
                </a>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ══════════════ TAGS ══════════════ */}
      {tags.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="border border-[var(--rule-light)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* ══════════════ ACTIONS BAR ══════════════ */}
      <div className="mb-6 flex flex-wrap items-center gap-4 border-t-2 border-[var(--rule)] pt-4">
        <RatingWidget entityHash={entityHash as `0x${string}`} />

        {isConnected && <TipButton entityHash={entityHash as `0x${string}`} />}

        {isDailyEdition && editionNumber && archiveStatus?.contentHash && (
          <MintEditionButton
            editionNumber={editionNumber}
            contentHash={archiveStatus.contentHash}
            dailyTitle={article.dailyTitle || "DAILY EDITION"}
          />
        )}

        <a
          href={primary.link}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
        >
          Read Original &rsaquo;
        </a>
      </div>

      {/* ══════════════ ARCHIVE STATUS ══════════════ */}
      {archiveStatus && (
        <div className="mb-6">
          <ArchiveStatus
            entityHash={entityHash}
            generatedBy={archiveStatus.generatedBy}
            generatedAt={archiveStatus.generatedAt}
            contentHash={archiveStatus.contentHash}
            onchainTxHash={archiveStatus.onchainTxHash}
          />
        </div>
      )}

      {/* ══════════════ EMBEDDED DISCUSSION ══════════════ */}
      <section className="mb-8 border-t-2 border-[var(--rule)] pt-4">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-[var(--ink)]">
            Discussion
          </h2>
          <span className="font-mono text-[9px] text-[var(--ink-faint)]">&mdash; onchain</span>
        </div>
        <CommentThread entityHash={entityHash as `0x${string}`} compact />
      </section>

      {/* ══════════════ SOURCE ATTRIBUTION ══════════════ */}
      <footer className="border-t border-[var(--rule-light)] pt-4 pb-8">
        <p className="mb-2 font-mono text-[9px] font-bold uppercase tracking-[0.3em] text-[var(--ink-faint)]">
          Sources
        </p>
        <div className="space-y-1.5">
          <a
            href={primary.link}
            target="_blank"
            rel="noopener noreferrer"
            className="block font-body-serif text-sm text-[var(--ink-light)] underline decoration-[var(--rule-light)] underline-offset-2 transition-colors hover:text-[var(--accent-red)] hover:decoration-[var(--accent-red)]"
          >
            {primary.source}: {primary.title}
          </a>
          {primary.sourceUrl &&
            primary.sourceUrl !== primary.link && (
              <a
                href={primary.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)] underline decoration-[var(--rule-light)] underline-offset-2 transition-colors hover:text-[var(--ink)] hover:decoration-[var(--ink)]"
              >
                Feed Source: {primary.sourceUrl}
              </a>
            )}
          {relatedSources.map((rel, i) => (
            <div key={i} className="space-y-1">
              <a
                href={rel.link}
                target="_blank"
                rel="noopener noreferrer"
                className="block font-body-serif text-sm text-[var(--ink-light)] underline decoration-[var(--rule-light)] underline-offset-2 transition-colors hover:text-[var(--accent-red)] hover:decoration-[var(--accent-red)]"
              >
                {rel.source}: {rel.title}
              </a>
              {rel.sourceUrl &&
                rel.sourceUrl !== rel.link && (
                  <a
                    href={rel.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)] underline decoration-[var(--rule-light)] underline-offset-2 transition-colors hover:text-[var(--ink)] hover:decoration-[var(--ink)]"
                  >
                    Feed Source: {rel.sourceUrl}
                  </a>
                )}
            </div>
          ))}
        </div>

        {/* Editorial note — agent swarm attribution */}
        <div className="mt-6 border border-[var(--rule-light)] p-3">
          <p className="font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
            <span className="font-bold text-[var(--ink-light)]">Editorial Note</span>
            &nbsp;&mdash;&nbsp;
            This article was created and moderated by the Morality Agent Swarm,
            a multi-agent system that synthesizes coverage from multiple news sources.
            All original source text is preserved verbatim above.
            The underlying facts are sourced from the publications listed.
            We encourage readers to consult the original sources and form their own opinions.
          </p>
        </div>
      </footer>

      {/* ══════════════ DAILY EDITION: PARALLEL WORLD FOOTER ══════════════ */}
      {isDailyEdition && <ParallelWorldFooter />}
    </div>
  );
}
