import "server-only";

/**
 * chain-scanner.ts — Multi-chain entity data fetcher.
 *
 * Reads onchain data for contracts, tokens, and addresses on Base and Solana.
 * Extracts risk flags (honeypot, bundled launch, mint authority, etc.)
 * for the Morality Registry scoring pipeline.
 */

// ============================================================================
// TYPES
// ============================================================================

export type ScanChain = "base" | "solana" | "ethereum";

export interface ChainScanResult {
  chain: ScanChain;
  entityType: "contract" | "token" | "address";
  identifier: string;
  riskFlags: string[];
  riskScore: number; // 0-100
  metadata: {
    creator?: string;
    createdAt?: number;
    verified?: boolean;
    liquidityUsd?: number;
    holderCount?: number;
    topHolderPct?: number;
    name?: string;
    symbol?: string;
  };
  /** Raw data for LLM analysis */
  rawSummary: string;
}

// ============================================================================
// CHAIN DETECTION
// ============================================================================

/** Detect which chain an address belongs to */
export function detectChain(input: string): { chain: ScanChain; type: "contract" | "address" } | null {
  const trimmed = input.trim();

  // Solana: base58, 32-44 chars, no 0x prefix
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed)) {
    return { chain: "solana", type: "address" }; // could be contract or wallet
  }

  // EVM: 0x + 40 hex chars
  if (/^0x[a-fA-F0-9]{40}$/i.test(trimmed)) {
    return { chain: "base", type: "address" }; // default to Base
  }

  return null;
}

// ============================================================================
// BASE / EVM SCANNER
// ============================================================================

const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY ?? "";
const BASESCAN_URL = "https://api.basescan.org/api";
const BASE_RPC = process.env.BASE_RPC_URL || "https://mainnet.base.org";

export async function scanBaseEntity(address: string): Promise<ChainScanResult> {
  const flags: string[] = [];
  let riskScore = 0;
  const metadata: ChainScanResult["metadata"] = {};
  const summaryParts: string[] = [];

  // 1. Check if contract or EOA
  try {
    const codeRes = await fetch(BASE_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getCode",
        params: [address, "latest"],
        id: 1,
      }),
      signal: AbortSignal.timeout(5000),
    });
    const codeData = (await codeRes.json()) as { result?: string };
    const isContract = codeData.result && codeData.result !== "0x";

    if (!isContract) {
      return {
        chain: "base",
        entityType: "address",
        identifier: address,
        riskFlags: [],
        riskScore: 0,
        metadata,
        rawSummary: `EOA wallet ${address} on Base.`,
      };
    }
    summaryParts.push(`Contract detected at ${address} on Base.`);
  } catch {
    summaryParts.push(`Could not verify code at ${address}.`);
  }

  // 2. Basescan: get contract source + verification status
  if (BASESCAN_API_KEY) {
    try {
      const params = new URLSearchParams({
        module: "contract",
        action: "getsourcecode",
        address,
        apikey: BASESCAN_API_KEY,
      });
      const res = await fetch(`${BASESCAN_URL}?${params}`, { signal: AbortSignal.timeout(8000) });
      const data = (await res.json()) as {
        result?: Array<{
          ContractName?: string;
          SourceCode?: string;
          ABI?: string;
          Proxy?: string;
          Implementation?: string;
        }>;
      };
      const info = data.result?.[0];
      if (info) {
        metadata.name = info.ContractName || undefined;
        metadata.verified = !!(info.SourceCode && info.SourceCode !== "");

        if (!metadata.verified) {
          flags.push("unverified-source");
          riskScore += 25;
          summaryParts.push("Contract source is NOT verified on Basescan.");
        } else {
          summaryParts.push(`Verified contract: ${info.ContractName}.`);

          // Check for dangerous patterns in source code
          const src = (info.SourceCode || "").toLowerCase();
          if (src.includes("selfdestruct") || src.includes("delegatecall")) {
            flags.push("selfdestruct-or-delegatecall");
            riskScore += 20;
            summaryParts.push("Contains selfdestruct or delegatecall.");
          }
          if (src.includes("onlyowner") && !src.includes("renounceownership")) {
            flags.push("ownership-not-renounced");
            riskScore += 10;
            summaryParts.push("Has owner functions, ownership not renounced.");
          }
          if (src.includes("mint") && src.includes("onlyowner")) {
            flags.push("owner-can-mint");
            riskScore += 15;
            summaryParts.push("Owner has mint authority.");
          }
        }

        if (info.Proxy === "1") {
          flags.push("proxy-contract");
          riskScore += 10;
          summaryParts.push(`Proxy contract, implementation at ${info.Implementation}.`);
        }
      }
    } catch {
      summaryParts.push("Basescan API unavailable.");
    }
  }

  // 3. Check transaction count (activity level)
  if (BASESCAN_API_KEY) {
    try {
      const params = new URLSearchParams({
        module: "account",
        action: "txlist",
        address,
        startblock: "0",
        endblock: "99999999",
        page: "1",
        offset: "1",
        sort: "asc",
        apikey: BASESCAN_API_KEY,
      });
      const res = await fetch(`${BASESCAN_URL}?${params}`, { signal: AbortSignal.timeout(5000) });
      const data = (await res.json()) as { result?: Array<{ timeStamp?: string; from?: string }> };
      const firstTx = data.result?.[0];
      if (firstTx?.timeStamp) {
        metadata.createdAt = Number(firstTx.timeStamp) * 1000;
        metadata.creator = firstTx.from;
        summaryParts.push(`Created by ${firstTx.from} at ${new Date(metadata.createdAt).toISOString()}.`);
      }
    } catch {
      // non-fatal
    }
  }

  return {
    chain: "base",
    entityType: "contract",
    identifier: address,
    riskFlags: flags,
    riskScore: Math.min(100, riskScore),
    metadata,
    rawSummary: summaryParts.join(" "),
  };
}

