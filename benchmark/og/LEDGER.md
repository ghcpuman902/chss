# OG crawler latency — experiment ledger

Constraint: **never gate Share**. Prewarm stays fire-and-forget.

Fixtures: `benchmark/og/fixtures/positions.json`  
`fixtures_sha` must match across before/after or the row is void.

Record the **prediction before** running each iteration.

---

## IT-00 — Baseline (Satori / next/og)

Hypothesis: Current origin render + prerender table are the numbers we beat.  
Prediction (before run): ply-1 coverage ≈ 0%; render p50 on the order of hundreds of ms locally.  
Before: n/a (this is the baseline)  
After: `results/baseline_2026-08-10.json`  
- render.p50_ms = **55.73**, p95 = 80.72, bytes_p50 = 24854  
- coverage.ply_1_pct = **0**, ply_2_pct = 100, total_codes = 151  
Verdict: **kept as baseline**. Prediction on coverage correct; local render was faster than expected (~56 ms, not hundreds) — production 1.1s is cold/CDN, not pure raster.

---

## IT-01 — Prerender coverage (odd depths + ply-1)

Hypothesis: Even-only lookup depths mean every first share (Black to move) is a cold miss. Adding odd plies and all legal ply-1 moves makes the common first share a PRERENDER hit.  
Prediction (before run): ply-1 coverage → 100%; ply-2 stays 100%; total codes grow modestly.  
Before: baseline coverage — ply_1_pct = 0, total_codes = 151  
After: `results/it01_coverage_2026-08-10.json` — ply_1_pct = **100**, ply_2_pct = 100, total_codes = **314** (176 w / 138 b)  
Verdict: **kept**. Prediction held. Aggregate had no odd depths; derived by snapshotting every intermediate ply along lookup prefixes plus all 20 legal first moves.

---

## IT-02 — Satori → Takumi

Hypothesis: Rasterising in Rust removes the SVG intermediate path, cutting cold origin render.  
Prediction (before run): p50 render 2–4× lower; PNG bytes within ±10%.  
Before: baseline render.p50_ms = 55.73, bytes_p50 = 24854  
After: `results/it02_takumi_2026-08-10.json` — p50 = **7.80** (~7.1×), bytes_p50 = **15786** (~63% of Satori)  
Parity (`it02_parity`): 640×640 dims match on 42 samples; byte_ratio ≈ 0.61 (outside ±10% prediction but smaller is fine).  
Verdict: **kept**. Speed prediction exceeded; bytes shrank more than expected (PNG encoder difference, not a failure).

---

## IT-03 — Template simplification

Hypothesis: 8 rows × 64 cells × up to 32 `<img>` data URLs cost layout time; a flatter tree wins on p50.  
Prediction (before run): measurable p50 drop vs IT-02; keep the winner.  
Before: it02 p50 = 7.80  
After: `results/it03_template_2026-08-10.json` — p50 = **6.97** (~11% faster), bytes unchanged  
Verdict: **kept** flattened template (board bg SVG + absolutely positioned pieces). Also added structured `og_timing` logs on the route.

---

## IT-04 — Browser / WASM feasibility (no product change)

Hypothesis: Player browser can rasterise during prewarm so origin never renders a shared position.  
Prediction (before run): WASM load + render under ~200 ms on desktop; package size acceptable for deferred load.  
Before: n/a (feasibility)  
After: `results/it04_browser_2026-08-10.json`  
- wasm init_ms = 16.79, wasm render p50 = 9.11, native p50 = 6.29  
- wasm binary = **3,734,240 bytes (~3.7 MB)**  
Verdict: **do not productize**. Render is fast enough, but paying ~3.7 MB over the network on every share client to save a ~7 ms origin render is the wrong trade. Origin Takumi stays.

---

## IT-05 — Non-blocking prewarm (`after()` + in-flight dedupe)

Hypothesis: Returning the server action immediately while continuing render in `after()` improves warm rate without touching Share UX.  
Prediction (before run): action returns in <50 ms; subsequent prod probe of that code is HIT.  
Before: prewarm awaited `getCachedOgPng` inside the action (could stall the RSC/action round-trip).  
After: `app/actions/prewarm-og.ts` uses `after()` + module-level in-flight Map; client still fire-and-forget via `lastWarmedOgRef`.  
Verdict: **shipped locally**. Prod confirmation is PV-2 (move → wait 2s → probe → expect HIT).

---

## PV-1 / PV-2 / PV-3 — Production

### PV-1 (after IT-01..03) — done

Prediction: ply-1 → PRERENDER; cold midgame well under prior ~1.1s.  
After: `results/prod_it01-03_2026-08-10.json` + `results/vercel_logs_it01-03_2026-08-10.json`  
(`fixtures_sha` = `c1bfa31e9cb2d3a7`, git `bcbafe5`)

Observed (`x-vercel-cache` / logs `cacheReason`):

| Slice | Cache | TTFB |
|---|---|---|
| ply-1 WhatsApp / curl | HIT (40/40) | p50 **~20–24 ms** |
| ply-1 Twitterbot | BYPASS (`cacheReason=crawler`) | p50 **~173 ms** (max 842) |
| ply-1 facebookexternalhit | BYPASS (`crawler`) | p50 **~381 ms** |
| midgame MISS (cold, Twitterbot) | MISS | **~160–220 ms** |
| midgame after warm (WhatsApp/curl) | HIT | p50 **~20 ms** |
| start first hit (Twitterbot) | BYPASS | **982 ms** (cold function outlier) |

Vercel log reasons in the window: `crawler` 22, `collapsed` 24, empty 54 (mostly HIT). No `PRERENDER` string appeared in probe headers.

Verdict: **latency goal met; PRERENDER prediction wrong for crawler UAs.**  
Takumi + coverage still win: first-share Twitterbot ply-1 is ~173 ms vs prior ~1.1 s, and cold midgame MISS is ~200 ms. Twitterbot / Facebook intentionally **BYPASS** the CDN (`cacheReason=crawler`); WhatsApp and curl get normal HITs. Collapsed concurrent probes also BYPASS. Next lever if crawlers stay slow: make origin cold path even cheaper / ensure prerendered bytes are served without crawler bypass — not gating Share.

### PV-2 (after IT-05)

Prediction: move → wait 2s → probe exact `b-…` → HIT.  
Verdict: _pending — separate probe after a real move + prewarm_

### PV-3 (steady state, +1 day)

Prediction: cold-miss share drops vs pre-change.  
Verdict: _pending_
