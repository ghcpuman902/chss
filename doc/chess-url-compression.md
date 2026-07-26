# Chess URL Encoding & Compression — Project Context

> Living document for the compression benchmark research track. Updated as we learn.

**Public draft report:** [`/research/compression`](/research/compression)

---

## Goal

**Primary deliverable is a benchmark table**, not “the one best algorithm.”

We care about how each practical encoding shows up in a real share link:

| Method | Avg bits | Avg chars (payload) | Avg URL length |
|---|---:|---:|---:|
| Raw / native (FEN, UCI string, …) | … | … | … |
| Binary pack → Base64URL | … | … | … |
| Same + gzip (or similar) | … | … | … |
| Lookup table (opening prefix dict) ± hybrid | … | … | … |

- **bits** = information floor (codec only)
- **chars** = URL-safe payload after an alphabet (usually Base64URL)
- **URL length** = full share URL (`https://chss.chat/p/…`) — what users actually paste

Winning = clear numbers people can compare. Hybrid / “pick min” is fine as one row; we are not hunting a theoretically optimal chess compressor.

### Method families (rows we want)

| Family | Examples | Notes |
|---|---|---|
| **Raw / native** | Full FEN, trimmed FEN, raw UCI move string | Readable; what we roughly have today |
| **Packed binary** | 4-bit grid, occupancy, packed UCI path | Bits → Base64URL chars |
| **Compressed** | gzip / zstd over a payload, then Base64URL | Often helps long paths; measure for real |
| **Lookup table** | Frequency-index opening prefixes (+ suffix) | Our Phase B book; one row per K or a chosen default |
| **Hybrid** | `min(dict, packed UCI, occupancy)` + small tag | Product-shaped “auto” row |

### Work so far (feeds the table)

| Phase | What we measured | Status |
|---|---|---|
| **A — Bit floor** | FEN / 4-bit / occupancy / packed UCI in *bits* by ply | Done (100k) |
| **B — Lookup table** | Prefix dict hit rate + bit savings on held-out hash corpus | Done |
| **C — Chars + URL** | Scoreboard: bits / chars / full URL per method | **Done** (hash val) |

### Scoreboard snapshot (hash val, 270k games, 1.17M positions)

Means are across **sampled checkpoint positions** (plies 2 / 8 / 16 / 32 / 64). Longer games overweight slightly versus a per-game mean. URL = `https://chss.chat/p/` + code. Lower is better.

| Method | Bits | Chars | URL |
|---|---:|---:|---:|
| Native FEN (Base64URL) | 491 | 82 | **104** |
| Native UCI (ASCII) | 627 | 78 | **100** |
| Trimmed FEN (playable-only variant) | 456 | 76 | 98 |
| Packed UCI path | 235 | 39 | 61 |
| Occupancy + pieces (FEN-complete) | 204 | 35 | 57 |
| Naïve 4-bit grid | 283 | 48 | 70 |
| gzip(UCI) → Base64URL | 588 | 98 | 120 |
| gzip(FEN) → Base64URL | 613 | 103 | 125 |
| Lookup K=1024 + suffix | 193 | 33 | 55 |
| **Hybrid (min of 3)** | **104** | **18** | **40** |

Per-game mean hybrid ≈ **38.5**. At ply 2: native UCI ~30, lookup/hybrid ~28, occupancy ~57. gzip loses on short payloads. Lookup payloads carry an explicit hit/miss discriminator bit.

Script: `benchmark/url_length_benchmark.py`  
Artifacts: `benchmark/results/url_length_hash_val.json`, `lib/compression-url-scoreboard.json`  
Reproduce guide: [`benchmark/README.md`](../benchmark/README.md) · Report: `/research/compression`

---

## Source notes — [database.lichess.org](https://database.lichess.org/)

Recorded from the official open-database page (Jul 2026):

### License & scope

