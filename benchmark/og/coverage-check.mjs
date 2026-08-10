#!/usr/bin/env node
/**
 * LOCAL: % of fixtures present in lib/og-top-codes.json
 *
 * Usage:
 *   node benchmark/og/coverage-check.mjs [--iteration it01_coverage] [--write]
 */

import fs from "node:fs";
import {
  OG_TOP_PATH,
  coverageAgainstTop,
  loadFixtures,
  writeResult,
} from "./_schema.mjs";

const args = process.argv.slice(2);
const write = args.includes("--write");
const iterIdx = args.indexOf("--iteration");
const iteration =
  iterIdx >= 0 && args[iterIdx + 1] ? args[iterIdx + 1] : "coverage_check";

const fixtures = loadFixtures();
const ogTop = JSON.parse(fs.readFileSync(OG_TOP_PATH, "utf8"));
const coverage = coverageAgainstTop(fixtures, ogTop);

console.log(
  JSON.stringify(
    {
      iteration,
      total_codes: coverage.total_codes,
      ply_1_pct: coverage.ply_1_pct,
      ply_2_pct: coverage.ply_2_pct,
      by_category: coverage.by_category,
    },
    null,
    2,
  ),
);

if (write) {
  const { file } = writeResult({
    iteration,
    engine: "n/a",
    coverage,
  });
  console.error(`wrote ${file}`);
}
