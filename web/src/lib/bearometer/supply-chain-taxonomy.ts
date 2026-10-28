// ============================================================================
// BEAROMETER — CHINA SUPPLY-CHAIN TAXONOMY
// Material → component → end-use groups, the patterns that tag a headline to
// a group, and the tickers shown against each side of the indicator.
// See docs/BEAROMETER_SUPPLY_CHAIN.md. Ticker lists are a starting point for
// review, not a vetted universe — edit here, scoring code does not change.
// ============================================================================

export type SupplyChainGroupId =
  | "rare-earth-magnets"
  | "gallium-germanium-chips"
  | "graphite-anodes"
  | "antimony-tungsten-defence"
  | "lithium-battery-chemicals"
  | "legacy-chips-discretes";

export interface WatchTicker {
  symbol: string;
  name: string;
}

export interface SupplyChainGroup {
  id: SupplyChainGroupId;
  label: string;
  materials: string;
  components: string;
  endUses: string;
  /** Any match tags the headline to this group. */
  patterns: RegExp[];
  /** Producers/refiners outside China — position tends to strengthen when Chinese supply tightens. */
  exChinaSupply: WatchTicker[];
  /** Buyers whose costs or availability suffer when Chinese supply tightens. */
  exposed: WatchTicker[];
}

export const SUPPLY_CHAIN_GROUPS: SupplyChainGroup[] = [
  {
    id: "rare-earth-magnets",
    label: "Rare earths → magnets",
    materials: "NdPr, dysprosium, terbium, samarium",
    components: "NdFeB permanent magnets",
    endUses: "EV motors, wind turbines, defence",
    patterns: [
      /\b(rare[- ]earths?|neodymium|ndpr|praseodymium|dysprosium|terbium|samarium|yttrium|lanthanum|cerium)\b/i,
      /\b(permanent magnets?|ndfeb|magnet exports?)\b/i,
    ],
    exChinaSupply: [
      { symbol: "MP", name: "MP Materials" },
      { symbol: "LYC.AX", name: "Lynas Rare Earths" },
      { symbol: "ILU.AX", name: "Iluka Resources" },
      { symbol: "NEO.TO", name: "Neo Performance Materials" },
      { symbol: "USAR", name: "USA Rare Earth" },
    ],
    exposed: [
      { symbol: "TSLA", name: "Tesla" },
      { symbol: "GM", name: "General Motors" },
      { symbol: "VWS.CO", name: "Vestas Wind" },
    ],
  },
  {
    id: "gallium-germanium-chips",
    label: "Gallium / germanium → chips",
    materials: "gallium, germanium",
    components: "GaN / GaAs RF and power chips, IR optics, fibre",
    endUses: "5G, radar, data centres",
    patterns: [
      /\b(gallium|germanium|gallium nitride|gallium arsenide)\b/i,
      /\b(GaN|GaAs)\b/,
    ],
    exChinaSupply: [
      { symbol: "UMI.BR", name: "Umicore" },
      { symbol: "TECK", name: "Teck Resources" },
      { symbol: "VNP.TO", name: "5N Plus" },
    ],
    exposed: [
      { symbol: "QRVO", name: "Qorvo" },
      { symbol: "SWKS", name: "Skyworks" },
      { symbol: "COHR", name: "Coherent" },
      { symbol: "AXTI", name: "AXT Inc (China-based substrate output)" },
    ],
  },
  {
    id: "graphite-anodes",
    label: "Graphite → battery anodes",
    materials: "natural and synthetic graphite",
    components: "anodes",
    endUses: "EV and grid batteries",
    patterns: [/\b(graphite|anode materials?|spherical graphite)\b/i],
    exChinaSupply: [
      { symbol: "SYR.AX", name: "Syrah Resources" },
      { symbol: "NVX", name: "Novonix" },
      { symbol: "NMG", name: "Nouveau Monde Graphite" },
      { symbol: "WWR", name: "Westwater Resources" },
    ],
    exposed: [
      { symbol: "TSLA", name: "Tesla" },
      { symbol: "6752.T", name: "Panasonic" },
      { symbol: "373220.KS", name: "LG Energy Solution" },
    ],
  },
  {
    id: "antimony-tungsten-defence",
    label: "Antimony / tungsten → defence",
    materials: "antimony, tungsten, superhard materials",
    components: "munitions, hard metals, flame retardants",
    endUses: "defence, tooling",
    patterns: [/\b(antimony|tungsten|superhard materials?)\b/i],
    exChinaSupply: [
      { symbol: "PPTA", name: "Perpetua Resources" },
      { symbol: "UAMY", name: "United States Antimony" },
      { symbol: "ALM", name: "Almonty Industries" },
    ],
    exposed: [
      { symbol: "GD", name: "General Dynamics" },
      { symbol: "RTX", name: "RTX" },
      { symbol: "LMT", name: "Lockheed Martin" },
    ],
  },
  {
    id: "lithium-battery-chemicals",
    label: "Lithium & battery chemicals",
    materials: "lithium, LFP cathode technology",
    components: "cathodes, cells",
    endUses: "EVs, grid storage",
    patterns: [
      /\b(lithium|lithium iron phosphate|battery cathodes?|cathode (?:materials?|technolog\w+))\b/i,
      /\bLFP\b/,
    ],
    exChinaSupply: [
      { symbol: "ALB", name: "Albemarle" },
      { symbol: "SQM", name: "SQM" },
      { symbol: "PLS.AX", name: "PLS (Pilbara Minerals)" },
      { symbol: "LAC", name: "Lithium Americas" },
    ],
    exposed: [
      { symbol: "TSLA", name: "Tesla" },
      { symbol: "373220.KS", name: "LG Energy Solution" },
    ],
  },
  {
    id: "legacy-chips-discretes",
    label: "Legacy chips & discretes",
    materials: "mature-node wafers, discrete transistors",
    components: "MOSFETs, diodes, transistors",
    endUses: "autos, industrial, PC builds",
    patterns: [
      /\b(nexperia|wingtech|legacy chips?|mature[- ]node|discrete (?:chips?|semiconductors?)|transistors?|mosfets?|power semiconductors?)\b/i,
    ],
    exChinaSupply: [
      { symbol: "ON", name: "onsemi" },
      { symbol: "VSH", name: "Vishay" },
      { symbol: "DIOD", name: "Diodes Inc" },
      { symbol: "STM", name: "STMicroelectronics" },
      { symbol: "IFX.DE", name: "Infineon" },
    ],
    exposed: [
      { symbol: "VOW3.DE", name: "Volkswagen" },
      { symbol: "F", name: "Ford" },
      { symbol: "DELL", name: "Dell" },
      { symbol: "600745.SS", name: "Wingtech (Nexperia parent)" },
    ],
  },
];

