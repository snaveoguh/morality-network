import { NextResponse, type NextRequest } from "next/server";
import { STUMBLE_FRAME_SRC } from "@/lib/stumble-embeds";
import { isMpRoute, MP_PREVIEW_COOKIE, MP_PREVIEW_PARAM, mpRouteAccess } from "@/lib/mp-record/launch-gate";

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

// ── Content-Security-Policy ─────────────────────────────────────────────────
// Next.js requires 'unsafe-inline' for hydration scripts and Tailwind styles.
// Nonce-based CSP can be a future hardening step.
//
// connect-src: Only client-side origins — server-side API fetches (RSS,
// CoinGecko, news, etc.) happen in route handlers and bypass CSP.

const CSP_DIRECTIVES = [
  "default-src 'self'",
  // Next.js hydration + RainbowKit inline scripts require unsafe-inline
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com",
  // Tailwind + RainbowKit inline styles + Google Fonts CSS
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  // Broad img-src: many CDN sources for articles, NFTs, favicons, etc.
  "img-src 'self' data: blob: https:",
  // Embedded media: YouTube, Spotify, Apple Podcasts, WalletConnect, plus the
  // hosts Stumble frames (lib/stumble-embeds). Site-wide, not just /stumble:
  // CSP is per document, so a client-side link into /stumble keeps the
  // policy of the page it came from.
  `frame-src 'self' https://open.spotify.com https://embed.podcasts.apple.com https://*.walletconnect.com ${STUMBLE_FRAME_SRC}`,
  // Client-side fetches: own API, WalletConnect relay, RPC endpoints
  [
    "connect-src 'self'",
    "https://*.walletconnect.com wss://*.walletconnect.com",
    "https://mainnet.rpc.buidlguidl.com https://mainnet.base.org https://sepolia.base.org",
    "https://api.hyperliquid.xyz",
    "https://relay.walletconnect.com wss://relay.walletconnect.com",
    "https://euc.li",                           // ENS avatars
    "https://static.cloudflareinsights.com",     // Cloudflare analytics
    "https://*.up.railway.app",                  // Railway services
    "https://fond-woodcock-74091.upstash.io",    // Upstash Redis
  ].join(" "),
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

// ── Sensitive API paths that should require auth ─────────────────────────────
// (Auth is also enforced in each route handler; this is defense-in-depth.)

const SENSITIVE_GET_PATHS = new Set([
  "/api/trading/positions",
  "/api/trading/performance",
  "/api/trading/journal",
  "/api/trading/readiness",
  "/api/agents/console",
]);

// ── MP Record launch gate ────────────────────────────────────────────────────
// Unreviewed register data must not be reachable on a public URL
// (MP_RECORD_SPEC §12). Pages and API routes also check the gate; this
// covers every /mp route, including client-only pages.

function mpGate(request: NextRequest): NextResponse | null {
  const { pathname, searchParams } = request.nextUrl;
  if (!isMpRoute(pathname)) return null;
  const access = mpRouteAccess(process.env, {
    cookie: request.cookies.get(MP_PREVIEW_COOKIE)?.value,
    param: searchParams.get(MP_PREVIEW_PARAM),
  });
  if (access === "deny") {
    return new NextResponse("Not found", {
      status: 404,
      headers: { ...SECURITY_HEADERS, "X-Robots-Tag": "noindex", "Cache-Control": "no-store" },
    });
  }
  if (access === "grant-preview") {
    const clean = request.nextUrl.clone();
    clean.searchParams.delete(MP_PREVIEW_PARAM);
    const redirect = NextResponse.redirect(clean);
    redirect.cookies.set(MP_PREVIEW_COOKIE, searchParams.get(MP_PREVIEW_PARAM)!, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return redirect;
  }
  return null;
}

export function middleware(request: NextRequest) {
  const blocked = mpGate(request);
  if (blocked) return blocked;

  const response = NextResponse.next();

  // Apply security headers to all responses
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  response.headers.set("Content-Security-Policy", CSP_DIRECTIVES);

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
