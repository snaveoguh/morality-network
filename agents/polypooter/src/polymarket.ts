/**
 * Polymarket CLOB + Gamma API client.
 *
 * - Gamma API: market discovery, metadata, event grouping
 * - CLOB API: order book, prices, midpoints
 *
 * No SDK dependency — plain fetch. Polymarket's CLOB is public for reads.
 */

import type { PolypooterConfig } from "./config.js";

// ── Types ──

export interface PolymarketEvent {
  id: string;
  title: string;
  slug: string;
  description: string;
  markets: PolymarketMarket[];
  startDate: string;
  endDate: string;
  active: boolean;
  closed: boolean;
  liquidity: number;
  volume: number;
  competitive: number;
}

export interface PolymarketMarket {
  id: string;               // condition ID
  question: string;
  description: string;
  active: boolean;
  closed: boolean;
  clobTokenIds: string[];    // [YES token ID, NO token ID]
  outcomePrices: string[];   // ["0.65", "0.35"] — YES/NO midpoints
  volume: number;
  liquidity: number;
  endDate: string;
  groupItemTitle?: string;
}

export interface ClobBook {
  market: string;
  asset_id: string;
  bids: ClobOrder[];
  asks: ClobOrder[];
  hash: string;
  timestamp: string;
}

export interface ClobOrder {
  price: string;
  size: string;
}

export interface ClobMidpoint {
  mid: string;
}

// ── Client ──

export class PolymarketClient {
  private clobUrl: string;
  private gammaUrl: string;

  constructor(config: PolypooterConfig) {
    this.clobUrl = config.polymarketApiUrl;
    this.gammaUrl = config.polymarketGammaApiUrl;
  }

  // ── Gamma API: Market Discovery ──

  /** Fetch active events with their markets from Gamma API */
  async getActiveEvents(limit = 100, offset = 0): Promise<PolymarketEvent[]> {
    const url = new URL(`${this.gammaUrl}/events`);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("active", "true");
    url.searchParams.set("closed", "false");
    url.searchParams.set("order", "liquidity");
    url.searchParams.set("ascending", "false");

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Gamma events: ${res.status} ${res.statusText}`);
    return res.json();
  }

  /** Fetch active markets directly from Gamma API */
  async getActiveMarkets(limit = 100, offset = 0): Promise<PolymarketMarket[]> {
    const url = new URL(`${this.gammaUrl}/markets`);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("active", "true");
    url.searchParams.set("closed", "false");
    url.searchParams.set("order", "liquidity");
    url.searchParams.set("ascending", "false");

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Gamma markets: ${res.status} ${res.statusText}`);
    return res.json();
  }

  // ── CLOB API: Prices & Order Books ──

  /** Get order book for a specific token ID */
  async getBook(tokenId: string): Promise<ClobBook> {
    const url = `${this.clobUrl}/book?token_id=${tokenId}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`CLOB book: ${res.status} ${res.statusText}`);
    return res.json();
  }

  /** Get midpoint price for a token ID */
  async getMidpoint(tokenId: string): Promise<number> {
    const url = `${this.clobUrl}/midpoint?token_id=${tokenId}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`CLOB midpoint: ${res.status} ${res.statusText}`);
    const data: ClobMidpoint = await res.json();
    return parseFloat(data.mid);
  }

  /** Get prices for multiple markets at once */
  async getPrices(tokenIds: string[]): Promise<Record<string, number>> {
    const url = `${this.clobUrl}/prices`;
    const res = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) throw new Error(`CLOB prices: ${res.status} ${res.statusText}`);
    const data: Record<string, string> = await res.json();

    const result: Record<string, number> = {};
    for (const id of tokenIds) {
      if (data[id]) result[id] = parseFloat(data[id]);
    }
    return result;
  }

  /** Get best bid/ask spread for a token */
  async getSpread(tokenId: string): Promise<{ bestBid: number; bestAsk: number; spread: number }> {
    const book = await this.getBook(tokenId);
    const bestBid = book.bids.length > 0 ? parseFloat(book.bids[0].price) : 0;
    const bestAsk = book.asks.length > 0 ? parseFloat(book.asks[0].price) : 0;
    return {
      bestBid,
      bestAsk,
      spread: bestAsk > 0 && bestBid > 0 ? bestAsk - bestBid : 0,
    };
  }
}
