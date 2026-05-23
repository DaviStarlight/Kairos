/**
 * Cinematic lighting rig:
 *  - Hemisphere fill for soft ambient color
 *  - Key directional light with PCF soft shadows
 *  - Rim point light for visual depth
 */
import { DirectionalLight, HemisphereLight, PointLight, Scene } from 'three';

export interface LightHandles {
  hemi: HemisphereLight;
  key: DirectionalLight;
  rim: PointLight;
}

export function setupLighting(scene: Scene): LightHandles {
  const hemi = new HemisphereLight('#a4c8ff', '#1a1208', 0.55);
  hemi.position.set(0, 20, 0);
  scene.add(hemi);

  const key = new DirectionalLight('#fff3d6', 2.4);
  key.position.set(8, 14, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 40;
  key.shadow.camera.left = -10;
  key.shadow.camera.right = 10;
  key.shadow.camera.top = 10;
  key.shadow.camera.bottom = -10;
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 4;
  scene.add(key);
  scene.add(key.target);

  const rim = new PointLight('#7dd3fc', 25, 30, 2);
  rim.position.set(-6, 5, -6);
  scene.add(rim);

  return { hemi, key, rim };
}
