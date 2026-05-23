/**
 * Special abilities — Shield Wall, Charge, draw detection.
 * Pure, no THREE imports. Ported from `app/src/engine/abilities.ts`.
 */
import type { Board, Player, Position } from '@domain/index';
import { inBounds } from './board';

const ORTHO_DIRS: readonly [number, number][] = [
  [-1, 0], [1, 0], [0, -1], [0, 1],
];

const ALL_DIRS: readonly [number, number][] = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1],
];

// ─── Shield Wall (Hoplitas) ──────────────────────────────────
/** Two allied Hoplitas orthogonally adjacent are mutually uncapturable. */
export function isInShieldWall(board: Board, pos: Position): boolean {
  const piece = board[pos.row][pos.col];
  if (!piece || piece.type !== 'hoplite') return false;

  for (const [dr, dc] of ORTHO_DIRS) {
    const nr = pos.row + dr;
    const nc = pos.col + dc;
    if (!inBounds(nr, nc)) continue;
    const neighbor = board[nr][nc];
    if (neighbor && neighbor.type === 'hoplite' && neighbor.owner === piece.owner) {
      return true;
    }
  }
  return false;
}

/** A piece is capturable unless it is currently sheltered by a Shield Wall. */
export function canBeCaptured(board: Board, pos: Position): boolean {
  return !isInShieldWall(board, pos);
}

// ─── Charge (Hippeus follow-up after capture) ────────────────
export function getChargeTargets(
  board: Board,
  pos: Position,
  owner: Player,
): Position[] {
  const targets: Position[] = [];
  for (const [dr, dc] of ALL_DIRS) {
    const nr = pos.row + dr;
    const nc = pos.col + dc;
    if (!inBounds(nr, nc)) continue;

    const cell = board[nr][nc];
    if (cell === null) {
      targets.push({ row: nr, col: nc });
    } else if (cell.owner !== owner && canBeCaptured(board, { row: nr, col: nc })) {
      targets.push({ row: nr, col: nc });
    }
  }
  return targets;
}

// ─── Draw helpers ────────────────────────────────────────────
/** Only the two Archons remain → automatic draw. */
export function hasInsufficientMaterial(board: Board): boolean {
  let gold = 0;
  let silver = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p) continue;
      if (p.owner === 'gold') gold++;
      else silver++;
    }
  }
  return gold === 1 && silver === 1;
}
