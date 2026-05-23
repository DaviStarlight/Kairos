/**
 * SelectionSystem — drives the hover/click → board hints → move commit loop.
 *
 * Phase awareness:
 *   - 'mainMove' / 'pressMove' → click own piece to select, then click a target.
 *     Valid targets are colored by MoveKind:
 *       move          → green
 *       capture       → red
 *       rangedCapture → amethyst (Toxotes)
 *   - 'charge' / 'chargeAfterPress' → forced selection on the Hippeus; click one
 *     of the amber-glowing follow-up squares (or use the HUD "Skip" button).
 *   - 'promotion' / 'promotionAfterPress' / 'gameOver' / 'pressDecision' →
 *     board ignores clicks; decisions happen via HUD buttons.
 *
 * Passive overlays:
 *   - Hoplitas locked in a Shield Wall pulse softly in blue (passive halo).
 */
import { EventBus } from '@core/EventBus';
import type { Board } from '@board/Board';
import type { Piece } from '@entities/Piece';
import type { GameState } from '@game/GameState';
import type { InputManager } from '@input/InputManager';
import type {
  MoveTarget, Position, Player,
} from '@domain/index';
import { Grid } from '@grid/Grid';

export interface SelectionEvents extends Record<string, unknown> {
  'selection:changed': { pos: Position | null; pieceId: string | null };
}

export interface SelectionDeps {
  board: Board;
  state: GameState;
  input: InputManager;
  pieces: Map<string, Piece>;
}

export class SelectionSystem {
  readonly events = new EventBus<SelectionEvents>();
  private selectedPos: Position | null = null;
  private selectedId: string | null = null;
  private legal: MoveTarget[] = [];
  private hovered: Position | null = null;
  private shieldWallSet = new Set<string>();
  private readonly unsubs: Array<() => void> = [];

  constructor(private readonly deps: SelectionDeps) {
    this.unsubs.push(deps.input.events.on('tile:hover', (e) => this.onHover(e.pos)));
    this.unsubs.push(deps.input.events.on('tile:click', (e) => this.onClick(e.pos)));
    this.unsubs.push(
      deps.state.events.on('shieldwall:changed', ({ positions }) => {
        this.shieldWallSet = new Set(positions.map((p) => Grid.key(p)));
        this.refreshHints();
      }),
    );
    this.unsubs.push(
      deps.state.events.on('phase:changed', () => {
        this.clearSelection();
        this.refreshHints();
      }),
    );
  }

  get selectedPieceId(): string | null {
    return this.selectedId;
  }

  // ─── Pointer routing ──────────────────────────────────────
  private onHover(pos: Position | null): void {
    this.hovered = pos;
    this.refreshHints();
  }

  private onClick(pos: Position): void {
    const phase = this.deps.state.phase;
    if (phase === 'gameOver' || phase === 'pressDecision'
      || phase === 'promotion' || phase === 'promotionAfterPress') {
      return;
    }

    // Charge phases — clicks must be one of the highlighted dash targets.
    if (phase === 'charge' || phase === 'chargeAfterPress') {
      const ok = this.deps.state.chargeTargets.some(
        (t) => t.row === pos.row && t.col === pos.col,
      );
      if (ok) this.deps.state.executeCharge(pos);
      return;
    }

    // Main / Press move phase
    if (this.selectedPos) {
      const tgt = this.legal.find((m) => m.pos.row === pos.row && m.pos.col === pos.col);
      if (tgt) {
        this.deps.state.executeMove(this.selectedPos, tgt);
        this.clearSelection();
        return;
      }
    }
    // Otherwise try to select a friendly, non-exhausted, phase-legal piece
    if (this.deps.state.canSelect(pos)) {
      this.select(pos);
    } else {
      this.clearSelection();
    }
  }

  private select(pos: Position): void {
    const piece = this.deps.state.at(pos);
    if (!piece) return;
    this.selectedPos = { ...pos };
    this.selectedId = piece.id;
    this.legal = this.deps.state.movesFor(pos);
    const v = this.deps.pieces.get(piece.id);
    v?.setSelected(true);
    this.refreshHints();
    this.events.emit('selection:changed', { pos: this.selectedPos, pieceId: this.selectedId });
  }

  clearSelection(): void {
    if (this.selectedId) {
      const v = this.deps.pieces.get(this.selectedId);
      v?.setSelected(false);
    }
    this.selectedPos = null;
    this.selectedId = null;
    this.legal = [];
    this.refreshHints();
    this.events.emit('selection:changed', { pos: null, pieceId: null });
  }

  // ─── Tile visuals ─────────────────────────────────────────
  private refreshHints(): void {
    this.deps.board.clearAllHints();

    // Passive Shield Wall halos (lowest priority)
    for (const key of this.shieldWallSet) {
      const [r, c] = key.split(',').map(Number);
      this.deps.board.getTile({ row: r, col: c })?.setHint('shieldwall');
    }

    const phase = this.deps.state.phase;

    // Charge phase: highlight every legal dash square in amber
    if (phase === 'charge' || phase === 'chargeAfterPress') {
      for (const t of this.deps.state.chargeTargets) {
        this.deps.board.getTile(t)?.setHint('charge');
      }
      if (this.deps.state.chargePos) {
        this.deps.board.getTile(this.deps.state.chargePos)?.setHint('selected');
      }
      return;
    }

    // Selection + legal target hints
    if (this.selectedPos) {
      this.deps.board.getTile(this.selectedPos)?.setHint('selected');
      for (const t of this.legal) {
        if (t.kind === 'rangedCapture') this.deps.board.getTile(t.pos)?.setHint('ranged');
        else if (t.kind === 'capture') this.deps.board.getTile(t.pos)?.setHint('attack');
        else this.deps.board.getTile(t.pos)?.setHint('move');
      }
    }

    // Hover (only if not already a stronger hint)
    if (this.hovered) {
      const tile = this.deps.board.getTile(this.hovered);
      if (tile && tile.getHint() === 'none') tile.setHint('hover');
    }
  }

  /** Called by Game on turn changes to clear any latent selection. */
  onTurnChanged(_player: Player): void {
    this.clearSelection();
  }

  dispose(): void {
    this.unsubs.forEach((u) => u());
    this.events.clear();
  }
}

