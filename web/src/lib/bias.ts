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
  "vox.com": {
    name: "Vox", domain: "vox.com",
    bias: "left", factuality: "high",
    ownership: "Vox Media", country: "US", fundingModel: "corporate",
  },
  "thecanary.co": {
    name: "The Canary", domain: "thecanary.co",
    bias: "left", factuality: "mixed",
    ownership: "Independent", country: "UK", fundingModel: "independent",
  },
  "newstatesman.com": {
    name: "New Statesman", domain: "newstatesman.com",
    bias: "left", factuality: "high",
    ownership: "Independent", country: "UK", fundingModel: "corporate",
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
  "theverge.com": {
    name: "The Verge", domain: "theverge.com",
    bias: "lean-left", factuality: "high",
    ownership: "Vox Media", country: "US", fundingModel: "corporate",
  },
  "wired.com": {
    name: "Wired", domain: "wired.com",
    bias: "lean-left", factuality: "high",
    ownership: "Condé Nast", country: "US", fundingModel: "corporate",
  },
  "ft.com": {
    name: "Financial Times", domain: "ft.com",
    bias: "lean-left", factuality: "very-high",
    ownership: "Nikkei Inc.", country: "UK", fundingModel: "corporate",
  },
  "middleeasteye.net": {
    name: "Middle East Eye", domain: "middleeasteye.net",
    bias: "lean-left", factuality: "mostly-factual",
    ownership: "Independent", country: "UK", fundingModel: "independent",
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
  "bloomberg.com": {
    name: "Bloomberg", domain: "bloomberg.com",
    bias: "center", factuality: "high",
    ownership: "Bloomberg LP", country: "US", fundingModel: "corporate",
  },
  "cnbc.com": {
    name: "CNBC", domain: "cnbc.com",
    bias: "center", factuality: "high",
    ownership: "NBCUniversal (Comcast)", country: "US", fundingModel: "corporate",
  },
  "marketwatch.com": {
    name: "MarketWatch", domain: "marketwatch.com",
    bias: "center", factuality: "high",
    ownership: "Dow Jones (News Corp)", country: "US", fundingModel: "corporate",
  },
  "nhk.or.jp": {
    name: "NHK World", domain: "nhk.or.jp",
    bias: "center", factuality: "high",
    ownership: "NHK (Public)", country: "Japan", fundingModel: "public",
  },
  "timesofindia.indiatimes.com": {
    name: "Times of India", domain: "timesofindia.indiatimes.com",
    bias: "center", factuality: "mostly-factual",
    ownership: "Bennett, Coleman & Co.", country: "India", fundingModel: "corporate",
  },
  "kyivindependent.com": {
    name: "Kyiv Independent", domain: "kyivindependent.com",
    bias: "center", factuality: "high",
    ownership: "Independent", country: "Ukraine", fundingModel: "nonprofit",
  },
  "politico.com": {
    name: "Politico", domain: "politico.com",
    bias: "center", factuality: "high",
    ownership: "Axel Springer", country: "US", fundingModel: "corporate",
  },
  "thehill.com": {
    name: "The Hill", domain: "thehill.com",
    bias: "center", factuality: "high",
    ownership: "Nexstar Media", country: "US", fundingModel: "corporate",
  },
  "thedefiant.io": {
    name: "The Defiant", domain: "thedefiant.io",
    bias: "center", factuality: "high",
    ownership: "Independent", country: "US", fundingModel: "independent",
  },
  "cointelegraph.com": {
    name: "Cointelegraph", domain: "cointelegraph.com",
    bias: "center", factuality: "mostly-factual",
    ownership: "Independent", country: "US", fundingModel: "corporate",
  },
  "nature.com": {
    name: "Nature", domain: "nature.com",
    bias: "center", factuality: "very-high",
    ownership: "Springer Nature", country: "UK", fundingModel: "corporate",
  },
  "newscientist.com": {
    name: "New Scientist", domain: "newscientist.com",
    bias: "center", factuality: "high",
    ownership: "DMGT", country: "UK", fundingModel: "corporate",
  },
  "carbonbrief.org": {
    name: "Carbon Brief", domain: "carbonbrief.org",
    bias: "center", factuality: "very-high",
    ownership: "Independent", country: "UK", fundingModel: "nonprofit",
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
  "wsj.com": {
    name: "Wall Street Journal", domain: "wsj.com",
    bias: "lean-right", factuality: "high",
    ownership: "Dow Jones (News Corp)", country: "US", fundingModel: "corporate",
  },

  // ===== RIGHT =====
  "freebeacon.com": {
    name: "Washington Free Beacon", domain: "freebeacon.com",
    bias: "right", factuality: "mostly-factual",
    ownership: "Center for American Freedom", country: "US", fundingModel: "nonprofit",
  },
  "breitbart.com": {
    name: "Breitbart", domain: "breitbart.com",
    bias: "right", factuality: "mixed",
    ownership: "Independent", country: "US", fundingModel: "independent",
  },
  "dailywire.com": {
    name: "Daily Wire", domain: "dailywire.com",
    bias: "right", factuality: "mixed",
    ownership: "Independent (Ben Shapiro)", country: "US", fundingModel: "corporate",
  },
  "order-order.com": {
    name: "Guido Fawkes", domain: "order-order.com",
    bias: "right", factuality: "mixed",
    ownership: "Independent", country: "UK", fundingModel: "independent",
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

  // ===== USER-GENERATED / FORUMS =====
  "reddit.com": {
    name: "Reddit", domain: "reddit.com",
    bias: "lean-left", factuality: "mixed",
    ownership: "Reddit Inc / Advance Publications", country: "US", fundingModel: "corporate",
  },
  "4chan.org": {
    name: "4chan", domain: "4chan.org",
    bias: "right", factuality: "low",
    ownership: "Hiroyuki Nishimura", country: "US", fundingModel: "independent",
  },

  // ===== ENVIRONMENT / NATURE =====
  "mongabay.com": {
    name: "Mongabay", domain: "mongabay.com",
    bias: "lean-left", factuality: "very-high",
    ownership: "Independent (Rhett Butler)", country: "US", fundingModel: "nonprofit",
  },
  "e360.yale.edu": {
    name: "Yale E360", domain: "e360.yale.edu",
    bias: "center", factuality: "very-high",
    ownership: "Yale School of the Environment", country: "US", fundingModel: "academic",
  },
  "earth.org": {
    name: "Earth.org", domain: "earth.org",
    bias: "lean-left", factuality: "high",
    ownership: "Earth.org Ltd", country: "Hong Kong", fundingModel: "nonprofit",
  },
  "insideclimatenews.org": {
    name: "Inside Climate News", domain: "insideclimatenews.org",
    bias: "lean-left", factuality: "very-high",
    ownership: "Independent", country: "US", fundingModel: "nonprofit",
  },
  "grist.org": {
    name: "Grist", domain: "grist.org",
    bias: "lean-left", factuality: "high",
    ownership: "Independent", country: "US", fundingModel: "nonprofit",
  },

  // ===== GOVERNMENT / INSTITUTIONAL =====
  "news.un.org": {
    name: "UN News", domain: "news.un.org",
    bias: "center", factuality: "high",
    ownership: "United Nations", country: "International", fundingModel: "intergovernmental",
  },
  "who.int": {
    name: "WHO", domain: "who.int",
    bias: "center", factuality: "high",
    ownership: "World Health Organization", country: "International", fundingModel: "intergovernmental",
  },
  "blogs.worldbank.org": {
    name: "World Bank", domain: "blogs.worldbank.org",
    bias: "center", factuality: "high",
    ownership: "World Bank Group", country: "International", fundingModel: "intergovernmental",
  },
  "imf.org": {
    name: "IMF", domain: "imf.org",
    bias: "center", factuality: "high",
    ownership: "International Monetary Fund", country: "International", fundingModel: "intergovernmental",
  },
  "gao.gov": {
    name: "GAO", domain: "gao.gov",
    bias: "center", factuality: "very-high",
    ownership: "US Government", country: "US", fundingModel: "state",
  },
  "cbo.gov": {
    name: "CBO", domain: "cbo.gov",
    bias: "center", factuality: "very-high",
    ownership: "US Government", country: "US", fundingModel: "state",
  },
  "oecd.org": {
    name: "OECD", domain: "oecd.org",
    bias: "center", factuality: "high",
    ownership: "OECD", country: "International", fundingModel: "intergovernmental",
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
