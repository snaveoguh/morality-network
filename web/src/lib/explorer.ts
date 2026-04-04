import "server-only";

/**
 * explorer.ts — Data layer for the pooter.world entity explorer.
 *
 * Server-only module providing ABI fetching, source code retrieval,
 * transaction history, balance lookups, ABI grouping, and ENS resolution
 * for both Base and Ethereum mainnet.
 */

import type { Abi, AbiFunction } from "viem";

// ============================================================================
// CONFIG
// ============================================================================

const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY ?? "";
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY ?? "";
const BASE_RPC = process.env.BASE_RPC_URL || "https://mainnet.base.org";
const ETHEREUM_RPC = process.env.ETHEREUM_RPC_URL || "https://eth.llamarpc.com";

const EXPLORER_URLS: Record<string, string> = {
  base: "https://api.basescan.org/api",
  ethereum: "https://api.etherscan.io/api",
};

function apiKey(chain: "base" | "ethereum"): string {
  return chain === "base" ? BASESCAN_API_KEY : ETHERSCAN_API_KEY;
}

function rpcUrl(chain: "base" | "ethereum"): string {
  return chain === "base" ? BASE_RPC : ETHEREUM_RPC;
}

const TIMEOUT = 8000;

// ============================================================================
// CACHES
// ============================================================================

const abiCache = new Map<string, Abi>();

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/** Build a URL for the block-explorer API. */
function explorerUrl(
  chain: "base" | "ethereum",
  params: Record<string, string>,
): string {
  const key = apiKey(chain);
  const qs = new URLSearchParams({ ...params, apikey: key });
  return `${EXPLORER_URLS[chain]}?${qs}`;
}

/** JSON-RPC helper. */
async function rpcCall<T>(
  chain: "base" | "ethereum",
  method: string,
  params: unknown[],
): Promise<T> {
  const res = await fetch(rpcUrl(chain), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  const data = (await res.json()) as { result?: T; error?: { message: string } };
  if (data.error) throw new Error(data.error.message);
  return data.result as T;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Fetch the ABI for a verified contract from Basescan / Etherscan.
 * Results are cached in-memory by `chain:address`.
 */
export async function fetchContractAbi(
  address: string,
  chain: "base" | "ethereum" = "base",
): Promise<Abi> {
  const cacheKey = `${chain}:${address.toLowerCase()}`;
  const cached = abiCache.get(cacheKey);
  if (cached) return cached;

  const url = explorerUrl(chain, {
    module: "contract",
    action: "getabi",
    address,
  });

  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) });
  const data = (await res.json()) as { status: string; result: string; message: string };

  if (data.status !== "1" || !data.result) {
    throw new Error(`ABI not available: ${data.message ?? "unknown error"}`);
  }

  const abi: Abi = JSON.parse(data.result);
  abiCache.set(cacheKey, abi);
  return abi;
}

/**
 * Fetch verified source code for a contract from Basescan / Etherscan.
 * Handles both single-file and multi-file (JSON standard input) formats.
 */
