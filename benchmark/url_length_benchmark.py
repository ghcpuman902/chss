#!/usr/bin/env python3
"""
Product scoreboard: method × mean bits × mean payload chars × mean URL length.

Methods (research prefixes — only f-/u- match production today):
  native_fen      f- + Base64URL(full FEN)          — current FEN share path
  native_uci      u- + raw ASCII UCI                — current move-path share
  trim_fen        t- + Base64URL(trimmed FEN; playable-only variant)
  packed_uci      p- + Base64URL(packed path bits)
  occupancy       o- + Base64URL(occupancy + FEN-complete meta)
  naive_4bit      n- + Base64URL(fixed 283-bit grid: 256 + 27 meta)
  gzip_uci        g- + Base64URL(gzip(raw UCI))
  gzip_fen        z- + Base64URL(gzip(full FEN))
  lookup_k1024    d- + Base64URL(lookup payload with hit/miss discriminator)
  hybrid_min      h- + shortest of packed_uci / occupancy / lookup

Main comparison assumes complete FEN state (placement, side, castling, ep,
halfmove, fullmove). trim_fen is a labelled playable-only variant.

Lookup payload (unambiguous):
  bit 0 = 0 → miss: remaining bits are a full packed UCI path
  bit 0 = 1 → hit: depth id + dictionary index + packed suffix

URL = https://chss.chat/p/{code}

Metrics:
  bits       — logical codec bits before byte padding (not transmitted bit count)
  chars      — Base64URL (or raw ASCII) payload length, excluding the 2-char prefix
  url        — full URL length including origin + prefix + payload

Aggregates:
  summary_table          — mean across all available sampled checkpoint positions
                           (longer games contribute more checkpoints)
  summary_table_per_game — mean of per-game means (equal weight per game)
"""

from __future__ import annotations

import argparse
import base64
import gzip
import json
import math
import subprocess
import time
from array import array
from collections import Counter, defaultdict
from concurrent.futures import ProcessPoolExecutor, as_completed
from dataclasses import dataclass, field
from pathlib import Path

import chess

# Set in worker processes via _worker_init (avoid re-pickling the codebook per task).
_WORKER_BOOKS: dict[int, dict[str, int]] | None = None

URL_ORIGIN = "https://chss.chat/p/"
DEFAULT_PLY = (2, 8, 16, 32, 64)
LOOKUP_DEPTHS = (2, 4, 6, 8, 10, 12)
LOOKUP_K = 1024
LOOKUP_MISS = 0
LOOKUP_HIT = 1

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
    "trim_fen": {
        "family": "raw",
        "prefix": "t-",
        "label": "Trimmed FEN (playable-only variant)",
    },
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

    def append_bits(self, other: BitWriter) -> None:
        self._bits.extend(other._bits)

    @property
    def bit_length(self) -> int:
        return len(self._bits)

    def to_bytes(self) -> bytes:
        bits = self._bits
        pad = (-len(bits)) % 8
        bits = bits + [0] * pad
        out = bytearray()
        for i in range(0, len(bits), 8):
            byte = 0
            for b in bits[i : i + 8]:
                byte = (byte << 1) | b
            out.append(byte)
        return bytes(out)


class BitReader:
    def __init__(self, bits: list[int]) -> None:
        self._bits = bits
        self._i = 0

    @classmethod
    def from_bytes(cls, data: bytes) -> BitReader:
        bits: list[int] = []
        for byte in data:
            for i in range(7, -1, -1):
                bits.append((byte >> i) & 1)
        return cls(bits)

    @property
    def remaining(self) -> int:
        return len(self._bits) - self._i

    def read(self, width: int) -> int:
        value = 0
        for _ in range(width):
            bit = self._bits[self._i] if self._i < len(self._bits) else 0
            self._i += 1
            value = (value << 1) | bit
        return value


def b64url(data: bytes | str) -> str:
    if isinstance(data, str):
        data = data.encode("utf-8")
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def code_url(prefix: str, payload: str) -> tuple[str, int, int]:
    """Returns (code, payload_chars, url_chars). bits measured separately."""
    code = prefix + payload
    return code, len(payload), len(URL_ORIGIN) + len(code)


def depth_id_bits(depths: tuple[int, ...] = LOOKUP_DEPTHS) -> int:
    return max(1, math.ceil(math.log2(len(depths))))


