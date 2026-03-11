import { scanPage } from './detector';
import { startObserver } from './observer';
import { setupTooltip } from './tooltip';
import { setupBiasOverlay } from './bias-overlay';
import { setupPanel } from './panel';
import { runNlpScan } from './nlp';
import { NLP_DELAY_MS } from '../shared/constants';

// ============================================================================
// EIP-1193 PROVIDER BRIDGE
// Relay messages between the page's MAIN world provider and the background
// ============================================================================

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.data?.type !== 'POOTER_PROVIDER_REQUEST') return;

  const { id, method, params } = event.data;

  // Forward to background service worker
  chrome.runtime.sendMessage(
    { type: 'EIP1193_REQUEST', method, params },
    (response) => {
      // Relay response back to the page
      if (chrome.runtime.lastError) {
        window.postMessage({
          type: 'POOTER_PROVIDER_RESPONSE',
          id,
          error: chrome.runtime.lastError.message || 'Extension error',
        }, '*');
        return;
      }

      if (response?.ok) {
        window.postMessage({
          type: 'POOTER_PROVIDER_RESPONSE',
          id,
          result: response.data,
        }, '*');
      } else {
        window.postMessage({
          type: 'POOTER_PROVIDER_RESPONSE',
          id,
          error: response?.error || 'Unknown error',
        }, '*');
      }
    }
  );
});

// ============================================================================
// EXISTING CONTENT SCRIPT
// ============================================================================

// Scan current page for entities (addresses + URLs — fast, <5ms)
scanPage();

// Watch for new DOM nodes (SPAs)
startObserver();

// Hover tooltips
setupTooltip();

// Bias pill on news sites
setupBiasOverlay();

// Click-to-open conversation panel
setupPanel();

// NLP keyword scan (lazy — runs after page settles)
setTimeout(() => {
  try {
    runNlpScan();
  } catch (e) {
    console.warn('pooter world NLP scan failed:', e);
  }
}, NLP_DELAY_MS);

// Notify service worker of page load
chrome.runtime.sendMessage({
  type: 'PAGE_LOADED',
  url: window.location.href,
  domain: window.location.hostname,
});

// ============================================================================
// POOTER.WORLD ↔ EXTENSION UNISON BRIDGE
// When the user is on pooter.world, the extension and site work together:
// - Site emits POOTER_SITE_CONTEXT with current article/entity data
// - Extension relays rating events back so the site can live-refresh
// ============================================================================

const isPooterWorld = ['pooter.world', 'www.pooter.world', 'localhost'].includes(
  window.location.hostname
);

if (isPooterWorld) {
  // Cache the latest site context so popup can query it
  let siteContext: { entityHash?: string; articleHash?: string; title?: string; identifier?: string } | null = null;
  let siteAcknowledged = false;

  // Listen for context broadcasts from pooter.world pages
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.type === 'POOTER_SITE_CONTEXT') {
      siteContext = event.data.payload ?? null;
    }
    // Site acknowledged the extension — full unison mode active
    if (event.data?.type === 'POOTER_SITE_ACKNOWLEDGED') {
      siteAcknowledged = true;
      console.log('[pooter] site acknowledged extension — unison mode active');
      // Notify background so popup can show enhanced features
      chrome.runtime.sendMessage({ type: 'SITE_UNISON_ACTIVE', version: event.data.version });
    }
  });

  // Respond to popup queries for site context
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'GET_SITE_CONTEXT') {
      sendResponse({ ok: true, data: siteContext, unisonActive: siteAcknowledged });
      return true;
    }

    // Relay rating events from popup → page so pooter.world can refresh
    if (msg.type === 'POOTER_EXTENSION_RATED') {
      window.postMessage({
        type: 'POOTER_EXTENSION_RATED',
        entityHash: msg.entityHash,
        score: msg.score,
      }, '*');
      sendResponse({ ok: true });
      return true;
    }

    return false;
  });

  // Tell pooter.world that the extension is present
  window.postMessage({ type: 'POOTER_EXTENSION_PRESENT', version: '0.1.0' }, '*');
}
