import { NextResponse } from "next/server";
import { DEFAULT_FEEDS } from "@/lib/rss";

export async function GET() {
  return NextResponse.json({ sources: DEFAULT_FEEDS });
}
