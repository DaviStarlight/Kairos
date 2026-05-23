/**
 * Time / clock abstraction used by the game loop.
 * Decoupled from THREE.Clock so the loop can be unit-tested.
 */
export class Time {
  private last = performance.now();
  /** seconds elapsed since the previous frame */
  delta = 0;
  /** total seconds since start */
  elapsed = 0;
  /** rolling FPS (exponential moving average) */
  fps = 60;

  tick(): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000); // clamp to avoid jumps
    this.last = now;
    this.delta = dt;
    this.elapsed += dt;
    if (dt > 0) {
      const instFps = 1 / dt;
      this.fps = this.fps * 0.92 + instFps * 0.08;
    }
  }
}
