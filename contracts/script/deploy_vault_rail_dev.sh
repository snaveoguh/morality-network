#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT_DIR/out"
ADDRESSES_OUT="${VAULT_RAIL_ADDRESSES_OUT:-/tmp/vault-rail-dev-addresses.json}"

PRIVATE_KEY="${PRIVATE_KEY:?PRIVATE_KEY is required}"
DEPLOYER="$(cast wallet address --private-key "$PRIVATE_KEY" | tr -d '\n')"

BASE_RPC_URL="${BASE_RPC_URL:-https://sepolia.base.org}"
ARB_RPC_URL="${ARB_RPC_URL:-https://sepolia-rollup.arbitrum.io/rpc}"

OWNER="${VAULT_RAIL_OWNER:-$DEPLOYER}"
ROUTER_OPERATOR="${VAULT_RAIL_ROUTER_OPERATOR:-$DEPLOYER}"
BRIDGE_EXECUTOR="${VAULT_RAIL_BRIDGE_EXECUTOR:-$DEPLOYER}"
REPORTER="${VAULT_RAIL_REPORTER:-$DEPLOYER}"
HL_OPERATOR="${VAULT_RAIL_HL_OPERATOR:-$DEPLOYER}"
STRATEGY_WALLET="${VAULT_RAIL_STRATEGY_WALLET:-$DEPLOYER}"

WETH="${VAULT_RAIL_WETH:-0x4200000000000000000000000000000000000006}"
TRANCHE_ID="${VAULT_RAIL_TRANCHE_ID:-0x42414c414e434544000000000000000000000000000000000000000000000000}"
TRANCHE_NAME="${VAULT_RAIL_TRANCHE_NAME:-Base Balanced Vault}"
TRANCHE_SYMBOL="${VAULT_RAIL_TRANCHE_SYMBOL:-bbETH}"

PERFORMANCE_FEE_BPS="${VAULT_RAIL_PERFORMANCE_FEE_BPS:-500}"
RESERVE_TARGET_BPS="${VAULT_RAIL_RESERVE_TARGET_BPS:-4000}"
LIQUID_TARGET_BPS="${VAULT_RAIL_LIQUID_TARGET_BPS:-2000}"
HL_TARGET_BPS="${VAULT_RAIL_HL_TARGET_BPS:-4000}"
MIN_REPORT_INTERVAL="${VAULT_RAIL_MIN_REPORT_INTERVAL:-86400}"

ASSET_IN_DECIMALS="${VAULT_RAIL_ASSET_IN_DECIMALS:-18}"
BRIDGE_ASSET_DECIMALS="${VAULT_RAIL_BRIDGE_ASSET_DECIMALS:-6}"
TO_BRIDGE_RATE_E18="${VAULT_RAIL_TO_BRIDGE_RATE_E18:-2000000000000000000000}"
TO_VAULT_RATE_E18="${VAULT_RAIL_TO_VAULT_RATE_E18:-500000000000000}"

SEED_BASE_WETH_ETH="${VAULT_RAIL_SEED_BASE_WETH_ETH:-1}"
SEED_BASE_BRIDGE_ASSET_RAW="${VAULT_RAIL_SEED_BASE_BRIDGE_ASSET_RAW:-1000000000000}"
SEED_ARB_BRIDGE_ASSET_RAW="${VAULT_RAIL_SEED_ARB_BRIDGE_ASSET_RAW:-1000000000000}"
MAX_UINT="115792089237316195423570985008687907853269984665640564039457584007913129639935"

strip_0x() {
  echo "${1#0x}"
}

artifact_bytecode() {
  jq -r '.bytecode.object' "$1"
}

wait_for_contract() {
  local rpc_url="$1"
  local tx_hash="$2"
  cast receipt --rpc-url "$rpc_url" "$tx_hash" contractAddress | tr -d '\n'
}

send_tx_async() {
  local rpc_url="$1"
  shift
  cast send --async --private-key "$PRIVATE_KEY" --rpc-url "$rpc_url" "$@" | tr -d '\n'
}

call_contract() {
  local rpc_url="$1"
  local target="$2"
  local sig="$3"
  shift 3
  local tx_hash
  tx_hash="$(send_tx_async "$rpc_url" "$target" "$sig" "$@")"
  cast receipt --rpc-url "$rpc_url" "$tx_hash" status >/dev/null
  echo "$tx_hash"
}

