import { TurnIndicator, type GameInfo } from '@/components/turn-indicator';

const BASE: Omit<GameInfo, 'sideToMove'> = {
  fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  isCheck: false,
  isCheckmate: false,
  isStalemate: false,
  isDraw: false,
  outcome: 'ongoing',
  drawReason: undefined,
  onlyMove: false,
  legalMoves: [],
  lastMove: null,
  code: '',
};

const VARIANTS: Array<{ label: string; info: GameInfo }> = [
  {
    label: 'White to move (perspective: white)',
    info: { ...BASE, sideToMove: 'w', perspective: 'white' },
  },
  {
    label: 'Black to move (perspective: black)',
    info: { ...BASE, sideToMove: 'b', perspective: 'black' },
  },
  {
    label: 'Check (white to move)',
    info: { ...BASE, sideToMove: 'w', isCheck: true, perspective: 'white' },
  },
  {
    label: 'Only move (black to move)',
    info: { ...BASE, sideToMove: 'b', onlyMove: true, perspective: 'black' },
  },
  {
    label: 'Checkmate (white to move → Black wins)',
    info: {
      ...BASE,
      sideToMove: 'w',
      isCheckmate: true,
      outcome: 'checkmate',
      perspective: 'white',
    },
  },
  {
    label: 'Stalemate / Draw',
    info: {
      ...BASE,
      sideToMove: 'b',
      isStalemate: true,
      isDraw: true,
      outcome: 'draw',
      drawReason: 'stalemate',
      perspective: 'black',
    },
  },
  {
    label: 'Draw — 50-move rule',
    info: {
      ...BASE,
      sideToMove: 'w',
      outcome: 'draw',
      drawReason: 'fifty-move',
      perspective: 'white',
    },
  },
  {
    label: 'Draw — Insufficient material',
    info: {
      ...BASE,
      sideToMove: 'b',
      outcome: 'draw',
      drawReason: 'insufficient',
      perspective: 'black',
    },
  },
  {
    label: 'Draw — Threefold repetition',
    info: {
      ...BASE,
      sideToMove: 'w',
      outcome: 'draw',
      drawReason: 'threefold',
      perspective: 'white',
    },
  },
];

export default function TurnIndicatorKitchenSinkPage() {
  return (
    <main className="bg-background">
      <section className="relative overflow-hidden">
        <div className="container max-w-2xl mx-auto px-4 py-16 lg:py-24">
          <div className="space-y-8">
            <div className="space-y-2">
              <h1 className="text-3xl lg:text-4xl font-bold">Turn Indicator — Kitchen Sink</h1>
              <p className="text-muted-foreground">Visual variants to iterate on styles quickly.</p>
            </div>

            <div className="flex flex-col gap-12">
              {VARIANTS.map(({ label, info }) => (
                <div key={label} className="space-y-4">
                  <div className="text-sm font-medium text-muted-foreground">{label}</div>
                  <div className="relative mx-auto w-full">
                    <div className="aspect-square w-full bg-muted rounded-xs" />
                    <TurnIndicator info={info} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
