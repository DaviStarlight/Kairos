/**
 * Piece — the 3D entity for a single Kairos warrior.
 *
 * Each kind has a unique procedural silhouette inspired by the Greek
 * iconography described in `docs/11-UX-UI.md`:
 *
 *   Arconte   — tall capsule, crested Athenian helm, bordered cape
 *   Strategos — broad-shouldered general with vertical sword + cape
 *   Hoplita   — round Aspis shield on the side + short spear
 *   Toxotes   — lean archer holding a drawn bow (torus arc)
 *   Hippeus   — stylized horseman silhouette (mount + rider)
 *   Doríforo  — simple spearman with a tall vertical spear
 *
 * Visual states managed here:
 *   - faction tint (gold / silver) on body + accent (bronze / steel) on weapons
 *   - selection halo (emissive gold)
 *   - exhaustion overlay (amber halo + slight desaturation + slumped pose)
 *   - move/capture/ranged-arc animations
 */
import {
  BoxGeometry,
  CapsuleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  Object3D as Obj3D,
  RingGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import gsap from 'gsap';
import type { Piece as PieceData, PieceType, Player, Position } from '@domain/index';
import { COLORS } from '@utils/color';
import { Grid } from '@grid/Grid';

export interface PieceOptions {
  data: PieceData;
  pos: Position;
  grid: Grid;
  parent: Object3D;
}

interface FactionPalette {
  body: Color;
  glow: Color;
  weapon: Color;
  accent: Color;
}

function paletteFor(owner: Player): FactionPalette {
  if (owner === 'gold') {
    return {
      body: COLORS.playerGold.clone(),
      glow: COLORS.playerGoldGlow.clone(),
      weapon: COLORS.bronze.clone(),
      accent: COLORS.cape.clone(),
    };
  }
  return {
    body: COLORS.playerSilver.clone(),
    glow: COLORS.playerSilverGlow.clone(),
    weapon: COLORS.steel.clone(),
    accent: new Color('#2a3a55'),
  };
}

export class Piece {
  readonly root = new Group();
  readonly data: PieceData;
  pos: Position;
  private readonly grid: Grid;
  private readonly bodyMaterial: MeshStandardMaterial;
  private readonly exhaustRing: Mesh<RingGeometry, MeshStandardMaterial>;
  private idleSeed = Math.random() * Math.PI * 2;
  private selected = false;
  private restingY = 0;

  constructor(opts: PieceOptions) {
    this.data = opts.data;
    this.pos = opts.pos;
    this.grid = opts.grid;
    const pal = paletteFor(opts.data.owner);

    this.bodyMaterial = new MeshStandardMaterial({
      color: pal.body,
      metalness: opts.data.owner === 'gold' ? 0.55 : 0.65,
      roughness: opts.data.owner === 'gold' ? 0.35 : 0.45,
      emissive: new Color('#000000'),
      emissiveIntensity: 0,
    });
    const weaponMat = new MeshStandardMaterial({
      color: pal.weapon, metalness: 0.85, roughness: 0.32,
    });
    const accentMat = new MeshStandardMaterial({
      color: pal.accent, metalness: 0.2, roughness: 0.65,
    });
    const crestMat = new MeshStandardMaterial({
      color: COLORS.archonCrest, metalness: 0.6, roughness: 0.3,
    });

    const body = buildPieceMesh(opts.data.type, {
      body: this.bodyMaterial, weapon: weaponMat, accent: accentMat, crest: crestMat,
    });
    body.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = false;
      }
    });
    this.root.add(body);

    // Exhaustion halo (hidden by default, shown when exhausted)
    const ring = new Mesh(
      new RingGeometry(0.34, 0.42, 32),
      new MeshStandardMaterial({
        color: COLORS.exhausted,
        emissive: COLORS.exhausted,
        emissiveIntensity: 1.2,
        roughness: 0.4,
        metalness: 0,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.012;
    this.exhaustRing = ring;
    this.root.add(ring);

    const world = this.grid.toWorld(opts.pos);
    this.root.position.set(world.x, 0, world.z);
    this.root.userData.piece = this;
    this.root.userData.id = opts.data.id;
    this.root.name = `Piece(${opts.data.type},${opts.data.owner})`;

    // Gold faces +Z (toward silver side), Silver faces -Z.
    if (opts.data.owner === 'silver') this.root.rotation.y = Math.PI;

    opts.parent.add(this.root);
    if (opts.data.exhausted) this.setExhausted(true, /*instant*/ true);
  }

  // ─── Spatial sync ─────────────────────────────────────────
  syncToPos(pos: Position): void {
    this.pos = pos;
    const w = this.grid.toWorld(pos);
    this.root.position.set(w.x, this.restingY, w.z);
  }

  /** Animated grid hop (arcs through air, lands with a bounce). */
  animateTo(pos: Position, durationSec = 0.5): Promise<void> {
    this.pos = pos;
    const w = this.grid.toWorld(pos);
    const lift = 0.55;
    return new Promise((resolve) => {
      const tl = gsap.timeline({ onComplete: resolve });
      tl.to(this.root.position, { y: lift, duration: durationSec * 0.4, ease: 'power2.out' });
      tl.to(this.root.position, {
        x: w.x, z: w.z, duration: durationSec * 0.7, ease: 'power2.inOut',
      }, '<0.05');
      tl.to(this.root.position, { y: this.restingY, duration: durationSec * 0.4, ease: 'bounce.out' });
    });
  }

  /** Quick recoil animation (Toxotes shooting in place — no travel). */
  animateRangedAttack(targetWorld: Vector3): Promise<void> {
    const forward = targetWorld.clone().sub(this.root.position).setY(0).normalize();
    // Brief lean toward target, then snap back.
    const lookAngle = Math.atan2(forward.x, forward.z);
    const startY = this.root.rotation.y;
    return new Promise((resolve) => {
      const tl = gsap.timeline({ onComplete: () => {
        this.root.rotation.y = startY;
        resolve();
      } });
      tl.to(this.root.rotation, { y: lookAngle, duration: 0.18, ease: 'power3.out' });
      tl.to(this.root.position, { y: this.restingY + 0.06, duration: 0.08, ease: 'power1.out' });
      tl.to(this.root.position, { y: this.restingY, duration: 0.12, ease: 'power2.in' });
    });
  }

  /** Dying animation. Does NOT remove from scene; caller disposes. */
  animateCapture(): Promise<void> {
    return new Promise((resolve) => {
      const tl = gsap.timeline({ onComplete: resolve });
      tl.to(this.root.scale, { x: 1.15, y: 1.15, z: 1.15, duration: 0.12, ease: 'power2.out' });
      tl.to(this.root.position, { y: -0.6, duration: 0.42, ease: 'power2.in' });
      tl.to(this.root.scale, { x: 0, y: 0, z: 0, duration: 0.28, ease: 'power2.in' }, '<');
    });
  }

  // ─── Visual state ─────────────────────────────────────────
  setSelected(selected: boolean): void {
    if (this.selected === selected) return;
    this.selected = selected;
    const intensity = selected ? 0.7 : 0;
    const color = selected ? COLORS.tileSelect : new Color('#000000');
    gsap.to(this.bodyMaterial.emissive, {
      r: color.r, g: color.g, b: color.b, duration: 0.2,
    });
    gsap.to(this.bodyMaterial, { emissiveIntensity: intensity, duration: 0.2 });
  }

  setExhausted(exhausted: boolean, instant = false): void {
    this.data.exhausted = exhausted;
    const mat = this.exhaustRing.material;
    const tilt = exhausted ? -0.08 : 0;
    const opacity = exhausted ? 0.85 : 0;
    if (instant) {
      mat.opacity = opacity;
      this.root.rotation.x = tilt;
      return;
    }
    gsap.to(mat, { opacity, duration: 0.3 });
    gsap.to(this.root.rotation, { x: tilt, duration: 0.4, ease: 'power2.out' });
  }

  /** Subtle breathing idle bob. */
  updateIdle(elapsed: number): void {
    if (Math.abs(this.root.position.y - this.restingY) > 0.1) return;
    const amp = this.data.exhausted ? 0.005 : 0.018;
    const bob = Math.sin(elapsed * 1.4 + this.idleSeed) * amp;
    this.root.position.y = this.restingY + bob;
  }

  get owner(): Player {
    return this.data.owner;
  }

  get type(): PieceType {
    return this.data.type;
  }

  dispose(): void {
    this.root.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        const mat = m.material as MeshStandardMaterial | MeshStandardMaterial[];
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat.dispose();
      }
    });
    this.root.removeFromParent();
  }
}

