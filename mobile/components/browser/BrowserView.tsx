/**
 * Core browser component — WebView with EIP-1193 provider injection
 * and entity detection. This is the most complex component.
 *
 * SECURITY: every wallet-touching method (eth_sendTransaction, personal_sign,
 * eth_signTypedData_v4) requires explicit user approval via TxApprovalModal.
 * Approvals auto-reject after 60 seconds, on navigation, and on unmount.
 */
import { Buffer } from 'buffer';
import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  useCallback,
  useEffect,
} from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';
import { buildProviderScript } from '../../lib/provider-bridge';
import { buildDetectorScript } from '../../lib/detector-script';
import { getEvmAddress, getEvmAccount, isLocked } from '../../lib/wallet';
import { getChainId, getPublicClient, getWalletClient } from '../../lib/evm-client';
import { TxApprovalModal, type ApprovalRequest } from './TxApprovalModal';

const APPROVAL_TIMEOUT_MS = 60_000;

export interface BrowserViewHandle {
  goBack: () => void;
  goForward: () => void;
  refresh: () => void;
}

interface Props {
  url: string;
  onPageMeta?: (meta: { title: string; url: string }) => void;
  onNavigationStateChange?: (state: {
    canGoBack: boolean;
    canGoForward: boolean;
    url: string;
  }) => void;
  onEntitiesDetected?: (entities: Array<{
    identifier: string;
    type: string;
    rect: { x: number; y: number; w: number; h: number };
  }>) => void;
}

