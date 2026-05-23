/**
 * Multiplayer transport stub. Implements the same `submit`/`onRemoteAction` shape
 * a real WS/WebRTC backend would use, so wiring it in later is a one-file change.
 *
 * The payload is intentionally opaque (`unknown`) — encoding will be settled when
 * the protocol is designed (likely JSON-encoded GameEvents from GameState).
 */
import type { Player } from '@domain/index';

export interface RemoteAction {
  player: Player;
  kind: 'move' | 'charge' | 'skipCharge' | 'promote' | 'press' | 'declinePress' | 'resign';
  payload: unknown;
}

export interface MultiplayerTransport {
  readonly localPlayer: Player;
  submit(action: RemoteAction): Promise<void>;
  onRemoteAction(handler: (action: RemoteAction) => void): () => void;
  connect(): Promise<void>;
  disconnect(): void;
}

/** No-op local transport used in single-player demos. */
export class LocalTransport implements MultiplayerTransport {
  constructor(readonly localPlayer: Player = 'gold') {}
  async submit(_action: RemoteAction): Promise<void> {
    /* no-op */
  }
  onRemoteAction(_handler: (action: RemoteAction) => void): () => void {
    return () => {};
  }
  async connect(): Promise<void> {
    /* no-op */
  }
  disconnect(): void {
    /* no-op */
  }
}

