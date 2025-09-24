import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { createElement } from 'react';
import OGTemplate from './og-template';
import { parseUrlSegment } from '@/lib/utils';

export const dynamic = 'force-static';

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<'/og/[[...code]]'>
) {
  try {
    const { code } = await ctx.params;
    const raw = parseUrlSegment(code);
    // Sanitize: strip trailing extension like .png and anything after first dot
    // Accept forms: "o-<payload>", "o-<payload>.png", "o-<payload>..."
    const dotIdx = raw.indexOf('.');
    const codeString = dotIdx === -1 ? raw : raw.slice(0, dotIdx);
    const query = codeString || undefined;

    return new ImageResponse(
      createElement(OGTemplate, { query }),
      {
        width: 800,
        height: 800,
        debug: false,
        headers: {
          'Cache-Control': 'public, max-age=31536000, immutable',
          'Content-Type': 'image/png',
        },
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
        debug: false,
        headers: {
          'Cache-Control': 'public, max-age=31536000, immutable',
          'Content-Type': 'image/png',
        },
      },
    );
  }
}