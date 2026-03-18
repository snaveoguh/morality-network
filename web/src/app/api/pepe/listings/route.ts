import { NextResponse } from "next/server";
import { fetchPepeListings, getCardImageUrl, getPepeDirectory, type PepeFeedItem } from "@/lib/pepe";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("limit") || "40"), 100);
    const series = searchParams.get("series");
    const sort = searchParams.get("sort") || "price-asc";
    const status = searchParams.get("status") || "all";

    let listings = await fetchPepeListings(limit);

    // If no Reservoir results, fall back to directory cards with images
    if (listings.length === 0) {
      const directory = await getPepeDirectory();
      listings = directory.slice(0, limit).map((entry) => ({
        asset: entry.asset,
        imageUrl: getCardImageUrl(entry.asset),
        series: entry.series,
        card: entry.card,
        supply: 0,
        estimatedValueUsd: null,
        listedPriceEth: null,
        emblemTokenId: null,
        emblemContract: null,
        sortTime: Date.now(),
        owner: null,
        marketplaceUrl: null,
      }));
    }

    // Filter by series
    if (series && series !== "all") {
      const seriesNum = Number(series);
      listings = listings.filter((l) => l.series === seriesNum);
    }

    // Filter by listing status
    if (status === "listed") {
      listings = listings.filter((l) => l.listedPriceEth !== null);
    } else if (status === "unlisted") {
      listings = listings.filter((l) => l.listedPriceEth === null);
    }

    // Sort
    listings = sortListings(listings, sort);

    return NextResponse.json({ listings, total: listings.length });
  } catch (err) {
    console.error("[pepe/listings]", err);
    return NextResponse.json({ listings: [], total: 0 });
  }
}

function sortListings(listings: PepeFeedItem[], sort: string): PepeFeedItem[] {
  switch (sort) {
    case "price-asc":
      return [...listings].sort((a, b) => {
        if (a.listedPriceEth && !b.listedPriceEth) return -1;
        if (!a.listedPriceEth && b.listedPriceEth) return 1;
        if (a.listedPriceEth && b.listedPriceEth)
          return parseFloat(a.listedPriceEth) - parseFloat(b.listedPriceEth);
        return 0;
      });
    case "price-desc":
      return [...listings].sort((a, b) => {
        if (a.listedPriceEth && !b.listedPriceEth) return -1;
        if (!a.listedPriceEth && b.listedPriceEth) return 1;
        if (a.listedPriceEth && b.listedPriceEth)
          return parseFloat(b.listedPriceEth) - parseFloat(a.listedPriceEth);
        return 0;
      });
    case "rarest":
      return [...listings].sort((a, b) => (a.supply || Infinity) - (b.supply || Infinity));
    case "series":
      return [...listings].sort((a, b) => a.series - b.series || a.card - b.card);
    default:
      return listings;
  }
}
