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
  // Embedded media: YouTube, Spotify, Apple Podcasts, WalletConnect
  "frame-src 'self' https://www.youtube-nocookie.com https://www.youtube.com https://open.spotify.com https://embed.podcasts.apple.com https://*.walletconnect.com",
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

export function middleware(request: NextRequest) {
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
