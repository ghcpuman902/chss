#!/usr/bin/env python3
"""
Product scoreboard: method × mean bits × mean payload chars × mean URL length.

Methods (research prefixes — only f-/u- match production today):
  native_fen      f- + Base64URL(full FEN)          — current FEN share path
  native_uci      u- + raw ASCII UCI                — current move-path share
  trim_fen        t- + Base64URL(trimmed FEN)
  packed_uci      p- + Base64URL(packed path bits)
  occupancy       o- + Base64URL(occupancy bits)
  naive_4bit      n- + Base64URL(fixed 265-bit grid)
  gzip_uci        g- + Base64URL(gzip(raw UCI))
  gzip_fen        z- + Base64URL(gzip(full FEN))
  lookup_k1024    d- + Base64URL(dict index + packed suffix)
  hybrid_min      h- + shortest of packed_uci / occupancy / lookup

URL = https://chss.chat/p/{code}
"""

from __future__ import annotations

import argparse
import base64
import gzip
import json
import math
import subprocess
import time
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path

import chess

URL_ORIGIN = "https://chss.chat/p/"
DEFAULT_PLY = (2, 8, 16, 32, 64)
LOOKUP_DEPTHS = (2, 4, 6, 8, 10, 12)
LOOKUP_K = 1024

METHOD_ORDER = (
    "native_fen",
    "native_uci",
    "trim_fen",
    "packed_uci",
    "occupancy",
    "naive_4bit",
    "gzip_uci",
    "gzip_fen",
    "lookup_k1024",
    "hybrid_min",
)

METHOD_META = {
    "native_fen": {"family": "raw", "prefix": "f-", "label": "Native FEN (Base64URL)"},
    "native_uci": {"family": "raw", "prefix": "u-", "label": "Native UCI (ASCII)"},
    "trim_fen": {"family": "raw", "prefix": "t-", "label": "Trimmed FEN (Base64URL)"},
    "packed_uci": {"family": "packed", "prefix": "p-", "label": "Packed UCI path"},
    "occupancy": {"family": "packed", "prefix": "o-", "label": "Occupancy + pieces"},
    "naive_4bit": {"family": "packed", "prefix": "n-", "label": "Naïve 4-bit grid"},
    "gzip_uci": {"family": "gzip", "prefix": "g-", "label": "gzip(UCI) → Base64URL"},
    "gzip_fen": {"family": "gzip", "prefix": "z-", "label": "gzip(FEN) → Base64URL"},
    "lookup_k1024": {"family": "lookup", "prefix": "d-", "label": "Lookup K=1024 + suffix"},
    "hybrid_min": {"family": "hybrid", "prefix": "h-", "label": "Hybrid (min of 3)"},
}


# ---------------------------------------------------------------------------
# Bit packing helpers
# ---------------------------------------------------------------------------

class BitWriter:
    def __init__(self) -> None:
        self._bits: list[int] = []

    def write(self, value: int, width: int) -> None:
        for i in range(width - 1, -1, -1):
            self._bits.append((value >> i) & 1)

    @property
    def bit_length(self) -> int:
        return len(self._bits)

    def to_bytes(self) -> bytes:
        bits = self._bits
        # pad to full bytes
        pad = (-len(bits)) % 8
        bits = bits + [0] * pad
        out = bytearray()
        for i in range(0, len(bits), 8):
            byte = 0
            for b in bits[i : i + 8]:
                byte = (byte << 1) | b
            out.append(byte)
        return bytes(out)


def b64url(data: bytes | str) -> str:
    if isinstance(data, str):
        data = data.encode("utf-8")
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def code_url(prefix: str, payload: str) -> tuple[str, int, int]:
    """Returns (code, payload_chars, url_chars). bits measured separately."""
    code = prefix + payload
    return code, len(payload), len(URL_ORIGIN) + len(code)


# ---------------------------------------------------------------------------
# Reuse board-aware UCI parse from bit_benchmark patterns
# ---------------------------------------------------------------------------

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


