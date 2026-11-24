import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const originalDemoProxy = Object.fromEntries([
  ['waretwin', process.env.WARETWIN_PORT || '8101'],
  ['rftwin', process.env.RFTWIN_PORT || '8102'],
].map(([id, port]) => [`/open-demo-api/${id}`, {
  target: `http://127.0.0.1:${port}`, ws: true, xfwd: true,
  rewrite: (path: string) => path.replace(`/open-demo-api/${id}`, ''),
}]));

export default defineConfig({
  plugins: [react()],
  assetsInclude: ['**/*.glb', '**/*.gltf', '**/*.urdf', '**/*.xacro', '**/*.wasm'],
  server: {
    port: 3000,
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
    port: 3000,
    host: '0.0.0.0',
    allowedHosts: true
  }
});
