/**
 * Tiny typed event bus. Decouples systems without pulling in a full ECS framework.
 */
import type { Unsubscribe } from '@domain/index';

type Handler<T> = (payload: T) => void;

export class EventBus<TEvents extends Record<string, unknown>> {
  private readonly handlers = new Map<keyof TEvents, Set<Handler<any>>>();

  on<K extends keyof TEvents>(event: K, handler: Handler<TEvents[K]>): Unsubscribe {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler);
    return () => set!.delete(handler);
  }

  emit<K extends keyof TEvents>(event: K, payload: TEvents[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const h of set) h(payload);
  }

  clear(): void {
    this.handlers.clear();
  }
}