def parse_uci_concat(u: str) -> tuple[list[chess.Move], str | None]:
    board = chess.Board()
    moves: list[chess.Move] = []
    i = 0
    n = len(u)
    while i < n:
        if i + 4 > n:
            return moves, f"truncated@{i}"
        from_sq = chess.parse_square(u[i : i + 2])
        to_sq = chess.parse_square(u[i + 2 : i + 4])
        piece = board.piece_at(from_sq)
        promo = None
        consumed = 4
        if piece is not None and piece.piece_type == chess.PAWN:
            to_rank = chess.square_rank(to_sq)
            needs = (piece.color and to_rank == 7) or ((not piece.color) and to_rank == 0)
            if needs:
                if i + 5 > n or u[i + 4] not in "qrbn":
                    return moves, f"promo@{i}"
                promo = {"q": chess.QUEEN, "r": chess.ROOK, "b": chess.BISHOP, "n": chess.KNIGHT}[u[i + 4]]
                consumed = 5
        move = chess.Move(from_sq, to_sq, promotion=promo)
        if move not in board.legal_moves:
            return moves, f"illegal@{i}"
        board.push(move)
        moves.append(move)
        i += consumed
    return moves, None


def moves_to_uci_ascii(moves: list[chess.Move]) -> str:
    return "".join(m.uci() for m in moves)


def castling_nibble(board: chess.Board) -> int:
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


def ep_nibble(board: chess.Board) -> int:
    if board.ep_square is None:
        return 0
    return chess.square_file(board.ep_square) + 1


def write_meta(w: BitWriter, board: chess.Board) -> None:
    w.write(1 if board.turn == chess.WHITE else 0, 1)
    w.write(castling_nibble(board), 4)
    w.write(ep_nibble(board), 4)


PIECE_NIBBLE = {
    chess.PAWN: 1,
    chess.KNIGHT: 2,
    chess.BISHOP: 3,
    chess.ROOK: 4,
    chess.QUEEN: 5,
    chess.KING: 6,
}


def pack_occupancy(board: chess.Board) -> BitWriter:
    w = BitWriter()
    occ = 0
    pieces: list[int] = []
    for sq in range(64):
        piece = board.piece_at(sq)
        if piece is None:
            continue
        occ |= 1 << sq
        nibble = PIECE_NIBBLE[piece.piece_type]
        if piece.color == chess.BLACK:
            nibble |= 8
        pieces.append(nibble)
    w.write(occ & ((1 << 32) - 1), 32)
    w.write(occ >> 32, 32)
    for n in pieces:
        w.write(n, 4)
    write_meta(w, board)
    return w


def pack_naive(board: chess.Board) -> BitWriter:
    w = BitWriter()
    for sq in range(64):
        piece = board.piece_at(sq)
        if piece is None:
            w.write(0, 4)
        else:
            nibble = PIECE_NIBBLE[piece.piece_type]
            if piece.color == chess.BLACK:
                nibble |= 8
            w.write(nibble, 4)
    write_meta(w, board)
    return w


def pack_uci_path(moves: list[chess.Move]) -> BitWriter:
    w = BitWriter()
    for m in moves:
        w.write(m.from_square, 6)
        w.write(m.to_square, 6)
        if m.promotion:
            promo_map = {chess.QUEEN: 0, chess.ROOK: 1, chess.BISHOP: 2, chess.KNIGHT: 3}
            w.write(promo_map[m.promotion], 2)
    return w


def pack_lookup(
    moves: list[chess.Move],
    books: dict[int, dict[str, int]],
    depths: tuple[int, ...],
    k: int,
) -> BitWriter | None:
    """Returns None if no prefix hits the codebook."""
    uci = moves_to_uci_ascii(moves)
    best_depth = 0
    best_idx = -1
    for d in sorted(depths, reverse=True):
        # need at least d plies
        if len(moves) < d:
            continue
        prefix = "".join(m.uci() for m in moves[:d])
        idx = books[d].get(prefix)
        if idx is not None:
            best_depth = d
            best_idx = idx
            break
    if best_depth == 0:
        return None

    w = BitWriter()
    # depth id among LOOKUP_DEPTHS
    depth_id = depths.index(best_depth)
    w.write(depth_id, max(1, math.ceil(math.log2(len(depths)))))
    w.write(best_idx, max(1, math.ceil(math.log2(k))))
    # packed suffix
    suffix = pack_uci_path(moves[best_depth:])
    for bit in suffix._bits:
        w.write(bit, 1)
    return w


