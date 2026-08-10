# OG crawler latency harness

Reproduce the numbers behind the share → crawler → `/og/b-….png` path.

**Constraint:** never gate Share. Prewarm is fire-and-forget; we measure origin render and prerender coverage so the crawler hits a warm or prerendered PNG.

Source: path `benchmark/og/` · findings article: [`/research/og-latency`](https://chss.chat/research/og-latency)

## Layout

| Path | Role |
|---|---|
| `fixtures/positions.json` | Frozen boards (`fixtures_sha` guards comparisons) |
| `LEDGER.md` | Hypothesis → prediction → before/after → verdict |
| `results/*.json` | Artifacts (shared schema via `_schema.mjs`) |
| `coverage-check.mjs` | LOCAL: fixture hit rate vs `lib/og-top-codes.json` |
| `render-bench.ts` | LOCAL: engine PNG p50/p95 + bytes |
| `parity-check.ts` | LOCAL: next/og vs takumi dims + byte ratio |
| `wasm-bench.ts` | LOCAL: WASM feasibility (IT-04) |
| `prod-probe.mjs` | YOU: curl TTFB + `x-vercel-cache` |
| `parse-vercel-logs.mjs` | YOU: `cacheReason` from `vercel logs --json` |

## Local (no deploy)

```bash
# Coverage only
node benchmark/og/coverage-check.mjs --iteration baseline --write

# Origin render (Satori)
node ./node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.json \
  benchmark/og/render-bench.ts --iteration baseline --engine next/og

# Origin render (Takumi)
node ./node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.json \
  benchmark/og/render-bench.ts --iteration it02_takumi --engine takumi-js

# WASM feasibility
node ./node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.json \
  benchmark/og/wasm-bench.ts
```

Or via package scripts: `pnpm bench:og:coverage`, `pnpm bench:og:render -- --iteration …`.

## Production (after you deploy)

These cannot be measured locally. Run immediately after deploy while logs are fresh:

```bash
# 1. Curl matrix (TTFB + x-vercel-cache)
node benchmark/og/prod-probe.mjs --tag it01-03

# 2. Pull logs (cacheReason is only here)
vercel logs chss.chat --since 10m --json > /tmp/og.jsonl
node benchmark/og/parse-vercel-logs.mjs /tmp/og.jsonl --tag it01-03

# 3. Fill LEDGER.md PV-1 / PV-2 from results/prod_*.json + results/vercel_logs_*.json
```

### PV-1 success criteria

- Ply-1 fixture → `PRERENDER` or `HIT`
- Never-seen midgame cold miss well under prior ~1.1s TTFB

### PV-2 (prewarm)

1. Open a play URL, make a move, wait ~2s (do **not** wait before Share in product — this is only for the probe).
2. Probe that exact `b-…` code; expect `HIT`.

### PV-3 (+1 day)

Aggregate `cacheReason` over 24h; record cold-miss share in the ledger.

## Result schema

```jsonc
{
  "meta": { "iteration": "…", "git_sha": "…", "fixtures_sha": "…", "engine": "…" },
  "render": { "n": 0, "p50_ms": 0, "p95_ms": 0, "bytes_p50": 0 },
  "coverage": { "ply_1_pct": 0, "ply_2_pct": 0, "total_codes": 0 },
  "prod": [{ "ogCode": "b-…", "ttfb_ms": 0, "cache": "HIT", "cacheReason": "…" }]
}
```

If `fixtures_sha` changes, before/after rows are not comparable.

## Local headline numbers (2026-08-10)

| Stage | Engine | p50 | ply-1 coverage | codes |
|---|---|---|---|---|
| Baseline | next/og | 55.7 ms | 0% | 151 |
| After IT-01..03 | takumi-js | 7.0 ms | 100% | 314 |

See `LEDGER.md` for predictions vs outcomes, including the WASM path we measured and did not ship, and PV-1 production numbers (`prod_it01-03_2026-08-10.json`).

**PV-1 headline:** Twitterbot ply-1 ~173 ms (was ~1.1 s); WhatsApp/curl HIT ~20 ms; crawler UAs `BYPASS` with `cacheReason=crawler` — no `PRERENDER` header observed.
