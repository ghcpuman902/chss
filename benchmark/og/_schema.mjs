/**
 * Shared result schema helpers for OG latency experiments.
 * Every artifact (local or prod) should use writeResult().
 */

import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const OG_BENCH_ROOT = __dirname;
export const FIXTURES_PATH = path.join(__dirname, "fixtures", "positions.json");
export const RESULTS_DIR = path.join(__dirname, "results");
export const OG_TOP_PATH = path.join(__dirname, "..", "..", "lib", "og-top-codes.json");

export const loadFixtures = () =>
  JSON.parse(fs.readFileSync(FIXTURES_PATH, "utf8"));

export const fixturesSha = () => {
  const raw = fs.readFileSync(FIXTURES_PATH);
  return createHash("sha256").update(raw).digest("hex").slice(0, 16);
};

export const gitSha = () => {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
};

export const percentile = (sortedAsc, p) => {
  if (!sortedAsc.length) return 0;
  const idx = Math.min(
    sortedAsc.length - 1,
    Math.max(0, Math.ceil((p / 100) * sortedAsc.length) - 1),
  );
  return sortedAsc[idx];
};

export const summarizeMs = (samplesMs) => {
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const mean =
    sorted.length === 0
      ? 0
      : sorted.reduce((a, b) => a + b, 0) / sorted.length;
  return {
    n: sorted.length,
    mean_ms: Number(mean.toFixed(2)),
    p50_ms: Number(percentile(sorted, 50).toFixed(2)),
    p95_ms: Number(percentile(sorted, 95).toFixed(2)),
    p99_ms: Number(percentile(sorted, 99).toFixed(2)),
    min_ms: Number((sorted[0] ?? 0).toFixed(2)),
    max_ms: Number((sorted[sorted.length - 1] ?? 0).toFixed(2)),
  };
};

export const summarizeBytes = (sizes) => {
  const sorted = [...sizes].sort((a, b) => a - b);
  return {
    n: sorted.length,
    bytes_p50: percentile(sorted, 50),
    bytes_p95: percentile(sorted, 95),
    bytes_mean: sorted.length
      ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length)
      : 0,
  };
};

export const coverageAgainstTop = (fixtures, ogTop) => {
  const codes = new Set(ogTop.codes ?? []);
  const byCat = {};
  for (const pos of fixtures.positions) {
    const cat = pos.category;
    if (!byCat[cat]) byCat[cat] = { total: 0, hit: 0 };
    byCat[cat].total += 1;
    if (codes.has(pos.ogCode)) byCat[cat].hit += 1;
  }
  const pct = (hit, total) =>
    total === 0 ? 0 : Number(((100 * hit) / total).toFixed(1));
  return {
    total_codes: codes.size,
    ply_1_pct: pct(byCat.ply1?.hit ?? 0, byCat.ply1?.total ?? 0),
    ply_2_pct: pct(byCat.ply2?.hit ?? 0, byCat.ply2?.total ?? 0),
    start_pct: pct(byCat.start?.hit ?? 0, byCat.start?.total ?? 0),
    midgame_pct: pct(byCat.midgame?.hit ?? 0, byCat.midgame?.total ?? 0),
    by_category: Object.fromEntries(
      Object.entries(byCat).map(([k, v]) => [
        k,
        { ...v, pct: pct(v.hit, v.total) },
      ]),
    ),
  };
};

/**
 * @param {object} partial
 * @param {string} partial.iteration
 * @param {string} [partial.engine]
 * @param {object} [partial.render]
 * @param {object} [partial.coverage]
 * @param {object[]} [partial.prod]
 * @param {object} [partial.extra]
 * @param {object} [partial.meta]
 */
export const writeResult = (partial) => {
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const tag = partial.iteration.replace(/[^a-z0-9_-]/gi, "_");
  const file = path.join(RESULTS_DIR, `${tag}_${date}.json`);
  const payload = {
    meta: {
      iteration: partial.iteration,
      git_sha: gitSha(),
      date: new Date().toISOString(),
      host: `${os.hostname()} (${os.cpus()[0]?.model ?? "cpu"} / ${os.platform()})`,
      engine: partial.engine ?? "unknown",
      node: process.version,
      fixtures_sha: fixturesSha(),
      ...(partial.meta ?? {}),
    },
    render: partial.render ?? null,
    coverage: partial.coverage ?? null,
    prod: partial.prod ?? null,
    ...(partial.extra ? { extra: partial.extra } : {}),
  };
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
  return { file, payload };
};
