'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface ChainStatus {
  verified: boolean; // true = Helios-verified, false = RPC-only fallback
  blockNumber: number | null;
  error: string | null;
}

type HeliosProvider = {
  request: (req: { method: string; params?: unknown[] }) => Promise<unknown>;
  waitSynced: () => Promise<void>;
  shutdown: () => Promise<void>;
};

type CreateHeliosProvider = (
  config: {
    executionRpc?: string;
    consensusRpc?: string;
    network?: string;
  },
  kind: 'ethereum' | 'opstack',
) => Promise<HeliosProvider>;

const POLL_INTERVAL = 12_000;

/** Fetch block number directly from an execution RPC (unverified fallback) */
async function fetchBlockFromRpc(rpcUrl: string): Promise<number | null> {
  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }),
    });
    const data = await res.json();
    return parseInt(data.result, 16);
  } catch {
    return null;
  }
}

async function bootWithRetry(
  create: CreateHeliosProvider,
  config: Parameters<CreateHeliosProvider>[0],
  kind: Parameters<CreateHeliosProvider>[1],
  maxRetries = 2,
): Promise<HeliosProvider> {
  for (let i = 0; i <= maxRetries; i++) {
    try {
      const provider = await create(config, kind);
      await provider.waitSynced();
      return provider;
    } catch (e) {
      if (i === maxRetries) throw e;
      console.warn(`[helios] ${kind} attempt ${i + 1} failed, retrying...`);
      await new Promise(r => setTimeout(r, 2000 * (i + 1)));
    }
  }
  throw new Error('unreachable');
}

