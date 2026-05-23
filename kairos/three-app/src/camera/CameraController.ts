/**
 * Cinematic isometric camera with smooth-damped orbit controls.
 * No external controls dependency — small, well-behaved, and tailored for a fixed board.
 */
import { PerspectiveCamera, Spherical, Vector3 } from 'three';
import { clamp, damp } from '@utils/math';

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
