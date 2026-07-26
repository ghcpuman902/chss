#!/usr/bin/env python3
"""
Stage 2 — bit-equivalent compression bake-off (pre–URL alphabet).

Compares five codecs on recreatable chess states sampled from compact
JSONL games. Reports mean / std / percentiles in *bits*, plus wall time
and RSS so we can decide whether larger runs are worth it.

Codecs
------
1. fen_full      Full FEN string (UTF-8 bytes × 8) — baseline
2. fen_trim      placement + side + castling + ep (drop clocks)
3. naive_4bit    Fixed 4 bits/square + side/castling/ep meta
4. occupancy     64-bit occupancy mask + 4-bit piece IDs + meta
5. uci_packed    Path from start: 12 bits/move (+ promo when needed)

Does NOT yet include Base64URL / Base85 / gzip — those come after we
know the bit floor.
"""

from __future__ import annotations

import argparse
import json
import math
import resource
import subprocess
import sys
import time
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

import chess

# Piece → 4-bit nibble (0 reserved for empty in naive pack)
PIECE_NIBBLE: dict[chess.PieceType, int] = {
    chess.PAWN: 1,
    chess.KNIGHT: 2,
    chess.BISHOP: 3,
    chess.ROOK: 4,
    chess.QUEEN: 5,
    chess.KING: 6,
}

CODEC_ORDER = ("fen_full", "fen_trim", "naive_4bit", "occupancy", "uci_packed")

DEFAULT_PLY_POINTS = (2, 8, 16, 32, 64)


@dataclass
class RunningStats:
    n: int = 0
    sum: float = 0.0
    sumsq: float = 0.0
    values: list[float] = field(default_factory=list)

    def add(self, x: float) -> None:
        self.n += 1
        self.sum += x
        self.sumsq += x * x
        self.values.append(x)

    def summary(self, keep_raw: bool = False) -> dict:
        if self.n == 0:
            return {"n": 0}
        mean = self.sum / self.n
        var = max(0.0, self.sumsq / self.n - mean * mean)
        vals = sorted(self.values)
        out = {
            "n": self.n,
            "mean": round(mean, 2),
            "std": round(math.sqrt(var), 2),
            "p50": round(percentile(vals, 50), 2),
            "p90": round(percentile(vals, 90), 2),
            "min": round(vals[0], 2),
            "max": round(vals[-1], 2),
        }
        if keep_raw:
            out["values"] = vals
        return out


def percentile(sorted_vals: list[float], p: float) -> float:
    if not sorted_vals:
        return 0.0
    if len(sorted_vals) == 1:
        return sorted_vals[0]
    k = (len(sorted_vals) - 1) * (p / 100.0)
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return sorted_vals[int(k)]
    return sorted_vals[f] * (c - k) + sorted_vals[c] * (k - f)


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


def parse_uci_concat_on_board(u: str) -> tuple[list[chess.Move], str | None]:
    """
    Board-aware split of concatenated UCI.

    Promotions are 5 chars (`e7e8q`); everything else is 4. Blind chunking
    of 4 breaks the stream after the first promotion — must peek at the piece
    on `from` and the destination rank.
    """
    board = chess.Board()
    moves: list[chess.Move] = []
    i = 0
    n = len(u)
    while i < n:
        if i + 4 > n:
            return moves, f"truncated_uci@{i}"
        from_sq = chess.parse_square(u[i : i + 2])
        to_sq = chess.parse_square(u[i + 2 : i + 4])
        piece = board.piece_at(from_sq)
        promo: int | None = None
        consumed = 4
        if piece is not None and piece.piece_type == chess.PAWN:
            to_rank = chess.square_rank(to_sq)
            needs_promo = (piece.color == chess.WHITE and to_rank == 7) or (
                piece.color == chess.BLACK and to_rank == 0
            )
            if needs_promo:
                if i + 5 > n or u[i + 4] not in "qrbn":
                    return moves, f"missing_promo@{i}:{u[i : i + 5]}"
                promo = {
                    "q": chess.QUEEN,
                    "r": chess.ROOK,
                    "b": chess.BISHOP,
                    "n": chess.KNIGHT,
                }[u[i + 4]]
                consumed = 5
        move = chess.Move(from_sq, to_sq, promotion=promo)
        if move not in board.legal_moves:
            return moves, f"illegal@{i}:{move.uci()}"
        board.push(move)
        moves.append(move)
        i += consumed
    return moves, None