# ---------------------------------------------------------------------------
# Encode all methods for one position
# ---------------------------------------------------------------------------

@dataclass
class Encoded:
    bits: int
    chars: int  # payload only (no prefix)
    url_chars: int
    code: str


def encode_all(
    board: chess.Board,
    path_moves: list[chess.Move],
    books: dict[int, dict[str, int]],
) -> dict[str, Encoded]:
    fen = board.fen()
    parts = fen.split(" ")
    fen_trim = " ".join(parts[:4])
    uci_ascii = moves_to_uci_ascii(path_moves)

    out: dict[str, Encoded] = {}

    # native FEN
    payload = b64url(fen)
    code, chars, url_c = code_url("f-", payload)
    out["native_fen"] = Encoded(len(fen.encode()) * 8, chars, url_c, code)

    # native UCI (ASCII payload — no b64)
    code, chars, url_c = code_url("u-", uci_ascii)
    out["native_uci"] = Encoded(len(uci_ascii) * 8, chars, url_c, code)

    # trimmed FEN
    payload = b64url(fen_trim)
    code, chars, url_c = code_url("t-", payload)
    out["trim_fen"] = Encoded(len(fen_trim.encode()) * 8, chars, url_c, code)

    # packed UCI
    pw = pack_uci_path(path_moves)
    payload = b64url(pw.to_bytes())
    code, chars, url_c = code_url("p-", payload)
    out["packed_uci"] = Encoded(pw.bit_length, chars, url_c, code)

    # occupancy
    ow = pack_occupancy(board)
    payload = b64url(ow.to_bytes())
    code, chars, url_c = code_url("o-", payload)
    out["occupancy"] = Encoded(ow.bit_length, chars, url_c, code)

    # naïve 4-bit
    nw = pack_naive(board)
    payload = b64url(nw.to_bytes())
    code, chars, url_c = code_url("n-", payload)
    out["naive_4bit"] = Encoded(nw.bit_length, chars, url_c, code)

    # gzip UCI
    gz = gzip.compress(uci_ascii.encode("utf-8"), compresslevel=9)
    payload = b64url(gz)
    code, chars, url_c = code_url("g-", payload)
    out["gzip_uci"] = Encoded(len(gz) * 8, chars, url_c, code)

    # gzip FEN
    gz = gzip.compress(fen.encode("utf-8"), compresslevel=9)
    payload = b64url(gz)
    code, chars, url_c = code_url("z-", payload)
    out["gzip_fen"] = Encoded(len(gz) * 8, chars, url_c, code)

    # lookup
    lw = pack_lookup(path_moves, books, LOOKUP_DEPTHS, LOOKUP_K)
    if lw is None:
        # fallback: same as packed_uci bytes but with d- prefix (miss)
        payload = b64url(pw.to_bytes())
        # encode miss flag: leading 0 bit would be ideal; for size, use packed
        bits = pw.bit_length
    else:
        payload = b64url(lw.to_bytes())
        bits = lw.bit_length
    code, chars, url_c = code_url("d-", payload)
    out["lookup_k1024"] = Encoded(bits, chars, url_c, code)

    # hybrid: 2-bit mode + payload of shortest among packed / occupancy / lookup
    mode_map = {"packed_uci": 0, "occupancy": 1, "lookup_k1024": 2}
    candidates = ("packed_uci", "occupancy", "lookup_k1024")
    best = min(candidates, key=lambda m: out[m].url_chars)
    hw = BitWriter()
    hw.write(mode_map[best], 2)
    # Rebuild winner payload bits into hybrid stream for honest byte length
    if best == "packed_uci":
        inner = pack_uci_path(path_moves)
    elif best == "occupancy":
        inner = pack_occupancy(board)
    else:
        inner = pack_lookup(path_moves, books, LOOKUP_DEPTHS, LOOKUP_K) or pack_uci_path(path_moves)
    for bit in inner._bits:
        hw.write(bit, 1)
    payload = b64url(hw.to_bytes())
    code, chars, url_c = code_url("h-", payload)
    out["hybrid_min"] = Encoded(hw.bit_length, chars, url_c, code)

    return out


