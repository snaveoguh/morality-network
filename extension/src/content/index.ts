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
