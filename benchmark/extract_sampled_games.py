#!/usr/bin/env python3
"""
Hash-sampled compact JSONL extract from PGN.zst.

Unlike head-of-file sampling, every game in the month has an equal chance of
selection based on Lichess game id hash — distributed across the whole archive.

Usage:
  .venv-benchmark/bin/python benchmark/extract_sampled_games.py \\
      data/standard/lichess_db_standard_rated_2026-06.pgn.zst \\
      --out data/standard/corpus/2026-06.hashsample.compact.jsonl.zst \\
      --sample-ppt 30
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

import chess

sys.path.insert(0, str(Path(__file__).resolve().parent))

from pgn_common import (
    HEADER_RE,
    game_id_from_headers,
    in_hash_sample,
    movetext_tokens,
    parse_elo,
    short_event,
    split_bucket,
)

RESULT_SUFFIXES = ("1-0", "0-1", "1/2-1/2", "*")


def open_pgn_text(path: Path):
    from pgn_common import open_pgn_text as _open

    return _open(path)


def open_zstd_writer(path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    proc = subprocess.Popen(
        ["zstd", "-T0", "-3", "-o", str(path), "-f"],
        stdin=subprocess.PIPE,
        text=True,
    )
    assert proc.stdin is not None
    return proc, proc.stdin


def full_replay_uci(tokens: list[str]) -> tuple[str, int, str | None]:
    board = chess.Board()
    parts: list[str] = []
    for token in tokens:
        try:
            move = board.parse_san(token)
        except ValueError as err:
            return "".join(parts), len(parts), f"{token}:{err}"
        parts.append(move.uci())
        board.push(move)
    return "".join(parts), len(parts), None


def extract_sampled(
    src: Path,
    out: Path,
    *,
    sample_ppt: int,
    split: str | None,
    target_games: int | None,
    max_scan: int | None,
    keep_bots: bool,
    skip_variants: bool,
    checkpoint_path: Path | None,
    checkpoint_every: int,
    resume: bool,
) -> dict:
    skip_games = 0
    games_out = 0
    if resume and checkpoint_path and checkpoint_path.exists():
        meta = json.loads(checkpoint_path.read_text(encoding="utf-8"))
        skip_games = int(meta.get("games_scanned", 0))
        games_out = int(meta.get("games_out", 0))
        print(f"[resume] skip first {skip_games:,} scanned / {games_out:,} written", flush=True)

    proc, handle = open_pgn_text(src)
    writer_proc, out_handle = open_zstd_writer(out)

    stats = {
        "games_scanned": 0,
        "games_out": 0,
        "skipped_not_sampled": 0,
        "skipped_split": 0,
        "skipped_bot": 0,
        "skipped_variant": 0,
        "parse_errors": 0,
        "sample_ppt": sample_ppt,
        "split_filter": split,
    }

    headers: dict[str, str] = {}
    movelines: list[str] = []
    in_moves = False
    skipped = 0
    t0 = time.perf_counter()

    def write_checkpoint() -> None:
        if not checkpoint_path:
            return
        payload = {
            "games_scanned": stats["games_scanned"],
            "games_out": stats["games_out"],
            "source": str(src),
            "out": str(out),
        }
        tmp = checkpoint_path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        tmp.replace(checkpoint_path)

    def flush_game() -> None:
        nonlocal headers, movelines, in_moves, skipped, games_out

        if not headers:
            return

        if skipped < skip_games:
            skipped += 1
            stats["games_scanned"] += 1
            headers, movelines, in_moves = {}, [], False
            return

        stats["games_scanned"] += 1

        variant = headers.get("Variant")
        if skip_variants and variant and variant != "Standard":
            stats["skipped_variant"] += 1
            headers, movelines, in_moves = {}, [], False
            return

        gid = game_id_from_headers(headers)
        if not in_hash_sample(gid, sample_ppt):
            stats["skipped_not_sampled"] += 1
            headers, movelines, in_moves = {}, [], False
            return

        bucket = split_bucket(gid)
        if split and bucket != split:
            stats["skipped_split"] += 1
            headers, movelines, in_moves = {}, [], False
            return

        is_bot = headers.get("WhiteTitle") == "BOT" or headers.get("BlackTitle") == "BOT"
        if is_bot and not keep_bots:
            stats["skipped_bot"] += 1
            headers, movelines, in_moves = {}, [], False
            return

        tokens = movetext_tokens(" ".join(movelines))
        uci, ply, err = full_replay_uci(tokens)
        if err:
            stats["parse_errors"] += 1

        row = {
            "gid": gid,
            "u": uci,
            "n": ply,
            "eco": headers.get("ECO"),
            "op": headers.get("Opening"),
            "we": parse_elo(headers.get("WhiteElo")),
            "be": parse_elo(headers.get("BlackElo")),
            "bot": 1 if is_bot else 0,
            "tc": headers.get("TimeControl"),
            "ev": short_event(headers.get("Event", "")),
            "res": headers.get("Result"),
            "split": bucket,
        }
        if variant:
            row["var"] = variant

        out_handle.write(json.dumps(row, separators=(",", ":")) + "\n")
        stats["games_out"] += 1
        games_out += 1

        if stats["games_out"] % 50_000 == 0:
            elapsed = time.perf_counter() - t0
            print(
                f"[progress] out={stats['games_out']:,} scanned={stats['games_scanned']:,} "
                f"errors={stats['parse_errors']:,} rate={stats['games_scanned']/elapsed:.0f}/s",
                flush=True,
            )

        if checkpoint_path and checkpoint_every > 0 and stats["games_scanned"] % checkpoint_every == 0:
            write_checkpoint()

        headers, movelines, in_moves = {}, [], False

    try:
        for line in handle:
            if max_scan is not None and stats["games_scanned"] >= max_scan:
                break
            if target_games is not None and stats["games_out"] >= target_games:
                break

            if line.startswith("["):
                if in_moves and headers:
                    flush_game()
                    if target_games is not None and stats["games_out"] >= target_games:
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
                    if target_games is not None and stats["games_out"] >= target_games:
                        break
    finally:
        if headers:
            flush_game()
        handle.close()
        if proc:
            proc.kill()
        out_handle.close()
        if writer_proc:
            writer_proc.wait()
        write_checkpoint()

    elapsed = time.perf_counter() - t0
    stats["elapsed_sec"] = round(elapsed, 2)
    stats["scan_per_sec"] = round(stats["games_scanned"] / elapsed, 1) if elapsed else 0
    stats["out_path"] = str(out)
    stats["out_bytes"] = out.stat().st_size if out.exists() else 0
    return stats


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("src", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--sample-ppt", type=int, default=30, help="Parts-per-thousand (~3%%)")
    parser.add_argument("--split", choices=("train", "val", "test"), default=None)
    parser.add_argument("--target-games", type=int, default=None)
    parser.add_argument("--max-scan", type=int, default=None, help="Stop after scanning N games (testing)")
    parser.add_argument("--drop-bots", action="store_true")
    parser.add_argument("--keep-variants", action="store_true")
    parser.add_argument("--checkpoint", type=Path, default=None)
    parser.add_argument("--checkpoint-every", type=int, default=500_000)
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args()

    stats = extract_sampled(
        args.src,
        args.out,
        sample_ppt=args.sample_ppt,
        split=args.split,
        target_games=args.target_games,
        max_scan=args.max_scan,
        keep_bots=not args.drop_bots,
        skip_variants=not args.keep_variants,
        checkpoint_path=args.checkpoint,
        checkpoint_every=args.checkpoint_every,
        resume=args.resume,
    )
    print(json.dumps(stats, indent=2))


if __name__ == "__main__":
    main()
