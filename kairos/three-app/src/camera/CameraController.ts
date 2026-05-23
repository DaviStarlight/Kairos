/**
 * Cinematic isometric camera with smooth-damped orbit controls.
 *
 * Two operating modes:
 *  - **Free orbit**: right/middle-mouse drag rotates the camera around the board,
 *    wheel zooms. This is always available.
 *  - **Auto focus**: `focusOnPlayer('gold' | 'silver')` reframes the camera over
 *    the matching home rank with a graceful sweep — used by local 2P mode so
 *    each player sees the board "from their side" when their turn starts.
 *
 * Both modes feed into the same spherical-damped update so the user can still
 * grab the camera mid-sweep without fighting the animation.
 */
import { PerspectiveCamera, Spherical, Vector3 } from 'three';
import gsap from 'gsap';
import { clamp, damp } from '@utils/math';
import type { Player } from '@domain/index';

export interface CameraConfig {
  fov?: number;
  near?: number;
  far?: number;
  /** Initial spherical radius (zoom distance). */
  radius?: number;
  /** Initial polar angle (0=top-down, PI/2=horizon). */
  polar?: number;
  /** Initial azimuth angle. */
  azimuth?: number;
  minRadius?: number;
  maxRadius?: number;
  minPolar?: number;
  maxPolar?: number;
}

export class CameraController {
  readonly camera: PerspectiveCamera;
  readonly target = new Vector3(0, 0, 0);

  private spherical = new Spherical(12, Math.PI / 3.4, Math.PI / 4);
  private desired = this.spherical.clone();

  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private rotateSpeed = 0.005;

  private readonly minRadius: number;
  private readonly maxRadius: number;
  private readonly minPolar: number;
  private readonly maxPolar: number;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    cfg: CameraConfig = {},
  ) {
    this.camera = new PerspectiveCamera(
      cfg.fov ?? 38,
      canvas.clientWidth / canvas.clientHeight || 1,
      cfg.near ?? 0.1,
      cfg.far ?? 200,
    );

    if (cfg.radius != null) this.spherical.radius = cfg.radius;
    if (cfg.polar != null) this.spherical.phi = cfg.polar;
    if (cfg.azimuth != null) this.spherical.theta = cfg.azimuth;

    this.minRadius = cfg.minRadius ?? 6;
    this.maxRadius = cfg.maxRadius ?? 22;
    this.minPolar = cfg.minPolar ?? 0.25;
    this.maxPolar = cfg.maxPolar ?? Math.PI / 2.15;

    this.desired.copy(this.spherical);
    this.applyImmediate();
    this.bind();
  }

  setAspect(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Frame-rate independent damped update of camera orbit. */
  update(dt: number): void {
    this.spherical.radius = damp(this.spherical.radius, this.desired.radius, 10, dt);
    this.spherical.phi = damp(this.spherical.phi, this.desired.phi, 12, dt);
    this.spherical.theta = damp(this.spherical.theta, this.desired.theta, 12, dt);
    this.applyImmediate();
  }

  private applyImmediate(): void {
    const v = new Vector3().setFromSpherical(this.spherical).add(this.target);
    this.camera.position.copy(v);
    this.camera.lookAt(this.target);
  }

  private bind(): void {
    const el = this.canvas;
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('pointercancel', this.onPointerUp);
    el.addEventListener('pointerleave', this.onPointerUp);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private onPointerDown = (e: PointerEvent) => {
    // Right or middle button orbits; left is reserved for game input.
    if (e.button === 0) return;
    this.dragging = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.canvas.setPointerCapture(e.pointerId);
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.dragging) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.desired.theta -= dx * this.rotateSpeed;
    this.desired.phi = clamp(this.desired.phi - dy * this.rotateSpeed, this.minPolar, this.maxPolar);
  };

  private onPointerUp = (e: PointerEvent) => {
    this.dragging = false;
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const scale = Math.exp(e.deltaY * 0.0012);
    this.desired.radius = clamp(this.desired.radius * scale, this.minRadius, this.maxRadius);
  };

  /**
   * Smoothly reframe the camera over the given player's home side of the board.
   * Gold is at row 0 (south, +Z direction in world space), silver at row 7 (north, -Z).
   *
   * Implementation: we tween `desired.theta` (azimuth) along the shortest arc,
   * then the per-frame damp pulls the actual spherical to match. Polar and
   * radius receive gentle "settle" values for cinematic effect.
   */
  focusOnPlayer(player: Player, opts: { immediate?: boolean; duration?: number } = {}): void {
    // World convention (see Grid.ts): Gold home is at -Z, Silver home is at +Z.
    // Three's Spherical: theta=0 → camera on +Z axis (Silver side). So Silver
    // view = π/4 (camera over +Z, looking back at the board); Gold view = π/4
    // rotated 180° around up so the camera sits over -Z (Gold side).
    const silverTheta = Math.PI / 4;
    const goldTheta = silverTheta + Math.PI;
    const targetTheta = player === 'gold' ? goldTheta : silverTheta;
    const polar = Math.PI / 3.2;
    const radius = clamp(this.spherical.radius, this.minRadius + 1, this.maxRadius - 1);

    // Take the shortest angular path (avoid spinning the long way around).
    const cur = this.desired.theta;
    let delta = targetTheta - cur;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const finalTheta = cur + delta;

    if (opts.immediate) {
      this.desired.theta = finalTheta;
      this.desired.phi = polar;
      this.desired.radius = radius;
      this.spherical.copy(this.desired);
      this.applyImmediate();
      return;
    }

    gsap.killTweensOf(this.desired);
    gsap.to(this.desired, {
      theta: finalTheta,
      phi: polar,
      radius,
      duration: opts.duration ?? 1.4,
      ease: 'power3.inOut',
    });
  }

  /** Snapshot helpers for HUD / debug. */
  getAzimuth(): number {
    return this.spherical.theta;
  }

  dispose(): void {
    const el = this.canvas;
    el.removeEventListener('pointerdown', this.onPointerDown);
    el.removeEventListener('pointermove', this.onPointerMove);
    el.removeEventListener('pointerup', this.onPointerUp);
    el.removeEventListener('pointercancel', this.onPointerUp);
    el.removeEventListener('pointerleave', this.onPointerUp);
    el.removeEventListener('wheel', this.onWheel);
  }
}
