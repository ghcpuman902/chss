// app/p/[[...code]]/page.tsx

import { parseCode, generateCode } from '@/lib/state';
import { parseUrlSegment } from '@/lib/utils';
import { ChessBoard } from '@/components/chess-board';
import { redirect } from 'next/navigation';

export async function generateMetadata(props: PageProps<'/p/[[...code]]'>) {
  // Decode to get side-to-move → title + OG image path
  const { code } = await props.params;
  const codeString = parseUrlSegment(code);
  const { p } = await props.searchParams

  let title = 'Your move';
  let canonicalForOg = codeString;
  try {
    const parsed = parseCode(codeString);
    const { sideToMove } = parsed;
    title = `${sideToMove === 'w' ? 'White' : 'Black'} to move`;
    const preferred = generateCode(parsed);
    if (preferred) canonicalForOg = preferred;
  } catch { }
  const base = process.env.NEXT_PUBLIC_APP_BASE_URL ?? 'http://localhost:3000';
  return {
    title,
    openGraph: { title, images: [`${base}/og/${canonicalForOg}.png`] },
    twitter: { card: 'summary_large_image', title, images: [`${base}/og/${canonicalForOg}.png`] },
  };
}

export default async function Page(props: PageProps<'/p/[[...code]]'>) {
  const { code } = await props.params;
  const codeString = parseUrlSegment(code);
  const { p } = await props.searchParams

  let gameState;
  try {
    gameState = parseCode(codeString);
  } catch {
    // Fallback to initial position
    gameState = {
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      sideToMove: 'w' as const
    };
  }

  // Canonicalize URL to prefer short u- codes when available
  const preferred = generateCode(gameState);
  if (codeString && preferred && codeString !== preferred) {
    const search = p === 'w' || p === 'b' ? `?p=${p}` : '';
    redirect(`/p/${encodeURIComponent(preferred)}${search}`);
  }

  // Determine perspective:
  // 1. If 'p' parameter is provided, use it
  // 2. For empty board (no code), default to white perspective
  // 3. Otherwise, use side-to-move perspective (opponent's view)
  let perspective: 'white' | 'black';
  if (p === 'w' || p === 'b') {
    perspective = p === 'w' ? 'white' : 'black';
  } else if (!codeString || codeString === '') {
    perspective = 'white'; // Default to white for empty board
  } else {
    perspective = gameState.sideToMove === 'w' ? 'white' : 'black';
  }

  return (
    <main className="bg-background">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="container max-w-2xl mx-auto px-4 py-24">
          <ChessBoard
            initialState={gameState}
            perspective={perspective}
          />
        </div>
      </section>
    </main>
  );
}
