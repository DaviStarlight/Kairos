/**
 * AIPlayer — phase-aware random opponent.
 *
 * The `act()` contract is "look at the current phase, take ONE legal decision".
 * Game.maybeRunAi() invokes `act()` whenever it's the AI's turn and animations
 * are idle, then animations fire from the event bus and trigger maybeRunAi()
 * again — so a single AI turn naturally unfolds across multiple act() calls
 * (mainMove → pressDecision → optional press → optional charge → promotion).
 */
import type { PieceType, Player, Position, MoveTarget } from '@domain/index';
import type { GameState } from '@game/GameState';
import { PROMOTABLE_TYPES } from '@domain/index';

export interface AIPlayer {
  readonly player: Player;
  /** Take one legal action in the current phase. */
  act(state: GameState): Promise<void>;
}

export class RandomAI implements AIPlayer {
  constructor(readonly player: Player) {}

  async act(state: GameState): Promise<void> {
    if (state.currentPlayer !== this.player) return;
    switch (state.phase) {
      case 'mainMove':
      case 'pressMove':
        this.playMove(state);
        return;
      case 'pressDecision':
        // 35% chance to press if available
        if (state.canPressNow && Math.random() < 0.35) state.startPress();
        else state.declinePress();
        return;
      case 'charge':
      case 'chargeAfterPress': {
        const targets = state.chargeTargets;
        if (targets.length && Math.random() < 0.7) {
          state.executeCharge(pickRandom(targets));
        } else {
          state.skipCharge();
        }
        return;
      }
      case 'promotion':
      case 'promotionAfterPress':
        state.promote(pickRandom(PROMOTABLE_TYPES as readonly PieceType[]));
        return;
      default:
        return;
    }
  }

  private playMove(state: GameState): void {
    type Cand = { from: Position; target: MoveTarget };
    const cands: Cand[] = [];
    for (const { piece, pos } of state.allPieces()) {
      if (piece.owner !== this.player || piece.exhausted) continue;
      const moves = state.movesFor(pos);
      for (const t of moves) cands.push({ from: pos, target: t });
    }
    if (cands.length === 0) {
      // No legal move (shouldn't happen for current player); pass turn safely
      if (state.phase === 'pressMove') state.declinePress();
      return;
    }
    // Prefer captures slightly (60/40)
    const captures = cands.filter(
      (c) => c.target.kind === 'capture' || c.target.kind === 'rangedCapture',
    );
    const pool = captures.length && Math.random() < 0.6 ? captures : cands;
    const pick = pickRandom(pool);
    state.executeMove(pick.from, pick.target);
  }
}

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

