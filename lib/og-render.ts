import { ImageResponse } from "takumi-js/response";
import { cacheLife, cacheTag } from "next/cache";
import { createElement } from "react";
import OGTemplate, { OG_SIZE } from "@/app/og/[[...code]]/og-template";

const stripExtension = (raw: string): string =>
  // Board64 uses '.' for empty squares — only strip a trailing image suffix.
  raw.trim().replace(/\.(png|jpe?g|webp|gif)$/i, "");

/** Uncached PNG bytes — used by the OG route cache wrapper and local benches. */
export const renderOgPng = async (code: string): Promise<Buffer> => {
  const response = new ImageResponse(
    createElement(OGTemplate, { query: code || undefined }),
    {
      width: OG_SIZE,
      height: OG_SIZE,
    },
  );
  const ab = await response.arrayBuffer();
  return Buffer.from(ab);
};

async function renderOgPngBase64(code: string): Promise<string> {
  const buf = await renderOgPng(code);
  return buf.toString("base64");
}

/**
 * Cached PNG bytes for an OG code (`b-…` / legacy `o-…`).
 * `use cache` + cacheLife('max') → first hit pays Takumi; later hits are Data-Cache.
 * Cache stores base64 (JSON-serializable); Buffer is rebuilt on read.
 */
async function getCachedOgPngBase64(code: string): Promise<string> {
  "use cache";
  cacheLife("max");
  cacheTag(`og:${code.slice(0, 80)}`);
  return renderOgPngBase64(code);
}

export const getCachedOgPng = async (rawCode: string): Promise<Buffer> => {
  const code = stripExtension(rawCode.trim());
  const b64 = await getCachedOgPngBase64(code);
  return Buffer.from(b64, "base64");
};
