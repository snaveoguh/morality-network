// ============================================================================
// MEDIA BIAS DATABASE
// Ratings sourced from Media Bias/Fact Check (MBFC), AllSides, Ad Fontes Media
// Composite ratings averaged across available sources
// ============================================================================

export type BiasRating = "far-left" | "left" | "lean-left" | "center" | "lean-right" | "right" | "far-right";
export type FactualityRating = "very-high" | "high" | "mostly-factual" | "mixed" | "low" | "very-low";

export interface SourceBias {
  name: string;
  domain: string;
  bias: BiasRating;
  factuality: FactualityRating;
  ownership?: string;           // Corporate owner or "Independent"
  country?: string;             // Country of origin
  fundingModel?: string;        // "corporate" | "nonprofit" | "public" | "independent" | "state"
}

// Static database — covers all RSS sources we aggregate plus major outlets
// This avoids API rate limits and works offline
export const BIAS_DATABASE: Record<string, SourceBias> = {
  // ===== FAR LEFT =====
  "jacobin.com": {
    name: "Jacobin", domain: "jacobin.com",
    bias: "far-left", factuality: "high",
    ownership: "Independent", country: "US", fundingModel: "independent",
  },
  "democracynow.org": {
    name: "Democracy Now!", domain: "democracynow.org",
    bias: "far-left", factuality: "high",
    ownership: "Independent", country: "US", fundingModel: "nonprofit",
  },

  // ===== LEFT =====
  "theintercept.com": {
    name: "The Intercept", domain: "theintercept.com",
    bias: "left", factuality: "high",
    ownership: "First Look Media", country: "US", fundingModel: "nonprofit",
  },
  "theguardian.com": {
    name: "The Guardian", domain: "theguardian.com",
    bias: "left", factuality: "high",
    ownership: "Scott Trust", country: "UK", fundingModel: "nonprofit",
  },
  "motherjones.com": {
    name: "Mother Jones", domain: "motherjones.com",
    bias: "left", factuality: "high",
    ownership: "Foundation for National Progress", country: "US", fundingModel: "nonprofit",
  },
  "currentaffairs.org": {
    name: "Current Affairs", domain: "currentaffairs.org",
    bias: "left", factuality: "high",
    ownership: "Independent", country: "US", fundingModel: "nonprofit",
  },

  // ===== LEAN LEFT =====
  "bbc.co.uk": {
    name: "BBC News", domain: "bbc.co.uk",
    bias: "lean-left", factuality: "high",
    ownership: "BBC (Public)", country: "UK", fundingModel: "public",
  },
  "bbc.com": {
    name: "BBC News", domain: "bbc.com",
    bias: "lean-left", factuality: "high",
    ownership: "BBC (Public)", country: "UK", fundingModel: "public",
  },
  "npr.org": {
    name: "NPR", domain: "npr.org",
    bias: "lean-left", factuality: "very-high",
    ownership: "NPR (Public)", country: "US", fundingModel: "public",
  },
  "propublica.org": {
    name: "ProPublica", domain: "propublica.org",
    bias: "lean-left", factuality: "very-high",
    ownership: "Independent", country: "US", fundingModel: "nonprofit",
  },
  "techcrunch.com": {
    name: "TechCrunch", domain: "techcrunch.com",
    bias: "lean-left", factuality: "high",
    ownership: "Yahoo (Apollo Global)", country: "US", fundingModel: "corporate",
  },
  "arstechnica.com": {
    name: "Ars Technica", domain: "arstechnica.com",
    bias: "lean-left", factuality: "high",
    ownership: "Condé Nast", country: "US", fundingModel: "corporate",
  },
  "theatlantic.com": {
    name: "The Atlantic", domain: "theatlantic.com",
    bias: "lean-left", factuality: "high",
    ownership: "Emerson Collective", country: "US", fundingModel: "corporate",
  },

  // ===== CENTER =====
  "reuters.com": {
    name: "Reuters", domain: "reuters.com",
    bias: "center", factuality: "very-high",
    ownership: "Thomson Reuters", country: "UK/US", fundingModel: "corporate",
  },
  "apnews.com": {
    name: "Associated Press", domain: "apnews.com",
    bias: "center", factuality: "very-high",
    ownership: "AP (Cooperative)", country: "US", fundingModel: "nonprofit",
  },
  "aljazeera.com": {
    name: "Al Jazeera", domain: "aljazeera.com",
    bias: "center", factuality: "mostly-factual",
    ownership: "Qatar (State)", country: "Qatar", fundingModel: "state",
  },
  "news.ycombinator.com": {
    name: "Hacker News", domain: "news.ycombinator.com",
    bias: "center", factuality: "high",
    ownership: "Y Combinator", country: "US", fundingModel: "corporate",
  },
  "hnrss.org": {
    name: "Hacker News", domain: "hnrss.org",
    bias: "center", factuality: "high",
    ownership: "Y Combinator", country: "US", fundingModel: "corporate",
  },
  "restofworld.org": {
    name: "Rest of World", domain: "restofworld.org",
    bias: "center", factuality: "high",
    ownership: "Independent", country: "US", fundingModel: "nonprofit",
  },
  "ground.news": {
    name: "Ground News", domain: "ground.news",
    bias: "center", factuality: "high",
    ownership: "Independent", country: "Canada", fundingModel: "independent",
  },

  // ===== LEAN RIGHT =====
  "reason.com": {
    name: "Reason", domain: "reason.com",
    bias: "lean-right", factuality: "high",
    ownership: "Reason Foundation", country: "US", fundingModel: "nonprofit",
  },
  "theamericanconservative.com": {
    name: "The American Conservative", domain: "theamericanconservative.com",
    bias: "lean-right", factuality: "high",
    ownership: "American Ideas Institute", country: "US", fundingModel: "nonprofit",
  },
  "spectator.co.uk": {
    name: "The Spectator", domain: "spectator.co.uk",
    bias: "lean-right", factuality: "mostly-factual",
    ownership: "Press Holdings", country: "UK", fundingModel: "corporate",
  },

  // ===== RIGHT =====
  "freebeacon.com": {
    name: "Washington Free Beacon", domain: "freebeacon.com",
    bias: "right", factuality: "mostly-factual",
    ownership: "Center for American Freedom", country: "US", fundingModel: "nonprofit",
  },

  // ===== CRYPTO (mostly center, tech-oriented) =====
  "coindesk.com": {
    name: "CoinDesk", domain: "coindesk.com",
    bias: "center", factuality: "high",
    ownership: "Bullish (crypto)", country: "US", fundingModel: "corporate",
  },
  "theblock.co": {
    name: "The Block", domain: "theblock.co",
    bias: "center", factuality: "high",
    ownership: "Foresight Ventures", country: "US", fundingModel: "corporate",
  },
  "decrypt.co": {
    name: "Decrypt", domain: "decrypt.co",
    bias: "center", factuality: "high",
    ownership: "Independent", country: "US", fundingModel: "independent",
  },
  "blockworks.co": {
    name: "Blockworks", domain: "blockworks.co",
    bias: "center", factuality: "high",
    ownership: "Independent", country: "US", fundingModel: "independent",
  },
  "dlnews.com": {
    name: "DL News", domain: "dlnews.com",
    bias: "center", factuality: "high",
    ownership: "Independent", country: "US", fundingModel: "independent",
  },

  // ===== CONFLICT / INDEPENDENT JOURNALISM =====
  "popularfront.co": {
    name: "Popular Front", domain: "popularfront.co",
    bias: "lean-left", factuality: "high",
    ownership: "Independent (Jake Hanrahan)", country: "UK", fundingModel: "independent",
  },
  "bellingcat.com": {
    name: "Bellingcat", domain: "bellingcat.com",
    bias: "lean-left", factuality: "very-high",
    ownership: "Stichting Bellingcat", country: "Netherlands", fundingModel: "nonprofit",
  },
  "occrp.org": {
    name: "OCCRP", domain: "occrp.org",
    bias: "center", factuality: "very-high",
    ownership: "Independent", country: "International", fundingModel: "nonprofit",
  },

  // ===== GLOBAL / INTERNATIONAL =====
  "france24.com": {
    name: "France 24", domain: "france24.com",
    bias: "center", factuality: "high",
    ownership: "France Médias Monde (State)", country: "France", fundingModel: "state",
  },
  "dw.com": {
    name: "DW News", domain: "dw.com",
    bias: "center", factuality: "high",
    ownership: "Deutsche Welle (State)", country: "Germany", fundingModel: "state",
  },
  "abc.net.au": {
    name: "ABC Australia", domain: "abc.net.au",
    bias: "lean-left", factuality: "high",
    ownership: "ABC (Public)", country: "Australia", fundingModel: "public",
  },
  "scmp.com": {
    name: "South China Morning Post", domain: "scmp.com",
    bias: "center", factuality: "high",
    ownership: "Alibaba Group", country: "Hong Kong", fundingModel: "corporate",
  },
};

