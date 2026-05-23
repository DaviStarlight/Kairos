/**
 * InputManager — owns the THREE.Raycaster and emits high-level pointer events
 * targeting board tiles. Decoupled from gameplay so multiple systems can listen.
 */
import { Camera, Object3D, Raycaster, Vector2 } from 'three';
import { EventBus } from '@core/EventBus';
import type { Position } from '@domain/index';

export interface InputEvents extends Record<string, unknown> {
  'tile:hover': { pos: Position | null };
  'tile:click': { pos: Position };
}

export interface InputDeps {
  canvas: HTMLCanvasElement;
  camera: Camera;
  /** Function returning current pickable meshes (board tiles). */
  pickables: () => Object3D[];
}

export class InputManager {
  readonly events = new EventBus<InputEvents>();
  private raycaster = new Raycaster();
  private ndc = new Vector2();
  private hovered: Position | null = null;
  private downX = 0;
  private downY = 0;
  private downTime = 0;
  private enabled = true;

  constructor(private deps: InputDeps) {
    const el = deps.canvas;
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointerleave', this.onLeave);
  }

  setEnabled(v: boolean): void {
    this.enabled = v;
    if (!v) this.updateHover(null);
  }

  private toNdc(e: PointerEvent): void {
    const rect = this.deps.canvas.getBoundingClientRect();
    this.ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private pick(): Position | null {
    this.raycaster.setFromCamera(this.ndc, this.deps.camera);
    const intersects = this.raycaster.intersectObjects(this.deps.pickables(), false);
    if (intersects.length === 0) return null;
    const pos = intersects[0].object.userData.pos as Position | undefined;
    return pos ?? null;
  }

  private onMove = (e: PointerEvent) => {
    if (!this.enabled) return;
    this.toNdc(e);
    this.updateHover(this.pick());
  };

  private onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    this.downX = e.clientX;
    this.downY = e.clientY;
    this.downTime = performance.now();
  };

  private onUp = (e: PointerEvent) => {
    if (!this.enabled || e.button !== 0) return;
    const dx = e.clientX - this.downX;
    const dy = e.clientY - this.downY;
    const dist2 = dx * dx + dy * dy;
    const dt = performance.now() - this.downTime;
    // Filter out drags so orbit/pan doesn't trigger clicks. The thresholds
    // are deliberately generous (≈12px / 800ms) so brief mouse jitter during
    // a normal click doesn't get suppressed.
    if (dist2 > 144 || dt > 800) return;
    this.toNdc(e);
    const pos = this.pick();
    if (pos) this.events.emit('tile:click', { pos });
  };

  private onLeave = () => this.updateHover(null);

  private updateHover(next: Position | null): void {
    const same =
      (next === null && this.hovered === null) ||
      (next !== null &&
        this.hovered !== null &&
        next.row === this.hovered.row &&
        next.col === this.hovered.col);
    if (same) return;
    this.hovered = next;
    this.events.emit('tile:hover', { pos: next });
  }

  dispose(): void {
    const el = this.deps.canvas;
    el.removeEventListener('pointermove', this.onMove);
    el.removeEventListener('pointerdown', this.onDown);
    el.removeEventListener('pointerup', this.onUp);
    el.removeEventListener('pointerleave', this.onLeave);
    this.events.clear();
  }
}