def castling_bits(board: chess.Board) -> int:
    """4 bits: KQkq rights that are still available."""
    bits = 0
    if board.has_kingside_castling_rights(chess.WHITE):
        bits |= 1
    if board.has_queenside_castling_rights(chess.WHITE):
        bits |= 2
    if board.has_kingside_castling_rights(chess.BLACK):
        bits |= 4
    if board.has_queenside_castling_rights(chess.BLACK):
        bits |= 8
    return bits


def ep_bits(board: chess.Board) -> int:
    """4 bits: 0 = none, else file+1 (1–8). Rank is implied by side-to-move."""
    sq = board.ep_square
    if sq is None:
        return 0
    return chess.square_file(sq) + 1


def meta_bits(board: chess.Board) -> int:
    """side(1) + castling(4) + ep(4) = 9 bits."""
    return 1 + 4 + 4


def bits_fen_full(board: chess.Board) -> int:
    return len(board.fen().encode("utf-8")) * 8


def bits_fen_trim(board: chess.Board) -> int:
    # placement side castling ep — drop halfmove + fullmove
    parts = board.fen().split(" ")
    trimmed = " ".join(parts[:4])
    return len(trimmed.encode("utf-8")) * 8


def bits_naive_4bit(board: chess.Board) -> int:
    # 64 squares × 4 bits (color in high bit of nibble via offset)
    # nibble: 0 empty; 1–6 white; 9–14 black (piece+8)
    return 64 * 4 + meta_bits(board)


def bits_occupancy(board: chess.Board) -> int:
    occupied = board.occupied.bit_count()
    return 64 + occupied * 4 + meta_bits(board)


def bits_uci_packed(moves: list[chess.Move]) -> int:
    """
    Pack each move as from(6) + to(6) = 12 bits.
    Promotions add 2 bits (qrbn).
    """
    total = 0
    for m in moves:
        total += 12
        if m.promotion:
            total += 2
    return total


def encode_sizes(board: chess.Board, path_moves: list[chess.Move]) -> dict[str, int]:
    return {
        "fen_full": bits_fen_full(board),
        "fen_trim": bits_fen_trim(board),
        "naive_4bit": bits_naive_4bit(board),
        "occupancy": bits_occupancy(board),
        "uci_packed": bits_uci_packed(path_moves),
    }


def rss_mb() -> float:
    # macOS: ru_maxrss is bytes; Linux: kilobytes
    usage = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    if sys.platform == "darwin":
        return usage / (1024 * 1024)
    return usage / 1024


