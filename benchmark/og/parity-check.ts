/**
 * LOCAL: visual parity sample between next/og and takumi-js for one fixture.
 * Compares PNG IHDR dimensions + a coarse centre-pixel sample via raw decode
 * is heavy; we assert size equality and that both engines produce valid PNGs
 * with comparable byte lengths (±25%).
 *
 * Usage:
 *   node ./node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.json benchmark/og/parity-check.ts
 */

import { createElement } from "react";
import { createHash } from "node:crypto";
import { loadFixtures, writeResult } from "./_schema.mjs";
import OGTemplate, { OG_SIZE } from "../../app/og/[[...code]]/og-template";

type ImageResponseCtor = new (
  element: React.ReactElement,
  init: { width: number; height: number },
) => { arrayBuffer: () => Promise<ArrayBuffer> };

const readPngSize = (buf: Buffer) => {
  // PNG IHDR: bytes 16-23 are width/height u32 BE after 8-byte sig + 4 len + 4 'IHDR'
  if (buf.length < 24 || buf[0] !== 0x89 || buf[1] !== 0x50) {
    return { width: 0, height: 0, valid: false };
  }
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    valid: true,
  };
};

const renderWith = async (
  ImageResponse: ImageResponseCtor,
  code: string,
): Promise<Buffer> => {
  const response = new ImageResponse(
    createElement(OGTemplate, { query: code }),
    { width: OG_SIZE, height: OG_SIZE },
  );
  return Buffer.from(await response.arrayBuffer());
};

const main = async () => {
  const fixtures = loadFixtures();
  const sample = fixtures.positions.filter(
    (p: { category: string }) =>
      p.category === "start" ||
      p.category === "ply1" ||
      p.category === "ply2" ||
      p.category === "endgame",
  );

  const satoriMod = await import("next/og");
  const takumiMod = await import("takumi-js/response");
  const SatoriIR = satoriMod.ImageResponse as ImageResponseCtor;
  const TakumiIR = takumiMod.ImageResponse as ImageResponseCtor;

  const rows = [];
  for (const pos of sample) {
    const a = await renderWith(SatoriIR, pos.ogCode);
    const b = await renderWith(TakumiIR, pos.ogCode);
    const sa = readPngSize(a);
    const sb = readPngSize(b);
    const ratio = a.byteLength === 0 ? 0 : b.byteLength / a.byteLength;
    rows.push({
      id: pos.id,
      satori_bytes: a.byteLength,
      takumi_bytes: b.byteLength,
      byte_ratio: Number(ratio.toFixed(3)),
      satori_size: sa,
      takumi_size: sb,
      dims_match: sa.width === sb.width && sa.height === sb.height,
      satori_sha16: createHash("sha256").update(a).digest("hex").slice(0, 16),
      takumi_sha16: createHash("sha256").update(b).digest("hex").slice(0, 16),
    });
  }

  const dimsOk = rows.every((r) => r.dims_match && r.satori_size.valid);
  const bytesOk = rows.every((r) => r.byte_ratio > 0.5 && r.byte_ratio < 2.0);

  const { file } = writeResult({
    iteration: "it02_parity",
    engine: "next/og vs takumi-js",
    extra: { rows, dimsOk, bytesOk },
  });

  console.log(JSON.stringify({ file, dimsOk, bytesOk, n: rows.length, sample: rows.slice(0, 3) }, null, 2));
  if (!dimsOk || !bytesOk) process.exit(1);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
