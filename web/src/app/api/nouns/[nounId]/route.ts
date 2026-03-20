import { NextResponse } from "next/server";
import { fetchNounDetail } from "@/lib/nouns-marketplace";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ nounId: string }> },
) {
  try {
    const { nounId: rawId } = await params;
    const nounId = Number(rawId);
    if (!Number.isFinite(nounId) || nounId < 0) {
      return NextResponse.json({ error: "invalid nounId" }, { status: 400 });
    }

    const detail = await fetchNounDetail(nounId);
    return NextResponse.json(detail);
  } catch (err) {
    console.error("[nouns/detail]", err);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
