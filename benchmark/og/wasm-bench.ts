/**
 * IT-04 feasibility: measure Takumi WASM path (browser-like) vs native Node.
 * No product change — numbers only.
 *
 * Usage:
 *   node ./node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.json benchmark/og/wasm-bench.ts
 */

import { createElement } from "react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadFixtures,
  summarizeMs,
  summarizeBytes,
  writeResult,
} from "./_schema.mjs";
import OGTemplate, { OG_SIZE } from "../../app/og/[[...code]]/og-template";
import { render } from "takumi-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const findWasmBinary = (): { path: string; bytes: number } => {
  const root = path.join(__dirname, "../..", "node_modules", ".pnpm");
  const entries = fs.existsSync(root) ? fs.readdirSync(root) : [];
  const wasmDir = entries.find((e) => e.startsWith("@takumi-rs+wasm@"));
  if (!wasmDir) throw new Error("@takumi-rs/wasm not found under node_modules/.pnpm");
  const found = path.join(
    root,
    wasmDir,
    "node_modules",
    "@takumi-rs",
    "wasm",
    "pkg",
    "takumi_wasm_bg.wasm",
  );
  if (!fs.existsSync(found)) throw new Error(`missing ${found}`);
  return { path: found, bytes: fs.statSync(found).size };
};

const main = async () => {
  const fixtures = loadFixtures();
  // Representative slice for feasibility (not full fixture matrix).
  const sample = fixtures.positions.filter(
    (p: { category: string }) =>
      p.category === "start" ||
      p.category === "ply1" ||
      p.category === "endgame",
  );

  const wasmInfo = findWasmBinary();

  // Force WASM backend by constructing a wasm Renderer after init.
  const tInit0 = performance.now();
  const wasmMod = await import("takumi-js/wasm");
  await wasmMod.init();
  const renderer = new wasmMod.Renderer();
  const init_ms = Number((performance.now() - tInit0).toFixed(2));

  // Warmup
  await render(createElement(OGTemplate, { query: sample[0]?.ogCode }), {
    width: OG_SIZE,
    height: OG_SIZE,
    renderer,
  });

  const samplesMs: number[] = [];
  const sizes: number[] = [];
  for (const pos of sample) {
    const t0 = performance.now();
    const buf = await render(
      createElement(OGTemplate, { query: pos.ogCode }),
      { width: OG_SIZE, height: OG_SIZE, renderer },
    );
    samplesMs.push(performance.now() - t0);
    sizes.push(buf.byteLength);
  }

  // Native baseline on same sample for side-by-side.
  const nativeMs: number[] = [];
  for (const pos of sample) {
    const t0 = performance.now();
    const buf = await render(
      createElement(OGTemplate, { query: pos.ogCode }),
      { width: OG_SIZE, height: OG_SIZE },
    );
    nativeMs.push(performance.now() - t0);
    void buf;
  }

  const result = {
    wasm_binary_bytes: wasmInfo.bytes,
    wasm_binary_path: path.relative(
      path.join(__dirname, "../.."),
      wasmInfo.path,
    ),
    init_ms,
    wasm_render: summarizeMs(samplesMs),
    wasm_bytes: summarizeBytes(sizes),
    native_render: summarizeMs(nativeMs),
    sample_n: sample.length,
    note: "WASM measured in Node via takumi-js/wasm Renderer — proxy for browser cost; true browser also pays network fetch of ~3.7MB wasm.",
  };

  const { file } = writeResult({
    iteration: "it04_browser",
    engine: "takumi-js/wasm",
    render: {
      ...summarizeMs(samplesMs),
      ...summarizeBytes(sizes),
    },
    extra: result,
  });

  console.log(JSON.stringify({ file, ...result }, null, 2));
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
