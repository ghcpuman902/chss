/**
 * Build a share/chat title from side-to-move (recipient view), not board perspective.
 * After a move, `sideToMove` is the next player; the mover is the opposite color.
 */
export const buildShareTitle = (
  sideToMove: 'w' | 'b',
  lastMoveTo?: string | null,
): string => {
  const nextColor = sideToMove === 'w' ? 'White' : 'Black';
  if (!lastMoveTo) return `${nextColor} to move`;
  const movedColor = sideToMove === 'w' ? 'Black' : 'White';
  return `${movedColor} moved to ${lastMoveTo.toLowerCase()}, ${nextColor} to move`;
};
