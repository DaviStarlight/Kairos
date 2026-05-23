/**
 * AssetManager — caches loaded assets, tracks progress, supports preload manifests.
 *
 * For the procedural starter scene there are zero required assets, so calling
 * `preload([])` resolves immediately. Add entries to the manifest as you bring in
 * real GLBs/textures, and `await assetManager.preload(manifest)` before showing UI.
 */
import { Group, Texture, TextureLoader } from 'three';
import { loadModel, type LoadModelOptions } from './ModelLoader';

export type AssetKind = 'model' | 'texture';

export interface AssetEntry {
  kind: AssetKind;
  id: string;
  url: string;
  options?: LoadModelOptions;
}

export interface PreloadProgress {
  loaded: number;
  total: number;
  ratio: number;
  lastId: string;
}

export class AssetManager {
  private readonly models = new Map<string, Group>();
  private readonly textures = new Map<string, Texture>();
  private readonly textureLoader = new TextureLoader();

  async preload(
    entries: AssetEntry[],
    onProgress?: (p: PreloadProgress) => void,
  ): Promise<void> {
    let loaded = 0;
    const total = entries.length;

    for (const e of entries) {
      try {
        if (e.kind === 'model') {
          const m = await loadModel(e.url, e.options);
          this.models.set(e.id, m);
        } else {
          const t = await this.textureLoader.loadAsync(e.url);
          this.textures.set(e.id, t);
        }
      } catch (err) {
        console.warn(`[AssetManager] failed to load ${e.kind} "${e.id}" -> using fallback`, err);
      }
      loaded++;
      onProgress?.({ loaded, total, ratio: total ? loaded / total : 1, lastId: e.id });
    }
  }

  /** Get a clone of a preloaded model (always clone before adding to the scene). */
  getModel(id: string): Group | null {
    const m = this.models.get(id);
    return m ? (m.clone(true) as Group) : null;
  }

  getTexture(id: string): Texture | null {
    return this.textures.get(id) ?? null;
  }

  dispose(): void {
    this.models.clear();
    this.textures.forEach((t) => t.dispose());
    this.textures.clear();
  }
}
