import { after } from "next/server";
import { fetchAllFeeds, type FeedItem } from "@/lib/rss";
import { computeEntityHash, buildEntityUrl } from "@/lib/entity";
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
  getAllArchivedFeedItems,
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
import Link from "next/link";

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
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

const EDITION_EPOCH_MS = 1741651200 * 1000; // March 11 2025 00:00 UTC (edition #1)

export async function AsyncArticleBody({ hash }: { hash: string }) {
  // 1. Check editorial archive first (instant on cache hit)
  const cachedEditorial = await getArchivedEditorial(hash).catch(() => null);
  if (cachedEditorial) {
    const hydratedEditorial = await enrichArticleEmbeds(
      cachedEditorial.primary,
      cachedEditorial,
    );
    if (hydratedEditorial !== cachedEditorial) {
      await withTimeout(
        saveEditorial(hash, hydratedEditorial, cachedEditorial.generatedBy).catch(() => {}),
        10000,
        undefined,
      );
    }

    const dateline = formatDateline(hydratedEditorial.primary.pubDate);
    const readTime = estimateReadingTime([
      ...hydratedEditorial.editorialBody,
      hydratedEditorial.wireSummary || "",
    ]);

    let editionNumber: number | undefined;
    if (hydratedEditorial.isDailyEdition) {
      const cachedDate = new Date(hydratedEditorial.generatedAt).getTime();
      const daysSinceEpoch = Math.floor((cachedDate - EDITION_EPOCH_MS) / 86400000);
      if (daysSinceEpoch >= 0) editionNumber = daysSinceEpoch + 1;
    }

    // Fetch archived related for the full template
    const archivedWithHashes = await withTimeout(getAllArchivedItemsWithHashes(), 5000, []);
    const archivedRelated = findRelatedArticles(
      hydratedEditorial.primary,
      archivedWithHashes,
      8,
    ).map((item) => {
      const match = archivedWithHashes.find((a) => a.link === item.link);
      return { ...item, hash: match?.hash ?? "" };
    }).filter((item) => item.hash);

    return (
      <ArticleTemplate
        article={hydratedEditorial}
        dateline={dateline}
        readTime={readTime}
        entityHash={hash}
        archivedRelated={archivedRelated}
        editionNumber={editionNumber}
        archiveStatus={{
          generatedBy: hydratedEditorial.generatedBy,
          generatedAt: hydratedEditorial.generatedAt,
          contentHash: hydratedEditorial.contentHash,
          onchainTxHash: hydratedEditorial.onchainTxHash,
        }}
      />
    );
  }

  // 2. Find the feed item (uses SWR cache — usually instant after first load)
  const allItems = await withTimeout(fetchAllFeeds(), 8000, []);
  const livePrimary = allItems.find(
    (item) => computeEntityHash(item.link) === hash
  );
  const archivedPrimary = livePrimary
    ? null
    : await getArchivedFeedItemByHash(hash as `0x${string}`);
  const recoveredPrimary =
    livePrimary || archivedPrimary
      ? null
      : await recoverPrimaryFromRegistry(hash as `0x${string}`);
  const primary = livePrimary ?? archivedPrimary ?? recoveredPrimary;

  if (primary) {
    autoArchiveItem(primary).catch(() => {});
  }

  if (!primary) {
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

  // 3. Try to generate editorial — if cached, it would have been returned above.
  //    Attempt inline generation with timeout, fall back to lite view.
  const archivedItems = await withTimeout(getAllArchivedFeedItems(), 5000, []);
  const seenLinks = new Set(allItems.map((i) => i.link));
  const combinedPool = [...allItems];
  for (const archived of archivedItems) {
    if (archived.link && !seenLinks.has(archived.link)) {
      combinedPool.push(archived);
      seenLinks.add(archived.link);
    }
  }
  const related = findRelatedArticles(primary, combinedPool, 5);

  const archivedWithHashes = await withTimeout(getAllArchivedItemsWithHashes(), 5000, []);
  const archivedRelated = findRelatedArticles(
    primary,
    archivedWithHashes,
    8,
  ).map((item) => {
    const match = archivedWithHashes.find((a) => a.link === item.link);
    return { ...item, hash: match?.hash ?? "" };
  }).filter((item) => item.hash);

  let article;
  try {
    // Skip cache inside generateEditorial — we already checked the archive above.
    // Use a short timeout: if AI can't respond quickly, the cron job will
    // pre-generate it for next visit.  Template fallback still runs within
    // this window (it's instant, no AI call).
    article = await withTimeout(
      generateEditorial(primary, related, { skipCache: true }),
      8000,
      null as Awaited<ReturnType<typeof generateEditorial>> | null,
    );
    if (!article) throw new Error("Editorial generation timed out");
  } catch {
    // Render lite version immediately.
    // Fire-and-forget: generate a template editorial and save it so the NEXT
    // visitor gets instant content instead of waiting again.
    after(async () => {
      try {
        const fallback = await generateEditorial(primary, related, { skipCache: true });
        await saveEditorial(
          hash,
          fallback,
          (fallback as { generatedBy?: string }).generatedBy === "claude-ai"
            ? "claude-ai"
            : "template-fallback",
        );
      } catch {
        // Best-effort — cron will catch up
      }
    });

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
            <Link href={buildEntityUrl(hash as `0x${string}`, { url: primary.link, title: primary.title, source: primary.source, type: "link" })} className="hover:text-[var(--ink)]">
              Entity Ledger &rsaquo;
            </Link>
          </div>
        </div>
        <CommentThread entityHash={hash as `0x${string}`} />
      </section>
    );
  }

  // Persist editorial BEFORE response — blocking ensures persistence
  const generatedBy = (article as { generatedBy?: string }).generatedBy;
  await withTimeout(
    saveEditorial(hash, article, generatedBy === "claude-ai" ? "claude-ai" : "template-fallback").catch(() => {}),
    10000,
    undefined,
  );

  const dateline = formatDateline(primary.pubDate);
  const readTime = estimateReadingTime([
    ...article.editorialBody,
    article.wireSummary || "",
  ]);

  const archivedEditorial = await getArchivedEditorial(hash).catch(() => null);

  let editionNumber: number | undefined;
  if (article.isDailyEdition) {
    const editorialDate = archivedEditorial?.generatedAt
      ? new Date(archivedEditorial.generatedAt).getTime()
      : Date.now();
    const daysSinceEpoch = Math.floor((editorialDate - EDITION_EPOCH_MS) / 86400000);
    if (daysSinceEpoch >= 0) editionNumber = daysSinceEpoch + 1;
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
