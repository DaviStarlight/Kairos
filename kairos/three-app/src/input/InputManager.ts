/**
 * InputManager — emits high-level pointer events targeting board tiles.
 *
 * Picking strategy (chosen for reliability over per-mesh raycasting):
 *   1. Intersect the pointer ray against the BOARD PLANE (y = 0).
 *   2. Convert the world-space hit point to a grid Position via Grid.fromWorld.
 *   3. Discard if the resulting position falls outside the 8×8 board.
 *
 * Why a plane instead of intersecting 64 tile meshes?
 *   - No dead zones between tiles, no chance of a lifted neighbour blocking
 *     the ray, no precision loss on grazing camera angles.
 *   - One mathematical intersection per pick is also cheaper than 64.
 *   - Pieces never block tile clicks (we don't ray-test them at all).
 *
 * Click vs drag separation:
 *   - Game input is always LEFT button. CameraController orbits with RIGHT
 *     and MIDDLE, so there is no orbit/click ambiguity in practice.
 *   - We still filter long drags (the user pressing-and-dragging a long way)
 *     using a generous distance threshold so accidental swipes don't fire.
 *   - On `pointerdown` we snapshot the picked tile; on `pointerup` we emit
 *     the click for THAT snapshot (fallback to the up-position pick), which
 *     matches every user's intuition ("the tile I pressed on is the one
 *     selected") even if the cursor wiggles a few pixels before release.
 */
import { Camera, Plane, Raycaster, Vector2, Vector3 } from 'three';
import { EventBus } from '@core/EventBus';
import type { Position } from '@domain/index';
import type { Grid } from '@grid/Grid';

export interface InputEvents extends Record<string, unknown> {
  'tile:hover': { pos: Position | null };
  'tile:click': { pos: Position };
}

export interface InputDeps {
  canvas: HTMLCanvasElement;
  camera: Camera;
  /** Board grid — used to convert plane hits to (row, col). */
  grid: Grid;
}

// Maximum cursor movement (in CSS pixels) between pointerdown and pointerup
// that still counts as a click. 24 px is intentionally large: forgiving of
// mouse jitter, touchpad noise, and slow/imprecise pointing devices.
const CLICK_DRAG_MAX_PX = 24;
const CLICK_DRAG_MAX_PX_SQ = CLICK_DRAG_MAX_PX * CLICK_DRAG_MAX_PX;
// Long press is still a click — up to 2 s. Beyond that the user has clearly
// abandoned the gesture.
const CLICK_MAX_MS = 2000;

export class InputManager {
  readonly events = new EventBus<InputEvents>();
  private readonly raycaster = new Raycaster();
  private readonly ndc = new Vector2();
  private readonly boardPlane = new Plane(new Vector3(0, 1, 0), 0);
  private readonly hitWorld = new Vector3();

  private hovered: Position | null = null;
  private enabled = true;

  private downX = 0;
  private downY = 0;
  private downTime = 0;
  private downPos: Position | null = null;

  constructor(private deps: InputDeps) {
    const el = deps.canvas;
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointerleave', this.onLeave);
    el.addEventListener('pointercancel', this.onCancel);
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

  /**
   * Pick a board position by intersecting the camera ray against the board
   * plane (y = 0) and snapping to the nearest grid cell. Returns null when
   * the ray misses the board entirely (e.g. parallel to the plane) or the
   * resulting cell falls outside the 8×8 grid.
   */
  private pick(): Position | null {
    this.raycaster.setFromCamera(this.ndc, this.deps.camera);
    const hit = this.raycaster.ray.intersectPlane(this.boardPlane, this.hitWorld);
    if (!hit) return null;
    const pos = this.deps.grid.fromWorld(hit);
    return this.deps.grid.inBounds(pos) ? pos : null;
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
    this.toNdc(e);
    this.downPos = this.pick();
  };

  private onUp = (e: PointerEvent) => {
    if (!this.enabled || e.button !== 0) return;
    const dx = e.clientX - this.downX;
    const dy = e.clientY - this.downY;
    const dist2 = dx * dx + dy * dy;
    const dt = performance.now() - this.downTime;
    const startPos = this.downPos;
    this.downPos = null;
    if (dist2 > CLICK_DRAG_MAX_PX_SQ || dt > CLICK_MAX_MS) return;
    this.toNdc(e);
    // Prefer the pointer's CURRENT position (where the user released) but
    // fall back to the pressed position if the release fell off the board.
    const pos = this.pick() ?? startPos ?? this.hovered;
    if (pos) this.events.emit('tile:click', { pos });
  };

  private onLeave = () => this.updateHover(null);

  private onCancel = () => {
    this.downPos = null;
  };

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
    el.removeEventListener('pointercancel', this.onCancel);
    this.events.clear();
  }
}