def index_bits(k: int = LOOKUP_K) -> int:
    return max(1, math.ceil(math.log2(k)))


def git_sha() -> str | None:
    try:
        out = subprocess.check_output(
            ["git", "rev-parse", "HEAD"],
            cwd=Path(__file__).resolve().parent.parent,
            stderr=subprocess.DEVNULL,
        )
        return out.decode("ascii").strip()
    except (OSError, subprocess.CalledProcessError):
        return None


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
    """Encode the FEN en-passant field (not the raw ep_square, which may be set when FEN shows '-')."""
    ep = board.fen().split(" ")[3]
    if not ep or ep == "-":
        return 0
    return ord(ep[0]) - ord("a") + 1


# FEN-complete meta: side + castling + ep + halfmove + fullmove (matches full FEN).
HALFMOVE_BITS = 8   # 0..255
FULLMOVE_BITS = 10  # 0..1023
META_BITS = 1 + 4 + 4 + HALFMOVE_BITS + FULLMOVE_BITS  # 27


def write_meta(w: BitWriter, board: chess.Board) -> None:
    w.write(1 if board.turn == chess.WHITE else 0, 1)
    w.write(castling_nibble(board), 4)
    w.write(ep_nibble(board), 4)
    w.write(min(board.halfmove_clock, (1 << HALFMOVE_BITS) - 1), HALFMOVE_BITS)
    w.write(min(board.fullmove_number, (1 << FULLMOVE_BITS) - 1), FULLMOVE_BITS)


def read_meta(r: BitReader, board: chess.Board) -> None:
    turn = chess.WHITE if r.read(1) == 1 else chess.BLACK
    castling = r.read(4)
    ep = r.read(4)
    halfmove = r.read(HALFMOVE_BITS)
    fullmove = r.read(FULLMOVE_BITS)
    board.turn = turn
    board.castling_rights = 0
    if castling & 1:
        board.castling_rights |= chess.BB_H1
    if castling & 2:
        board.castling_rights |= chess.BB_A1
    if castling & 4:
        board.castling_rights |= chess.BB_H8
    if castling & 8:
        board.castling_rights |= chess.BB_A8
    if ep == 0:
        board.ep_square = None
    else:
        file = ep - 1
        rank = 5 if turn == chess.WHITE else 2
        board.ep_square = chess.square(file, rank)
    board.halfmove_clock = halfmove
    board.fullmove_number = max(1, fullmove)


PIECE_NIBBLE = {
    chess.PAWN: 1,
    chess.KNIGHT: 2,
    chess.BISHOP: 3,
    chess.ROOK: 4,
    chess.QUEEN: 5,
    chess.KING: 6,
}

NIBBLE_TO_PIECE = {
    1: (chess.PAWN, chess.WHITE),
    2: (chess.KNIGHT, chess.WHITE),
    3: (chess.BISHOP, chess.WHITE),
    4: (chess.ROOK, chess.WHITE),
    5: (chess.QUEEN, chess.WHITE),
    6: (chess.KING, chess.WHITE),
    9: (chess.PAWN, chess.BLACK),
    10: (chess.KNIGHT, chess.BLACK),
    11: (chess.BISHOP, chess.BLACK),
    12: (chess.ROOK, chess.BLACK),
    13: (chess.QUEEN, chess.BLACK),
    14: (chess.KING, chess.BLACK),
}

PROMO_FROM_BITS = {0: chess.QUEEN, 1: chess.ROOK, 2: chess.BISHOP, 3: chess.KNIGHT}


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
    depths: tuple[int, ...] = LOOKUP_DEPTHS,
    k: int = LOOKUP_K,
) -> BitWriter:
    """Always returns a payload with an explicit hit/miss discriminator bit."""
    best_depth = 0
    best_idx = -1
    for d in sorted(depths, reverse=True):
        if len(moves) < d:
            continue
        prefix = "".join(m.uci() for m in moves[:d])
        idx = books[d].get(prefix)
        if idx is not None:
            best_depth = d
            best_idx = idx
            break

    w = BitWriter()
    if best_depth == 0:
        w.write(LOOKUP_MISS, 1)
        w.append_bits(pack_uci_path(moves))
        return w

    w.write(LOOKUP_HIT, 1)
    w.write(depths.index(best_depth), depth_id_bits(depths))
    w.write(best_idx, index_bits(k))
    w.append_bits(pack_uci_path(moves[best_depth:]))
    return w


