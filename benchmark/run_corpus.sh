#!/usr/bin/env bash
# Build the hash-sampled train/val/test corpus from a Lichess monthly PGN.zst.
#
# Usage (from repo root):
#   bash benchmark/run_corpus.sh
#   MONTH=2026-06 SAMPLE_PPT=30 bash benchmark/run_corpus.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MONTH="${MONTH:-2026-06}"
SAMPLE_PPT="${SAMPLE_PPT:-30}"
PY="${PY:-${ROOT}/.venv-benchmark/bin/python}"
PGN="${PGN:-${ROOT}/data/standard/lichess_db_standard_rated_${MONTH}.pgn.zst}"
CORPUS_DIR="${CORPUS_DIR:-${ROOT}/data/standard/corpus}"
CKPT_DIR="${CKPT_DIR:-${ROOT}/data/standard/checkpoints}"
RESULTS_DIR="${ROOT}/benchmark/results"
HASH_SAMPLE="${CORPUS_DIR}/${MONTH}.hashsample.compact.jsonl.zst"
STAMP="$(date +%Y%m%d-%H%M%S)"
LOG="${RESULTS_DIR}/corpus_${STAMP}.log"

mkdir -p "$CORPUS_DIR/hash" "$CKPT_DIR" "$RESULTS_DIR"

if [[ ! -x "$PY" ]]; then
  echo "Missing Python venv at $PY"
  echo "  python3 -m venv .venv-benchmark"
  echo "  .venv-benchmark/bin/pip install -r benchmark/requirements.txt"
  exit 1
fi

if [[ ! -f "$PGN" ]]; then
  echo "Missing PGN archive: $PGN"
  echo "See benchmark/README.md § Download"
  exit 1
fi

exec > >(tee -a "$LOG") 2>&1

echo "=== Corpus pipeline start $(date) ==="
echo "month=$MONTH sample_ppt=$SAMPLE_PPT"
echo "pgn=$PGN"
echo "log=$LOG"

echo "--- 1/3 stream aggregate (full scan; ${SAMPLE_PPT}‰ replay) ---"
"$PY" benchmark/stream_aggregate.py \
  "$PGN" \
  --out "${RESULTS_DIR}/aggregate_${MONTH}.json" \
  --checkpoint "${CKPT_DIR}/aggregate_${MONTH}.ckpt.pkl" \
  --checkpoint-every 500000 \
  --max-replay-ply 24 \
  --replay-sample-ppt "$SAMPLE_PPT"

echo "--- 2/3 hash-sampled compact extract (${SAMPLE_PPT}‰) ---"
"$PY" benchmark/extract_sampled_games.py \
  "$PGN" \
  --out "$HASH_SAMPLE" \
  --sample-ppt "$SAMPLE_PPT" \
  --checkpoint "${CKPT_DIR}/extract_hashsample.ckpt.json" \
  --checkpoint-every 500000

echo "--- 3/3 split hash sample → train / val / test ---"
"$PY" benchmark/split_corpus.py \
  "$HASH_SAMPLE" \
  --out-dir "${CORPUS_DIR}/hash" \
  --stats "${RESULTS_DIR}/corpus_split_hash.json"

echo "=== Corpus pipeline done $(date) ==="
echo "Outputs:"
echo "  ${CORPUS_DIR}/hash/${MONTH}.{train,val,test}.compact.jsonl.zst"
echo "  ${RESULTS_DIR}/aggregate_${MONTH}.json"
echo "  ${RESULTS_DIR}/corpus_split_hash.json"
echo ""
echo "Optional: rm $PGN   # frees ~26 GB once corpus exists"