interface PendingApproval {
  request: ApprovalRequest;
  respond: (approved: boolean) => void;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Best-effort UTF-8 decode of a personal_sign hex payload for display. */
function decodeSignMessage(raw: string): string {
  if (typeof raw !== 'string') return String(raw);
  if (!raw.startsWith('0x')) return raw;
  try {
    const bytes = Buffer.from(raw.slice(2), 'hex');
    const text = bytes.toString('utf8');
    // If it decodes to mostly printable text, show the text; else show hex.
    const printable = text.replace(/[^\x20-\x7E\n\r\t]/g, '');
    return printable.length >= text.length * 0.8 ? text : raw;
  } catch {
    return raw;
  }
}

export const BrowserView = forwardRef<BrowserViewHandle, Props>(
  ({ url, onPageMeta, onNavigationStateChange, onEntitiesDetected }, ref) => {
    const webviewRef = useRef<WebView>(null);

    // Approval state. `pendingRef` mirrors `pending` so navigation handlers
    // and timeouts can reject without stale-closure issues.
    const [pending, setPending] = useState<PendingApproval | null>(null);
    const pendingRef = useRef<PendingApproval | null>(null);
    const currentUrlRef = useRef(url);

    const clearPending = useCallback(() => {
      pendingRef.current = null;
      setPending(null);
    }, []);

    const rejectPending = useCallback((reason: string) => {
      const p = pendingRef.current;
      if (!p) return;
      clearPending();
      p.respond(false);
      void reason; // reason is surfaced via the thrown error at the await site
    }, [clearPending]);

    // Auto-reject any in-flight approval when the component unmounts.
    useEffect(() => () => rejectPending('unmounted'), [rejectPending]);

    /**
     * Ask the user to approve a wallet-touching request. Resolves true only
     * when Approve is tapped. Auto-rejects after APPROVAL_TIMEOUT_MS.
     * Only one approval can be pending at a time — concurrent requests are
     * rejected immediately rather than queued.
     */
    const requestApproval = useCallback((request: ApprovalRequest): Promise<boolean> => {
      return new Promise((resolve) => {
        if (pendingRef.current) {
          resolve(false);
          return;
        }
        let settled = false;
        const respond = (approved: boolean) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(approved);
        };
        const timer = setTimeout(() => {
          if (pendingRef.current?.respond === respond) clearPending();
          respond(false);
        }, APPROVAL_TIMEOUT_MS);
        const entry: PendingApproval = { request, respond };
        pendingRef.current = entry;
        setPending(entry);
      });
    }, [clearPending]);

    const handleApprove = useCallback(() => {
      const p = pendingRef.current;
      clearPending();
      p?.respond(true);
    }, [clearPending]);

    const handleReject = useCallback(() => {
      const p = pendingRef.current;
      clearPending();
      p?.respond(false);
    }, [clearPending]);

    useImperativeHandle(ref, () => ({
      goBack: () => webviewRef.current?.goBack(),
      goForward: () => webviewRef.current?.goForward(),
      refresh: () => webviewRef.current?.reload(),
    }));

    // Build the provider injection script
    const address = getEvmAddress();
    const chainId = getChainId();
    const providerScript = buildProviderScript(chainId, address);

    // EIP-1193 request handler — ported from extension/src/background/index.ts
    const handleEip1193Request = useCallback(async (
      method: string,
      params: any[],
    ): Promise<unknown> => {
      const client = getPublicClient();
      const origin = hostOf(currentUrlRef.current);

      switch (method) {
        case 'personal_sign': {
          if (isLocked()) throw new Error('Wallet locked');
          const raw = params[0] as string;
          const approved = await requestApproval({
            origin,
            method: 'personal_sign',
            message: decodeSignMessage(raw),
          });
          if (!approved) throw new Error('User rejected the request');
          const account = getEvmAccount();
          return account.signMessage({ message: { raw: raw as `0x${string}` } });
        }

        case 'eth_signTypedData_v4': {
          if (isLocked()) throw new Error('Wallet locked');
          const rawTyped = params[1] as string;
          const typedData = JSON.parse(rawTyped);
          const approved = await requestApproval({
            origin,
            method: 'eth_signTypedData_v4',
            message: JSON.stringify(typedData, null, 2),
          });
          if (!approved) throw new Error('User rejected the request');
          const account = getEvmAccount();
          return account.signTypedData(typedData);
        }

        case 'eth_sendTransaction': {
          if (isLocked()) throw new Error('Wallet locked');
          const tx = params[0] as any;
          const valueWei = tx.value ? BigInt(tx.value) : 0n;
          const approved = await requestApproval({
            origin,
            method: 'eth_sendTransaction',
            to: tx.to,
            valueWei,
            data: tx.data,
          });
          if (!approved) throw new Error('User rejected the request');
          const account = getEvmAccount();
          const walletClient = getWalletClient(account);
          return walletClient.sendTransaction({
            to: tx.to,
            value: tx.value ? BigInt(tx.value) : undefined,
            data: tx.data,
            gas: tx.gas ? BigInt(tx.gas) : undefined,
          });
        }

        case 'eth_getBalance': {
          const balance = await client.getBalance({
            address: params[0] as `0x${string}`,
            blockTag: (params[1] as any) || 'latest',
          });
          return `0x${balance.toString(16)}`;
        }

        case 'eth_blockNumber': {
          const block = await client.getBlockNumber();
          return `0x${block.toString(16)}`;
        }

        case 'eth_call': {
          const result = await client.call(params[0] as any);
          return result.data;
        }

        case 'eth_estimateGas': {
          const gas = await client.estimateGas(params[0] as any);
          return `0x${gas.toString(16)}`;
        }

        case 'eth_gasPrice': {
          const price = await client.getGasPrice();
          return `0x${price.toString(16)}`;
        }

        case 'eth_getCode': {
          const code = await client.getCode({
            address: params[0] as `0x${string}`,
          });
          return code;
        }

        case 'eth_getTransactionCount': {
          const count = await client.getTransactionCount({
            address: params[0] as `0x${string}`,
          });
          return `0x${count.toString(16)}`;
        }

        case 'eth_getTransactionReceipt': {
          const receipt = await client.getTransactionReceipt({
            hash: params[0] as `0x${string}`,
          });
          return receipt;
        }

        case 'wallet_switchEthereumChain': {
          const requestedChainId = parseInt(params[0]?.chainId, 16);
          if (requestedChainId !== chainId) {
            throw new Error(`Only chain ${chainId} is supported`);
          }
          return null;
        }

        case 'wallet_addEthereumChain':
          return null; // silently accept

        default:
          throw new Error(`Unsupported method: ${method}`);
      }
    }, [chainId, requestApproval]);

    // Handle messages from the WebView
    const handleMessage = useCallback(async (event: WebViewMessageEvent) => {
      let data: any;
      try {
        data = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }

      if (data.type === 'PAGE_META') {
        onPageMeta?.({ title: data.title, url: data.url });
        return;
      }

      if (data.type === 'ENTITIES_DETECTED') {
        onEntitiesDetected?.(data.entities || []);
        return;
      }

      if (data.type === 'ETH_REQUEST') {
        const { id, method, params } = data;
        try {
          const result = await handleEip1193Request(method, params || []);
          webviewRef.current?.injectJavaScript(
            `window.__pooterResponse(${id}, ${JSON.stringify(result)}, null); true;`
          );
        } catch (err: any) {
          webviewRef.current?.injectJavaScript(
            `window.__pooterResponse(${id}, null, ${JSON.stringify(err.message || 'Unknown error')}); true;`
          );
        }
      }
    }, [onPageMeta, onEntitiesDetected, handleEip1193Request]);

    const handleNavigationStateChange = useCallback(
      (state: WebViewNavigation) => {
        // Navigating away invalidates any approval the user is looking at —
        // the page (and therefore the requester) may no longer be the same.
        if (state.url !== currentUrlRef.current) {
          currentUrlRef.current = state.url;
          rejectPending('navigation');
        }
        onNavigationStateChange?.({
          canGoBack: state.canGoBack,
          canGoForward: state.canGoForward,
          url: state.url,
        });
      },
      [onNavigationStateChange, rejectPending],
    );

    const handleLoadEnd = useCallback(() => {
      // Inject entity detector after page loads
      webviewRef.current?.injectJavaScript(buildDetectorScript());
    }, []);

    return (
      <View style={styles.container}>
        <WebView
          ref={webviewRef}
          source={{ uri: url }}
          style={styles.webview}
          injectedJavaScriptBeforeContentLoaded={providerScript}
          onMessage={handleMessage}
          onNavigationStateChange={handleNavigationStateChange}
          onLoadEnd={handleLoadEnd}
          javaScriptEnabled
          domStorageEnabled
          allowsBackForwardNavigationGestures
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          setSupportMultipleWindows={false}
          originWhitelist={['*']}
        />
        <TxApprovalModal
          request={pending?.request ?? null}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      </View>
    );
  },
);

BrowserView.displayName = 'BrowserView';

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1 },
});
