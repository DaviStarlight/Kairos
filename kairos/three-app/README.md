# Kairos 3D ♟️

> A cinematic, production-grade **3D board game** built with **Three.js**, **TypeScript** and **Vite** — designed as a portfolio-quality foundation for tactical / turn-based games.

```
   ┌──────────────────────────────────────────────────────────┐
   │   KAIROS                                  FPS  60         │
   │                                                          │
   │            ▓░▓░▓░▓░                                       │
   │            ░▓░▓░▓░▓     ←  procedural 8×8 board          │
   │            ▓░▓░▓░▓░         glow hints · soft shadows    │
   │            ░▓░▓░▓░▓         ACES tone mapping            │
   │                                                          │
   │   Selected: White Queen · e4         RMB orbit · wheel   │
   └──────────────────────────────────────────────────────────┘
```

---

## ✨ Features

- 🎬 **Cinematic renderer** — ACES filmic tone mapping, PCF soft shadows, procedural HDRI-like environment, atmospheric fog.
- 🎥 **Smooth-damped isometric camera** — orbit with right-mouse, zoom with wheel, frame-rate-independent damping.
- ♟ **Procedural 8×8 board** — alternating tiles with beveled geometry, decorative frame, hover/select/move/attack hints, GSAP-driven emissive transitions.
- ⚔ **Full gameplay loop** — chess-inspired ruleset, turn manager, capture animations, end-game detection, ready for richer rules.
- 🤖 **Pluggable AI** — random-policy reference implementation behind a clean `AIPlayer` interface; swap for minimax / MCTS / worker engines without touching the rest of the codebase.
- 🌐 **Multiplayer-ready** — `MultiplayerTransport` interface mirrors the shape of a real WS/WebRTC backend.
- 🎯 **Raycast input system** — high-level `tile:hover` / `tile:click` events on an `EventBus`, decoupled from rendering.
- 🎨 **Riot/Blizzard-style HUD** — minimal Tailwind UI: turn indicator, selected piece, coordinates, FPS, game-over banner.
- 📦 **Asset pipeline** — `AssetManager` + GLTF loader with auto-centering, auto-scaling and shadow setup; preload manifest support.
- 🧹 **Clean architecture** — logic and rendering separated, strict TypeScript, path aliases, dispose registries, no game state mutated from render code.

## 🧰 Stack

