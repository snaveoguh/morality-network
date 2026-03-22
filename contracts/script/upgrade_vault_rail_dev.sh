#!/usr/bin/env bash
set -euo pipefail

# ── Upgrade vault rail proxies to hardened implementations ──
# Deploys new implementation contracts and calls upgradeToAndCall on each UUPS proxy.

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT_DIR/out"

PRIVATE_KEY="${PRIVATE_KEY:?PRIVATE_KEY is required}"
DEPLOYER="$(cast wallet address --private-key "$PRIVATE_KEY" | tr -d '\n')"

BASE_RPC_URL="${BASE_RPC_URL:-https://sepolia.base.org}"
ARB_RPC_URL="${ARB_RPC_URL:-https://sepolia-rollup.arbitrum.io/rpc}"

# ── Existing proxy addresses (Base Sepolia) ──
VAULT_PROXY="${VAULT_PROXY:-0x3bb95125f2a8d8af94dd7ba0ce5b0b8b5eef7d81}"
QUEUE_PROXY="${QUEUE_PROXY:-0x834952e34566feee95fc1cb6a1f6d851be183ebc}"
RESERVE_ALLOC_PROXY="${RESERVE_ALLOC_PROXY:-0xcf85a88125ad622bae3978a2dc7f7fc2dc8fb821}"
BRIDGE_ROUTER_PROXY="${BRIDGE_ROUTER_PROXY:-0x55865854f9d58ad7c6d2cfa7a304419e23817133}"
NAV_REPORTER_PROXY="${NAV_REPORTER_PROXY:-0xfa33f4dfe3bec32ae3cb78dbcf508597f74dc528}"

# ── Existing proxy addresses (Arb Sepolia) ──
ARB_ESCROW_PROXY="${ARB_ESCROW_PROXY:-0x14a361454edcb477644eb82bf540a26e1cead72a}"
HL_STRATEGY_PROXY="${HL_STRATEGY_PROXY:-0x71b2e273727385c617fe254f4fb14a36a679b12a}"

artifact_bytecode() {
  jq -r '.bytecode.object' "$1"
}

deploy_impl() {
  local rpc_url="$1"
  local artifact="$2"
  local bytecode
  bytecode="$(artifact_bytecode "$artifact")"
  local addr
  addr="$(cast send --private-key "$PRIVATE_KEY" --rpc-url "$rpc_url" --create "$bytecode" --json | jq -r '.contractAddress')"
  echo "$addr"
}

upgrade_proxy() {
  local rpc_url="$1"
  local proxy="$2"
  local new_impl="$3"
  local label="$4"

  local tx_hash
  tx_hash="$(cast send --private-key "$PRIVATE_KEY" --rpc-url "$rpc_url" "$proxy" "upgradeToAndCall(address,bytes)" "$new_impl" "0x" --json | jq -r '.transactionHash')"
  printf '  ✓ %s upgraded (tx: %s)\n' "$label" "$tx_hash"
}

log_step() {
  printf '\n[%s] %s\n' "$(date '+%H:%M:%S')" "$1"
}

# ── Build first ──
log_step "Building contracts"
(cd "$ROOT_DIR" && forge build --force)

# ── Deploy new Base implementations ──
log_step "Deploying new implementations on Base Sepolia"

NEW_VAULT_IMPL="$(deploy_impl "$BASE_RPC_URL" "$OUT_DIR/BaseCapitalVault.sol/BaseCapitalVault.json")"
printf '  BaseCapitalVault impl: %s\n' "$NEW_VAULT_IMPL"

NEW_QUEUE_IMPL="$(deploy_impl "$BASE_RPC_URL" "$OUT_DIR/WithdrawalQueue.sol/WithdrawalQueue.json")"
printf '  WithdrawalQueue impl: %s\n' "$NEW_QUEUE_IMPL"

NEW_RESERVE_IMPL="$(deploy_impl "$BASE_RPC_URL" "$OUT_DIR/MorphoReserveAllocator.sol/MorphoReserveAllocator.json")"
printf '  MorphoReserveAllocator impl: %s\n' "$NEW_RESERVE_IMPL"

NEW_ROUTER_IMPL="$(deploy_impl "$BASE_RPC_URL" "$OUT_DIR/BridgeRouter.sol/BridgeRouter.json")"
printf '  BridgeRouter impl: %s\n' "$NEW_ROUTER_IMPL"

NEW_NAV_IMPL="$(deploy_impl "$BASE_RPC_URL" "$OUT_DIR/NavReporter.sol/NavReporter.json")"
printf '  NavReporter impl: %s\n' "$NEW_NAV_IMPL"

# ── Deploy new Arb implementations ──
log_step "Deploying new implementations on Arb Sepolia"

NEW_ESCROW_IMPL="$(deploy_impl "$ARB_RPC_URL" "$OUT_DIR/ArbTransitEscrow.sol/ArbTransitEscrow.json")"
printf '  ArbTransitEscrow impl: %s\n' "$NEW_ESCROW_IMPL"

NEW_STRATEGY_IMPL="$(deploy_impl "$ARB_RPC_URL" "$OUT_DIR/HLStrategyManager.sol/HLStrategyManager.json")"
printf '  HLStrategyManager impl: %s\n' "$NEW_STRATEGY_IMPL"

# ── Upgrade Base proxies ──
log_step "Upgrading Base Sepolia proxies"

upgrade_proxy "$BASE_RPC_URL" "$VAULT_PROXY" "$NEW_VAULT_IMPL" "BaseCapitalVault"
upgrade_proxy "$BASE_RPC_URL" "$QUEUE_PROXY" "$NEW_QUEUE_IMPL" "WithdrawalQueue"
upgrade_proxy "$BASE_RPC_URL" "$RESERVE_ALLOC_PROXY" "$NEW_RESERVE_IMPL" "MorphoReserveAllocator"
upgrade_proxy "$BASE_RPC_URL" "$BRIDGE_ROUTER_PROXY" "$NEW_ROUTER_IMPL" "BridgeRouter"
upgrade_proxy "$BASE_RPC_URL" "$NAV_REPORTER_PROXY" "$NEW_NAV_IMPL" "NavReporter"

# ── Upgrade Arb proxies ──
log_step "Upgrading Arb Sepolia proxies"

upgrade_proxy "$ARB_RPC_URL" "$ARB_ESCROW_PROXY" "$NEW_ESCROW_IMPL" "ArbTransitEscrow"
upgrade_proxy "$ARB_RPC_URL" "$HL_STRATEGY_PROXY" "$NEW_STRATEGY_IMPL" "HLStrategyManager"

# ── Summary ──
log_step "All proxies upgraded successfully"
cat <<EOF

New implementation addresses:
  Base Sepolia:
    BaseCapitalVault:     $NEW_VAULT_IMPL
    WithdrawalQueue:      $NEW_QUEUE_IMPL
    MorphoReserveAllocator: $NEW_RESERVE_IMPL
    BridgeRouter:         $NEW_ROUTER_IMPL
    NavReporter:          $NEW_NAV_IMPL
  Arb Sepolia:
    ArbTransitEscrow:     $NEW_ESCROW_IMPL
    HLStrategyManager:    $NEW_STRATEGY_IMPL
EOF
