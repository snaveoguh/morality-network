// ============================================================================
// BEAROMETER — GLOBAL SUPPLY-CHAIN TAXONOMY
// Regions, the indicators shown under each, where each number comes from, and
// which Bearometer assets it plausibly bears on. Pure data: no fetching.
// See docs/BEAROMETER_SUPPLY_CHAIN.md ("Global layer").
//
// Sign convention, shared with the China layer: pressure > 0 means supply is
// more strained (dearer, slower, disrupted or weaker output), < 0 means it is
// easing. `polarity` says which way the raw number points: +1 when a rise
// means strain (prices, freight), −1 when a rise means relief (transits,
// stocks, business confidence).
//
// Asset links are read-across, not findings. `strength` says how much weight
// the link can bear: "documented" (a well-known, widely reported channel,
// e.g. oil supply → oil price), "plausible" (a common market narrative with
// a clear mechanism) or "speculative" (an indirect route through inflation or
// risk appetite, nothing more). None of them has been backtested here.
// ============================================================================

export type RegionId =
  | "global"
  | "middle-east"
  | "europe"
  | "americas"
  | "east-asia"
  | "south-southeast-asia"
  | "africa"
  | "black-sea";

export interface Region {
  id: RegionId;
  label: string;
  /** What the region section covers, for the panel. */
  covers: string;
}

export const REGIONS: Region[] = [
  { id: "global", label: "Global shipping and food", covers: "dry-bulk and tanker freight, world food prices, port strikes" },
  { id: "middle-east", label: "Middle East and Red Sea", covers: "Hormuz, Bab el-Mandeb, Suez, crude oil, OPEC+" },
  { id: "europe", label: "Europe", covers: "gas prices, factory confidence, chip-tool export controls" },
  { id: "americas", label: "Americas", covers: "Panama Canal, US oil reserve, US gas, factory confidence, lithium" },
  { id: "east-asia", label: "East Asia", covers: "Taiwan and Korea straits, chips, factory confidence" },
  { id: "south-southeast-asia", label: "South and Southeast Asia", covers: "Malacca Strait, India, Indonesia, Vietnam" },
  { id: "africa", label: "Africa", covers: "Cape of Good Hope rerouting, DRC cobalt and copper" },
  { id: "black-sea", label: "Black Sea", covers: "Bosporus transits, wheat, Black Sea grain and fertiliser" },
];

// ── Assets ────────────────────────────────────────────────────────────────

/** Engine symbols, as `getAggregatedMarketSignals` emits them, so readings can be joined later. */
export type BearometerAsset =
  | "BTC"
  | "ETH"
  | "SOL"
  | "PAXG"
  | "DXY"
  | "SPX"
  | "OIL"
  | "xyz:NVDA"
  | "xyz:AAPL"
  | "xyz:TSLA";

export const ASSET_LABEL: Record<BearometerAsset, string> = {
  BTC: "BTC",
  ETH: "ETH",
  SOL: "SOL",
  PAXG: "Gold",
  DXY: "DXY",
  SPX: "S&P 500",
  OIL: "Oil",
  "xyz:NVDA": "NVDA",
  "xyz:AAPL": "AAPL",
  "xyz:TSLA": "TSLA",
};

export type LinkStrength = "documented" | "plausible" | "speculative";

export interface AssetLink {
  asset: BearometerAsset;
  /** Direction the asset has tended to move when this indicator shows strain. */
  whenStrained: "up" | "down";
  strength: LinkStrength;
}

