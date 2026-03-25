#!/bin/bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────
# ZK Password Recovery — Circuit Build & Trusted Setup
#
# Prerequisites:
#   npm install -g circom snarkjs
#   npm install circomlib
#
# This script:
#   1. Compiles the circom circuit to R1CS + WASM + C witness generators
#   2. Downloads the powers of tau ceremony file (if not cached)
#   3. Runs Groth16 trusted setup (phase 1 + phase 2)
#   4. Exports the Solidity verifier contract
#   5. Exports the verification key (JSON, for Solana/client use)
# ─────────────────────────────────────────────────────────────────────

CIRCUIT_NAME="password_recover"
BUILD_DIR="build"
PTAU_FILE="powersOfTau28_hez_final_14.ptau"
PTAU_URL="https://hermez.s3-eu-west-1.amazonaws.com/$PTAU_FILE"

CONTRACTS_DIR="../../contracts/src"

echo "═══════════════════════════════════════════════════════"
echo "  ZK Password Recovery — Circuit Build Pipeline"
echo "═══════════════════════════════════════════════════════"

# ── Step 0: Setup ──────────────────────────────────────────
mkdir -p "$BUILD_DIR"

if [ ! -d "node_modules/circomlib" ]; then
    echo "[0/6] Installing circomlib..."
    npm install circomlib
fi

# ── Step 1: Compile circuit ────────────────────────────────
echo "[1/6] Compiling circuit..."
circom "$CIRCUIT_NAME.circom" \
    --r1cs \
    --wasm \
    --sym \
    --c \
    -o "$BUILD_DIR"

echo "  R1CS constraints: $(snarkjs r1cs info "$BUILD_DIR/$CIRCUIT_NAME.r1cs" 2>&1 | grep 'Constraints' | awk '{print $NF}')"

# ── Step 2: Download powers of tau ─────────────────────────
if [ ! -f "$BUILD_DIR/$PTAU_FILE" ]; then
    echo "[2/6] Downloading powers of tau ceremony file (~48MB)..."
    curl -L -o "$BUILD_DIR/$PTAU_FILE" "$PTAU_URL"
else
    echo "[2/6] Powers of tau already cached."
fi

# ── Step 3: Groth16 setup (phase 1) ───────────────────────
echo "[3/6] Groth16 trusted setup — phase 1..."
snarkjs groth16 setup \
    "$BUILD_DIR/$CIRCUIT_NAME.r1cs" \
    "$BUILD_DIR/$PTAU_FILE" \
    "$BUILD_DIR/${CIRCUIT_NAME}_0000.zkey"

# ── Step 4: Phase 2 contribution ──────────────────────────
echo "[4/6] Phase 2 contribution (deterministic for reproducibility)..."
snarkjs zkey contribute \
    "$BUILD_DIR/${CIRCUIT_NAME}_0000.zkey" \
    "$BUILD_DIR/${CIRCUIT_NAME}_final.zkey" \
    --name="pooter-world-phase2" \
    -v -e="pooter world zk recovery $(date +%s)"

# ── Step 5: Export Solidity verifier ──────────────────────
echo "[5/6] Exporting Solidity verifier..."
snarkjs zkey export solidityverifier \
    "$BUILD_DIR/${CIRCUIT_NAME}_final.zkey" \
    "$CONTRACTS_DIR/Groth16Verifier.sol"

echo "  Written to: $CONTRACTS_DIR/Groth16Verifier.sol"

# ── Step 6: Export verification key ──────────────────────
echo "[6/6] Exporting verification key (JSON)..."
snarkjs zkey export verificationkey \
    "$BUILD_DIR/${CIRCUIT_NAME}_final.zkey" \
    "$BUILD_DIR/verification_key.json"

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  BUILD COMPLETE"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "  Circuit:    $BUILD_DIR/$CIRCUIT_NAME.r1cs"
echo "  WASM:       $BUILD_DIR/${CIRCUIT_NAME}_js/${CIRCUIT_NAME}.wasm"
echo "  zkey:       $BUILD_DIR/${CIRCUIT_NAME}_final.zkey"
echo "  Verifier:   $CONTRACTS_DIR/Groth16Verifier.sol"
echo "  VK (JSON):  $BUILD_DIR/verification_key.json"
echo ""
echo "  Next steps:"
echo "    1. Review Groth16Verifier.sol"
echo "    2. Deploy ZKRecovery.sol with verifier address"
echo "    3. Bundle WASM + zkey in mobile app assets"
echo ""
