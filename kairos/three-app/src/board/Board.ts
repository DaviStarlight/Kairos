/**
 * Board — procedurally generates the 8×8 Kairos battleground.
 *
 * Visual layers:
 *   - 64 tiles with light/dark alternation (marble vs lapis)
 *   - decorative metal frame with a thin gold inlay (Greek "key" feel)
 *   - rank (1..8) and file (a..h) labels embossed on the frame edges
 *
 * Pickable surface = tile meshes only.
 */
import {
  BoxGeometry,
  CanvasTexture,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  type Object3D,
} from 'three';
import { Grid } from '@grid/Grid';
import { Tile } from '@entities/Tile';
import type { Position } from '@domain/index';
import { COLORS } from '@utils/color';

export interface BoardOptions {
  grid: Grid;
  parent: Object3D;
}

export class Board {
  readonly grid: Grid;
  readonly root = new Group();
  private readonly tiles = new Map<string, Tile>();

  constructor(opts: BoardOptions) {
    this.grid = opts.grid;
    this.root.name = 'Board';
    opts.parent.add(this.root);

    this.buildTiles();
    this.buildFrame();
    this.buildLabels();
  }

  // ─── Geometry ─────────────────────────────────────────────
  private buildTiles(): void {
    for (const pos of this.grid.all()) {
      // Light if (row + col) is even when measured from a1 (col 0, row 0).
      const isLight = (pos.row + pos.col) % 2 === 1;
      const world = this.grid.toWorld(pos);
      const tile = new Tile({
        pos,
        worldX: world.x,
        worldZ: world.z,
        // Use the full tile size so adjacent tiles touch edge-to-edge — any
        // gap (even 1-2%) creates dead pixels where the raycaster misses both
        // neighbours, which the player feels as inconsistent click detection.
        // Visual separation comes from the light/dark colour alternation.
        tileSize: this.grid.tileSize,
        isLight,
      });
      tile.addTo(this.root);
      this.tiles.set(Grid.key(pos), tile);
    }
  }

  private buildFrame(): void {
    const size = this.grid.size * this.grid.tileSize;
    const frameThickness = 0.42;
    const frameHeight = 0.24;
    const span = size + frameThickness * 2;
    const half = size / 2;

    const dark = new MeshStandardMaterial({
      color: '#0e1428',
      metalness: 0.55,
      roughness: 0.32,
    });
    const inlay = new MeshStandardMaterial({
      color: COLORS.archonCrest,
      metalness: 0.85,
      roughness: 0.22,
      emissive: COLORS.archonCrest,
      emissiveIntensity: 0.05,
    });

    const makeBar = (w: number, d: number, x: number, z: number) => {
      const bar = new Mesh(new BoxGeometry(w, frameHeight, d), dark);
      bar.position.set(x, -frameHeight / 2 + 0.02, z);
      bar.receiveShadow = true;
      this.root.add(bar);
    };
    const makeInlay = (w: number, d: number, x: number, z: number) => {
      const bar = new Mesh(new BoxGeometry(w, 0.04, d), inlay);
      bar.position.set(x, 0.005, z);
      this.root.add(bar);
    };

    // outer dark frame
    makeBar(span, frameThickness, 0, +half + frameThickness / 2);
    makeBar(span, frameThickness, 0, -half - frameThickness / 2);
    makeBar(frameThickness, span, +half + frameThickness / 2, 0);
    makeBar(frameThickness, span, -half - frameThickness / 2, 0);

    // thin gold inlay just outside the play surface
    const inlayWidth = 0.06;
    const inlayOffset = half + 0.04;
    makeInlay(size + inlayWidth * 2, inlayWidth, 0, +inlayOffset);
    makeInlay(size + inlayWidth * 2, inlayWidth, 0, -inlayOffset);
    makeInlay(inlayWidth, size + inlayWidth * 2, +inlayOffset, 0);
    makeInlay(inlayWidth, size + inlayWidth * 2, -inlayOffset, 0);
  }

  // ─── Rank / File labels ───────────────────────────────────
  private buildLabels(): void {
    const tile = this.grid.tileSize;
    const half = (this.grid.size * tile) / 2;
    const yOffset = 0.012; // just above frame inlay

    // Files (a..h) along the +Z and -Z edges
    for (let col = 0; col < this.grid.size; col++) {
      const label = String.fromCharCode(97 + col);
      const world = this.grid.toWorld({ row: 0, col });
      const south = this.makeTextMesh(label);
      south.position.set(world.x, yOffset, -half - 0.25);
      this.root.add(south);
      const north = this.makeTextMesh(label);
      north.position.set(world.x, yOffset, +half + 0.25);
      north.rotation.y = Math.PI;
      this.root.add(north);
    }
    // Ranks (1..8) along the ±X edges
    for (let row = 0; row < this.grid.size; row++) {
      const label = String(row + 1);
      const world = this.grid.toWorld({ row, col: 0 });
      const west = this.makeTextMesh(label);
      west.position.set(-half - 0.25, yOffset, world.z);
      west.rotation.y = Math.PI / 2;
      this.root.add(west);
      const east = this.makeTextMesh(label);
      east.position.set(+half + 0.25, yOffset, world.z);
      east.rotation.y = -Math.PI / 2;
      this.root.add(east);
    }
  }

  private makeTextMesh(text: string): Mesh {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#f0c040';
    ctx.font = 'bold 78px "Cinzel", "Times New Roman", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, size / 2, size / 2 + 4);

    const tex = new CanvasTexture(canvas);
    tex.anisotropy = 4;
    const mat = new MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    });
    const mesh = new Mesh(new PlaneGeometry(0.36, 0.36), mat);
    mesh.rotation.x = -Math.PI / 2;
    return mesh;
  }

  // ─── API ──────────────────────────────────────────────────
  getTile(pos: Position): Tile | undefined {
    return this.tiles.get(Grid.key(pos));
  }

  forEachTile(fn: (t: Tile) => void): void {
    this.tiles.forEach(fn);
  }

  /** Used by raycaster — flat list of meshes. */
  getPickables(): Object3D[] {
    return [...this.tiles.values()].map((t) => t.mesh);
  }

  clearAllHints(): void {
    this.tiles.forEach((t) => t.setHint('none'));
  }

  dispose(): void {
    this.tiles.forEach((t) => t.dispose());
    this.tiles.clear();
  }
}

