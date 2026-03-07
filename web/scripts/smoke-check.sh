#!/usr/bin/env bash
set -u

BASE_URL="${1:-https://pooter.world}"
FAILURES=0

pass() {
  echo "✓ $1"
}

fail() {
  echo "✗ $1" >&2
  FAILURES=$((FAILURES + 1))
}

http_code() {
  curl -sS -o /dev/null -w "%{http_code}" "$1" || echo "000"
}

body() {
  curl -sS "$1" || echo ""
}

check_page() {
  local path="$1"
  local expect="$2"
  local label="$3"
  local code
  code="$(http_code "${BASE_URL}${path}")"
  if [ "$code" = "$expect" ]; then
    pass "${label} (${code})"
  else
    fail "${label} (${code})"
  fi
}

check_json_shape() {
  local path="$1"
  local code
  local payload
  local key_primary="$2"
  local key_secondary="${3:-}"
  local label="$4"

  code="$(http_code "${BASE_URL}${path}")"
  payload="$(body "${BASE_URL}${path}")"

  if [ "$code" != "200" ]; then
    fail "${label} (${code})"
    return
  fi

  if echo "$payload" | grep -q "\"${key_primary}\""; then
    pass "${label} (200 + ${key_primary})"
  elif [ -n "$key_secondary" ] && echo "$payload" | grep -q "\"${key_secondary}\""; then
    pass "${label} (200 + ${key_secondary})"
  else
    if [ -n "$key_secondary" ]; then
      fail "${label} (missing ${key_primary}/${key_secondary})"
    else
      fail "${label} (missing ${key_primary})"
    fi
  fi
}

echo "=== pooter world smoke check ==="
echo "target: ${BASE_URL}"
echo ""

check_page "/" "200" "home"
check_page "/proposals" "200" "proposals page"
check_page "/leaderboard" "200" "leaderboard page"
check_json_shape "/api/feed" "items" "" "feed api"
check_json_shape "/api/v1/governance/live?limit=5" "items" "data" "governance live api"

echo ""
if [ "$FAILURES" -gt 0 ]; then
  echo "Smoke check failed: ${FAILURES} check(s) failed." >&2
  exit 1
fi

echo "Smoke check passed."
