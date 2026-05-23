/**
 * Engine — top-level bootstrap.
 *   - builds Renderer, SceneManager, CameraController
 *   - constructs the Game
 *   - drives the GameLoop and ticks every subsystem
 *
 * One Engine instance == one running app. The Engine is what `main.ts` instantiates.
 */
import { GameLoop } from './GameLoop';
import { Renderer } from '@renderer/Renderer';
import { SceneManager } from '@scene/SceneManager';
import { CameraController } from '@camera/CameraController';
import { AssetManager, type AssetEntry } from '@assets/AssetManager';
import { Game } from '@game/Game';

export interface EngineOptions {
  canvas: HTMLCanvasElement;
  hudRoot: HTMLElement;
  /** Optional asset manifest preloaded before the game starts. */
  assets?: AssetEntry[];
  onLoadProgress?: (loaded: number, total: number) => void;
}

export class Engine {
  readonly loop = new GameLoop();
  readonly renderer: Renderer;
  readonly sceneManager: SceneManager;
  readonly cameraController: CameraController;
  readonly assets = new AssetManager();
  readonly game: Game;

  private constructor(opts: EngineOptions) {
    this.renderer = new Renderer({ canvas: opts.canvas });
    this.sceneManager = new SceneManager();
    this.cameraController = new CameraController(opts.canvas, {
      radius: 13,
      polar: Math.PI / 3.2,
      // Open over the Gold side (-Z) since Gold moves first.
      azimuth: Math.PI / 4 + Math.PI,
    });

    // Keep camera aspect in sync with renderer.
    this.renderer.onResize((w, h) => this.cameraController.setAspect(w, h));

    this.game = new Game({
      parent: this.sceneManager.boardRoot,
      camera: this.cameraController.camera,
      cameraController: this.cameraController,
      canvas: opts.canvas,
      hudRoot: opts.hudRoot,
    });
  }

  static async create(opts: EngineOptions): Promise<Engine> {
    const engine = new Engine(opts);
    if (opts.assets && opts.assets.length > 0) {
      await engine.assets.preload(opts.assets, (p) => opts.onLoadProgress?.(p.loaded, p.total));
    } else {
      opts.onLoadProgress?.(1, 1);
    }
    return engine;
  }

  start(): void {
    this.game.start();

    // Master per-frame ticker
    this.loop.add((dt, elapsed) => {
      this.cameraController.update(dt);
      this.game.update(dt, elapsed);
      this.game.hud.tick(this.loop.time, dt);
      this.renderer.gl.render(this.sceneManager.scene, this.cameraController.camera);
    });

    this.loop.start();
  }

  dispose(): void {
    this.loop.stop();
    this.game.dispose();
    this.cameraController.dispose();
    this.renderer.dispose();
  }
}