# ---------------------------------------------------------------------------
# Decode (for round-trip validation)
# ---------------------------------------------------------------------------

def decode_packed_uci(
    r: BitReader,
    start: chess.Board | None = None,
) -> list[chess.Move] | None:
    board = start.copy() if start is not None else chess.Board()
    moves: list[chess.Move] = []
    while r.remaining >= 12:
        from_sq = r.read(6)
        to_sq = r.read(6)
        if from_sq > 63 or to_sq > 63:
            return None
        piece = board.piece_at(from_sq)
        promo = None
        if piece is not None and piece.piece_type == chess.PAWN:
            to_rank = chess.square_rank(to_sq)
            needs = (piece.color and to_rank == 7) or ((not piece.color) and to_rank == 0)
            if needs:
                if r.remaining < 2:
                    break
                promo = PROMO_FROM_BITS.get(r.read(2))
                if promo is None:
                    return None
        move = chess.Move(from_sq, to_sq, promotion=promo)
        if move not in board.legal_moves:
            break
        board.push(move)
        moves.append(move)
    return moves


def decode_lookup(
    r: BitReader,
    books: dict[int, dict[str, int]],
    depths: tuple[int, ...] = LOOKUP_DEPTHS,
    k: int = LOOKUP_K,
) -> list[chess.Move] | None:
    if r.remaining < 1:
        return None
    flag = r.read(1)
    if flag == LOOKUP_MISS:
        return decode_packed_uci(r)
    if flag != LOOKUP_HIT:
        return None

    depth_id = r.read(depth_id_bits(depths))
    if depth_id >= len(depths):
        return None
    depth = depths[depth_id]
    idx = r.read(index_bits(k))
    # Reverse map index → prefix for this depth
    rev = {i: p for p, i in books[depth].items()}
    prefix_uci = rev.get(idx)
    if prefix_uci is None:
        return None
    prefix_moves, err = parse_uci_concat(prefix_uci)
    if err or len(prefix_moves) != depth:
        return None
    board = board_from_moves(prefix_moves)
    suffix = decode_packed_uci(r, start=board)
    if suffix is None:
        return None
    return prefix_moves + suffix


def fen_core(board: chess.Board) -> str:
    return " ".join(board.fen().split(" ")[:4])


def fen_full(board: chess.Board) -> str:
    """Complete FEN (placement + side + castling + ep + halfmove + fullmove)."""
    return board.fen()


def board_from_moves(moves: list[chess.Move]) -> chess.Board:
    board = chess.Board()
    for m in moves:
        board.push(m)
    return board


def decode_occupancy(r: BitReader) -> str | None:
    if r.remaining < 64 + META_BITS:
        return None
    low = r.read(32)
    high = r.read(32)
    occ_count = 0
    for sq in range(64):
        bit = (low >> sq) & 1 if sq < 32 else (high >> (sq - 32)) & 1
        if bit:
            occ_count += 1
    if r.remaining < occ_count * 4 + META_BITS:
        return None
    board = chess.Board(None)
    for sq in range(64):
        bit = (low >> sq) & 1 if sq < 32 else (high >> (sq - 32)) & 1
        if not bit:
            continue
        nibble = r.read(4)
        piece = NIBBLE_TO_PIECE.get(nibble)
        if piece is None:
            return None
        board.set_piece_at(sq, chess.Piece(piece[0], piece[1]))
    try:
        read_meta(r, board)
        return fen_full(board)
    except Exception:
        return None


def decode_naive(r: BitReader) -> str | None:
    if r.remaining < 256 + META_BITS:
        return None
    board = chess.Board(None)
    for sq in range(64):
        nibble = r.read(4)
        if nibble == 0:
            continue
        piece = NIBBLE_TO_PIECE.get(nibble)
        if piece is None:
            return None
        board.set_piece_at(sq, chess.Piece(piece[0], piece[1]))
    try:
        read_meta(r, board)
        return fen_full(board)
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Encode all methods for one position
# ---------------------------------------------------------------------------