// ============================================================================
// HELPERS
// ============================================================================

/** Extract domain from a full URL */
function extractDomain(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    return hostname;
  } catch {
    return url;
  }
}

/** Look up bias data for a source by name or URL */
export function getSourceBias(sourceNameOrUrl: string): SourceBias | null {
  // Try direct domain match
  const domain = extractDomain(sourceNameOrUrl);
  if (BIAS_DATABASE[domain]) return BIAS_DATABASE[domain];

  // Try matching by name (case-insensitive)
  const lower = sourceNameOrUrl.toLowerCase();
  for (const entry of Object.values(BIAS_DATABASE)) {
    if (entry.name.toLowerCase() === lower) return entry;
  }

  // Try partial domain match (e.g., "feeds.bbci.co.uk" → "bbc.co.uk")
  for (const [key, entry] of Object.entries(BIAS_DATABASE)) {
    if (domain.includes(key) || key.includes(domain)) return entry;
  }

  return null;
}

/** Get bias for an RSS feed source URL */
export function getBiasForFeed(feedUrl: string): SourceBias | null {
  return getSourceBias(feedUrl);
}

// ============================================================================
// BIAS DISPLAY HELPERS
// ============================================================================

export const BIAS_LABELS: Record<BiasRating, string> = {
  "far-left": "Far Left",
  "left": "Left",
  "lean-left": "Lean Left",
  "center": "Center",
  "lean-right": "Lean Right",
  "right": "Right",
  "far-right": "Far Right",
};

