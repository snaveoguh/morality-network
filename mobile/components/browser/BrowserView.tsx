/**
 * Core browser component — WebView with EIP-1193 provider injection
 * and entity detection. This is the most complex component.
 */
import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useCallback,
} from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';
import { buildProviderScript } from '../../lib/provider-bridge';
import { buildDetectorScript } from '../../lib/detector-script';
import { getEvmAddress, getEvmAccount, isLocked } from '../../lib/wallet';
import { getChainId, getPublicClient } from '../../lib/evm-client';

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

export const BrowserView = forwardRef<BrowserViewHandle, Props>(
  ({ url, onPageMeta, onNavigationStateChange, onEntitiesDetected }, ref) => {
    const webviewRef = useRef<WebView>(null);

    useImperativeHandle(ref, () => ({
      goBack: () => webviewRef.current?.goBack(),
      goForward: () => webviewRef.current?.goForward(),
      refresh: () => webviewRef.current?.reload(),
    }));

    // Build the provider injection script
    const address = getEvmAddress();
    const chainId = getChainId();
    const providerScript = buildProviderScript(chainId, address);

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
    }, [onPageMeta, onEntitiesDetected]);

    // EIP-1193 request handler — ported from extension/src/background/index.ts
    async function handleEip1193Request(method: string, params: any[]): Promise<unknown> {
      const client = getPublicClient();

      switch (method) {
        case 'personal_sign': {
          if (isLocked()) throw new Error('Wallet locked');
          const account = getEvmAccount();
          const message = params[0] as string;
          return account.signMessage({ message: { raw: message as `0x${string}` } });
        }

        case 'eth_signTypedData_v4': {
          if (isLocked()) throw new Error('Wallet locked');
          const account = getEvmAccount();
          const typedData = JSON.parse(params[1] as string);
          return account.signTypedData(typedData);
        }

        case 'eth_sendTransaction': {
          if (isLocked()) throw new Error('Wallet locked');
          const account = getEvmAccount();
          const tx = params[0] as any;
          const { getWalletClient } = await import('../../lib/evm-client');
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
    }

    const handleNavigationStateChange = useCallback(
      (state: WebViewNavigation) => {
        onNavigationStateChange?.({
          canGoBack: state.canGoBack,
          canGoForward: state.canGoForward,
          url: state.url,
        });
      },
      [onNavigationStateChange],
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
      </View>
    );
  },
);

BrowserView.displayName = 'BrowserView';

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1 },
});
