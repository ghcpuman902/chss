# Chess URL compression benchmark

Reproduce the numbers on [`/research/compression`](https://chss.chat/research/compression) from public Lichess data and the scripts in this folder.

Source: [github.com/ghcpuman902/chss](https://github.com/ghcpuman902/chss) · path `benchmark/`

The product metric is **pasteable URL length** (`https://chss.chat/p/` + code), not raw bit count. The pipeline builds a hash-sampled train/val/test corpus from one month of standard rated games, then measures each codec family on held-out positions.

---

## What you need

| Requirement | Notes |
|---|---|
| Disk | **~30 GB free** for one monthly `.pgn.zst`, plus ~1 GB for the compact corpus (and temporary room while writing splits) |
| RAM | **~5 GB+ free** while streaming / extracting (our run sat comfortably on an 18 GB M3 Pro) |
| Time | On our hardware (**Apple M3 Pro**, 18 GB): corpus pipeline ≈ **1 h 45 m** wall (~60 min aggregate + **~41 min** hash extract + seconds to split). Scoreboard is minutes on the val split |
| Tools | Python 3.11+, [`zstd`](https://facebook.github.io/zstd/) (`zstd` / `zstdcat`), `curl` |
| Python deps | `python-chess` (see `requirements.txt`) |

macOS: `brew install zstd`. Linux: install the `zstd` package from your distro.

---

## Quick start

From the repo root:

```bash
git clone https://github.com/ghcpuman902/chss.git
cd chss

python3 -m venv .venv-benchmark
.venv-benchmark/bin/pip install -r benchmark/requirements.txt

# 1. Download one Lichess month (~26 GB for 2026-06)
mkdir -p data/standard
curl -L --continue-at - \
  -o data/standard/lichess_db_standard_rated_2026-06.pgn.zst \
  https://database.lichess.org/standard/lichess_db_standard_rated_2026-06.pgn.zst

# 2. Stream → compact hash sample → train/val/test
bash benchmark/run_corpus.sh

# 3. Rebuild the URL scoreboard (+ slim JSON for the research page)
bash benchmark/run_scoreboard.sh
```

After step 3 you should see means close to the published table (hybrid ≈ 39 URL chars, occupancy ≈ 54, native FEN ≈ 104 on the June 2026 hash-val split). Exact floats can drift slightly with toolchain versions; ranking should match.

Optional: delete the raw PGN once the corpus exists:

```bash
rm data/standard/lichess_db_standard_rated_2026-06.pgn.zst
```

---

## 1. Clone the code

```bash
git clone https://github.com/ghcpuman902/chss.git
cd chss
```

All commands below assume the repository root as the working directory. Scripts resolve paths relative to that root.

---

## 2. Python environment

```bash
python3 -m venv .venv-benchmark
.venv-benchmark/bin/pip install -r benchmark/requirements.txt
```

Confirm `zstdcat` works:

```bash
zstdcat --version
```

---

## 3. Download Lichess standard rated games

Monthly dumps are **CC0**, listed at [database.lichess.org](https://database.lichess.org/). Files are **not cumulative** — each month is a separate archive.

The published scoreboard used **June 2026** (`86,483,328` games, ~26 GB compressed):

```bash
mkdir -p data/standard
curl -L --continue-at - \
  -o data/standard/lichess_db_standard_rated_2026-06.pgn.zst \
  https://database.lichess.org/standard/lichess_db_standard_rated_2026-06.pgn.zst
```

Checksums and the full index live at:

- https://database.lichess.org/standard/list.txt

Do **not** fully decompress the archive to disk. Uncompressed size is roughly **7×** the `.zst` (~180+ GB for this month). The scripts stream with `zstdcat`.

To use another month, set `MONTH=YYYY-MM` when calling the shell helpers, and download the matching filename from the list above.

---

## 4. Stream, convert, and split

`run_corpus.sh` runs three passes:

1. **`stream_aggregate.py`** — full-month header scan; limited SAN replay on a 3% hash sample for prefix / ECO / strata counters. Writes `benchmark/results/aggregate_YYYY-MM.json`.
2. **`extract_sampled_games.py`** — same 3% hash of game ids → compact JSONL (UCI path + light metadata), zstd-compressed. Distributed across the whole month, not head-biased.
3. **`split_corpus.py`** — deterministic train (~79%) / val (~10%) / test (~10%) using a salted hash independent of the sample key.

On our reference machine (Apple M3 Pro, 18 GB RAM) the June 2026 month finished in about **1 h 45 m** wall time: ~60 min aggregate, **~41 min** extract (2.59M games out), then a few seconds to split. Plan for **~30 GB free disk** and **5 GB+ free RAM** before you start.

```bash
bash benchmark/run_corpus.sh
# equivalent with overrides:
# MONTH=2026-06 SAMPLE_PPT=30 bash benchmark/run_corpus.sh
```

Expected outputs:

```text
data/standard/corpus/hash/2026-06.train.compact.jsonl.zst   # ~2.05M games
data/standard/corpus/hash/2026-06.val.compact.jsonl.zst     # ~270k games
data/standard/corpus/hash/2026-06.test.compact.jsonl.zst    # ~270k games
benchmark/results/aggregate_2026-06.json
benchmark/results/corpus_split_hash.json
```

Compact row shape (one game per line):

```json
{"gid":"chMzC5yh","u":"e2e4e7e5g1f3...","n":64,"eco":"C50","op":"Italian Game","we":1523,"be":1607,"bot":0,"tc":"180+0","ev":"blitz","res":"1-0"}
```

Promotions are **five-character** UCI (`e7e8q`). Stage-2 codecs parse board-aware; do not chunk the `u` field into blind 4-char windows.

### Smoke test (optional)

Skip the full month while wiring things up:

```bash
.venv-benchmark/bin/python benchmark/extract_sampled_games.py \
  data/standard/lichess_db_standard_rated_2026-06.pgn.zst \
  --out data/standard/2026-06.smoke.compact.jsonl.zst \
  --sample-ppt 30 \
  --max-scan 5000 \
  --target-games 200
```

---

## 5. Run the URL scoreboard

```bash
bash benchmark/run_scoreboard.sh
```

This trains a K=1024 opening codebook on the train split, evaluates at plies `{2,8,16,32,64}` on val, and writes:

| File | Role |
|---|---|
| `benchmark/results/url_length_hash_val.json` | Full report |
| `lib/compression-url-scoreboard.json` | Slim table consumed by the Next.js research page |

Manual equivalent:

```bash
.venv-benchmark/bin/python benchmark/url_length_benchmark.py \
  --train data/standard/corpus/hash/2026-06.train.compact.jsonl.zst \
  --eval data/standard/corpus/hash/2026-06.val.compact.jsonl.zst \
  --out benchmark/results/url_length_hash_val.json \
  --slim-out lib/compression-url-scoreboard.json
```

### Related bake-offs

Bits-only floor (no alphabet):

```bash
.venv-benchmark/bin/python benchmark/bit_benchmark.py \
  data/standard/corpus/hash/2026-06.val.compact.jsonl.zst \
  --out benchmark/results/bit_val.json
```

Frequency-index held-out coverage:

```bash
.venv-benchmark/bin/python benchmark/freq_index_benchmark.py \
  --train data/standard/corpus/hash/2026-06.train.compact.jsonl.zst \
  --val data/standard/corpus/hash/2026-06.val.compact.jsonl.zst \
  --out benchmark/results/freq_index_hash.json
```

---

## Layout

```text
benchmark/
  README.md                 ← this file
  requirements.txt
  run_corpus.sh             ← download → stream → sample → split
  run_scoreboard.sh         ← URL bits/chars/url table
  pgn_common.py             ← shared PGN / hash / split helpers
  stream_aggregate.py
  extract_sampled_games.py
  split_corpus.py
  url_length_benchmark.py   ← product scoreboard
  bit_benchmark.py
  freq_index_benchmark.py
  results/                  ← committed summaries from the published run
```

Local-only (gitignored under `/data/*`): raw PGN, compact corpora, checkpoints.

---

## Sampling and determinism

- **Month sample:** Blake2b of Lichess game id; keep if `hash % 1000 < SAMPLE_PPT` (default 30 ≈ 3%).
- **Train/val/test:** Blake2b of `split:{gid}` — independent of the sample hash, so the 3% month sample is not forced into train.
- **Bots:** kept (~0.3%) with a `bot` flag; non-standard variants dropped.
- **Clocks / evals / names:** stripped during extract.

Held-out val and test hit rates for K=1024 agreed within ~0.02% on the published run.

---

## Expected scoreboard (hash val, June 2026)

URL = `https://chss.chat/p/` + code. Lower is better.

| Method | Bits | Chars | URL |
|---|---:|---:|---:|
| Native FEN (Base64URL) | 491 | 82 | **104** |
| Native UCI (ASCII) | 627 | 78 | **100** |
| Occupancy + pieces | 186 | 32 | **54** |
| Lookup K=1024 + suffix | 192 | 33 | **55** |
| Hybrid (min of 3) | 98 | 17 | **39** |

Full table and phase breakdown: [chss.chat/research/compression](https://chss.chat/research/compression). Design notes: [`doc/chess-url-compression.md`](../doc/chess-url-compression.md).

---

## License of the data

Lichess database exports are **Creative Commons CC0**. See [database.lichess.org](https://database.lichess.org/).
