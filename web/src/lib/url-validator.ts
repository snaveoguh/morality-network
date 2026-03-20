import "server-only";

import { promises as dns } from "node:dns";

/**
 * SSRF protection — validates URLs before server-side fetching.
 *
 * Blocks:
 *   - Private/reserved IPv4 ranges (10.x, 172.16-31.x, 192.168.x, 127.x, etc.)
 *   - IPv6 loopback (::1), link-local (fe80::), ULA (fc00::)
 *   - Metadata endpoints (169.254.169.254 — AWS/GCP/Azure)
 *   - Non-HTTP(S) protocols
 *   - Hostnames that resolve to private IPs (via DNS resolution check)
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

/**
 * Private IP patterns for DNS resolution check.
 * Applied to resolved IP addresses (not hostnames).
 */
const PRIVATE_IP_RESOLVED = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^::1$/,
  /^fe80:/i,
  /^fc00:/i,
  /^fd/i,
];

function isPrivateIp(address: string): boolean {
  return PRIVATE_IP_RESOLVED.some((pattern) => pattern.test(address));
}

/**
 * Async SSRF validation with DNS resolution check.
 *
 * Runs the sync hostname/protocol checks first, then resolves the
 * hostname via DNS and verifies the resolved IP isn't private.
 * This blocks DNS rebinding attacks where a public hostname resolves
 * to 127.0.0.1, 10.x, 169.254.169.254, etc.
 */
export async function validateExternalUrlWithDns(
  input: string,
): Promise<UrlValidationResult> {
  // Run sync checks first (fast path)
  const syncResult = validateExternalUrl(input);
  if (!syncResult.valid) return syncResult;

  const hostname = syncResult.url!.hostname;

  // Skip DNS check for raw IPs (already validated by sync check)
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return syncResult;
  }

  // Resolve hostname and check all returned addresses
  try {
    const results = await dns.lookup(hostname, { all: true });
    for (const result of results) {
      if (isPrivateIp(result.address)) {
        return {
          valid: false,
          error: `Blocked: hostname resolves to private IP (${result.address})`,
        };
      }
    }
  } catch {
    return { valid: false, error: "DNS resolution failed for hostname" };
  }

  return syncResult;
}
