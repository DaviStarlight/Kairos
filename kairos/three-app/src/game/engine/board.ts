/**
 * Pure board primitives — zero THREE imports.
 *
 * Ported from `kairos/app/src/engine/board.ts` and adapted to embed stable
 * visual ids on every piece so the 3D layer can track entities across cloning.
 */
import type { Board, Piece, PieceType, Player, Position } from '@domain/index';

// ─── Piece id minting ────────────────────────────────────────
let __id = 0;
export function nextPieceId(): string {
  return `p_${++__id}`;
}

// ─── Piece factory ───────────────────────────────────────────
export function createPiece(type: PieceType, owner: Player): Piece {
  return { type, owner, exhausted: false, id: nextPieceId() };
}

// ─── Initial layout (canonical Kairos opening) ───────────────
export function createInitialBoard(): Board {
  const board: Board = Array.from({ length: 8 }, () =>
    Array<Piece | null>(8).fill(null),
  );

  // Gold back row (rank 1 = row 0): Hi To Ho Ar St Ho To Hi
  const goldRow: PieceType[] = [
    'hippeus', 'toxotes', 'hoplite', 'archon',
    'strategos', 'hoplite', 'toxotes', 'hippeus',
  ];
  for (let c = 0; c < 8; c++) board[0][c] = createPiece(goldRow[c], 'gold');
  for (let c = 2; c <= 5; c++) board[1][c] = createPiece('doryphoros', 'gold');

  // Silver back row (rank 8 = row 7): Hi To Ho St Ar Ho To Hi (mirrored)
  const silverRow: PieceType[] = [
    'hippeus', 'toxotes', 'hoplite', 'strategos',
    'archon', 'hoplite', 'toxotes', 'hippeus',
  ];
  for (let c = 0; c < 8; c++) board[7][c] = createPiece(silverRow[c], 'silver');
  for (let c = 2; c <= 5; c++) board[6][c] = createPiece('doryphoros', 'silver');

  return board;
}

// ─── Board utilities ─────────────────────────────────────────
export function cloneBoard(board: Board): Board {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

export function inBounds(row: number, col: number): boolean {
  return row >= 0 && row < 8 && col >= 0 && col < 8;
}

export function posEqual(a: Position, b: Position): boolean {
  return a.row === b.row && a.col === b.col;
}

export function posToLabel(pos: Position): string {
  return String.fromCharCode(97 + pos.col) + (pos.row + 1);
}

export function getForwardDir(player: Player): number {
  return player === 'gold' ? 1 : -1;
}

export function getLastRank(player: Player): number {
  return player === 'gold' ? 7 : 0;
}

export function getDoryphorosStartRow(player: Player): number {
  return player === 'gold' ? 1 : 6;
}

export function otherPlayer(player: Player): Player {
  return player === 'gold' ? 'silver' : 'gold';
}

export function countPieces(board: Board, owner: Player): number {
  let count = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) if (board[r][c]?.owner === owner) count++;
  }
  return count;
}

/** Position fingerprint used by the 3-fold-repetition check. */
export function boardHash(board: Board, currentPlayer: Player): string {
  let hash = currentPlayer;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p) {
        hash += `|${r}${c}${p.type[0]}${p.owner[0]}${p.exhausted ? 'e' : 'r'}`;
      }
    }
  }
  return hash;
}
