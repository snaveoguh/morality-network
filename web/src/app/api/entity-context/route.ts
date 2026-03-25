import { NextRequest, NextResponse } from "next/server";
import { setEntityContext } from "@/lib/entity-context";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (
      !body ||
      typeof body.hash !== "string" ||
      !body.hash.startsWith("0x")
    ) {
      return NextResponse.json({ error: "invalid hash" }, { status: 400 });
    }
    await setEntityContext(body);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
