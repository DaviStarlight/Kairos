/**
 * Game — the Kairos orchestrator.
 *
 * Bridges three layers:
 *   1. authoritative state ............ GameState (phase machine + rules)
 *   2. interactive 3D scene ........... Board + Pieces + InputManager + SelectionSystem
 *   3. UI overlay ..................... HUD (phase chrome, captures, action buttons)
 *
 * Game owns the lookup table `pieces: Map<pieceId, Piece>` and reacts to the
 * GameState event bus to animate every mutation: regular moves arc and bounce,
 * Toxotes shots lean & recoil, charges chain a second hop, promotions swap the
 * 3D model, and exhaustion toggles the amber halo.
 *
 * The HUD is fed via a derived snapshot every `state:changed`. AI runs after a
 * brief delay whenever it's the AI's phase.
 */
import { Group, type Camera, type Object3D } from 'three';
import gsap from 'gsap';

import { Grid } from '@grid/Grid';
import { Board } from '@board/Board';
import { Piece } from '@entities/Piece';
import { GameState } from './GameState';
import { TurnManager } from './TurnManager';
import { SelectionSystem } from '@systems/SelectionSystem';
import { InputManager } from '@input/InputManager';
import { AnimationManager } from '@animations/AnimationManager';
import { HUD, type HudSnapshot } from '@ui/HUD';
import { RandomAI, type AIPlayer } from '@ai/AIPlayer';
import type { CameraController } from '@camera/CameraController';
import type { PieceType, Player, Position } from '@domain/index';
import { PIECE_NAMES } from '@domain/index';

export interface GameOptions {
  boardSize?: number;
  tileSize?: number;
  parent: Group;
  camera: Camera;
  /** Optional camera controller — required for the local 2P auto-rotate feature. */
  cameraController?: CameraController;
  canvas: HTMLCanvasElement;
  hudRoot: HTMLElement;
  /** Optional AI opponent — defaults to RandomAI for "silver". Pass null for hot-seat. */
  ai?: AIPlayer | null;
}

export class Game {
  readonly grid: Grid;
  readonly state: GameState;
  readonly turns: TurnManager;
  readonly board: Board;
  readonly input: InputManager;
  readonly hud: HUD;
  readonly anim = new AnimationManager();
  readonly selection: SelectionSystem;
  private readonly pieces = new Map<string, Piece>();
  private readonly piecesRoot = new Group();
  private ai: AIPlayer | null;
  private readonly defaultAi: AIPlayer;
  private readonly camera: Camera;
  private readonly cameraController: CameraController | null;
  private readonly unsubs: Array<() => void> = [];
  private animating = false;
  private aiPending = false;
  private lastFocusedPlayer: Player | null = null;

  constructor(opts: GameOptions) {
    this.camera = opts.camera;
    this.cameraController = opts.cameraController ?? null;
    this.grid = new Grid({ size: opts.boardSize ?? 8, tileSize: opts.tileSize ?? 1 });
    this.state = new GameState();
    this.turns = new TurnManager(this.state);

    this.board = new Board({ grid: this.grid, parent: opts.parent });
    this.piecesRoot.name = 'PiecesRoot';
    opts.parent.add(this.piecesRoot);

    this.hud = new HUD({
      root: opts.hudRoot,
      onPress: () => this.state.startPress(),
      onEndTurn: () => this.state.declinePress(),
      onSkipCharge: () => this.state.skipCharge(),
      onPromote: (t) => this.state.promote(t),
      onRestart: () => this.restart(),
      onResign: () => this.state.resign(),
      onToggleLocalTwoPlayer: (enabled) => this.setLocalTwoPlayer(enabled),
      onFocusCurrentPlayer: () => {
        this.cameraController?.focusOnPlayer(this.state.currentPlayer);
      },
    });

    this.input = new InputManager({
      canvas: opts.canvas,
      camera: opts.camera,
      pickables: () => this.board.getPickables(),
    });

    this.selection = new SelectionSystem({
      board: this.board,
      state: this.state,
      input: this.input,
      pieces: this.pieces,
    });

    this.defaultAi = opts.ai === undefined ? new RandomAI('silver') : (opts.ai ?? new RandomAI('silver'));
    this.ai = opts.ai === undefined ? this.defaultAi : opts.ai;
    this.wireEvents();
  }

