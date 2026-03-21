import { NextResponse } from "next/server";
import { fetchListedNouns, type NounMarketItem } from "@/lib/nouns-marketplace";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sort = searchParams.get("sort") || "id-desc";
    const status = searchParams.get("status") || "all";

    let items = await fetchListedNouns();

    // Filter by listing status (all items from fetchListedNouns are listed,
    // but keep the filter for forward compatibility when "Your Nouns" are added)
    if (status === "listed") {
      items = items.filter((i) => i.listedPriceEth !== null);
    }

    // Sort
    items = sortItems(items, sort);

    return NextResponse.json({
      items,
      total: items.length,
      hasMore: false,
      count: items.length,
    });
  } catch (err) {
    console.error("[nouns/listings]", err);
    return NextResponse.json({ items: [], total: 0, hasMore: false, count: 0 });
  }
}

function sortItems(items: NounMarketItem[], sort: string): NounMarketItem[] {
  switch (sort) {
    case "price-asc":
      return [...items].sort((a, b) => {
        if (a.listedPriceEth && !b.listedPriceEth) return -1;
        if (!a.listedPriceEth && b.listedPriceEth) return 1;
        if (a.listedPriceEth && b.listedPriceEth)
          return parseFloat(a.listedPriceEth) - parseFloat(b.listedPriceEth);
        return b.nounId - a.nounId;
      });
    case "price-desc":
      return [...items].sort((a, b) => {
        if (a.listedPriceEth && !b.listedPriceEth) return -1;
        if (!a.listedPriceEth && b.listedPriceEth) return 1;
        if (a.listedPriceEth && b.listedPriceEth)
          return parseFloat(b.listedPriceEth) - parseFloat(a.listedPriceEth);
        return b.nounId - a.nounId;
      });
    case "id-desc":
      return [...items].sort((a, b) => b.nounId - a.nounId);
    case "id-asc":
      return [...items].sort((a, b) => a.nounId - b.nounId);
    default:
      return items;
  }
}
