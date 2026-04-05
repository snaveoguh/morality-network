import { NextResponse } from "next/server";
import { searchSite } from "@/lib/search-server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";

  if (q.length < 2) {
    return NextResponse.json({ query: q, groups: [], results: [], total: 0 });
  }

  try {
    const payload = await searchSite(q);
    return NextResponse.json(payload, {
      headers: {
        "cache-control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    console.error("[api/search] error:", error);
    return NextResponse.json(
      { query: q, groups: [], results: [], total: 0, error: "Search failed" },
      { status: 500 },
    );
  }
}