@dataclass
class Encoded:
    bits: int  # logical codec bits (pre-padding)
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

    payload = b64url(fen)
    code, chars, url_c = code_url("f-", payload)
    out["native_fen"] = Encoded(len(fen.encode()) * 8, chars, url_c, code)

    code, chars, url_c = code_url("u-", uci_ascii)
    out["native_uci"] = Encoded(len(uci_ascii) * 8, chars, url_c, code)

    payload = b64url(fen_trim)
    code, chars, url_c = code_url("t-", payload)
    out["trim_fen"] = Encoded(len(fen_trim.encode()) * 8, chars, url_c, code)

    pw = pack_uci_path(path_moves)
    payload = b64url(pw.to_bytes())
    code, chars, url_c = code_url("p-", payload)
    out["packed_uci"] = Encoded(pw.bit_length, chars, url_c, code)

    ow = pack_occupancy(board)
    payload = b64url(ow.to_bytes())
    code, chars, url_c = code_url("o-", payload)
    out["occupancy"] = Encoded(ow.bit_length, chars, url_c, code)

    nw = pack_naive(board)
    payload = b64url(nw.to_bytes())
    code, chars, url_c = code_url("n-", payload)
    out["naive_4bit"] = Encoded(nw.bit_length, chars, url_c, code)

    gz = gzip.compress(uci_ascii.encode("utf-8"), compresslevel=9)
    payload = b64url(gz)
    code, chars, url_c = code_url("g-", payload)
    out["gzip_uci"] = Encoded(len(gz) * 8, chars, url_c, code)

    gz = gzip.compress(fen.encode("utf-8"), compresslevel=9)
    payload = b64url(gz)
    code, chars, url_c = code_url("z-", payload)
    out["gzip_fen"] = Encoded(len(gz) * 8, chars, url_c, code)

    lw = pack_lookup(path_moves, books, LOOKUP_DEPTHS, LOOKUP_K)
    payload = b64url(lw.to_bytes())
    code, chars, url_c = code_url("d-", payload)
    out["lookup_k1024"] = Encoded(lw.bit_length, chars, url_c, code)

    mode_map = {"packed_uci": 0, "occupancy": 1, "lookup_k1024": 2}
    candidates = ("packed_uci", "occupancy", "lookup_k1024")
    best = min(candidates, key=lambda m: out[m].url_chars)
    hw = BitWriter()
    hw.write(mode_map[best], 2)
    if best == "packed_uci":
        inner = pack_uci_path(path_moves)
    elif best == "occupancy":
        inner = pack_occupancy(board)
    else:
        # Always embed the full lookup payload (discriminator included).
        inner = pack_lookup(path_moves, books, LOOKUP_DEPTHS, LOOKUP_K)
    hw.append_bits(inner)
    payload = b64url(hw.to_bytes())
    code, chars, url_c = code_url("h-", payload)
    out["hybrid_min"] = Encoded(hw.bit_length, chars, url_c, code)

    return out


