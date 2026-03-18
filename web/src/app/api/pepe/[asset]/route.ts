import { NextResponse } from "next/server";
import { fetchPepeDetail } from "@/lib/pepe";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ asset: string }> },
) {
  try {
    const { asset } = await params;
    const detail = await fetchPepeDetail(asset.toUpperCase());

    if (!detail) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    return NextResponse.json(detail);
  } catch (err) {
    console.error("[pepe/detail]", err);
    return NextResponse.json({ error: "Failed to fetch asset" }, { status: 500 });
  }
}
