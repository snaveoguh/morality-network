// ============================================================================
// POLITICS SLIDER — picks the stories for the image slider at the top of the
// home page (components/feed/PoliticsSlider.tsx).
//
// Strictly politics: UK politics, or global politics that is relevant to the
// UK (Hugo, 2026-10-31). An item qualifies when it has a usable image and:
//
//   1. it names a UK political actor or institution (parties, Westminster,
//      Downing Street, the devolved parliaments, current and recent
//      ministers), or
//   2. it is from a UK outlet's politics section, or
//   3. it names the UK (UK, Britain, NHS, ...) alongside a politics word
//      (government, minister, election, sanctions, ...), or
//   4. it is world or politics news on a topic the UK is party to: Ukraine
//      and Russia, NATO, the EU, the US administration's foreign and trade
//      policy, the G7/G20 and UN, Israel and Gaza, Iran, China and Taiwan.
//
// Never: crypto and markets (front-filter.ts), sport, celebrity, crime with
// no political angle, Reddit/4chan scrapes, state-media outlets (the slider
// has no room for the bias label those carry everywhere else).
//
// Near-identical headlines are clustered (impact.ts) and each cluster shows
// once, ranked by the ticker's impact score (coverage x recency x source)
// with a lift for UK stories.
//
// Pure: no I/O, safe on the server and in client components.
// ============================================================================

import type { FeedItem } from "./rss";
import { getSourceTier } from "./rss";
import { clusterItems, scoreCluster, tickerHeadline } from "./impact";
import { computeEntityHash } from "./entity";
import { isMarketStory } from "./front-filter";
import { biasWords } from "./front";

export const SLIDER_MIN = 3;
export const SLIDER_MAX = 6;
/** First pass window; widened once if it yields fewer than SLIDER_MIN. */
const MAX_AGE_H = 36;
const WIDE_AGE_H = 96;
const UK_ACTOR_BOOST = 1.6;
const UK_PLACE_BOOST = 1.3;

export interface Slide {
  id: string;
  headline: string;
  href: string;
  imageUrl: string;
  source: string;
  /** Rated bias in plain words ("Lean left"), or null when unrated. */
  bias: string | null;
  pubDate: string;
}

// ── Signals ─────────────────────────────────────────────────────────────────

// UK political actors and institutions that only exist in UK politics.
// Case-sensitive where the word is common in lower case ("labour market").
const UK_ACTORS_CS =
  /\b(Labour|Tor(y|ies)|Lib ?Dems?|Liberal Democrats?|SNP|Plaid Cymru|Reform UK|Green Party|DUP|Sinn F[eé]in|House of Commons|House of Lords|Whitehall|Westminster|Holyrood|Senedd|Stormont|No ?10|Number 10|Downing Street|Home Office|Foreign Office|FCDO|Cabinet Office|Ofsted|Ofgem|Ofcom|PMQs|Hansard|Autumn Budget|Spring Statement)\b/;

// Words that are UK politics only in a UK context: US outlets title-case
// "Conservatives", and the US has a Treasury too. They count when the item
// is from a UK outlet or names the UK.
const UK_ACTORS_CONTEXT =
  /\b(Conservatives?|Reform|Commons|Lords|Treasury|Greens|Budget|MPs?|Chancellor|Home Secretary|Foreign Secretary|Prime Minister|peers?)\b/;

