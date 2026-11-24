// Run against the dev server or a static server rooted at dist/.
const site = new URL(process.argv[2] || 'http://127.0.0.1:3000/');
const root = new URL('twins/automotive/', site);
const checked = new Map();

async function get(url) {
  const address = new URL(url, root).href;
  if (checked.has(address)) return checked.get(address);
  const response = await fetch(address);
  if (response.status !== 200) throw new Error(`${response.status} ${address}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const pathname = new URL(address).pathname;
  if (/\.(js|css|json|glb)$/.test(pathname) && /text\/html/i.test(response.headers.get('content-type') || '')) {
    throw new Error(`HTML fallback instead of requested asset: ${address}`);
  }
  if (pathname.endsWith('.glb') && bytes.toString('ascii', 0, 4) !== 'glTF') throw new Error(`Invalid GLB: ${address}`);
  checked.set(address, bytes);
  return bytes;
}

const manifest = JSON.parse((await get('manifest.json')).toString());
for (const entry of [manifest.entry, ...Object.values(manifest.views), ...manifest.contracts,
  manifest.licenseMetadata, ...manifest.models.map(model => model.path), 'app.js', 'contracts.js', 'style.css',
  'LICENSE', 'v8/LICENSE', 'THIRD_PARTY_NOTICES.txt']) {
  await get(entry);
}
const atlasUrl = new URL(manifest.views.autoAtlas, root);
const atlas = (await get(atlasUrl)).toString();
for (const match of atlas.matchAll(/(?:src|href)="(\.\/assets\/[^"#]+)"/g)) await get(new URL(match[1], atlasUrl));

const v8Url = new URL(manifest.views.v8Embedded, root);
const v8 = (await get(v8Url)).toString();
const importMap = JSON.parse(v8.match(/<script type="importmap">\s*([\s\S]*?)<\/script>/)[1]).imports;
await get(new URL(importMap.three, v8Url));
const addonBase = new URL(importMap['three/addons/'], v8Url);
const pending = [...v8.matchAll(/^import\s+.*?\s+from\s+['"]three\/addons\/([^'"]+)['"]/gm)]
  .map(match => new URL(match[1], addonBase));
if (!pending.length) throw new Error('V8 addon imports were not found');
const visited = new Set();
while (pending.length) {
  const url = pending.pop();
  if (visited.has(url.href)) continue;
  visited.add(url.href);
  const module = (await get(url)).toString();
  for (const match of module.matchAll(/\bfrom\s*['"](\.[^'"]+)['"]/g)) pending.push(new URL(match[1], url));
}
console.log(`HTTP 200: ${checked.size} automotive resources, including ${manifest.models.length} valid GLBs and ${visited.size} V8 addons; 0 missing.`);
