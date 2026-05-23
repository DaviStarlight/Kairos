/**
 * Kairos algebraic notation. Mirrors `app/src/engine/notation.ts`.
 */
import type { MoveRecord, Position } from '@domain/index';
import { PIECE_ABBREV } from '@domain/index';
import { posToLabel } from './board';

export function moveToNotation(r: MoveRecord): string {
  const abbr = PIECE_ABBREV[r.pieceType];
  const from = posToLabel(r.from);
  const to = posToLabel(r.to);
  let s =
    r.kind === 'rangedCapture' ? `${abbr}${from}⊕${to}`
    : r.kind === 'capture'     ? `${abbr}${from}×${to}`
    :                            `${abbr}${from}→${to}`;
  if (r.promotion) s += `=${PIECE_ABBREV[r.promotion]}`;
  if (r.chargeTo) {
    const chargeTo = posToLabel(r.chargeTo);
    s += r.chargeCaptured ? ` ⚡×${chargeTo}` : ` ⚡${chargeTo}`;
  }
  if (r.isPress) s = `[P] ${s}`;
  return s;
}

export function positionToFileRank(p: Position): string {
  return posToLabel(p);
}
