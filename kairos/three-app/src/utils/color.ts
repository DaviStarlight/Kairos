/**
 * Kairos visual palette — Greek strategist atmosphere.
 * Tied to the brand colors documented in `docs/11-UX-UI.md`.
 */
import { Color } from 'three';

export const COLORS = {
  // ── Atmosphere ─────────────────────────────────────────────
  bg: new Color('#0a0b18'),
  fog: new Color('#101632'),

  // ── Board surface (warm marble vs night stone) ─────────────
  tileLight: new Color('#e9d8a8'),     // pale aged ivory
  tileDark: new Color('#1c2342'),      // deep lapis night

  // ── Tile hint states ───────────────────────────────────────
  tileHover: new Color('#cfd8ea'),
  tileSelect: new Color('#f0c040'),     // Gold accent (selection)
  tileMove: new Color('#3fb27f'),       // Greek seafoam, legal move
  tileAttack: new Color('#e74c3c'),     // crimson, displacement capture
  tileRanged: new Color('#9b59b6'),     // amethyst, toxotes shot
  tileCharge: new Color('#f39c12'),     // amber, hippeus dash
  tileShieldWall: new Color('#3498db'), // sky-blue, Shield Wall halo

  // ── Faction colors ─────────────────────────────────────────
  playerGold: new Color('#f0c040'),     // primary Gold
  playerGoldGlow: new Color('#ffd87a'),
  playerSilver: new Color('#a8b8cc'),   // primary Silver
  playerSilverGlow: new Color('#dbe6f4'),

  // ── Material accents ───────────────────────────────────────
  exhausted: new Color('#f39c12'),      // amber, exhaustion token
  archonCrest: new Color('#d4a843'),    // antique gold for crests
  cape: new Color('#7e2a2a'),           // dark blood-red Spartan cape
  spearShaft: new Color('#3a2a1a'),     // dark olive wood
  bronze: new Color('#a07a3a'),
  steel: new Color('#5b6577'),
} as const;