export async function fetchContractSource(
  address: string,
  chain: "base" | "ethereum" = "base",
): Promise<{
  contractName: string;
  sources: Array<{ name: string; content: string }>;
  compiler: string;
  optimizationUsed: boolean;
  runs: number;
  evmVersion: string;
  proxy: boolean;
  implementation?: string;
}> {
  const url = explorerUrl(chain, {
    module: "contract",
    action: "getsourcecode",
    address,
  });

  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) });
  const data = (await res.json()) as {
    status: string;
    result?: Array<{
      ContractName?: string;
      SourceCode?: string;
      CompilerVersion?: string;
      OptimizationUsed?: string;
      Runs?: string;
      EVMVersion?: string;
      Proxy?: string;
      Implementation?: string;
    }>;
  };

  const info = data.result?.[0];
  if (!info || !info.SourceCode) {
    throw new Error("Source code not available or contract not verified");
  }

  // Parse sources — Etherscan wraps multi-file JSON in double braces: {{...}}
  const sources: Array<{ name: string; content: string }> = [];
  let rawSource = info.SourceCode;

  if (rawSource.startsWith("{{") && rawSource.endsWith("}}")) {
    // Multi-file JSON standard input format
    rawSource = rawSource.slice(1, -1); // strip outer braces
    try {
      const parsed = JSON.parse(rawSource) as {
        sources?: Record<string, { content: string }>;
      };
      if (parsed.sources) {
        for (const [name, entry] of Object.entries(parsed.sources)) {
          sources.push({ name, content: entry.content });
        }
      }
    } catch {
      // Fallback: treat as single file
      sources.push({ name: `${info.ContractName ?? "Contract"}.sol`, content: rawSource });
    }
  } else if (rawSource.startsWith("{")) {
    // Single JSON object with sources map (alternative format)
    try {
      const parsed = JSON.parse(rawSource) as Record<string, { content: string }>;
      for (const [name, entry] of Object.entries(parsed)) {
        sources.push({ name, content: entry.content });
      }
    } catch {
      sources.push({ name: `${info.ContractName ?? "Contract"}.sol`, content: rawSource });
    }
  } else {
    // Plain Solidity source
    sources.push({ name: `${info.ContractName ?? "Contract"}.sol`, content: rawSource });
  }

  return {
    contractName: info.ContractName ?? "Unknown",
    sources,
    compiler: info.CompilerVersion ?? "unknown",
    optimizationUsed: info.OptimizationUsed === "1",
    runs: parseInt(info.Runs ?? "200", 10),
    evmVersion: info.EVMVersion ?? "default",
    proxy: info.Proxy === "1",
    implementation: info.Implementation || undefined,
  };
}

/**
 * Fetch recent transactions for an address from Basescan / Etherscan.
 * Returns 25 transactions per page with pagination support.
 */
export async function fetchTransactionHistory(
  address: string,
  page: number = 1,
  chain: "base" | "ethereum" = "base",
): Promise<{
  transactions: Array<{
    hash: string;
    from: string;
    to: string;
    value: string;
    functionName?: string;
    methodId: string;
    timestamp: number;
    isError: boolean;
    gasUsed: string;
    blockNumber: number;
  }>;
  hasMore: boolean;
}> {
  const pageSize = 25;

  const url = explorerUrl(chain, {
    module: "account",
    action: "txlist",
    address,
    startblock: "0",
    endblock: "99999999",
    page: String(page),
    offset: String(pageSize + 1), // fetch one extra to detect hasMore
    sort: "desc",
  });

  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) });
  const data = (await res.json()) as {
    status: string;
    result?: Array<{
      hash: string;
      from: string;
      to: string;
      value: string;
      functionName: string;
      methodId: string;
      timeStamp: string;
      isError: string;
      gasUsed: string;
      blockNumber: string;
    }>;
  };

  const raw = data.result ?? [];
  const hasMore = raw.length > pageSize;
  const items = raw.slice(0, pageSize);

  return {
    transactions: items.map((tx) => ({
      hash: tx.hash,
      from: tx.from,
      to: tx.to,
      value: tx.value,
      functionName: tx.functionName || undefined,
      methodId: tx.methodId,
      timestamp: parseInt(tx.timeStamp, 10),
      isError: tx.isError === "1",
      gasUsed: tx.gasUsed,
      blockNumber: parseInt(tx.blockNumber, 10),
    })),
    hasMore,
  };
}

/**
 * Fetch the ETH/native balance of an address via JSON-RPC.
 */
export async function fetchAddressBalance(
  address: string,
  chain: "base" | "ethereum" = "base",
): Promise<{ weiBalance: bigint; ethBalance: string }> {
  const hexBalance = await rpcCall<string>(chain, "eth_getBalance", [address, "latest"]);
  const weiBalance = BigInt(hexBalance);
  // Format to ETH with up to 18 decimals, trimming trailing zeros
  const ethRaw = (Number(weiBalance) / 1e18).toFixed(18);
  const ethBalance = ethRaw.replace(/\.?0+$/, "") || "0";

  return { weiBalance, ethBalance };
}

/**
 * Group ABI items into logical sections with read (view/pure) and write
 * (nonpayable/payable) function lists.
 *
 * Grouping heuristic:
 * - Functions matching well-known ERC interfaces are bucketed by standard name.
 * - Remaining functions go into a "Contract" group.
 */
