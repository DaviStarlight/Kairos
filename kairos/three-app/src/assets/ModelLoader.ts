/**
 * Optional GLTF loader pipeline. Auto-centers, auto-scales to a target size,
 * enables shadows. Wrap your imports with this for consistent model behavior.
 */
import { Box3, Group, Mesh, Object3D, Vector3 } from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

const loader = new GLTFLoader();

export interface LoadModelOptions {
  /** target max bounding box size in world units; the model will be uniformly scaled to match */
  targetSize?: number;
  /** center the model on its bounding box so its origin sits at the base center */
  recenter?: boolean;
  /** enable cast/receive shadows on every mesh */
  shadows?: boolean;
}

export async function loadModel(url: string, opts: LoadModelOptions = {}): Promise<Group> {
  const gltf: GLTF = await loader.loadAsync(url);
  const root = gltf.scene as Group;
  const { targetSize, recenter = true, shadows = true } = opts;

  if (shadows) {
    root.traverse((o: Object3D) => {
      const m = o as Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
  }

  const box = new Box3().setFromObject(root);
  const size = new Vector3();
  const center = new Vector3();
  box.getSize(size);
  box.getCenter(center);

  if (recenter) {
    // Translate so the model sits centered on x/z with y=0 at the base.
    root.position.x -= center.x;
    root.position.z -= center.z;
    root.position.y -= box.min.y;
  }

  if (targetSize && targetSize > 0) {
    const maxAxis = Math.max(size.x, size.y, size.z);
    if (maxAxis > 0) root.scale.multiplyScalar(targetSize / maxAxis);
  }

  return root;
}
