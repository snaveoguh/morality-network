import { NextResponse } from "next/server";
import { getDayBrief, isBriefTopic } from "@/lib/day-brief";

// GET /api/brief?topic=uk — the "Your day" rundown for one topic.
// Briefs are cached server-side for an hour (lib/day-brief.ts).
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const topic = new URL(request.url).searchParams.get("topic") ?? "all";
  if (!isBriefTopic(topic)) {
    return NextResponse.json({ error: "Unknown topic" }, { status: 400 });
  }
  const brief = await getDayBrief(topic);
  return NextResponse.json(brief, {
    headers: { "cache-control": "public, max-age=300, stale-while-revalidate=3600" },
  });
}
