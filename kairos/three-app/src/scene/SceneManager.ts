/**
 * SceneManager — owns the THREE.Scene plus environment, lights and root groups.
 * Acts as the single mounting point for all renderable game content.
 */
import { Group, Scene } from 'three';
import { setupEnvironment } from './Environment';
import { setupLighting, type LightHandles } from '@lights/LightingSetup';

export class SceneManager {
  readonly scene = new Scene();
  readonly boardRoot = new Group();
  readonly piecesRoot = new Group();
  readonly fxRoot = new Group();
  readonly lights: LightHandles;

  constructor() {
    this.boardRoot.name = 'BoardRoot';
    this.piecesRoot.name = 'PiecesRoot';
    this.fxRoot.name = 'FxRoot';

    setupEnvironment(this.scene);
    this.lights = setupLighting(this.scene);

    this.scene.add(this.boardRoot, this.piecesRoot, this.fxRoot);
  }
}
