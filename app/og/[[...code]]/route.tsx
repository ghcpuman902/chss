import { NextRequest } from "next/server";
import { parseUrlSegment } from "@/lib/utils";
import { getCachedOgPng } from "@/lib/og-render";
import ogTop from "@/lib/og-top-codes.json";

export const runtime = "nodejs";

/** Allow on-demand OG for positions outside the lookup top table. */
export const dynamicParams = true;

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
  try {
    const { code } = await ctx.params;
    const raw = parseUrlSegment(code);
    const buf = await getCachedOgPng(raw);

    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=31536000, immutable",
        "CDN-Cache-Control": "public, max-age=31536000, immutable",
      },
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
