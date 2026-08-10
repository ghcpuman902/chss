#!/usr/bin/env bash
# After deploy: run PV-1 probes and parse logs. Fill LEDGER.md from the written JSON.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TAG="${1:-it01-03}"
ORIGIN="${ORIGIN:-https://chss.chat}"

echo "== prod-probe tag=$TAG origin=$ORIGIN =="
node "$ROOT/benchmark/og/prod-probe.mjs" --tag "$TAG" --origin "$ORIGIN"

echo "== vercel logs (last 10m) =="
if ! command -v vercel >/dev/null 2>&1; then
  echo "vercel CLI not found — skip log parse. Install or run manually:"
  echo "  vercel logs chss.chat --since 10m --json > /tmp/og.jsonl"
  echo "  node benchmark/og/parse-vercel-logs.mjs /tmp/og.jsonl --tag $TAG"
  exit 0
fi

vercel logs chss.chat --since 10m --json > /tmp/og.jsonl
node "$ROOT/benchmark/og/parse-vercel-logs.mjs" /tmp/og.jsonl --tag "$TAG"
echo "Done. Update benchmark/og/LEDGER.md PV-1 from results/prod_* and results/vercel_logs_*."
