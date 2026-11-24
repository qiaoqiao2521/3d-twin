import { mkdir, readFile, rm, copyFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const automotive = path.join(root, 'public/twins/automotive');
const v8Source = path.join(root, 'integrations/automotive/v8/src');
const threeSource = path.join(root, 'node_modules/three');
const threeTarget = path.join(automotive, 'vendor/three');

// The isolated viewer's generated assets can be replaced without touching its GLBs.
await rm(path.join(automotive, 'auto-atlas/assets'), { recursive: true, force: true });
await build({ configFile: path.join(root, 'integrations/automotive/auto-atlas/vite.config.ts') });

// Copy only modules actually imported by the standalone V8, including transitive addons.
const addonRoot = path.join(threeSource, 'examples/jsm');
const pending = [
  'controls/OrbitControls.js', 'geometries/RoundedBoxGeometry.js',
  'utils/BufferGeometryUtils.js', 'renderers/CSS2DRenderer.js',
  'postprocessing/EffectComposer.js', 'postprocessing/RenderPass.js',
  'postprocessing/UnrealBloomPass.js', 'postprocessing/OutputPass.js',
];
const copied = new Set();
while (pending.length) {
  const modulePath = pending.pop();
  if (copied.has(modulePath)) continue;
  copied.add(modulePath);
  const source = await readFile(path.join(addonRoot, modulePath), 'utf8');
  for (const match of source.matchAll(/\bfrom\s*['"](\.[^'"]+)['"]/g)) {
    const dependency = path.posix.normalize(path.posix.join(path.posix.dirname(modulePath), match[1]));
    if (dependency.startsWith('../')) throw new Error(`Unexpected Three.js import: ${dependency}`);
    pending.push(dependency);
  }
  const target = path.join(threeTarget, 'addons', modulePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, source);
}
await mkdir(threeTarget, { recursive: true });
await copyFile(path.join(threeSource, 'build/three.module.js'), path.join(threeTarget, 'three.module.js'));
await copyFile(path.join(threeSource, 'LICENSE'), path.join(threeTarget, 'LICENSE'));
const notices = await Promise.all([
  ['React and React DOM', 'react/LICENSE'],
  ['Three.js', 'three/LICENSE'],
  ['meshoptimizer decoder (copyright 2016–2022 Arseny Kapoulkine)', 'meshoptimizer/LICENSE.md'],
].map(async ([name, license]) => `## ${name}\n\n${await readFile(path.join(root, 'node_modules', license), 'utf8')}`));
await writeFile(path.join(automotive, 'THIRD_PARTY_NOTICES.txt'), notices.join('\n\n'));

const files = ['00_head.html', '05_kinematics.js', '10_core.js', '20_build.js', '30_sim.js',
  '40_ui.js', '42_samples.js', '45_audio.js', '50_tour.js'];
const parts = await Promise.all(files.map(name => readFile(path.join(v8Source, name), 'utf8')));
const source = parts.join('');
const tail = await readFile(path.join(v8Source, '99_tail.html'), 'utf8');
const bridge = await readFile(path.join(automotive, 'adapters/v8-bridge.js'), 'utf8');
await mkdir(path.join(automotive, 'v8'), { recursive: true });
await writeFile(path.join(automotive, 'v8/index.html'), source + tail);
await writeFile(path.join(automotive, 'v8/integrated.html'),
  source.replace("setQuality('balanced');", "setQuality('performance');") + bridge + tail);
console.log(`Automotive static build complete (${copied.size} Three.js addons).`);