- Exports are **Creative Commons CC0**. Free for research, commercial use, redistribution, no permission needed.
- **7,949,495,674** standard rated games total (monthly files; **not cumulative**).
- Latest month used for this project: **2026-06** — **28.2 GB** `.pgn.zst`, **86,483,328 games**.
- Download list: https://database.lichess.org/standard/list.txt (+ SHA256 checksums).
- Torrent + HTTP webseed available per month (`.pgn.zst` / `.torrent`).

### PGN content (what’s in each game)

| Tag / comment | Notes | Useful for URL compression? |
|---|---|---|
| `ECO`, `Opening` | Opening classification already labeled | **Yes** — free coarse frequency/index signal |
| Movetext (SAN) | Full game moves | **Yes** — core payload (convert → UCI) |
| `WhiteElo` / `BlackElo` | Glicko-2 ratings | Keep for filters / strata |
| `WhiteTitle` / `BlackTitle` | Bot API → `"BOT"` | Keep as **flag**; compare bot vs human skew |
| `Variant` | e.g. `"Antichess"` on variant dumps | Standard dump should be Standard; validate |
| `TimeControl`, `Event` | Bullet/Blitz/Rapid/etc. | Optional filter |
| `%clk` clock comments | Present on ~all games since Apr 2017 | **No** — dominant noise |
| `%eval` | ~**6%** of games have Stockfish evals | **No** for encoding; strip for parse |
| Player names, Site, RatingDiff, Termination, UTC* | Metadata | **No** |

### Other official notes

- Uncompressed size ≈ **7.1×** compressed `.zst`.
- Archives are **partially decompressable** — cancel mid-download and still decompress what you have; or stream with `zstdcat`.
- Prefer `pzstd -d` / `zstdcat` over writing full decompressed PGN (~200 GB/month).
- Bot API games: `[WhiteTitle "BOT"]` / `[BlackTitle "BOT"]`.
- Variant games (other dumps): `[Variant "..."]`.

### Download approach (what we learned)

| Method | Result |
|---|---|
| **curl HTTP** of `.pgn.zst` | Works well (~tens of MB/s); preferred for this machine |
| **Transmission CLI** on `.torrent` | Tracker peers scarce; webseed flaky; curl partial did **not** resume as valid torrent pieces |
| Keep `.torrent` on disk | Useful for checksum / magnet metadata; not required for HTTP path |

Torrent file kept at:

`data/standard/lichess_db_standard_rated_2026-06.pgn.zst.torrent`

---

## What we learned so far

### Puzzle CSV is the wrong primary dataset

- `data/lichess_db_puzzle.csv` ≈ 6.06M rows — tactics positions, not full games.
- Prior full counts: ~99.94% of FENs appear once → frequency-index collapses; no opening-mass signal.

### Standard rated PGN is the right shape

| Metric (sample) | Value |
|---|---|
| Compact extract rate | **~1,720 games/s** |
| Bit-bake-off replay | **~1,170 games/s** |
| Avg ply | ~66–67 |
| BOT rate | ~0.3% |
| Variant tag rate | **0%** (Standard dump) |
| Raw bytes → useful (UCI+flags) | **~8–10×** waste from clocks/metadata |

### Frequency-index is clearly viable

From early 100k sample, then confirmed on full-month **3% hash replay** (2.59M games):

| Signal | 100k sample | Full-month 3% replay |
|---|---:|---:|
| Depth-2 top-10 prefixes | 70.7% | **71.5%** |
| Depth-4 top-1000 | 85.8% | **86.2%** |
| Depth-8 top-1000 | — | 24.1% |
| Depth-16 top-1000 | — | 1.1% |

Deep prefixes diversify fast — practical dictionaries should stay at **ply ≤8–12**, with occupancy / packed UCI for the tail.

### Phase A bit-floor (100k games, 434k positions)

Sampled at plies 2 / 8 / 16 / 32 / 64 (checkpoint means, not full phase ranges). Wall time **~85 s**, peak RSS **~81 MB**, **0** parse errors after board-aware promo parsing.

