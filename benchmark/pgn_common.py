"""Shared PGN parsing helpers for Stage 1 benchmark scripts."""

from __future__ import annotations

import hashlib
import re
import subprocess
from pathlib import Path
from typing import Iterator

import chess

HEADER_RE = re.compile(r'\[(\w+)\s+"(.*)"\]')
CLK_RE = re.compile(r"\{\s*\[%clk[^\]]*\]\s*\}")
EVAL_RE = re.compile(r"\{\s*\[%eval[^\]]*\]\s*\}")
NAG_RE = re.compile(r"\$\d+")
MOVE_NUM_RE = re.compile(r"\d+\.+")
ANNOT_SUFFIX_RE = re.compile(r"(?:\?\?|!!|\?!|!\?|\?|!)+$")
RESULT_TOKENS = {"1-0", "0-1", "1/2-1/2", "*"}
SITE_ID_RE = re.compile(r"lichess\.org/([A-Za-z0-9]+)")


def open_pgn_text(path: Path) -> tuple[subprocess.Popen[str] | None, Iterator[str]]:
    if str(path).endswith(".zst"):
        proc = subprocess.Popen(
            ["zstdcat", "-c", str(path)],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            bufsize=1 << 20,
        )
        assert proc.stdout is not None
        return proc, proc.stdout
    return None, path.open("r", encoding="utf-8", errors="replace")


def strip_comments(movetext: str) -> str:
    text = CLK_RE.sub(" ", movetext)
    text = EVAL_RE.sub(" ", text)
    text = re.sub(r"\{[^}]*\}", " ", text)
    text = re.sub(r";[^\n]*", " ", text)
    text = NAG_RE.sub(" ", text)
    text = MOVE_NUM_RE.sub(" ", text)
    return " ".join(text.split())


def clean_san_token(token: str) -> str:
    return ANNOT_SUFFIX_RE.sub("", token)


def movetext_tokens(movetext: str) -> list[str]:
    cleaned = strip_comments(movetext)
    return [
        clean_san_token(token)
        for token in cleaned.split()
        if token not in RESULT_TOKENS and clean_san_token(token)
    ]


def game_id_from_headers(headers: dict[str, str]) -> str:
    site = headers.get("Site", "")
    match = SITE_ID_RE.search(site)
    if match:
        return match.group(1)
    # Stable fallback when Site is missing.
    parts = [
        headers.get("UTCDate", headers.get("Date", "")),
        headers.get("UTCTime", ""),
        headers.get("White", ""),
        headers.get("Black", ""),
        headers.get("Result", ""),
    ]
    return "|".join(parts)


def stable_hash_int(key: str) -> int:
    digest = hashlib.blake2b(key.encode("utf-8"), digest_size=8).digest()
    return int.from_bytes(digest, "big")


def hash_mod(key: str, modulus: int = 1000) -> int:
    return stable_hash_int(key) % modulus


def in_hash_sample(key: str, ppt: int, modulus: int = 1000) -> bool:
    """ppt = parts-per-thousand; 30 ≈ 3%."""
    return hash_mod(key, modulus) < ppt


def split_bucket(key: str, modulus: int = 1000) -> str | None:
    """Deterministic train / val / test split (~79% / 10.4% / 10.4%).

    Uses a salted hash independent of ``in_hash_sample`` so a 3% month
    sample is not forced entirely into the train bucket.
    """
    bucket = hash_mod(f"split:{key}", modulus)
    if bucket < 792:
        return "train"
    if bucket < 896:
        return "val"
    if bucket < 1000:
        return "test"
    return None


def short_event(event: str) -> str:
    lowered = event.lower()
    if "bullet" in lowered:
        return "bullet"
    if "blitz" in lowered:
        return "blitz"
    if "rapid" in lowered:
        return "rapid"
    if "classical" in lowered:
        return "classical"
    if "correspondence" in lowered:
        return "corr"
    return "other"


def parse_elo(raw: str | None) -> int | None:
    if raw and raw.isdigit():
        return int(raw)
    return None


def rating_band(elo: int | None) -> str:
    if elo is None:
        return "unknown"
    if elo < 1200:
        return "<1200"
    if elo < 1500:
        return "1200-1499"
    if elo < 1800:
        return "1500-1799"
    if elo < 2100:
        return "1800-2099"
    return "2100+"


def avg_rating_band(white_elo: int | None, black_elo: int | None) -> str:
    values = [v for v in (white_elo, black_elo) if v is not None]
    if not values:
        return "unknown"
    return rating_band(sum(values) // len(values))


def position_key(board: chess.Board) -> str:
    return f"{board.board_fen()} {'w' if board.turn else 'b'}"


def replay_san_limited(
    tokens: list[str],
    max_ply: int,
) -> tuple[list[str], list[str], str | None]:
    """
    Replay SAN tokens up to max_ply.
    Returns (uci_moves, position_keys_after_each_replayed_ply, error).
    """
    board = chess.Board()
    uci_moves: list[str] = []
    positions: list[str] = [position_key(board)]

    for token in tokens:
        if len(uci_moves) >= max_ply:
            break
        try:
            move = board.parse_san(token)
        except ValueError as err:
            return uci_moves, positions, f"{token}:{err}"
        uci_moves.append(move.uci())
        board.push(move)
        positions.append(position_key(board))

    return uci_moves, positions, None
