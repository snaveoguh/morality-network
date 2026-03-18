import { cache } from "react";
import { fetchAllFeeds, type FeedItem } from "@/lib/rss";
import { computeEntityHash } from "@/lib/entity";
import {
  findRelatedArticles,
  generateEditorial,
  enrichArticleEmbeds,
  formatDateline,
  estimateReadingTime,
} from "@/lib/article";
import { ArticleTemplate } from "@/components/article/ArticleTemplate";
import { CommentThread } from "@/components/entity/CommentThread";
import {
  getArchivedFeedItemByHash,
  getAllArchivedItemsWithHashes,
  autoArchiveItem,
  archiveUrlAsFeedItem,
} from "@/lib/archive";
import {
  saveEditorial,
  getArchivedEditorial,
} from "@/lib/editorial-archive";
import {
  getRegistryEntityByHash,
  isHttpIdentifier,
} from "@/lib/entity-registry";
import { BRAND_NAME, withBrand } from "@/lib/brand";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";
export const maxDuration = 55;

/** Race a promise against a timeout — returns fallback on timeout */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

/**
 * Memoized article lookup — shared between generateMetadata and ArticlePage
 * so both always resolve the same item for a given hash within a single request.
 * Archive-first: the archive is the source of truth for persisted stories.
 */
const lookupArticle = cache(async (hash: string): Promise<FeedItem | null> => {
  // 1. Archive is the source of truth — check first (fast, stable)
  const archived = await getArchivedFeedItemByHash(hash as `0x${string}`);
  if (archived) return archived;

  // 2. Fall back to live RSS feeds
  const allItems = await withTimeout(fetchAllFeeds(), 15000, []);
  const live = allItems.find(
    (item) => computeEntityHash(item.link) === hash,
  );
  if (live) {
    autoArchiveItem(live).catch(() => {});
    return live;
  }

  // 3. Try onchain registry recovery
  return recoverPrimaryFromRegistry(hash as `0x${string}`);
});

