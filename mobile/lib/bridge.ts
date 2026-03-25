/**
 * LI.FI bridge wrapper — EVM↔EVM only (Base ↔ ETH mainnet).
 */

// LI.FI types (subset)
export interface BridgeQuote {
  fromChain: number;
  toChain: number;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  toAmount: string;
  estimatedGas: string;
  estimatedTime: number; // seconds
  route: unknown; // opaque route object for execution
}

const LIFI_API = 'https://li.quest/v1';

export const CHAINS = {
  BASE: 8453,
  ETH_MAINNET: 1,
} as const;

// Native ETH address used by LI.FI
const NATIVE_TOKEN = '0x0000000000000000000000000000000000000000';

export async function getQuote(params: {
  fromChain: number;
  toChain: number;
  fromAmount: string; // in wei
  fromAddress: string;
}): Promise<BridgeQuote> {
  const url = new URL(`${LIFI_API}/quote`);
  url.searchParams.set('fromChain', params.fromChain.toString());
  url.searchParams.set('toChain', params.toChain.toString());
  url.searchParams.set('fromToken', NATIVE_TOKEN);
  url.searchParams.set('toToken', NATIVE_TOKEN);
  url.searchParams.set('fromAmount', params.fromAmount);
  url.searchParams.set('fromAddress', params.fromAddress);
  url.searchParams.set('integrator', 'pooter-world');

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`LI.FI quote failed: ${res.status}`);

  const data = await res.json();
  return {
    fromChain: params.fromChain,
    toChain: params.toChain,
    fromToken: NATIVE_TOKEN,
    toToken: NATIVE_TOKEN,
    fromAmount: params.fromAmount,
    toAmount: data.estimate?.toAmount || '0',
    estimatedGas: data.estimate?.gasCosts?.[0]?.amount || '0',
    estimatedTime: data.estimate?.executionDuration || 0,
    route: data,
  };
}
