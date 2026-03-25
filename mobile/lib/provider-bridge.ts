/**
 * EIP-1193 provider script to inject into WebView.
 * Adapted from extension/src/content/provider.ts for react-native-webview.
 *
 * Communication: WebView JS ↔ React Native via postMessage/injectJavaScript.
 */

export function buildProviderScript(chainId: number, address: string | null): string {
  const chainIdHex = `0x${chainId.toString(16)}`;
  const addrArray = address ? `["${address}"]` : '[]';

  return `(function() {
  if (window.__pooterInjected) return;
  window.__pooterInjected = true;

  // ── Event emitter ─────────────────────────────────────────────────
  var listeners = {};
  function emit(event) {
    var args = Array.prototype.slice.call(arguments, 1);
    var fns = listeners[event] || [];
    for (var i = 0; i < fns.length; i++) {
      try { fns[i].apply(null, args); } catch(e) { console.error('pooter event error:', e); }
    }
  }

  // ── Request/response via postMessage ──────────────────────────────
  var requestId = 0;
  var pending = {};

  // RN will call this to deliver responses
  window.__pooterResponse = function(id, result, error) {
    var p = pending[id];
    if (!p) return;
    delete pending[id];
    if (error) {
      p.reject(new Error(error));
    } else {
      p.resolve(result);
    }
  };

  // RN will call this to emit events (accountsChanged, chainChanged, etc.)
  window.__pooterEmit = function(event, data) {
    emit(event, data);
  };

  function sendRequest(method, params) {
    return new Promise(function(resolve, reject) {
      var id = ++requestId;
      pending[id] = { resolve: resolve, reject: reject };

      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'ETH_REQUEST',
        id: id,
        method: method,
        params: params || []
      }));

      setTimeout(function() {
        if (pending[id]) {
          delete pending[id];
          reject(new Error('pooter wallet: request timed out'));
        }
      }, 60000);
    });
  }

  // ── EIP-1193 provider ─────────────────────────────────────────────
  var provider = {
    isPooterWallet: true,
    isMetaMask: true,  // compat shim for dApps that check this

    isConnected: function() { return true; },

    request: function(args) {
      var method = args.method;
      var params = args.params || [];

      // Handle locally for speed
      if (method === 'eth_chainId') return Promise.resolve('${chainIdHex}');
      if (method === 'net_version') return Promise.resolve('${chainId}');
      if (method === 'eth_accounts') return Promise.resolve(${addrArray});
      if (method === 'eth_requestAccounts') return Promise.resolve(${addrArray});

      return sendRequest(method, params);
    },

    on: function(event, listener) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(listener);
    },

    removeListener: function(event, listener) {
      var arr = listeners[event];
      if (!arr) return;
      var idx = arr.indexOf(listener);
      if (idx >= 0) arr.splice(idx, 1);
    },

    removeAllListeners: function(event) {
      if (event) { listeners[event] = []; }
      else { listeners = {}; }
    },

    // chainId getter for legacy dApps
    get chainId() { return '${chainIdHex}'; },
    get networkVersion() { return '${chainId}'; },
    get selectedAddress() { return ${address ? `'${address}'` : 'null'}; },
  };

  Object.freeze(provider);

  // Inject as window.ethereum (primary) + window.pooterWallet
  window.ethereum = provider;
  window.pooterWallet = provider;

  // EIP-6963 announcement
  var info = {
    uuid: 'a7c3e8f1-pooter-4b9d-wallet-1234567890ab',
    name: 'pooter world',
    icon: 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#1A1A1A"/><text x="32" y="44" text-anchor="middle" font-family="serif" font-size="32" font-weight="bold" fill="#F5F0E8">P</text></svg>'),
    rdns: 'world.pooter',
  };

  window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
    detail: Object.freeze({ info: info, provider: provider })
  }));

  window.addEventListener('eip6963:requestProvider', function() {
    window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
      detail: Object.freeze({ info: info, provider: provider })
    }));
  });

  console.log('pooter world wallet injected (mobile)');
})();
true;`;
}
