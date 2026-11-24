import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { originalPublicAssets } from './scripts/public-assets-plugin.mjs';

const originalDemoProxy = Object.fromEntries([
  ['waretwin', process.env.WARETWIN_PORT || '8101'],
  ['rftwin', process.env.RFTWIN_PORT || '8102'],
].map(([id, port]) => [`/open-demo-api/${id}`, {
  target: `http://127.0.0.1:${port}`, ws: true, xfwd: true,
  rewrite: (path: string) => path.replace(`/open-demo-api/${id}`, ''),
}]));

export default defineConfig({
  plugins: [react(), originalPublicAssets()],
  build: { copyPublicDir: false },
  // Upstream HTML and corresponding source are static downloadable originals,
  // not extra host entry points with dependencies to merge into this app.
  optimizeDeps: { entries: ['index.html'] },
  assetsInclude: ['**/*.glb', '**/*.gltf', '**/*.urdf', '**/*.xacro', '**/*.wasm'],
  server: {
    port: 5197,
    host: '0.0.0.0',
    allowedHosts: true,
    hmr: false,
    proxy: originalDemoProxy,
    watch: {
      ignored: ['**/public/**', '**/.playwright-cli/**', '**/dist/**', '**/.cache/**']
    }
  },
  preview: {
    proxy: originalDemoProxy,
    port: 5197,
    host: '0.0.0.0',
    allowedHosts: true
  }
});
