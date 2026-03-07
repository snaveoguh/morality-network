import { MAX_ENTITIES_PER_PAGE } from '../shared/constants';

const ETH_ADDRESS_RE = /\b(0x[a-fA-F0-9]{40})\b/g;
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'CODE', 'PRE', 'SVG']);
const processed = new WeakSet<Node>();
let entityCount = 0;

export interface DetectedEntity {
  element: HTMLElement;
  identifier: string;
  type: 'ADDRESS' | 'URL' | 'DOMAIN';
}

const detected: DetectedEntity[] = [];

export function getDetectedEntities(): DetectedEntity[] {
  return detected;
}

export function scanNode(root: Node): void {
  if (entityCount >= MAX_ENTITIES_PER_PAGE) return;

  // Scan text nodes for ETH addresses
  scanTextNodes(root);

  // Scan anchor tags for URLs
  const anchors = root instanceof HTMLElement
    ? root.querySelectorAll('a[href^="http"]')
    : [];

  for (const anchor of anchors) {
    if (processed.has(anchor)) continue;
    if (entityCount >= MAX_ENTITIES_PER_PAGE) break;
    processed.add(anchor);

    const el = anchor as HTMLAnchorElement;
    const href = el.href;
    if (!href || href.length > 500) continue;

    el.classList.add('pw-highlight');
    el.dataset.pwType = 'URL';
    el.dataset.pwId = href;

    detected.push({ element: el, identifier: href, type: 'URL' });
    entityCount++;
  }
}

function scanTextNodes(root: Node): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.parentElement) return NodeFilter.FILTER_REJECT;
      if (SKIP_TAGS.has(node.parentElement.tagName)) return NodeFilter.FILTER_REJECT;
      if (processed.has(node)) return NodeFilter.FILTER_REJECT;
      if (!node.textContent || !node.textContent.match(ETH_ADDRESS_RE)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const textNodes: Text[] = [];
  let current: Node | null;
  while ((current = walker.nextNode())) {
    textNodes.push(current as Text);
  }

  for (const textNode of textNodes) {
    if (entityCount >= MAX_ENTITIES_PER_PAGE) break;
    wrapAddresses(textNode);
  }
}

function wrapAddresses(textNode: Text): void {
  const text = textNode.textContent || '';
  const parent = textNode.parentElement;
  if (!parent) return;

  processed.add(textNode);

  const frag = document.createDocumentFragment();
  let lastIndex = 0;

  ETH_ADDRESS_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = ETH_ADDRESS_RE.exec(text)) !== null) {
    if (entityCount >= MAX_ENTITIES_PER_PAGE) break;

    // Add text before match
    if (match.index > lastIndex) {
      frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }

    // Create highlighted span for the address
    const span = document.createElement('span');
    span.className = 'pw-highlight';
    span.dataset.pwType = 'ADDRESS';
    span.dataset.pwId = match[1];
    span.textContent = match[1];
    frag.appendChild(span);

    detected.push({ element: span, identifier: match[1], type: 'ADDRESS' });
    entityCount++;

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

export function scanPage(): void {
  entityCount = 0;
  detected.length = 0;
  scanNode(document.body);
}
