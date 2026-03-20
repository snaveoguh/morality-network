import { NextResponse } from "next/server";
import { verifyEvidence, normalizeUrl } from "@/lib/evidence-verify";
import { getOperatorAuthState, getSessionAddress } from "@/lib/operator-auth";
import {
  getCachedVerification,
  setCachedVerification,
  getCacheStats,
} from "@/lib/evidence-cache";

/**
 * GET /api/evidence/verify?url=...
 *
 * Verifies a URL for use as evidence in interpretations.
 * Returns: normalizedUrl, canonicalUrl, host, statusCode, contentType,
 *          title, sourceType, qualityTier, safe, reasons[], fetchedAt.
 *
 * Responses are cached server-side for 6 hours.
 */
export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    const [operatorAuth, sessionAddress] = await Promise.all([
      getOperatorAuthState(request),
      getSessionAddress(),
    ]);
    if (!operatorAuth.authorized && !sessionAddress) {
      return NextResponse.json(
        { error: "Authentication required for evidence verification" },
        { status: 401 },
      );
    }
  }

  const { searchParams } = new URL(request.url);
  const rawUrl = searchParams.get("url");

  if (!rawUrl) {
    return NextResponse.json(
      {
        error: "Missing ?url= query parameter.",
        safe: false,
        reasons: ["URL parameter is required."],
      },
      { status: 400 }
    );
  }

  const normalized = normalizeUrl(rawUrl);
  if (!normalized) {
    return NextResponse.json(
      {
        error: "Empty URL after normalization.",
        safe: false,
        reasons: ["URL is empty."],
      },
      { status: 400 }
    );
  }

  // Check cache first
  const cached = getCachedVerification(normalized);
  if (cached) {
    return NextResponse.json(
      { ...cached, _cached: true },
      {
        headers: {
          "Cache-Control": "public, max-age=300, s-maxage=1800",
          "X-Cache": "HIT",
        },
      }
    );
  }

  // Verify the URL
  const result = await verifyEvidence(rawUrl);

  // Cache the result
  setCachedVerification(normalized, result);

  // Determine HTTP status
  const httpStatus = "error" in result ? 422 : 200;

  return NextResponse.json(result, {
    status: httpStatus,
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=1800",
      "X-Cache": "MISS",
    },
  });
}
