import { ImageResponse } from '@vercel/og';
import { NextRequest } from 'next/server';
import loadFont from '@/lib/font-loader';
import { createElement } from 'react';
import OGTemplate from './og-template';
import { parseUrlSegment } from '@/lib/utils';

import unifiedKeys from '@/lib/keys.json';

const fonts = loadFont();

export const config = {
  runtime: 'edge',
};

export async function generateStaticParams() {
  // Pre-render top n keys as OG image routes: /og/u-<key>.png
  const keys = Object.keys(unifiedKeys as Record<string, string>).slice(0, 50);
  return keys.map((key) => ({ code: [`u-${key}.png`] }));
}

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<'/og/[[...code]]'>
) {
  try {
    const { code } = await ctx.params;
    const codeString = parseUrlSegment(code);

    const query = codeString;

    return new ImageResponse(
      createElement(OGTemplate, {
        query: query || undefined,
      }),
      {
        width: 800,
        height: 800,
        fonts: [
          ...(fonts?.interNormal
            ? [
              {
                name: "Inter",
                data: fonts.interNormal,
                weight: 400 as const,
                style: "normal" as const,
              },
            ]
            : []),
          ...(fonts?.interBold
            ? [
              {
                name: "Inter",
                data: fonts.interBold,
                weight: 700 as const,
                style: "normal" as const,
              },
            ]
            : []),
        ],
        debug: false,
      },
    );
  } catch (e: unknown) {
    console.log(`${e instanceof Error ? e.message : String(e)}`);

    return new ImageResponse(
      createElement(OGTemplate, {
        query: undefined,
      }),
      {
        width: 800,
        height: 800,
        fonts: [
          ...(fonts?.interNormal
            ? [
              {
                name: "Inter",
                data: fonts.interNormal,
                weight: 400 as const,
                style: "normal" as const,
              },
            ]
            : []),
          ...(fonts?.interBold
            ? [
              {
                name: "Inter",
                data: fonts.interBold,
                weight: 700 as const,
                style: "normal" as const,
              },
            ]
            : []),
        ],
        debug: false,
      },
    );
  }
}