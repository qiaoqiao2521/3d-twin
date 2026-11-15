import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  assetsInclude: ['**/*.glb', '**/*.gltf', '**/*.urdf', '**/*.xacro', '**/*.wasm'],
  server: {
    port: 3000,
    host: '0.0.0.0',
    allowedHosts: true,
    hmr: false,
    watch: {
      ignored: ['**/public/**', '**/.playwright-cli/**', '**/dist/**']
    }
  },
  preview: {
    port: 3000,
    host: '0.0.0.0',
    allowedHosts: true
  }
});
