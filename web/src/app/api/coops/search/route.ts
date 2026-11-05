import { NextResponse } from "next/server";
import { getArea, searchSocieties } from "@/lib/coops/economy";
import { rateLimit } from "@/lib/rate-limit";

// Directory search over the UK register snapshot, server-side so pages never
// ship the whole register. Active societies only; name or sector match.
// ?exclude=<area> leaves out that area's own societies (its page lists them).

const MIN_QUERY = 2;
const MAX_RESULTS = 20;

export async function GET(request: Request) {
  const limited = rateLimit(request, { maxRequests: 60, windowMs: 60_000 });
  if (limited) return limited;

  const params = new URL(request.url).searchParams;
  const query = (params.get("q") ?? "").trim().slice(0, 80);
  const excludeSlug = params.get("exclude");
  const exclude = excludeSlug ? getArea(excludeSlug) : null;
  if (excludeSlug && !exclude) {
    return NextResponse.json({ error: "Unknown area" }, { status: 400 });
  }
  if (query.length < MIN_QUERY) {
    return NextResponse.json({ query, total: 0, results: [] });
  }

  const { total, results } = searchSocieties(query, { exclude, limit: MAX_RESULTS });
  return NextResponse.json(
    { query, exclude: exclude?.slug ?? null, total, results },
    { headers: { "cache-control": "public, max-age=300" } },
  );
}
