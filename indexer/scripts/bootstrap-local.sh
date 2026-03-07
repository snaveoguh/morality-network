#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BASE_URL="${INDEXER_BASE_URL:-http://localhost:42069}"

log() {
  echo "[indexer/bootstrap] $*"
}

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required but not installed." >&2
  exit 1
fi

if [ ! -f ".env.local" ]; then
  if [ -f ".env.example" ]; then
    cp .env.example .env.local
    log "created .env.local from .env.example"
  else
    echo ".env.local is missing and .env.example was not found." >&2
    exit 1
  fi
fi

# Export env vars for this shell (Ponder + scripts).
set -a
source .env.local
set +a

if [ ! -d node_modules ]; then
  log "installing dependencies"
  npm install
fi

log "starting postgres via docker compose"
docker compose up -d postgres >/dev/null

log "waiting for postgres readiness"
for attempt in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U pooter -d pooter_indexer >/dev/null 2>&1; then
    break
  fi
  if [ "$attempt" -eq 30 ]; then
    echo "postgres did not become ready in time." >&2
    exit 1
  fi
  sleep 1
done

log "running codegen"
npm run codegen >/dev/null

log "starting ponder dev"
npm run dev &
INDEXER_PID=$!

cleanup() {
  if kill -0 "$INDEXER_PID" >/dev/null 2>&1; then
    kill "$INDEXER_PID" >/dev/null 2>&1 || true
    wait "$INDEXER_PID" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

log "waiting for indexer api at $BASE_URL"
for attempt in $(seq 1 60); do
  if curl -fsS "$BASE_URL/api/v1/health" >/dev/null 2>&1; then
    break
  fi
  if [ "$attempt" -eq 60 ]; then
    echo "indexer api did not become ready in time." >&2
    exit 1
  fi
  sleep 1
done

log "running healthcheck"
./scripts/healthcheck.sh "$BASE_URL"

log "indexer is running (pid $INDEXER_PID). Press Ctrl+C to stop."
wait "$INDEXER_PID"
