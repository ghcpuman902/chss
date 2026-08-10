/**
 * LOCAL: engine render p50/p95/p99 + PNG byte size across fixtures.
 *
 * Usage:
 *   ./node_modules/.bin/tsx --tsconfig tsconfig.json benchmark/og/render-bench.ts --iteration baseline --engine next/og
 */

import { createElement } from "react";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  fixturesSha,
  gitSha,
  loadFixtures,
  summarizeBytes,
  summarizeMs,
  coverageAgainstTop,
  writeResult,
  OG_TOP_PATH,
} from "./_schema.mjs";
import OGTemplate, { OG_SIZE } from "../../app/og/[[...code]]/og-template";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const getArg = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1]! : fallback;
};

type ImageResponseCtor = new (
  element: React.ReactElement,
  init: { width: number; height: number },
) => { arrayBuffer: () => Promise<ArrayBuffer> };

const loadImageResponse = async (): Promise<ImageResponseCtor> => {
  const engineName = getArg("engine", "next/og");
  if (engineName === "takumi-js" || engineName === "takumi") {
    const mod = await import("takumi-js/response");
    return mod.ImageResponse as ImageResponseCtor;
  }
  const mod = await import("next/og");
  return mod.ImageResponse as ImageResponseCtor;
};

const main = async () => {
  const iteration = getArg("iteration", "render_bench");
  const engineName = getArg("engine", "next/og");
  const warmup = Number(getArg("warmup", "1"));
  const rounds = Number(getArg("rounds", "2"));

  const ImageResponse = await loadImageResponse();

  const renderOnce = async (code: string): Promise<Buffer> => {
    const response = new ImageResponse(
      createElement(OGTemplate, { query: code || undefined }),
      { width: OG_SIZE, height: OG_SIZE },
    );
    const ab = await response.arrayBuffer();
    return Buffer.from(ab);
  };

  const fixtures = loadFixtures();
  const samplesMs: number[] = [];
  const sizes: number[] = [];
  const perPosition: {
    id: string;
    ms: number;
    bytes: number;
    sha256_16: string;
  }[] = [];

  const first = fixtures.positions[0];
  if (first) {
    for (let i = 0; i < warmup; i += 1) {
      await renderOnce(first.ogCode);
    }
  }

  for (const pos of fixtures.positions) {
    for (let r = 0; r < rounds; r += 1) {
      const t0 = performance.now();
      const buf = await renderOnce(pos.ogCode);
      const ms = performance.now() - t0;
      samplesMs.push(ms);
      sizes.push(buf.byteLength);
      if (r === 0) {
        perPosition.push({
          id: pos.id,
          ms: Number(ms.toFixed(2)),
          bytes: buf.byteLength,
          sha256_16: createHash("sha256").update(buf).digest("hex").slice(0, 16),
        });
      }
    }
  }

  const ogTop = JSON.parse(fs.readFileSync(OG_TOP_PATH, "utf8"));
  const coverage = coverageAgainstTop(fixtures, ogTop);
  const render = {
    ...summarizeMs(samplesMs),
    ...summarizeBytes(sizes),
    size_px: OG_SIZE,
    rounds,
    warmup,
  };

  const { file, payload } = writeResult({
    iteration,
    engine: engineName,
    render,
    coverage,
    extra: { per_position: perPosition },
    meta: {
      note: "Local origin render cost only — not crawler TTFB.",
      fixtures_sha_check: fixturesSha(),
      git: gitSha(),
    },
  });

  console.log(
    JSON.stringify(
      {
        file: path.relative(path.join(__dirname, "../.."), file),
        engine: engineName,
        render: payload.render,
        coverage: {
          ply_1_pct: coverage.ply_1_pct,
          ply_2_pct: coverage.ply_2_pct,
          total_codes: coverage.total_codes,
        },
      },
      null,
      2,
    ),
  );
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
