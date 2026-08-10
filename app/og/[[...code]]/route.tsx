import { NextRequest } from "next/server";
import { parseUrlSegment } from "@/lib/utils";
import { getCachedOgPng } from "@/lib/og-render";
import ogTop from "@/lib/og-top-codes.json";

// With cacheComponents: do not export `runtime` / `dynamicParams`
// (Node is the default; unknown OG codes still resolve on demand).

const IMMUTABLE_PNG_HEADERS = {
  "Content-Type": "image/png",
  "Cache-Control": "public, max-age=31536000, immutable",
  "CDN-Cache-Control": "public, max-age=31536000, immutable",
  // Warm edge + browser: crawlers often re-fetch; immutable still revalidates via URL
  "Vercel-CDN-Cache-Control": "public, max-age=31536000, immutable",
} as const;

/** Prerender the most common lookup-prefix boards at `next build`. */
export function generateStaticParams() {
  const codes = (ogTop as { codes?: string[] }).codes ?? [];
  return codes.map((code) => ({
    // /og/{code}.png → catch-all segment includes the extension
    code: [`${code}.png`],
  }));
}

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/og/[[...code]]">,
) {
  const t0 = performance.now();
  try {
    const { code } = await ctx.params;
    const raw = parseUrlSegment(code);
    const tDecode = performance.now();
    const buf = await getCachedOgPng(raw);
    const tDone = performance.now();
    console.info(
      JSON.stringify({
        msg: "og_timing",
        code: raw.slice(0, 80),
        decode_ms: Number((tDecode - t0).toFixed(1)),
        render_or_cache_ms: Number((tDone - tDecode).toFixed(1)),
        total_ms: Number((tDone - t0).toFixed(1)),
        bytes: buf.byteLength,
      }),
    );

    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: IMMUTABLE_PNG_HEADERS,
    });
  } catch (e: unknown) {
    console.error("[og]", e instanceof Error ? e.message : String(e));
    try {
      const buf = await getCachedOgPng("");
      return new Response(new Uint8Array(buf), {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=3600",
        },
      });
    } catch {
      return new Response("OG render failed", { status: 500 });
    }
  }
}
