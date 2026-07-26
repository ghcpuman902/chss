#!/usr/bin/env bash
# Rebuild the URL-length scoreboard that feeds /research/compression.
#
# Usage (from repo root):
#   bash benchmark/run_scoreboard.sh
#   MONTH=2026-06 bash benchmark/run_scoreboard.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MONTH="${MONTH:-2026-06}"
PY="${PY:-${ROOT}/.venv-benchmark/bin/python}"
TRAIN="${TRAIN:-${ROOT}/data/standard/corpus/hash/${MONTH}.train.compact.jsonl.zst}"
EVAL="${EVAL:-${ROOT}/data/standard/corpus/hash/${MONTH}.val.compact.jsonl.zst}"
OUT="${OUT:-${ROOT}/benchmark/results/url_length_hash_val.json}"
SLIM="${SLIM:-${ROOT}/lib/compression-url-scoreboard.json}"

if [[ ! -x "$PY" ]]; then
  echo "Missing Python venv at $PY"
  echo "  python3 -m venv .venv-benchmark"
  echo "  .venv-benchmark/bin/pip install -r benchmark/requirements.txt"
  exit 1
fi

if [[ ! -f "$TRAIN" || ! -f "$EVAL" ]]; then
  echo "Missing corpus splits:"
  echo "  train: $TRAIN"
  echo "  eval:  $EVAL"
  echo "Run: bash benchmark/run_corpus.sh"
  exit 1
fi

mkdir -p "$(dirname "$OUT")" "$(dirname "$SLIM")"

echo "=== URL scoreboard $(date) ==="
echo "train=$TRAIN"
echo "eval=$EVAL"

"$PY" benchmark/url_length_benchmark.py \
  --train "$TRAIN" \
  --eval "$EVAL" \
  --out "$OUT" \
  --slim-out "$SLIM"

echo "Wrote $OUT"
echo "Wrote $SLIM  (consumed by app/research/compression/page.tsx)"
