import { fetchAllFeeds, type FeedItem } from "@/lib/rss";
import { computeEntityHash, buildEntityUrl } from "@/lib/entity";
import {
  findRelatedArticles,
  enrichArticleEmbeds,
  formatDateline,
  estimateReadingTime,
} from "@/lib/article";
import { ArticleTemplate } from "@/components/article/ArticleTemplate";
import { CommentThread } from "@/components/entity/CommentThread";
import {
  getArchivedFeedItemByHash,
  getAllArchivedFeedItems,
  getAllArchivedItemsWithHashes,
  autoArchiveItem,
  autoArchiveBatch,
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
import { BRAND_NAME, SITE_URL, withBrand } from "@/lib/brand";
import Link from "next/link";
import { notFound } from "next/navigation";

export const revalidate = 3600; // 1 hour ISR
export const maxDuration = 55;

/** Race a promise against a timeout — returns fallback on timeout */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

interface ArticlePageProps {
  params: Promise<{ hash: string }>;
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { hash } = await params;
  if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) {
    notFound();
  }

  // ─── FAST PATH: check article archive + editorial archive in PARALLEL ───
  // For pooter daily editions, only the editorial archive has the data.
  // Running both checks concurrently avoids the 20-30s sequential waterfall
  // that was causing Vercel function timeouts.
  const [archivedPrimary, earlyEditorial] = await Promise.all([
    getArchivedFeedItemByHash(hash as `0x${string}`).catch(() => null),
    getArchivedEditorial(hash).catch(() => null),
  ]);

  // If we have an editorial with its primary, skip the slow feed/registry paths
  if (!archivedPrimary && earlyEditorial) {
    const hydratedEditorial = await enrichArticleEmbeds(
      earlyEditorial.primary,
      earlyEditorial,
    );
    if (hydratedEditorial !== earlyEditorial) {
      withTimeout(
        saveEditorial(hash, hydratedEditorial, earlyEditorial.generatedBy).catch((err) => {
          console.warn("[article] cached editorial refresh failed:", err);
        }),
        10000,
        undefined,
      ).catch(() => {});
    }

    const dateline = formatDateline(hydratedEditorial.primary.pubDate);
    const readTime = estimateReadingTime([
      ...hydratedEditorial.editorialBody,
      hydratedEditorial.wireSummary || "",
    ]);

    const EARLY_EPOCH_MS = 1741651200 * 1000;
    let earlyEditionNumber: number | undefined;
    if (hydratedEditorial.isDailyEdition) {
      const earlyDate = new Date(hydratedEditorial.generatedAt).getTime();
      const daysSinceEpoch = Math.floor((earlyDate - EARLY_EPOCH_MS) / 86400000);
      if (daysSinceEpoch >= 0) {
        earlyEditionNumber = daysSinceEpoch + 1;
      }
    }

    return (
      <ArticleTemplate
        article={hydratedEditorial}
        dateline={dateline}
        readTime={readTime}
        entityHash={hash}
        archivedRelated={[]}
        editionNumber={earlyEditionNumber}
        archiveStatus={{
          generatedBy: hydratedEditorial.generatedBy,
          generatedAt: hydratedEditorial.generatedAt,
          contentHash: hydratedEditorial.contentHash,
          onchainTxHash: hydratedEditorial.onchainTxHash,
        }}
      />
    );
  }

  // ─── SLOW PATH: article found in article archive, or need to search feeds ───
  let livePrimary: Awaited<ReturnType<typeof fetchAllFeeds>>[number] | null = null;
  let allItems: Awaited<ReturnType<typeof fetchAllFeeds>> = [];

  if (!archivedPrimary) {
    // Not in cache — try live feeds (slow but necessary for new articles)
    allItems = await withTimeout(fetchAllFeeds(), 8000, []);
    livePrimary = allItems.find(
      (item) => computeEntityHash(item.link) === hash
    ) ?? null;

    // Archive in background (non-blocking) via after()
    if (allItems.length > 0) {
      const { after } = await import("next/server");
      after(() => {
        autoArchiveBatch(allItems).catch(() => {});
      });
    }
  }
  const recoveredPrimary =
    livePrimary || archivedPrimary
      ? null
      : await recoverPrimaryFromRegistry(hash as `0x${string}`);
  const primary = livePrimary ?? archivedPrimary ?? recoveredPrimary;

  // Ensure the specific primary is archived (may have been recovered from registry)
  if (primary && !livePrimary) {
    await autoArchiveItem(primary).catch((err) => {
      console.warn("[article] primary archive failed:", err);
    });
  }

  // ─── Check user-published articles in Redis ──────────────────────
  if (!primary) {
    try {
      const pubRes = await fetch(
        `${process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://pooter.world"}/api/articles/publish?hash=${hash}`,
        { next: { revalidate: 60 } },
      );
      if (pubRes.ok) {
        const userArticle = await pubRes.json();
        if (userArticle && userArticle.title) {
          return (
            <section className="mx-auto max-w-4xl py-10">
              <div className="border-b-2 border-[var(--rule)] pb-6">
                <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--ink-faint)]">
                  {userArticle.source || "pooter.world"} · {userArticle.category?.toUpperCase() || "GENERAL"}
                </p>
                <h1 className="mt-1 font-headline text-3xl leading-tight text-[var(--ink)] md:text-4xl">
                  {userArticle.title}
                </h1>
                <p className="mt-2 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
                  By {userArticle.author} · {new Date(userArticle.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                </p>
              </div>

              {userArticle.media?.length > 0 && (
                <div className="mt-4 flex gap-3 overflow-x-auto">
                  {userArticle.media.map((url: string, i: number) => (
                    <img key={i} src={url} alt="" className="h-48 object-cover grayscale" />
                  ))}
                </div>
              )}

              <article className="prose-pooter mt-6 whitespace-pre-wrap font-body-serif text-base leading-relaxed">
                {userArticle.body}
              </article>

              <div className="mt-8">
                <CommentThread entityHash={hash as `0x${string}`} />
              </div>
            </section>
          );
        }
      }
    } catch {}
  }

  if (!primary) {
    // Editorial was already checked in parallel above — no need to re-fetch

    return (
      <section className="mx-auto max-w-4xl py-10">
        <div className="border-b-2 border-[var(--rule)] pb-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--ink-faint)]">
            Permanent Record
          </p>
          <h1 className="mt-1 font-headline text-3xl leading-tight text-[var(--ink)] md:text-4xl">
            Awaiting content
          </h1>
          <p className="mt-3 max-w-3xl font-body-serif text-base leading-relaxed text-[var(--ink-light)]">
            This hash is a permanent address on {BRAND_NAME}. Content has not yet been
            matched to it &mdash; but once it is, it stays forever. Ratings, comments,
            and claims submitted here persist onchain regardless.
          </p>

          {/* Hash — always visible, always selectable */}
          <div className="mt-4 border border-[var(--rule-light)] bg-[var(--paper-dark,var(--paper))] px-3 py-2">
            <p className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
              Entity Hash
            </p>
            <p className="mt-0.5 break-all select-all font-mono text-xs text-[var(--ink)]">
              {hash}
            </p>
          </div>

          <p className="mt-3 max-w-3xl font-body-serif text-sm leading-relaxed text-[var(--ink-faint)]">
            Content accumulates over time &mdash; as our AI processes sources, generates
            editorials, and users contribute context, this page will fill in. Every
            article, entity, and claim on {BRAND_NAME} builds a permanent, evolving record.
          </p>

          <div className="mt-4 flex flex-wrap gap-4">
            <Link
              href={buildEntityUrl(hash as `0x${string}`)}
              className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink)] underline underline-offset-4 decoration-[var(--rule)] transition-colors hover:text-[var(--accent-red)]"
            >
              Entity Ledger &rsaquo;
            </Link>
            <Link
              href="/"
              className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
            >
              &larr; Front Page
            </Link>
          </div>
        </div>

        {/* Discussion — the hash is permanent, so comments always work */}
        <div className="mt-6">
          <CommentThread entityHash={hash as `0x${string}`} />
        </div>
      </section>
    );
  }

  // Related articles — use only live feed items (fast, no archive load)
  const related = allItems.length > 0 ? findRelatedArticles(primary, allItems, 5) : [];
  const archivedRelated: Array<ReturnType<typeof findRelatedArticles>[number] & { hash: string }> = [];

  // ═══ CACHE-ONLY: no AI generation on click. Editorials are pre-generated
  // by the newsroom cron. If no editorial exists yet, show raw feed data. ═══
  // Re-use earlyEditorial from the parallel fetch above (no duplicate request)
  let article = earlyEditorial
    ? await enrichArticleEmbeds(earlyEditorial.primary, earlyEditorial)
    : null;

  // No cached editorial — render raw feed data with "editorial pending" badge
  if (!article) {
    const dateline = formatDateline(primary.pubDate);
    return (
      <section className="mx-auto max-w-3xl py-10">
        <div className="border-b-2 border-[var(--rule)] pb-4 mb-6">
          <div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
            <span className="font-bold text-[var(--accent-red)]">{primary.category}</span>
            <span>&middot;</span>
            <span>{primary.source}</span>
            <span className="ml-auto border border-[var(--ink-faint)] px-1.5 py-0.5 text-[8px]">
              Editorial Pending
            </span>
          </div>
          <h1 className="font-headline text-3xl leading-[1.1] text-[var(--ink)] sm:text-4xl">
            {primary.title}
          </h1>
          {primary.description && (
            <p className="mt-3 font-body-serif text-base leading-relaxed text-[var(--ink-light)]">
              {primary.description}
            </p>
          )}
          <p className="mt-2 font-mono text-[9px] text-[var(--ink-faint)]">{dateline}</p>
          <div className="mt-4 flex flex-wrap gap-4 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
            <a
              href={primary.link}
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-[var(--rule)] underline-offset-2 hover:text-[var(--ink)]"
            >
              Read Original Source &rsaquo;
            </a>
            <Link href={buildEntityUrl(hash as `0x${string}`, { url: primary.link, title: primary.title, source: primary.source, type: "link" })} className="hover:text-[var(--ink)]">
              Entity Ledger &rsaquo;
            </Link>
          </div>
        </div>
        <CommentThread entityHash={hash as `0x${string}`} />
      </section>
    );
  }

  // Compute metadata
  const dateline = formatDateline(primary.pubDate);
  const readTime = estimateReadingTime([
    ...article.editorialBody,
    article.wireSummary || "",
  ]);

  // Re-use earlyEditorial from parallel fetch (no duplicate request)
  // Compute edition number for daily editions (days since March 11 2025 epoch)
  const EDITION_EPOCH_MS = 1741651200 * 1000; // March 11 2025 00:00 UTC (edition #1)
  let editionNumber: number | undefined;
  if (article.isDailyEdition) {
    const editorialDate = earlyEditorial?.generatedAt
      ? new Date(earlyEditorial.generatedAt).getTime()
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
      archiveStatus={earlyEditorial ? {
        generatedBy: earlyEditorial.generatedBy,
        generatedAt: earlyEditorial.generatedAt,
        contentHash: earlyEditorial.contentHash,
        onchainTxHash: earlyEditorial.onchainTxHash,
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
// Edition epoch: March 11 2025 00:00 UTC (edition #1)
const EDITION_EPOCH_MS = 1741651200 * 1000;

/** Compute the edition illustration URL if the editorial is a daily edition with an illustration. */
function resolveEditionIllustrationUrl(editorial: Awaited<ReturnType<typeof getArchivedEditorial>> | null): string | null {
  if (!editorial?.isDailyEdition || !editorial.hasIllustration) return null;
  const editorialDate = editorial.generatedAt
    ? new Date(editorial.generatedAt).getTime()
    : Date.now();
  const daysSinceEpoch = Math.floor((editorialDate - EDITION_EPOCH_MS) / 86400000);
  if (daysSinceEpoch < 0) return null;
  const editionNumber = daysSinceEpoch + 1;
  return `${SITE_URL}/api/edition/${editionNumber}/illustration`;
}

/** OG images are now always rendered via opengraph-image.tsx (grayscale).
 *  No explicit image URLs in metadata — Next.js auto-discovers the component. */
function resolveOgImages(): Array<{ url: string }> {
  return [];
}

export async function generateMetadata({ params }: ArticlePageProps) {
  const { hash } = await params;
  if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) {
    return { title: "Article Not Found" };
  }

  // Fetch archive + editorial in parallel
  const [archivedItem, editorial] = await Promise.all([
    withTimeout(getArchivedFeedItemByHash(hash as `0x${string}`), 5000, null),
    getArchivedEditorial(hash).catch(() => null),
  ]);
  const item = archivedItem;

  if (!item) {
    if (editorial?.primary?.title) {
      const images = resolveOgImages();
      return {
        title: withBrand(editorial.primary.title),
        description: editorial.subheadline,
        openGraph: {
          title: editorial.primary.title,
          description: editorial.subheadline,
          images,
          type: "article" as const,
          siteName: BRAND_NAME,
          locale: "en_US",
        },
        twitter: {
          card: "summary_large_image" as const,
          title: editorial.primary.title,
          description: editorial.subheadline,
          images: images.map((i) => i.url),
        },
      };
    }

    return {
      title: withBrand("Permanent Record — Awaiting Content"),
      description:
        "This hash is a permanent address. Content accumulates over time as AI processes sources and users contribute context.",
      openGraph: {
        title: withBrand("Permanent Record — Awaiting Content"),
        description:
          "A permanent onchain record awaiting content. Ratings and comments persist regardless.",
        type: "article" as const,
        siteName: BRAND_NAME,
        locale: "en_US",
      },
      twitter: {
        card: "summary_large_image" as const,
        title: withBrand("Permanent Record — Awaiting Content"),
        description:
          "A permanent onchain record awaiting content.",
      },
    };
  }

  const description = item.description?.slice(0, 160) || "";
  const sourceInfo = item.bias
    ? `${item.source} (${item.bias.bias}) — ${item.category}`
    : `${item.source} — ${item.category}`;
  const images = resolveOgImages();

  return {
    title: withBrand(item.title),
    description,
    openGraph: {
      title: item.title,
      description: `${sourceInfo}. ${description}`,
      images,
      type: "article" as const,
      siteName: BRAND_NAME,
      locale: "en_US",
    },
    twitter: {
      card: "summary_large_image" as const,
      title: item.title,
      description,
      images: images.map((i) => i.url),
    },
  };
}