  // ─── Local 2P / AI toggle ─────────────────────────────────
  /** Hot-seat mode: disables AI and triggers the auto camera flip per turn. */
  setLocalTwoPlayer(enabled: boolean): void {
    const newAi = enabled ? null : this.defaultAi;
    if (newAi === this.ai) return;
    this.ai = newAi;
    // Re-focus camera to current player when entering hot-seat mode.
    if (enabled) {
      this.focusCameraForCurrentPlayer();
    } else {
      this.maybeRunAi();
    }
    this.pushHud();
  }

  get isLocalTwoPlayer(): boolean {
    return this.ai === null;
  }

  private focusCameraForCurrentPlayer(immediate = false): void {
    if (!this.cameraController) return;
    if (!this.isLocalTwoPlayer) return;
    const p = this.state.currentPlayer;
    if (this.lastFocusedPlayer === p && !immediate) return;
    this.lastFocusedPlayer = p;
    this.cameraController.focusOnPlayer(p, { immediate });
  }

  // ─── Lifecycle ────────────────────────────────────────────
  start(): void {
    this.turns.start(); // emits state:changed + turn:advanced
    this.rebuildAllVisuals();
    this.pushHud();
    this.focusCameraForCurrentPlayer(true);
    this.maybeRunAi();
  }

  restart(): void {
    gsap.killTweensOf(this.piecesRoot);
    this.pieces.forEach((p) => p.dispose());
    this.pieces.clear();
    this.animating = false;
    this.aiPending = false;
    this.lastFocusedPlayer = null;
    this.input.setEnabled(true);
    this.turns.restart();
    this.rebuildAllVisuals();
    this.pushHud();
    this.focusCameraForCurrentPlayer(true);
    this.maybeRunAi();
  }

  update(_dt: number, elapsed: number): void {
    this.pieces.forEach((p) => p.updateIdle(elapsed));
  }

  dispose(): void {
    this.unsubs.forEach((u) => u());
    this.input.dispose();
    this.selection.dispose();
    this.pieces.forEach((p) => p.dispose());
    this.pieces.clear();
    this.board.dispose();
    gsap.killTweensOf(this.camera.position);
  }

  // ─── Wiring ───────────────────────────────────────────────
  private wireEvents(): void {
    const bus = this.state.events;

    this.unsubs.push(bus.on('state:changed', () => this.pushHud()));

    this.unsubs.push(
      bus.on('turn:advanced', ({ player }) => {
        this.selection.onTurnChanged(player);
        this.focusCameraForCurrentPlayer();
        this.maybeRunAi();
      }),
    );

    this.unsubs.push(
      bus.on('move:executed', (evt) => {
        void this.animateMove(evt.moverId, evt.fromPos, evt.toPos, evt.kind, evt.capturedId);
      }),
    );

    this.unsubs.push(
      bus.on('charge:executed', (evt) => {
        void this.animateMove(evt.moverId, evt.fromPos, evt.toPos, 'move', evt.capturedId);
      }),
    );

    this.unsubs.push(
      bus.on('piece:promoted', ({ pieceId, pos, toType }) => {
        this.rebuildPiece(pieceId, pos, toType);
      }),
    );

    this.unsubs.push(
      bus.on('piece:exhausted', ({ pieceId, exhausted }) => {
        this.pieces.get(pieceId)?.setExhausted(exhausted);
      }),
    );

    this.unsubs.push(
      bus.on('game:over', () => {
        this.input.setEnabled(false);
      }),
    );
  }

