#!/usr/bin/env python3
"""
Pass 1 — Stream PGN.zst and aggregate compression-relevant frequencies.

Does NOT materialise full JSONL. For every game:
  - cheap header strata (ECO, event, rating band, bot)
  - limited SAN replay (default first 24 plies) for UCI prefix + position keys

Supports checkpoint/resume (re-streams from start and skips N games) and
graceful SIGTERM checkpointing.

Usage:
  .venv-benchmark/bin/python stream_aggregate.py \\
      data/standard/lichess_db_standard_rated_2026-06.pgn.zst \\
      --out benchmark/results/aggregate_2026-06.json \\
      --checkpoint data/standard/checkpoints/aggregate_2026-06.ckpt.pkl
"""

from __future__ import annotations

import argparse
import json
import pickle
import signal
import sys
import time
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from pgn_common import (
    HEADER_RE,
    avg_rating_band,
    game_id_from_headers,
    movetext_tokens,
    open_pgn_text,
    parse_elo,
    replay_san_limited,
    short_event,
)

RESULT_SUFFIXES = ("1-0", "0-1", "1/2-1/2", "*")


@dataclass
class AggregateState:
    games_scanned: int = 0
    games_replayed: int = 0
    parse_errors: int = 0
    skipped_variant: int = 0
    bot_games: int = 0
    eco: Counter[str] = field(default_factory=Counter)
    openings: Counter[str] = field(default_factory=Counter)
    events: Counter[str] = field(default_factory=Counter)
    time_controls: Counter[str] = field(default_factory=Counter)
    rating_bands: Counter[str] = field(default_factory=Counter)
    prefixes: dict[int, Counter[str]] = field(default_factory=dict)
    positions: dict[int, Counter[str]] = field(default_factory=dict)
    strata_games: Counter[str] = field(default_factory=Counter)
    strata_prefixes: dict[str, dict[int, Counter[str]]] = field(default_factory=lambda: defaultdict(dict))

    def ensure_depths(self, prefix_depths: list[int], position_plies: list[int]) -> None:
        for depth in prefix_depths:
            self.prefixes.setdefault(depth, Counter())
        for ply in position_plies:
            self.positions.setdefault(ply, Counter())

    def merge_game(
        self,
        *,
        headers: dict[str, str],
        uci_moves: list[str],
        position_keys: list[str],
        prefix_depths: list[int],
        position_plies: list[int],
        replayed: bool,
        is_bot: bool,
    ) -> None:
        self.games_scanned += 1
        if is_bot:
            self.bot_games += 1
        if replayed:
            self.games_replayed += 1

        eco = headers.get("ECO") or "?"
        opening = headers.get("Opening") or "?"
        event = short_event(headers.get("Event", ""))
        tc = headers.get("TimeControl") or "?"
        band = avg_rating_band(
            parse_elo(headers.get("WhiteElo")),
            parse_elo(headers.get("BlackElo")),
        )

        self.eco[eco] += 1
        self.openings[opening] += 1
        self.events[event] += 1
        self.time_controls[tc] += 1
        self.rating_bands[band] += 1

        strata_key = f"ev={event}|band={band}|bot={1 if is_bot else 0}"
        self.strata_games[strata_key] += 1

        if not replayed:
            return

        for depth in prefix_depths:
            if len(uci_moves) >= depth:
                prefix = "".join(uci_moves[:depth])
                self.prefixes[depth][prefix] += 1
                self.strata_prefixes[strata_key].setdefault(depth, Counter())[prefix] += 1

        for ply in position_plies:
            if ply < len(position_keys):
                self.positions[ply][position_keys[ply]] += 1