def run_benchmark(
    path: Path,
    limit: int | None,
    ply_points: tuple[int, ...],
    every_n: int,
) -> dict:
    proc, handle = open_jsonl(path)
    t0 = time.perf_counter()

    # stats[codec][bucket] where bucket is "ply_N" or "all"
    stats: dict[str, dict[str, RunningStats]] = {
        c: defaultdict(RunningStats) for c in CODEC_ORDER
    }
    games = 0
    positions = 0
    parse_errors = 0
    ply_sum = 0

    try:
        for line in handle:
            if limit is not None and games >= limit:
                break
            if not line.strip():
                continue
            row = json.loads(line)
            games += 1
            u = row.get("u") or ""
            path_moves, err = parse_uci_concat_on_board(u)
            if err:
                parse_errors += 1
            ply_sum += len(path_moves)

            board = chess.Board()
            target = set(ply_points)
            for ply_idx, move in enumerate(path_moves, start=1):
                board.push(move)

                take = ply_idx in target or (every_n > 0 and ply_idx % every_n == 0)
                if not take:
                    continue

                sizes = encode_sizes(board, path_moves[:ply_idx])
                positions += 1
                bucket = f"ply_{ply_idx}" if ply_idx in target else "sampled"
                for codec, bits in sizes.items():
                    stats[codec]["all"].add(bits)
                    stats[codec][bucket].add(bits)
                    if ply_idx <= 8:
                        stats[codec]["opening"].add(bits)
                    elif ply_idx <= 24:
                        stats[codec]["early"].add(bits)
                    elif ply_idx <= 40:
                        stats[codec]["middlegame"].add(bits)
                    else:
                        stats[codec]["late"].add(bits)
    finally:
        handle.close()
        if proc is not None:
            proc.wait()

    elapsed = time.perf_counter() - t0
    peak = rss_mb()

    codec_out: dict[str, dict] = {}
    for codec in CODEC_ORDER:
        codec_out[codec] = {
            bucket: running.summary()
            for bucket, running in sorted(stats[codec].items(), key=lambda x: x[0])
        }

    # Convenience: mean bits table for report
    summary_table = []
    for codec in CODEC_ORDER:
        row = {"codec": codec}
        for bucket in ("all", "opening", "early", "middlegame", "late"):
            s = codec_out[codec].get(bucket) or {}
            row[bucket] = s.get("mean")
            row[f"{bucket}_std"] = s.get("std")
            row[f"{bucket}_n"] = s.get("n")
        summary_table.append(row)

    return {
        "source": str(path),
        "games": games,
        "positions": positions,
        "parse_errors": parse_errors,
        "avg_ply": round(ply_sum / games, 2) if games else 0,
        "ply_points": list(ply_points),
        "every_n": every_n,
        "elapsed_sec": round(elapsed, 3),
        "games_per_sec": round(games / elapsed, 1) if elapsed else 0,
        "positions_per_sec": round(positions / elapsed, 1) if elapsed else 0,
        "peak_rss_mb": round(peak, 1),
        "codecs": CODEC_ORDER,
        "summary_table": summary_table,
        "detail": codec_out,
        "notes": {
            "unit": "bits to recreate the position (lossless under stated codec)",
            "fen_full": "UTF-8 FEN including halfmove/fullmove",
            "fen_trim": "UTF-8 placement+side+castling+ep",
            "naive_4bit": "256 bits piece grid + 9 meta",
            "occupancy": "64-bit mask + 4 bits × occupied + 9 meta",
            "uci_packed": "12 bits/move (+2 promo) from game start — grows with ply",
            "deferred": "Base64URL / Base85 / gzip / percent-encoding — Stage 3",
        },
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("input", type=Path, help="compact .jsonl or .jsonl.zst")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument(
        "--ply",
        type=str,
        default=",".join(str(p) for p in DEFAULT_PLY_POINTS),
        help="comma-separated ply sample points",
    )
    ap.add_argument(
        "--every",
        type=int,
        default=0,
        help="also sample every N plies (0 = only --ply points)",
    )
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args()

    ply_points = tuple(int(x) for x in args.ply.split(",") if x.strip())
    result = run_benchmark(args.input, args.limit, ply_points, args.every)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")

    print(f"games={result['games']} positions={result['positions']} "
          f"errors={result['parse_errors']} elapsed={result['elapsed_sec']}s "
          f"rate={result['games_per_sec']}/s peak_rss={result['peak_rss_mb']}MB")
    print(f"wrote {args.out}")
    print("\nmean bits by phase:")
    print(f"{'codec':<14} {'all':>8} {'open':>8} {'early':>8} {'mid':>8} {'late':>8}")
    for row in result["summary_table"]:
        print(
            f"{row['codec']:<14} "
            f"{row.get('all') or 0:8.1f} "
            f"{row.get('opening') or 0:8.1f} "
            f"{row.get('early') or 0:8.1f} "
            f"{row.get('middlegame') or 0:8.1f} "
            f"{row.get('late') or 0:8.1f}"
        )


if __name__ == "__main__":
    main()
