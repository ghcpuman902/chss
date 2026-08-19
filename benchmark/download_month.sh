#!/usr/bin/env bash
# Download one Lichess standard-rated month (newest unless MONTH=YYYY-MM).
#
# Usage (from repo root):
#   bash benchmark/download_month.sh
#   MONTH=2026-06 bash benchmark/download_month.sh
#   VERIFY=0 bash benchmark/download_month.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=lichess_month.sh
source "${ROOT}/benchmark/lichess_month.sh"

MONTH="$(lichess_resolve_month)"
OUT_DIR="${OUT_DIR:-${ROOT}/data/standard}"
NAME="$(lichess_pgn_filename "$MONTH")"
DEST="${OUT_DIR}/${NAME}"
URL="$(lichess_pgn_url "$MONTH")"
VERIFY="${VERIFY:-1}"

mkdir -p "$OUT_DIR"

echo "month=$MONTH"
echo "url=$URL"
echo "dest=$DEST"

curl -L --continue-at - -o "$DEST" "$URL"

if [[ "$VERIFY" != "1" ]]; then
  echo "ready $DEST  (sha256 skipped)"
  exit 0
fi

expected="$(
  curl -fsSL "$LICHESS_STANDARD_SHA256" \
    | awk -v f="$NAME" '$2 == f { print $1; exit }'
)"
if [[ -z "$expected" ]]; then
  echo "No SHA256 listed for $NAME at $LICHESS_STANDARD_SHA256" >&2
  exit 1
fi

echo "verifying sha256 $expected"
if command -v sha256sum >/dev/null 2>&1; then
  echo "${expected}  ${DEST}" | sha256sum -c -
else
  echo "${expected}  ${DEST}" | shasum -a 256 -c -
fi

echo "ready $DEST"
