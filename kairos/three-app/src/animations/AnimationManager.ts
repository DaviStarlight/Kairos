/**
 * AnimationManager — thin façade over GSAP for game-side timelines (camera shakes,
 * intro sequences, screen flashes). Per-piece animations live on `Piece` itself.
 */
import gsap from 'gsap';
import type { Camera } from 'three';

export class AnimationManager {
  /** Quick directional camera "bump" on impacts. */
  cameraImpact(camera: Camera, intensity = 0.15): void {
    const start = camera.position.clone();
    const tl = gsap.timeline();
    tl.to(camera.position, {
      x: start.x + (Math.random() - 0.5) * intensity,
      y: start.y + (Math.random() - 0.5) * intensity,
      z: start.z + (Math.random() - 0.5) * intensity,
      duration: 0.06,
      ease: 'power1.out',
    });
    tl.to(camera.position, { x: start.x, y: start.y, z: start.z, duration: 0.2, ease: 'power2.out' });
  }
}