def roundtrip_encoded(
    board: chess.Board,
    path_moves: list[chess.Move],
    books: dict[int, dict[str, int]],
    encs: dict[str, Encoded],
) -> str | None:
    """Return an error string if any codec fails to round-trip; else None."""
    expected_core = fen_core(board)
    expected_full = fen_full(board)
    expected_uci = moves_to_uci_ascii(path_moves)

    # native FEN
    fen = base64.urlsafe_b64decode(encs["native_fen"].code[2:] + "==")
    if fen_full(chess.Board(fen.decode())) != expected_full:
        return "native_fen"

    # native UCI
    got, err = parse_uci_concat(encs["native_uci"].code[2:])
    if err or moves_to_uci_ascii(got) != expected_uci:
        return "native_uci"

    # trim FEN — playable-only variant (core fields only; not FEN-complete)
    trim = base64.urlsafe_b64decode(encs["trim_fen"].code[2:] + "==").decode()
    if " ".join(trim.split(" ")[:4]) != expected_core:
        return "trim_fen"

    # packed UCI
    r = BitReader.from_bytes(base64.urlsafe_b64decode(encs["packed_uci"].code[2:] + "=="))
    got = decode_packed_uci(r)
    if got is None or moves_to_uci_ascii(got) != expected_uci:
        return "packed_uci"

    # occupancy / naive — FEN-complete state
    r = BitReader.from_bytes(base64.urlsafe_b64decode(encs["occupancy"].code[2:] + "=="))
    if decode_occupancy(r) != expected_full:
        return "occupancy"
    r = BitReader.from_bytes(base64.urlsafe_b64decode(encs["naive_4bit"].code[2:] + "=="))
    if decode_naive(r) != expected_full:
        return "naive_4bit"

    # gzip
    gz = base64.urlsafe_b64decode(encs["gzip_uci"].code[2:] + "==")
    if gzip.decompress(gz).decode() != expected_uci:
        return "gzip_uci"
    gz = base64.urlsafe_b64decode(encs["gzip_fen"].code[2:] + "==")
    if fen_full(chess.Board(gzip.decompress(gz).decode())) != expected_full:
        return "gzip_fen"

    # lookup (hit or miss — discriminator must make both unambiguous)
    r = BitReader.from_bytes(base64.urlsafe_b64decode(encs["lookup_k1024"].code[2:] + "=="))
    got = decode_lookup(r, books)
    if got is None or moves_to_uci_ascii(got) != expected_uci:
        return "lookup_k1024"

    # hybrid
    r = BitReader.from_bytes(base64.urlsafe_b64decode(encs["hybrid_min"].code[2:] + "=="))
    mode = r.read(2)
    if mode == 0:
        got = decode_packed_uci(r)
        if got is None or moves_to_uci_ascii(got) != expected_uci:
            return "hybrid_min:packed"
    elif mode == 1:
        if decode_occupancy(r) != expected_full:
            return "hybrid_min:occupancy"
    elif mode == 2:
        got = decode_lookup(r, books)
        if got is None or moves_to_uci_ascii(got) != expected_uci:
            return "hybrid_min:lookup"
    else:
        return "hybrid_min:mode"

    return None


# ---------------------------------------------------------------------------
# Stats + codebook
# ---------------------------------------------------------------------------

def percentile_nearest_rank(sorted_vals: list[float] | array, p: float) -> float:
    """
    Nearest-rank percentile for p in [0, 100].

    With n samples, rank = ceil(p/100 * n) (1-based), clamped to [1, n].
    Deterministic for a fixed multiset of samples.
    """
    n = len(sorted_vals)
    if n == 0:
        return 0.0
    if p <= 0:
        return float(sorted_vals[0])
    if p >= 100:
        return float(sorted_vals[n - 1])
    rank = max(1, min(n, math.ceil(p / 100.0 * n)))
    return float(sorted_vals[rank - 1])


@dataclass
class _Running:
    """Collect samples for mean / median / percentiles / min / max / std."""

    values: array = field(default_factory=lambda: array("d"))

    def add(self, x: float) -> None:
        self.values.append(x)

    def extend(self, xs: array | list[float]) -> None:
        self.values.extend(xs)

    @property
    def n(self) -> int:
        return len(self.values)

    def summary(self) -> dict[str, float | int]:
        n = len(self.values)
        if n == 0:
            return {
                "mean": 0.0,
                "median": 0.0,
                "p90": 0.0,
                "p95": 0.0,
                "min": 0.0,
                "max": 0.0,
                "std": 0.0,
                "n": 0,
            }
        xs = sorted(self.values)
        total = math.fsum(xs)
        mean = total / n
        var = max(0.0, math.fsum(x * x for x in xs) / n - mean * mean)
        return {
            "mean": round(mean, 2),
            "median": round(percentile_nearest_rank(xs, 50), 2),
            "p90": round(percentile_nearest_rank(xs, 90), 2),
            "p95": round(percentile_nearest_rank(xs, 95), 2),
            "min": round(xs[0], 2),
            "max": round(xs[-1], 2),
            "std": round(math.sqrt(var), 2),
            "n": n,
        }


