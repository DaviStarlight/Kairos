/**
 * GameState — authoritative Kairos rule engine.
 *
 * Owns:
 *   - the 8×8 mutable board (Piece | null)
 *   - the full turn phase machine (mainMove → charge → promotion → pressDecision …)
 *   - move history, captures, exhaustion, draw bookkeeping
 *
 * Mutations only happen through the public methods so animations + UI can react
 * via the typed event bus on `events`. The 3D layer never touches `board[r][c]`
 * directly — it listens to events and tweens visuals to match.
 *
 * Direct port of the ruleset implemented in `kairos/app/src/store/gameStore.ts`
 * with the same phase ordering and the same draw checks (insufficient material,
 * stalemate, 50-move, threefold repetition).
 */
import { EventBus } from '@core/EventBus';
import type {
  Board, GameResult, MoveKind, MoveRecord, MoveTarget,
  Piece, PieceType, Player, Position, TurnPhase,
} from '@domain/index';
import {
  boardHash, createInitialBoard, getLastRank, otherPlayer, posEqual,
  posToLabel,
  nextPieceId,
} from './engine/board';
import {
  canPlayerPress, getMovesForPiece, hasAnyLegalMove,
} from './engine/moves';
import {
  getChargeTargets, hasInsufficientMaterial, isInShieldWall,
} from './engine/abilities';

// ─── Event vocabulary ────────────────────────────────────────
export interface GameEvents extends Record<string, unknown> {
  /** Initial state pushed once after reset(); also after every mutation. */
  'state:changed': undefined;
  'phase:changed': { phase: TurnPhase; prev: TurnPhase };
  'turn:advanced': { player: Player; turnNumber: number };
  /** A piece moved (or shot, for ranged). For rangedCapture the mover does NOT change tile. */
  'move:executed': {
    player: Player;
    moverId: string;
    fromPos: Position;
    toPos: Position;
    kind: MoveKind;
    capturedId: string | null;
    isPress: boolean;
  };
  'charge:executed': {
    player: Player;
    moverId: string;
    fromPos: Position;
    toPos: Position;
    capturedId: string | null;
    afterPress: boolean;
  };
  /** A Doríforo became another piece type — same id; visual must rebuild. */
  'piece:promoted': {
    pieceId: string;
    pos: Position;
    fromType: PieceType;
    toType: PieceType;
  };
  /** Visual exhaustion toggle (after press, after recovery). */
  'piece:exhausted': { pieceId: string; exhausted: boolean };
  'game:over': { result: GameResult };
  'shieldwall:changed': { positions: Position[] };
}

export class GameState {
  readonly events = new EventBus<GameEvents>();
  board: Board = createInitialBoard();
  currentPlayer: Player = 'gold';
  turnNumber = 1;
  phase: TurnPhase = 'mainMove';

  mainMoveActorPos: Position | null = null;
  chargePos: Position | null = null;
  chargeTargets: Position[] = [];
  promotionPos: Position | null = null;

  moves: MoveRecord[] = [];
  capturedByGold: PieceType[] = [];
  capturedBySilver: PieceType[] = [];

  halfMoveClock = 0;
  positionHashes: string[] = [];
  result: GameResult | null = null;
  canPressNow = false;

  // ─── Lifecycle ────────────────────────────────────────────
  reset(): void {
    this.board = createInitialBoard();
    this.currentPlayer = 'gold';
    this.turnNumber = 1;
    this.setPhase('mainMove', /*silent*/ true);
    this.mainMoveActorPos = null;
    this.chargePos = null;
    this.chargeTargets = [];
    this.promotionPos = null;
    this.moves = [];
    this.capturedByGold = [];
    this.capturedBySilver = [];
    this.halfMoveClock = 0;
    this.positionHashes = [];
    this.result = null;
    this.canPressNow = false;
    this.events.emit('state:changed', undefined);
    this.events.emit('turn:advanced', {
      player: this.currentPlayer,
      turnNumber: this.turnNumber,
    });
    this.refreshShieldWalls();
  }

  // ─── Queries ──────────────────────────────────────────────
  at(pos: Position): Piece | null {
    return this.board[pos.row][pos.col];
  }