# ---------------------------------------------------------------------------
# Stats + codebook
# ---------------------------------------------------------------------------

@dataclass
class _Running:
    n: int = 0
    total: float = 0.0
    sumsq: float = 0.0
    vmin: float = math.inf
    vmax: float = -math.inf

    def add(self, x: float) -> None:
        self.n += 1
        self.total += x
        self.sumsq += x * x
        self.vmin = min(self.vmin, x)
        self.vmax = max(self.vmax, x)

    def summary(self) -> dict[str, float]:
        if self.n == 0:
            return {"mean": 0.0, "min": 0.0, "max": 0.0, "std": 0.0}
        mean = self.total / self.n
        var = max(0.0, self.sumsq / self.n - mean * mean)
        return {
            "mean": round(mean, 2),
            "min": round(self.vmin, 2),
            "max": round(self.vmax, 2),
            "std": round(math.sqrt(var), 2),
        }


@dataclass
class MetricStats:
    n: int = 0
    bits: _Running = field(default_factory=_Running)
    chars: _Running = field(default_factory=_Running)
    url: _Running = field(default_factory=_Running)

    def add(self, enc: Encoded) -> None:
        self.n += 1
        self.bits.add(float(enc.bits))
        self.chars.add(float(enc.chars))
        self.url.add(float(enc.url_chars))

    def mean(self) -> dict:
        if self.n == 0:
            return {"n": 0, "bits": 0, "chars": 0, "url": 0}
        b = self.bits.summary()
        c = self.chars.summary()
        u = self.url.summary()
        return {
            "n": self.n,
            "bits": b["mean"],
            "bits_min": b["min"],
            "bits_max": b["max"],
            "bits_std": b["std"],
            "chars": c["mean"],
            "chars_min": c["min"],
            "chars_max": c["max"],
            "chars_std": c["std"],
            "url": u["mean"],
            "url_min": u["min"],
            "url_max": u["max"],
            "url_std": u["std"],
        }


def split_uci_fast(u: str) -> list[str]:
    """Heuristic UCI split for codebook training (no legality checks)."""
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


def build_codebook(train_path: Path, limit: int | None, k: int) -> dict[int, dict[str, int]]:
    counters: dict[int, Counter[str]] = {d: Counter() for d in LOOKUP_DEPTHS}
    proc, handle = open_jsonl(train_path)
    games = 0
    t0 = time.perf_counter()
    try:
        for line in handle:
            if limit is not None and games >= limit:
                break
            if not line.strip():
                continue
            row = json.loads(line)
            moves = split_uci_fast(row.get("u") or "")
            if not moves:
                continue
            games += 1
            for d in LOOKUP_DEPTHS:
                if len(moves) >= d:
                    counters[d]["".join(moves[:d])] += 1
            if games % 500_000 == 0:
                print(f"[codebook] train games={games:,}", flush=True)
    finally:
        handle.close()
        if proc:
            proc.kill()
    print(f"[codebook] built from {games:,} games in {time.perf_counter()-t0:.1f}s", flush=True)
    return {d: {p: i for i, (p, _) in enumerate(c.most_common(k))} for d, c in counters.items()}


def phase_bucket(ply: int) -> str:
    if ply <= 8:
        return "opening"
    if ply <= 24:
        return "early"
    if ply <= 40:
        return "middlegame"
    return "late"


