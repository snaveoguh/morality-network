#!/usr/bin/env bash
# scripts/setup-dev-treasury.sh
#
# Prints the env vars and curl invocations needed to take the dev rollout
# from cold to "two agents trading on Base via their SCWs, commenting on
# MoralityComments, tipping each other".
#
# This script is intentionally NON-EXECUTING — it generates the secrets
# and prints the commands. Treasury moves and Railway env changes happen
# manually so you can eyeball each step.
#
# Usage:  ./scripts/setup-dev-treasury.sh [--dev|--prod]
#
# What it covers:
#   1. Generate secrets and print Railway env-var commands for each service
#   2. The four-step treasury preview → withdraw → bridge → distribute flow
#   3. Flipping DECIDE_ENABLED on each agent service
#
# Prerequisites you must already have:
#   - Pimlico API key for Base bundler+paymaster
#   - AGENT_PRIVATE_KEY (the existing HL trader key) with USDC on Hyperliquid
#   - Railway CLI logged in as the operator

set -euo pipefail

ENV_NAME="${1:-dev}"
if [[ "$ENV_NAME" != "--dev" && "$ENV_NAME" != "--prod" && "$ENV_NAME" != "dev" && "$ENV_NAME" != "prod" ]]; then
  echo "Usage: $0 [--dev|--prod]" >&2
  exit 1
fi
ENV_NAME="${ENV_NAME#--}"

WEB_BASE_URL="https://dev.pooter.world"
WEB_RAILWAY_PROJECT="earnest-love"
if [[ "$ENV_NAME" == "prod" ]]; then
  WEB_BASE_URL="https://pooter.world"
  WEB_RAILWAY_PROJECT="faithful-purpose"
fi

div() { printf '\n──── %s ────\n\n' "$1"; }

div "1) generate secrets"
MASTER_SEED=$(openssl rand -hex 32)
HMAC_SECRET=$(openssl rand -hex 32)
ADMIN_TOKEN=$(openssl rand -hex 32)
cat <<EOF
AGENT_WALLETS_MASTER_SEED=$MASTER_SEED
AGENT_WORKER_HMAC_SECRET=$HMAC_SECRET
TREASURY_ADMIN_TOKEN=$ADMIN_TOKEN

Save these somewhere safe. Treat MASTER_SEED like a private key —
compromise of it = compromise of the entire agent fleet.
EOF

div "2) set vars on the web service (Railway: $WEB_RAILWAY_PROJECT)"
cat <<EOF
On the web Railway project ($WEB_RAILWAY_PROJECT), set:

  BASE_SMART_WALLETS_ENABLED=true
  AGENT_WALLETS_MASTER_SEED=$MASTER_SEED
  AGENT_WORKER_HMAC_SECRET=$HMAC_SECRET
  TREASURY_ADMIN_TOKEN=$ADMIN_TOKEN
  PIMLICO_API_KEY=<your Pimlico Base bundler+paymaster key>

