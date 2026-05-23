/**
 * Centralized type vocabulary for the Kairos 3D engine.
 * Mirrors the original 2D engine domain so the ported rules drop in unchanged.
 *
 * Coordinate convention (matches the original):
 *   row 0 = rank 1 (Gold home row)
 *   row 7 = rank 8 (Silver home row)
 *   col 0 = file a
 *   col 7 = file h
 *
 * World-space mapping is handled by `Grid` (col -> x, row -> z).
 */

// ─── Factions ────────────────────────────────────────────────
export type Player = 'gold' | 'silver';

// ─── Piece taxonomy ──────────────────────────────────────────
export type PieceType =
  | 'archon'      // Arconte   — leader, must be protected
  | 'strategos'   // Strategos — general (3-square slider, 8 dirs)
  | 'hoplite'     // Hoplita   — 2-square orthogonal, Shield Wall
  | 'toxotes'     // Toxotes   — 2-square diagonal, Ranged Attack
  | 'hippeus'     // Hippeus   — L (2+1) and Grande L (3+1), Charge
  | 'doryphoros'; // Doríforo  — pawn-like, promotes on last rank

/** Pieces a Doríforo may promote to (Arconte excluded). */
export const PROMOTABLE_TYPES: ReadonlyArray<PieceType> = [
  'strategos',
  'hoplite',
  'toxotes',
  'hippeus',
];

export const PIECE_NAMES: Readonly<Record<PieceType, string>> = {
  archon: 'Arconte',
  strategos: 'Strategos',
  hoplite: 'Hoplita',
  toxotes: 'Toxotes',
  hippeus: 'Hippeus',
  doryphoros: 'Doríforo',
};

export const PIECE_ABBREV: Readonly<Record<PieceType, string>> = {
  archon: 'Ar',
  strategos: 'St',
  hoplite: 'Ho',
  toxotes: 'To',
  hippeus: 'Hi',
  doryphoros: 'Do',
};

// ─── Board primitives ────────────────────────────────────────
export interface Position {
  /** rank index 0..7 (0 = Gold home, 7 = Silver home) */
  row: number;
  /** file index 0..7 (0 = a, 7 = h) */
  col: number;
}

export interface Piece {
  type: PieceType;
  owner: Player;
  exhausted: boolean;
  /** stable visual id (assigned by the engine when populating the board) */
  id: string;
}

export type Board = (Piece | null)[][];

// ─── Moves ───────────────────────────────────────────────────
export type MoveKind = 'move' | 'capture' | 'rangedCapture';

export interface MoveTarget {
  pos: Position;
  kind: MoveKind;
}

// ─── Turn phase state machine ────────────────────────────────
export type TurnPhase =
  | 'mainMove'              // player picks any non-exhausted piece and moves it
  | 'charge'                // Hippeus captured → choose extra dash square (or skip)
  | 'promotion'             // Doríforo reached last rank → pick promotion type
  | 'pressDecision'         // main resolved → choose: press or end-turn
  | 'pressMove'             // pressing → pick another non-archon, non-exhausted piece
  | 'chargeAfterPress'      // Hippeus captured during press
  | 'promotionAfterPress'   // Doríforo promoted during press
  | 'gameOver';

// ─── Records / outcome ───────────────────────────────────────
export interface MoveRecord {
  player: Player;
  pieceType: PieceType;
  from: Position;
  to: Position;
  kind: MoveKind;
  captured?: PieceType;
  promotion?: PieceType;
  isPress: boolean;
  chargeFrom?: Position;
  chargeTo?: Position;
  chargeCaptured?: PieceType;
}

export interface GameResult {
  winner?: Player;
  isDraw: boolean;
  reason: string;
}

// ─── Cross-cutting infra ─────────────────────────────────────
export interface DisposableLike {
  dispose(): void;
}

export type Unsubscribe = () => void;

