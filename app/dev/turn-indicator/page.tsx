import { TurnIndicator, type GameInfo } from '@/components/turn-indicator';

export default function TurnIndicatorKitchenSinkPage() {
  const base: Omit<GameInfo, 'sideToMove'> = {
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    isCheck: false,
    isCheckmate: false,
    isStalemate: false,
    isDraw: false,
    onlyMove: false,
    legalMoves: [],
    lastMove: null,
    code: ''
  };

  const variants: Array<{ label: string; info: GameInfo }> = [
    {
      label: 'White to move (perspective: white)',
      info: { ...base, sideToMove: 'w', perspective: 'white' }
    },
    {
      label: 'Black to move (perspective: black)',
      info: { ...base, sideToMove: 'b', perspective: 'black' }
    },
    {
      label: 'Check (white to move)',
      info: { ...base, sideToMove: 'w', isCheck: true, perspective: 'white' }
    },
    {
      label: 'Only move (black to move)',
      info: { ...base, sideToMove: 'b', onlyMove: true, perspective: 'black' }
    },
    {
      label: 'Checkmate (white to move → Black wins)',
      info: { ...base, sideToMove: 'w', isCheckmate: true, perspective: 'white' }
    },
    {
      label: 'Stalemate / Draw',
      info: { ...base, sideToMove: 'b', isStalemate: true, isDraw: true, perspective: 'black' }
    }
  ];

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
              {variants.map(({ label, info }, idx) => (
                <div key={idx} className="space-y-4">
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
