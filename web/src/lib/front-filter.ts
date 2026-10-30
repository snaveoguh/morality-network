// ============================================================================
// FRONT FILTER — keeps crypto, markets and trading stories off the top of the
// front page (header ticker, trending row, lead stories).
//
// pooter.world leads with politics and the public record. Crypto and market
// stories still live in the feed: the Business & markets tab, Bearometer,
// their category and search. This only decides what may *lead*. Nothing here
// removes an item from the feed data.
//
// Pure: no I/O, safe on the server and in client components.
// ============================================================================

/** Feed categories that never lead the front page. */
const OFF_FRONT_CATEGORIES = new Set(["crypto"]);

/** Auto-tags (rss.ts KEYWORD_PATTERNS) that never appear in Trending. */
const OFF_FRONT_TAGS = new Set(["crypto", "defi", "nft", "markets", "trading"]);

// Crypto. Matched on the headline in any category. No bare "token", "dao" or
// "airdrop": "a token gesture" and "aid airdrop" are news.
const CRYPTO =
  /\b(crypto\w*|bitcoins?|btc|ethereum|solana|dogecoin|memecoins?|altcoins?|stablecoins?|blockchains?|defi|nfts?|web3|on-?chain|coinbase|binance|tether|usdc|usdt|bybit|ftx|polymarket|kalshi|satoshi)\b|\btokens?\s+(sale|launch|price|holders?|unlock|swap)s?\b|\b(governance|meme|utility)\s+tokens?\b/i;

// Markets and trading: price moves, indices, trading desks. "Bank of
// England", "trade deal", "trading standards" and "market town" don't match.
const MOVE = "(rise|rises|rose|fall|falls|fell|slump|slumps|slumped|rally|rallies|rallied|tumble|tumbles|tumbled|surge|surges|surged|jump|jumps|jumped|slide|slides|slid|drop|drops|dropped|climb|climbs|climbed|sink|sinks|sank|soar|soars|soared|plunge|plunges|plunged|gain|gains|gained|rebound|rebounds|rebounded|retreat|retreats|retreated|wobble|wobbles|crash|crashes|crashed|edge|edges|edged|hit record|hits record|close|closes|closed|open|opens|opened|steady|steadies)";
const MARKETS = new RegExp(
  [
    `\\b(stocks?|equities|futures|(stock |global |world |bond |financial )?markets?)\\s+${MOVE}\\b`,
    `\\bshares(\\s+in\\s+[\\w&.'-]+(\\s+[\\w&.'-]+){0,3})?\\s+${MOVE}\\b`,
    "\\b(stock|share) prices?\\b",
    "\\bstock markets?\\b",
    "\\b(wall street|ftse|dow jones|the dow|nasdaq|s&p\\s*500|nikkei|hang seng|dax|stoxx|cac 40)\\b",
    "\\b(bull|bear) markets?\\b|\\b(bullish|bearish)\\b",
    "\\bsell-?offs?\\b",
    "\\b(day )?traders\\b|\\btrading (volume|session|day|desk|floor|platform|app|bot|strategy|firm)s?\\b",
    "\\b(hedge funds?|short sellers?|short squeeze|price targets?|ipos?)\\b",
    "\\bearnings (beat|miss|call|season|report)s?\\b|\\bquarterly (profits?|earnings)\\b",
    "\\b(gold|silver|copper) prices?\\b",
    "\\b(exchange|defi|protocol|bridge|wallet) (hack|hacks|hacked|heist|exploit|exploited)\\b",
  ].join("|"),
  "i",
);

// Markets that are policy, not trading: stripped before MARKETS is tested.
const POLICY_MARKETS =
  /\b(single|labour|labor|jobs|housing|rental|energy|internal|common|black|free|insurance|property) markets?\b|\bmarket (town|square|stall|trader)s?\b/gi;

export interface FrontCandidate {
  title: string;
  category?: string;
}

/** True when an item is crypto, markets or trading content. */
export function isMarketStory(item: FrontCandidate): boolean {
  if (item.category && OFF_FRONT_CATEGORIES.has(item.category.toLowerCase())) return true;
  const title = item.title ?? "";
  return CRYPTO.test(title) || MARKETS.test(title.replace(POLICY_MARKETS, " "));
}

/** May this item lead the front page? */
export function isFrontStory(item: FrontCandidate): boolean {
  return !isMarketStory(item);
}

/** May this tag appear in the Trending row? */
export function isFrontTag(tag: string): boolean {
  return !OFF_FRONT_TAGS.has(tag.toLowerCase());
}

/** Politics, for the ticker fallback. */
export function isPoliticsStory(item: FrontCandidate): boolean {
  const c = item.category?.toLowerCase();
  return (c === "politics" || c === "governance") && isFrontStory(item);
}

/** Same items, front-eligible first, original order kept within each group.
 *  Nothing is dropped. */
export function frontFirst<T extends FrontCandidate>(items: T[]): T[] {
  const front: T[] = [];
  const rest: T[] = [];
  for (const item of items) (isFrontStory(item) ? front : rest).push(item);
  return rest.length === 0 ? items : [...front, ...rest];
}
