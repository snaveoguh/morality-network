/**
 * Entity detection script injected into WebView after page load.
 * Ported from extension/src/content/detector.ts.
 * Scans the DOM for ETH addresses and URLs, reports back to RN via postMessage.
 */

export function buildDetectorScript(): string {
  return `(function() {
  if (window.__pooterDetectorRan) return;
  window.__pooterDetectorRan = true;

  var MAX_ENTITIES = 50;
  var ETH_RE = /\\b(0x[a-fA-F0-9]{40})\\b/g;
  var SKIP_TAGS = { SCRIPT:1, STYLE:1, NOSCRIPT:1, TEXTAREA:1, INPUT:1, CODE:1, PRE:1, SVG:1 };
  var UI_TEXTS = { read:1, source:1, discuss:1, comment:1, comments:1, reply:1, share:1, menu:1, open:1, close:1, next:1, previous:1, back:1 };
  var processed = new WeakSet();
  var entities = [];

  function shouldSkipAnchor(a) {
    if (a.closest('nav,header,footer,[role=navigation],[role=menu]')) return true;
    var href = a.getAttribute('href') || '';
    if (!href || href[0] === '#' || href.indexOf('javascript:') === 0 || href.indexOf('mailto:') === 0) return true;
    var text = (a.textContent || '').replace(/\\s+/g, ' ').trim().toLowerCase();
    if (text.length <= 18 && UI_TEXTS[text]) return true;
    var cn = typeof a.className === 'string' ? a.className : '';
    if (/(^|\\s)(btn|button|nav|menu|tab|pagination)(-|_|\\b)/i.test(cn)) return true;
    return false;
  }

  function getRect(el) {
    var r = el.getBoundingClientRect();
    return { x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height };
  }

  function scan() {
    entities = [];

    // Scan text nodes for ETH addresses
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function(node) {
        if (!node.parentElement) return NodeFilter.FILTER_REJECT;
        if (SKIP_TAGS[node.parentElement.tagName]) return NodeFilter.FILTER_REJECT;
        if (processed.has(node)) return NodeFilter.FILTER_REJECT;
        if (!node.textContent || !node.textContent.match(ETH_RE)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    var node;
    while ((node = walker.nextNode()) && entities.length < MAX_ENTITIES) {
      processed.add(node);
      ETH_RE.lastIndex = 0;
      var match;
      while ((match = ETH_RE.exec(node.textContent)) && entities.length < MAX_ENTITIES) {
        entities.push({
          identifier: match[1],
          type: 'ADDRESS',
          rect: getRect(node.parentElement)
        });
      }
    }

    // Scan anchors for URLs
    var anchors = document.querySelectorAll('a[href^="http"]');
    for (var i = 0; i < anchors.length && entities.length < MAX_ENTITIES; i++) {
      var a = anchors[i];
      if (processed.has(a)) continue;
      processed.add(a);
      if (shouldSkipAnchor(a)) continue;
      var href = a.href;
      if (!href || href.length > 500) continue;
      entities.push({
        identifier: href,
        type: 'URL',
        rect: getRect(a)
      });
    }

    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'ENTITIES_DETECTED',
      entities: entities
    }));
  }

  // Run initial scan
  scan();

  // Re-scan on DOM changes (SPA navigation)
  var debounceTimer;
  var observer = new MutationObserver(function() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function() {
      processed = new WeakSet();
      scan();
    }, 1000);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Re-scan on scroll (update positions)
  var scrollTimer;
  window.addEventListener('scroll', function() {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(function() {
      // Just re-report positions
      var updated = entities.map(function(e) {
        return e; // rects are computed at scan time; for scroll we'd need to re-query
      });
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'ENTITIES_DETECTED',
        entities: updated
      }));
    }, 300);
  }, { passive: true });

  // Report page metadata
  window.ReactNativeWebView.postMessage(JSON.stringify({
    type: 'PAGE_META',
    title: document.title,
    url: window.location.href,
    favicon: (document.querySelector('link[rel*="icon"]') || {}).href || ''
  }));

})();
true;`;
}
