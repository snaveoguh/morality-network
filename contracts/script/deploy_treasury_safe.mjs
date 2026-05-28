// Treasury Safe deploy — 1-of-1 Safe with the operator EOA as sole signer.
//
// Usage:
//   PRIVATE_KEY=0x... node contracts/script/deploy_treasury_safe.mjs
//     defaults to --network sepolia, --dry-run
//
//   PRIVATE_KEY=0x... node contracts/script/deploy_treasury_safe.mjs \
//     --network sepolia --execute
//
//   PRIVATE_KEY=0x... node contracts/script/deploy_treasury_safe.mjs \
//     --network base --execute      # (mainnet — costs real ETH)
//
// Result:
//   Writes contracts/deployments/treasury-safe-<network>.json with the
//   deployed Safe address. Mirror that value into
//   TREASURY_SAFE_ADDRESS_BASE on the relevant Railway service.
//
// Threshold is 1-of-1 by default. Raise later via Safe owner-management
// without redeploying — Zodiac modules will be attached in a separate
// step (week 2-3 of the integration memo).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import SafeMod from "../../web/node_modules/@safe-global/protocol-kit/dist/esm/src/index.mjs";

// Protocol Kit ships its default export under a CJS-interop wrapper when
// loaded from an mjs file outside the package's `exports` map; unwrap.
const Safe = SafeMod.default ?? SafeMod;
import {
  createPublicClient,
  createWalletClient,
  formatEther,
  http,
} from "../../web/node_modules/viem/_esm/index.js";
import { privateKeyToAccount } from "../../web/node_modules/viem/_esm/accounts/index.js";
import { base, baseSepolia } from "../../web/node_modules/viem/_esm/chains/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEPLOYMENTS_DIR = path.resolve(__dirname, "..", "deployments");

// ---------- args ----------
const args = new Set(process.argv.slice(2));
const networkArg = (() => {
  const ix = process.argv.indexOf("--network");
  if (ix >= 0 && process.argv[ix + 1]) return process.argv[ix + 1];
  return "sepolia";
})();
const execute = args.has("--execute");
const dryRun = !execute;

const NETWORKS = {
  sepolia: {
    name: "base-sepolia",
    chain: baseSepolia,
    chainId: 84532,
    rpcEnv: ["BASE_SEPOLIA_RPC_URL"],
    rpcFallback: "https://sepolia.base.org",
  },
  base: {
    name: "base",
    chain: base,
    chainId: 8453,
    rpcEnv: ["BASE_MAINNET_RPC_URL"],
    rpcFallback: "https://mainnet.base.org",
  },
};

const network = NETWORKS[networkArg];
if (!network) {
  console.error(`Unknown --network "${networkArg}". Use: sepolia | base`);
  process.exit(1);
}

const rawKey = process.env.PRIVATE_KEY || process.env.AGENT_PRIVATE_KEY;
if (!rawKey) {
  console.error("PRIVATE_KEY (or AGENT_PRIVATE_KEY) not set");
  process.exit(1);
}
const privateKey = rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`;
const account = privateKeyToAccount(privateKey);

const rpcUrl =
  process.env[network.rpcEnv[0]] ||
  process.env.BASE_RPC_URL ||
  network.rpcFallback;

// ---------- pretty print ----------
const ts = () => new Date().toISOString();
const log = (msg) => console.log(`[${ts()}] ${msg}`);

log(`network:    ${network.name} (chainId ${network.chainId})`);
log(`rpc:        ${rpcUrl}`);
log(`operator:   ${account.address}`);
log(`mode:       ${dryRun ? "DRY RUN (predict only)" : "EXECUTE (will broadcast)"}`);

// ---------- predict Safe address ----------
log("initializing Protocol Kit with predicted Safe...");
const predictedKit = await Safe.init({
  provider: rpcUrl,
  signer: privateKey,
  predictedSafe: {
    safeAccountConfig: {
      owners: [account.address],
      threshold: 1,
    },
  },
});

const predictedAddress = await predictedKit.getAddress();
log(`predicted Safe address: ${predictedAddress}`);

// ---------- balance check ----------
const publicClient = createPublicClient({
  chain: network.chain,
  transport: http(rpcUrl),
});

const balance = await publicClient.getBalance({ address: account.address });
log(`operator balance: ${formatEther(balance)} ETH`);

if (balance === 0n) {
  console.error(
    `\n  ERROR: operator EOA has zero balance on ${network.name}.\n` +
      `  Fund ${account.address} with a small amount of ETH for gas before deploying.\n`,
  );
  process.exit(1);
}

// ---------- check if Safe already deployed ----------
const existingCode = await publicClient.getCode({ address: predictedAddress });
if (existingCode && existingCode !== "0x") {
  log(`Safe ALREADY DEPLOYED at ${predictedAddress} — no action needed.`);
  writeDeploymentRecord(predictedAddress, { alreadyDeployed: true });
  process.exit(0);
}

if (dryRun) {
  log("");
  log("DRY RUN — no transaction sent. Re-run with --execute to deploy.");
  log("");
  log(`To deploy on ${network.name}:`);
  log(`  PRIVATE_KEY=0x... node contracts/script/deploy_treasury_safe.mjs --network ${networkArg} --execute`);
  process.exit(0);
}

// ---------- broadcast deploy ----------
log("building deployment transaction...");
const deployTx = await predictedKit.createSafeDeploymentTransaction();

const walletClient = createWalletClient({
  account,
  chain: network.chain,
  transport: http(rpcUrl),
});

log("broadcasting deploy tx...");
const txHash = await walletClient.sendTransaction({
  to: deployTx.to,
  data: deployTx.data,
  value: BigInt(deployTx.value || 0),
});
log(`tx submitted: ${txHash}`);

log("waiting for confirmation...");
const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
if (receipt.status !== "success") {
  console.error("deployment tx reverted");
  process.exit(1);
}

// ---------- verify ----------
const finalCode = await publicClient.getCode({ address: predictedAddress });
if (!finalCode || finalCode === "0x") {
  console.error(`Safe NOT found at predicted address ${predictedAddress} after deploy`);
  process.exit(1);
}

log(`Safe deployed at ${predictedAddress}`);
writeDeploymentRecord(predictedAddress, {
  txHash,
  blockNumber: Number(receipt.blockNumber),
  gasUsed: receipt.gasUsed.toString(),
});

log("");
log("NEXT STEPS:");
log(`  1. Set TREASURY_SAFE_ADDRESS_BASE=${predictedAddress} on the relevant Railway service`);
log(`     (set the same value for both ${network.name === "base" ? "production" : "dev"} env).`);
log(`  2. (Optional) Send a small USDC test transfer to the Safe to verify ownership.`);
log(`  3. Refactor distribute.ts callers to use executeSafeDistribution() — see safe.ts.`);
log("");

// ---------- helpers ----------
function writeDeploymentRecord(safeAddress, extra) {
  if (!fs.existsSync(DEPLOYMENTS_DIR)) {
    fs.mkdirSync(DEPLOYMENTS_DIR, { recursive: true });
  }
  const outPath = path.join(DEPLOYMENTS_DIR, `treasury-safe-${network.name}.json`);
  const record = {
    network: network.name,
    chainId: network.chainId,
    safeAddress,
    owner: account.address,
    threshold: 1,
    deployedAt: ts(),
    ...(extra ?? {}),
  };
  fs.writeFileSync(outPath, `${JSON.stringify(record, null, 2)}\n`);
  log(`wrote ${outPath}`);
}
