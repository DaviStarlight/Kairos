/**
 * Atmospheric environment: subtle fog, gradient sky-like background, soft ground catcher.
 */
import {
  CircleGeometry,
  Color,
  DataTexture,
  EquirectangularReflectionMapping,
  FloatType,
  Fog,
  Mesh,
  MeshStandardMaterial,
  RGBAFormat,
  Scene,
  ShadowMaterial,
} from 'three';

/** Procedurally generate a tiny HDRI-like gradient used as scene.environment. */
function makeGradientEnvMap(): DataTexture {
  const w = 4;
  const h = 32;
  const data = new Float32Array(w * h * 4);
  const top = new Color('#5b7da8');
  const bot = new Color('#1a1410');
  for (let y = 0; y < h; y++) {
    const t = y / (h - 1);
    const c = top.clone().lerp(bot, t);
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      data[i + 0] = c.r;
      data[i + 1] = c.g;
      data[i + 2] = c.b;
      data[i + 3] = 1;
    }
  }
  const tex = new DataTexture(data, w, h, RGBAFormat, FloatType);
  tex.mapping = EquirectangularReflectionMapping;
  tex.needsUpdate = true;
  return tex;
}

export function setupEnvironment(scene: Scene): void {
  scene.background = new Color('#0b0d12');
  scene.fog = new Fog('#0b0d12', 18, 60);
  scene.environment = makeGradientEnvMap();

  // Soft ground disc that only catches shadows.
  const ground = new Mesh(
    new CircleGeometry(40, 64),
    new ShadowMaterial({ opacity: 0.35, color: '#000000' }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.001;
  ground.receiveShadow = true;
  scene.add(ground);

  // Faint stone-ish base under the board for visual weight.
  const base = new Mesh(
    new CircleGeometry(8, 64),
    new MeshStandardMaterial({
      color: '#11151c',
      roughness: 0.95,
      metalness: 0.1,
    }),
  );
  base.rotation.x = -Math.PI / 2;
  base.position.y = -0.05;
  base.receiveShadow = true;
  scene.add(base);
}