def save_checkpoint(path: Path, state: AggregateState, args_meta: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    payload = {"meta": args_meta, "state": state}
    with tmp.open("wb") as handle:
        pickle.dump(payload, handle, protocol=pickle.HIGHEST_PROTOCOL)
    tmp.replace(path)


def load_checkpoint(path: Path) -> tuple[AggregateState, dict]:
    with path.open("rb") as handle:
        payload = pickle.load(handle)
    return payload["state"], payload.get("meta", {})


def top_counter(counter: Counter[str], n: int, total: int) -> list[dict]:
    return [
        {
            "key": key,
            "count": count,
            "pct": round(100 * count / total, 4) if total else 0,
        }
        for key, count in counter.most_common(n)
    ]


def prefix_coverage(prefixes: dict[int, Counter[str]], games_replayed: int, ks: list[int]) -> dict:
    out: dict[str, dict] = {}
    for depth, counter in prefixes.items():
        total_at_depth = sum(counter.values())
        depth_cov: dict[str, dict] = {}
        for k in ks:
            hits = sum(v for _, v in counter.most_common(k))
            depth_cov[f"top_{k}"] = {
                "hits": hits,
                "pct_of_depth_mass": round(100 * hits / total_at_depth, 2) if total_at_depth else 0,
                "pct_of_replayed_games": round(100 * hits / games_replayed, 2) if games_replayed else 0,
            }
        out[f"depth_{depth}"] = depth_cov
    return out


def build_report(state: AggregateState, args_meta: dict, elapsed: float) -> dict:
    games = state.games_scanned
    replayed = state.games_replayed
    return {
        "meta": {
            **args_meta,
            "elapsed_sec": round(elapsed, 2),
            "games_per_sec": round(games / elapsed, 1) if elapsed else 0,
            "replay_games_per_sec": round(replayed / elapsed, 1) if elapsed and replayed else 0,
        },
        "totals": {
            "games_scanned": games,
            "games_replayed": replayed,
            "parse_errors": state.parse_errors,
            "skipped_variant": state.skipped_variant,
            "bot_games": state.bot_games,
            "bot_rate_pct": round(100 * state.bot_games / games, 3) if games else 0,
        },
        "top_eco": top_counter(state.eco, 30, games),
        "top_openings": top_counter(state.openings, 30, games),
        "top_events": top_counter(state.events, 10, games),
        "top_time_controls": top_counter(state.time_controls, 15, games),
        "top_rating_bands": top_counter(state.rating_bands, 10, games),
        "prefix_coverage": prefix_coverage(state.prefixes, replayed, [10, 50, 100, 500, 1000, 5000]),
        "top_prefixes": {
            f"depth_{depth}": top_counter(counter, 25, replayed)
            for depth, counter in sorted(state.prefixes.items())
        },
        "top_positions": {
            f"ply_{ply}": top_counter(counter, 20, replayed)
            for ply, counter in sorted(state.positions.items())
        },
        "strata_game_counts": top_counter(state.strata_games, 30, games),
        "evaluation_notes": [
            "Prefix mass coverage is the product metric — not % of all legal positions.",
            "Held-out codec tests should use split_corpus.py outputs, not these training counts.",
            "Replay is capped — middlegame tail diversity is intentionally under-counted here.",
        ],
    }


def write_json_atomic(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    tmp.replace(path)


def stream_aggregate(
    src: Path,
    *,
    state: AggregateState,
    skip_games: int,
    game_limit: int | None,
    max_replay_ply: int,
    prefix_depths: list[int],
    position_plies: list[int],
    replay_sample_ppt: int,
    skip_variants: bool,
    checkpoint_path: Path | None,
    checkpoint_every: int,
    args_meta: dict,
) -> AggregateState:
    proc, handle = open_pgn_text(src)
    state.ensure_depths(prefix_depths, position_plies)

    headers: dict[str, str] = {}
    movelines: list[str] = []
    in_moves = False
    skipped = 0
    t0 = time.perf_counter()

    def flush_game() -> None:
        nonlocal headers, movelines, in_moves, skipped

        if not headers:
            return

        if skipped < skip_games:
            skipped += 1
            headers, movelines, in_moves = {}, [], False
            return

        if game_limit is not None and state.games_scanned >= game_limit:
            headers, movelines, in_moves = {}, [], False
            return

        variant = headers.get("Variant")
        if skip_variants and variant and variant != "Standard":
            state.skipped_variant += 1
            headers, movelines, in_moves = {}, [], False
            return

        gid = game_id_from_headers(headers)
        is_bot = headers.get("WhiteTitle") == "BOT" or headers.get("BlackTitle") == "BOT"
        should_replay = replay_sample_ppt >= 1000 or hash_mod_sample(gid, replay_sample_ppt)

        uci_moves: list[str] = []
        position_keys: list[str] = []
        if should_replay:
            tokens = movetext_tokens(" ".join(movelines))
            uci_moves, position_keys, err = replay_san_limited(tokens, max_replay_ply)
            if err:
                state.parse_errors += 1

        state.merge_game(
            headers=headers,
            uci_moves=uci_moves,
            position_keys=position_keys,
            prefix_depths=prefix_depths,
            position_plies=position_plies,
            replayed=should_replay,
            is_bot=is_bot,
        )

        if state.games_scanned % 100_000 == 0:
            elapsed = time.perf_counter() - t0
            print(
                f"[progress] scanned={state.games_scanned:,} "
                f"replayed={state.games_replayed:,} "
                f"errors={state.parse_errors:,} "
                f"rate={state.games_scanned/elapsed:.0f}/s "
                f"elapsed={elapsed/60:.1f}m",
                flush=True,
            )

        if (
            checkpoint_path
            and checkpoint_every > 0
            and state.games_scanned > 0
            and state.games_scanned % checkpoint_every == 0
        ):
            save_checkpoint(checkpoint_path, state, args_meta)
            print(f"[checkpoint] saved at {state.games_scanned:,} games", flush=True)

        headers, movelines, in_moves = {}, [], False

    stop_requested = False

    def handle_sigterm(_signum, _frame) -> None:
        nonlocal stop_requested
        stop_requested = True
        print("[signal] SIGTERM — finishing current game then checkpointing", flush=True)

    signal.signal(signal.SIGTERM, handle_sigterm)
    signal.signal(signal.SIGINT, handle_sigterm)

    try:
        for line in handle:
            if stop_requested:
                break
            if game_limit is not None and state.games_scanned >= game_limit:
                break

            if line.startswith("["):
                if in_moves and headers:
                    flush_game()
                    if game_limit is not None and state.games_scanned >= game_limit:
                        break
                match = HEADER_RE.match(line.rstrip())
                if match:
                    headers[match.group(1)] = match.group(2)
                continue

            if line.strip() == "":
                if headers and not in_moves:
                    in_moves = True
                continue

            if in_moves or headers:
                in_moves = True
                movelines.append(line.strip())
                if any(line.rstrip().endswith(r) for r in RESULT_SUFFIXES):
                    flush_game()
                    if game_limit is not None and state.games_scanned >= game_limit:
                        break
    finally:
        if headers and (game_limit is None or state.games_scanned < game_limit):
            flush_game()
        handle.close()
        if proc:
            proc.kill()

    return state


def hash_mod_sample(key: str, ppt: int, modulus: int = 1000) -> bool:
    from pgn_common import in_hash_sample

    return in_hash_sample(key, ppt, modulus)


def main() -> None:
    parser = argparse.ArgumentParser(description="Streaming PGN frequency aggregate (Pass 1)")
    parser.add_argument("src", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--checkpoint", type=Path, default=None)
    parser.add_argument("--checkpoint-every", type=int, default=500_000)
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--games", type=int, default=None, help="Stop after N games (testing)")
    parser.add_argument("--max-replay-ply", type=int, default=24)
    parser.add_argument("--prefix-depths", default="2,4,6,8,10,12,16,24")
    parser.add_argument("--position-plies", default="4,8,12,16,24")
    parser.add_argument(
        "--replay-sample-ppt",
        type=int,
        default=1000,
        help="Replay prefixes for N parts-per-thousand (1000=all, 30≈3%%)",
    )
    parser.add_argument("--keep-variants", action="store_true")
    args = parser.parse_args()

    prefix_depths = [int(x) for x in args.prefix_depths.split(",") if x.strip()]
    position_plies = [int(x) for x in args.position_plies.split(",") if x.strip()]

    args_meta = {
        "source": str(args.src),
        "max_replay_ply": args.max_replay_ply,
        "prefix_depths": prefix_depths,
        "position_plies": position_plies,
        "replay_sample_ppt": args.replay_sample_ppt,
    }

    skip_games = 0
    state = AggregateState()
    if args.resume and args.checkpoint and args.checkpoint.exists():
        state, prev_meta = load_checkpoint(args.checkpoint)
        skip_games = state.games_scanned
        print(f"[resume] skipping first {skip_games:,} games from checkpoint", flush=True)
        args_meta["resumed_from"] = skip_games
        args_meta.update({k: v for k, v in prev_meta.items() if k not in args_meta})

    t0 = time.perf_counter()
    state = stream_aggregate(
        args.src,
        state=state,
        skip_games=skip_games,
        game_limit=args.games,
        max_replay_ply=args.max_replay_ply,
        prefix_depths=prefix_depths,
        position_plies=position_plies,
        replay_sample_ppt=args.replay_sample_ppt,
        skip_variants=not args.keep_variants,
        checkpoint_path=args.checkpoint,
        checkpoint_every=args.checkpoint_every,
        args_meta=args_meta,
    )
    elapsed = time.perf_counter() - t0

    report = build_report(state, args_meta, elapsed)
    write_json_atomic(args.out, report)
    if args.checkpoint:
        save_checkpoint(args.checkpoint, state, args_meta)

    print(json.dumps({"written": str(args.out), "games_scanned": state.games_scanned}, indent=2))


if __name__ == "__main__":
    main()