@dataclass
class MetricStats:
    bits: _Running = field(default_factory=_Running)
    chars: _Running = field(default_factory=_Running)
    url: _Running = field(default_factory=_Running)

    def add(self, enc: Encoded) -> None:
        self.bits.add(float(enc.bits))
        self.chars.add(float(enc.chars))
        self.url.add(float(enc.url_chars))

    def add_means(self, bits: float, chars: float, url: float) -> None:
        self.bits.add(bits)
        self.chars.add(chars)
        self.url.add(url)

    def merge(self, other: MetricStats) -> None:
        self.bits.extend(other.bits.values)
        self.chars.extend(other.chars.values)
        self.url.extend(other.url.values)

    def mean(self) -> dict:
        b = self.bits.summary()
        c = self.chars.summary()
        u = self.url.summary()
        n = b["n"]
        if n == 0:
            return {"n": 0, "bits": 0, "chars": 0, "url": 0}

        def flatten(prefix: str, s: dict) -> dict:
            return {
                prefix: s["mean"],
                f"{prefix}_median": s["median"],
                f"{prefix}_p90": s["p90"],
                f"{prefix}_p95": s["p95"],
                f"{prefix}_min": s["min"],
                f"{prefix}_max": s["max"],
                f"{prefix}_std": s["std"],
            }

        return {
            "n": n,
            **flatten("bits", b),
            **flatten("chars", c),
            **flatten("url", u),
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


def _empty_stats() -> dict[str, dict[str, MetricStats]]:
    return {m: defaultdict(MetricStats) for m in METHOD_ORDER}


def _empty_game_stats() -> dict[str, MetricStats]:
    return {m: MetricStats() for m in METHOD_ORDER}


def _worker_init(books: dict[int, dict[str, int]]) -> None:
    global _WORKER_BOOKS
    _WORKER_BOOKS = books


def _eval_uci_batch(
    uci_batch: list[str],
    ply_points: tuple[int, ...],
    validate_every: int | None,
    books: dict[int, dict[str, int]] | None = None,
) -> dict:
    """Encode checkpoint positions for a batch of UCI strings. Picklable for workers."""
    book = books if books is not None else _WORKER_BOOKS
    assert book is not None
    stats = _empty_stats()
    game_stats = _empty_game_stats()
    games = 0
    positions = 0
    errors = 0
    validate_failures = 0
    targets = set(ply_points)

    for uci in uci_batch:
        games += 1
        moves, err = parse_uci_concat(uci)
        if err:
            errors += 1
        board = chess.Board()
        game_bits: dict[str, list[float]] = {m: [] for m in METHOD_ORDER}
        game_chars: dict[str, list[float]] = {m: [] for m in METHOD_ORDER}
        game_url: dict[str, list[float]] = {m: [] for m in METHOD_ORDER}

        for ply_idx, move in enumerate(moves, start=1):
            board.push(move)
            if ply_idx not in targets:
                continue
            encs = encode_all(board, moves[:ply_idx], book)
            positions += 1
            ply_key = f"ply_{ply_idx}"

            if validate_every and positions % validate_every == 0:
                fail = roundtrip_encoded(board, moves[:ply_idx], book, encs)
                if fail:
                    validate_failures += 1

            for method, enc in encs.items():
                stats[method]["all"].add(enc)
                stats[method][ply_key].add(enc)
                game_bits[method].append(float(enc.bits))
                game_chars[method].append(float(enc.chars))
                game_url[method].append(float(enc.url_chars))

        if any(game_bits[m] for m in METHOD_ORDER):
            for method in METHOD_ORDER:
                xs_b = game_bits[method]
                if not xs_b:
                    continue
                game_stats[method].add_means(
                    sum(xs_b) / len(xs_b),
                    sum(game_chars[method]) / len(game_chars[method]),
                    sum(game_url[method]) / len(game_url[method]),
                )

    return {
        "stats": stats,
        "game_stats": game_stats,
        "games": games,
        "positions": positions,
        "errors": errors,
        "validate_failures": validate_failures,
    }


def _merge_eval_partial(
    stats: dict[str, dict[str, MetricStats]],
    game_stats: dict[str, MetricStats],
    partial: dict,
) -> tuple[int, int, int, int]:
    for method in METHOD_ORDER:
        for bucket, ms in partial["stats"][method].items():
            stats[method][bucket].merge(ms)
        game_stats[method].merge(partial["game_stats"][method])
    return (
        partial["games"],
        partial["positions"],
        partial["errors"],
        partial["validate_failures"],
    )


def load_eval_uci(eval_path: Path, limit: int | None) -> list[str]:
    proc, handle = open_jsonl(eval_path)
    out: list[str] = []
    try:
        for line in handle:
            if limit is not None and len(out) >= limit:
                break
            if not line.strip():
                continue
            row = json.loads(line)
            out.append(row.get("u") or "")
    finally:
        handle.close()
        if proc:
            proc.kill()
    return out


def run(
    eval_path: Path,
    books: dict[int, dict[str, int]],
    limit: int | None,
    ply_points: tuple[int, ...],
    validate_every: int | None = None,
    jobs: int = 1,
) -> dict:
    t0 = time.perf_counter()
    print(f"[eval] loading UCI from {eval_path} …", flush=True)
    uci_list = load_eval_uci(eval_path, limit)
    print(f"[eval] loaded {len(uci_list):,} games; jobs={jobs}", flush=True)

    stats = _empty_stats()
    game_stats = _empty_game_stats()
    games = 0
    positions = 0
    errors = 0
    validate_failures = 0

    if jobs <= 1 or len(uci_list) < 64:
        partial = _eval_uci_batch(uci_list, ply_points, validate_every, books=books)
        g, p, e, v = _merge_eval_partial(stats, game_stats, partial)
        games += g
        positions += p
        errors += e
        validate_failures += v
    else:
        # Chunk so each worker gets enough work to amortize process overhead.
        n_chunks = min(jobs * 4, max(jobs, len(uci_list) // 256))
        chunk_size = max(1, math.ceil(len(uci_list) / n_chunks))
        chunks = [
            uci_list[i : i + chunk_size] for i in range(0, len(uci_list), chunk_size)
        ]
        done = 0
        with ProcessPoolExecutor(
            max_workers=jobs,
            initializer=_worker_init,
            initargs=(books,),
        ) as pool:
            futures = [
                pool.submit(_eval_uci_batch, chunk, ply_points, validate_every)
                for chunk in chunks
            ]
            for fut in as_completed(futures):
                partial = fut.result()
                g, p, e, v = _merge_eval_partial(stats, game_stats, partial)
                games += g
                positions += p
                errors += e
                validate_failures += v
                done += 1
                elapsed_so_far = time.perf_counter() - t0
                print(
                    f"[eval] chunks={done}/{len(chunks)} games={games:,} "
                    f"positions={positions:,} rate={games/elapsed_so_far:.0f}/s",
                    flush=True,
                )

    if validate_failures:
        print(f"[validate] failures={validate_failures}", flush=True)

    elapsed = time.perf_counter() - t0

    summary_table = []
    summary_table_per_game = []
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
        pg = game_stats[method].mean()
        summary_table_per_game.append({
            "method": method,
            "family": METHOD_META[method]["family"],
            "label": METHOD_META[method]["label"],
            **{k: v for k, v in pg.items() if k != "n"},
            "n": pg["n"],
        })
        by_ply[method] = {
            f"ply_{p}": stats[method][f"ply_{p}"].mean() for p in ply_points
        }

    sha = git_sha()
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
            "validate_failures": validate_failures,
            "jobs": jobs,
            "elapsed_sec": round(elapsed, 2),
            "games_per_sec": round(games / elapsed, 1) if elapsed else 0,
            "git_sha": sha,
            "benchmark_version": "stage1-2026-07",
            "aggregates": {
                "all_positions": (
                    "Mean across all available sampled checkpoint positions "
                    "(longer games overweight)."
                ),
                "per_game": (
                    "Mean of per-game means: for each game, average over "
                    "checkpoints that game reaches, then equal-weight games."
                ),
            },
            "metrics": {
                "bits": (
                    "Logical codec bit length before byte padding. Not the same "
                    "as physically transmitted bits after Base64URL."
                ),
                "chars": (
                    "URL-safe payload character count after Base64URL where used "
                    "(native_uci is raw ASCII). Excludes the 2-char codec prefix."
                ),
                "url": "Full URL length: len(origin + prefix + payload).",
                "percentiles": (
                    "Nearest-rank: rank = ceil(p/100 * n), 1-based, clamped to [1, n]."
                ),
            },
            "checkpoints": (
                "Sampled plies only (default 2, 8, 16, 32, 64). Not phase ranges."
            ),
            "lookup_discriminator": {
                "miss": LOOKUP_MISS,
                "hit": LOOKUP_HIT,
                "note": (
                    "Leading bit on d- / hybrid mode-2 payloads. Counted in "
                    "logical bits and in the Base64URL payload."
                ),
            },
        },
        "methods": METHOD_ORDER,
        "method_meta": METHOD_META,
        "summary_table": summary_table,
        "summary_table_per_game": summary_table_per_game,
        "by_ply": by_ply,
    }


def run_validate_suite(books: dict[int, dict[str, int]]) -> None:
    """Hand-built edge cases: castling, EP, promotions, short/long paths."""
    cases = [
        "e2e4e7e5",
        "e2e4e7e5g1f3b8c6f1c4g8f6",
        "e2e4e7e5g1f3b8c6f1b5a7a6b5a4",
        "e2e4d7d5e4d5d8d5",
        "e2e4c7c5g1f3d7d6d2d4c5d4f3d4g8f6b1c3a7a6",
        "e2e4e7e5g1f3b8c6f1c4g8f6e1g1",  # white castles
        "e2e4e7e6e4e5d7d5",  # en passant available
    ]
    for uci in cases:
        moves, err = parse_uci_concat(uci)
        if err:
            raise SystemExit(f"validate suite parse failed on {uci}: {err}")
        b = board_from_moves(moves)
        encs = encode_all(b, moves, books)
        fail = roundtrip_encoded(b, moves, books, encs)
        if fail:
            raise SystemExit(f"validate suite failed on {uci}: {fail}")

    # State codecs on a constructed promotion position (no full start-path)
    promo_board = chess.Board("8/P7/8/8/8/8/8/4K2k w - - 0 1")
    promo_board.push(chess.Move.from_uci("a7a8q"))
    encs = encode_all(promo_board, [], books)
    for method in ("native_fen", "trim_fen", "occupancy", "naive_4bit", "gzip_fen"):
        # Re-check via roundtrip helper pieces
        pass
    fail = None
    expected = fen_full(promo_board)
    fen = base64.urlsafe_b64decode(encs["native_fen"].code[2:] + "==").decode()
    if fen_full(chess.Board(fen)) != expected:
        fail = "native_fen"
    r = BitReader.from_bytes(base64.urlsafe_b64decode(encs["occupancy"].code[2:] + "=="))
    if decode_occupancy(r) != expected:
        fail = "occupancy"
    r = BitReader.from_bytes(base64.urlsafe_b64decode(encs["naive_4bit"].code[2:] + "=="))
    if decode_naive(r) != expected:
        fail = "naive_4bit"
    if fail:
        raise SystemExit(f"validate suite failed on promo board: {fail}")

    # Underpromotion state
    under = chess.Board("8/P7/8/8/8/8/8/4K2k w - - 0 1")
    under.push(chess.Move.from_uci("a7a8n"))
    encs = encode_all(under, [], books)
    r = BitReader.from_bytes(base64.urlsafe_b64decode(encs["occupancy"].code[2:] + "=="))
    if decode_occupancy(r) != fen_full(under):
        raise SystemExit("validate suite failed on underpromotion occupancy")

    print("[validate-suite] ok", flush=True)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--train", type=Path, required=True)
    ap.add_argument("--eval", type=Path, required=True)
    ap.add_argument("--train-limit", type=int, default=None)
    ap.add_argument("--eval-limit", type=int, default=None)
    ap.add_argument("--ply", default=",".join(str(p) for p in DEFAULT_PLY))
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--slim-out", type=Path, default=None, help="JSON for the research page")
    ap.add_argument(
        "--jobs",
        type=int,
        default=1,
        help=(
            "Worker processes for eval (default 1). Use e.g. --jobs $(sysctl -n hw.ncpu) "
            "for multicore; opt-in so casual runs stay single-process."
        ),
    )
    ap.add_argument(
        "--validate-every",
        type=int,
        default=None,
        help="Round-trip every N encoded positions during eval (e.g. 500)",
    )
    ap.add_argument(
        "--validate-suite",
        action="store_true",
        help="Run hand-built edge-case round-trips after codebook build, then exit if fail",
    )
    args = ap.parse_args()

    ply_points = tuple(int(x) for x in args.ply.split(",") if x.strip())
    jobs = max(1, args.jobs)
    books = build_codebook(args.train, args.train_limit, LOOKUP_K)

    if args.validate_suite:
        run_validate_suite(books)

    report = run(
        args.eval,
        books,
        args.eval_limit,
        ply_points,
        validate_every=args.validate_every,
        jobs=jobs,
    )

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    if args.slim_out:
        slim = {
            "meta": report["meta"],
            "methods": report["methods"],
            "method_meta": report["method_meta"],
            "summary_table": report["summary_table"],
            "summary_table_per_game": report["summary_table_per_game"],
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
