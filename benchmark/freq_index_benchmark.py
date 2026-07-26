#!/usr/bin/env python3
"""
Phase B — frequency-index codebook: train on hash-train, measure held-out
mass coverage and bit savings vs packed UCI.

Builds per-depth top-K prefix dictionaries from train, then for each game
in val/test picks the longest matching prefix and encodes:

  bits ≈ 2 (codec tag) + ceil(log2(K_eff)) (index) + 12×remaining_plies (+promo)

Compares against packed UCI path alone (also +2-bit tag for fair hybrid).
"""

from __future__ import annotations

import argparse
import json
import math
import subprocess
import sys
import time
from collections import Counter
from pathlib import Path


def open_jsonl(path: Path):
    if str(path).endswith(".zst"):
        proc = subprocess.Popen(
            ["zstdcat", "-c", str(path)],
            stdout=subprocess.PIPE,
            text=True,
            bufsize=1 << 20,
        )
        assert proc.stdout is not None
        return proc, proc.stdout
    return None, path.open("r", encoding="utf-8")


def parse_uci_moves(u: str) -> list[str]:
    moves: list[str] = []
    i = 0
    while i < len(u):
        if i + 4 > len(u):
            break
        if (
            i + 5 <= len(u)
            and u[i + 4] in "qrbn"
            and (i + 5 == len(u) or u[i + 5] in "abcdefgh")
        ):
            moves.append(u[i : i + 5])
            i += 5
        else:
            moves.append(u[i : i + 4])
            i += 4
    return moves


def packed_uci_bits(moves: list[str]) -> int:
    bits = 0
    for m in moves:
        bits += 12
        if len(m) == 5:
            bits += 2
    return bits


def iter_games(path: Path, limit: int | None = None):
    proc, handle = open_jsonl(path)
    n = 0
    try:
        for line in handle:
            if limit is not None and n >= limit:
                break
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            u = row.get("u") or ""
            if not u:
                continue
            moves = parse_uci_moves(u)
            if not moves:
                continue
            n += 1
            yield moves, row
    finally:
        handle.close()
        if proc:
            proc.kill()


def build_prefix_counters(train_path: Path, depths: list[int], limit: int | None) -> dict[int, Counter[str]]:
    counters: dict[int, Counter[str]] = {d: Counter() for d in depths}
    t0 = time.perf_counter()
    games = 0
    for moves, _ in iter_games(train_path, limit):
        games += 1
        for d in depths:
            if len(moves) >= d:
                counters[d]["".join(moves[:d])] += 1
        if games % 200_000 == 0:
            print(f"[train] games={games:,} elapsed={time.perf_counter()-t0:.1f}s", flush=True)
    print(f"[train] done games={games:,} elapsed={time.perf_counter()-t0:.1f}s", flush=True)
    return counters


def make_codebooks(
    counters: dict[int, Counter[str]],
    depths: list[int],
    sizes: list[int],
) -> dict[int, dict[int, dict[str, int]]]:
    """size → depth → prefix → index."""
    books: dict[int, dict[int, dict[str, int]]] = {}
    for size in sizes:
        books[size] = {}
        for d in depths:
            books[size][d] = {
                prefix: i for i, (prefix, _) in enumerate(counters[d].most_common(size))
            }
    return books


