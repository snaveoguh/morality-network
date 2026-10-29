// ============================================================================
// TOPIC TAGS — the auto-tags behind the front page's Trending row and ?tag=
// filters. A story gets a tag when the headline names the topic, when the
// standfirst names it at least twice, or when the standfirst uses one of the
// tag's strong terms. Words match whole (no "who" for WHO, no "Solar System"
// for solar power); acronyms match case-sensitively.
// ============================================================================

interface TagRule {
  /** Whole-word, case-insensitive terms (regex source, no capture groups). */
  words: string[];
  /** Case-sensitive acronyms and names, e.g. "WHO", "AI". */
  exact?: string[];
  /** Terms specific enough that one mention in the standfirst is enough. */
  strong?: string[];
}

export const TAG_RULES: Record<string, TagRule> = {
  war: {
    words: [
      // not "culture war", "price war", "war of words"…
      "(?<!(?:culture|price|perps|cold|trade|voting|turf|bidding) )wars?(?! of words)",
      "wartime", "invasion", "invade[sd]?", "air ?strikes?", "missiles?", "bombing", "bombed", "shelling", "troops", "soldiers", "ceasefire", "truce", "frontline",
      "front lines?", "drone (?:strike|attack)s?", "battlefield",
      "armed forces", "armed conflict", "military", "militaries", "insurgents?",
    ],
    strong: ["air ?strikes?", "drone strikes?", "ceasefire", "shelling", "invasion", "frontline", "battlefield"],
  },
  election: {
    words: [
      "elections?", "electoral", "ballots?", "voters?", "voting", "polling (?:day|stations?)",
      "opinion polls?", "exit polls?", "candidates?", "caucus(?:es)?", "inaugurat\\w*", "runoff",
      "referendum", "midterms?", "by-?elections?", "primar(?:y|ies) (?:race|election|vote)",
      "electorate", "swing states?", "battleground (?:state|district)s?",
    ],
    strong: ["general election", "presidential election", "referendum", "midterm elections?"],
  },
  crypto: {
    words: [
      "crypto\\w*", "bitcoin", "ethereum", "ether", "blockchains?", "defi", "nfts?", "web3",
      "stablecoins?", "altcoins?", "solana", "airdrops?", "memecoins?", "on-?chain",
      "coinbase", "binance", "hyperliquid", "uniswap", "dex",
    ],
    exact: ["BTC", "ETH", "DAO", "SOL", "XRP", "USDT", "USDC"],
    strong: ["bitcoin", "ethereum", "stablecoins?", "blockchains?", "crypto(?:currency|currencies)"],
  },
  climate: {
    words: [
      "climate", "global (?:warming|heating)", "carbon (?:emissions|dioxide|capture|storage|tax|budget|credits?|neutral)",
      "low-carbon", "decarboni[sz]\\w*", "emissions", "greenhouse", "sea levels?", "net.?zero",
      "paris agreement", "fossil fuels?", "methane", "heatwaves?", "el ni[nñ]o", "ice sheets?",
      "sea ice", "glaciers?", "cop\\d\\d", "ipcc", "renewables?", "clean (?:energy|tech)",
    ],
    strong: ["climate change", "global (?:warming|heating)", "greenhouse gas(?:es)?"],
  },
  ai: {
    words: [
      "artificial intelligence", "machine learning", "deep learning", "llms?", "chatgpt", "openai",
      "anthropic", "gemini", "deepmind", "mistral", "neural net\\w*", "generative ai",
      "large language models?", "chatbots?", "ai (?:agents?|models?|chips?)", "gpus?",
    ],
    exact: ["AI", "A\\.I\\.", "AGI"],
    strong: ["artificial intelligence", "large language models?", "generative ai", "chatgpt", "openai"],
  },
  trade: {
    words: [
      "tariffs?", "trade (?:war|deal|deficit|surplus|talks|spat|dispute|barriers?|agreement|pact)s?",
      "free trade", "protectionism", "embargo(?:es)?", "exports?", "imports?", "export (?:ban|controls?)",
      "customs (?:duties|union)",
    ],
    exact: ["WTO"],
  },
  health: {
    words: [
      "health", "healthcare", "health care", "public health", "mental health", "pandemics?",
      "epidemics?", "vaccin\\w*", "covid(?:-19)?", "coronavirus", "virus(?:es)?", "outbreaks?",
      "diseases?", "ebola", "measles", "mpox", "cholera", "malaria", "tuberculosis", "flu", "influenza",
      "cancers?", "dementia", "alzheimer'?s", "diabetes", "obesity", "clinical trials?", "pharma\\w*",
      "drugmakers?", "medicines?", "patients?",
      "world health organi[sz]ation", "peptides?", "overdoses?",
    ],
    exact: ["WHO", "FDA", "CDC", "NHS", "HHS", "CTE"],
    strong: ["public health", "ebola", "measles", "pandemic", "vaccines?", "world health organi[sz]ation"],
  },
  scandal: {
    words: [
      "scandals?", "corrupt(?:ion)?", "(?<!cry |election |voter )fraud\\w*(?! claims)", "brib\\w*", "kickbacks?", "indict\\w*", "cover-?ups?",
      "whistle-?blow\\w*", "misconduct", "impeach\\w*", "embezzl\\w*", "money laundering", "laundering",
      "graft", "ethics (?:probe|complaint|violations?)",
    ],
  },
  economy: {
    words: [
      "econom(?:y|ies)", "economic (?:growth|data|outlook|crisis|slowdown)", "economists?", "inflation",
      "recession", "interest rates?", "rate (?:cut|hike)s?", "federal reserve", "central banks?",
      "unemployment", "jobs report", "jobless", "stock markets?", "bond yields?",
      "consumer spending", "cost[- ]of[- ]living", "budget deficit", "national debt",
    ],
    exact: ["GDP", "ECB", "Fed", "IMF", "CPI"],
  },
  energy: {
    words: [
      "(?<!palm |olive |cooking |vegetable )oil (?:prices?|companies|company|firms?|majors|output|production|exports?|drilling|fields?|tankers?|and gas)",
      "big oil", "crude", "opec\\+?", "natural gas", "gas (?:prices|pipeline|supplies|supply)",
      "nuclear (?:power|plant|energy|reactors?)", "solar (?:power|panels?|farms?|energy|projects?)",
      "big solar", "wind (?:farms?|power|turbines?)", "(?<!palm )(?:oil|gas) pipelines?", "energy (?:crisis|bills?|prices?|security|policy)",
      "electricity", "power grid", "electric grid", "the grid", "petroleum", "refiner(?:y|ies)",
      "drilling", "fracking", "power plants?",
    ],
    exact: ["LNG"],
  },
  rights: {
    words: [
      "human rights", "civil rights", "voting rights", "trans rights", "civil liberties", "protests?",
      "protesters?", "censorship", "press freedom", "free speech", "asylum", "refugees?", "migrants?",
      "deportations?", "discriminat\\w*", "lgbtq\\+?", "abortion", "political prisoners?",
      "jailed (?:activist|journalist)s?",
    ],
  },
  security: {
    words: [
      "cybersecurity", "cyber-?attacks?", "hack(?:ed|ers?|ing)", "data breach(?:es)?", "security breach(?:es)?",
      "ransomware", "surveillance", "espionage", "spy", "spies", "spying", "intelligence (?:agency|agencies|services?|chief|officials?|officers?)",
      "terror\\w*", "extremis\\w*", "radicali[sz]\\w*", "counter-?terror\\w*",
    ],
    exact: ["NATO", "MI5", "MI6", "CIA", "NSA"],
  },
  nature: {
    words: [
      "biodiversity", "species", "wildlife", "conservation(?:ists?)?", "deforestation", "reforestation",
      "forests?", "coral reefs?", "rainforests?", "endangered", "habitats?", "oceans?", "marine (?:life|protected|reserve|ecosystems?)",
      "pollution", "plastics?", "insects?", "birds?", "rewilding", "extinction",
    ],
  },
};

const wordRe = (terms: string[], flags: string) => new RegExp(`\\b(?:${terms.join("|")})\\b`, flags);

/** Regexes per tag: `g` flag so we can count hits in the standfirst. */
const COMPILED = Object.entries(TAG_RULES).map(([tag, rule]) => ({
  tag,
  terms: [wordRe(rule.words, "gi"), ...(rule.exact?.length ? [wordRe(rule.exact, "g")] : [])],
  strong: rule.strong?.length ? wordRe(rule.strong, "i") : null,
}));

function countHits(res: RegExp[], text: string): number {
  let n = 0;
  for (const re of res) n += text.match(re)?.length ?? 0;
  return n;
}

/** Topic tags for a story: named in the headline, twice in the standfirst,
 *  or once there by a strong term. */
export function assignTopicTags(title: string, description = ""): string[] {
  return COMPILED.filter(
    ({ terms, strong }) =>
      countHits(terms, title) > 0 || countHits(terms, description) >= 2 || (strong?.test(description) ?? false),
  ).map(({ tag }) => tag);
}
