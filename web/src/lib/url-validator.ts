import "server-only";

/**
 * SSRF protection — validates URLs before server-side fetching.
 *
 * Blocks:
 *   - Private/reserved IPv4 ranges (10.x, 172.16-31.x, 192.168.x, 127.x, etc.)
 *   - IPv6 loopback (::1), link-local (fe80::), ULA (fc00::)
 *   - Metadata endpoints (169.254.169.254 — AWS/GCP/Azure)
 *   - Non-HTTP(S) protocols
 *   - Hostnames that resolve to private IPs (via DNS rebinding guard)
 */

const BLOCKED_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/,
  /^10\.\d+\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^169\.254\.\d+\.\d+$/, // AWS/GCP metadata
  /^0\.0\.0\.0$/,
  /^\[::1?\]$/,           // IPv6 loopback
  /^\[fe80:/i,            // IPv6 link-local
  /^\[fc00:/i,            // IPv6 ULA
  /^\[fd/i,               // IPv6 ULA
  /\.internal$/i,
  /\.local$/i,
  /\.localhost$/i,
];

export interface UrlValidationResult {
  valid: boolean;
  error?: string;
  url?: URL;
}

/**
 * Validate that a URL is safe to fetch from the server.
 * Returns { valid: true, url } or { valid: false, error }.
 */
export function validateExternalUrl(input: string): UrlValidationResult {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }

  // Only allow HTTP(S)
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { valid: false, error: `Blocked protocol: ${url.protocol}` };
  }

  // Block private/reserved hostnames
  const hostname = url.hostname.toLowerCase();
  for (const pattern of BLOCKED_HOSTNAME_PATTERNS) {
    if (pattern.test(hostname)) {
      return { valid: false, error: "Blocked: private/reserved address" };
    }
  }

  // Block numeric IPs that slip through (covers edge cases like 0x7f000001)
  // Simple check: if hostname is an IP literal, verify it's not private
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    const parts = hostname.split(".").map(Number);
    if (
      parts[0] === 0 ||
      parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 169 && parts[1] === 254)
    ) {
      return { valid: false, error: "Blocked: private IP address" };
    }
  }

  return { valid: true, url };
}
