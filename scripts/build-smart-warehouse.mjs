import { spawnSync } from 'node:child_process';
import { copyFile, readFile, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const upstream = resolve(root, 'integrations/smart-warehouse/upstream');
const output = resolve(root, 'public/integrations/smart-warehouse');
const compiler = resolve(upstream, 'node_modules/vue-tsc/bin/vue-tsc.js');

try {
  await access(compiler);
} catch {
  console.error('仓储依赖尚未安装。请在仓库根目录运行 npm ci，或 npm run install:warehouse。');
  process.exit(1);
}

const checked = spawnSync(process.execPath, [compiler, '--noEmit'], { cwd: upstream, stdio: 'inherit' });
if (checked.error || checked.status !== 0) process.exit(checked.status || 1);

const { build } = await import(pathToFileURL(resolve(upstream, 'node_modules/vite/dist/node/index.js')).href);
await build({
  root: upstream,
  configFile: resolve(upstream, 'vite.config.ts'),
  base: './',
  plugins: [{
    name: 'warehouse-local-resource-base',
    enforce: 'pre',
    transform(code, id) {
      if (!id.replaceAll('\\', '/').endsWith('/src/core/WarehouseScene.ts')) return;
      // Adapt only deployment paths. Keep every checked-in upstream source byte intact.
      const request = "fetch('/smart_warehouse.glb?v=2.3.0', { signal })";
      const parse = "parseAsync(data, '/')";
      if (!code.includes(request) || !code.includes(parse)) {
        throw new Error('Smart Warehouse 资源入口已变化，请核对固定修订后更新路径适配。');
      }
      return {
        code: code.replace(request, "fetch(new URL('smart_warehouse.glb?v=2.3.0', document.baseURI), { signal })")
          .replace(parse, "parseAsync(data, new URL('./', document.baseURI).href)"),
        map: null
      };
    }
  }],
  build: { outDir: output, emptyOutDir: true }
});

// Ship the upstream permission notice with the compiled app, not only with its sources.
await copyFile(resolve(upstream, 'LICENSE'), resolve(output, 'LICENSE.txt'));
await copyFile(resolve(root, 'integrations/smart-warehouse/source.json'), resolve(output, 'source.json'));
const source = JSON.parse(await readFile(resolve(root, 'integrations/smart-warehouse/source.json'), 'utf8'));
console.log(`Smart Warehouse ${source.revision.slice(0, 7)} 已构建，原场景与本地模型位于 ${output}`);