deploy_payload() {
  local rpc_url="$1"
  local payload="$2"
  local tx_hash
  tx_hash="$(send_tx_async "$rpc_url" --create "$payload")"
  wait_for_contract "$rpc_url" "$tx_hash"
}

deploy_artifact() {
  local rpc_url="$1"
  local artifact="$2"
  local ctor_sig="$3"
  shift 3

  local bytecode
  bytecode="$(artifact_bytecode "$artifact")"
  if [[ "$ctor_sig" != "-" ]]; then
    local ctor_args
    ctor_args="$(cast abi-encode "$ctor_sig" "$@")"
    bytecode="${bytecode}$(strip_0x "$ctor_args")"
  fi

  deploy_payload "$rpc_url" "$bytecode"
}

deploy_proxy() {
  local rpc_url="$1"
  local implementation="$2"
  local init_calldata="$3"
  local proxy_bytecode
  proxy_bytecode="$(artifact_bytecode "$OUT_DIR/ERC1967Proxy.sol/ERC1967Proxy.json")"
  local ctor_args
  ctor_args="$(cast abi-encode "constructor(address,bytes)" "$implementation" "$init_calldata")"
  deploy_payload "$rpc_url" "${proxy_bytecode}$(strip_0x "$ctor_args")"
}

log_step() {
  printf '\n[%s] %s\n' "$(date '+%H:%M:%S')" "$1"
}

log_step "Deploying Arbitrum-side dev bridge asset"
ARB_DEV_USDC="$(deploy_artifact "$ARB_RPC_URL" "$OUT_DIR/DevUSDC.sol/DevUSDC.json" "constructor(address)" "$OWNER")"
log_step "Arbitrum DevUSDC: $ARB_DEV_USDC"

log_step "Deploying Arbitrum-side implementations"
ARB_ESCROW_IMPL="$(deploy_artifact "$ARB_RPC_URL" "$OUT_DIR/ArbTransitEscrow.sol/ArbTransitEscrow.json" "-")"
ARB_STRATEGY_IMPL="$(deploy_artifact "$ARB_RPC_URL" "$OUT_DIR/HLStrategyManager.sol/HLStrategyManager.json" "-")"

ARB_ESCROW_INIT="$(cast calldata "initialize(address,address,address,address)" "$OWNER" "$ARB_DEV_USDC" "$BRIDGE_EXECUTOR" "$DEPLOYER")"
ARB_ESCROW_PROXY="$(deploy_proxy "$ARB_RPC_URL" "$ARB_ESCROW_IMPL" "$ARB_ESCROW_INIT")"

ARB_STRATEGY_INIT="$(cast calldata "initialize(address,address,address,address,address)" "$OWNER" "$ARB_DEV_USDC" "$ARB_ESCROW_PROXY" "$HL_OPERATOR" "$STRATEGY_WALLET")"
ARB_STRATEGY_PROXY="$(deploy_proxy "$ARB_RPC_URL" "$ARB_STRATEGY_IMPL" "$ARB_STRATEGY_INIT")"

call_contract "$ARB_RPC_URL" "$ARB_ESCROW_PROXY" "setStrategyManager(address)" "$ARB_STRATEGY_PROXY" >/dev/null
call_contract "$ARB_RPC_URL" "$ARB_DEV_USDC" "mint(address,uint256)" "$DEPLOYER" "$SEED_ARB_BRIDGE_ASSET_RAW" >/dev/null
call_contract "$ARB_RPC_URL" "$ARB_DEV_USDC" "approve(address,uint256)" "$ARB_STRATEGY_PROXY" "$MAX_UINT" >/dev/null

log_step "Deploying Base-side dev bridge asset + reserve vault"
BASE_DEV_USDC="$(deploy_artifact "$BASE_RPC_URL" "$OUT_DIR/DevUSDC.sol/DevUSDC.json" "constructor(address)" "$OWNER")"
BASE_RESERVE_VAULT="$(deploy_artifact "$BASE_RPC_URL" "$OUT_DIR/DevReserveVault.sol/DevReserveVault.json" "constructor(address,address,string,string)" "$WETH" "$OWNER" "Dev Reserve Vault" "drvWETH")"