  // ─── Animation pipeline ───────────────────────────────────
  private async animateMove(
    moverId: string,
    fromPos: Position,
    toPos: Position,
    kind: 'move' | 'capture' | 'rangedCapture',
    capturedId: string | null,
  ): Promise<void> {
    const mover = this.pieces.get(moverId);
    if (!mover) return;

    this.animating = true;
    this.input.setEnabled(false);

    const tasks: Array<Promise<void>> = [];
    if (kind === 'rangedCapture') {
      const targetWorld = this.grid.toWorld(toPos);
      tasks.push(mover.animateRangedAttack(targetWorld));
    } else {
      tasks.push(mover.animateTo(toPos));
    }

    if (capturedId) {
      const cap = this.pieces.get(capturedId);
      if (cap) {
        const t = (kind === 'rangedCapture') ? 0.18 : 0.2;
        tasks.push(
          new Promise<void>((r) => window.setTimeout(r, t * 1000)).then(() =>
            cap.animateCapture().then(() => {
              cap.dispose();
              this.pieces.delete(capturedId);
            }),
          ),
        );
        this.anim.cameraImpact(this.camera, 0.18);
      }
    }
    // Defensive against from===to ambiguity (rangedCapture mover stays put).
    void fromPos;

    await Promise.all(tasks);
    this.animating = false;
    if (this.state.phase !== 'gameOver') {
      this.input.setEnabled(true);
    }
    this.maybeRunAi();
  }

  private rebuildPiece(pieceId: string, pos: Position, _toType: PieceType): void {
    const existing = this.pieces.get(pieceId);
    if (existing) existing.dispose();
    const piece = this.state.at(pos);
    if (!piece) return;
    const visual = new Piece({
      data: piece,
      pos,
      grid: this.grid,
      parent: this.piecesRoot,
    });
    this.pieces.set(pieceId, visual);
  }

  private rebuildAllVisuals(): void {
    this.pieces.forEach((p) => p.dispose());
    this.pieces.clear();
    for (const { piece, pos } of this.state.allPieces()) {
      const visual = new Piece({
        data: piece, pos, grid: this.grid, parent: this.piecesRoot,
      });
      this.pieces.set(piece.id, visual);
    }
  }

  // ─── HUD snapshot ─────────────────────────────────────────
  private pushHud(): void {
    const selectedId = this.selection.selectedPieceId;
    let selectedLabel = '—';
    let selectedTile: string | null = null;
    if (selectedId) {
      for (const { piece, pos } of this.state.allPieces()) {
        if (piece.id === selectedId) {
          selectedLabel = `${factionLabel(piece.owner)} ${PIECE_NAMES[piece.type]}`;
          selectedTile = this.state.posLabel(pos);
          break;
        }
      }
    }

    const snap: HudSnapshot = {
      currentPlayer: this.state.currentPlayer,
      turnNumber: this.state.turnNumber,
      phase: this.state.phase,
      canPress: this.state.canPressNow,
      capturedByGold: [...this.state.capturedByGold],
      capturedBySilver: [...this.state.capturedBySilver],
      selectedLabel,
      selectedTile,
      result: this.state.result,
      lastMove: this.state.moves.length
        ? this.state.moves[this.state.moves.length - 1]
        : null,
      moveHistory: this.state.moves.slice(-8),
      localTwoPlayer: this.isLocalTwoPlayer,
      canFocusCamera: this.cameraController !== null,
    };
    this.hud.render(snap);
  }

  // ─── AI loop ──────────────────────────────────────────────
  private maybeRunAi(): void {
    if (!this.ai) return;
    if (this.animating || this.aiPending) return;
    if (this.state.phase === 'gameOver') return;
    if (this.state.currentPlayer !== this.ai.player) return;
    this.aiPending = true;
    window.setTimeout(() => {
      this.aiPending = false;
      void this.ai!.act(this.state);
    }, 320);
  }

  get visuals(): { pieces: ReadonlyMap<string, Piece>; root: Object3D } {
    return { pieces: this.pieces, root: this.piecesRoot };
  }

  get localPlayer(): Player {
    return this.state.currentPlayer;
  }
}

function factionLabel(p: Player): string {
  return p === 'gold' ? 'Ouro' : 'Prata';
}

