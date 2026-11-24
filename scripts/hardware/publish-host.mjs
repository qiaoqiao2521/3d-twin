import { promises as fs } from 'node:fs';
import path from 'node:path';
import { linkOrCopy, sha256, writeJson } from './common.mjs';

export async function publishHardwareHost({ repoRoot }) {
  const output = path.join(repoRoot, 'public/hardware');
  const licenses = path.join(repoRoot, 'integrations/hardware/licenses');
  const retained = JSON.parse(await fs.readFile(path.join(licenses, 'sources.json'), 'utf8'));
  const records = [];
  for (const name of ['react', 'react-dom', 'three', 'urdf-loader', 'meshoptimizer', 'lucide-react']) {
    const root = path.join(repoRoot, 'node_modules', name);
    const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
    const paths = (await fs.readdir(root)).filter(file => /^(?:license|copying|notice)(?:\.|$)/i.test(file));
    const texts = [];
    for (const file of paths) texts.push(await fs.readFile(path.join(root, file), 'utf8'));
    if (name === 'urdf-loader') {
      const original = retained.find(source => source.package === name);
      if (pkg.version !== original.version || await sha256(path.join(licenses, original.file)) !== original.sha256) throw new Error('URDF loader license pin no longer matches the installed package');
      texts.push(`Original license: ${original.source}\n${await fs.readFile(path.join(licenses, original.file), 'utf8')}`);
    }
    if (!texts.length) throw new Error(`Runtime dependency license is missing: ${name}`);
    records.push(`${name}@${pkg.version}\nDeclared license: ${pkg.license}\n\n${texts.join('\n\n')}`);
  }
  const codec = retained.find(source => source.package === 'Draco browser glTF codec');
  if (await sha256(path.join(licenses, codec.file)) !== codec.sha256) throw new Error('Original Draco license changed');
  records.push(`Draco browser glTF codec\nSource: Three.js 0.170.0 vendored glTF decoder\nLicense source: ${codec.source}\n\n${await fs.readFile(path.join(licenses, codec.file), 'utf8')}`);
  const decoderFiles = [];
  for (const name of ['draco_decoder.js', 'draco_wasm_wrapper.js', 'draco_decoder.wasm']) {
    const original = path.join(repoRoot, 'node_modules/three/examples/jsm/libs/draco/gltf', name);
    const published = path.join(repoRoot, 'public/draco', name);
    if (await sha256(original) !== await sha256(published)) throw new Error(`Host Draco decoder differs from the installed Three.js original: ${name}`);
    decoderFiles.push({ path: `draco/${name}`, sha256: await sha256(published), size: (await fs.stat(published)).size });
  }
  await fs.mkdir(output, { recursive: true });
  const notices = path.join(output, 'THIRD_PARTY_NOTICES.txt');
  const pendingNotices = `${notices}.${process.pid}.tmp`;
  await fs.writeFile(pendingNotices, 'Hardware viewer runtime notices. Original robot/device licenses are separate in each source archive.\n\n' + records.join('\n\n------------------------------------------------------------\n\n'));
  await fs.rename(pendingNotices, notices);
  await writeJson(path.join(output, 'HOST-RESOURCES.json'), { schemaVersion: 1, decoderSource: 'three@0.170.0/examples/jsm/libs/draco/gltf', decoderFiles });
  await linkOrCopy(path.join(licenses, codec.file), path.join(repoRoot, 'public/draco/LICENSE.txt'));
}