  /** Phase-aware legal targets (e.g. press restrictions disable the main-move actor). */
  movesFor(pos: Position): MoveTarget[] {
    const piece = this.at(pos);
    if (!piece || piece.owner !== this.currentPlayer) return [];
    if (piece.exhausted) return [];
    if (this.phase === 'pressMove') {
      if (piece.type === 'archon') return [];
      if (this.mainMoveActorPos && posEqual(pos, this.mainMoveActorPos)) return [];
    } else if (this.phase !== 'mainMove') {
      return [];
    }
    return getMovesForPiece(this.board, pos);
  }

  /** Returns true iff the player can legally select this piece in the current phase. */
  canSelect(pos: Position): boolean {
    const piece = this.at(pos);
    if (!piece || piece.owner !== this.currentPlayer || piece.exhausted) return false;
    if (this.phase === 'pressMove') {
      if (piece.type === 'archon') return false;
      if (this.mainMoveActorPos && posEqual(pos, this.mainMoveActorPos)) return false;
    } else if (this.phase !== 'mainMove') {
      return false;
    }
    return true;
  }

  // ─── Move execution ───────────────────────────────────────
  executeMove(from: Position, target: MoveTarget): boolean {
    if (this.phase !== 'mainMove' && this.phase !== 'pressMove') return false;
    const piece = this.at(from);
    if (!piece || piece.owner !== this.currentPlayer || piece.exhausted) return false;

    const legal = this.movesFor(from).find(
      (m) => posEqual(m.pos, target.pos) && m.kind === target.kind,
    );
    if (!legal) return false;

    const isPress = this.phase === 'pressMove';
    const moverId = piece.id;
    let capturedPiece: Piece | null = null;
    let actorPos: Position;

    if (target.kind === 'rangedCapture') {
      capturedPiece = this.at(target.pos);
      this.board[target.pos.row][target.pos.col] = null;
      actorPos = from;
    } else {
      if (target.kind === 'capture') {
        capturedPiece = this.at(target.pos);
      }
      this.board[target.pos.row][target.pos.col] = piece;
      this.board[from.row][from.col] = null;
      actorPos = target.pos;
    }

    // Record + captures bookkeeping
    const record: MoveRecord = {
      player: this.currentPlayer,
      pieceType: piece.type,
      from: { ...from },
      to: { ...target.pos },
      kind: target.kind,
      captured: capturedPiece?.type,
      isPress,
    };
    this.moves.push(record);
    if (capturedPiece) {
      if (this.currentPlayer === 'gold') this.capturedByGold.push(capturedPiece.type);
      else this.capturedBySilver.push(capturedPiece.type);
    }

    // 50-move clock — resets on capture or Doríforo move
    if (capturedPiece || piece.type === 'doryphoros') this.halfMoveClock = 0;
    else if (!isPress) this.halfMoveClock++;

    this.events.emit('move:executed', {
      player: this.currentPlayer,
      moverId,
      fromPos: { ...from },
      toPos: { ...target.pos },
      kind: target.kind,
      capturedId: capturedPiece?.id ?? null,
      isPress,
    });
    this.events.emit('state:changed', undefined);

    // Archon capture → instant win
    if (capturedPiece?.type === 'archon') {
      this.declareWin(this.currentPlayer, 'Arconte capturado!');
      return true;
    }

    // Hippeus captured → Charge option
    if (piece.type === 'hippeus' && target.kind === 'capture') {
      const targets = getChargeTargets(this.board, actorPos, this.currentPlayer);
      this.chargePos = { ...actorPos };
      this.chargeTargets = targets;
      this.mainMoveActorPos = isPress ? this.mainMoveActorPos : { ...actorPos };
      this.setPhase(isPress ? 'chargeAfterPress' : 'charge');
      this.refreshShieldWalls();
      return true;
    }

    // Doríforo on last rank → Promotion option
    if (
      piece.type === 'doryphoros' &&
      actorPos.row === getLastRank(this.currentPlayer)
    ) {
      this.promotionPos = { ...actorPos };
      this.mainMoveActorPos = isPress ? this.mainMoveActorPos : { ...actorPos };
      this.setPhase(isPress ? 'promotionAfterPress' : 'promotion');
      this.refreshShieldWalls();
      return true;
    }

    // Normal completion
    if (isPress) {
      // Exhaust the pressed piece (it just used its second action)
      const pressed = this.board[actorPos.row][actorPos.col];
      if (pressed) {
        pressed.exhausted = true;
        this.events.emit('piece:exhausted', { pieceId: pressed.id, exhausted: true });
      }
      this.finishTurn();
    } else {
      this.afterMainMove(actorPos);
    }
    this.refreshShieldWalls();
    return true;
  }

