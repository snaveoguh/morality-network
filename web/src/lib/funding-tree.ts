import { getSourceBias, type SourceBias, type BiasRating, type FactualityRating } from "./bias";
import type { FeedItem } from "./rss";

// ============================================================================
// FUNDING TREE — Media ownership graph for article sources
//
// Builds a directed graph showing how money flows to the media that created
// each article. Nodes are entities (owners, funders, states, sources).
// Edges show ownership/funding relationships.
//
// Data comes from:
//   1. Static bias.ts database (ownership, fundingModel, country)
//   2. [Future] Cloudflare crawl of source about/ownership pages
//   3. [Future] OpenCorporates / Wikidata API for corporate structure
//
// The graph is rendered as a Three.js force-directed tree on article pages.
// ============================================================================

// ── Node Types ──────────────────────────────────────────────────────────────

export type FundingNodeType =
  | "source"       // The news outlet itself
  | "owner"        // Corporate/trust owner
  | "state"        // State/government funder
  | "funder"       // Other funding body (nonprofit, foundation, etc.)
  | "conglomerate" // Parent media conglomerate
  | "individual";  // Individual owner/investor

export interface FundingNode {
  id: string;
  label: string;
  type: FundingNodeType;
  /** Morality score: credibility mapped to 0-100 */
  score: number;
  /** Country code (ISO) */
  country?: string;
  /** Bias rating if applicable */
  bias?: BiasRating;
  /** Factuality rating if applicable */
  factuality?: FactualityRating;
  /** Funding model */
  fundingModel?: string;
  /** Additional context */
  description?: string;
  /** Source domain (for source nodes) */
  domain?: string;
}

export interface FundingEdge {
  from: string; // node id
  to: string;   // node id
  label?: string; // e.g. "owns", "funds", "state-funded by"
  /** Strength of relationship: 0-1 */
  weight: number;
}

export interface FundingGraph {
  nodes: FundingNode[];
  edges: FundingEdge[];
  /** Whether this graph has been enriched beyond static data */
  enriched: boolean;
  /** ISO timestamp */
  generatedAt: string;
}

// ── Known ownership structures (manual enrichment) ──────────────────────────
// Maps owner names from bias.ts to their parent entities

const OWNERSHIP_HIERARCHY: Record<string, { parent?: string; type: FundingNodeType; country?: string; description?: string }> = {
  // Major conglomerates
  "News Corp": { type: "conglomerate", country: "US", description: "Rupert Murdoch's media conglomerate" },
  "Warner Bros. Discovery": { type: "conglomerate", country: "US", description: "Media conglomerate (CNN, HBO, Warner Bros)" },
  "The Walt Disney Company": { type: "conglomerate", country: "US", description: "Disney media empire (ABC, ESPN, Marvel)" },
  "Comcast/NBCUniversal": { type: "conglomerate", country: "US", description: "Comcast subsidiary (NBC, MSNBC, Universal)" },
  "Paramount Global": { type: "conglomerate", country: "US", description: "Shari Redstone's media company (CBS, MTV, Nickelodeon)" },
  "Axel Springer": { type: "conglomerate", country: "DE", description: "German media conglomerate (Politico, Business Insider, Bild)" },
  "Thomson Reuters": { type: "conglomerate", country: "CA", description: "Thomson family media & data empire" },
  "Bloomberg LP": { type: "conglomerate", country: "US", description: "Michael Bloomberg's financial media company" },
  "Nikkei Inc.": { type: "conglomerate", country: "JP", description: "Japanese media group (Financial Times, Nikkei)" },

  // Trusts & nonprofits
  "Scott Trust": { type: "funder", country: "UK", description: "Perpetual trust that owns The Guardian" },
  "Wikimedia Foundation": { type: "funder", country: "US", description: "Nonprofit behind Wikipedia, funded by donations" },

  // State entities
  "Qatar (State)": { type: "state", country: "QA", description: "Al Jazeera funded by the Qatari government" },
  "UK Government": { type: "state", country: "GB", description: "BBC funded by UK license fee" },
  "German Government": { type: "state", country: "DE", description: "DW funded by German federal tax revenue" },
  "French Government": { type: "state", country: "FR", description: "France 24 funded by French government" },
  "Japanese Government": { type: "state", country: "JP", description: "NHK funded by receiving fees" },

  // Individuals
  "Jeff Bezos": { type: "individual", country: "US", description: "Amazon founder, owns Washington Post" },
  "Laurene Powell Jobs": { type: "individual", country: "US", description: "Emerson Collective, owns The Atlantic" },
};

