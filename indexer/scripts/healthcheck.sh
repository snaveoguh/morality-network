#!/usr/bin/env bash
# Indexer healthcheck for local/prod.
# Usage: ./scripts/healthcheck.sh [base_url]

set -u

BASE_URL="${1:-http://localhost:42069}"
FAILURES=0

pass() { echo "✓ $1"; }
fail() {
  echo "✗ $1" >&2
  FAILURES=$((FAILURES + 1))
}

echo "=== pooter world indexer health check ==="
echo "Target: $BASE_URL"
echo ""

# 1) Root endpoint
echo -n "GET / ... "
ROOT_CODE="$(curl -sS -o /dev/null -w "%{http_code}" "$BASE_URL/" || true)"
if [ "$ROOT_CODE" = "200" ]; then
  pass "$ROOT_CODE"
else
  fail "$ROOT_CODE"
fi

# 2) Health endpoint
echo -n "GET /api/v1/health ... "
HEALTH_BODY="$(curl -sS "$BASE_URL/api/v1/health" || true)"
HEALTH_CODE="$(curl -sS -o /dev/null -w "%{http_code}" "$BASE_URL/api/v1/health" || true)"
if [ "$HEALTH_CODE" = "200" ] && echo "$HEALTH_BODY" | grep -q '"status":"ok"'; then
  pass "$HEALTH_CODE"
else
  fail "$HEALTH_CODE"
fi

# 3) Global feed endpoint
echo -n "GET /api/v1/feed/global?limit=1 ... "
FEED_BODY="$(curl -sS "$BASE_URL/api/v1/feed/global?limit=1" || true)"
FEED_CODE="$(curl -sS -o /dev/null -w "%{http_code}" "$BASE_URL/api/v1/feed/global?limit=1" || true)"
if [ "$FEED_CODE" = "200" ] \
  && echo "$FEED_BODY" | grep -q '"generatedAt"' \
  && echo "$FEED_BODY" | grep -q '"items"'; then
  pass "$FEED_CODE (shape ok)"
else
  fail "$FEED_CODE"
fi

# 4) GraphQL endpoint (can return 200 or 400 for GET without query)
echo -n "GET /graphql ... "
GQL_CODE="$(curl -sS -o /dev/null -w "%{http_code}" "$BASE_URL/graphql" || true)"
if [ "$GQL_CODE" = "200" ] || [ "$GQL_CODE" = "400" ]; then
  pass "$GQL_CODE (graphql ready)"
else
  fail "$GQL_CODE"
fi

# 5) Scanner launches endpoint
echo -n "GET /api/v1/scanner/launches?limit=1 ... "
SCANNER_BODY="$(curl -sS "$BASE_URL/api/v1/scanner/launches?limit=1" || true)"
SCANNER_CODE="$(curl -sS -o /dev/null -w "%{http_code}" "$BASE_URL/api/v1/scanner/launches?limit=1" || true)"
if [ "$SCANNER_CODE" = "200" ] \
  && echo "$SCANNER_BODY" | grep -q '"items"'; then
  pass "$SCANNER_CODE (shape ok)"
else
  fail "$SCANNER_CODE"
fi

echo ""
if [ "$FAILURES" -gt 0 ]; then
  echo "Healthcheck failed with $FAILURES failing check(s)." >&2
  exit 1
fi

echo "All health checks passed."