interface ArticlePageProps {
  params: Promise<{ hash: string }>;
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { hash } = await params;
  if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) {
    notFound();
  }

  const primary = await lookupArticle(hash);

  if (!primary) {
    // Check if we have a previously generated editorial in the deep archive
    const cachedEditorial = await getArchivedEditorial(hash).catch(() => null);
    if (cachedEditorial) {
      const hydratedEditorial = await enrichArticleEmbeds(
        cachedEditorial.primary,
        cachedEditorial,
      );
      if (hydratedEditorial !== cachedEditorial) {
        saveEditorial(
          hash,
          hydratedEditorial,
          cachedEditorial.generatedBy,
        ).catch((err) => {
          console.warn("[article] cached editorial refresh failed:", err);
        });
      }

      // We have the full editorial — render it even without a live/archived feed item
      const dateline = formatDateline(hydratedEditorial.primary.pubDate);
      const readTime = estimateReadingTime([
        ...hydratedEditorial.editorialBody,
        hydratedEditorial.wireSummary || "",
      ]);

      // Compute edition number for daily editions
      const CACHED_EPOCH_MS = 1741651200 * 1000;
      let cachedEditionNumber: number | undefined;
      if (hydratedEditorial.isDailyEdition) {
        const cachedDate = new Date(hydratedEditorial.generatedAt).getTime();
        const daysSinceEpoch = Math.floor((cachedDate - CACHED_EPOCH_MS) / 86400000);
        if (daysSinceEpoch >= 0) {
          cachedEditionNumber = daysSinceEpoch + 1;
        }
      }

      return (
        <ArticleTemplate
          article={hydratedEditorial}
          dateline={dateline}
          readTime={readTime}
          entityHash={hash}
          archivedRelated={[]}
          editionNumber={cachedEditionNumber}
          archiveStatus={{
            generatedBy: hydratedEditorial.generatedBy,
            generatedAt: hydratedEditorial.generatedAt,
            contentHash: hydratedEditorial.contentHash,
            onchainTxHash: hydratedEditorial.onchainTxHash,
          }}
        />
      );
    }

    return (
      <section className="mx-auto max-w-4xl py-10">
        <div className="border-b border-[var(--rule)] pb-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--ink-faint)]">
            Not Yet Archived
          </p>
          <h1 className="mt-1 font-headline text-3xl leading-tight text-[var(--ink)] md:text-4xl">
            Article not yet archived
          </h1>
          <p className="mt-3 max-w-3xl font-body-serif text-base leading-relaxed text-[var(--ink-light)]">
            This hash has not been matched to a known article in our archive.
            Ratings and comments can still be submitted &mdash; they will persist onchain.
          </p>
          <p className="mt-2 max-w-3xl font-body-serif text-sm leading-relaxed text-[var(--ink-faint)]">
            Automatic recovery is attempted from onchain entity identifiers.
            This hash currently has no recoverable source URL in the registry/archive.
          </p>
          <div className="mt-4 flex flex-wrap gap-4">
            <Link
              href={`/entity/${hash}`}
              className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink)] underline underline-offset-4 decoration-[var(--rule)] transition-colors hover:text-[var(--accent-red)]"
            >
              Open Entity Ledger
            </Link>
            <Link
              href="/"
              className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
            >
              &larr; Return to Front Page
            </Link>
          </div>
        </div>

        <div className="mt-8 border border-[var(--rule-light)] p-4">
          <CommentThread entityHash={hash as `0x${string}`} />
        </div>
      </section>
    );
  }

  // Find related articles from the archive pool (stable, no live RSS dependency)
  const archivedWithHashes = await withTimeout(getAllArchivedItemsWithHashes(), 5000, []);
  const related = findRelatedArticles(primary, archivedWithHashes, 5);
  const archivedRelated = findRelatedArticles(
    primary,
    archivedWithHashes,
    8,
  ).map((item) => {
    const match = archivedWithHashes.find((a) => a.link === item.link);
    return { ...item, hash: match?.hash ?? "" };
  }).filter((item) => item.hash);

  // Generate editorial content — 30s timeout, falls back to raw feed data
  let article;
  try {
    article = await withTimeout(
      generateEditorial(primary, related),
      30000,
      null as Awaited<ReturnType<typeof generateEditorial>> | null,
    );
    if (!article) throw new Error("Editorial generation timed out");
  } catch (err) {
    console.error("[article] generateEditorial failed:", err);
    // Render a minimal version with raw feed data
    return (
      <section className="mx-auto max-w-3xl py-10">
        <div className="border-b-2 border-[var(--rule)] pb-4 mb-6">
          <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
            <span className="font-bold text-[var(--accent-red)]">{primary.category}</span>
            <span className="mx-2">&middot;</span>
            <span>{primary.source}</span>
          </div>
          <h1 className="font-headline text-3xl leading-[1.1] text-[var(--ink)] sm:text-4xl">
            {primary.title}
          </h1>
          {primary.description && (
            <p className="mt-3 font-body-serif text-base leading-relaxed text-[var(--ink-light)]">
              {primary.description}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-4 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
            <a
              href={primary.link}
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-[var(--rule)] underline-offset-2 hover:text-[var(--ink)]"
            >
              Read Original Source &rsaquo;
            </a>
            <Link href={`/entity/${hash}`} className="hover:text-[var(--ink)]">
              Entity Ledger &rsaquo;
            </Link>
          </div>
        </div>
        <CommentThread entityHash={hash as `0x${string}`} />
      </section>
    );
  }

  // Persist editorial to deep archive (fire-and-forget)
  const generatedBy = (article as { generatedBy?: string }).generatedBy;
  saveEditorial(
    hash,
    article,
    (generatedBy === "claude-ai" ? "claude-ai" : "template-fallback"),
  ).catch((err) => {
    console.warn("[article] editorial save failed:", err);
  });

  // Compute metadata
  const dateline = formatDateline(primary.pubDate);
  const readTime = estimateReadingTime([
    ...article.editorialBody,
    article.wireSummary || "",
  ]);

  // Get archive status for the UI
  const archivedEditorial = await getArchivedEditorial(hash).catch(() => null);

  // Compute edition number for daily editions (days since March 11 2026 epoch)
  const EDITION_EPOCH_MS = 1741651200 * 1000; // March 11 2026 00:00 UTC
  let editionNumber: number | undefined;
  if (article.isDailyEdition) {
    const editorialDate = archivedEditorial?.generatedAt
      ? new Date(archivedEditorial.generatedAt).getTime()
      : Date.now();
    const daysSinceEpoch = Math.floor((editorialDate - EDITION_EPOCH_MS) / 86400000);
    if (daysSinceEpoch >= 0) {
      editionNumber = daysSinceEpoch + 1;
    }
  }

  return (
    <ArticleTemplate
      article={article}
      dateline={dateline}
      readTime={readTime}
      entityHash={hash}
      archivedRelated={archivedRelated}
      editionNumber={editionNumber}
      archiveStatus={archivedEditorial ? {
        generatedBy: archivedEditorial.generatedBy,
        generatedAt: archivedEditorial.generatedAt,
        contentHash: archivedEditorial.contentHash,
        onchainTxHash: archivedEditorial.onchainTxHash,
      } : generatedBy ? {
        generatedBy: generatedBy === "claude-ai" ? "claude-ai" : "template-fallback",
        generatedAt: new Date().toISOString(),
        contentHash: "",
      } : undefined}
    />
  );
}

async function recoverPrimaryFromRegistry(
  hash: `0x${string}`,
): Promise<FeedItem | null> {
  const entity = await getRegistryEntityByHash(hash);
  if (!entity || !entity.exists || !isHttpIdentifier(entity.identifier)) {
    return null;
  }

  const identifier = entity.identifier.trim();
  let parsed: URL;
  try {
    parsed = new URL(identifier);
  } catch {
    return null;
  }

  const sourceUrl = `${parsed.protocol}//${parsed.host}`;
  const source = parsed.hostname.replace(/^www\./i, "") || "Recovered Source";

  const recovered = await archiveUrlAsFeedItem(identifier, {
    source,
    sourceUrl,
    category: "Archive",
    tags: ["onchain", "recovery"],
    description: `Recovered from onchain entity registry: ${sourceUrl}`,
  });

  if (recovered) {
    console.log(`[article] recovered ${hash.slice(0, 10)}... from registry URL`);
  }

  return recovered;
}

// Generate metadata for SEO
export async function generateMetadata({ params }: ArticlePageProps) {
  const { hash } = await params;
  if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) {
    return { title: "Article Not Found" };
  }

  const item = await lookupArticle(hash);

  if (!item) {
    // Check editorial archive as last resort for OG tags
    const editorial = await getArchivedEditorial(hash).catch(() => null);
    if (editorial) {
      return {
        title: withBrand(editorial.primary.title),
        description: editorial.subheadline,
        openGraph: {
          title: editorial.primary.title,
          description: editorial.subheadline,
          images: editorial.primary.imageUrl
            ? [{ url: editorial.primary.imageUrl }]
            : [],
          type: "article" as const,
          siteName: BRAND_NAME,
          locale: "en_US",
        },
        twitter: {
          card: "summary_large_image" as const,
          title: editorial.primary.title,
          description: editorial.subheadline,
        },
      };
    }

    return {
      title: withBrand("Article Not Yet Archived"),
      description:
        "This article hash has not been matched to a known source. Ratings and comments can still be submitted onchain.",
      openGraph: {
        title: withBrand("Article Not Yet Archived"),
        description:
          "This article hash has not been matched to a known source.",
        type: "article" as const,
        siteName: BRAND_NAME,
        locale: "en_US",
      },
      twitter: {
        card: "summary_large_image" as const,
        title: withBrand("Article Not Yet Archived"),
        description:
          "This article hash has not been matched to a known source.",
      },
    };
  }

  const description = item.description?.slice(0, 160) || "";
  const sourceInfo = item.bias
    ? `${item.source} (${item.bias.bias}) — ${item.category}`
    : `${item.source} — ${item.category}`;

  return {
    title: withBrand(item.title),
    description,
    openGraph: {
      title: item.title,
      description: `${sourceInfo}. ${description}`,
      images: item.imageUrl ? [{ url: item.imageUrl }] : [],
      type: "article" as const,
      siteName: BRAND_NAME,
      locale: "en_US",
    },
    twitter: {
      card: "summary_large_image" as const,
      title: item.title,
      description,
    },
  };
}
