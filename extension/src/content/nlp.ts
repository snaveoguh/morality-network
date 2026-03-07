import nlp from 'compromise';
import { MAX_KEYWORD_HIGHLIGHTS, NLP_TEXT_SCAN_LIMIT } from '../shared/constants';
import { lookupEntity, KNOWN_ENTITIES, type KnownEntity } from '../shared/known-entities';
import type { DetectedEntity } from './detector';

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'CODE', 'PRE', 'SVG', 'NAV', 'HEADER', 'FOOTER']);
const processed = new WeakSet<Node>();
let keywordCount = 0;

export interface ExtractedKeyword {
  text: string;
  known: KnownEntity | null;
  tags: string[];
}

/** Extract meaningful keywords from page text using compromise.js */
export function extractKeywords(text: string): ExtractedKeyword[] {
  const doc = nlp(text);
  const keywords: ExtractedKeyword[] = [];
  const seen = new Set<string>();

  // 1. Named entities (people, orgs, places)
  const people = doc.people().out('array') as string[];
  const orgs = doc.organizations().out('array') as string[];
  const places = doc.places().out('array') as string[];

  for (const term of [...people, ...orgs, ...places]) {
    const clean = term.trim();
    if (clean.length < 3 || clean.length > 50) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const known = lookupEntity(clean);
    keywords.push({
      text: clean,
      known,
      tags: known?.tags || guessTags(clean),
    });
  }

  // 2. Check known entity dictionary against full text
  const lowerText = text.toLowerCase();
  for (const [term, entity] of Object.entries(KNOWN_ENTITIES) as [string, KnownEntity][]) {
    if (term.length < 3) continue;
    if (seen.has(term)) continue;
    // Only match if the term appears as a whole word
    const regex = new RegExp(`\\b${escapeRegex(term)}\\b`, 'i');
    if (regex.test(lowerText)) {
      seen.add(term);
      keywords.push({
        text: entity.name,
        known: entity,
        tags: entity.tags,
      });
    }
  }

  // 3. Proper nouns (capitalized words not already found)
  const nouns = doc.nouns().out('array') as string[];
  for (const noun of nouns) {
    const clean = noun.trim();
    if (clean.length < 3 || clean.length > 40) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    // Only include proper nouns (capitalized)
    if (!/^[A-Z]/.test(clean)) continue;
    // Skip common words
    if (COMMON_WORDS.has(key)) continue;
    seen.add(key);

    const known = lookupEntity(clean);
    keywords.push({
      text: clean,
      known,
      tags: known?.tags || [],
    });
  }

  return keywords.slice(0, MAX_KEYWORD_HIGHLIGHTS);
}

/** Highlight extracted keywords in the DOM */
export function highlightKeywords(root: Node, keywords: ExtractedKeyword[]): DetectedEntity[] {
  if (keywords.length === 0) return [];

  const detected: DetectedEntity[] = [];

  // Build regex from all keyword texts
  const terms = keywords.map(k => escapeRegex(k.text));
  const regex = new RegExp(`\\b(${terms.join('|')})\\b`, 'gi');
  const keywordMap = new Map(keywords.map(k => [k.text.toLowerCase(), k]));

  // Walk text nodes
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.parentElement) return NodeFilter.FILTER_REJECT;
      if (SKIP_TAGS.has(node.parentElement.tagName)) return NodeFilter.FILTER_REJECT;
      if (processed.has(node)) return NodeFilter.FILTER_REJECT;
      if (node.parentElement.closest('[data-pw-root]')) return NodeFilter.FILTER_REJECT;
      if (node.parentElement.closest('.pw-highlight')) return NodeFilter.FILTER_REJECT;
      if (!node.textContent || !regex.test(node.textContent)) {
        regex.lastIndex = 0;
        return NodeFilter.FILTER_REJECT;
      }
      regex.lastIndex = 0;
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const textNodes: Text[] = [];
  let current: Node | null;
  while ((current = walker.nextNode())) {
    textNodes.push(current as Text);
  }

  for (const textNode of textNodes) {
    if (keywordCount >= MAX_KEYWORD_HIGHLIGHTS) break;
    const parent = textNode.parentElement;
    if (!parent) continue;

    processed.add(textNode);
    const text = textNode.textContent || '';
    const frag = document.createDocumentFragment();
    let lastIndex = 0;

    regex.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      if (keywordCount >= MAX_KEYWORD_HIGHLIGHTS) break;

      const matchText = match[1];
      const kw = keywordMap.get(matchText.toLowerCase());
      if (!kw) continue;

      // Add text before match
      if (match.index > lastIndex) {
        frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }

      // Create highlighted span
      const span = document.createElement('span');
      span.className = 'pw-highlight pw-highlight-keyword';
      span.dataset.pwType = 'KEYWORD';
      span.dataset.pwId = kw.known?.name || matchText;
      span.dataset.pwTags = kw.tags.join(',');
      span.dataset.pwOpenMode = 'modifier';
      span.textContent = matchText;
      frag.appendChild(span);

      detected.push({ element: span, identifier: kw.known?.name || matchText, type: 'KEYWORD' });
      keywordCount++;

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      frag.appendChild(document.createTextNode(text.slice(lastIndex)));
    }

    if (lastIndex > 0) {
      parent.replaceChild(frag, textNode);
    }
  }

  return detected;
}

/** Run the full NLP pipeline: extract keywords then highlight */
export function runNlpScan(): DetectedEntity[] {
  keywordCount = 0;

  const text = document.body.innerText;
  if (!text || text.length < 50) return [];

  // Scan a larger text window to improve keyword coverage on long pages.
  const truncated = text.slice(0, NLP_TEXT_SCAN_LIMIT);
  const keywords = extractKeywords(truncated);
  return highlightKeywords(document.body, keywords);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function guessTags(text: string): string[] {
  const lower = text.toLowerCase();
  const tags: string[] = [];
  if (lower.includes('dao') || lower.includes('governance')) tags.push('dao');
  if (lower.includes('bank') || lower.includes('fund')) tags.push('finance');
  return tags;
}

const COMMON_WORDS = new Set([
  'the', 'this', 'that', 'here', 'there', 'where', 'when', 'what', 'which',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december', 'today', 'yesterday', 'tomorrow',
  'new', 'old', 'first', 'last', 'next', 'best', 'more', 'most', 'just', 'now',
  'also', 'still', 'even', 'well', 'back', 'only', 'then', 'much', 'some', 'any',
  'how', 'all', 'each', 'every', 'both', 'few', 'many', 'such', 'like', 'about',
  'read', 'time', 'year', 'people', 'way', 'day', 'man', 'woman', 'part', 'place',
  'case', 'week', 'company', 'system', 'program', 'question', 'work', 'number',
  'home', 'water', 'room', 'mother', 'area', 'money', 'story', 'fact', 'month',
  'lot', 'right', 'study', 'book', 'eye', 'job', 'word', 'side', 'kind', 'head',
  'far', 'hand', 'high', 'long', 'big', 'small', 'large', 'good', 'great',
  'however', 'use', 'image', 'photo', 'video', 'click', 'view', 'share', 'close',
  'open', 'search', 'menu', 'page', 'site', 'link', 'post', 'comment', 'reply',
]);
