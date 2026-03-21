import { NextRequest, NextResponse } from "next/server";
import { getIllustration } from "@/lib/illustration-store";
import { BRAND_NAME, SITE_URL } from "@/lib/brand";
import {
  getEditionContext,
  ZERO_CONTENT_HASH,
} from "@/lib/server/edition-context";

// ============================================================================
// /api/edition/[tokenId]/image — Newspaper-style SVG for NFT display
//
// Generates a dynamic SVG that looks like a broadsheet front page.
// Layout: masthead → edition/date → daily title → headline → subheadline → hash
// ============================================================================

interface RouteParams {
  params: Promise<{ tokenId: string }>;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (current.length + word.length + 1 > maxChars && current.length > 0) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { tokenId: tokenIdStr } = await params;
  const tokenId = parseInt(tokenIdStr, 10);

  if (!Number.isFinite(tokenId) || tokenId < 1) {
    return new NextResponse("Invalid tokenId", { status: 400 });
  }

  const {
    editorial,
    editorialHash,
    dateStr,
    officialTitle,
    auctionExists,
    communityTitle,
    communityContentHash,
  } = await getEditionContext(tokenId);

  const isCommunityEdition = auctionExists;
  const uppercaseDate = dateStr.toUpperCase();
  const dailyTitle = isCommunityEdition
    ? "COMMUNITY EDITION"
    : editorial?.dailyTitle || "DAILY EDITION";
  const headline = isCommunityEdition
    ? communityTitle || `Historical Claim #${tokenId}`
    : editorial?.primary.title || `Edition #${tokenId}`;
  const subheadline = isCommunityEdition
    ? officialTitle
      ? `User-generated metadata attached to a historical pooter date. Reference article: ${officialTitle}.`
      : "User-generated historical edition. Metadata comes from the community, not the newsroom."
    : editorial?.subheadline || "A public ledger of world events and their interpretation.";
  const contentHash = isCommunityEdition
    ? communityContentHash || ZERO_CONTENT_HASH
    : editorial?.contentHash || ZERO_CONTENT_HASH;
  const generatedBy = isCommunityEdition ? "community" : editorial?.generatedBy || "—";
  const tags = isCommunityEdition
    ? ["community", ...(editorial?.tags?.slice(0, 4) ?? [])]
    : editorial?.tags?.slice(0, 5) ?? [];
  const editedBy = isCommunityEdition ? null : editorial?.editedBy ?? null;

  // Check for DALL-E illustration
  const illustration = editorial
    ? await getIllustration(editorialHash).catch(() => null)
    : null;
  const hasImage = !isCommunityEdition && !!illustration?.base64;
  const requestBaseUrl =
    request.headers.get("x-forwarded-host") && request.headers.get("x-forwarded-proto")
      ? `${request.headers.get("x-forwarded-proto")}://${request.headers.get("x-forwarded-host")}`
      : request.nextUrl.origin;
  const baseUrl = requestBaseUrl || process.env.NEXT_PUBLIC_BASE_URL || SITE_URL;

  // Build SVG
  const W = 800;
  const H = hasImage ? 1200 : 1000;

  // Wrap headline text
  const headlineLines = wrapText(headline, 38);
  const subheadlineLines = wrapText(subheadline, 55);

  // First editorial paragraph (truncated)
  const bodyPreview = isCommunityEdition
    ? editorial?.editorialBody?.[0]
      ? `REFERENCE ARTICLE: ${editorial.editorialBody[0].slice(0, 170)}${editorial.editorialBody[0].length > 170 ? "..." : ""}`
      : "Open, user-generated historical claim. The community title and optional content hash become the NFT record."
    : editorial?.editorialBody?.[0]
      ? editorial.editorialBody[0].slice(0, 200) + (editorial.editorialBody[0].length > 200 ? "..." : "")
      : "";
  const bodyLines = bodyPreview ? wrapText(bodyPreview, 60) : [];

  let y = 0;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&amp;family=Source+Serif+4:ital,wght@0,400;1,400&amp;family=JetBrains+Mono:wght@400;700&amp;display=swap');
    </style>
  </defs>

  <!-- Background -->
  <rect width="${W}" height="${H}" fill="#FAF8F3"/>

  <!-- Border frame -->
  <rect x="20" y="20" width="${W - 40}" height="${H - 40}" fill="none" stroke="#1A1A1A" stroke-width="2"/>
  <rect x="24" y="24" width="${W - 48}" height="${H - 48}" fill="none" stroke="#1A1A1A" stroke-width="0.5"/>

  <!-- Dateline bar -->
  <line x1="40" y1="${(y = 60)}" x2="${W - 40}" y2="${y}" stroke="#1A1A1A" stroke-width="0.5"/>
  <text x="${W / 2}" y="${(y += 18)}" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="9" letter-spacing="3" fill="#888">
    ${escapeXml(`${uppercaseDate} · ${isCommunityEdition ? "COMMUNITY CLAIM" : "EDITION"} ${tokenId} · BASE L2`)}
  </text>
  <line x1="40" y1="${(y += 10)}" x2="${W - 40}" y2="${y}" stroke="#1A1A1A" stroke-width="0.5"/>

