// ─── Entity Extraction from Article Text ─────────────────────────────────────
// Extracts proper nouns via regex, classifies them, records character offsets.

import type { EntityMention, EntityOccurrence } from "./types/entities";

// Country names (top 40 most newsworthy)
const COUNTRIES = new Set([
  "United States", "China", "Russia", "Ukraine", "Israel", "Palestine",
  "Iran", "North Korea", "South Korea", "Japan", "India", "Pakistan",
  "Saudi Arabia", "Turkey", "Syria", "Iraq", "Afghanistan", "Taiwan",
  "United Kingdom", "France", "Germany", "Italy", "Spain", "Brazil",
  "Mexico", "Canada", "Australia", "Egypt", "South Africa", "Nigeria",
  "Indonesia", "Philippines", "Vietnam", "Thailand", "Poland", "Netherlands",
  "Sweden", "Norway", "Denmark", "Finland",
]);

// Common organizations/institutions
const ORGANIZATIONS = new Set([
  "United Nations", "NATO", "EU", "European Union", "WHO", "IMF",
  "World Bank", "Federal Reserve", "Pentagon", "Congress", "Senate",
  "Supreme Court", "White House", "Kremlin", "Parliament", "CIA", "FBI",
  "NSA", "SEC", "FDA", "EPA", "OPEC", "BRICS", "G7", "G20",
  "Treasury", "State Department", "Department of Defense",
  "House of Representatives", "House of Commons", "House of Lords",
  "Reuters", "Associated Press", "AP", "BBC", "CNN", "Fox News",
  "New York Times", "Washington Post", "Wall Street Journal",
  "Bloomberg", "The Guardian", "Al Jazeera", "Hamas", "Hezbollah",
  "Taliban", "ISIS", "Microsoft", "Apple", "Google", "Amazon", "Meta",
  "Tesla", "SpaceX", "OpenAI", "Anthropic", "Nvidia", "TSMC",
]);

// Words that look like proper nouns but aren't entity names
const STOP_WORDS = new Set([
  "The", "This", "That", "These", "Those", "What", "Which", "Where",
  "When", "Who", "Why", "How", "And", "But", "For", "Not", "You",
  "All", "Any", "Can", "Had", "Her", "Was", "One", "Our", "Out",
  "Are", "Has", "His", "May", "Its", "Let", "Say", "She", "Too",
  "Use", "Way", "New", "Now", "Old", "See", "Two", "Get", "Has",
  "Him", "His", "How", "Its", "May", "Yet", "Also", "Back", "Even",
  "Much", "Some", "Such", "Take", "Than", "Them", "Then", "Very",
  "Well", "With", "Just", "More", "Most", "Only", "Over", "Same",
  "Will", "From", "Into", "They", "Been", "Each", "Make", "Like",
  "Long", "Look", "Many", "Most", "Next", "Part", "Real", "Show",
  "Side", "Still", "Keep", "Last", "Come", "Made", "Find", "Here",
  "Know", "Another", "According", "However", "Meanwhile", "Despite",
  "Although", "Because", "Before", "After", "During", "Following",
  "Against", "Between", "Through", "Without", "Under", "Would",
  "Could", "Should", "About", "Above", "Below", "Since", "Until",
  "While", "Among", "Along", "Across", "Behind", "Beyond",
  // Days, months
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
  "Sunday", "January", "February", "March", "April", "June", "July",
  "August", "September", "October", "November", "December",
  // Common false positives in news
  "Photo", "Image", "Video", "Source", "Report", "Breaking", "Update",
  "Live", "Watch", "Read", "Share", "Comment", "Subscribe", "Sign",
  "View", "Click", "Download", "Follow", "Join", "Start", "Next",
  "Previous", "Related", "Recommended", "Sponsored", "Advertisement",
]);

// Regex: 2-4 consecutive capitalized words (proper noun phrases)
const PROPER_NOUN_RE = /\b([A-Z][a-z]+(?:\s+(?:of|the|de|van|von|al|bin|ibn|el|la|le|di|du|da|del|dos|das|der|den|het)\s+)?(?:[A-Z][a-z]+\s*){0,3}[A-Z][a-z]+)\b/g;

// Single capitalized word that might be a name (only if 3+ chars)
const SINGLE_NAME_RE = /\b([A-Z][a-z]{2,})\b/g;

