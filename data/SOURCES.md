# Data sources

Local dumps are gitignored and are **not** required to read the published
analysis. Committed results live in:

- `benchmark/results/` — aggregate, splits, URL / bit / frequency reports
- `lib/compression-url-scoreboard.json` — slim table for `/research/compression`
- `lib/lookup-k1024-top.json` — frozen K=1024 prefix head used at build

To rebuild a corpus, download a Lichess standard-rated month and run the
scripts in `benchmark/`. **Newest month is enough.** Rankings should match;
exact floats can drift. Pin `MONTH=2026-06` only if you want the published
June 2026 dump.

```bash
bash benchmark/download_month.sh              # latest from list.txt
MONTH=2026-06 bash benchmark/download_month.sh
bash benchmark/run_corpus.sh                  # defaults to latest month
bash benchmark/run_scoreboard.sh              # uses local hash corpus
```

Do **not** fully decompress a monthly `.pgn.zst` (~7× on disk). Stream with
`zstdcat`. After the compact corpus exists, delete the raw archive.

---

## Standard rated games (primary)

License: **CC0**. Monthly files are **not cumulative**.

| What | URL |
|---|---|
| Index | https://database.lichess.org/ |
| HTTP list (newest first) | https://database.lichess.org/standard/list.txt |
| SHA256 sums | https://database.lichess.org/standard/sha256sums.txt |
| Pattern | `https://database.lichess.org/standard/lichess_db_standard_rated_YYYY-MM.pgn.zst` |
| Optional torrent | same path + `.torrent` |

Published scoreboard month (**2026-06**, 86,483,328 games, ~26 GB):

- https://database.lichess.org/standard/lichess_db_standard_rated_2026-06.pgn.zst
- SHA256 `8fd81071f56511e7546cb77e38db5cf32f7e8a437fb906e26959cc064d8b1f79`

As of 2026-08-18 the newest listed month is **2026-07**.

---

## Puzzles (tried, then rejected)

Tactics FENs, not full games. ~99.94% of FENs appeared once, so a
frequency-index collapsed. Not used by the published pipeline.

- https://database.lichess.org/lichess_db_puzzle.csv.zst
- Index: https://database.lichess.org/#puzzles

---

## Opening names (optional, unused by the pipeline)

ECO / name / PGN tables. Convenient labels only.

- https://github.com/lichess-org/chess-openings
- Raw TSVs: `a.tsv` … `e.tsv` on that repo
