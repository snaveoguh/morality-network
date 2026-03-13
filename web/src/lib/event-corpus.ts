import { computeEntityHash } from "./entity";
import { enqueueCrawlTarget, getCrawlQueueStats, seedCrawlQueueFromRegistry } from "./crawl-queue";
import type { FeedItem } from "./rss";
import {
  computeSentimentSnapshot,
  fetchMarketData,
  matchesTopicDefinition,
  type MarketData,
  type SentimentSnapshot,
  TOPIC_TAXONOMY,
} from "./sentiment";
import {
  extractSourceNames,
  getCanonicalSourceRegistry,
  resolveCanonicalSource,
} from "./source-registry";

export interface EventRecord {
  id: `0x${string}`;
  canonicalClaim: string;
  title: string;
  link: string;
  pubDate: string;
  category: string;
  articleCount: number;
  sourceCount: number;
  sourceNames: string[];
  items: FeedItem[];
}

export interface EventCorpus {
  generatedAt: string;
  rawArticleCount: number;
  eventCount: number;
  sourceRegistrySize: number;
  queuedCrawlTargets: number;
  events: EventRecord[];
  sentimentItems: FeedItem[];
}

export interface EventShapedSentimentSnapshot extends SentimentSnapshot {
  corpusMode: "event";
  eventCount: number;
  rawArticleCount: number;
  sourceRegistrySize: number;
  queuedCrawlTargets: number;
}

const EVENT_STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "to",
  "of",
  "for",
  "in",
  "on",
  "at",
  "by",
  "from",
  "with",
  "after",
  "before",
  "amid",
  "over",
  "under",
  "into",
  "says",
  "say",
  "said",
  "report",
  "reports",
  "reportedly",
  "news",
  "live",
  "latest",
  "today",
  "yesterday",
  "world",
  "new",
]);

function normalizeClaim(value: string): string {
  const tokens = value
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((token) => token.length > 2 && !EVENT_STOPWORDS.has(token));

  return Array.from(new Set(tokens)).sort().slice(0, 10).join(" ");
}

function eventClaimForItem(item: FeedItem): string {
  const preferred =
    item.canonicalClaim &&
    item.canonicalClaim !== "Claim unavailable."
      ? item.canonicalClaim
      : item.title;
  return preferred.trim() || item.title.trim() || "Untitled event";
}

function latestFirst(a: FeedItem, b: FeedItem) {
  return new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime();
}

function buildSentimentItem(event: EventRecord): FeedItem {
  const sortedItems = [...event.items].sort(latestFirst);
  const primary = sortedItems[0];
  const descriptionParts = sortedItems
    .slice(0, 3)
    .map((item) => item.description?.trim())
    .filter(Boolean);

  return {
    ...primary,
    id: event.id,
    title: event.title,
    link: event.link,
    pubDate: event.pubDate,
    description: descriptionParts.join(" ").trim() || event.canonicalClaim,
    canonicalClaim: event.canonicalClaim,
    sourceNames: event.sourceNames,
    rawArticleCount: event.articleCount,
    eventHash: event.id,
  };
}

function priorityForEvent(event: EventRecord) {
  return Math.min(95, 45 + event.sourceCount * 8 + event.articleCount * 3);
}

