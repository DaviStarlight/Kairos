/**
 * Application entry. Bootstraps the Engine, hides the loader, and exposes
 * `window.kairos` in dev for tinkering from the console.
 */
import './style.css';
import { Engine } from '@core/Engine';

declare global {
  // eslint-disable-next-line no-var
  var kairos: { engine: Engine } | undefined;
}

async function bootstrap(): Promise<void> {
  const canvas = document.getElementById('render-canvas') as HTMLCanvasElement | null;
  const hudRoot = document.getElementById('ui-root') as HTMLElement | null;
  const loader = document.getElementById('loader');
  if (!canvas || !hudRoot) throw new Error('Missing #render-canvas or #ui-root');

  const engine = await Engine.create({
    canvas,
    hudRoot,
    assets: [], // add { kind: 'model', id, url } entries to preload GLBs
    onLoadProgress: (l, t) => {
      // place to drive a progress bar; loader is a simple flash for now
      if (loader) loader.dataset.progress = `${l}/${t}`;
    },
  });

  engine.start();

  // Fade the loader once the first frame is on screen.
  requestAnimationFrame(() => {
    if (loader) {
      loader.classList.add('fade-out');
      window.setTimeout(() => loader.remove(), 500);
    }
  });

  if (import.meta.env.DEV) {
    globalThis.kairos = { engine };
    // eslint-disable-next-line no-console
    console.info('[Kairos] engine ready — `window.kairos.engine`');
  }
}

bootstrap().catch((err) => {
  console.error('[Kairos] fatal bootstrap error', err);
  const loader = document.getElementById('loader');
  if (loader) loader.innerHTML = `<div class="text-red-400 font-display tracking-widest">FAILED TO START</div>`;
});
