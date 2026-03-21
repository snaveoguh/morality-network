import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  maxUint256,
  parseEther,
  stringToHex,
} from "../../web/node_modules/viem/_esm/index.js";
import { privateKeyToAccount } from "../../web/node_modules/viem/_esm/accounts/index.js";
import { arbitrumSepolia, baseSepolia } from "../../web/node_modules/viem/_esm/chains/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONTRACTS_DIR = path.resolve(__dirname, "..");
const OUT_DIR = path.join(CONTRACTS_DIR, "out");
const OUTPUT_PATH = process.env.VAULT_RAIL_ADDRESSES_OUT || "/tmp/vault-rail-dev-addresses.json";

const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) {
  throw new Error("Missing PRIVATE_KEY");
}

const account = privateKeyToAccount(PRIVATE_KEY);
const owner = process.env.VAULT_RAIL_OWNER || account.address;
const routerOperator = process.env.VAULT_RAIL_ROUTER_OPERATOR || account.address;
const bridgeExecutor = process.env.VAULT_RAIL_BRIDGE_EXECUTOR || account.address;
const reporter = process.env.VAULT_RAIL_REPORTER || account.address;
const hlOperator = process.env.VAULT_RAIL_HL_OPERATOR || account.address;
const strategyWallet = process.env.VAULT_RAIL_STRATEGY_WALLET || account.address;

const baseRpcUrl = process.env.BASE_RPC_URL || "https://sepolia.base.org";
const arbRpcUrl = process.env.ARB_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc";
const weth = process.env.VAULT_RAIL_WETH || "0x4200000000000000000000000000000000000006";
const trancheId = process.env.VAULT_RAIL_TRANCHE_ID || stringToHex("BALANCED", { size: 32 });
const trancheName = process.env.VAULT_RAIL_TRANCHE_NAME || "Base Balanced Vault";
const trancheSymbol = process.env.VAULT_RAIL_TRANCHE_SYMBOL || "bbETH";
const performanceFeeBps = BigInt(process.env.VAULT_RAIL_PERFORMANCE_FEE_BPS || "500");
const reserveTargetBps = BigInt(process.env.VAULT_RAIL_RESERVE_TARGET_BPS || "4000");
const liquidTargetBps = BigInt(process.env.VAULT_RAIL_LIQUID_TARGET_BPS || "2000");
const hlTargetBps = BigInt(process.env.VAULT_RAIL_HL_TARGET_BPS || "4000");
const minReportInterval = BigInt(process.env.VAULT_RAIL_MIN_REPORT_INTERVAL || `${60 * 60 * 24}`);
const toBridgeRateE18 = BigInt(process.env.VAULT_RAIL_TO_BRIDGE_RATE_E18 || "2000000000000000000000");
const toVaultRateE18 = BigInt(process.env.VAULT_RAIL_TO_VAULT_RATE_E18 || "500000000000000");
const seedBaseWethEth = process.env.VAULT_RAIL_SEED_BASE_WETH_ETH || "1";
const seedBaseBridgeAssetRaw = BigInt(process.env.VAULT_RAIL_SEED_BASE_BRIDGE_ASSET_RAW || "1000000000000");
const seedArbBridgeAssetRaw = BigInt(process.env.VAULT_RAIL_SEED_ARB_BRIDGE_ASSET_RAW || "1000000000000");

const erc20Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
];

const devUsdcAbi = [
  ...erc20Abi,
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
];

const wethAbi = [
  ...erc20Abi,
  {
    type: "function",
    name: "deposit",
    stateMutability: "payable",
    inputs: [],
    outputs: [],
  },
];

function artifactJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(OUT_DIR, relativePath), "utf8"));
}

function logStep(message) {
  console.log(`\n[${new Date().toISOString()}] ${message}`);
}

async function deployContract(walletClient, publicClient, artifactPath, args = []) {
  const artifact = artifactJson(artifactPath);
  const hash = await walletClient.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode.object,
    args,
    account,
    chain: walletClient.chain,
    nonce: nextNonce(walletClient.chain.id),
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (!receipt.contractAddress) {
    throw new Error(`No contract address for deployment ${artifactPath}`);
  }
  return receipt.contractAddress;
}

