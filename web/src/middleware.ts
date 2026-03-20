import { NextResponse, type NextRequest } from "next/server";

/**
 * Next.js Edge Middleware — runs before every matched route.
 *
 * Responsibilities:
 *   1. Security headers (CSP, HSTS, etc.)
 *   2. Block sensitive paths from public access
 */

// ── Security Headers ─────────────────────────────────────────────────────────

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), payment=()",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
};

// ── Sensitive API paths that should require auth ─────────────────────────────
// (Auth is also enforced in each route handler; this is defense-in-depth.)

const SENSITIVE_GET_PATHS = new Set([
  "/api/trading/positions",
  "/api/trading/performance",
  "/api/trading/journal",
  "/api/trading/readiness",
  "/api/agents/console",
]);

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Apply security headers to all responses
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }

  // Rate-limit defense for sensitive trading GETs:
  // In production, require CRON_SECRET for sensitive endpoints
  if (process.env.NODE_ENV === "production") {
    const pathname = request.nextUrl.pathname;

    if (SENSITIVE_GET_PATHS.has(pathname)) {
      const secret = process.env.CRON_SECRET?.trim();
      if (!secret) {
        // Fail closed — no secret configured means deny all sensitive GETs
        return NextResponse.json(
          { error: "Service unavailable" },
          { status: 503, headers: Object.fromEntries(
            Object.entries(SECURITY_HEADERS),
          ) },
        );
      }
      const auth = request.headers.get("authorization")?.trim();
      if (auth !== `Bearer ${secret}`) {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 401, headers: Object.fromEntries(
            Object.entries(SECURITY_HEADERS),
          ) },
        );
      }
    }
  }

  return response;
}

export const config = {
  matcher: [
    // Match all API routes and pages, skip static files and _next internals
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|eot)).*)",
  ],
};
