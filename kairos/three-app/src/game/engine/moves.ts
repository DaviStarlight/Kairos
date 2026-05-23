/**
 * Per-piece move generation.
 * Ported from `app/src/engine/moves.ts` verbatim (logic-equivalent).
 *
 * Public API:
 *   - getMovesForPiece(board, pos): MoveTarget[]
 *   - hasAnyLegalMove(board, player): boolean
 *   - canPlayerPress(board, player, mainMoveActorPos): boolean
 */
import type { Board, MoveTarget, Player, Position } from '@domain/index';
import { inBounds, getForwardDir, getDoryphorosStartRow } from './board';
import { canBeCaptured } from './abilities';

const ALL_DIRS: [number, number][] = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1],
];
const ORTHO_DIRS: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const DIAG_DIRS: [number, number][] = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

function addTarget(
  targets: MoveTarget[],
  board: Board,
  row: number,
  col: number,
  owner: Player,
): boolean {
  if (!inBounds(row, col)) return false;
  const cell = board[row][col];
  if (cell === null) {
    targets.push({ pos: { row, col }, kind: 'move' });
    return true;
  }
  if (cell.owner !== owner && canBeCaptured(board, { row, col })) {
    targets.push({ pos: { row, col }, kind: 'capture' });
  }
  return false;
}

function getSlidingMoves(
  board: Board,
  pos: Position,
  owner: Player,
  dirs: [number, number][],
  maxDist: number,
): MoveTarget[] {
  const targets: MoveTarget[] = [];
  for (const [dr, dc] of dirs) {
    for (let d = 1; d <= maxDist; d++) {
      if (!addTarget(targets, board, pos.row + dr * d, pos.col + dc * d, owner)) break;
    }
  }
  return targets;
}

function getArchonMoves(board: Board, pos: Position, owner: Player): MoveTarget[] {
  const targets: MoveTarget[] = [];
  for (const [dr, dc] of ALL_DIRS) {
    addTarget(targets, board, pos.row + dr, pos.col + dc, owner);
  }
  return targets;
}

function getStrategosMoves(board: Board, pos: Position, owner: Player): MoveTarget[] {
  return getSlidingMoves(board, pos, owner, ALL_DIRS, 3);
}

function getHopliteMoves(board: Board, pos: Position, owner: Player): MoveTarget[] {
  return getSlidingMoves(board, pos, owner, ORTHO_DIRS, 2);
}

function getToxotesMoves(board: Board, pos: Position, owner: Player): MoveTarget[] {
  // Standard 2-step diagonal slide
  const targets = getSlidingMoves(board, pos, owner, DIAG_DIRS, 2);

  // Ranged attack: shoot exactly 2 squares in any of 8 directions,
  // middle square must be empty, target must be a capturable enemy.
  for (const [dr, dc] of ALL_DIRS) {
    const midRow = pos.row + dr;
    const midCol = pos.col + dc;
    const tgtRow = pos.row + 2 * dr;
    const tgtCol = pos.col + 2 * dc;
    if (!inBounds(tgtRow, tgtCol)) continue;
    if (board[midRow][midCol] !== null) continue;
    const target = board[tgtRow][tgtCol];
    if (
      target &&
      target.owner !== owner &&
      canBeCaptured(board, { row: tgtRow, col: tgtCol })
    ) {
      targets.push({ pos: { row: tgtRow, col: tgtCol }, kind: 'rangedCapture' });
    }
  }
  return targets;
}

function getHippeusMoves(board: Board, pos: Position, owner: Player): MoveTarget[] {
  const targets: MoveTarget[] = [];
  // Standard L (2+1) AND Grande L (3+1). Jumps over intervening pieces.
  const offsets: [number, number][] = [
    [-2, -1], [-2, 1], [2, -1], [2, 1],
    [-1, -2], [-1, 2], [1, -2], [1, 2],
    [-3, -1], [-3, 1], [3, -1], [3, 1],
    [-1, -3], [-1, 3], [1, -3], [1, 3],
  ];
  for (const [dr, dc] of offsets) {
    const nr = pos.row + dr;
    const nc = pos.col + dc;
    if (!inBounds(nr, nc)) continue;
    const cell = board[nr][nc];
    if (cell === null) {
      targets.push({ pos: { row: nr, col: nc }, kind: 'move' });
    } else if (cell.owner !== owner && canBeCaptured(board, { row: nr, col: nc })) {
      targets.push({ pos: { row: nr, col: nc }, kind: 'capture' });
    }
  }
  return targets;
}

function getDoryphorosMoves(board: Board, pos: Position, owner: Player): MoveTarget[] {
  const targets: MoveTarget[] = [];
  const fwd = getForwardDir(owner);
  const startRow = getDoryphorosStartRow(owner);

  // Forward move (1; or 2 from starting row, both squares empty)
  const fwdRow = pos.row + fwd;
  if (inBounds(fwdRow, pos.col) && board[fwdRow][pos.col] === null) {
    targets.push({ pos: { row: fwdRow, col: pos.col }, kind: 'move' });
    if (pos.row === startRow) {
      const dblRow = pos.row + 2 * fwd;
      if (inBounds(dblRow, pos.col) && board[dblRow][pos.col] === null) {
        targets.push({ pos: { row: dblRow, col: pos.col }, kind: 'move' });
      }
    }
  }

  // Diagonal-forward captures
  for (const dc of [-1, 1]) {
    const cr = pos.row + fwd;
    const cc = pos.col + dc;
    if (!inBounds(cr, cc)) continue;
    const target = board[cr][cc];
    if (target && target.owner !== owner && canBeCaptured(board, { row: cr, col: cc })) {
      targets.push({ pos: { row: cr, col: cc }, kind: 'capture' });
    }
  }
  return targets;
}

// ─── Public API ──────────────────────────────────────────────
export function getMovesForPiece(board: Board, pos: Position): MoveTarget[] {
  const piece = board[pos.row][pos.col];
  if (!piece) return [];
  switch (piece.type) {
    case 'archon':     return getArchonMoves(board, pos, piece.owner);
    case 'strategos':  return getStrategosMoves(board, pos, piece.owner);
    case 'hoplite':    return getHopliteMoves(board, pos, piece.owner);
    case 'toxotes':    return getToxotesMoves(board, pos, piece.owner);
    case 'hippeus':    return getHippeusMoves(board, pos, piece.owner);
    case 'doryphoros': return getDoryphorosMoves(board, pos, piece.owner);
  }
}

export function hasAnyLegalMove(board: Board, player: Player): boolean {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.owner === player && !p.exhausted) {
        if (getMovesForPiece(board, { row: r, col: c }).length > 0) return true;
      }
    }
  }
  return false;
}

export function canPlayerPress(
  board: Board,
  player: Player,
  mainMoveActorPos: Position,
): boolean {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p || p.owner !== player) continue;
      if (p.exhausted) continue;
      if (p.type === 'archon') continue;
      if (r === mainMoveActorPos.row && c === mainMoveActorPos.col) continue;
      if (getMovesForPiece(board, { row: r, col: c }).length > 0) return true;
    }
  }
  return false;
}
