import { ImageResponse } from '@vercel/og';
import { NextRequest } from 'next/server';
import { createElement } from 'react';
import OGTemplate from './og-template';
import { parseUrlSegment } from '@/lib/utils';

export const dynamic = 'force-static';

export const config = {
  runtime: 'edge',
};

export async function generateStaticParams() {
  return [
    {
      code: [
        'o-rnbqkbnrpppppppp................................PPPPPPPPRNBQKBNR|w',
        'o-rnbqkbnrpppppppp................................PPPPPPPPRNBQKBNR|b',
        'o-rnbqkbnrpppppppp................................PPPPPPPPRNBQKBNR',
        'o-rnbqkbnrpppppppp................................PPPPPPPPRNBQKBNR|w.png',
        'o-rnbqkbnrpppppppp................................PPPPPPPPRNBQKBNR|b.png',
        'o-rnbqkbnrpppppppp................................PPPPPPPPRNBQKBNR.png'
      ]
    },
  ];
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