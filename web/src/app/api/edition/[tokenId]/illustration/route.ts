import { NextRequest, NextResponse } from "next/server";
import { computeEntityHash } from "@/lib/entity";
import { getIllustration } from "@/lib/illustration-store";
import { getArchivedEditorial } from "@/lib/editorial-archive";

// ============================================================================
// /api/edition/[tokenId]/illustration — Serves the DALL-E illustration as PNG
//
// Reads from the separate illustration store first (Redis, then local file).
// Falls back to inline illustrationBase64 on the editorial for backward compat.
// ============================================================================

const EPOCH = 1741651200; // March 11 2025 00:00 UTC (edition #1)
const SECONDS_PER_DAY = 86400;

interface RouteParams {
  params: Promise<{ tokenId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { tokenId: tokenIdStr } = await params;
  const tokenId = parseInt(tokenIdStr, 10);

  if (!Number.isFinite(tokenId) || tokenId < 1) {
    return new NextResponse("Invalid tokenId", { status: 400 });
  }

  // Compute edition date → hash
  const editionTimestamp = EPOCH + (tokenId - 1) * SECONDS_PER_DAY;
  const editionDate = new Date(editionTimestamp * 1000);
  const year = editionDate.getUTCFullYear();
  const month = String(editionDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(editionDate.getUTCDate()).padStart(2, "0");
  const dailyId = `pooter-daily-${year}-${month}-${day}`;
  const hash = computeEntityHash(dailyId);

  // Try the separate illustration store first (Redis → local file)
  const illustration = await getIllustration(hash).catch(() => null);
  let base64 = illustration?.base64 ?? null;

  // Backward compat: check inline illustrationBase64 on the editorial,
  // and also check illustrations saved under the editorial's entityHash
  // (god mode edits save under entityHash, not the daily-edition hash)
  if (!base64) {
    const editorial = await getArchivedEditorial(hash).catch(() => null);
    base64 = editorial?.illustrationBase64 ?? null;

    // If the editorial's entityHash differs from the daily hash, check that too
    if (!base64 && editorial?.entityHash && editorial.entityHash !== hash) {
      const altIllus = await getIllustration(editorial.entityHash).catch(() => null);
      base64 = altIllus?.base64 ?? null;
    }
  }

  if (!base64) {
    return new NextResponse("No illustration for this edition", { status: 404 });
  }

  const buffer = Buffer.from(base64, "base64");

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      "Content-Length": String(buffer.length),
    },
  });
}
