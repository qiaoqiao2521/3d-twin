import { promises as fs } from 'node:fs';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { linkOrCopy } from './hardware/common.mjs';

/** Publish complete original archives without making a second on-disk copy.
 * Hardlinks are ordinary files in the deployable output. Cross-filesystem builds
 * fall back to copies; no cache path or symlink is required at deployment time.
 */
export function originalPublicAssets() {
  let config;
  const protectedRoots = ['hardware', 'draco', 'baselines', 'robotics_glb', 'open-demos', 'integrations/smart-warehouse', 'twins'];
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.map': 'application/json', '.xml': 'application/xml', '.urdf': 'application/xml', '.xacro': 'application/xml', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.wasm': 'application/wasm', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.pdf': 'application/pdf', '.gz': 'application/gzip', '.zip': 'application/zip', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.csv': 'text/csv; charset=utf-8', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.mp4': 'video/mp4', '.webm': 'video/webm' };
  function guard(root) {
    return async (request, response, next) => {
      let name;
      try { name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
      catch { response.statusCode = 400; response.end('Invalid asset path'); return; }
      const base = config.base.startsWith('/') ? config.base : '/';
      if (!name.startsWith(base)) { next(); return; }
      const relative = name.slice(base.length);
      if (!protectedRoots.some(prefix => relative === prefix || relative.startsWith(`${prefix}/`))) { next(); return; }
      let target = path.resolve(root, relative);
      if (!target.startsWith(`${path.resolve(root)}${path.sep}`)) { response.statusCode = 404; response.end('Original asset not found'); return; }
      try {
        let stat = await fs.stat(target);
        if (stat.isDirectory()) {
          target = path.join(target, 'index.html'); stat = await fs.stat(target);
          if (!name.endsWith('/')) { response.statusCode = 308; response.setHeader('Location', `${request.url.split('?')[0]}/${request.url.includes('?') ? `?${request.url.split('?').slice(1).join('?')}` : ''}`); response.end(); return; }
        }
        if (!stat.isFile()) throw new Error('Not a file');
        // Vite's default static middleware keeps reserved escapes such as %2B.
        // Serve exact decoded paths here so C++ filenames never become SPA HTML.
        const etag = `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
        response.setHeader('ETag', etag); response.setHeader('Cache-Control', 'no-cache'); response.setHeader('Accept-Ranges', 'bytes');
        response.setHeader('Content-Type', types[path.extname(target).toLowerCase()] || 'application/octet-stream');
        if (request.headers?.['if-none-match'] === etag) { response.statusCode = 304; response.end(); return; }
        let start = 0, end = stat.size - 1;
        const range = request.headers?.range;
        if (range) {
          const match = /^bytes=(\d*)-(\d*)$/.exec(range);
          if (match && (match[1] || match[2])) {
            if (!match[1]) start = Math.max(0, stat.size - Number(match[2]));
            else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); }
          }
          if (!match || start > end || start >= stat.size) { response.statusCode = 416; response.setHeader('Content-Range', `bytes */${stat.size}`); response.end(); return; }
          response.statusCode = 206; response.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
        }
        response.setHeader('Content-Length', Math.max(0, end - start + 1));
        if (request.method === 'HEAD' || stat.size === 0) { response.end(); return; }
        const stream = createReadStream(target, { start, end });
        stream.on('error', () => response.destroy()); response.on('close', () => stream.destroy()); stream.pipe(response);
      } catch { response.statusCode = 404; response.setHeader('Content-Type', 'text/plain; charset=utf-8'); response.end('Original asset not found'); }
    };
  }
  return {
    name: 'preserved-original-public-assets',
    configResolved(value) { config = value; },
    configureServer(server) { server.middlewares.use(guard(config.publicDir)); },
    configurePreviewServer(server) { server.middlewares.use(guard(path.resolve(config.root, config.build.outDir))); },
    async writeBundle() {
      const output = path.resolve(config.root, config.build.outDir);
      async function copy(relative = '') {
        const source = path.join(config.publicDir, relative);
        const entries = await fs.readdir(source, { withFileTypes: true });
        for (const entry of entries) {
          const child = path.join(relative, entry.name);
          if (entry.isDirectory()) await copy(child);
          else if (entry.isFile()) await linkOrCopy(path.join(config.publicDir, child), path.join(output, child));
          else throw new Error(`Public originals must be regular files: ${child}`);
        }
      }
      await copy();
    },
  };
}