| Codec | All checkpoints | Ply ≤8 | Ply 9–24* | Ply 25–40* | Ply 41+* |
|---|---:|---:|---:|---:|---:|
| Full FEN | 491 ±43 | 497 | 519 | 493 | 406 |
| Trimmed FEN | 456 ±44 | 465 | 487 | 453 | 366 |
| Naïve 4-bit (playable meta only) | **265** | 265 | 265 | 265 | 265 |
| Occupancy | **186 ±21** | 200 | 192 | 174 | **138** |
| Packed UCI | 236 ±227 | **60** | 192 | 384 | 768 |

\*Early Phase A used a 9-bit playable-state meta block, so its fixed grid was 256 + 9 = 265 bits. The published URL scoreboard tests the FEN-complete version with an additional 8-bit halfmove clock and 10-bit fullmove number: 256 + 27 = 283 bits. Phase A also reported bucket means by ply band for exploration; the published URL scoreboard uses only the five checkpoints above.

**Crossover:** packed UCI wins until ~ply 15–16; occupancy wins afterward. Hybrid encoder is the product direction.

5k vs 100k means agree within ~1 bit → **no need to wait for 86M games** to argue Phase A.

### Full-month extract (stopped — plan revised)

The 86.5M-game JSONL extract was **stopped at ~3M games** (~377 MB). That partial file is kept as an extra head-of-file corpus; it is **not required** for Phase B dictionary decisions.

| Corpus | Games | Role |
|---|---:|---|
| `2026-06.sample100k.compact.jsonl.zst` | 100k | Phase A bit-floor (done) |
| `2026-06.compact.jsonl.zst` (partial) | ~3M | Extra train material (head-biased) |
| Hash sample @ 3% | ~2.6M est. | Primary train/val/test (distributed) |
| Full month aggregate | 86.5M scan | Prefix/ECO/strata counters only — no JSONL |

**Why stop?** 2–3M games already give ±0.01% precision on 1% prefixes. Full month mainly adds sampling noise reduction, not product confidence. Distribution shift (bullet/blitz, rating, bots) matters more.

### Phase B pipeline — DONE (2026-07-25)

```text
PGN.zst
  ├── stream_aggregate.py     → prefix/ECO/position counters (24-ply, 3% replay)
  ├── extract_sampled_games.py → 3% hash sample → 2,593,554 games
  └── split_corpus.py         → train 79% / val 10% / test 10%

Helpers: benchmark/run_corpus.sh · benchmark/run_scoreboard.sh
```

| Artifact | Result |
|---|---|
| Aggregate scan | **86,483,328** games, 0 parse errors, ~61 min @ 23.8k/s |
| Hash sample | **2,593,554** games (3%), distributed by Lichess game id |
| Hash train/val/test | **2,053,657 / 270,021 / 269,876** |
| Head corpus (biased) | 2.37M / 311k / 312k from partial day-1 extract |

**Bug fixed:** sample + split originally shared one hash space (`hash%1000 < 30` ⊆ train). Split now uses salted key `split:{gid}`.

| Pass | Actual wall |
|---|---|
| Split partial 3M | ~12 s |
| Aggregate full month | **~61 min** |
| Hash sample extract | ~1.5 h (est.) |
| Re-split hash sample | ~14 s |

### Phase B held-out frequency-index (hash corpus)

Codebook trained on **2.05M** train games; evaluated on **270k** val / **270k** test.
Encoding model: `min(dict_prefix+packed_suffix, packed_uci)` + 2-bit codec tag.

| K | Hit rate (test) | Mean match plies | Mean bits (hybrid) | Saving vs tagged UCI |
|---:|---:|---:|---:|---:|
| 64 | 94.9% | 3.6 | 764 | **4.4%** |
| 256 | 99.7% | 4.6 | 754 | **5.5%** |
| 1,024 | 99.8% | 5.6 | 745 | **6.7%** |
| 4,096 | 99.8% | 6.5 | 735 | **7.9%** |
| 16,384 | 99.8% | 7.4 | 726 | **9.1%** |