log_step "Deploying Base-side implementations"
BASE_VAULT_IMPL="$(deploy_artifact "$BASE_RPC_URL" "$OUT_DIR/BaseCapitalVault.sol/BaseCapitalVault.json" "-")"
BASE_QUEUE_IMPL="$(deploy_artifact "$BASE_RPC_URL" "$OUT_DIR/WithdrawalQueue.sol/WithdrawalQueue.json" "-")"
BASE_RESERVE_ALLOC_IMPL="$(deploy_artifact "$BASE_RPC_URL" "$OUT_DIR/MorphoReserveAllocator.sol/MorphoReserveAllocator.json" "-")"
BASE_ROUTER_IMPL="$(deploy_artifact "$BASE_RPC_URL" "$OUT_DIR/BridgeRouter.sol/BridgeRouter.json" "-")"
BASE_NAV_IMPL="$(deploy_artifact "$BASE_RPC_URL" "$OUT_DIR/NavReporter.sol/NavReporter.json" "-")"
BASE_CONVERTER_IMPL="$(deploy_artifact "$BASE_RPC_URL" "$OUT_DIR/ExecutorAssetConverter.sol/ExecutorAssetConverter.json" "-")"
BASE_ADAPTER_IMPL="$(deploy_artifact "$BASE_RPC_URL" "$OUT_DIR/ExecutorBridgeAdapter.sol/ExecutorBridgeAdapter.json" "-")"

BASE_VAULT_INIT="$(cast calldata "initialize(string,string,address,address,bytes32,uint16,uint16,uint16,uint16)" "$TRANCHE_NAME" "$TRANCHE_SYMBOL" "$OWNER" "$WETH" "$TRANCHE_ID" "$PERFORMANCE_FEE_BPS" "$RESERVE_TARGET_BPS" "$LIQUID_TARGET_BPS" "$HL_TARGET_BPS")"
BASE_VAULT_PROXY="$(deploy_proxy "$BASE_RPC_URL" "$BASE_VAULT_IMPL" "$BASE_VAULT_INIT")"

BASE_QUEUE_INIT="$(cast calldata "initialize(address,address)" "$OWNER" "$BASE_VAULT_PROXY")"
BASE_QUEUE_PROXY="$(deploy_proxy "$BASE_RPC_URL" "$BASE_QUEUE_IMPL" "$BASE_QUEUE_INIT")"

BASE_RESERVE_ALLOC_INIT="$(cast calldata "initialize(address,address,address,address)" "$OWNER" "$BASE_VAULT_PROXY" "$WETH" "$BASE_RESERVE_VAULT")"
BASE_RESERVE_ALLOC_PROXY="$(deploy_proxy "$BASE_RPC_URL" "$BASE_RESERVE_ALLOC_IMPL" "$BASE_RESERVE_ALLOC_INIT")"

BASE_ROUTER_INIT="$(cast calldata "initialize(address,address,address,address,address,address)" "$OWNER" "$BASE_VAULT_PROXY" "$WETH" "$ROUTER_OPERATOR" "$BRIDGE_EXECUTOR" "$ARB_ESCROW_PROXY")"
BASE_ROUTER_PROXY="$(deploy_proxy "$BASE_RPC_URL" "$BASE_ROUTER_IMPL" "$BASE_ROUTER_INIT")"

BASE_NAV_INIT="$(cast calldata "initialize(address,address,address,address,address,uint64)" "$OWNER" "$BASE_VAULT_PROXY" "$BASE_RESERVE_ALLOC_PROXY" "$BASE_ROUTER_PROXY" "$REPORTER" "$MIN_REPORT_INTERVAL")"
BASE_NAV_PROXY="$(deploy_proxy "$BASE_RPC_URL" "$BASE_NAV_IMPL" "$BASE_NAV_INIT")"

BASE_CONVERTER_INIT="$(cast calldata "initialize((address,address,address,address,address,address,address,address,uint8,uint8,uint256,uint256))" "($OWNER,$WETH,$BASE_DEV_USDC,$BASE_ROUTER_PROXY,$DEPLOYER,$DEPLOYER,$OWNER,$OWNER,$ASSET_IN_DECIMALS,$BRIDGE_ASSET_DECIMALS,$TO_BRIDGE_RATE_E18,$TO_VAULT_RATE_E18)")"
BASE_CONVERTER_PROXY="$(deploy_proxy "$BASE_RPC_URL" "$BASE_CONVERTER_IMPL" "$BASE_CONVERTER_INIT")"