// ── Direction ─────────────────────────────────────────────────────────────

/** Explicit easing — wins even when the same headline names the control it eases. */
const EXPLICIT_EASING =
  /\b((?:suspend\w*|paus\w+|lift\w*|scrap\w*|drop\w*|roll\w* back|eas\w+|relax\w*)\s+(?:(?:the|its|some|new)\s+)?(?:rare[- ]earth\s+|export\s+)?(?:controls?|curbs?|restrictions?|bans?)|resum\w+\s+(?:[\w-]+\s+){0,3}(?:exports?|shipments?|supply)|(?:grant\w*|approv\w+|issu\w+)\s+(?:[\w-]+\s+){0,3}licen[cs]es?|general licen[cs]es?|exempt\w*|truce)\b/i;

const TIGHTENING =
  /\b(export (?:controls?|curbs?|restrictions?|bans?|licen[cs](?:e|es|ing))|restrict\w*|ban(?:s|ned)?|curb\w*|quotas? cuts?|cuts? (?:\w+ )?quotas?|suspend\w* (?:exports?|shipments?)|halt\w*|shortages?|harder to (?:get|obtain|source)|scarc\w+|price (?:rises?|hikes?|surges?|jumps?)|prices? (?:rise|rose|rising|surge\w*|jump\w*|soar\w*|spike\w*)|tighten\w*|crack\w* down|smuggl\w+|squeez\w+|weaponi[sz]\w+|chokehold)\b/i;

const WEAK_EASING =
  /\b(prices? (?:fall\w*|fell|drop\w*|slump\w*|plung\w+|slid\w*|tumbl\w+)|price (?:falls?|drops?|slumps?)|oversupply|glut)\b/i;

export type SupplyDirection = "tightening" | "easing" | "neutral";

export function classifyDirection(text: string): SupplyDirection {
  if (EXPLICIT_EASING.test(text)) return "easing";
  if (TIGHTENING.test(text)) return "tightening";
  if (WEAK_EASING.test(text)) return "easing";
  return "neutral";
}

export function tagGroups(text: string): SupplyChainGroupId[] {
  return SUPPLY_CHAIN_GROUPS.filter((group) =>
    group.patterns.some((pattern) => pattern.test(text)),
  ).map((group) => group.id);
}