// Shared read-across sets, so one judgement is not restated a dozen ways.
const OIL_SHOCK: AssetLink[] = [
  { asset: "OIL", whenStrained: "up", strength: "documented" },
  { asset: "SPX", whenStrained: "down", strength: "plausible" },
  { asset: "PAXG", whenStrained: "up", strength: "plausible" },
  { asset: "BTC", whenStrained: "down", strength: "speculative" },
];
const GOODS_INFLATION: AssetLink[] = [
  { asset: "SPX", whenStrained: "down", strength: "plausible" },
  { asset: "PAXG", whenStrained: "up", strength: "speculative" },
  { asset: "DXY", whenStrained: "up", strength: "speculative" },
];
const CHIP_SUPPLY: AssetLink[] = [
  { asset: "xyz:NVDA", whenStrained: "down", strength: "plausible" },
  { asset: "xyz:AAPL", whenStrained: "down", strength: "plausible" },
  { asset: "SPX", whenStrained: "down", strength: "plausible" },
];
const FACTORY_CYCLE: AssetLink[] = [
  { asset: "SPX", whenStrained: "down", strength: "plausible" },
  { asset: "OIL", whenStrained: "down", strength: "plausible" },
  { asset: "ETH", whenStrained: "down", strength: "speculative" },
  { asset: "SOL", whenStrained: "down", strength: "speculative" },
];
const BATTERY_METALS: AssetLink[] = [
  { asset: "xyz:TSLA", whenStrained: "down", strength: "plausible" },
  { asset: "SPX", whenStrained: "down", strength: "speculative" },
];

// ── Data indicators ───────────────────────────────────────────────────────

/**
 * How the headline number is compared.
 * - pct-vs-mean: latest value against the mean of the `window` points before it.
 * - pct-vs-first: last point against the first (fetcher supplies exactly the
 *   two points to compare, e.g. a recent average and the same window a year earlier).
 * - pct-vs-lag: latest against the point `lag` steps earlier (monthly a year: 12).
 * - level-vs: latest minus a fixed reference (OECD confidence: long-run mean 100).
 * `versus` is the plain-English baseline shown on the panel.
 * `scale` is the change that maps to pressure tanh(1) ≈ 0.76; it is set per
 * indicator to that series' usual swing so a normal month reads as steady.
 */
export type Comparison =
  | { kind: "pct-vs-mean"; window: number; scale: number; versus: string }
  | { kind: "pct-vs-first"; scale: number; versus: string }
  | { kind: "pct-vs-lag"; lag: number; scale: number; versus: string }
  | { kind: "level-vs"; reference: number; scale: number; versus: string };

export type DataSource =
  | { kind: "yahoo"; symbol: string }
  | { kind: "portwatch"; portid: string }
  | { kind: "oecd-bci"; area: string }
  | { kind: "fao-ffpi" }
  | { kind: "eia-spr" };

export interface DataIndicatorDef {
  id: string;
  region: RegionId;
  label: string;
  measures: string;
  unit: string;
  source: DataSource;
  /** Human-readable source and the URL a reader can check. */
  sourceName: string;
  sourceUrl: string;
  polarity: 1 | -1;
  compare: Comparison;
  /** Older readings are shown but left out of the region score. */
  maxAgeDays: number;
  why: string;
  assets: AssetLink[];
}

