import { computeEntityHash } from "./entity";

// ============================================================================
// MACRO NARRATIVES — Thematic market signals users can rate & discuss
//
// Narratives are entities with a "narrative:" prefix. They hash via keccak256
// like any other entity, so existing ratings/comments/tipping contracts work.
// ============================================================================

export type NarrativeCategory =
  | "macro-risk"
  | "monetary-policy"
  | "sector-rotation"
  | "geopolitical"
  | "crypto-native";

export type NarrativeSentiment = "bullish" | "bearish" | "neutral" | "contested";

export interface MacroNarrative {
  id: string;
  title: string;
  description: string;
  category: NarrativeCategory;
  sentiment: NarrativeSentiment;
  entityHash: `0x${string}`;
  seedDate: string; // ISO date
  source: "seed" | "editorial-ai";
  /** Editorial entity hashes that reference this narrative */
  linkedEditorials?: string[];
}

export function computeNarrativeHash(id: string): `0x${string}` {
  return computeEntityHash(`narrative:${id}`);
}

const CATEGORY_LABELS: Record<NarrativeCategory, string> = {
  "macro-risk": "Macro Risk",
  "monetary-policy": "Monetary Policy",
  "sector-rotation": "Sector Rotation",
  geopolitical: "Geopolitical",
  "crypto-native": "Crypto Native",
};

export function narrativeCategoryLabel(cat: NarrativeCategory): string {
  return CATEGORY_LABELS[cat];
}

// ============================================================================
// SEED NARRATIVES — Curated starting set
// ============================================================================

const SEED_NARRATIVES: Omit<MacroNarrative, "entityHash">[] = [
  {
    id: "ai-bubble-risk",
    title: "AI Bubble Risk",
    description:
      "Top-heavy AI concentration in equities mirrors dot-com dynamics. A single theme carrying the weight of millions of retirement accounts — if growth slows even slightly, the repricing could be brutal.",
    category: "macro-risk",
    sentiment: "bearish",
    seedDate: "2026-03-29",
    source: "seed",
  },
  {
    id: "gold-safe-haven",
    title: "Gold as Safe Haven",
    description:
      "Central banks accumulating gold at record pace. Precious metals re-emerging as protection of choice as debt-to-GDP ratios hit historic highs and fiat confidence erodes.",
    category: "monetary-policy",
    sentiment: "bullish",
    seedDate: "2026-03-29",
    source: "seed",
  },
  {
    id: "fed-rate-cuts",
    title: "Rate Cut Rally",
    description:
      "Markets pricing in aggressive Fed rate cuts for 2026. If cuts materialize, risk assets rally. If the Fed holds, the dislocation between expectations and reality could trigger a selloff.",
    category: "monetary-policy",
    sentiment: "contested",
    seedDate: "2026-03-29",
    source: "seed",
  },
  {
    id: "china-decoupling",
    title: "China Decoupling",
    description:
      "US-China tech and trade decoupling accelerating. Supply chain reshoring, export controls, and investment restrictions reshaping global capital flows.",
    category: "geopolitical",
    sentiment: "bearish",
    seedDate: "2026-03-29",
    source: "seed",
  },
  {
    id: "crypto-regulatory-clarity",
    title: "Crypto Regulatory Clarity",
    description:
      "Stablecoin legislation and market structure bills advancing. Clear rules could unlock institutional capital — or formalize restrictions that constrain the ecosystem.",
    category: "crypto-native",
    sentiment: "contested",
    seedDate: "2026-03-29",
    source: "seed",
  },
  {
    id: "de-dollarization",
    title: "De-dollarization",
    description:
      "BRICS+ pushing alternative settlement systems. Dollar share of global reserves declining. Slow-moving structural shift with accelerating geopolitical catalysts.",
    category: "geopolitical",
    sentiment: "bearish",
    seedDate: "2026-03-29",
    source: "seed",
  },
  {
    id: "energy-transition",
    title: "Energy Transition Repricing",
    description:
      "AI data center demand colliding with grid capacity constraints. Nuclear renaissance narrative gaining traction. Energy capex cycle just beginning.",
    category: "sector-rotation",
    sentiment: "bullish",
    seedDate: "2026-03-29",
    source: "seed",
  },
  {
    id: "stablecoin-legislation",
    title: "Stablecoin Legislation",
    description:
      "US stablecoin framework nearing passage. Could legitimize the $150B+ stablecoin market, create bank-competitive payment rails, and define dollar dominance in digital form.",
    category: "crypto-native",
    sentiment: "bullish",
    seedDate: "2026-03-29",
    source: "seed",
  },
];

/** Hydrate seed narratives with computed entity hashes. */
function hydrateSeedNarratives(): MacroNarrative[] {
  return SEED_NARRATIVES.map((n) => ({
    ...n,
    entityHash: computeNarrativeHash(n.id),
  }));
}

/**
 * Get all narratives — seed list + AI-extracted.
 * AI-extracted narratives are merged in when available.
 */
export function getSeedNarratives(): MacroNarrative[] {
  return hydrateSeedNarratives();
}
