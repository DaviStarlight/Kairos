/**
 * TurnManager — thin facade over GameState's phase machine.
 *
 * The full state machine lives in GameState; this class exists to give the
 * surrounding architecture (input, AI, multiplayer, HUD) a stable lifecycle
 * surface (`start()`, `restart()`, `resign()`) without forcing them to know
 * the internal phase vocabulary.
 *
 * All gameplay events are re-exposed via `events` — same payloads as
 * `GameState.events` so subscribers can use either interchangeably.
 */
import type { GameState, GameEvents } from './GameState';
import type { EventBus } from '@core/EventBus';

export class TurnManager {
  readonly events: EventBus<GameEvents>;

  constructor(private readonly state: GameState) {
    this.events = state.events;
  }

  /** Boots the match — emits the initial 'turn:advanced' / 'state:changed'. */
  start(): void {
    this.state.reset();
  }

  /** Full reset back to the opening position. */
  restart(): void {
    this.state.reset();
  }

  resign(): void {
    this.state.resign();
  }
}

