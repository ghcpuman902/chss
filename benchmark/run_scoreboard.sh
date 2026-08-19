#!/usr/bin/env bash
# Rebuild the URL-length scoreboard that feeds /research/compression.
#
# Usage (from repo root):
#   bash benchmark/run_scoreboard.sh
#   MONTH=2026-06 bash benchmark/run_scoreboard.sh
#   JOBS=12 bash benchmark/run_scoreboard.sh          # multicore eval (opt-in)
#   JOBS=$(sysctl -n hw.ncpu) bash benchmark/run_scoreboard.sh
#
# MONTH defaults to the newest local hash corpus. Pin MONTH=YYYY-MM
# to match a published run (2026-06).
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# shellcheck source=lichess_month.sh
source "${ROOT}/benchmark/lichess_month.sh"

if [[ -z "${MONTH:-}" ]]; then
  MONTH="$(lichess_local_hash_month)"
fi
if [[ -z "${MONTH:-}" ]]; then
  echo "No local hash corpus under data/standard/corpus/hash/"
  echo "Download a month, then: bash benchmark/run_corpus.sh"
  echo "  bash benchmark/download_month.sh"
  echo "Sources: data/SOURCES.md"
  exit 1
fi
PY="${PY:-${ROOT}/.venv-benchmark/bin/python}"
TRAIN="${TRAIN:-${ROOT}/data/standard/corpus/hash/${MONTH}.train.compact.jsonl.zst}"
EVAL="${EVAL:-${ROOT}/data/standard/corpus/hash/${MONTH}.val.compact.jsonl.zst}"
OUT="${OUT:-${ROOT}/benchmark/results/url_length_hash_val.json}"
SLIM="${SLIM:-${ROOT}/lib/compression-url-scoreboard.json}"
# Default single-process; set JOBS for multicore (eval is the bottleneck).
JOBS="${JOBS:-1}"

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
echo "jobs=$JOBS"

"$PY" benchmark/url_length_benchmark.py \
  --train "$TRAIN" \
  --eval "$EVAL" \
  --jobs "$JOBS" \
  --validate-suite \
  --validate-every 2000 \
  --out "$OUT" \
  --slim-out "$SLIM"

echo "Wrote $OUT"
echo "Wrote $SLIM  (consumed by app/research/compression/page.tsx)"
