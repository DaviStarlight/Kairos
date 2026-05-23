/**
 * Render/update loop. Cleanly decoupled from THREE — callers register update fns.
 */
import { Time } from './Time';

export type UpdateFn = (dt: number, elapsed: number) => void;

export class GameLoop {
  readonly time = new Time();
  private updates: UpdateFn[] = [];
  private rafId = 0;
  private running = false;

  add(fn: UpdateFn): () => void {
    this.updates.push(fn);
    return () => {
      this.updates = this.updates.filter((u) => u !== fn);
    };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const frame = () => {
      if (!this.running) return;
      this.time.tick();
      for (const u of this.updates) u(this.time.delta, this.time.elapsed);
      this.rafId = requestAnimationFrame(frame);
    };
    this.rafId = requestAnimationFrame(frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }
}
