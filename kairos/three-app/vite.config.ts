import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  server: { port: 5173, open: true },
  build: { target: 'es2022', sourcemap: true },
  resolve: {
    alias: {
      '@': r('./src'),
      '@core': r('./src/core'),
      '@engine': r('./src/engine'),
      '@game': r('./src/game'),
      '@entities': r('./src/entities'),
      '@systems': r('./src/systems'),
      '@scene': r('./src/scene'),
      '@renderer': r('./src/renderer'),
      '@camera': r('./src/camera'),
      '@lights': r('./src/lights'),
      '@board': r('./src/board'),
      '@grid': r('./src/grid'),
      '@input': r('./src/input'),
      '@ui': r('./src/ui'),
      '@assets': r('./src/assets'),
      '@shaders': r('./src/shaders'),
      '@animations': r('./src/animations'),
      '@multiplayer': r('./src/multiplayer'),
      '@ai': r('./src/ai'),
      '@utils': r('./src/utils'),
      '@domain': r('./src/types'),
    },
  },
});
