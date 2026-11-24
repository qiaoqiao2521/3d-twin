import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  publicDir: false,
  define: { __BUILD_TIME__: JSON.stringify('hub integration') },
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL('../../../public/twins/automotive/auto-atlas', import.meta.url)),
    emptyOutDir: false,
  },
});