Val ≈ test within 0.02% — no overfit on held-out games.

**Product read:** on *full games* (~66 plies) a prefix dictionary only shaves the opening, so mean-bit savings stay single-digit. For **share URLs** at early checkpoints the same K=1k–4k book removes 4–8 opening plies ≈ **48–96 bits** before Base64URL. Occupancy still wins deep positions — hybrid remains required. Lookup payloads need a frozen/versioned codebook at decode time (no DB, but not free).

Recommended starter codebook: **K=1024 or 4096**, depths `{2,4,6,8,10,12}` (drop 16 — tiny mass).

---

## Compact intermediate format

Script: `benchmark/extract_sampled_games.py` (hash sample; legacy head-of-file extract archived locally)

```json
{"gid":"chMzC5yh","u":"e2e4e7e5g1f3...","n":64,"eco":"C50","op":"Italian Game","we":1523,"be":1607,"bot":0,"tc":"180+0","ev":"blitz","res":"1-0","split":"train"}
```

Important: promotions are **5-char** UCI (`e7e8q`). Blind 4-char chunking breaks the stream — Stage 2 uses board-aware parsing.

---

## BOT / variant policy

| Filter | Decision |
|---|---|
| Non-standard variants | Drop if present (≈0% here) |
| Bot API games | **Keep** with `bot` flag (~0.3%; openings look human-like) |
| Clocks / evals / names | Strip always |

---

## Stage status

```
Stage 1  Exploration & compact extract     ← DONE (hash sample + aggregate)
         ✓ puzzle CSV rejected
         ✓ 100k frequency snapshot
         ✓ full-month streaming aggregate
         ✓ 2.59M hash sample → train/val/test
Stage 2  Bit-floor bake-off (5 codecs)     ← 5k + 100k DONE
         ✓ frequency-index held-out bake-off
         → hybrid codec + report page update
Stage 3  URL alphabets (Base64URL / Base85)
Stage 4  Product integration on chss.chat
```

### Scripts & artifacts

| Path | Role |
|---|---|
| `benchmark/README.md` | Full reproduce guide (download → stream → scoreboard) |
| `benchmark/requirements.txt` | Python deps (`python-chess`) |
| `benchmark/run_corpus.sh` | Orchestrator: aggregate + hash extract + split |
| `benchmark/run_scoreboard.sh` | Rebuild URL scoreboard + slim page JSON |
| `benchmark/pgn_common.py` | Shared PGN parse, hash sample, split buckets |
| `benchmark/stream_aggregate.py` | Pass 1 — streaming prefix/ECO/strata counters |
| `benchmark/extract_sampled_games.py` | Hash-sampled compact JSONL (distributed) |
| `benchmark/split_corpus.py` | Deterministic train/val/test split |
| `benchmark/url_length_benchmark.py` | Product scoreboard (bits / chars / URL) |
| `benchmark/bit_benchmark.py` | Five-codec bit bake-off |
| `benchmark/freq_index_benchmark.py` | Held-out dict mass / bit savings |
| `benchmark/results/` | Published summaries from the June 2026 run |
| `data/standard/corpus/hash/` | Primary train/val/test (local, gitignored) |
| `data/standard/corpus/head/` | Day-1 biased extra corpus (local) |

---

## Open decisions

1. Default alphabet for the char/URL columns: **Base64URL** (matches current `f-` codes).
2. gzip row: compress whole payload then Base64URL — include even if it loses on short openings.
3. Lookup row: publish **K=1024** (and maybe K=4096) as named methods, not an endless sweep.
4. Delete raw `.pgn.zst`? Yes when disk needed — aggregate + hash sample are enough.

---

## Next steps

1. Optional: held-out **test** split scoreboard (sanity vs val).
2. Decide product prefixes (`p-` / `o-` / `d-` / `h-`) and ship hybrid encoder.
3. Export K=1024 codebook artifact for the edge runtime.
4. `rm data/standard/lichess_db_standard_rated_2026-06.pgn.zst` when disk is needed (~26 GB).