export const BIAS_COLORS: Record<BiasRating, string> = {
  "far-left": "#3B82F6",     // blue-500
  "left": "#60A5FA",          // blue-400
  "lean-left": "#93C5FD",     // blue-300
  "center": "#A1A1AA",        // zinc-400
  "lean-right": "#FCA5A5",    // red-300
  "right": "#F87171",         // red-400
  "far-right": "#EF4444",     // red-500
};

export const BIAS_SHORT: Record<BiasRating, string> = {
  "far-left": "FL",
  "left": "L",
  "lean-left": "LL",
  "center": "C",
  "lean-right": "LR",
  "right": "R",
  "far-right": "FR",
};

export const FACTUALITY_LABELS: Record<FactualityRating, string> = {
  "very-high": "Very High",
  "high": "High",
  "mostly-factual": "Mostly Factual",
  "mixed": "Mixed",
  "low": "Low",
  "very-low": "Very Low",
};

export const FACTUALITY_COLORS: Record<FactualityRating, string> = {
  "very-high": "#31F387",
  "high": "#4ADE80",
  "mostly-factual": "#FCD34D",
  "mixed": "#FB923C",
  "low": "#F87171",
  "very-low": "#EF4444",
};

/** Get a numeric position for bias on a 0-6 scale (far-left=0, far-right=6) */
export function biasToPosition(bias: BiasRating): number {
  const positions: Record<BiasRating, number> = {
    "far-left": 0, "left": 1, "lean-left": 2,
    "center": 3,
    "lean-right": 4, "right": 5, "far-right": 6,
  };
  return positions[bias];
}

/** Given multiple sources, compute a distribution for the bias bar */
export function computeBiasDistribution(
  sources: SourceBias[]
): Record<BiasRating, number> {
  const dist: Record<BiasRating, number> = {
    "far-left": 0, "left": 0, "lean-left": 0,
    "center": 0,
    "lean-right": 0, "right": 0, "far-right": 0,
  };
  for (const source of sources) {
    dist[source.bias]++;
  }
  return dist;
}