async function writeContract(walletClient, publicClient, address, abi, functionName, args = [], value) {
  const hash = await walletClient.writeContract({
    address,
    abi,
    functionName,
    args,
    account,
    chain: walletClient.chain,
    nonce: nextNonce(walletClient.chain.id),
    ...(value ? { value } : {}),
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

const basePublicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(baseRpcUrl),
});

const baseWalletClient = createWalletClient({
  account,
  chain: baseSepolia,
  transport: http(baseRpcUrl),
});

const arbPublicClient = createPublicClient({
  chain: arbitrumSepolia,
  transport: http(arbRpcUrl),
});

const arbWalletClient = createWalletClient({
  account,
  chain: arbitrumSepolia,
  transport: http(arbRpcUrl),
});

const nonceState = new Map([
  [baseSepolia.id, Number(await basePublicClient.getTransactionCount({ address: account.address, blockTag: "pending" }))],
  [arbitrumSepolia.id, Number(await arbPublicClient.getTransactionCount({ address: account.address, blockTag: "pending" }))],
]);

function nextNonce(chainId) {
  const current = nonceState.get(chainId);
  if (current === undefined) {
    throw new Error(`Missing nonce state for chain ${chainId}`);
  }
  nonceState.set(chainId, current + 1);
  return current;
}

logStep(`Using deployer ${account.address}`);

logStep("Deploying Arbitrum-side DevUSDC");
const arbDevUsdc = await deployContract(arbWalletClient, arbPublicClient, "DevUSDC.sol/DevUSDC.json", [owner]);

logStep("Deploying Arbitrum-side implementations");
const arbEscrowImpl = await deployContract(
  arbWalletClient,
  arbPublicClient,
  "ArbTransitEscrow.sol/ArbTransitEscrow.json"
);
const hlStrategyImpl = await deployContract(
  arbWalletClient,
  arbPublicClient,
  "HLStrategyManager.sol/HLStrategyManager.json"
);

const proxyArtifact = artifactJson("ERC1967Proxy.sol/ERC1967Proxy.json");
const arbEscrowArtifact = artifactJson("ArbTransitEscrow.sol/ArbTransitEscrow.json");
const hlStrategyArtifact = artifactJson("HLStrategyManager.sol/HLStrategyManager.json");

const arbEscrowInit = {
  abi: arbEscrowArtifact.abi,
  functionName: "initialize",
  args: [owner, arbDevUsdc, bridgeExecutor, account.address],
};
const arbEscrowProxyHash = await arbWalletClient.deployContract({
  abi: proxyArtifact.abi,
  bytecode: proxyArtifact.bytecode.object,
  args: [
    arbEscrowImpl,
    encodeFunctionData(arbEscrowInit),
  ],
  account,
  chain: arbitrumSepolia,
  nonce: nextNonce(arbitrumSepolia.id),
});
const arbEscrowReceipt = await arbPublicClient.waitForTransactionReceipt({ hash: arbEscrowProxyHash });
const arbEscrowProxy = arbEscrowReceipt.contractAddress;
if (!arbEscrowProxy) throw new Error("Failed to deploy ArbTransitEscrow proxy");

const hlStrategyInit = {
  abi: hlStrategyArtifact.abi,
  functionName: "initialize",
  args: [owner, arbDevUsdc, arbEscrowProxy, hlOperator, strategyWallet],
};
const hlStrategyProxyHash = await arbWalletClient.deployContract({
  abi: proxyArtifact.abi,
  bytecode: proxyArtifact.bytecode.object,
  args: [
    hlStrategyImpl,
    encodeFunctionData(hlStrategyInit),
  ],
  account,
  chain: arbitrumSepolia,
  nonce: nextNonce(arbitrumSepolia.id),
});
const hlStrategyReceipt = await arbPublicClient.waitForTransactionReceipt({ hash: hlStrategyProxyHash });
const hlStrategyProxy = hlStrategyReceipt.contractAddress;
if (!hlStrategyProxy) throw new Error("Failed to deploy HLStrategyManager proxy");

await writeContract(
  arbWalletClient,
  arbPublicClient,
  arbEscrowProxy,
  arbEscrowArtifact.abi,
  "setStrategyManager",
  [hlStrategyProxy]
);
await writeContract(
  arbWalletClient,
  arbPublicClient,
  arbDevUsdc,
  devUsdcAbi,
  "mint",
  [account.address, seedArbBridgeAssetRaw]
);
await writeContract(
  arbWalletClient,
  arbPublicClient,
  arbDevUsdc,
  devUsdcAbi,
  "approve",
  [hlStrategyProxy, maxUint256]
);

logStep("Deploying Base-side DevUSDC + DevReserveVault");
const baseDevUsdc = await deployContract(baseWalletClient, basePublicClient, "DevUSDC.sol/DevUSDC.json", [owner]);
const baseReserveVault = await deployContract(
  baseWalletClient,
  basePublicClient,
  "DevReserveVault.sol/DevReserveVault.json",
  [weth, owner, "Dev Reserve Vault", "drvWETH"]
);

logStep("Deploying Base-side implementations");
const baseVaultImpl = await deployContract(baseWalletClient, basePublicClient, "BaseCapitalVault.sol/BaseCapitalVault.json");
const withdrawalQueueImpl = await deployContract(baseWalletClient, basePublicClient, "WithdrawalQueue.sol/WithdrawalQueue.json");
const reserveAllocatorImpl = await deployContract(
  baseWalletClient,
  basePublicClient,
  "MorphoReserveAllocator.sol/MorphoReserveAllocator.json"
);
const bridgeRouterImpl = await deployContract(baseWalletClient, basePublicClient, "BridgeRouter.sol/BridgeRouter.json");
const navReporterImpl = await deployContract(baseWalletClient, basePublicClient, "NavReporter.sol/NavReporter.json");
const assetConverterImpl = await deployContract(
  baseWalletClient,
  basePublicClient,
  "ExecutorAssetConverter.sol/ExecutorAssetConverter.json"
);
const bridgeAdapterImpl = await deployContract(
  baseWalletClient,
  basePublicClient,
  "ExecutorBridgeAdapter.sol/ExecutorBridgeAdapter.json"
);

const baseVaultArtifact = artifactJson("BaseCapitalVault.sol/BaseCapitalVault.json");
const withdrawalQueueArtifact = artifactJson("WithdrawalQueue.sol/WithdrawalQueue.json");
const reserveAllocatorArtifact = artifactJson("MorphoReserveAllocator.sol/MorphoReserveAllocator.json");
const bridgeRouterArtifact = artifactJson("BridgeRouter.sol/BridgeRouter.json");
const navReporterArtifact = artifactJson("NavReporter.sol/NavReporter.json");
const assetConverterArtifact = artifactJson("ExecutorAssetConverter.sol/ExecutorAssetConverter.json");
const bridgeAdapterArtifact = artifactJson("ExecutorBridgeAdapter.sol/ExecutorBridgeAdapter.json");

const baseVaultProxyHash = await baseWalletClient.deployContract({
  abi: proxyArtifact.abi,
  bytecode: proxyArtifact.bytecode.object,
  args: [
    baseVaultImpl,
    encodeFunctionData({
      abi: baseVaultArtifact.abi,
      functionName: "initialize",
      args: [
        trancheName,
        trancheSymbol,
        owner,
        weth,
        trancheId,
        performanceFeeBps,
        reserveTargetBps,
        liquidTargetBps,
        hlTargetBps,
      ],
    }),
  ],
  account,
  chain: baseSepolia,
  nonce: nextNonce(baseSepolia.id),
});
const baseVaultReceipt = await basePublicClient.waitForTransactionReceipt({ hash: baseVaultProxyHash });
const baseVaultProxy = baseVaultReceipt.contractAddress;
if (!baseVaultProxy) throw new Error("Failed to deploy BaseCapitalVault proxy");

const withdrawalQueueProxyHash = await baseWalletClient.deployContract({
  abi: proxyArtifact.abi,
  bytecode: proxyArtifact.bytecode.object,
  args: [
    withdrawalQueueImpl,
    encodeFunctionData({
      abi: withdrawalQueueArtifact.abi,
      functionName: "initialize",
      args: [owner, baseVaultProxy],
    }),
  ],
  account,
  chain: baseSepolia,
  nonce: nextNonce(baseSepolia.id),
});
const withdrawalQueueReceipt = await basePublicClient.waitForTransactionReceipt({ hash: withdrawalQueueProxyHash });
const withdrawalQueueProxy = withdrawalQueueReceipt.contractAddress;
if (!withdrawalQueueProxy) throw new Error("Failed to deploy WithdrawalQueue proxy");

const reserveAllocatorProxyHash = await baseWalletClient.deployContract({
  abi: proxyArtifact.abi,
  bytecode: proxyArtifact.bytecode.object,
  args: [
    reserveAllocatorImpl,
    encodeFunctionData({
      abi: reserveAllocatorArtifact.abi,
      functionName: "initialize",
      args: [owner, baseVaultProxy, weth, baseReserveVault],
    }),
  ],
  account,
  chain: baseSepolia,
  nonce: nextNonce(baseSepolia.id),
});
const reserveAllocatorReceipt = await basePublicClient.waitForTransactionReceipt({ hash: reserveAllocatorProxyHash });
const reserveAllocatorProxy = reserveAllocatorReceipt.contractAddress;
if (!reserveAllocatorProxy) throw new Error("Failed to deploy MorphoReserveAllocator proxy");

const bridgeRouterProxyHash = await baseWalletClient.deployContract({
  abi: proxyArtifact.abi,
  bytecode: proxyArtifact.bytecode.object,
  args: [
    bridgeRouterImpl,
    encodeFunctionData({
      abi: bridgeRouterArtifact.abi,
      functionName: "initialize",
      args: [owner, baseVaultProxy, weth, routerOperator, bridgeExecutor, arbEscrowProxy],
    }),
  ],
  account,
  chain: baseSepolia,
  nonce: nextNonce(baseSepolia.id),
});
const bridgeRouterReceipt = await basePublicClient.waitForTransactionReceipt({ hash: bridgeRouterProxyHash });
const bridgeRouterProxy = bridgeRouterReceipt.contractAddress;
if (!bridgeRouterProxy) throw new Error("Failed to deploy BridgeRouter proxy");

const navReporterProxyHash = await baseWalletClient.deployContract({
  abi: proxyArtifact.abi,
  bytecode: proxyArtifact.bytecode.object,
  args: [
    navReporterImpl,
    encodeFunctionData({
      abi: navReporterArtifact.abi,
      functionName: "initialize",
      args: [owner, baseVaultProxy, reserveAllocatorProxy, bridgeRouterProxy, reporter, minReportInterval],
    }),
  ],
  account,
  chain: baseSepolia,
  nonce: nextNonce(baseSepolia.id),
});
const navReporterReceipt = await basePublicClient.waitForTransactionReceipt({ hash: navReporterProxyHash });
const navReporterProxy = navReporterReceipt.contractAddress;
if (!navReporterProxy) throw new Error("Failed to deploy NavReporter proxy");

const assetConverterProxyHash = await baseWalletClient.deployContract({
  abi: proxyArtifact.abi,
  bytecode: proxyArtifact.bytecode.object,
  args: [
    assetConverterImpl,
    encodeFunctionData({
      abi: assetConverterArtifact.abi,
      functionName: "initialize",
      args: [
        {
          owner,
          assetIn: weth,
          bridgeAsset: baseDevUsdc,
          router: bridgeRouterProxy,
          bridgeAssetLiquidityProvider: account.address,
          vaultAssetLiquidityProvider: account.address,
          assetInSink: owner,
          bridgeAssetSink: owner,
          assetInDecimals: 18,
          bridgeAssetDecimals: 6,
          toBridgeRateE18,
          toVaultRateE18,
        },
      ],
    }),
  ],
  account,
  chain: baseSepolia,
  nonce: nextNonce(baseSepolia.id),
});
const assetConverterReceipt = await basePublicClient.waitForTransactionReceipt({ hash: assetConverterProxyHash });
const assetConverterProxy = assetConverterReceipt.contractAddress;
if (!assetConverterProxy) throw new Error("Failed to deploy ExecutorAssetConverter proxy");

const bridgeAdapterProxyHash = await baseWalletClient.deployContract({
  abi: proxyArtifact.abi,
  bytecode: proxyArtifact.bytecode.object,
  args: [
    bridgeAdapterImpl,
    encodeFunctionData({
      abi: bridgeAdapterArtifact.abi,
      functionName: "initialize",
      args: [owner, baseDevUsdc, bridgeRouterProxy, bridgeExecutor],
    }),
  ],
  account,
  chain: baseSepolia,
  nonce: nextNonce(baseSepolia.id),
});
const bridgeAdapterReceipt = await basePublicClient.waitForTransactionReceipt({ hash: bridgeAdapterProxyHash });
const bridgeAdapterProxy = bridgeAdapterReceipt.contractAddress;
if (!bridgeAdapterProxy) throw new Error("Failed to deploy ExecutorBridgeAdapter proxy");

await writeContract(baseWalletClient, basePublicClient, baseVaultProxy, baseVaultArtifact.abi, "setAllocator", [routerOperator]);
await writeContract(
  baseWalletClient,
  basePublicClient,
  baseVaultProxy,
  baseVaultArtifact.abi,
  "setWithdrawalQueue",
  [withdrawalQueueProxy]
);
await writeContract(
  baseWalletClient,
  basePublicClient,
  baseVaultProxy,
  baseVaultArtifact.abi,
  "setReserveAllocator",
  [reserveAllocatorProxy]
);
await writeContract(baseWalletClient, basePublicClient, baseVaultProxy, baseVaultArtifact.abi, "setBridgeRouter", [bridgeRouterProxy]);
await writeContract(baseWalletClient, basePublicClient, baseVaultProxy, baseVaultArtifact.abi, "setNavReporter", [navReporterProxy]);

await writeContract(baseWalletClient, basePublicClient, bridgeRouterProxy, bridgeRouterArtifact.abi, "setBridgeAsset", [baseDevUsdc]);
await writeContract(
  baseWalletClient,
  basePublicClient,
  bridgeRouterProxy,
  bridgeRouterArtifact.abi,
  "setAssetConverter",
  [assetConverterProxy]
);
await writeContract(
  baseWalletClient,
  basePublicClient,
  bridgeRouterProxy,
  bridgeRouterArtifact.abi,
  "setBridgeAdapter",
  [bridgeAdapterProxy]
);
await writeContract(baseWalletClient, basePublicClient, bridgeRouterProxy, bridgeRouterArtifact.abi, "setArbEscrow", [arbEscrowProxy]);

await writeContract(baseWalletClient, basePublicClient, baseDevUsdc, devUsdcAbi, "mint", [account.address, seedBaseBridgeAssetRaw]);
await writeContract(baseWalletClient, basePublicClient, weth, wethAbi, "deposit", [], parseEther(seedBaseWethEth));
await writeContract(baseWalletClient, basePublicClient, weth, wethAbi, "approve", [assetConverterProxy, maxUint256]);
await writeContract(baseWalletClient, basePublicClient, baseDevUsdc, devUsdcAbi, "approve", [bridgeAdapterProxy, maxUint256]);

const addresses = {
  deployer: account.address,
  owner,
  base: {
    rpcUrl: baseRpcUrl,
    weth,
    devUsdc: baseDevUsdc,
    reserveVault: baseReserveVault,
    vault: baseVaultProxy,
    withdrawalQueue: withdrawalQueueProxy,
    reserveAllocator: reserveAllocatorProxy,
    bridgeRouter: bridgeRouterProxy,
    navReporter: navReporterProxy,
    assetConverter: assetConverterProxy,
    bridgeAdapter: bridgeAdapterProxy,
  },
  arbitrum: {
    rpcUrl: arbRpcUrl,
    devUsdc: arbDevUsdc,
    transitEscrow: arbEscrowProxy,
    hlStrategyManager: hlStrategyProxy,
  },
};

fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(addresses, null, 2)}\n`);
logStep(`Deployment complete. Wrote ${OUTPUT_PATH}`);
console.log(JSON.stringify(addresses, null, 2));
