import { scanPage } from './detector';
import { startObserver } from './observer';
import { setupTooltip } from './tooltip';
import { setupBiasOverlay } from './bias-overlay';
import { setupPanel } from './panel';

// Scan current page for entities
scanPage();

// Watch for new DOM nodes (SPAs)
startObserver();

// Hover tooltips
setupTooltip();

// Bias pill on news sites
setupBiasOverlay();

// Click-to-open conversation panel
setupPanel();

// Notify service worker of page load
chrome.runtime.sendMessage({
  type: 'PAGE_LOADED',
  url: window.location.href,
  domain: window.location.hostname,
});
