# chss.chat

Play chess over any messaging app. No download, no sign up.

Share a link; the chat preview shows the board from the recipient's perspective. They open it, make a move, and share back. The whole game lives in the URL — no database, no accounts.

## How it works

1. Open [/p/](https://chss.chat/p/) for a new game (or `/p/?p=b` to start as black).
2. Move pieces on the board.
3. Tap **Share** to send the link via WhatsApp, iMessage, Telegram, etc.
4. The preview image is generated at `/og/<code>.png` from the encoded position.
5. Your opponent opens the link, sees the board flipped to their side, plays, and shares again.

## URL formats

| Example | Meaning |
| --- | --- |
| `/p/` | Starting position |
| `/p/e2e4e7e5` | Raw UCI move list |
| `/p/u-abc123` | Short lookup key for a known position |
| `/p/f-<base64url>` | Full FEN encoding |
| `?p=w` or `?p=b` | Override board orientation |

Play URLs and OG image codes use separate codecs. OG images use a fast `b-<board64><w|b>` format (640×640 PNG, edge-cached).

## Tech stack

- **Next.js 16** (App Router, Cache Components)
- **React 19**, TypeScript, Tailwind CSS 4
- **chess.js** for move validation and FEN
- **Satori** (`next/og`) for OG image generation
- **pnpm**

## Development

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Scripts

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Development server |
| `pnpm build` | Production build |
| `pnpm start` | Run production server |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest |
| `pnpm build:fen:keys` | Regenerate position lookup keys |
| `pnpm build:fen:counts` | Regenerate position frequency data |
| `pnpm build:og:top` | Regenerate prerendered OG code list |

## Project layout

```
app/
  page.tsx              Landing page
  p/[[...code]]/        Play board (dynamic game URLs)
  og/[[...code]]/       OG image API
  research/compression/ URL compression research article
components/
  chess-board.tsx       Interactive board
  pieces.tsx            v2 piece SVG glyphs
lib/
  state.ts              Play URL encode/decode
  og-fast.ts            OG board codec
  og-render.ts          PNG generation
public/v2/              Piece SVG assets
```

## Deployment

Deploy to Vercel (or any Next.js host). Set `NEXT_PUBLIC_BASE_URL` to your production origin if needed for absolute URLs in server actions.

OG routes set `Cache-Control: public, max-age=31536000, immutable` — safe because the URL fully encodes the image content.

## Research

[How small can a chess share link get?](https://chss.chat/research/compression) — benchmarks and codecs for compressing chess positions into pasteable URLs.

## License

MIT