export default function HeliosStatusBar() {
  const [eth, setEth] = useState<ChainStatus>({ verified: false, blockNumber: null, error: null });
  const [base, setBase] = useState<ChainStatus>({ verified: false, blockNumber: null, error: null });
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const ethRef = useRef<HeliosProvider | null>(null);
  const baseRef = useRef<HeliosProvider | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pollBlock = useCallback(async (provider: HeliosProvider): Promise<number | null> => {
    try {
      const hex = (await provider.request({ method: 'eth_blockNumber' })) as string;
      return parseInt(hex, 16);
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        const { createHeliosProvider } = (await import('@a16z/helios')) as {
          createHeliosProvider: CreateHeliosProvider;
        };

        const ethRpc = 'https://ethereum-rpc.publicnode.com';
        const baseRpc = 'https://base-rpc.publicnode.com';

        setLoading(false);

        // Boot Ethereum mainnet — try Helios, fall back to RPC polling
        bootWithRetry(
          createHeliosProvider,
          {
            executionRpc: ethRpc,
            consensusRpc: 'https://www.lightclientdata.org',
            network: 'mainnet',
          },
          'ethereum',
        ).then(async (provider) => {
          if (cancelled) { await provider.shutdown(); return; }
          ethRef.current = provider;
          const block = await pollBlock(provider);
          setEth({ verified: true, blockNumber: block, error: null });
        }).catch(async () => {
          // Fallback: poll block number directly from execution RPC (not trustlessly verified)
          if (cancelled) return;
          console.warn('[helios] ETH light client unavailable, falling back to RPC polling');
          const block = await fetchBlockFromRpc(ethRpc);
          setEth({ verified: false, blockNumber: block, error: null });
        });

        // Boot Base (OP Stack)
        bootWithRetry(
          createHeliosProvider,
          {
            executionRpc: baseRpc,
            consensusRpc: 'https://www.lightclientdata.org',
            network: 'base',
          },
          'opstack',
        ).then(async (provider) => {
          if (cancelled) { await provider.shutdown(); return; }
          baseRef.current = provider;
          const block = await pollBlock(provider);
          setBase({ verified: true, blockNumber: block, error: null });
        }).catch(async () => {
          if (cancelled) return;
          console.warn('[helios] BASE light client unavailable, falling back to RPC polling');
          const block = await fetchBlockFromRpc(baseRpc);
          setBase({ verified: false, blockNumber: block, error: null });
        });

        // Poll block numbers
        intervalRef.current = setInterval(async () => {
          if (ethRef.current) {
            const block = await pollBlock(ethRef.current);
            if (block) setEth(s => ({ ...s, blockNumber: block }));
          } else {
            const block = await fetchBlockFromRpc('https://ethereum-rpc.publicnode.com');
            if (block) setEth(s => ({ ...s, blockNumber: block }));
          }
          if (baseRef.current) {
            const block = await pollBlock(baseRef.current);
            if (block) setBase(s => ({ ...s, blockNumber: block }));
          } else {
            const block = await fetchBlockFromRpc('https://base-rpc.publicnode.com');
            if (block) setBase(s => ({ ...s, blockNumber: block }));
          }
        }, POLL_INTERVAL);
      } catch (e) {
        if (!cancelled) {
          setLoading(false);
          const msg = e instanceof Error ? e.message : 'Failed to load';
          setEth(s => ({ ...s, error: msg }));
          setBase(s => ({ ...s, error: msg }));
        }
      }
    }

    const timeout = setTimeout(boot, 3000);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      if (intervalRef.current) clearInterval(intervalRef.current);
      ethRef.current?.shutdown().catch(() => {});
      baseRef.current?.shutdown().catch(() => {});
    };
  }, [pollBlock]);

  const fmtBlock = (n: number | null) => (n ? `#${n.toLocaleString()}` : '...');

  const dot = (s: ChainStatus) =>
    s.error ? 'bg-[var(--accent-red)]' : s.verified ? 'bg-green-600' : s.blockNumber ? 'bg-blue-500' : 'bg-amber-500';

  const label = (s: ChainStatus) =>
    s.error ? 'offline' : s.verified ? 'verified' : s.blockNumber ? 'tracking' : 'sync';

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="fixed bottom-0 left-0 z-[999] flex items-center gap-1 border-t border-r border-[var(--rule-light)] bg-[var(--paper-dark)] px-2 py-0.5 font-mono text-[10px] text-[var(--ink-faint)] hover:text-[var(--ink-light)] transition-colors"
        title="Expand Helios node status"
      >
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${eth.verified || base.verified ? 'bg-green-600' : eth.blockNumber || base.blockNumber ? 'bg-blue-500' : 'bg-amber-500'}`} />
        node
      </button>
    );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[999] flex items-center justify-between border-t border-[var(--rule-light)] bg-[var(--paper-dark)]/95 backdrop-blur-sm px-3 py-1 font-mono text-[10px] text-[var(--ink-faint)]">
      <div className="flex items-center gap-4">
        <span className="text-[var(--ink-light)] font-semibold tracking-wide uppercase">
          Helios Node
        </span>

        {/* Ethereum */}
        <span className="flex items-center gap-1.5">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${dot(eth)} ${!eth.blockNumber && !eth.error ? 'animate-pulse' : ''}`} />
          <span>ETH {label(eth)}</span>
          {eth.blockNumber && <span className="text-[var(--ink-light)]">{fmtBlock(eth.blockNumber)}</span>}
        </span>

        {/* Base */}
        <span className="flex items-center gap-1.5">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${dot(base)} ${!base.blockNumber && !base.error ? 'animate-pulse' : ''}`} />
          <span>BASE {label(base)}</span>
          {base.blockNumber && <span className="text-[var(--ink-light)]">{fmtBlock(base.blockNumber)}</span>}
        </span>

        {loading && <span className="animate-pulse">booting wasm...</span>}
      </div>

      <div className="flex items-center gap-3">
        <span className="hidden sm:inline opacity-60">a16z/helios light client</span>
        <button
          onClick={() => setCollapsed(true)}
          className="text-[var(--ink-faint)] hover:text-[var(--ink-light)] transition-colors leading-none"
          title="Collapse"
        >
          &times;
        </button>
      </div>
    </div>
  );
}