// ─── Procedural geometry per piece type ──────────────────────
interface MatBundle {
  body: MeshStandardMaterial;
  weapon: MeshStandardMaterial;
  accent: MeshStandardMaterial;
  crest: MeshStandardMaterial;
}

function buildPieceMesh(type: PieceType, m: MatBundle): Object3D {
  const g = new Group();
  switch (type) {
    case 'archon': {
      // Pedestal + tall body + Athenian helm with high crest
      const base = new Mesh(new CylinderGeometry(0.42, 0.46, 0.14, 24), m.body);
      base.position.y = 0.07;
      const torso = new Mesh(new CapsuleGeometry(0.28, 0.7, 8, 16), m.body);
      torso.position.y = 0.62;
      const helm = new Mesh(new SphereGeometry(0.26, 24, 18), m.body);
      helm.position.y = 1.15;
      // Crest — flattened plume running front-to-back
      const crest = new Mesh(new BoxGeometry(0.08, 0.22, 0.46), m.crest);
      crest.position.y = 1.42;
      const cape = new Mesh(new BoxGeometry(0.45, 0.6, 0.04), m.accent);
      cape.position.set(0, 0.55, -0.22);
      g.add(base, cape, torso, helm, crest);
      break;
    }
    case 'strategos': {
      // Slightly shorter than Archon; vertical sword in front + cape
      const base = new Mesh(new CylinderGeometry(0.4, 0.44, 0.14, 22), m.body);
      base.position.y = 0.07;
      const torso = new Mesh(new CapsuleGeometry(0.26, 0.6, 8, 16), m.body);
      torso.position.y = 0.55;
      const helm = new Mesh(new SphereGeometry(0.22, 22, 16), m.body);
      helm.position.y = 1.0;
      const cape = new Mesh(new BoxGeometry(0.42, 0.55, 0.04), m.accent);
      cape.position.set(0, 0.5, -0.2);
      // Sword: cross-guard + blade
      const blade = new Mesh(new BoxGeometry(0.06, 0.75, 0.12), m.weapon);
      blade.position.set(0, 0.5, 0.34);
      const guard = new Mesh(new BoxGeometry(0.28, 0.06, 0.06), m.weapon);
      guard.position.set(0, 0.16, 0.34);
      const grip = new Mesh(new CylinderGeometry(0.045, 0.045, 0.18, 12), m.accent);
      grip.position.set(0, 0.08, 0.34);
      g.add(base, cape, torso, helm, grip, guard, blade);
      break;
    }
    case 'hoplite': {
      // Stocky soldier with a round Aspis on the side + short spear
      const base = new Mesh(new CylinderGeometry(0.38, 0.42, 0.12, 20), m.body);
      base.position.y = 0.06;
      const torso = new Mesh(new CapsuleGeometry(0.27, 0.42, 8, 14), m.body);
      torso.position.y = 0.45;
      const helm = new Mesh(new SphereGeometry(0.2, 20, 14), m.body);
      helm.position.y = 0.82;
      const aspis = new Mesh(new CylinderGeometry(0.28, 0.28, 0.06, 28), m.weapon);
      aspis.rotation.z = Math.PI / 2;
      aspis.position.set(-0.32, 0.45, 0);
      // Lambda marking on shield
      const lambda = new Mesh(new BoxGeometry(0.02, 0.18, 0.06), m.accent);
      lambda.position.set(-0.36, 0.45, 0);
      const spear = new Mesh(new CylinderGeometry(0.025, 0.025, 1.0, 8), m.weapon);
      spear.position.set(0.25, 0.55, 0);
      const tip = new Mesh(new ConeGeometry(0.05, 0.14, 8), m.weapon);
      tip.position.set(0.25, 1.1, 0);
      g.add(base, aspis, lambda, torso, helm, spear, tip);
      break;
    }
    case 'toxotes': {
      // Lean archer drawing a bow
      const base = new Mesh(new CylinderGeometry(0.34, 0.38, 0.12, 20), m.body);
      base.position.y = 0.06;
      const torso = new Mesh(new CapsuleGeometry(0.22, 0.55, 8, 14), m.body);
      torso.position.y = 0.5;
      const head = new Mesh(new SphereGeometry(0.18, 20, 14), m.body);
      head.position.y = 0.95;
      // Bow — half-torus arc, vertical, in front
      const bow = new Mesh(new TorusGeometry(0.32, 0.025, 8, 24, Math.PI), m.weapon);
      bow.rotation.z = -Math.PI / 2;
      bow.position.set(0.28, 0.55, 0);
      // Drawn string — thin box
      const string = new Mesh(new BoxGeometry(0.005, 0.6, 0.005), m.accent);
      string.position.set(0.28, 0.55, 0);
      // Quiver behind
      const quiver = new Mesh(new CylinderGeometry(0.07, 0.08, 0.35, 10), m.accent);
      quiver.position.set(-0.16, 0.7, -0.05);
      quiver.rotation.z = 0.25;
      g.add(base, quiver, torso, head, bow, string);
      break;
    }
    case 'hippeus': {
      // Horse silhouette + small rider
      const base = new Mesh(new CylinderGeometry(0.42, 0.46, 0.1, 22), m.body);
      base.position.y = 0.05;
      // Horse body
      const horseBody = new Mesh(new CapsuleGeometry(0.22, 0.55, 8, 14), m.body);
      horseBody.rotation.z = Math.PI / 2;
      horseBody.position.set(0, 0.42, 0);
      const horseChest = new Mesh(new SphereGeometry(0.24, 18, 14), m.body);
      horseChest.position.set(0.28, 0.42, 0);
      const horseNeck = new Mesh(new CapsuleGeometry(0.09, 0.32, 6, 10), m.body);
      horseNeck.position.set(0.38, 0.65, 0);
      horseNeck.rotation.z = 0.55;
      const horseHead = new Mesh(new BoxGeometry(0.22, 0.13, 0.14), m.body);
      horseHead.position.set(0.55, 0.82, 0);
      const mane = new Mesh(new BoxGeometry(0.05, 0.3, 0.08), m.accent);
      mane.position.set(0.35, 0.78, 0);
      mane.rotation.z = 0.4;
      // Legs (4)
      const makeLeg = (x: number, z: number) => {
        const leg = new Mesh(new CylinderGeometry(0.05, 0.05, 0.3, 8), m.body);
        leg.position.set(x, 0.22, z);
        return leg;
      };
      // Rider
      const rider = new Mesh(new CapsuleGeometry(0.13, 0.25, 6, 10), m.body);
      rider.position.set(-0.05, 0.78, 0);
      const riderHead = new Mesh(new SphereGeometry(0.13, 16, 12), m.body);
      riderHead.position.set(-0.05, 1.05, 0);
      const lance = new Mesh(new CylinderGeometry(0.022, 0.022, 0.95, 8), m.weapon);
      lance.position.set(0.15, 0.95, 0);
      lance.rotation.z = -0.5;
      g.add(
        base, horseBody, horseChest, horseNeck, horseHead, mane,
        makeLeg(0.22, 0.12), makeLeg(0.22, -0.12),
        makeLeg(-0.18, 0.12), makeLeg(-0.18, -0.12),
        rider, riderHead, lance,
      );
      break;
    }
    case 'doryphoros': {
      // Simple spearman with vertical spear
      const base = new Mesh(new CylinderGeometry(0.3, 0.34, 0.1, 18), m.body);
      base.position.y = 0.05;
      const body = new Mesh(new CapsuleGeometry(0.2, 0.45, 8, 12), m.body);
      body.position.y = 0.4;
      const head = new Mesh(new SphereGeometry(0.16, 18, 12), m.body);
      head.position.y = 0.78;
      const shield = new Mesh(new CylinderGeometry(0.18, 0.18, 0.04, 16), m.weapon);
      shield.rotation.z = Math.PI / 2;
      shield.position.set(-0.22, 0.42, 0);
      const spearShaft = new Mesh(new CylinderGeometry(0.022, 0.022, 1.05, 8), m.weapon);
      spearShaft.position.set(0.22, 0.55, 0);
      const spearTip = new Mesh(new ConeGeometry(0.05, 0.16, 8), m.weapon);
      spearTip.position.set(0.22, 1.16, 0);
      g.add(base, shield, body, head, spearShaft, spearTip);
      break;
    }
  }
  return g;
}

// Re-export base type Obj3D under its own name (used internally by tree-shaker friendliness).
export type { Obj3D };