The following you (almost certainly) already have set:
  AGENT_PRIVATE_KEY  — the HL trader EOA key, used for HL withdraws + Arb bridges
  BASE_MAINNET_RPC_URL  — Base RPC
  ARBITRUM_RPC_URL  — Arbitrum RPC (default https://arb1.arbitrum.io/rpc)

Via CLI (cd into web/ first; Railway link must point at this service):
  railway variables --set BASE_SMART_WALLETS_ENABLED=true
  railway variables --set AGENT_WALLETS_MASTER_SEED=$MASTER_SEED
  railway variables --set AGENT_WORKER_HMAC_SECRET=$HMAC_SECRET
  railway variables --set TREASURY_ADMIN_TOKEN=$ADMIN_TOKEN
  railway variables --set PIMLICO_API_KEY=<your-key>
EOF

div "3) set vars on each agent service"
for AGENT in pooter1 polypooter; do
cat <<EOF
On the $AGENT Railway service:

  AGENT_API_BASE_URL=$WEB_BASE_URL
  AGENT_WORKER_HMAC_SECRET=$HMAC_SECRET   (must match the web value)
  DECIDE_ENABLED=true                      (flip LAST, only after dry-run passes)
  DECIDE_DRY_RUN=false                     (flip LAST, only after dry-run passes)
  DECIDE_INTERVAL_MS=900000                (15 minutes; lower for faster iteration)

EOF
done

div "4) verify each agent has a derived SCW address"
cat <<EOF
After the web service has the env vars set + has redeployed:

  curl $WEB_BASE_URL/api/v1/agents/pooter1/wallet
  curl $WEB_BASE_URL/api/v1/agents/polypooter/wallet
  curl $WEB_BASE_URL/api/v1/agents/_/skill   # lists available skills
EOF

div "5) treasury preview (read-only)"
cat <<EOF
  curl -H "Authorization: Bearer \$TREASURY_ADMIN_TOKEN" \\
       "$WEB_BASE_URL/api/v1/admin/treasury/preview?amountUsd=20"

Expected output: HL balance + Across fee quote + each agent SCW's
current Base ETH/USDC balances (should be zero initially).
EOF

div "6) HL withdraw (real money — dryRun first)"
cat <<EOF
DRY RUN — surfaces the prepared withdraw3 payload, signs nothing:
  curl -X POST -H "Authorization: Bearer \$TREASURY_ADMIN_TOKEN" \\
       -H "content-type: application/json" \\
       -d '{"amountUsd": 20, "dryRun": true}' \\
       $WEB_BASE_URL/api/v1/admin/treasury/hl-withdraw

EXECUTE — withdraws \$20 USDC from HL to operator EOA on Arbitrum
(~4 min for HL to release funds; HL takes a ~\$1 fee):
  curl -X POST -H "Authorization: Bearer \$TREASURY_ADMIN_TOKEN" \\
       -H "content-type: application/json" \\
       -d '{"amountUsd": 20, "dryRun": false}' \\
       $WEB_BASE_URL/api/v1/admin/treasury/hl-withdraw
EOF

div "7) Across Arb→Base bridge (USDC, ~10–60s)"
cat <<EOF
DRY RUN — surfaces the across quote:
  curl -X POST -H "Authorization: Bearer \$TREASURY_ADMIN_TOKEN" \\
       -H "content-type: application/json" \\
       -d '{"amountUsd": 18, "dryRun": true}' \\
       $WEB_BASE_URL/api/v1/admin/treasury/bridge

EXECUTE — submits depositV3 on Arbitrum, USDC lands at operator on Base:
  curl -X POST -H "Authorization: Bearer \$TREASURY_ADMIN_TOKEN" \\
       -H "content-type: application/json" \\
       -d '{"amountUsd": 18, "dryRun": false}' \\
       $WEB_BASE_URL/api/v1/admin/treasury/bridge
EOF

div "8) distribute to agent SCWs"
cat <<EOF
DRY RUN — confirms each SCW address + amount before any transfer:
  curl -X POST -H "Authorization: Bearer \$TREASURY_ADMIN_TOKEN" \\
       -H "content-type: application/json" \\
       -d '{"allocations": [
              {"agentId": "pooter1",    "amountUsd": 8},
              {"agentId": "polypooter", "amountUsd": 8}
            ], "dryRun": true}' \\
       $WEB_BASE_URL/api/v1/admin/treasury/distribute

EXECUTE — operator EOA → each SCW on Base:
  curl -X POST -H "Authorization: Bearer \$TREASURY_ADMIN_TOKEN" \\
       -H "content-type: application/json" \\
       -d '{"allocations": [
              {"agentId": "pooter1",    "amountUsd": 8},
              {"agentId": "polypooter", "amountUsd": 8}
            ], "dryRun": false}' \\
       $WEB_BASE_URL/api/v1/admin/treasury/distribute
EOF

div "9) seed each SCW with gas-money ETH (Pimlico paymaster covers most calls but a small ETH float is wise)"
cat <<EOF
Send ~0.001 ETH on Base from your personal wallet to each SCW address.
Read the addresses from /api/v1/agents/<id>/wallet (step 4 above).
This is one tx per agent — cheaper to do manually than build a route.
EOF

div "10) verify portfolios populated"
cat <<EOF
  curl $WEB_BASE_URL/api/v1/agents/pooter1/portfolio
  curl $WEB_BASE_URL/api/v1/agents/polypooter/portfolio

Each should show USDC > 0 and a tiny ETH balance.
EOF

div "11) flip the decide loops"
cat <<EOF
On each agent's Railway service:
  railway variables --set DECIDE_ENABLED=true
  railway variables --set DECIDE_DRY_RUN=false
  railway redeploy --yes

The agents will then pick one skill per tick (15-min default) under the
north-star prompt. Watch their logs and basescan.
EOF

div "12) sanity-test a single decide tick before letting the loop run"
cat <<EOF
Trigger one decide cycle manually (uses each agent's CRON_SECRET):
  curl -X POST -H "Authorization: Bearer \$CRON_SECRET" \\
       https://<pooter1-railway-url>/tasks/decide
  curl -X POST -H "Authorization: Bearer \$CRON_SECRET" \\
       https://<polypooter-railway-url>/tasks/decide

Each returns the chosen action + tx hash if executed.
EOF

echo
echo "Done. Run each command yourself — don't pipe this script to bash."