export function buildEventCorpus(items: FeedItem[]): EventCorpus {
  const registry = getCanonicalSourceRegistry();
  seedCrawlQueueFromRegistry(registry);

  const groups = new Map<string, FeedItem[]>();
  for (const item of items) {
    const canonicalClaim = eventClaimForItem(item);
    const normalized =
      normalizeClaim(`${canonicalClaim} ${item.title}`) ||
      normalizeClaim(canonicalClaim) ||
      normalizeClaim(item.title);
    if (!normalized) continue;

    const key = computeEntityHash(`event:${normalized}`) as `0x${string}`;
    const bucket = groups.get(key) || [];
    bucket.push(item);
    groups.set(key, bucket);
  }

  const events: EventRecord[] = Array.from(groups.entries()).map(([id, groupedItems]) => {
    const sortedItems = [...groupedItems].sort(latestFirst);
    const primary = sortedItems[0];
    const sourceNames = extractSourceNames(sortedItems);

    const linkSet = new Set<string>();
    for (const item of sortedItems) {
      if (item.link) linkSet.add(item.link);
    }

    return {
      id: id as `0x${string}`,
      canonicalClaim: eventClaimForItem(primary),
      title: primary.title,
      link: primary.link,
      pubDate: primary.pubDate,
      category: primary.category,
      articleCount: linkSet.size || sortedItems.length,
      sourceCount: sourceNames.length,
      sourceNames,
      items: sortedItems,
    };
  });

  events.sort((a, b) => {
    if (b.sourceCount !== a.sourceCount) return b.sourceCount - a.sourceCount;
    if (b.articleCount !== a.articleCount) return b.articleCount - a.articleCount;
    return new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime();
  });

  for (const event of events.slice(0, 250)) {
    const representative = event.items[0];
    const source = resolveCanonicalSource({
      sourceName: representative.source,
      sourceUrl: representative.sourceUrl,
      articleUrl: representative.link,
    });

    if (representative.link) {
      enqueueCrawlTarget({
        url: representative.link,
        kind: "event-article",
        sourceId: source?.id ?? null,
        eventId: event.id,
        priority: priorityForEvent(event),
        discoveredFrom: event.canonicalClaim,
      });
    }
  }

  const queueStats = getCrawlQueueStats();

  return {
    generatedAt: new Date().toISOString(),
    rawArticleCount: items.length,
    eventCount: events.length,
    sourceRegistrySize: registry.length,
    queuedCrawlTargets: queueStats.queued,
    events,
    sentimentItems: events.map(buildSentimentItem),
  };
}

function enrichTopicCounts(
  snapshot: SentimentSnapshot,
  corpus: EventCorpus,
): SentimentSnapshot["topics"] {
  return snapshot.topics.map((topic) => {
    const matchingEvents = corpus.events.filter((event) =>
      matchesTopicDefinition(
        {
          title: event.title,
          description: event.canonicalClaim,
        },
        TOPIC_TAXONOMY.find((candidate) => candidate.slug === topic.slug)!
      )
    );

    const rawArticleCount = matchingEvents.reduce(
      (sum, event) => sum + event.articleCount,
      0
    );

    const sourceNames = new Set<string>();
    for (const event of matchingEvents) {
      for (const sourceName of event.sourceNames) {
        sourceNames.add(sourceName);
      }
    }

    return {
      ...topic,
      eventCount: matchingEvents.length,
      articleCount: rawArticleCount,
      sourceCount: sourceNames.size,
      topSources: Array.from(sourceNames).slice(0, 5),
    };
  });
}

export function computeEventShapedSentimentSnapshot(
  items: FeedItem[],
  marketData: MarketData | null,
  previousSnapshot: SentimentSnapshot | null,
): EventShapedSentimentSnapshot {
  const corpus = buildEventCorpus(items);
  const baseSnapshot = computeSentimentSnapshot(
    corpus.sentimentItems,
    marketData,
    previousSnapshot
  );

  return {
    ...baseSnapshot,
    topics: enrichTopicCounts(baseSnapshot, corpus),
    corpusMode: "event",
    eventCount: corpus.eventCount,
    rawArticleCount: corpus.rawArticleCount,
    sourceRegistrySize: corpus.sourceRegistrySize,
    queuedCrawlTargets: corpus.queuedCrawlTargets,
  };
}

export async function computeEventShapedSentimentSnapshotFromFeeds(
  items: FeedItem[],
  previousSnapshot: SentimentSnapshot | null,
) {
  const marketData = await fetchMarketData();
  return computeEventShapedSentimentSnapshot(items, marketData, previousSnapshot);
}
