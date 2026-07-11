// Claim source: general-election manifestos (Tier 2 backfill, spec §Data
// sources). PDF corpus, one-off ingest per manifesto. Claims attribute to
// the PARTY (memberId null) — manifesto commitments resolve against the
// enacted record, which matters most for the governing party.
//
// Registry URLs are verified-fetchable at commit time; dead links get
// re-pointed (web.archive.org) rather than dropped.

import type { HansardContribution, HansardDebate } from "../types";

export interface ManifestoDef {
  key: string;
  party: string; // Hansard-style party code
  partyName: string;
  year: number;
  title: string;
  url: string;
  /** Publication date — becomes utteredAt for every claim. */
  publishedAt: string;
}

export const MANIFESTOS: ManifestoDef[] = [
  {
    key: "labour-2024",
    party: "Lab",
    partyName: "Labour Party",
    year: 2024,
    title: "Change — Labour Party manifesto 2024",
    url: "https://labour.org.uk/wp-content/uploads/2024/06/Labour-Party-manifesto-2024.pdf",
    publishedAt: "2024-06-13",
  },
  {
    key: "conservative-2024",
    party: "Con",
    partyName: "Conservative Party",
    year: 2024,
    title: "Conservative Party manifesto 2024",
    url: "https://public.conservatives.com/static/documents/GE2024/Conservative-Manifesto-GE2024.pdf",
    publishedAt: "2024-06-11",
  },
  {
    key: "green-2024",
    party: "Green",
    partyName: "Green Party",
    year: 2024,
    title: "Green Party manifesto 2024",
    url: "https://greenparty.org.uk/app/uploads/2024/06/Green-Party-2024-General-Election-Manifesto-Long-version-with-cover.pdf",
    publishedAt: "2024-06-12",
  },
];

export function manifestoDebateExtId(key: string): string {
  return `manifesto-${key}`;
}

/** Split one page's text into passages bounded by a character budget. */
export function splitPageIntoPassages(
  pageText: string,
  maxChars = 1400,
): string[] {
  const clean = pageText.replace(/\s+/g, " ").trim();
  if (clean.length < 200) return []; // covers, section dividers, TOC noise
  const sentences = clean.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? [clean];
  const passages: string[] = [];
  let buffer = "";
  for (const sentence of sentences) {
    if (buffer.length > 0 && buffer.length + sentence.length > maxChars) {
      passages.push(buffer.trim());
      buffer = "";
    }
    buffer += sentence;
  }
  if (buffer.trim().length >= 120) passages.push(buffer.trim());
  return passages;
}

/**
 * Fetch a manifesto PDF and shape it as a synthetic debate: one
 * "contribution" per passage, attributed to the party, deep-linked to the
 * PDF page. Reuses the whole extraction/validation pipeline unchanged.
 */
export async function fetchManifestoAsDebate(
  def: ManifestoDef,
): Promise<HansardDebate | null> {
  try {
    const res = await fetch(def.url, {
      headers: { "User-Agent": "Mozilla/5.0 (pooter.world claim-ledger)" },
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());

    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(buf);
    const { text } = await extractText(pdf, { mergePages: false });
    const pages: string[] = Array.isArray(text) ? text : [String(text)];

    const contributions: HansardContribution[] = [];
    pages.forEach((pageText, pageIndex) => {
      const pageNo = pageIndex + 1;
      splitPageIntoPassages(pageText).forEach((passage, i) => {
        contributions.push({
          externalId: `${def.key}-p${pageNo}-${i}`,
          speaker: {
            memberId: null,
            name: `${def.partyName} — ${def.year} manifesto`,
            party: def.party,
            constituency: null,
          },
          text: passage,
          orderInSection: contributions.length + 1,
          sourceUrl: `${def.url}#page=${pageNo}`,
        });
      });
    });

    if (contributions.length === 0) return null;
    return {
      extId: manifestoDebateExtId(def.key),
      title: def.title,
      house: "Commons", // synthetic container; not displayed for manifestos
      date: def.publishedAt,
      sourceUrl: def.url,
      contributions,
    };
  } catch (error) {
    console.error(`[ledger/manifestos] fetch failed for ${def.key}:`, error);
    return null;
  }
}