function classifyEntity(name: string): EntityMention["type"] {
  if (COUNTRIES.has(name)) return "country";
  if (ORGANIZATIONS.has(name)) return "organization";

  // Check for org-like words
  const orgWords = ["Inc", "Corp", "Ltd", "Group", "Foundation", "Institute", "Council", "Commission", "Authority", "Agency", "Department", "Ministry", "Bank", "Fund", "Association", "Committee", "Board", "Party", "Union"];
  if (orgWords.some(w => name.includes(w))) return "organization";

  // Default to person for multi-word proper nouns
  return "person";
}

function isValidEntity(name: string): boolean {
  // Skip stopwords
  if (STOP_WORDS.has(name)) return false;
  if (STOP_WORDS.has(name.split(" ")[0])) return false;

  // Must be at least 2 characters
  if (name.length < 2) return false;

  // Skip all-caps abbreviations under 3 chars
  if (name === name.toUpperCase() && name.length < 3) return false;

  return true;
}

/**
 * Extract entities from an array of paragraph strings.
 * Returns deduplicated EntityMention[] with all occurrences.
 */
export function extractEntities(paragraphs: string[]): EntityMention[] {
  const entityMap = new Map<string, EntityMention>();

  for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
    const paragraph = paragraphs[pIdx];

    // Find multi-word proper nouns
    let match: RegExpExecArray | null;
    PROPER_NOUN_RE.lastIndex = 0;
    while ((match = PROPER_NOUN_RE.exec(paragraph)) !== null) {
      const name = match[1].trim();
      if (!isValidEntity(name)) continue;

      const canonicalName = name.toLowerCase();
      const occurrence: EntityOccurrence = {
        paragraphIndex: pIdx,
        startChar: match.index,
        endChar: match.index + name.length,
      };

      if (entityMap.has(canonicalName)) {
        entityMap.get(canonicalName)!.occurrences.push(occurrence);
      } else {
        entityMap.set(canonicalName, {
          name,
          canonicalName,
          type: classifyEntity(name),
          context: "",
          occurrences: [occurrence],
        });
      }
    }

    // Find single-word proper nouns (only countries and known orgs)
    SINGLE_NAME_RE.lastIndex = 0;
    while ((match = SINGLE_NAME_RE.exec(paragraph)) !== null) {
      const name = match[1].trim();
      if (!isValidEntity(name)) continue;

      // Only include single words if they're known entities
      if (!COUNTRIES.has(name) && !ORGANIZATIONS.has(name)) continue;

      const canonicalName = name.toLowerCase();
      const occurrence: EntityOccurrence = {
        paragraphIndex: pIdx,
        startChar: match.index,
        endChar: match.index + name.length,
      };

      if (entityMap.has(canonicalName)) {
        entityMap.get(canonicalName)!.occurrences.push(occurrence);
      } else {
        entityMap.set(canonicalName, {
          name,
          canonicalName,
          type: classifyEntity(name),
          context: "",
          occurrences: [occurrence],
        });
      }
    }
  }

  // Sort by number of occurrences (most mentioned first)
  return Array.from(entityMap.values())
    .sort((a, b) => b.occurrences.length - a.occurrences.length);
}

/**
 * Enrich entities with context from the article.
 * Generates a one-line context string for each entity based on surrounding text.
 */
export function enrichEntities(
  entities: EntityMention[],
  paragraphs: string[],
  biasContext?: string | null,
): EntityMention[] {
  return entities.map(entity => {
    // Get context from the first occurrence's paragraph
    const firstOccurrence = entity.occurrences[0];
    const paragraph = paragraphs[firstOccurrence.paragraphIndex] || "";

    // Extract a sentence around the entity
    const sentenceEnd = paragraph.indexOf(".", firstOccurrence.startChar);
    const sentenceStart = paragraph.lastIndexOf(".", Math.max(0, firstOccurrence.startChar - 1));
    const sentence = paragraph.slice(
      sentenceStart > -1 ? sentenceStart + 1 : 0,
      sentenceEnd > -1 ? sentenceEnd + 1 : paragraph.length,
    ).trim();

    // Truncate to ~120 chars
    const context = sentence.length > 120
      ? sentence.slice(0, 117) + "..."
      : sentence;

    // Check if entity appears in bias context
    const hasBias = biasContext
      ? biasContext.toLowerCase().includes(entity.canonicalName)
      : false;

    return {
      ...entity,
      context,
      biasContext: hasBias ? biasContext ?? undefined : undefined,
    };
  });
}