export function parseAbiIntoGroups(
  abi: Abi,
): Map<string, { read: AbiFunction[]; write: AbiFunction[] }> {
  const groups = new Map<string, { read: AbiFunction[]; write: AbiFunction[] }>();

  // Well-known function names mapped to interface groups
  const ERC20_FNS = new Set([
    "name", "symbol", "decimals", "totalSupply", "balanceOf",
    "transfer", "transferFrom", "approve", "allowance",
  ]);
  const ERC721_FNS = new Set([
    "name", "symbol", "tokenURI", "balanceOf", "ownerOf",
    "approve", "getApproved", "setApprovalForAll", "isApprovedForAll",
    "transferFrom", "safeTransferFrom",
  ]);
  const ERC1155_FNS = new Set([
    "uri", "balanceOf", "balanceOfBatch",
    "setApprovalForAll", "isApprovedForAll",
    "safeTransferFrom", "safeBatchTransferFrom",
  ]);
  const OWNABLE_FNS = new Set([
    "owner", "renounceOwnership", "transferOwnership",
  ]);
  const PROXY_FNS = new Set([
    "upgradeTo", "upgradeToAndCall", "implementation", "proxiableUUID",
  ]);

  function getGroup(fn: AbiFunction): string {
    const n = fn.name;
    if (PROXY_FNS.has(n)) return "Proxy / Upgradeable";
    if (OWNABLE_FNS.has(n)) return "Ownable";
    if (ERC1155_FNS.has(n)) return "ERC-1155";
    // ERC-721 and ERC-20 overlap on name/symbol/balanceOf — differentiate by params
    if (ERC721_FNS.has(n) && n === "safeTransferFrom") return "ERC-721";
    if (ERC721_FNS.has(n) && (n === "ownerOf" || n === "tokenURI")) return "ERC-721";
    if (ERC20_FNS.has(n) && (n === "decimals" || n === "totalSupply")) return "ERC-20";
    // Shared names fall into a generic Token group
    if (ERC20_FNS.has(n) || ERC721_FNS.has(n)) return "Token";
    return "Contract";
  }

  for (const item of abi) {
    if (item.type !== "function") continue;
    const fn = item as AbiFunction;
    const groupName = getGroup(fn);

    let group = groups.get(groupName);
    if (!group) {
      group = { read: [], write: [] };
      groups.set(groupName, group);
    }

    if (fn.stateMutability === "view" || fn.stateMutability === "pure") {
      group.read.push(fn);
    } else {
      group.write.push(fn);
    }
  }

  return groups;
}

/**
 * Resolve an ENS name to an address, or validate a hex address.
 * ENS resolution uses Ethereum mainnet RPC regardless of selected chain.
 */
