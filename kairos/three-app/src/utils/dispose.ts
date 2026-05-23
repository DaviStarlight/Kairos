/**
 * Generic disposer registry — call dispose() to tear everything down cleanly.
 */
import type { DisposableLike } from '@domain/index';

export class DisposeRegistry implements DisposableLike {
  private items: Array<() => void> = [];

  add(item: DisposableLike | (() => void)): void {
    this.items.push(typeof item === 'function' ? item : () => item.dispose());
  }

  dispose(): void {
    for (const fn of this.items.reverse()) {
      try {
        fn();
      } catch (e) {
        console.warn('[DisposeRegistry] disposer failed', e);
      }
    }
    this.items = [];
  }
}
