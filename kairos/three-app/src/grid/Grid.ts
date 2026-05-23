/**
 * Grid ↔ World conversion utilities for an 8×8 Kairos board.
 *
 * Domain convention (matches the engine):
 *   row 0  = rank 1 = Gold home rank
 *   row 7  = rank 8 = Silver home rank
 *   col 0  = file 'a'   col 7 = file 'h'
 *
 * World mapping:
 *   +X = col   (files a→h grow with +X)
 *   +Z = row   (Gold side at -Z, Silver side at +Z)
 *   +Y = up
 *
 * The board is centered at the origin.
 */
import { Vector3 } from 'three';
import type { Position } from '@domain/index';

export interface GridConfig {
  readonly size: number;
  readonly tileSize: number;
}

export class Grid {
  readonly size: number;
  readonly tileSize: number;
  /** Half-extent used to center the board around (0,0,0). */
  readonly halfExtent: number;

  constructor(cfg: GridConfig) {
    this.size = cfg.size;
    this.tileSize = cfg.tileSize;
    this.halfExtent = (cfg.size * cfg.tileSize) / 2 - cfg.tileSize / 2;
  }

  inBounds(p: Position): boolean {
    return p.row >= 0 && p.col >= 0 && p.row < this.size && p.col < this.size;
  }

  /** Convert a board position to a world-space position (tile center). */
  toWorld(p: Position, y = 0): Vector3 {
    return new Vector3(
      p.col * this.tileSize - this.halfExtent,
      y,
      p.row * this.tileSize - this.halfExtent,
    );
  }

  /** Snap a world-space position to its nearest board position. */
  fromWorld(v: Vector3): Position {
    return {
      col: Math.round((v.x + this.halfExtent) / this.tileSize),
      row: Math.round((v.z + this.halfExtent) / this.tileSize),
    };
  }

  /** Chebyshev (king) distance. */
  distance(a: Position, b: Position): number {
    return Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));
  }

  /** Iterate every position on the board. */
  *all(): IterableIterator<Position> {
    for (let row = 0; row < this.size; row++) {
      for (let col = 0; col < this.size; col++) yield { row, col };
    }
  }

  static equals(a: Position, b: Position): boolean {
    return a.row === b.row && a.col === b.col;
  }

  static key(p: Position): string {
    return `${p.row},${p.col}`;
  }
}

