/**
 * A single board tile — owns its mesh, hover/select state, and visual transitions.
 *
 * Visual states (priority high → low):
 *   ranged  > attack > charge > move > selected > shieldwall > hover > idle
 *
 * Hint vocabulary is specific to Kairos:
 *   - 'move'        : a legal non-capture target square (green)
 *   - 'attack'      : a legal displacement capture (red)
 *   - 'ranged'      : a Toxotes ranged-attack target (amethyst)
 *   - 'charge'      : a Hippeus follow-up dash square (amber)
 *   - 'selected'    : the currently selected piece's square (gold)
 *   - 'shieldwall'  : Hoplitas linked in a Shield Wall (sky blue, passive halo)
 *   - 'hover'       : hovered tile (subtle)
 */
import {
  BoxGeometry,
  Color,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  type Scene,
} from 'three';
import gsap from 'gsap';
import type { Position } from '@domain/index';
import { COLORS } from '@utils/color';

export type TileHint =
  | 'none'
  | 'hover'
  | 'selected'
  | 'move'
  | 'attack'
  | 'ranged'
  | 'charge'
  | 'shieldwall';

export interface TileOptions {
  pos: Position;
  worldX: number;
  worldZ: number;
  tileSize: number;
  isLight: boolean;
}

export class Tile {
  readonly mesh: Mesh<BoxGeometry, MeshStandardMaterial>;
  readonly pos: Position;
  readonly baseColor: Color;
  private hint: TileHint = 'none';
  private hoverLift = 0;

  constructor(opts: TileOptions) {
    this.pos = opts.pos;
    this.baseColor = (opts.isLight ? COLORS.tileLight : COLORS.tileDark).clone();

    const geom = new BoxGeometry(opts.tileSize * 0.97, 0.18, opts.tileSize * 0.97);
    geom.translate(0, -0.09, 0);

    const mat = new MeshStandardMaterial({
      color: this.baseColor,
      roughness: opts.isLight ? 0.55 : 0.7,
      metalness: opts.isLight ? 0.08 : 0.18,
      emissive: new Color('#000000'),
      emissiveIntensity: 0,
    });

    this.mesh = new Mesh(geom, mat);
    this.mesh.position.set(opts.worldX, 0, opts.worldZ);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.mesh.userData.tile = this;
    this.mesh.userData.pos = opts.pos;
    this.mesh.name = `Tile(r${opts.pos.row}c${opts.pos.col})`;
  }

  addTo(parent: Scene | Object3D): void {
    parent.add(this.mesh);
  }

  setHint(hint: TileHint): void {
    if (this.hint === hint) return;
    this.hint = hint;
    this.applyHintVisual();
  }

  getHint(): TileHint {
    return this.hint;
  }

  private applyHintVisual(): void {
    const mat = this.mesh.material;
    let emissive = new Color('#000000');
    let intensity = 0;
    let lift = 0;

    switch (this.hint) {
      case 'ranged':
        emissive = COLORS.tileRanged;
        intensity = 1.05;
        lift = 0.05;
        break;
      case 'attack':
        emissive = COLORS.tileAttack;
        intensity = 0.95;
        lift = 0.045;
        break;
      case 'charge':
        emissive = COLORS.tileCharge;
        intensity = 0.85;
        lift = 0.04;
        break;
      case 'move':
        emissive = COLORS.tileMove;
        intensity = 0.6;
        lift = 0.03;
        break;
      case 'selected':
        emissive = COLORS.tileSelect;
        intensity = 0.85;
        lift = 0.055;
        break;
      case 'shieldwall':
        emissive = COLORS.tileShieldWall;
        intensity = 0.35;
        lift = 0.012;
        break;
      case 'hover':
        emissive = COLORS.tileHover;
        intensity = 0.3;
        lift = 0.022;
        break;
      default:
        emissive = new Color('#000000');
        intensity = 0;
        lift = 0;
    }

    gsap.to(mat.emissive, {
      r: emissive.r,
      g: emissive.g,
      b: emissive.b,
      duration: 0.25,
      ease: 'power2.out',
    });
    gsap.to(mat, { emissiveIntensity: intensity, duration: 0.25, ease: 'power2.out' });
    gsap.to(this, {
      hoverLift: lift,
      duration: 0.25,
      ease: 'power2.out',
      onUpdate: () => {
        this.mesh.position.y = this.hoverLift;
      },
    });
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshStandardMaterial).dispose();
  }
}