export async function resolveAddressOrEns(
  input: string,
): Promise<{ address: string; ensName?: string }> {
  const trimmed = input.trim();

  // If it looks like an ENS name (contains a dot), resolve via mainnet
  if (trimmed.includes(".")) {
    // ENS resolution: call addr(bytes32) on the ENS Universal Resolver
    // Using eth_call to the ENS registry via a simpler approach:
    // Encode the `resolve` call using the standard ENS offchain lookup
    // Simpler: use the `eth_call` to the ENS public resolver with namehash

    // We use a raw approach: call the ENS Universal Resolver at a known address
    // Universal Resolver on mainnet: 0xc0497E381f536Be9ce14B0dD3817cBcAe57d2F62
    const UNIVERSAL_RESOLVER = "0xc0497E381f536Be9ce14B0dD3817cBcAe57d2F62";

    // Encode DNS-format name
    const dnsName = encodeDnsName(trimmed);
    // resolve(bytes name, bytes data) where data = addr(bytes32 node)
    // addr(bytes32) selector: 0x3b3b57de
    const nodeHash = namehash(trimmed);
    const addrCalldata = "0x3b3b57de" + nodeHash.slice(2);

    // resolve(bytes,bytes) selector: 0x9061b923
    const encodedName = encodeBytes(dnsName);
    const encodedData = encodeBytes(addrCalldata);
    const calldata =
      "0x9061b923" +
      encodedName.offset +
      encodedData.offset +
      encodedName.data +
      encodedData.data;

    try {
      const result = await rpcCall<string>("ethereum", "eth_call", [
        { to: UNIVERSAL_RESOLVER, data: calldata },
        "latest",
      ]);

      // Result is ABI-encoded (bytes, address) — the address is in the first
      // decoded bytes return value. The resolve function returns (bytes memory, address),
      // but the bytes contains the ABI-encoded address from addr().
      // Skip the first 64-byte offset+length header, then grab the address from the
      // inner ABI-encoded bytes.
      if (result && result.length >= 130) {
        // Decode the outer tuple: offset to bytes, then address resolver
        // The first return is `bytes` which itself ABI-encodes the address
        // Simplify: grab last 40 hex chars from the first 256 bytes of data
        const innerDataOffset = parseInt(result.slice(2, 66), 16) * 2 + 2;
        const innerDataLength = parseInt(
          result.slice(innerDataOffset, innerDataOffset + 64),
          16,
        );
        if (innerDataLength >= 20) {
          // The inner bytes is an ABI-encoded address (32 bytes, right-padded)
          const innerHex = result.slice(
            innerDataOffset + 64,
            innerDataOffset + 64 + innerDataLength * 2,
          );
          // Address is the last 40 chars of a 64-char word
          const addrHex = innerHex.length >= 64 ? innerHex.slice(24, 64) : innerHex.slice(-40);
          const address = "0x" + addrHex;

          if (address.length === 42 && address !== "0x" + "0".repeat(40)) {
            return { address: address.toLowerCase(), ensName: trimmed };
          }
        }
      }
    } catch {
      // ENS resolution failed — fall through
    }

    throw new Error(`Could not resolve ENS name: ${trimmed}`);
  }

  // Validate hex address
  if (/^0x[a-fA-F0-9]{40}$/i.test(trimmed)) {
    return { address: trimmed.toLowerCase() };
  }

  throw new Error(`Invalid address or ENS name: ${trimmed}`);
}

// ============================================================================
// ENS ENCODING HELPERS
// ============================================================================

/** Encode a domain name into DNS wire format as a hex string. */
function encodeDnsName(name: string): string {
  const labels = name.split(".");
  let hex = "";
  for (const label of labels) {
    const encoded = Buffer.from(label, "utf8");
    hex += encoded.length.toString(16).padStart(2, "0");
    hex += encoded.toString("hex");
  }
  hex += "00"; // null terminator
  return hex;
}

/** Compute the ENS namehash of a domain. */
function namehash(name: string): string {
  // Dynamic import would be cleaner but we need sync.
  // Implement namehash manually: keccak256 chain.
  // We'll use a simple approach with the Web Crypto API... but that's async.
  // Instead, use viem-compatible approach: import from built-in Node crypto.
  const crypto = require("crypto");

  function keccak256(data: Uint8Array): Buffer<ArrayBuffer> {
    return crypto.createHash("sha3-256").update(data).digest() as Buffer<ArrayBuffer>;
  }

  let node: Uint8Array = Buffer.alloc(32, 0);
  if (!name) return "0x" + Buffer.from(node).toString("hex");

  const labels = name.split(".").reverse();
  for (const label of labels) {
    const labelHash = keccak256(Buffer.from(label, "utf8"));
    node = keccak256(Buffer.concat([node, labelHash]));
  }

  return "0x" + Buffer.from(node).toString("hex");
}

/** ABI-encode a bytes value, returning offset and data portions as hex. */
function encodeBytes(hexData: string): { offset: string; data: string } {
  const clean = hexData.startsWith("0x") ? hexData.slice(2) : hexData;
  const byteLength = clean.length / 2;
  const paddedLength = Math.ceil(byteLength / 32) * 32;

  // Offset: always 0x40 (64) for a two-element tuple
  const offset = (64).toString(16).padStart(64, "0");
  const lengthHex = byteLength.toString(16).padStart(64, "0");
  const paddedData = clean.padEnd(paddedLength * 2, "0");

  return {
    offset,
    data: lengthHex + paddedData,
  };
}
