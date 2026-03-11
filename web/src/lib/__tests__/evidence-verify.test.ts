/**
 * Tests for evidence-verify.ts
 *
 * Covers:
 * - URL normalization
 * - Bad URL rejection
 * - Private/local network rejection
 * - Content-type validation
 * - Title extraction
 * - Canonical extraction
 * - Safe URL happy path (integration)
 */

import { describe, it, expect } from "vitest";
import {
  normalizeUrl,
  isPrivateHost,
  validateUrl,
  extractTitle,
  extractCanonical,
  isAcceptableContentType,
} from "../evidence-verify";

// ============================================================================
// URL NORMALIZATION
// ============================================================================

describe("normalizeUrl", () => {
  it("prepends https:// when no protocol", () => {
    expect(normalizeUrl("example.com")).toBe("https://example.com");
  });

  it("preserves existing https://", () => {
    expect(normalizeUrl("https://example.com/path")).toBe("https://example.com/path");
  });

  it("preserves existing http://", () => {
    expect(normalizeUrl("http://example.com")).toBe("http://example.com");
  });

  it("trims whitespace", () => {
    expect(normalizeUrl("  https://example.com  ")).toBe("https://example.com");
  });

  it("returns empty string for empty input", () => {
    expect(normalizeUrl("")).toBe("");
    expect(normalizeUrl("   ")).toBe("");
  });

  it("handles URLs with paths and query strings", () => {
    expect(normalizeUrl("example.com/path?q=1")).toBe("https://example.com/path?q=1");
  });
});

// ============================================================================
// PRIVATE NETWORK REJECTION
// ============================================================================

describe("isPrivateHost", () => {
  it("blocks localhost", () => {
    expect(isPrivateHost("localhost")).toBe(true);
    expect(isPrivateHost("LOCALHOST")).toBe(true);
  });

  it("blocks 127.x.x.x", () => {
    expect(isPrivateHost("127.0.0.1")).toBe(true);
    expect(isPrivateHost("127.0.0.2")).toBe(true);
  });

  it("blocks 10.x.x.x (Class A private)", () => {
    expect(isPrivateHost("10.0.0.1")).toBe(true);
    expect(isPrivateHost("10.255.255.255")).toBe(true);
  });

  it("blocks 192.168.x.x (Class C private)", () => {
    expect(isPrivateHost("192.168.1.1")).toBe(true);
    expect(isPrivateHost("192.168.0.100")).toBe(true);
  });

  it("blocks 172.16-31.x.x (Class B private)", () => {
    expect(isPrivateHost("172.16.0.1")).toBe(true);
    expect(isPrivateHost("172.31.255.255")).toBe(true);
  });

  it("blocks link-local 169.254.x.x", () => {
    expect(isPrivateHost("169.254.1.1")).toBe(true);
  });

  it("blocks IPv6 loopback", () => {
    expect(isPrivateHost("::1")).toBe(true);
    expect(isPrivateHost("[::1]")).toBe(true);
  });

  it("blocks IPv6 private ranges", () => {
    expect(isPrivateHost("fc00::1")).toBe(true);
    expect(isPrivateHost("fd00::1")).toBe(true);
    expect(isPrivateHost("fe80::1")).toBe(true);
  });

  it("allows public domains", () => {
    expect(isPrivateHost("google.com")).toBe(false);
    expect(isPrivateHost("example.com")).toBe(false);
    expect(isPrivateHost("1.1.1.1")).toBe(false);
    expect(isPrivateHost("8.8.8.8")).toBe(false);
  });

  it("allows public IP addresses", () => {
    expect(isPrivateHost("93.184.216.34")).toBe(false);
    expect(isPrivateHost("151.101.1.69")).toBe(false);
  });
});

// ============================================================================
// URL VALIDATION
// ============================================================================

describe("validateUrl", () => {
  it("accepts valid HTTPS URLs", () => {
    const result = validateUrl("https://example.com/article");
    expect(result.valid).toBe(true);
    expect(result.url).toBeDefined();
    expect(result.reasons).toHaveLength(0);
  });

  it("accepts valid HTTP URLs", () => {
    const result = validateUrl("http://example.com");
    expect(result.valid).toBe(true);
  });

  it("prepends https:// and validates", () => {
    const result = validateUrl("example.com/path");
    expect(result.valid).toBe(true);
    expect(result.url?.protocol).toBe("https:");
  });

  it("rejects empty URL", () => {
    const result = validateUrl("");
    expect(result.valid).toBe(false);
    expect(result.reasons).toContain("URL is required.");
  });

  it("rejects ftp:// protocol", () => {
    const result = validateUrl("ftp://example.com/file");
    expect(result.valid).toBe(false);
    expect(result.reasons[0]).toContain("not allowed");
  });

  it("rejects javascript: protocol", () => {
    const result = validateUrl("javascript:alert(1)");
    expect(result.valid).toBe(false);
  });

  it("rejects data: protocol", () => {
    const result = validateUrl("data:text/html,<h1>hi</h1>");
    expect(result.valid).toBe(false);
  });

  it("rejects localhost", () => {
    const result = validateUrl("http://localhost:3000/api");
    expect(result.valid).toBe(false);
    expect(result.reasons[0]).toContain("Private");
  });

  it("rejects 127.0.0.1", () => {
    const result = validateUrl("http://127.0.0.1/admin");
    expect(result.valid).toBe(false);
  });

  it("rejects 192.168.x.x", () => {
    const result = validateUrl("http://192.168.1.1/router");
    expect(result.valid).toBe(false);
  });

  it("rejects non-standard ports", () => {
    const result = validateUrl("https://example.com:8080/api");
    expect(result.valid).toBe(false);
    expect(result.reasons[0]).toContain("port");
  });

  it("allows port 443", () => {
    const result = validateUrl("https://example.com:443/path");
    expect(result.valid).toBe(true);
  });

  it("allows port 80", () => {
    const result = validateUrl("http://example.com:80/path");
    expect(result.valid).toBe(true);
  });
});