  // ─── Charge ───────────────────────────────────────────────
  executeCharge(targetPos: Position): boolean {
    if (this.phase !== 'charge' && this.phase !== 'chargeAfterPress') return false;
    if (!this.chargeTargets.some((t) => posEqual(t, targetPos))) return false;

    const from = this.chargePos!;
    const piece = this.at(from)!;
    const isAfterPress = this.phase === 'chargeAfterPress';

    const target = this.at(targetPos);
    const captured: Piece | null = target && target.owner !== this.currentPlayer ? target : null;
    this.board[targetPos.row][targetPos.col] = piece;
    this.board[from.row][from.col] = null;

    // Patch last record
    const last = this.moves[this.moves.length - 1];
    if (last) {
      last.chargeFrom = { ...from };
      last.chargeTo = { ...targetPos };
      if (captured) last.chargeCaptured = captured.type;
    }
    if (captured) {
      if (this.currentPlayer === 'gold') this.capturedByGold.push(captured.type);
      else this.capturedBySilver.push(captured.type);
    }

    this.events.emit('charge:executed', {
      player: this.currentPlayer,
      moverId: piece.id,
      fromPos: { ...from },
      toPos: { ...targetPos },
      capturedId: captured?.id ?? null,
      afterPress: isAfterPress,
    });
    this.events.emit('state:changed', undefined);

    if (captured?.type === 'archon') {
      this.declareWin(this.currentPlayer, 'Arconte capturado por Investida!');
      return true;
    }

    this.chargePos = null;
    this.chargeTargets = [];

    if (isAfterPress) {
      const pressed = this.board[targetPos.row][targetPos.col]!;
      pressed.exhausted = true;
      this.events.emit('piece:exhausted', { pieceId: pressed.id, exhausted: true });
      this.finishTurn();
    } else {
      this.afterMainMove(targetPos);
    }
    this.refreshShieldWalls();
    return true;
  }

  skipCharge(): void {
    if (this.phase !== 'charge' && this.phase !== 'chargeAfterPress') return;
    const isAfterPress = this.phase === 'chargeAfterPress';
    const at = this.chargePos!;
    this.chargePos = null;
    this.chargeTargets = [];
    if (isAfterPress) {
      const pressed = this.board[at.row][at.col];
      if (pressed) {
        pressed.exhausted = true;
        this.events.emit('piece:exhausted', { pieceId: pressed.id, exhausted: true });
      }
      this.finishTurn();
    } else {
      this.afterMainMove(at);
    }
    this.events.emit('state:changed', undefined);
  }

  // ─── Promotion ────────────────────────────────────────────
  promote(toType: PieceType): boolean {
    if (this.phase !== 'promotion' && this.phase !== 'promotionAfterPress') return false;
    if (toType === 'archon' || toType === 'doryphoros') return false;
    const pos = this.promotionPos!;
    const old = this.at(pos);
    if (!old) return false;

    const isAfterPress = this.phase === 'promotionAfterPress';
    const fromType = old.type;
    // Keep identity (same id) — visual rebuilds geometry on the event.
    old.type = toType;
    old.exhausted = isAfterPress;

    const last = this.moves[this.moves.length - 1];
    if (last) last.promotion = toType;

    this.events.emit('piece:promoted', {
      pieceId: old.id,
      pos: { ...pos },
      fromType,
      toType,
    });
    if (isAfterPress) {
      this.events.emit('piece:exhausted', { pieceId: old.id, exhausted: true });
    }
    this.events.emit('state:changed', undefined);

    this.promotionPos = null;
    if (isAfterPress) this.finishTurn();
    else this.afterMainMove(pos);
    this.refreshShieldWalls();
    return true;
  }

  // ─── Press decision branches ──────────────────────────────
  startPress(): boolean {
    if (this.phase !== 'pressDecision' || !this.canPressNow) return false;
    this.setPhase('pressMove');
    return true;
  }