// ── Factuality → Score mapping ──────────────────────────────────────────────

const FACTUALITY_SCORES: Record<FactualityRating, number> = {
  "very-high": 95,
  "high": 82,
  "mostly-factual": 68,
  "mixed": 45,
  "low": 25,
  "very-low": 10,
};

// ============================================================================
// GRAPH BUILDER — construct funding tree for an article's sources
// ============================================================================

/**
 * Build a funding graph for the sources involved in an article.
 * Takes the primary source + related sources and traces ownership.
 */
export function buildFundingGraph(
  primary: FeedItem,
  related: FeedItem[],
): FundingGraph {
  const nodes = new Map<string, FundingNode>();
  const edges: FundingEdge[] = [];
  const allSources = [primary, ...related];

  // Process each source
  for (const item of allSources) {
    const bias = item.bias || getSourceBias(item.source);
    if (!bias) continue;

    const sourceId = `source:${bias.domain}`;

    // Skip if already processed
    if (nodes.has(sourceId)) continue;

    // Add source node
    nodes.set(sourceId, {
      id: sourceId,
      label: bias.name,
      type: "source",
      score: FACTUALITY_SCORES[bias.factuality] ?? 50,
      country: bias.country,
      bias: bias.bias,
      factuality: bias.factuality,
      fundingModel: bias.fundingModel,
      domain: bias.domain,
    });

    // Add owner node + edge
    if (bias.ownership && bias.ownership !== "Independent") {
      const ownerId = `owner:${bias.ownership}`;
      const hierarchy = OWNERSHIP_HIERARCHY[bias.ownership];

      if (!nodes.has(ownerId)) {
        nodes.set(ownerId, {
          id: ownerId,
          label: bias.ownership,
          type: hierarchy?.type || "owner",
          score: 50, // owners don't have a direct factuality score
          country: hierarchy?.country || bias.country,
          description: hierarchy?.description,
        });
      }

      edges.push({
        from: ownerId,
        to: sourceId,
        label: bias.fundingModel === "state" ? "funds" : "owns",
        weight: 1.0,
      });

      // Add parent entity if known
      if (hierarchy?.parent && !nodes.has(`parent:${hierarchy.parent}`)) {
        const parentHierarchy = OWNERSHIP_HIERARCHY[hierarchy.parent];
        nodes.set(`parent:${hierarchy.parent}`, {
          id: `parent:${hierarchy.parent}`,
          label: hierarchy.parent,
          type: parentHierarchy?.type || "conglomerate",
          score: 50,
          country: parentHierarchy?.country,
          description: parentHierarchy?.description,
        });

        edges.push({
          from: `parent:${hierarchy.parent}`,
          to: ownerId,
          label: "parent of",
          weight: 0.8,
        });
      }
    }

    // Add state funder for state-funded sources
    if (bias.fundingModel === "state" && bias.country) {
      const stateId = `state:${bias.country}`;
      if (!nodes.has(stateId)) {
        const countryLabel = bias.ownership?.includes("Government")
          ? bias.ownership
          : `${bias.country} Government`;

        nodes.set(stateId, {
          id: stateId,
          label: countryLabel,
          type: "state",
          score: 40, // state-funded gets lower default score
          country: bias.country,
          description: `State-funded media from ${bias.country}`,
        });
      }

      // Only add edge if not already connected via ownership
      const hasOwnerEdge = edges.some(
        (e) => e.to === sourceId && e.from.startsWith("owner:"),
      );
      if (!hasOwnerEdge) {
        edges.push({
          from: stateId,
          to: sourceId,
          label: "state-funds",
          weight: 0.9,
        });
      }
    }
  }

  return {
    nodes: Array.from(nodes.values()),
    edges,
    enriched: false,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Build a compact funding graph for a single source (used in BiasPill tooltip).
 */
export function buildSourceFundingChain(bias: SourceBias): FundingGraph {
  const primary: FeedItem = {
    id: `funding:${bias.domain}`,
    title: bias.name,
    link: `https://${bias.domain}`,
    source: bias.name,
    sourceUrl: `https://${bias.domain}`,
    pubDate: new Date().toISOString(),
    description: "",
    category: "Media",
    bias,
  };

  return buildFundingGraph(primary, []);
}
