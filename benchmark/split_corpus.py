#!/usr/bin/env python3
"""
Split compact JSONL (.zst) into train / val / test by deterministic game hash.

Uses Lichess game id (`gid`) when present; otherwise hashes a stable row fingerprint.

Usage:
  .venv-benchmark/bin/python split_corpus.py \\
      data/standard/2026-06.compact.jsonl.zst \\
      --out-dir data/standard/corpus \\
      --stats benchmark/results/corpus_split.json
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from pgn_common import split_bucket

NAME_PREFIX_RE = re.compile(r"(\d{4}-\d{2})")


def infer_name_prefix(src: Path) -> str:
    match = NAME_PREFIX_RE.search(src.name)
    if match:
        return match.group(1)
    return src.stem.split(".")[0]


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


def open_zstd_writer(path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    proc = subprocess.Popen(
        ["zstd", "-T0", "-3", "-o", str(path), "-f"],
        stdin=subprocess.PIPE,
        text=True,
    )
    assert proc.stdin is not None
    return proc, proc.stdin


def row_key(row: dict) -> str:
    gid = row.get("gid")
    if gid:
        return str(gid)
    # Fingerprint for legacy rows without gid (partial head-of-file extract).
    parts = [
        row.get("u", ""),
        row.get("eco", ""),
        str(row.get("we", "")),
        str(row.get("be", "")),
        row.get("tc", ""),
        str(row.get("n", "")),
    ]
    return "|".join(parts)


def split_corpus(
    src: Path,
    out_dir: Path,
    *,
    name_prefix: str,
    limit: int | None,
    write_skipped: bool,
) -> dict:
    proc, reader = open_jsonl(src)
    writers: dict[str, tuple[subprocess.Popen | None, object]] = {}
    counts: Counter[str] = Counter()
    errors = 0
    t0 = time.perf_counter()

    def get_writer(bucket: str):
        if bucket not in writers:
            out_path = out_dir / f"{name_prefix}.{bucket}.compact.jsonl.zst"
            writers[bucket] = open_zstd_writer(out_path)
        return writers[bucket][1]

    try:
        for line in reader:
            if limit is not None and sum(counts.values()) >= limit:
                break
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                errors += 1
                continue

            bucket = split_bucket(row_key(row))
            if bucket is None:
                if write_skipped:
                    get_writer("skipped").write(line + "\n")
                    counts["skipped"] += 1
                continue

            get_writer(bucket).write(line + "\n")
            counts[bucket] += 1

            total = sum(counts.values())
            if total and total % 100_000 == 0:
                elapsed = time.perf_counter() - t0
                print(
                    f"[progress] split={total:,} train={counts['train']:,} "
                    f"val={counts['val']:,} test={counts['test']:,} "
                    f"rate={total/elapsed:.0f}/s",
                    flush=True,
                )
    finally:
        reader.close()
        if proc:
            proc.kill()
        for _, handle in writers.values():
            handle.close()
        for zproc, _ in writers.values():
            if zproc:
                zproc.wait()

    elapsed = time.perf_counter() - t0
    total = sum(counts.values())
    return {
        "source": str(src),
        "out_dir": str(out_dir),
        "counts": dict(counts),
        "total_written": total,
        "json_errors": errors,
        "elapsed_sec": round(elapsed, 2),
        "rows_per_sec": round(total / elapsed, 1) if elapsed else 0,
        "split_pct": {
            bucket: round(100 * counts[bucket] / total, 2) if total else 0
            for bucket in ("train", "val", "test", "skipped")
        },
        "name_prefix": name_prefix,
        "outputs": {
            bucket: str(out_dir / f"{name_prefix}.{bucket}.compact.jsonl.zst")
            for bucket in ("train", "val", "test")
            if counts[bucket]
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("src", type=Path)
    parser.add_argument("--out-dir", type=Path, default=Path("data/standard/corpus"))
    parser.add_argument("--stats", type=Path, default=Path("benchmark/results/corpus_split.json"))
    parser.add_argument("--name-prefix", default=None, help="Output stem, e.g. 2026-07. Inferred from src if omitted.")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--write-skipped", action="store_true")
    args = parser.parse_args()

    name_prefix = args.name_prefix or infer_name_prefix(args.src)
    report = split_corpus(
        args.src,
        args.out_dir,
        name_prefix=name_prefix,
        limit=args.limit,
        write_skipped=args.write_skipped,
    )
    text = json.dumps(report, indent=2)
    print(text)
    args.stats.parent.mkdir(parents=True, exist_ok=True)
    args.stats.write_text(text, encoding="utf-8")


if __name__ == "__main__":
    main()