BASE_ADAPTER_INIT="$(cast calldata "initialize(address,address,address,address)" "$OWNER" "$BASE_DEV_USDC" "$BASE_ROUTER_PROXY" "$BRIDGE_EXECUTOR")"
BASE_ADAPTER_PROXY="$(deploy_proxy "$BASE_RPC_URL" "$BASE_ADAPTER_IMPL" "$BASE_ADAPTER_INIT")"

call_contract "$BASE_RPC_URL" "$BASE_VAULT_PROXY" "setAllocator(address)" "$ROUTER_OPERATOR" >/dev/null
call_contract "$BASE_RPC_URL" "$BASE_VAULT_PROXY" "setWithdrawalQueue(address)" "$BASE_QUEUE_PROXY" >/dev/null
call_contract "$BASE_RPC_URL" "$BASE_VAULT_PROXY" "setReserveAllocator(address)" "$BASE_RESERVE_ALLOC_PROXY" >/dev/null
call_contract "$BASE_RPC_URL" "$BASE_VAULT_PROXY" "setBridgeRouter(address)" "$BASE_ROUTER_PROXY" >/dev/null
call_contract "$BASE_RPC_URL" "$BASE_VAULT_PROXY" "setNavReporter(address)" "$BASE_NAV_PROXY" >/dev/null

call_contract "$BASE_RPC_URL" "$BASE_ROUTER_PROXY" "setBridgeAsset(address)" "$BASE_DEV_USDC" >/dev/null
call_contract "$BASE_RPC_URL" "$BASE_ROUTER_PROXY" "setAssetConverter(address)" "$BASE_CONVERTER_PROXY" >/dev/null
call_contract "$BASE_RPC_URL" "$BASE_ROUTER_PROXY" "setBridgeAdapter(address)" "$BASE_ADAPTER_PROXY" >/dev/null
call_contract "$BASE_RPC_URL" "$BASE_ROUTER_PROXY" "setArbEscrow(address)" "$ARB_ESCROW_PROXY" >/dev/null

call_contract "$BASE_RPC_URL" "$BASE_DEV_USDC" "mint(address,uint256)" "$DEPLOYER" "$SEED_BASE_BRIDGE_ASSET_RAW" >/dev/null
call_contract "$BASE_RPC_URL" "$WETH" "deposit()" --value "${SEED_BASE_WETH_ETH}ether" >/dev/null
call_contract "$BASE_RPC_URL" "$WETH" "approve(address,uint256)" "$BASE_CONVERTER_PROXY" "$MAX_UINT" >/dev/null
call_contract "$BASE_RPC_URL" "$BASE_DEV_USDC" "approve(address,uint256)" "$BASE_ADAPTER_PROXY" "$MAX_UINT" >/dev/null

cat >"$ADDRESSES_OUT" <<EOF
{
  "deployer": "$DEPLOYER",
  "owner": "$OWNER",
  "base": {
    "rpcUrl": "$BASE_RPC_URL",
    "weth": "$WETH",
    "devUsdc": "$BASE_DEV_USDC",
    "reserveVault": "$BASE_RESERVE_VAULT",
    "vault": "$BASE_VAULT_PROXY",
    "withdrawalQueue": "$BASE_QUEUE_PROXY",
    "reserveAllocator": "$BASE_RESERVE_ALLOC_PROXY",
    "bridgeRouter": "$BASE_ROUTER_PROXY",
    "navReporter": "$BASE_NAV_PROXY",
    "assetConverter": "$BASE_CONVERTER_PROXY",
    "bridgeAdapter": "$BASE_ADAPTER_PROXY"
  },
  "arbitrum": {
    "rpcUrl": "$ARB_RPC_URL",
    "devUsdc": "$ARB_DEV_USDC",
    "transitEscrow": "$ARB_ESCROW_PROXY",
    "hlStrategyManager": "$ARB_STRATEGY_PROXY"
  }
}
EOF

log_step "Deployment complete"
cat "$ADDRESSES_OUT"