// Current and recent UK politicians, checked against the live feed on
// 2026-10-30 (PM Andy Burnham, Chancellor John Healey, Foreign Secretary
// Ed Miliband). Surnames only where they are distinctive in a news feed.
const UK_POLITICIANS =
  /\b(Burnham|Starmer|Healey|Miliband|Rachel Reeves|Badenoch|Farage|Ed Davey|Swinney|Streeting|Rayner|Lammy|Shabana Mahmood|Yvette Cooper|Jenrick|Polanski|Sarwar|Eluned Morgan|Rhun ap Iorwerth|Michelle O'Neill|Sunak|Boris Johnson|Liz Truss)\b/i;

const UK_PLACE =
  /\b(UK|U\.K\.|Britain|British|Brits?|England|Scotland|Scottish|Wales|Welsh|Northern Ireland|London|NHS|Brexit)\b/;

// Words that make a story political rather than merely set in the UK.
const POLITICS_WORDS =
  /\b(government|govt|minister(s|ial)?|ministry|MPs?|parliament(ary)?|election(s|eering)?|by-?election|vote(s|rs|d)?|voting|ballot|referendum|poll(s|ing)?|polic(y|ies)|law(s|makers)?|legislation|bill|budget|tax(es|ation)?|spending|welfare|benefits|cabinet|political|prime minister|PM|president(ial)?|sanction(s|ed)?|treaty|summit|diplomat(s|ic)?|ambassador|embassy|opposition|leader(ship)?|council(s|lors?)?|mayor|secretary|chancellor|regulat(or|ion|ions)|inquiry|watchdog|reform|immigration|asylum|migrants?|border|defence|military aid|foreign aid|strike action|trade unions?|court ruling|supreme court|judicial review|protest(s|ers)?|deport(ed|ation|ations)?)\b/i;

// Global politics the UK is party to or directly affected by.
const GLOBAL_UK_RELEVANT =
  /\b(Ukrain(e|ian)s?|Kyiv|Zelensky[iy]?|Russia(n|ns)?|Kremlin|Putin|Lavrov|NATO|European Union|EU|Brussels|European Commission|von der Leyen|European Parliament|Eurozone|White House|US Congress|State Department|Pentagon|Rubio|Vance|G7|G20|United Nations|UN Security Council|Security Council|UN General Assembly|Gaza|Israel(i|is)?|Netanyahu|Hamas|Hezbollah|West Bank|Iran(ian)?|Tehran|Strait of Hormuz|Xi Jinping|Taiwan|tariffs?|trade war|trade deal|sanctions|ceasefire|peace (talks|deal|plan)|nuclear (deal|talks|weapons?)|Commonwealth|Ireland|Irish|Macron|Merz|Meloni|Carney)\b/;

// Topics the UK has no stake in that still trip the words above (US horse
// race politics with a Trump mention, for instance) are filtered by
// requiring the global match to come with a politics word.

const SPORT =
  /\b(Premier League|Champions League|Europa League|FA Cup|World Cup|Euro 20\d\d|football(er|ers)?|soccer|cricket(er|ers)?|rugby|Six Nations|Ashes|Wimbledon|tennis|golf(er)?|Ryder Cup|Formula (One|1)|F1|Grand Prix|boxing|UFC|darts|snooker|Olympics?|Paralympics?|NFL|NBA|MLB|NHL|Super Bowl|striker|midfielder|goalkeeper|manager sacked|transfer window|hat-trick|kick-?off|fixtures?|derby)\b/i;

const CELEBRITY =
  /\b(Taylor Swift|Beyonc[eé]|Kardashian|celebrit(y|ies)|Strictly|Love Island|Bake Off|I'm a Celebrity|EastEnders|Coronation Street|Oscars?|Grammys?|Baftas?|Emmys?|Golden Globes?|box office|red carpet|pop star|rapper|singer|actor|actress|album|Netflix|Disney|Hollywood|Prince Harry|Meghan|influencer|TikTok star|Halloween)\b/i;

// Crime-only stories: dropped unless a political actor or word is present.
const CRIME =
  /\b(murder(ed|s|er)?|stabb(ed|ing|ings)|shooting|shot dead|killed in|manslaughter|rape(d)?|sexual assault|assault(ed)?|robbery|burglary|jailed|sentenced|convicted|pleads? guilty|charged with|arrested|missing (girl|boy|woman|man)|body found|police (hunt|appeal))\b/i;

// UK outlets whose politics sections count as UK politics on their own.
const UK_SOURCES = new Set([
  "BBC News",
  "BBC Politics",
  "The Guardian",
  "Guardian Politics",
  "The Telegraph",
  "The Spectator",
  "Guido Fawkes",
  "New Statesman",
  "UnHerd",
]);
// Not The Canary: its politics feed also carries lifestyle and sponsored
// posts ("How to Transform Your Dining Room on a Budget").

// State-funded outlets: shown elsewhere with their bias label, not here.
const STATE_MEDIA = new Set(["RT", "TASS", "Sputnik", "Xinhua", "CGTN", "Global Times", "Press TV", "TRT World"]);

const NEVER_CATEGORIES = new Set(["sport", "crypto", "music", "culture"]);
const POLITICS_CATEGORIES = new Set(["politics", "governance"]);
// Global matches only count in news sections, not Tech/Science/Environment.
const GLOBAL_CATEGORIES = new Set(["politics", "governance", "world"]);

const isScraped = (item: Pick<FeedItem, "source">) => /^(r\/|\/\w+\/)/.test(item.source);

// ── Image ───────────────────────────────────────────────────────────────────

/** A usable https image URL for the slider, or null. Upgrades http to
 *  https and the BBC's 240px thumbnails to 800px (same image, larger size). */
export function sliderImageUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  let url = raw.trim().replace(/&amp;/g, "&");
  if (url.startsWith("//")) url = `https:${url}`;
  if (url.startsWith("http://")) url = `https://${url.slice(7)}`;
  if (!url.startsWith("https://")) return null;
  if (/\.(mp3|m4a|mp4|mov|webm|ogg|wav|pdf)(\?|$)/i.test(url)) return null;
  // Tracking pixels and placeholders.
  if (/(1x1|pixel|spacer|blank)\.(gif|png)/i.test(url)) return null;
  url = url.replace(/^(https:\/\/ichef\.bbci\.co\.uk\/(?:ace|news)\/(?:standard|ws)\/)\d+\//, "$1800/");
  return url;
}

// ── Classifier ──────────────────────────────────────────────────────────────

export type PoliticsReach = "uk-actor" | "uk" | "global";

/** How an item qualifies for the slider, or null when it does not.
 *  Ignores the image; see selectPoliticsSlides for the full rule. */
export function politicsReach(item: Pick<FeedItem, "title" | "description" | "category" | "source">): PoliticsReach | null {
  const title = item.title ?? "";
  const text = `${title} ${item.description ?? ""}`;
  const category = (item.category ?? "").toLowerCase();

  if (NEVER_CATEGORIES.has(category)) return null;
  if (isScraped(item) || STATE_MEDIA.has(item.source)) return null;
  if (isMarketStory({ title, category: item.category })) return null;
  // Sport and celebrity are judged on the headline: a politics story can
  // mention a footballer in its standfirst.
  if (SPORT.test(title) || CELEBRITY.test(title)) return null;

  const politicsSection = POLITICS_CATEGORIES.has(category);
  // A UK outlet's politics section; its world pages cover other countries'
  // prime ministers and treasuries.
  const ukSource = politicsSection && UK_SOURCES.has(item.source);
  const ukPlace = UK_PLACE.test(text);
  const ukContext = ukSource || ukPlace;
  const actorIn = (s: string) =>
    UK_ACTORS_CS.test(s) || UK_POLITICIANS.test(s) || (ukContext && UK_ACTORS_CONTEXT.test(s));
  const ukActor = actorIn(text);
  const politicsWord = POLITICS_WORDS.test(text);

  if (CRIME.test(title) && !ukActor && !politicsWord) return null;

  // UK actors in the headline are political by definition. In the
  // description alone they need a politics section or a politics word
  // (a lifestyle piece can mention Westminster in passing).
  if (actorIn(title)) return "uk-actor";
  if (ukActor && (politicsSection || politicsWord)) return "uk-actor";

  if (ukSource) return "uk";

  // The UK named in the headline (a US outlet's politics desk mentioning
  // England in a standfirst is not UK politics).
  if (UK_PLACE.test(title) && (politicsSection || POLITICS_WORDS.test(title))) return "uk";

  if (GLOBAL_CATEGORIES.has(category) && GLOBAL_UK_RELEVANT.test(title) && politicsWordOrTopic(title, text)) {
    return ukPlace ? "uk" : "global";
  }
  return null;
}

// A global headline needs to read as politics: a politics word anywhere, or
// a topic that is inherently geopolitical (war, alliance, sanctions).
const INHERENTLY_POLITICAL =
  /\b(NATO|Kremlin|Putin|Zelensky[iy]?|Lavrov|White House|Security Council|G7|G20|ceasefire|sanctions|tariffs?|trade (war|deal)|peace (talks|deal|plan)|nuclear (deal|talks)|Netanyahu|Hamas|Hezbollah|Xi Jinping|von der Leyen|European Commission|European Parliament|war|missiles?|troops|invasion|airstrikes?|drones?)\b/i;

function politicsWordOrTopic(title: string, text: string): boolean {
  return INHERENTLY_POLITICAL.test(title) || POLITICS_WORDS.test(text);
}

// ── Selector ────────────────────────────────────────────────────────────────

/** Guardian opinion titles end "| Simon Jenkins" or "| Editorial". */
export function stripByline(title: string): string {
  return title.replace(/\s+\|\s+(Editorial|Letters?|[A-Z][\w'’.-]+(\s+[A-Z][\w'’.-]+){0,3})\s*$/, "").trim();
}

function parseTime(date: string | undefined): number {
  const t = date ? Date.parse(date) : NaN;
  return Number.isFinite(t) ? t : 0;
}

const TIER_ORDER = { wire: 4, broadsheet: 3, tabloid: 2, blog: 1 } as const;

function pick(items: FeedItem[], maxAgeH: number, limit: number, now: number): Slide[] {
  const candidates: Array<{ item: FeedItem; reach: PoliticsReach; image: string }> = [];
  for (const item of items) {
    if (!item.title || !item.link) continue;
    const t = parseTime(item.pubDate);
    if (!item.datedAtFetch && (t === 0 || now - t > maxAgeH * 3_600_000 || t > now + 3_600_000)) continue;
    const image = sliderImageUrl(item.imageUrl);
    if (!image) continue;
    const reach = politicsReach(item);
    if (reach) candidates.push({ item, reach, image });
  }
  const byItem = new Map(candidates.map((c) => [c.item, c]));

  const ranked = clusterItems(candidates.map((c) => c.item)).map((cluster) => {
    const { score } = scoreCluster(cluster, now);
    const reaches = cluster.map((i) => byItem.get(i)!.reach);
    const boost = reaches.includes("uk-actor") ? UK_ACTOR_BOOST : reaches.includes("uk") ? UK_PLACE_BOOST : 1;
    const rep = [...cluster].sort(
      (a, b) =>
        TIER_ORDER[getSourceTier(b.source)] - TIER_ORDER[getSourceTier(a.source)] ||
        parseTime(b.pubDate) - parseTime(a.pubDate),
    )[0];
    return { rep, image: byItem.get(rep)!.image, score: score * boost };
  });

  ranked.sort((a, b) => b.score - a.score || parseTime(b.rep.pubDate) - parseTime(a.rep.pubDate));

  // Same picture twice (an outlet's stock image) reads as a broken slider.
  const seenImages = new Set<string>();
  const slides: Slide[] = [];
  for (const { rep, image } of ranked) {
    if (seenImages.has(image)) continue;
    seenImages.add(image);
    const hash = computeEntityHash(rep.link);
    slides.push({
      id: hash,
      headline: tickerHeadline([{ ...rep, title: stripByline(rep.title) }], false),
      href: `/article/${hash}`,
      imageUrl: image,
      source: rep.source,
      bias: biasWords(rep.bias?.bias),
      pubDate: rep.pubDate,
    });
    if (slides.length >= limit) break;
  }
  return slides;
}

/** Slides for the home page slider, best first: [] when fewer than
 *  SLIDER_MIN stories qualify (the slider then renders nothing). */
export function selectPoliticsSlides(items: FeedItem[], limit = SLIDER_MAX, now: number = Date.now()): Slide[] {
  let slides = pick(items, MAX_AGE_H, limit, now);
  if (slides.length < SLIDER_MIN) slides = pick(items, WIDE_AGE_H, limit, now);
  return slides.length >= SLIDER_MIN ? slides : [];
}

// Memoised per feed array (fetchAllFeeds returns the same array while its
// cache is fresh), so the page and the poll route share one computation.
const cache = new WeakMap<FeedItem[], { ts: number; slides: Slide[] }>();
const TTL_MS = 2 * 60 * 1000;

export function selectPoliticsSlidesCached(items: FeedItem[]): Slide[] {
  const hit = cache.get(items);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.slides;
  const slides = selectPoliticsSlides(items);
  cache.set(items, { ts: Date.now(), slides });
  return slides;
}