def eval_split(
    path: Path,
    books: dict[int, dict[int, dict[str, int]]],
    depths: list[int],
    sizes: list[int],
    limit: int | None,
) -> dict:
    # Accumulators per size
    stats = {
        size: {
            "games": 0,
            "hit": 0,
            "bits_dict": 0.0,
            "bits_uci": 0.0,
            "bits_hybrid": 0.0,
            "hit_by_depth": Counter(),
            "match_plies_sum": 0,
        }
        for size in sizes
    }

    for moves, _ in iter_games(path, limit):
        uci_bits = packed_uci_bits(moves)
        for size in sizes:
            s = stats[size]
            s["games"] += 1
            s["bits_uci"] += 2 + uci_bits  # +2 codec tag

            best_depth = 0
            best_index = -1
            book = books[size]
            for d in sorted(depths, reverse=True):
                if len(moves) < d:
                    continue
                prefix = "".join(moves[:d])
                idx = book[d].get(prefix)
                if idx is not None:
                    best_depth = d
                    best_index = idx
                    break

            if best_depth > 0:
                s["hit"] += 1
                s["hit_by_depth"][best_depth] += 1
                s["match_plies_sum"] += best_depth
                index_bits = max(1, math.ceil(math.log2(size)))
                # depth discriminator among listed depths
                depth_bits = max(1, math.ceil(math.log2(len(depths))))
                rem = packed_uci_bits(moves[best_depth:])
                dict_bits = 2 + depth_bits + index_bits + rem
                s["bits_dict"] += dict_bits
                s["bits_hybrid"] += min(dict_bits, 2 + uci_bits)
            else:
                s["bits_dict"] += 2 + uci_bits
                s["bits_hybrid"] += 2 + uci_bits

    out = {}
    for size, s in stats.items():
        g = s["games"] or 1
        out[f"k_{size}"] = {
            "games": s["games"],
            "hit_rate_pct": round(100 * s["hit"] / g, 2),
            "mean_match_plies": round(s["match_plies_sum"] / g, 2),
            "mean_bits_uci_tagged": round(s["bits_uci"] / g, 2),
            "mean_bits_dict": round(s["bits_dict"] / g, 2),
            "mean_bits_hybrid": round(s["bits_hybrid"] / g, 2),
            "saving_vs_uci_pct": round(
                100 * (1 - (s["bits_hybrid"] / g) / (s["bits_uci"] / g)), 2
            )
            if s["bits_uci"]
            else 0,
            "hit_by_depth": dict(s["hit_by_depth"]),
        }
    return out


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--train", type=Path, required=True)
    p.add_argument("--val", type=Path, required=True)
    p.add_argument("--test", type=Path, default=None)
    p.add_argument("--depths", default="2,4,6,8,10,12,16")
    p.add_argument("--sizes", default="64,256,1024,4096,16384")
    p.add_argument("--train-limit", type=int, default=None)
    p.add_argument("--eval-limit", type=int, default=None)
    p.add_argument("--out", type=Path, default=None)
    args = p.parse_args()

    depths = [int(x) for x in args.depths.split(",") if x.strip()]
    sizes = [int(x) for x in args.sizes.split(",") if x.strip()]

    t0 = time.perf_counter()
    counters = build_prefix_counters(args.train, depths, args.train_limit)
    books = make_codebooks(counters, depths, sizes)

    # Train mass coverage (optimistic)
    train_cov = {}
    for size in sizes:
        for d in depths:
            total = sum(counters[d].values())
            hits = sum(v for _, v in counters[d].most_common(size))
            train_cov[f"depth_{d}_k_{size}"] = {
                "pct_of_depth_mass": round(100 * hits / total, 2) if total else 0,
                "unique_prefixes": len(counters[d]),
            }

    print("[eval] val…", flush=True)
    val_report = eval_split(args.val, books, depths, sizes, args.eval_limit)
    test_report = None
    if args.test:
        print("[eval] test…", flush=True)
        test_report = eval_split(args.test, books, depths, sizes, args.eval_limit)

    report = {
        "meta": {
            "train": str(args.train),
            "val": str(args.val),
            "test": str(args.test) if args.test else None,
            "depths": depths,
            "sizes": sizes,
            "train_limit": args.train_limit,
            "eval_limit": args.eval_limit,
            "elapsed_sec": round(time.perf_counter() - t0, 2),
            "encoding_model": {
                "dict": "2 tag + ceil(log2(#depths)) depth + ceil(log2(K)) index + packed suffix",
                "uci": "2 tag + 12 bits/move (+2 promo)",
                "hybrid": "min(dict, uci)",
            },
        },
        "train_prefix_mass": train_cov,
        "held_out_val": val_report,
        "held_out_test": test_report,
    }

    text = json.dumps(report, indent=2)
    print(text)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(text, encoding="utf-8")


if __name__ == "__main__":
    main()