  declinePress(): boolean {
    if (this.phase !== 'pressDecision') return false;
    this.finishTurn();
    return true;
  }

  resign(): void {
    if (this.phase === 'gameOver') return;
    this.declareWin(otherPlayer(this.currentPlayer), 'Abandono');
  }

  // ─── Internal transitions ─────────────────────────────────
  private afterMainMove(actorPos: Position): void {
    this.mainMoveActorPos = { ...actorPos };
    this.canPressNow = canPlayerPress(this.board, this.currentPlayer, actorPos);
    this.setPhase('pressDecision');
    if (!this.canPressNow) {
      // No legal press — auto-finish so we don't block the player on a decision
      // they can't actually take. The HUD still shows pressDecision for a beat.
      this.finishTurn();
    }
  }

  private finishTurn(): void {
    const next = otherPlayer(this.currentPlayer);

    // Recovery: clear all of next player's exhaustion tokens
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = this.board[r][c];
        if (p && p.owner === next && p.exhausted) {
          p.exhausted = false;
          this.events.emit('piece:exhausted', { pieceId: p.id, exhausted: false });
        }
      }
    }

    // Draw checks
    if (hasInsufficientMaterial(this.board)) {
      this.declareDraw('Material insuficiente — empate');
      return;
    }
    if (!hasAnyLegalMove(this.board, next)) {
      this.declareDraw('Sem movimentos legais — empate');
      return;
    }
    if (this.halfMoveClock >= 50) {
      this.declareDraw('Regra dos 50 movimentos — empate');
      return;
    }
    const hash = boardHash(this.board, next);
    this.positionHashes.push(hash);
    if (this.positionHashes.filter((h) => h === hash).length >= 3) {
      this.declareDraw('Repetição tripla — empate');
      return;
    }

    // Advance
    this.currentPlayer = next;
    if (next === 'gold') this.turnNumber++;
    this.mainMoveActorPos = null;
    this.chargePos = null;
    this.chargeTargets = [];
    this.promotionPos = null;
    this.canPressNow = false;
    this.setPhase('mainMove');
    this.events.emit('turn:advanced', { player: next, turnNumber: this.turnNumber });
    this.refreshShieldWalls();
  }

  private declareWin(winner: Player, reason: string): void {
    this.result = { winner, isDraw: false, reason };
    this.setPhase('gameOver');
    this.events.emit('game:over', { result: this.result });
    this.events.emit('state:changed', undefined);
  }

  private declareDraw(reason: string): void {
    this.result = { isDraw: true, reason };
    this.setPhase('gameOver');
    this.events.emit('game:over', { result: this.result });
    this.events.emit('state:changed', undefined);
  }

  private setPhase(next: TurnPhase, silent = false): void {
    if (next === this.phase) return;
    const prev = this.phase;
    this.phase = next;
    if (!silent) {
      this.events.emit('phase:changed', { phase: next, prev });
      // CRITICAL: also emit state:changed so the HUD + SelectionSystem refresh.
      // Without this, executeMove → setPhase('pressDecision') leaves the UI
      // stuck on the previous phase, hiding the PRESSIONAR action and making
      // it impossible to continue the turn.
      this.events.emit('state:changed', undefined);
    }
  }

  /** Recompute the set of positions currently locked in a Shield Wall pairing. */
  private refreshShieldWalls(): void {
    const positions: Position[] = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = this.board[r][c];
        if (p && p.type === 'hoplite' && isInShieldWall(this.board, { row: r, col: c })) {
          positions.push({ row: r, col: c });
        }
      }
    }
    this.events.emit('shieldwall:changed', { positions });
  }

  // ─── Iteration helpers (read-only) ────────────────────────
  /** Yields every alive piece together with its position. */
  *allPieces(): IterableIterator<{ piece: Piece; pos: Position }> {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = this.board[r][c];
        if (p) yield { piece: p, pos: { row: r, col: c } };
      }
    }
  }

  /** Build a fresh visual id for a newly spawned piece (e.g. for hot loading). */
  static mintId(): string {
    return nextPieceId();
  }

  posLabel(pos: Position): string {
    return posToLabel(pos);
  }
}

