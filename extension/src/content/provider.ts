/**
 * pooter world — EIP-1193 Provider
 *
 * This script runs in the page's MAIN world (not the isolated content script world).
 * It creates `window.pooterWallet` as a standard EIP-1193 provider that dapps (like
 * the pooter website via RainbowKit) can connect to.
 *
 * Communication: page ↔ content script via window.postMessage
 */

interface EIP1193Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener: (event: string, listener: (...args: unknown[]) => void) => void;
  isConnected: () => boolean;
  // Metadata
  isPooterWallet: boolean;
}

// ============================================================================
// EVENT EMITTER
// ============================================================================

type Listener = (...args: unknown[]) => void;
const listeners: Record<string, Listener[]> = {};

function emit(event: string, ...args: unknown[]) {
  for (const fn of listeners[event] || []) {
    try { fn(...args); } catch (e) { console.error('pooter event error:', e); }
  }
}

// ============================================================================
// REQUEST/RESPONSE via postMessage
// ============================================================================

let requestId = 0;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

// Listen for responses from the content script
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.data?.type !== 'POOTER_PROVIDER_RESPONSE') return;

  const { id, result, error } = event.data;
  const p = pending.get(id);
  if (!p) return;
  pending.delete(id);

  if (error) {
    p.reject(new Error(error));
  } else {
    p.resolve(result);
  }
});

// Listen for events pushed from the content script (accountsChanged, chainChanged, etc.)
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.data?.type !== 'POOTER_PROVIDER_EVENT') return;
  emit(event.data.event, event.data.data);
});

function sendRequest(method: string, params?: unknown[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    pending.set(id, { resolve, reject });

    window.postMessage({
      type: 'POOTER_PROVIDER_REQUEST',
      id,
      method,
      params: params || [],
    }, '*');

    // Timeout after 60s
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error('pooter wallet: request timed out'));
      }
    }, 60000);
  });
}

// ============================================================================
// EIP-1193 PROVIDER
// ============================================================================

const pooterWallet: EIP1193Provider = {
  isPooterWallet: true,

  isConnected() {
    return true; // always "connected" — wallet availability check happens via eth_accounts
  },

  async request({ method, params }: { method: string; params?: unknown[] }) {
    return sendRequest(method, params);
  },

  on(event: string, listener: Listener) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(listener);
  },

  removeListener(event: string, listener: Listener) {
    const arr = listeners[event];
    if (!arr) return;
    const idx = arr.indexOf(listener);
    if (idx >= 0) arr.splice(idx, 1);
  },
};

// Freeze to prevent tampering
Object.freeze(pooterWallet);

// Inject into window
(window as any).pooterWallet = pooterWallet;

// Also announce via EIP-6963 (wallet discovery standard)
const pooterInfo = {
  uuid: 'a7c3e8f1-pooter-4b9d-wallet-1234567890ab',
  name: 'pooter world',
  icon: 'data:image/svg+xml;base64,' + btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#1A1A1A"/><text x="32" y="44" text-anchor="middle" font-family="serif" font-size="32" font-weight="bold" fill="#F5F0E8">P</text></svg>`),
  rdns: 'world.pooter',
};

// Dispatch EIP-6963 announce event
window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
  detail: Object.freeze({ info: pooterInfo, provider: pooterWallet }),
}));

// Listen for EIP-6963 request events and re-announce
window.addEventListener('eip6963:requestProvider', () => {
  window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
    detail: Object.freeze({ info: pooterInfo, provider: pooterWallet }),
  }));
});

console.log('pooter world wallet injected');
