import { NextResponse } from "next/server";
import { DEFAULT_FEEDS } from "@/lib/rss";
import { getCrawlQueueStats, seedCrawlQueueFromRegistry } from "@/lib/crawl-queue";
import { getCanonicalSourceRegistry, registryStats } from "@/lib/source-registry";

// Cache for 5 minutes
export const revalidate = 300;

// ============================================================================
// GOVERNANCE ENDPOINTS — All the external APIs we depend on
// ============================================================================

interface GovernanceEndpoint {
  name: string;
  url: string;
  method: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  skipIf?: () => boolean;
}

const GOVERNANCE_ENDPOINTS: GovernanceEndpoint[] = [
  {
    name: "Snapshot GraphQL",
    url: "https://hub.snapshot.org/graphql",
    method: "POST" as const,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: "{ space(id: \"ens.eth\") { id } }",
    }),
  },
  {
    name: "UK Parliament (Commons)",
    url: "https://commonsvotes-api.parliament.uk/data/divisions.json/search?queryParameters.take=1",
    method: "GET" as const,
  },
  {
    name: "UK Parliament (Lords)",
    url: "https://lordsvotes-api.parliament.uk/data/Divisions/search?count=1&SortBy=DateDesc",
    method: "GET" as const,
  },
  {
    name: "US Congress API",
    url: `https://api.congress.gov/v3/bill?format=json&limit=1&api_key=${process.env.CONGRESS_API_KEY || "DEMO_KEY"}`,
    method: "GET" as const,
  },
  {
    name: "Tally GraphQL",
    url: "https://api.tally.xyz/query",
    method: "POST" as const,
    headers: {
      "Content-Type": "application/json",
      ...(process.env.TALLY_API_KEY ? { "Api-Key": process.env.TALLY_API_KEY } : {}),
    },
    body: JSON.stringify({
      query: "{ governances(input: { sort: { isDescending: true, sortBy: id }, page: { limit: 1 } }) { id } }",
    }),
    // Skip if no API key configured
    skipIf: () => !process.env.TALLY_API_KEY,
  },
  {
    name: "EU Parliament",
    url: `https://data.europarl.europa.eu/api/v2/activities/plenary-session-documents?year=${new Date().getFullYear()}&format=application%2Fld%2Bjson&offset=0&limit=1`,
    method: "GET" as const,
  },
  {
    name: "Canada Parliament",
    url: "https://api.openparliament.ca/votes/?format=json&limit=1",
    method: "GET" as const,
    headers: { Accept: "application/json" },
  },
  {
    name: "Australia Parliament",
    url: "https://theyvoteforyou.org.au/api/v1/divisions.json?sort=date&order=desc",
    method: "GET" as const,
    // Requires API key; skip if not set
    skipIf: () => !process.env.AU_API_KEY,
  },
  {
    name: "SEC EDGAR",
    url: "https://efts.sec.gov/LATEST/search-index?q=%22proxy%20statement%22&forms=DEF+14A&from=0&size=1",
    method: "GET" as const,
    headers: {
      "User-Agent": "pooter.world governance-aggregator/1.0",
      Accept: "application/json",
    },
  },
];

// ============================================================================
// TYPES
// ============================================================================

interface SourceStatus {
  name: string;
  url: string;
  status: "ok" | "error" | "skipped";
  latencyMs: number | null;
  error?: string;
}

interface HealthResponse {
  generatedAt: number;
  sources: {
    rss: SourceStatus[];
    governance: SourceStatus[];
  };
  ingestion: {
    registry: ReturnType<typeof registryStats>;
    crawlQueue: ReturnType<typeof getCrawlQueueStats>;
  };
  summary: {
    total: number;
    healthy: number;
    degraded: number;
  };
}

// ============================================================================
// CHECK FUNCTIONS
// ============================================================================

const CHECK_TIMEOUT_MS = 5_000;

async function checkRssSource(feed: { name: string; url: string }): Promise<SourceStatus> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  const start = Date.now();

  try {
    const res = await fetch(feed.url, {
      method: "HEAD",
      headers: { "User-Agent": "PooterWorld/1.0 HealthCheck" },
      signal: controller.signal,
      redirect: "follow",
    });

    const latencyMs = Date.now() - start;

    if (res.ok || res.status === 405) {
      // 405 = Method Not Allowed for HEAD — source is alive, just doesn't support HEAD
      return { name: feed.name, url: feed.url, status: "ok", latencyMs };
    }

    return {
      name: feed.name,
      url: feed.url,
      status: "error",
      latencyMs,
      error: `HTTP ${res.status}`,
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const isTimeout =
      err instanceof DOMException && err.name === "AbortError";

    return {
      name: feed.name,
      url: feed.url,
      status: "error",
      latencyMs: isTimeout ? null : latencyMs,
      error: isTimeout
        ? "Timeout (5s)"
        : err instanceof Error
          ? err.message
          : "Unknown error",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function checkGovernanceEndpoint(endpoint: GovernanceEndpoint): Promise<SourceStatus> {
  if (endpoint.skipIf?.()) {
    return {
      name: endpoint.name,
      url: endpoint.url,
      status: "skipped",
      latencyMs: null,
      error: "API key not configured",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  const start = Date.now();

  try {
    const res = await fetch(endpoint.url, {
      method: endpoint.method,
      headers: endpoint.headers,
      body: endpoint.method === "POST" ? endpoint.body : undefined,
      signal: controller.signal,
      redirect: "follow",
    });

    const latencyMs = Date.now() - start;

    if (res.ok) {
      return { name: endpoint.name, url: endpoint.url, status: "ok", latencyMs };
    }

    return {
      name: endpoint.name,
      url: endpoint.url,
      status: "error",
      latencyMs,
      error: `HTTP ${res.status}`,
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const isTimeout =
      err instanceof DOMException && err.name === "AbortError";

    return {
      name: endpoint.name,
      url: endpoint.url,
      status: "error",
      latencyMs: isTimeout ? null : latencyMs,
      error: isTimeout
        ? "Timeout (5s)"
        : err instanceof Error
          ? err.message
          : "Unknown error",
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function GET() {
  seedCrawlQueueFromRegistry(getCanonicalSourceRegistry());

  // Deduplicate RSS feeds by URL (some sources appear more than once)
  const uniqueFeeds = new Map<string, { name: string; url: string }>();
  for (const feed of DEFAULT_FEEDS) {
    if (!uniqueFeeds.has(feed.url)) {
      uniqueFeeds.set(feed.url, { name: feed.name, url: feed.url });
    }
  }

  // Run all checks in parallel
  const [rssResults, govResults] = await Promise.all([
    Promise.all(Array.from(uniqueFeeds.values()).map(checkRssSource)),
    Promise.all(GOVERNANCE_ENDPOINTS.map(checkGovernanceEndpoint)),
  ]);

  const allResults = [...rssResults, ...govResults];
  const healthy = allResults.filter((r) => r.status === "ok").length;
  const degraded = allResults.filter((r) => r.status === "error").length;

  const response: HealthResponse = {
    generatedAt: Date.now(),
    sources: {
      rss: rssResults,
      governance: govResults,
    },
    ingestion: {
      registry: registryStats(),
      crawlQueue: getCrawlQueueStats(),
    },
    summary: {
      total: allResults.length,
      healthy,
      degraded,
    },
  };

  return NextResponse.json(response);
}