def run(
    eval_path: Path,
    books: dict[int, dict[str, int]],
    limit: int | None,
    ply_points: tuple[int, ...],
) -> dict:
    proc, handle = open_jsonl(eval_path)
    stats: dict[str, dict[str, MetricStats]] = {
        m: defaultdict(MetricStats) for m in METHOD_ORDER
    }
    games = 0
    positions = 0
    errors = 0
    t0 = time.perf_counter()
    targets = set(ply_points)

    try:
        for line in handle:
            if limit is not None and games >= limit:
                break
            if not line.strip():
                continue
            row = json.loads(line)
            games += 1
            moves, err = parse_uci_concat(row.get("u") or "")
            if err:
                errors += 1
            board = chess.Board()
            for ply_idx, move in enumerate(moves, start=1):
                board.push(move)
                if ply_idx not in targets:
                    continue
                encs = encode_all(board, moves[:ply_idx], books)
                positions += 1
                bucket = phase_bucket(ply_idx)
                ply_key = f"ply_{ply_idx}"
                for method, enc in encs.items():
                    stats[method]["all"].add(enc)
                    stats[method][bucket].add(enc)
                    stats[method][ply_key].add(enc)
            if games % 25_000 == 0:
                print(
                    f"[eval] games={games:,} positions={positions:,} "
                    f"rate={games/(time.perf_counter()-t0):.0f}/s",
                    flush=True,
                )
    finally:
        handle.close()
        if proc:
            proc.kill()

    elapsed = time.perf_counter() - t0

    summary_table = []
    by_phase = {}
    by_ply = {}
    for method in METHOD_ORDER:
        all_m = stats[method]["all"].mean()
        summary_table.append({
            "method": method,
            "family": METHOD_META[method]["family"],
            "label": METHOD_META[method]["label"],
            **{k: v for k, v in all_m.items() if k != "n"},
            "n": all_m["n"],
        })
        by_phase[method] = {
            ph: stats[method][ph].mean()
            for ph in ("opening", "early", "middlegame", "late")
        }
        by_ply[method] = {
            f"ply_{p}": stats[method][f"ply_{p}"].mean() for p in ply_points
        }

    return {
        "meta": {
            "url_origin": URL_ORIGIN,
            "eval_source": str(eval_path),
            "lookup_k": LOOKUP_K,
            "lookup_depths": list(LOOKUP_DEPTHS),
            "ply_points": list(ply_points),
            "games": games,
            "positions": positions,
            "parse_errors": errors,
            "elapsed_sec": round(elapsed, 2),
            "games_per_sec": round(games / elapsed, 1) if elapsed else 0,
            "note": (
                "chars = URL-safe payload length (after Base64URL where used; "
                "native_uci is raw ASCII). url = len(origin + prefix + payload)."
            ),
        },
        "methods": METHOD_ORDER,
        "method_meta": METHOD_META,
        "summary_table": summary_table,
        "by_phase": by_phase,
        "by_ply": by_ply,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--train", type=Path, required=True)
    ap.add_argument("--eval", type=Path, required=True)
    ap.add_argument("--train-limit", type=int, default=None)
    ap.add_argument("--eval-limit", type=int, default=None)
    ap.add_argument("--ply", default=",".join(str(p) for p in DEFAULT_PLY))
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--slim-out", type=Path, default=None, help="JSON for the research page")
    args = ap.parse_args()

    ply_points = tuple(int(x) for x in args.ply.split(",") if x.strip())
    books = build_codebook(args.train, args.train_limit, LOOKUP_K)
    report = run(args.eval, books, args.eval_limit, ply_points)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    if args.slim_out:
        slim = {
            "meta": report["meta"],
            "methods": report["methods"],
            "method_meta": report["method_meta"],
            "summary_table": report["summary_table"],
            "by_phase": {
                m: {ph: report["by_phase"][m][ph] for ph in ("opening", "early", "middlegame", "late")}
                for m in report["methods"]
            },
            "by_ply": report["by_ply"],
        }
        args.slim_out.parent.mkdir(parents=True, exist_ok=True)
        args.slim_out.write_text(json.dumps(slim, indent=2) + "\n", encoding="utf-8")

    print(f"\nwrote {args.out}")
    print(f"{'method':<16} {'bits':>8} {'chars':>8} {'url':>8}")
    for row in report["summary_table"]:
        print(f"{row['method']:<16} {row['bits']:8.1f} {row['chars']:8.1f} {row['url']:8.1f}")


if __name__ == "__main__":
    main()
