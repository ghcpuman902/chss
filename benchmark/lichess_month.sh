# Shared Lichess month helpers. Sourced by download / corpus / scoreboard.
# Expects ROOT to be the repository root.

LICHESS_STANDARD_LIST="https://database.lichess.org/standard/list.txt"
LICHESS_STANDARD_SHA256="https://database.lichess.org/standard/sha256sums.txt"
LICHESS_STANDARD_BASE="https://database.lichess.org/standard"

lichess_pgn_filename() {
  echo "lichess_db_standard_rated_${1}.pgn.zst"
}

lichess_pgn_url() {
  echo "${LICHESS_STANDARD_BASE}/$(lichess_pgn_filename "$1")"
}

lichess_latest_month() {
  curl -fsSL "$LICHESS_STANDARD_LIST" \
    | sed -n 's#.*/lichess_db_standard_rated_\([0-9]\{4\}-[0-9]\{2\}\)\.pgn\.zst$#\1#p' \
    | sort \
    | tail -n 1
}

lichess_local_hash_month() {
  local dir="${ROOT}/data/standard/corpus/hash"
  [[ -d "$dir" ]] || return 0
  find "$dir" -maxdepth 1 -name '*.val.compact.jsonl.zst' -print \
    | sed -n 's#.*/\([0-9]\{4\}-[0-9]\{2\}\)\.val\.compact\.jsonl\.zst$#\1#p' \
    | sort \
    | tail -n 1
}

lichess_resolve_month() {
  if [[ -n "${MONTH:-}" ]]; then
    echo "$MONTH"
    return 0
  fi
  local latest
  latest="$(lichess_latest_month)"
  if [[ -z "$latest" ]]; then
    echo "Could not resolve latest Lichess month from $LICHESS_STANDARD_LIST" >&2
    return 1
  fi
  echo "$latest"
}