const yahoo = (symbol: string) => ({
  source: { kind: "yahoo", symbol } as const,
  sourceName: "Yahoo Finance daily close",
  sourceUrl: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`,
  maxAgeDays: 7,
  compare: { kind: "pct-vs-mean", window: 63, scale: 0.2, versus: "3-month average" } as const,
});

const PORTWATCH_URL = "https://portwatch.imf.org/pages/chokepoints";
const portwatch = (portid: string) => ({
  source: { kind: "portwatch", portid } as const,
  sourceName: "IMF PortWatch daily transits",
  sourceUrl: PORTWATCH_URL,
  unit: "ships/day",
  maxAgeDays: 14,
  // Last 14 days against the same 14 days a year earlier (seasonality-aware).
  compare: { kind: "pct-vs-first", scale: 0.25, versus: "same 14 days a year earlier" } as const,
});

const OECD_URL = "https://data-explorer.oecd.org/?df[ds]=dsDisseminateFinalDMZ&df[id]=DSD_STES%40DF_CLI&df[ag]=OECD.SDD.STES";
const oecd = (area: string) => ({
  source: { kind: "oecd-bci", area } as const,
  sourceName: "OECD business tendency surveys",
  sourceUrl: OECD_URL,
  unit: "index",
  polarity: -1 as const,
  // Monthly and published with a lag of one to two months.
  maxAgeDays: 120,
  compare: { kind: "level-vs", reference: 100, scale: 1.5, versus: "long-run average of 100" } as const,
});

export const DATA_INDICATORS: DataIndicatorDef[] = [
  // Global
  {
    id: "dry-bulk-freight",
    region: "global",
    label: "Dry-bulk freight",
    measures: "Breakwave Dry Bulk Shipping ETF (BDRY), which holds Baltic dry-bulk freight futures",
    unit: "USD",
    ...yahoo("BDRY"),
    polarity: 1,
    compare: { kind: "pct-vs-mean", window: 63, scale: 0.3, versus: "3-month average" },
    why: "Iron ore, coal and grain move on dry-bulk ships; dearer freight feeds into raw-material costs.",
    assets: GOODS_INFLATION,
  },
  {
    id: "tanker-freight",
    region: "global",
    label: "Tanker freight",
    measures: "Breakwave Tanker Shipping ETF (BWET), which holds crude and product tanker freight futures",
    unit: "USD",
    ...yahoo("BWET"),
    polarity: 1,
    compare: { kind: "pct-vs-mean", window: 63, scale: 0.3, versus: "3-month average" },
    why: "Tanker rates rise when oil has to travel further or ships avoid a route; it adds to delivered fuel costs.",
    assets: OIL_SHOCK,
  },
  {
    id: "fao-food-price-index",
    region: "global",
    label: "World food prices",
    measures: "FAO Food Price Index (2014–16 = 100), compared with a year earlier",
    unit: "index",
    source: { kind: "fao-ffpi" },
    sourceName: "UN FAO",
    sourceUrl: "https://www.fao.org/worldfoodsituation/foodpricesindex/en/",
    polarity: 1,
    maxAgeDays: 75,
    compare: { kind: "pct-vs-lag", lag: 12, scale: 0.1, versus: "a year earlier" },
    why: "Food is a large share of consumer prices outside the rich world, so it moves inflation and rate expectations.",
    assets: GOODS_INFLATION,
  },
  // Middle East and Red Sea
  {
    id: "hormuz-transits",
    region: "middle-east",
    label: "Strait of Hormuz transits",
    measures: "Ships per day through the Strait of Hormuz, last 14 days against the same days a year earlier",
    ...portwatch("chokepoint6"),
    polarity: -1,
    why: "About a fifth of world oil and much Gulf LNG passes Hormuz; fewer transits means less supply reaching buyers.",
    assets: OIL_SHOCK,
  },
  {
    id: "bab-el-mandeb-transits",
    region: "middle-east",
    label: "Bab el-Mandeb transits",
    measures: "Ships per day through the southern mouth of the Red Sea, against a year earlier",
    ...portwatch("chokepoint4"),
    polarity: -1,
    why: "Ships avoiding the Red Sea sail round Africa instead, adding one to two weeks and fuel to Asia–Europe trips.",
    assets: GOODS_INFLATION,
  },
  {
    id: "suez-transits",
    region: "middle-east",
    label: "Suez Canal transits",
    measures: "Ships per day through the Suez Canal, against a year earlier",
    ...portwatch("chokepoint1"),
    polarity: -1,
    why: "Suez is the short route between Asia and Europe for containers and oil products.",
    assets: GOODS_INFLATION,
  },
  {
    id: "brent-crude",
    region: "middle-east",
    label: "Brent crude",
    measures: "Brent front-month futures (BZ=F)",
    unit: "USD/bbl",
    ...yahoo("BZ=F"),
    polarity: 1,
    why: "The world oil benchmark; Gulf supply and OPEC+ output decisions show up here first.",
    assets: OIL_SHOCK,
  },
  // Europe
  {
    id: "ttf-gas",
    region: "europe",
    label: "European gas (TTF)",
    measures: "Dutch TTF natural gas futures (TTF=F)",
    unit: "EUR/MWh",
    ...yahoo("TTF=F"),
    polarity: 1,
    compare: { kind: "pct-vs-mean", window: 63, scale: 0.3, versus: "3-month average" },
    why: "Gas sets power prices for much of Europe and is a direct input for fertiliser, chemicals and glass.",
    assets: [
      { asset: "SPX", whenStrained: "down", strength: "speculative" },
      { asset: "DXY", whenStrained: "up", strength: "plausible" },
      { asset: "PAXG", whenStrained: "up", strength: "speculative" },
    ],
  },
  { id: "bci-euro-area", region: "europe", label: "Euro area factory confidence", measures: "Manufacturing confidence, euro area (amplitude-adjusted)", ...oecd("EA20"), why: "A survey of manufacturers' output and orders; below 100 means weaker than usual.", assets: FACTORY_CYCLE },
  { id: "bci-germany", region: "europe", label: "Germany factory confidence", measures: "Manufacturing confidence, Germany (amplitude-adjusted)", ...oecd("DEU"), why: "Germany is Europe's largest manufacturer and a big buyer of Asian parts.", assets: FACTORY_CYCLE },
  // Americas
  {
    id: "panama-transits",
    region: "americas",
    label: "Panama Canal transits",
    measures: "Ships per day through the Panama Canal, against a year earlier",
    ...portwatch("chokepoint2"),
    polarity: -1,
    why: "Low water in Gatun Lake has cut transits before; US Gulf grain and LNG to Asia rely on the canal.",
    assets: GOODS_INFLATION,
  },
  {
    id: "us-spr",
    region: "americas",
    label: "US Strategic Petroleum Reserve",
    measures: "Weekly crude stocks in the SPR, against 13 weeks earlier",
    unit: "million bbl",
    source: { kind: "eia-spr" },
    sourceName: "US EIA weekly petroleum status",
    sourceUrl: "https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=WCSSTUS1&f=W",
    polarity: -1,
    maxAgeDays: 21,
    compare: { kind: "pct-vs-lag", lag: 13, scale: 0.03, versus: "13 weeks earlier" },
    why: "Drawing the reserve adds supply now but leaves less cushion for the next shock.",
    assets: OIL_SHOCK,
  },
  {
    id: "henry-hub-gas",
    region: "americas",
    label: "US natural gas",
    measures: "Henry Hub natural gas futures (NG=F)",
    unit: "USD/MMBtu",
    ...yahoo("NG=F"),
    polarity: 1,
    compare: { kind: "pct-vs-mean", window: 63, scale: 0.3, versus: "3-month average" },
    why: "US gas feeds power, fertiliser and LNG exports to Europe and Asia.",
    assets: [{ asset: "SPX", whenStrained: "down", strength: "speculative" }],
  },
  { id: "bci-us", region: "americas", label: "US factory confidence", measures: "Manufacturing confidence, United States (amplitude-adjusted)", ...oecd("USA"), why: "Stands in for the ISM manufacturing PMI, which is not free to republish.", assets: FACTORY_CYCLE },
  { id: "bci-mexico", region: "americas", label: "Mexico factory confidence", measures: "Manufacturing confidence, Mexico (amplitude-adjusted)", ...oecd("MEX"), why: "Mexico is the largest source of US imports and a near-shoring hub for autos and electronics.", assets: FACTORY_CYCLE },
  {
    id: "lithium-equities",
    region: "americas",
    label: "Lithium producers",
    measures: "Global X Lithium & Battery Tech ETF (LIT), a stand-in for lithium prices (Chile, Argentina, Australia)",
    unit: "USD",
    ...yahoo("LIT"),
    // A falling LIT reads as lithium easing for buyers, not strain.
    polarity: 1,
    compare: { kind: "pct-vs-mean", window: 63, scale: 0.25, versus: "3-month average" },
    why: "Free lithium spot prices are not published; producer shares are a rough proxy for what cell makers pay.",
    assets: BATTERY_METALS,
  },
  // East Asia
  {
    id: "taiwan-strait-transits",
    region: "east-asia",
    label: "Taiwan Strait transits",
    measures: "Ships per day through the Taiwan Strait, against a year earlier",
    ...portwatch("chokepoint11"),
    polarity: -1,
    why: "Main route between north-east Asia and the South China Sea, and the sea lane round Taiwan's chip plants.",
    assets: CHIP_SUPPLY,
  },
  {
    id: "korea-strait-transits",
    region: "east-asia",
    label: "Korea Strait transits",
    measures: "Ships per day through the Korea Strait, against a year earlier",
    ...portwatch("chokepoint12"),
    polarity: -1,
    why: "Carries Korean and Japanese exports, including memory chips, cars and steel.",
    assets: GOODS_INFLATION,
  },
  { id: "bci-china", region: "east-asia", label: "China factory confidence", measures: "Manufacturing confidence, China (amplitude-adjusted)", ...oecd("CHN"), why: "China makes about a third of the world's manufactured goods.", assets: FACTORY_CYCLE },
  { id: "bci-japan", region: "east-asia", label: "Japan factory confidence", measures: "Manufacturing confidence, Japan (amplitude-adjusted)", ...oecd("JPN"), why: "Japan supplies chip materials, machine tools and car parts.", assets: FACTORY_CYCLE },
  { id: "bci-korea", region: "east-asia", label: "South Korea factory confidence", measures: "Manufacturing confidence, South Korea (amplitude-adjusted)", ...oecd("KOR"), why: "Korea's factories make most of the world's memory chips.", assets: CHIP_SUPPLY },
  // South and Southeast Asia
  {
    id: "malacca-transits",
    region: "south-southeast-asia",
    label: "Malacca Strait transits",
    measures: "Ships per day through the Strait of Malacca, against a year earlier",
    ...portwatch("chokepoint5"),
    polarity: -1,
    why: "The busiest strait for trade between the Gulf, India and East Asia, including most Chinese oil imports.",
    assets: OIL_SHOCK,
  },
  { id: "bci-india", region: "south-southeast-asia", label: "India factory confidence", measures: "Manufacturing confidence, India (amplitude-adjusted)", ...oecd("IND"), why: "India is a growing source of phones, generic drugs and textiles. OECD updates it irregularly.", assets: FACTORY_CYCLE },
  // Africa
  {
    id: "cape-transits",
    region: "africa",
    label: "Cape of Good Hope transits",
    measures: "Ships per day round the Cape, against a year earlier; a rise means ships are avoiding the Red Sea",
    ...portwatch("chokepoint7"),
    polarity: 1,
    why: "More traffic round the Cape means longer voyages and fewer ships free for other routes.",
    assets: GOODS_INFLATION,
  },
  {
    id: "copper",
    region: "africa",
    label: "Copper",
    measures: "COMEX copper futures (HG=F); DRC and Zambia mine about a sixth of world output",
    unit: "USD/lb",
    ...yahoo("HG=F"),
    polarity: 1,
    why: "Copper goes into wiring, motors and grids; supply cuts in the DRC, Chile or Peru show up in price.",
    assets: [
      { asset: "SPX", whenStrained: "down", strength: "speculative" },
      { asset: "xyz:TSLA", whenStrained: "down", strength: "speculative" },
    ],
  },
  // Black Sea
  {
    id: "bosporus-transits",
    region: "black-sea",
    label: "Bosporus transits",
    measures: "Ships per day through the Bosporus, against a year earlier",
    ...portwatch("chokepoint3"),
    polarity: -1,
    why: "Ukrainian and Russian grain, fertiliser and oil leave the Black Sea through the Bosporus.",
    assets: GOODS_INFLATION,
  },
  {
    id: "wheat",
    region: "black-sea",
    label: "Wheat",
    measures: "CBOT wheat futures (ZW=F)",
    unit: "USc/bu",
    ...yahoo("ZW=F"),
    polarity: 1,
    why: "Russia and Ukraine together export about a quarter of the world's wheat.",
    assets: GOODS_INFLATION,
  },
];

// ── News indicators ───────────────────────────────────────────────────────

export interface NewsIndicatorDef {
  id: string;
  region: RegionId;
  label: string;
  /** Google News query; the sweep window is added by the sources module. */
  query: string;
  /** A headline must match one of these to count (drops off-topic hits). */
  patterns: RegExp[];
  why: string;
  assets: AssetLink[];
}

export const NEWS_INDICATORS: NewsIndicatorDef[] = [
  {
    id: "ports-and-freight-news",
    region: "global",
    label: "Ports, strikes and freight",
    query: '("port strike" OR dockworkers OR "port closure" OR "container rates" OR "freight rates" OR "shipping disruption")',
    patterns: [/\b(ports?|dock\w*|container\w*|freight|shipping|vessels?|longshore\w*)\b/i],
    why: "Port closures and strikes delay goods for weeks and push up spot container rates.",
    assets: GOODS_INFLATION,
  },
  {
    id: "red-sea-gulf-news",
    region: "middle-east",
    label: "Red Sea, Hormuz and OPEC+",
    query: '("Red Sea" OR Houthi OR "Strait of Hormuz" OR "Bab el-Mandeb" OR OPEC) (shipping OR tankers OR oil OR output)',
    patterns: [/\b(red sea|houthis?|hormuz|bab el-mandeb|suez|opec\+?|tankers?|crude|oil output)\b/i],
    why: "Attacks, seizures and OPEC+ quota decisions move oil supply within days.",
    assets: OIL_SHOCK,
  },
  {
    id: "europe-chip-tools-news",
    region: "europe",
    label: "Chip tools and EU trade measures",
    query: '(ASML OR "Dutch export" OR "EU export controls" OR "EU tariffs") (chips OR semiconductor OR China)',
    patterns: [/\b(asml|lithography|export controls?|semiconductors?|chips?|tariffs?)\b/i],
    why: "ASML is the only maker of EUV lithography tools; Dutch licence rules decide who can build leading chips.",
    assets: CHIP_SUPPLY,
  },
  {
    id: "americas-news",
    region: "americas",
    label: "Panama, US energy and lithium",
    query: '("Panama Canal" OR "Strategic Petroleum Reserve" OR "lithium" OR "Gulf Coast refinery") (supply OR drought OR shipping OR output OR export)',
    patterns: [/\b(panama canal|strategic petroleum reserve|spr|lithium|refiner(?:y|ies)|gulf coast|chile|argentina)\b/i],
    why: "Canal water levels, refinery outages and lithium policy in Chile and Argentina reach US prices quickly.",
    assets: [...OIL_SHOCK.slice(0, 2), ...BATTERY_METALS.slice(0, 1)],
  },
  {
    id: "taiwan-korea-chips-news",
    region: "east-asia",
    label: "Taiwan and Korea chips",
    query: '(TSMC OR "Taiwan Strait" OR Samsung OR "SK Hynix" OR "memory chips") (supply OR export OR shortage OR blockade OR drills)',
    patterns: [/\b(tsmc|taiwan|samsung|sk hynix|hynix|memory chips?|dram|hbm|semiconductors?|chips?)\b/i],
    why: "Taiwan makes most leading-edge chips and Korea most memory; drills, quakes and export rules hit supply.",
    assets: CHIP_SUPPLY,
  },
  {
    id: "south-southeast-asia-news",
    region: "south-southeast-asia",
    label: "India, Indonesia and Vietnam",
    query: '(India OR Indonesia OR Vietnam OR Malacca) ("export ban" OR "export curbs" OR "port" OR "factory" OR nickel OR rice) supply',
    patterns: [/\b(india\w*|indonesia\w*|vietnam\w*|malacca|nickel|rice|palm oil)\b/i],
    why: "Export bans on rice, nickel or palm oil from these countries have moved world prices before.",
    assets: GOODS_INFLATION,
  },
  {
    id: "africa-minerals-news",
    region: "africa",
    label: "DRC cobalt and African mining",
    query: '(Congo OR DRC OR Zambia OR "South Africa") (cobalt OR copper OR platinum OR manganese) (export OR supply OR ban OR quota)',
    patterns: [/\b(congo\w*|drc|zambia\w*|south africa\w*|cobalt|copper|platinum|manganese)\b/i],
    why: "The DRC mines about three-quarters of the world's cobalt; its export bans and quotas reach battery makers.",
    assets: BATTERY_METALS,
  },
  {
    id: "black-sea-news",
    region: "black-sea",
    label: "Black Sea grain and fertiliser",
    query: '("Black Sea" OR Ukraine OR Russia OR Odesa) (grain OR wheat OR fertiliser OR fertilizer OR port) (exports OR shipping OR attack)',
    patterns: [/\b(black sea|ukrain\w*|russia\w*|odesa|odessa|grain|wheat|fertili[sz]ers?|ammonia|urea)\b/i],
    why: "Strikes on Odesa ports or Russian export quotas change how much grain and fertiliser reaches the market.",
    assets: GOODS_INFLATION,
  },
];

// ── News direction ────────────────────────────────────────────────────────
// Deterministic regex, same approach as the China layer. Easing wins only
// when it is explicit and not a request ("urges reopening" is not a reopening).

const EASING =
  /\b(reopen\w*|resum\w+|restor\w+|ceasefire|truce|deal (?:to|on) (?:reopen|resume|restore)|lift\w* (?:the |its )?(?:ban|curbs?|sanctions?|blockade|restrictions?)|eas\w+ (?:the |its )?(?:ban|curbs?|sanctions?|restrictions?)|ends? (?:the |its )?(?:strike|blockade|ban)|strike (?:ends?|ended|called off)|back to normal|surplus|glut|oversupply|congestion eas\w+|rates? (?:fall|falls|fell|drop\w*|slump\w*|eas\w+)|prices? (?:fall|falls|fell|drop\w*|slump\w*|eas\w+))\b/i;

const REQUESTED =
  /\b(?:urg\w+|call\w* (?:for|on)|ask\w*|press\w*|seek\w*|demand\w*|push\w* for)\s+(?:[\w'-]+\s+){0,6}(?:to\s+)?(?:reopen\w*|resum\w+|restor\w+|lift\w*|eas\w+|end)\b/i;

const DISRUPTION =
  /\b(strikes?|walkouts?|blockades?|clos(?:e|es|ed|ure|ures|ing)|shut\w*|halt\w*|suspend\w*|attack\w*|seiz\w+|hijack\w*|missiles?|drone (?:strikes?|attacks?)|sanction\w*|embargo\w*|(?:export|import) (?:bans?|curbs?|controls?|quotas?)|bans?|curbs?|restrict\w*|tariffs?|shortages?|outages?|disrupt\w*|divert\w*|rerout\w*|delays?|congest\w*|drought|low water|cuts? (?:output|production|supply)|output cuts?|quotas? bite|(?:output|production|exports?|shipments?) (?:halv\w+|sinks?|sank|falls?|fell|drops?|dropped|plung\w+|slump\w*)|rates? (?:rise|rises|rose|jump\w*|surge\w*|soar\w*|spike\w*|climb\w*)|prices? (?:rise|rises|rose|jump\w*|surge\w*|soar\w*|spike\w*|climb\w*)|drills?)\b/i;

export type DisruptionDirection = "disrupting" | "easing" | "neutral";

export function classifyDisruption(text: string): DisruptionDirection {
  if (EASING.test(text) && !REQUESTED.test(text)) return "easing";
  if (DISRUPTION.test(text)) return "disrupting";
  return "neutral";
}