  <!-- Masthead -->
  <text x="${W / 2}" y="${(y += 55)}" text-anchor="middle" font-family="'Playfair Display', serif" font-weight="900" font-size="40" fill="#1A1A1A" letter-spacing="-1">
    ${escapeXml(BRAND_NAME)}
  </text>
  <text x="${W / 2}" y="${(y += 22)}" text-anchor="middle" font-family="'Source Serif 4', serif" font-style="italic" font-size="12" fill="#666">
    A public ledger of world events and their interpretation
  </text>

  <!-- Rule -->
  <line x1="40" y1="${(y += 20)}" x2="${W - 40}" y2="${y}" stroke="#1A1A1A" stroke-width="2"/>

  <!-- Daily Title -->
  <text x="${W / 2}" y="${(y += 35)}" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-weight="700" font-size="13" letter-spacing="5" fill="#1A1A1A">
    ${escapeXml(dailyTitle)}
  </text>

  <!-- Rule -->
  <line x1="200" y1="${(y += 15)}" x2="${W - 200}" y2="${y}" stroke="#1A1A1A" stroke-width="0.5"/>

  <!-- Headline -->
  ${headlineLines.map((line, i) => {
    y += i === 0 ? 48 : 44;
    return `<text x="${W / 2}" y="${y}" text-anchor="middle" font-family="'Playfair Display', serif" font-weight="700" font-size="36" fill="#1A1A1A">${escapeXml(line)}</text>`;
  }).join("\n  ")}

  <!-- Subheadline -->
  ${subheadlineLines.map((line, i) => {
    y += i === 0 ? 36 : 22;
    return `<text x="${W / 2}" y="${y}" text-anchor="middle" font-family="'Source Serif 4', serif" font-style="italic" font-size="16" fill="#555">${escapeXml(line)}</text>`;
  }).join("\n  ")}

  <!-- Column rule -->
  <line x1="40" y1="${(y += 25)}" x2="${W - 40}" y2="${y}" stroke="#1A1A1A" stroke-width="0.5"/>

  <!-- Body preview -->
  ${bodyLines.slice(0, 6).map((line, i) => {
    y += i === 0 ? 28 : 20;
    return `<text x="60" y="${y}" font-family="'Source Serif 4', serif" font-size="13" fill="#333">${escapeXml(line)}</text>`;
  }).join("\n  ")}

  <!-- DALL-E Illustration -->
  ${hasImage ? `
  <line x1="40" y1="${(y += 20)}" x2="${W - 40}" y2="${y}" stroke="#1A1A1A" stroke-width="0.5"/>
  <image href="${baseUrl}/api/edition/${tokenId}/illustration" x="60" y="${(y += 10)}" width="${W - 120}" height="${W - 120}" preserveAspectRatio="xMidYMid slice"/>
  ${(() => { y += W - 120; return ""; })()}
  ` : ""}

  <!-- Tags -->
  ${tags.length > 0 ? `
  <text x="60" y="${(y += 25)}" font-family="'JetBrains Mono', monospace" font-size="9" fill="#888" letter-spacing="2">
    ${escapeXml(tags.map(t => `#${t.toUpperCase()}`).join("  "))}
  </text>
  ` : ""}

  <!-- Edited by -->
  ${editedBy ? `
  <text x="${W - 60}" y="${y}" text-anchor="end" font-family="'JetBrains Mono', monospace" font-size="9" fill="#8B0000" letter-spacing="1">
    EDITED BY ${escapeXml(editedBy.toUpperCase())}
  </text>
  ` : ""}

  <!-- Bottom section -->
  <line x1="40" y1="${H - 100}" x2="${W - 40}" y2="${H - 100}" stroke="#1A1A1A" stroke-width="0.5"/>

  <!-- Content hash -->
  <text x="60" y="${H - 75}" font-family="'JetBrains Mono', monospace" font-size="8" fill="#999" letter-spacing="1">
    CONTENT HASH
  </text>
  <text x="60" y="${H - 60}" font-family="'JetBrains Mono', monospace" font-size="9" fill="#666">
    ${escapeXml(contentHash)}
  </text>

  <!-- Generated by -->
  <text x="${W - 60}" y="${H - 75}" text-anchor="end" font-family="'JetBrains Mono', monospace" font-size="8" fill="#999" letter-spacing="1">
    GENERATED BY
  </text>
  <text x="${W - 60}" y="${H - 60}" text-anchor="end" font-family="'JetBrains Mono', monospace" font-size="9" fill="#666">
    ${escapeXml(generatedBy)}
  </text>

  <!-- Bottom rule -->
  <line x1="40" y1="${H - 45}" x2="${W - 40}" y2="${H - 45}" stroke="#1A1A1A" stroke-width="2"/>
</svg>`;

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