// ============================================================================
// SOLANA SCANNER
// ============================================================================

const HELIUS_API_KEY = process.env.HELIUS_API_KEY ?? "";
const HELIUS_RPC = HELIUS_API_KEY
  ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
  : "https://api.mainnet-beta.solana.com";

export async function scanSolanaEntity(address: string): Promise<ChainScanResult> {
  const flags: string[] = [];
  let riskScore = 0;
  const metadata: ChainScanResult["metadata"] = {};
  const summaryParts: string[] = [];

  // 1. Get account info to determine type
  try {
    const res = await fetch(HELIUS_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getAccountInfo",
        params: [address, { encoding: "jsonParsed" }],
      }),
      signal: AbortSignal.timeout(8000),
    });
    const data = (await res.json()) as {
      result?: { value?: { owner?: string; data?: { parsed?: { type?: string; info?: Record<string, unknown> } } } };
    };
    const account = data.result?.value;

    if (!account) {
      return {
        chain: "solana",
        entityType: "address",
        identifier: address,
        riskFlags: ["account-not-found"],
        riskScore: 50,
        metadata,
        rawSummary: `Account ${address} not found on Solana.`,
      };
    }

    const owner = account.owner;
    summaryParts.push(`Account owned by program: ${owner}.`);

    // Check if it's a token mint
    if (owner === "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" ||
        owner === "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb") {
      const parsed = account.data?.parsed;
      if (parsed?.type === "mint") {
        const info = parsed.info as Record<string, unknown>;
        metadata.name = String(info.name ?? "");
        metadata.symbol = String(info.symbol ?? "");

        // Check mint authority
        if (info.mintAuthority) {
          flags.push("mint-authority-retained");
          riskScore += 20;
          summaryParts.push(`Mint authority retained: ${info.mintAuthority}.`);
        } else {
          summaryParts.push("Mint authority disabled (good).");
        }

        // Check freeze authority
        if (info.freezeAuthority) {
          flags.push("freeze-authority-active");
          riskScore += 25;
          summaryParts.push(`Freeze authority active: ${info.freezeAuthority}. Tokens can be frozen.`);
        }

        const supply = Number(info.supply ?? 0);
        const decimals = Number(info.decimals ?? 0);
        if (supply > 0) {
          summaryParts.push(`Supply: ${(supply / 10 ** decimals).toLocaleString()} tokens.`);
        }
      }
    }
  } catch (err) {
    summaryParts.push(`Failed to fetch account: ${err instanceof Error ? err.message : "unknown"}.`);
  }

  // 2. Helius DAS API — rich token metadata
  if (HELIUS_API_KEY) {
    try {
      const res = await fetch(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getAsset",
          params: { id: address },
        }),
        signal: AbortSignal.timeout(8000),
      });
      const data = (await res.json()) as {
        result?: {
          content?: { metadata?: { name?: string; symbol?: string } };
          ownership?: { owner?: string };
          supply?: { print_current_supply?: number };
          creators?: Array<{ address: string; share: number }>;
        };
      };
      const asset = data.result;
      if (asset) {
        metadata.name = asset.content?.metadata?.name || metadata.name;
        metadata.symbol = asset.content?.metadata?.symbol || metadata.symbol;
        metadata.creator = asset.creators?.[0]?.address;

        // Check creator share
        const creatorShare = asset.creators?.[0]?.share ?? 0;
        if (creatorShare > 50) {
          flags.push("high-creator-share");
          riskScore += 15;
          summaryParts.push(`Creator holds ${creatorShare}% share.`);
        }
      }
    } catch {
      // DAS not available, non-fatal
    }
  }

  // 3. Check for bundled launch indicators
  // (Would need transaction history analysis — simplified version here)
  if (HELIUS_API_KEY) {
    try {
      const res = await fetch(`https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${HELIUS_API_KEY}&limit=10&type=SWAP`, {
        signal: AbortSignal.timeout(8000),
      });
      const txs = (await res.json()) as Array<{
        timestamp?: number;
        feePayer?: string;
        type?: string;
      }>;

      if (txs.length > 0) {
        // Check if multiple different wallets swapped in the same second (bundled)
        const firstTimestamp = txs[0]?.timestamp;
        const sameSec = txs.filter((tx) => tx.timestamp === firstTimestamp);
        const uniquePayers = new Set(sameSec.map((tx) => tx.feePayer));
        if (uniquePayers.size >= 3) {
          flags.push("bundled-launch");
          riskScore += 30;
          summaryParts.push(`Bundled launch detected: ${uniquePayers.size} unique wallets in first block.`);
        }
      }
    } catch {
      // non-fatal
    }
  }

  return {
    chain: "solana",
    entityType: flags.some((f) => f.includes("mint")) || metadata.symbol ? "token" : "contract",
    identifier: address,
    riskFlags: flags,
    riskScore: Math.min(100, riskScore),
    metadata,
    rawSummary: summaryParts.join(" "),
  };
}

// ============================================================================
// UNIFIED SCANNER
// ============================================================================

export async function scanEntity(input: string): Promise<ChainScanResult | null> {
  const detected = detectChain(input);
  if (!detected) return null;

  if (detected.chain === "solana") {
    return scanSolanaEntity(input);
  }

  return scanBaseEntity(input);
}