| Layer        | Tech                           |
| ------------ | ------------------------------ |
| Rendering    | [three](https://threejs.org/) ^0.165 |
| Animation    | [gsap](https://greensock.com/gsap/) ^3.12 |
| Loaders      | `three/examples/jsm/GLTFLoader` |
| UI           | Tailwind CSS ^3.4 + vanilla DOM |
| Language     | TypeScript ^5.4 (strict mode)  |
| Bundler      | Vite ^5.3                      |
| Quality      | ESLint + Prettier              |

## 🚀 Quick start

```bash
cd kairos/three-app
npm install
npm run dev
```

Open <http://localhost:5173>. The scene boots, the loader fades out, and you can start moving pieces. White is human, Black is a random-policy AI by default.

### Scripts

| Command           | Purpose                                  |
| ----------------- | ---------------------------------------- |
| `npm run dev`     | Vite dev server with HMR                 |
| `npm run build`   | Type-check (`tsc --noEmit`) + production build |
| `npm run preview` | Preview the production build locally     |
| `npm run lint`    | ESLint over `src/`                       |
| `npm run format`  | Prettier write                           |

### Controls

| Input        | Action                       |
| ------------ | ---------------------------- |
| **LMB**      | Select / move piece          |
| **RMB drag** | Orbit camera                 |
| **Wheel**    | Zoom (clamped)               |

## 🗂 Project structure

```
src/
├── ai/               # AIPlayer interface + RandomAI reference impl
├── animations/       # GSAP timelines for screen-level FX (camera impact, etc.)
├── assets/           # AssetManager + GLTF pipeline
│   └── models/       # drop .glb files here
├── board/            # Board factory (frame + tiles)
├── camera/           # CameraController (damped orbit, isometric defaults)
├── core/             # Engine bootstrap, GameLoop, Time, EventBus
├── engine/           # reserved for future low-level primitives (ECS, replay…)
├── entities/         # Tile, Piece (logical state + visual mesh)
├── game/             # GameState, MoveRules, TurnManager, Game orchestrator
├── grid/             # Grid math + GridUtils helpers
├── input/            # InputManager (raycaster + hover/click event bus)
├── lights/           # LightingSetup (key/hemi/rim rig)
├── multiplayer/      # MultiplayerTransport interface + LocalTransport stub
├── renderer/         # Renderer (WebGLRenderer with production defaults)
├── scene/            # SceneManager, Environment (fog, env map, base disc)
├── shaders/          # reserved for custom ShaderMaterials
├── systems/          # SelectionSystem (cross-cutting gameplay system)
├── types/            # cross-cutting domain types
├── ui/               # HUD (Tailwind overlay)
└── utils/            # math, color, dispose helpers
```

## 🏛 Architecture

```
                ┌─────────────┐
                │   main.ts   │  (entry, mounts Engine, fades loader)
                └──────┬──────┘
                       ▼
   ┌────────────────────────────────────────────────────┐
   │                     Engine                         │
   │  • Renderer · SceneManager · CameraController     │
   │  • AssetManager · GameLoop                         │
   │  • owns ONE Game                                   │
   └──────────────────────────┬─────────────────────────┘
                              ▼
   ┌────────────────────────────────────────────────────┐
   │                      Game                          │
   │  Logic ─────────────────────────────  Visuals      │
   │  GameState   ◄──── TurnManager ──►   Board (Tiles) │
   │  MoveRules                            Pieces       │
   │      ▲                                  ▲          │
   │      │       SelectionSystem ───────────┘          │
   │      │            ▲                                │
   │      └────────────┴──── InputManager (raycast)     │
   │                                                    │
   │   AIPlayer ◄── pluggable opponent (workers later)  │
   │   MultiplayerTransport ◄── pluggable network       │
   └────────────────────────────────────────────────────┘
```

### Design rules enforced across the codebase

1. **Logic never touches the renderer.** `GameState`/`MoveRules` are pure data; they have zero THREE imports.
2. **Render mirrors state.** Visual entities (`Tile`, `Piece`) react to state changes via systems and events.
3. **Single-responsibility files.** Every module has one purpose; no 800-line god classes.
4. **Frame-rate independence.** All smoothing uses Freya Holmer's `damp()` formula or GSAP timelines, never raw `lerp(a, b, 0.1)`.
5. **Disposers everywhere.** Every subsystem exposes `dispose()`; GPU resources are released cleanly.
6. **Events, not polling.** Systems communicate over typed `EventBus` channels.
7. **Path aliases.** `@core`, `@game`, `@entities`, … keep imports flat and refactor-friendly.
8. **Strict TS.** `noImplicitAny`, `noUnusedLocals`, `noImplicitReturns`, `strict` — all on.

## 🎮 Replacing the placeholder pieces with real models

1. Drop your `.glb` files into `src/assets/models/`.
2. Register them in `main.ts`:
   ```ts
   await Engine.create({
     canvas, hudRoot,
     assets: [
       { kind: 'model', id: 'king-white',
         url: '/src/assets/models/king-white.glb',
         options: { targetSize: 0.95, recenter: true, shadows: true } },
       // …
     ],
   });
   ```
3. In `Piece.ts` (or a new `PieceFactory`), call `assets.getModel(id)` and add it to `this.root` instead of the procedural geometry. Everything else (selection glow, hover, animations) just works because the procedural mesh and the GLB share the same `Piece.root` parent.

## 🛣 Roadmap

- [ ] **Pieces 2.0** — GLB models + idle animations via `AnimationMixer`.
- [ ] **Post-processing** — `EffectComposer` with bloom + SSAO + outline pass.
- [ ] **Particle FX** — capture sparks, selection rings, victory confetti.
- [ ] **Worker AI** — move heavy search off the main thread.
- [ ] **Multiplayer transport** — WebSocket implementation of `MultiplayerTransport`.
- [ ] **Replay system** — append-only event log on top of `TurnManager`.
- [ ] **Sound** — Howler.js with positional audio for moves & captures.
- [ ] **Mobile UX** — touch-first orbit, tap-tap-to-move with safe areas.

## 📸 Screenshots

> _Run `npm run dev` and capture from <http://localhost:5173>. Place images under `docs/` and reference them here._
>
> - `docs/screen-board.png` — full board with selection hints
> - `docs/screen-capture.png` — capture animation mid-flight
> - `docs/screen-endgame.png` — victory banner

## 🤝 Contributing / Extending

Each system is intentionally small and replaceable. Common extensions:

- **New piece type** → add a `PieceKind`, extend `buildPieceMesh()` in `entities/Piece.ts`, add a rule branch in `game/MoveRules.ts`.
- **New visual hint** → extend `TileHint` in `entities/Tile.ts`, register a color in `utils/color.ts`.
- **New AI** → implement `AIPlayer` in `ai/`, pass it to `new Game({ ai })`.
- **New transport** → implement `MultiplayerTransport`, wire intents through `TurnManager.submitMove()`.

## 📄 License

MIT © 2025 — Kairos contributors.