// ============================================================================
// CONTENT TYPE VALIDATION
// ============================================================================

describe("isAcceptableContentType", () => {
  it("accepts text/html", () => {
    expect(isAcceptableContentType("text/html")).toBe(true);
    expect(isAcceptableContentType("text/html; charset=utf-8")).toBe(true);
  });

  it("accepts application/json", () => {
    expect(isAcceptableContentType("application/json")).toBe(true);
  });

  it("accepts application/xml", () => {
    expect(isAcceptableContentType("application/xml")).toBe(true);
    expect(isAcceptableContentType("text/xml")).toBe(true);
  });

  it("accepts application/xhtml+xml", () => {
    expect(isAcceptableContentType("application/xhtml+xml")).toBe(true);
  });

  it("accepts text/plain", () => {
    expect(isAcceptableContentType("text/plain")).toBe(true);
  });

  it("accepts application/pdf", () => {
    expect(isAcceptableContentType("application/pdf")).toBe(true);
  });

  it("rejects binary content types", () => {
    expect(isAcceptableContentType("image/png")).toBe(false);
    expect(isAcceptableContentType("image/jpeg")).toBe(false);
    expect(isAcceptableContentType("application/octet-stream")).toBe(false);
    expect(isAcceptableContentType("video/mp4")).toBe(false);
    expect(isAcceptableContentType("audio/mpeg")).toBe(false);
  });

  it("rejects empty content type", () => {
    expect(isAcceptableContentType("")).toBe(false);
  });

  it("rejects application/zip", () => {
    expect(isAcceptableContentType("application/zip")).toBe(false);
  });
});

// ============================================================================
// TITLE EXTRACTION
// ============================================================================

describe("extractTitle", () => {
  it("extracts <title> from HTML", () => {
    const html = "<html><head><title>Hello World</title></head></html>";
    expect(extractTitle(html)).toBe("Hello World");
  });

  it("handles multiline title", () => {
    const html = "<title>\n  Some\n  Title\n</title>";
    expect(extractTitle(html)).toBe("Some Title");
  });

  it("decodes HTML entities", () => {
    const html = "<title>AT&amp;T &quot;News&quot;</title>";
    expect(extractTitle(html)).toBe('AT&T "News"');
  });

  it("returns null for no title", () => {
    expect(extractTitle("<html><body>no title</body></html>")).toBeNull();
  });

  it("returns null for null input", () => {
    expect(extractTitle(null)).toBeNull();
  });

  it("caps title at 300 characters", () => {
    const longTitle = "A".repeat(500);
    const html = `<title>${longTitle}</title>`;
    expect(extractTitle(html)!.length).toBe(300);
  });

  it("handles title with attributes", () => {
    const html = '<title lang="en">My Page</title>';
    expect(extractTitle(html)).toBe("My Page");
  });
});

// ============================================================================
// CANONICAL EXTRACTION
// ============================================================================

describe("extractCanonical", () => {
  it("extracts canonical URL", () => {
    const html = '<link rel="canonical" href="https://example.com/article" />';
    expect(extractCanonical(html)).toBe("https://example.com/article");
  });

  it("handles single quotes", () => {
    const html = "<link rel='canonical' href='https://example.com/page' />";
    expect(extractCanonical(html)).toBe("https://example.com/page");
  });

  it("returns null for no canonical", () => {
    expect(extractCanonical("<html><head></head></html>")).toBeNull();
  });

  it("returns null for null input", () => {
    expect(extractCanonical(null)).toBeNull();
  });

  it("returns null for invalid canonical URL", () => {
    const html = '<link rel="canonical" href="not-a-url" />';
    expect(extractCanonical(html)).toBeNull();
  });
});

// ============================================================================
// INTEGRATION — verifyEvidence (requires network, so we test validation path)
// ============================================================================

// Note: Full integration tests (actual HTTP requests) would be in e2e tests.
// Here we test the validation-only paths that don't need network access.

describe("validateUrl integration paths", () => {
  it("rejects SSRF attempt via 10.x.x.x", () => {
    const result = validateUrl("https://10.0.0.1/admin/config");
    expect(result.valid).toBe(false);
    expect(result.reasons.some((r) => r.includes("Private"))).toBe(true);
  });

  it("rejects SSRF attempt via localhost with path", () => {
    const result = validateUrl("http://localhost/api/internal/secrets");
    expect(result.valid).toBe(false);
  });

  it("accepts well-known news domain", () => {
    const result = validateUrl("https://www.reuters.com/article/something");
    expect(result.valid).toBe(true);
    expect(result.url?.hostname).toBe("www.reuters.com");
  });

  it("accepts government domain", () => {
    const result = validateUrl("https://www.congress.gov/bill/118th-congress/house-bill/1");
    expect(result.valid).toBe(true);
  });

  it("accepts research domain", () => {
    const result = validateUrl("https://arxiv.org/abs/2301.00001");
    expect(result.valid).toBe(true);
  });

  it("rejects file:// protocol", () => {
    const result = validateUrl("file:///etc/passwd");
    expect(result.valid).toBe(false);
  });
});
