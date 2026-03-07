"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import type { ArticleContent } from "@/lib/article";
import { BiasPill } from "@/components/feed/BiasBar";
import { TipButton } from "@/components/entity/TipButton";
import { RatingWidget } from "@/components/entity/RatingWidget";
import { CommentThread } from "@/components/entity/CommentThread";
import { computeEntityHash } from "@/lib/entity";

interface ArticleTemplateProps {
  article: ArticleContent;
  dateline: string;
  readTime: number;
  entityHash: string;
}

export function ArticleTemplate({
  article,
  dateline,
  readTime,
  entityHash,
}: ArticleTemplateProps) {
  const { isConnected } = useAccount();
  const { primary, relatedSources, subheadline, subheadlineEnglish, editorialBody, editorialBodyEnglish, wireSummary, biasContext, tags, contextSnippets } =
    article;

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

      {/* ══════════════ ARTICLE BODY ══════════════ */}
      <article className="mb-8">
        {editorialBody.map((paragraph, i) => (
          <div key={i} className="mb-4">
            <p
              className={`font-body-serif text-base leading-[1.8] text-[var(--ink-light)] ${
                i === 0 ? "drop-cap text-lg" : ""
              }`}
            >
              {paragraph}
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

        <a
          href={primary.link}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
        >
          Read Original &rsaquo;
        </a>
      </div>

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
          {relatedSources.map((rel, i) => (
            <a
              key={i}
              href={rel.link}
              target="_blank"
              rel="noopener noreferrer"
              className="block font-body-serif text-sm text-[var(--ink-light)] underline decoration-[var(--rule-light)] underline-offset-2 transition-colors hover:text-[var(--accent-red)] hover:decoration-[var(--accent-red)]"
            >
              {rel.source}: {rel.title}
            </a>
          ))}
        </div>

        {/* Editorial note */}
        <div className="mt-6 border border-[var(--rule-light)] p-3">
          <p className="font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
            <span className="font-bold text-[var(--ink-light)]">Editorial Note</span>
            &nbsp;&mdash;&nbsp;
            This article is assembled from multiple news sources by the pooter world editorial engine.
            Commentary is generated; the underlying facts are sourced from the publications listed above.
            We encourage readers to consult the original sources and form their own opinions.
            The truth, like a good compost heap, benefits from multiple contributions.
          </p>
        </div>
      </footer>
    </div>
  );
}
