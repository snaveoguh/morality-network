import { NextResponse } from "next/server";
import { fetchNounsMarketItems, type NounMarketItem } from "@/lib/nouns-marketplace";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("limit") || "100"), 200);
    const sort = searchParams.get("sort") || "price-asc";
    const status = searchParams.get("status") || "all";

    let items = await fetchNounsMarketItems(limit);

    // Filter by listing status
    if (status === "listed") {
      items = items.filter((i) => i.listedPriceEth !== null);
    }

    // Sort
    items = sortItems(items, sort);

    return NextResponse.json({ items, total: items.length });
  } catch (err) {
    console.error("[nouns/listings]", err);
    return NextResponse.json({ items: [], total: 0 });
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
