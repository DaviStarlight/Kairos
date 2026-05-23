/**
 * Wraps THREE.WebGLRenderer with production-grade defaults:
 *  - antialias, high-DPI capped at 2x
 *  - ACES filmic tone mapping with linear color space
 *  - PCFSoft shadow maps
 *  - automatic resize handling
 */
import { ACESFilmicToneMapping, PCFSoftShadowMap, SRGBColorSpace, WebGLRenderer } from 'three';

export interface RendererOptions {
  canvas: HTMLCanvasElement;
}

export class Renderer {
  readonly gl: WebGLRenderer;
  private resizeObserver: ResizeObserver | null = null;
  private listeners: Array<(w: number, h: number) => void> = [];

  constructor({ canvas }: RendererOptions) {
    this.gl = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.gl.outputColorSpace = SRGBColorSpace;
    this.gl.toneMapping = ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.05;
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = PCFSoftShadowMap;
    this.gl.setClearColor('#0b0d12', 1);

    this.applyCanvasSize();
    this.resizeObserver = new ResizeObserver(() => this.applyCanvasSize());
    this.resizeObserver.observe(canvas);
    window.addEventListener('resize', this.onWindowResize);
  }

  onResize(fn: (w: number, h: number) => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  private onWindowResize = () => this.applyCanvasSize();

  private applyCanvasSize(): void {
    const canvas = this.gl.domElement;
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    this.gl.setSize(w, h, false);
    for (const l of this.listeners) l(w, h);
  }

  dispose(): void {
    this.resizeObserver?.disconnect();
    window.removeEventListener('resize', this.onWindowResize);
    this.gl.dispose();
  }
}
