import { ImageResponse } from "next/og";
import { unstable_cache } from "next/cache";
import { createElement } from "react";
import OGTemplate, { OG_SIZE } from "@/app/og/[[...code]]/og-template";

const stripExtension = (raw: string): string =>
  // Board64 uses '.' for empty squares — only strip a trailing image suffix.
  raw.trim().replace(/\.(png|jpe?g|webp|gif)$/i, "");

async function renderOgPngBase64(code: string): Promise<string> {
  const response = new ImageResponse(
    createElement(OGTemplate, { query: code || undefined }),
    {
      width: OG_SIZE,
      height: OG_SIZE,
    },
  );
  const ab = await response.arrayBuffer();
  return Buffer.from(ab).toString("base64");
}

/**
 * Render + Data-Cache the PNG for an OG code.
 * Cache stores base64 (JSON-serializable); Buffer is rebuilt on read.
 * First hit pays Satori; later hits (incl. crawlers after prewarm) are cheap.
 */
export const getCachedOgPng = async (rawCode: string): Promise<Buffer> => {
  const code = stripExtension(rawCode.trim());
  const b64 = await unstable_cache(
    async (c: string) => renderOgPngBase64(c),
    ["og-png-v3-b64"],
    {
      revalidate: false,
      tags: [`og:${code.slice(0, 80)}`],
    },
  )(code);
  return Buffer.from(b64, "base64");
};
