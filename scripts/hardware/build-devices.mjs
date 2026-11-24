import { createHash } from 'node:crypto';
import { promises as fs, createWriteStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { linkOrCopy, publishSource, sha256, writeJson } from './common.mjs';
import { ensureHardwarePython } from './toolchain.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(here, '../..');
const python = () => process.env.HARDWARE_PYTHON || 'python3';
const sourceDefinitions = async root => JSON.parse(await fs.readFile(path.join(root, 'integrations/hardware/devices/sources.json'), 'utf8'));

async function exists(file) { try { await fs.access(file); return true; } catch { return false; } }
async function walk(root, relative = '') {
  const result = [];
  for (const item of await fs.readdir(path.join(root, relative), { withFileTypes: true })) {
    if (item.name === 'node_modules' || item.name === '__pycache__') continue;
    const name = path.posix.join(relative, item.name);
    if (item.isDirectory()) result.push(...await walk(root, name));
    else if (item.isFile()) result.push(name);
  }
  return result.sort();
}
async function command(program, args, { cwd, log, label }) {
  await fs.mkdir(path.dirname(log), { recursive: true });
  console.log(`[hardware:${label}] ${program} ${args[0] || ''}`);
  const output = createWriteStream(log);
  let tail = '';
  await new Promise((resolve, reject) => {
    const child = spawn(program, args, { cwd, env: { ...process.env, PYTHONUNBUFFERED: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => { output.write(bytes); tail = (tail + bytes.toString()).slice(-12000); });
    child.once('error', error => { output.end(); reject(error); });
    child.once('exit', (code, signal) => {
      output.end();
      if (code !== 0) reject(new Error(`${label} failed (${signal || code}). ${log}\n${tail}`));
      else resolve();
    });
  });
}
async function linkTree(from, to) {
  for (const file of await walk(from)) await linkOrCopy(path.join(from, file), path.join(to, file));
}
async function fingerprint(root, source) {
  const recipes = path.join(root, 'integrations/hardware/devices');
  const hash = createHash('sha256').update(await fs.readFile(fileURLToPath(import.meta.url)));
  for (const shared of ['common.mjs', 'toolchain.mjs']) hash.update(shared).update(await fs.readFile(path.join(root, 'scripts/hardware', shared)));
  for (const file of await walk(recipes)) {
    if (file.startsWith('verification/') || file.startsWith('fixtures/') || file.endsWith('.md') || file.startsWith('test_') || ['verify_frozen_sources.py', 'verify_jubilee_axis.py'].includes(file)) continue;
    // Original OLSK app output does not depend on STEP meshing algorithms.
    if (source.kind === 'original-assembly-application' && (file === 'convert-step.py' || file.endsWith('_tessellation.py') || file.startsWith('native-tolerance-audits/') || file === 'requirements-conversion.txt')) continue;
    hash.update(file).update(await fs.readFile(path.join(recipes, file)));
  }
  return hash.digest('hex');
}
function selectedOriginals(source, lock) {
  const all = lock.files.map(file => file.path);
  if (source.id === 'opcua-conveyor') return all.filter(file => !file.split('/').some(part => part.startsWith('.')));
  if (source.id === 'science-jubilee') return ['README.md', 'LICENSE.txt', 'src/science_jubilee', 'docs/license.md', ...all.filter(file => file.startsWith('tool_library/') && /\.(md|py|json|yaml|yml|csv|txt)$/i.test(file))].filter(name => all.some(file => file === name || file.startsWith(`${name}/`)));
  if (source.kind === 'original-assembly-application') return [
    'Assembly_Manual', 'LICENSES', 'LICENSE_CC_BY_SA_4.0.txt', 'LICENSE_CERN_OHL_W_V2.txt', '.reuse/dep5', 'README.md', source.primaryCad,
    ...all.filter(file => !file.includes('/') && /(?:BOM.*\.xlsx|[Ww]iring.*\.pdf|Pneumatics.*\.pdf)$/.test(file)),
  ];
  if (source.id === 'voron-2.4') return ['README.md', 'LICENSE', source.primaryCad, 'CAD/Voron_2.4r2_Assembly.f3d', 'Manual', 'firmware'];
  return ['README.md', 'license.txt', source.primaryCad, 'frame/cads/jubilee_bill_of_materials.xlsx', 'frame/assembly_instructions', 'software'];
}
async function prepareSource(root, source) {
  const recipes = path.join(root, 'integrations/hardware/devices');
  const lockFile = path.join(recipes, 'frozen-sources', `${source.id}.json`);
  const lock = JSON.parse(await fs.readFile(lockFile, 'utf8'));
  if (lock.revision !== source.revision || lock.repository !== source.repository) throw new Error(`Frozen manifest mismatch for ${source.id}`);
  const cache = path.join(root, '.cache/hardware/device-builds', source.id);
  await fs.mkdir(cache, { recursive: true });
  const result = path.join(cache, 'source.json');
  await command(python(), [path.join(recipes, 'prepare-source.py'), '--lock', lockFile, '--cache-root', path.join(root, '.cache/hardware/sources'), '--select-json', JSON.stringify(selectedOriginals(source, lock)), '--result', result], { cwd: root, log: path.join(cache, 'source.log'), label: `${source.id}:originals` });
  return { source, lock, ...JSON.parse(await fs.readFile(result, 'utf8')) };
}
async function glbDescription(file) {
  const bytes = await fs.readFile(file);
  if (bytes.toString('ascii', 0, 4) !== 'glTF' || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw new Error(`Invalid original GLB ${file}`);
  const document = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8'));
  if (!document.meshes?.length || !document.nodes?.length) throw new Error(`Empty original GLB ${file}`);
  const primitives = document.meshes.flatMap(mesh => mesh.primitives || []);
  return { bytes: bytes.length, sha256: await sha256(file), nodes: document.nodes.length, meshes: document.meshes.length, assemblyNodes: document.nodes.filter(node => node.children?.length).length, animations: document.animations?.length || 0, materials: document.materials?.length || 0, primitives: primitives.length, extensionsRequired: document.extensionsRequired || [] };
}
async function collectNotices(nodeModules, output) {
  const records = [];
  async function visit(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const folder = path.join(directory, entry.name);
      if (entry.name.startsWith('@')) { await visit(folder); continue; }
      const manifest = path.join(folder, 'package.json');
      if (!(await exists(manifest))) continue;
      const pkg = JSON.parse(await fs.readFile(manifest, 'utf8'));
      const files = (await fs.readdir(folder, { withFileTypes: true })).filter(item => item.isFile() && /^(licen[cs]e|copying|notice|copyright)([.-]|$)/i.test(item.name));
      const texts = [];
      for (const item of files) texts.push(`${item.name}\n${await fs.readFile(path.join(folder, item.name), 'utf8')}`);
      records.push(`${pkg.name}@${pkg.version}\nDeclared license: ${typeof pkg.license === 'string' ? pkg.license : JSON.stringify(pkg.license || pkg.licenses || 'see package source')}\n${texts.join('\n\n')}`);
      if (await exists(path.join(folder, 'node_modules'))) await visit(path.join(folder, 'node_modules'));
    }
  }
  await visit(nodeModules);
  await fs.writeFile(output, 'Pinned OLSK dependency notices, including build tools. Original notices are reproduced without relicensing.\n\n' + records.sort().join('\n\n----------------------------------------------------------------\n\n'));
}
async function adaptOriginalApp(root, prepared, work) {
  const { source, sourceRoot } = prepared;
  const recipes = path.join(root, 'integrations/hardware/devices');
  const originalApp = path.join(sourceRoot, 'Assembly_Manual');
  await fs.mkdir(work, { recursive: true });
  // Assets are immutable hardlinks; editable source files are independent copies.
  for (const file of await walk(originalApp)) {
    const destination = path.join(work, file);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    if (file.startsWith('public/')) await linkOrCopy(path.join(originalApp, file), destination);
    else await fs.copyFile(path.join(originalApp, file), destination);
  }
  for (const file of ['package.json', 'package-lock.json']) await fs.copyFile(path.join(recipes, 'dependency-locks', source.id, file), path.join(work, file));
  const snapshots = JSON.parse(await fs.readFile(path.join(recipes, 'manual-data/sources.json'), 'utf8')).sources;
  if (snapshots.length !== 3) throw new Error('All three original OLSK manual sheets must be frozen locally');
  const dataDir = path.join(work, 'src/hardware-host/manual-data');
  await fs.mkdir(dataDir, { recursive: true });
  for (const entry of snapshots) {
    const original = path.join(recipes, 'manual-data', entry.file);
    if (await sha256(original) !== entry.sha256) throw new Error(`Changed original manual snapshot ${entry.file}`);
    await fs.copyFile(original, path.join(dataDir, entry.file));
  }
  const imports = snapshots.map((entry, i) => `import sheet${i} from './manual-data/${entry.file}';`).join('\n');
  const entries = snapshots.map((entry, i) => `${JSON.stringify(`${entry.documentId}/${entry.sheet}`)}: sheet${i}`).join(',\n');
  await fs.writeFile(path.join(work, 'src/hardware-host/manual-data.js'), `${imports}\nconst snapshots = {${entries}};\nexport function readOriginalManual(key) {\n if (!(key in snapshots)) return Promise.reject(new Error('Unpinned original manual: ' + key));\n return Promise.resolve({ data: snapshots[key] });\n}\n`);
  const changed = [];
  const sheetPattern = /axios\.get\(['"]https:\/\/sheets\.googleapis\.com\/v4\/spreadsheets\/([^/]+)\/values\/([^?'"\s]+)\?key=[^'"\s]+['"]\)/g;
  for (const file of await walk(path.join(work, 'src'))) {
    if (!/\.(jsx?|css|html)$/.test(file) || file.startsWith('hardware-host/')) continue;
    const target = path.join(work, 'src', file);
    const original = await fs.readFile(target, 'utf8');
    let text = original.replace(sheetPattern, (_match, documentId, sheet) => `readOriginalManual(${JSON.stringify(`${documentId}/${sheet}`)})`);
    if (text !== original) text = `import { readOriginalManual } from '/hardware-host/manual-data.js';\n${text}`;
    if (file === 'Containers/HowToMenu.jsx' || file === 'Components/StepHowTo.jsx') {
      // Keep the author's menu parser, but scope its accumulator to this
      // mount so returning to the manual does not duplicate every menu item.
      text = text.replace('useEffect(() => {', file === 'Containers/HowToMenu.jsx' ? 'useEffect(() => {\n        let counter = 0;\n        let howTosArray = [];' : 'useEffect(() => {\n        let counter = 0;');
      if (source.id === 'olsk-large-cnc' && file === 'Containers/HowToMenu.jsx') text = text.replace('readOriginalManual("1GS88O0KVbPsdDfFYZyhw8QDcmzQE2Av4TtVoGLWwKnc/Workbook")', 'readOriginalManual("1grTucZ2sqLgZ4AtJq8EkyO__kLg-pazRVl3sbLNMaIY/Blad1")');
    }
    if (file === 'Components/Model.jsx') {
      const signature = 'export default function Model({ modelIn, modelOut, modelInCopy, modelInCopy2, modelOutCopy }) {';
      if (!text.includes(signature)) throw new Error('Changed upstream assembly component signature');
      text = text.replace(signature, `${signature}\n    const stepsNames = useMemo(() => [], []);\n    const stepsNamesNavi = useMemo(() => [], []);`);
    }
    if (file === 'Containers/Header.jsx' || file === 'Components/StepHowTo.jsx') text = text.replace(/\s+target="_blank"/g, '');
    if (file === 'HowToSection.jsx' && source.id === 'olsk-large-cnc') {
      text = `import UnavailableHowTo from './hardware-host/UnavailableHowTo.jsx';\n${text}`;
      for (const topic of ['H3', 'H5', 'H6', 'H7', 'H11']) {
        const originalImport = `import ${topic} from './pages/${topic}.jsx';`;
        const originalElement = `element={<${topic} />}`;
        if (!text.includes(originalImport) || !text.includes(originalElement)) throw new Error(`Changed upstream missing-tutorial route ${topic}`);
        text = text.replace(originalImport, '').replace(originalElement, `element={<UnavailableHowTo topic="${topic}" />}`);
      }
    }
    // This imported remote OrbitControls is never used by the original module.
    if (file === 'EdgesGeometryCuston.jsx') text = text.replace(/^import \{ OrbitControls \} from 'https:\/\/cdn\.jsdelivr\.net\/[^\n]+\n/m, '');
    if (file === 'index.html') {
      text = text.replace(/\s*<script src="https:\/\/(?:unpkg\.com|kit\.fontawesome\.com)[^>]*><\/script>/g, '');
      text = text.replace(/\s*<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/g, '');
      text = text.replace('<head>', '<head>\n<script src="./hardware-host-lifecycle.js"></script>');
    }
    if (file === 'index.jsx') {
      text = `import '@fontsource/barlow/400.css';\nimport '@fontsource/barlow/700.css';\nimport { useGLTF as originalGLTFLoader } from '@react-three/drei';\noriginalGLTFLoader.setDecoderPath(new URL('./draco/', window.location.href).href);\n${text}`;
      text = text.replace("import './style.css'", "import './style.css'\nimport './hardware-host/mobile.css'");
      text = text.replace('root.render(', 'if (window.__hardwareRegisterReactRoot(root)) root.render(');
      text = text.replace('logErrorToMyService(error, info);', "console.error('Original OLSK assembly error', error, info);");
    }
    if (text !== original) { await fs.writeFile(target, text); changed.push(file); }
  }
  await fs.copyFile(path.join(recipes, 'adapters/mobile.css'), path.join(work, 'src/hardware-host/mobile.css'));
  if (source.id === 'olsk-large-cnc') await fs.copyFile(path.join(recipes, 'adapters/UnavailableHowTo.jsx'), path.join(work, 'src/hardware-host/UnavailableHowTo.jsx'));
  await fs.copyFile(path.join(recipes, 'adapters/host-lifecycle.js'), path.join(work, 'public/hardware-host-lifecycle.js'));
  await writeJson(path.join(work, 'hardware-adaptations.json'), {
    originalRepository: source.repository, originalRevision: source.revision, changedSourceFiles: changed,
    changes: [
      'Retain original models, cameras, controls, materials, assembly hierarchy and internal HashRouter.',
      'Bundle byte-identical snapshots of the three original public manual sheets. External snapshots have separate source/hash/date records.',
      'Serve Barlow locally; remove unused external FontAwesome and duplicate Axios scripts, and unused external OrbitControls import.',
      'Keep original Draco-compressed GLB bytes unchanged; explicitly configure the original useGLTF loader to use the local decoder shipped with its exact three@0.148.0 dependency, including Apache-2.0 notices.',
      'Expose synchronous React-root unmount and hidden:boolean pause hooks; host iframe destruction releases the independent document.',
      'Add narrow-screen panel layout without removing original controls or replacing geometry.',
      'Keep internal HowTo links in the same original HashRouter so the persistent host return control remains available; expose the original navigation links on narrow screens instead of the upstream non-rendering hamburger placeholder.',
      'Replace the undefined error-reporting placeholder with console.error so original app failures remain visible.',
      'Fetch svg-pan-zoom using the exact commit already pinned upstream, over HTTPS with a locked integrity instead of git+ssh.',
      'Reset the original HowTo menu accumulator on each mount so internal return navigation cannot duplicate its entries.',
      'Scope original assembly-name arrays to each component mount so returning from an internal HowTo page does not duplicate assembly steps.',
      ...(source.id === 'olsk-large-cnc' ? ['Use the same original HowTo sheet for the menu and text; the upstream Large menu pointed at the unrelated machine assembly workbook.', 'Keep H3/H5/H6/H7/H11 original text and navigation, but show an explicit unavailable-illustration notice because FirstTestHowTo.glb is absent from the fixed original tree and the author deployment returns HTTP 404. Original source pages remain in the local source archive; no replacement geometry is supplied.'] : []),
    ],
    sheets: snapshots,
  });
}
async function buildOriginalApp(root, prepared, stage, cache) {
  const source = prepared.source;
  const work = path.join(cache, 'app-work');
  await fs.rm(work, { recursive: true, force: true });
  await adaptOriginalApp(root, prepared, work);
  await command('npm', ['ci', '--include=dev', '--ignore-scripts', '--legacy-peer-deps', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: work, log: path.join(cache, 'npm-ci.log'), label: `${source.id}:dependencies` });
  const draco = path.join(work, 'public/draco');
  const decoderFiles = [];
  for (const file of ['draco_decoder.js', 'draco_decoder.wasm', 'draco_wasm_wrapper.js']) {
    const original = path.join(work, 'node_modules/three/examples/jsm/libs/draco/gltf', file);
    await linkOrCopy(original, path.join(draco, file));
    decoderFiles.push({ path: file, sha256: await sha256(original), size: (await fs.stat(original)).size });
  }
  await fs.copyFile(path.join(work, 'node_modules/three/examples/jsm/libs/draco/README.md'), path.join(draco, 'README.md'));
  await fs.copyFile(path.join(root, 'integrations/hardware/devices/licenses/draco/LICENSE-Apache-2.0.txt'), path.join(draco, 'LICENSE-Apache-2.0.txt'));
  const dependency = JSON.parse(await fs.readFile(path.join(work, 'package-lock.json'), 'utf8')).packages['node_modules/three'];
  await writeJson(path.join(draco, 'SOURCE.json'), { package: `three@${dependency.version}`, npmArchive: dependency.resolved, npmIntegrity: dependency.integrity, originalDirectory: 'examples/jsm/libs/draco/gltf', license: 'Apache-2.0', files: decoderFiles });
  await command('npm', ['run', 'build'], { cwd: work, log: path.join(cache, 'production-build.log'), label: `${source.id}:original-app` });
  // Vite copies public assets by default. Once their bytes are proven equal,
  // retain immutable hardlinks instead of another large CAD/model copy.
  for (const file of await walk(path.join(work, 'public'))) {
    const original = path.join(work, 'public', file);
    const built = path.join(work, 'dist', file);
    if (await sha256(original) !== await sha256(built)) throw new Error(`Vite changed a public original asset: ${file}`);
    await linkOrCopy(original, built);
  }
  const app = path.join(stage, 'app');
  await linkTree(path.join(work, 'dist'), app);
  const html = await fs.readFile(path.join(app, 'index.html'), 'utf8');
  if (!html.includes('./hardware-host-lifecycle.js')) throw new Error('Original app lost its early lifecycle adapter');
  if (/https:\/\/(?:unpkg|fonts\.googleapis|kit\.fontawesome|cdn\.jsdelivr|sheets\.googleapis)/.test(html)) throw new Error('Original app still requires a runtime CDN');
  for (const file of await walk(path.join(app, 'assets'))) {
    if (!file.endsWith('.js')) continue;
    const code = await fs.readFile(path.join(app, 'assets', file), 'utf8');
    if (code.includes('https://sheets.googleapis.com/')) throw new Error('Original manual remains dependent on live Google Sheets');
    for (const match of code.matchAll(/["'`]((?:\.\/)?[^"'`\n]+\.glb)["'`]/g)) {
      if (/^(?:https?:|data:)/.test(match[1]) || !(await exists(path.resolve(app, match[1])))) throw new Error(`Original manual references an unavailable runtime GLB: ${match[1]}`);
    }
  }
  const originalModel = path.join(prepared.sourceRoot, source.previewModel);
  const modelFile = path.basename(source.previewModel);
  if (await sha256(path.join(app, modelFile)) !== await sha256(originalModel)) throw new Error('Original OLSK model bytes changed during the build');
  await writeJson(path.join(stage, 'original-model.json'), await glbDescription(originalModel));
  await command(process.execPath, [path.join(root, 'integrations/hardware/devices/verify_olsk_runtime.mjs'), app, path.join(stage, 'original-runtime-validation.json')], { cwd: root, log: path.join(cache, 'original-runtime-validation.log'), label: `${source.id}:local-original-codec` });
  await collectNotices(path.join(work, 'node_modules'), path.join(stage, 'THIRD_PARTY_NOTICES.txt'));
  const corresponding = path.join(stage, 'adapted-source');
  for (const file of await walk(work)) {
    if (file.startsWith('dist/')) continue;
    await linkOrCopy(path.join(work, file), path.join(corresponding, file));
  }
  await fs.copyFile(path.join(prepared.sourceRoot, 'LICENSES/AGPL-3.0-or-later.txt'), path.join(corresponding, 'LICENSE-AGPL-3.0-or-later.txt'));
  await fs.copyFile(path.join(prepared.sourceRoot, 'LICENSES/CC-BY-SA-4.0.txt'), path.join(corresponding, 'LICENSE-CC-BY-SA-4.0.txt'));
  await fs.copyFile(path.join(prepared.sourceRoot, '.reuse/dep5'), path.join(corresponding, 'UPSTREAM-FILE-LICENSES.txt'));
  await fs.writeFile(path.join(corresponding, 'BUILD.md'), `# Corresponding adapted OLSK app source\n\nOriginal ${source.repository} at ${source.revision}. The original author and notices remain in the complete local upstream archive. Code adaptations retain AGPL-3.0-or-later; public models and original manual content retain CC-BY-SA-4.0. Fonts and dependencies retain their individual notices.\n\nThis directory contains the complete adapted application, original local public assets, stylesheet, lifecycle adapter, all three pinned original manual sheets, dependency lock and Vite build configuration.\n\nRebuild with Node and npm:\n\n\`\`\`sh\nnpm ci --include=dev --ignore-scripts --legacy-peer-deps\nnpm run build\n\`\`\`\n\nThe result is dist/. The scripts do not connect to real CNC hardware. See hardware-adaptations.json for every host adaptation and external-data provenance.\n`);
  const pack = `import tarfile,sys,pathlib\nsource,target=sys.argv[1:]\nwith tarfile.open(target,'w:gz') as archive:\n archive.add(source,arcname='adapted-olsk-application')\n`;
  await command(python(), ['-c', pack, corresponding, path.join(stage, 'adapted-source.tar.gz')], { cwd: root, log: path.join(cache, 'source-package.log'), label: `${source.id}:corresponding-source` });
  await writeJson(path.join(stage, 'manual-snapshot-sources.json'), JSON.parse(await fs.readFile(path.join(root, 'integrations/hardware/devices/manual-data/sources.json'), 'utf8')));
  await fs.rm(path.join(work, 'node_modules'), { recursive: true, force: true });
  return [
    { id: 'original-app', label: '原始交互装配手册', format: 'html', path: 'app/index.html', unit: 'm', up: 'Y', role: 'original-app', source: { id: source.id, path: 'Assembly_Manual/src/index.html' }, limitations: ['原始装配、零件点选、说明与镜头；不连接真实 CNC，不执行加工或控制指令。'] },
    { id: 'original-assembly', label: '原始完整装配模型', format: 'gltf', path: `app/${modelFile}`, unit: 'm', up: 'Y', role: 'assembly', source: { id: source.id, path: source.previewModel }, limitations: ['这是原作者手册的装配模型；模型原件未修改，没有添加运动求解或设备状态。'] },
  ];
}
async function stepPath(root, prepared, cache, relative) {
  const original = path.join(prepared.sourceRoot, relative);
  if (!relative.toLowerCase().endsWith('.zip')) return { file: original, temporary: false };
  const destination = path.join(cache, 'step-input');
  await fs.mkdir(destination, { recursive: true });
  const result = path.join(cache, 'step-input.json');
  const script = `import pathlib,json,sys,zipfile\nsource,dest,result=sys.argv[1:]\nwith zipfile.ZipFile(source) as z:\n files=[i for i in z.infolist() if not i.is_dir() and pathlib.PurePosixPath(i.filename).suffix.lower() in ['.step','.stp']]\n if len(files)!=1: raise RuntimeError('Expected one complete assembly STEP; found '+str([i.filename for i in files]))\n member=files[0]\n if '..' in pathlib.PurePosixPath(member.filename).parts or pathlib.PurePosixPath(member.filename).is_absolute(): raise RuntimeError('Unsafe STEP archive path')\n target=pathlib.Path(dest)/pathlib.PurePosixPath(member.filename).name\n with z.open(member) as src,target.open('wb') as out:\n  while block:=src.read(1024*1024):out.write(block)\n pathlib.Path(result).write_text(json.dumps({'file':str(target),'archiveMember':member.filename,'bytes':member.file_size}))\n`;
  await command(python(), ['-c', script, original, destination, result], { cwd: root, log: path.join(cache, 'step-extract.log'), label: `${prepared.source.id}:extract-original-step` });
  return { ...JSON.parse(await fs.readFile(result, 'utf8')), temporary: true };
}
async function convertCad(root, prepared, stage, cache) {
  const { source } = prepared;
  await command(python(), ['-c', 'import importlib.metadata; version=importlib.metadata.version("cadquery-ocp"); assert version == "7.8.1.1.post1", "Install the pinned cadquery-ocp 7.8.1.1.post1 toolchain; found " + version; print(version)'], { cwd: root, log: path.join(cache, 'conversion-toolchain.log'), label: `${source.id}:conversion-toolchain` });
  const inputs = [{ id: 'assembly', path: source.primaryCad, title: '原 CAD 完整装配' }, ...(source.extraCad || [])];
  const models = [];
  for (const input of inputs) {
    const resolved = await stepPath(root, prepared, cache, input.path);
    const output = path.join(stage, `${input.id}.glb`);
    const report = path.join(stage, `${input.id}-conversion.json`);
    try {
      const provenance = { repository: source.repository, revision: source.revision, path: input.path, ...(resolved.archiveMember ? { archiveMember: resolved.archiveMember } : {}) };
      const converter = path.join(root, 'integrations/hardware/devices/convert-step.py');
      const helpers = {};
      for (const file of (await fs.readdir(path.dirname(converter))).filter(name => name.endsWith('_tessellation.py') && !name.startsWith('test_')).sort()) helpers[file] = await sha256(path.join(path.dirname(converter), file));
      const sourcePrecisionAudits = {};
      const auditDirectory = path.join(path.dirname(converter), 'native-tolerance-audits');
      if (await exists(auditDirectory)) for (const file of (await fs.readdir(auditDirectory)).filter(name => name.endsWith('.json')).sort()) sourcePrecisionAudits[file] = await sha256(path.join(auditDirectory, file));
      const conversionInputs = { sourceSha256: await sha256(resolved.file), converterSha256: await sha256(converter), helpers, sourcePrecisionAudits, sourceUpAxis: source.sourceUpAxis, linearDeflectionMillimetres: 0.25, angularDeflectionRadians: 0.45, toolchain: 'cadquery-ocp==7.8.1.1.post1', provenance };
      const conversionKey = createHash('sha256').update(JSON.stringify(conversionInputs)).digest('hex');
      const saved = path.join(cache, 'converted', input.id);
      let hit = false;
      try {
        const marker = JSON.parse(await fs.readFile(path.join(saved, 'manifest.json'), 'utf8'));
        hit = marker.key === conversionKey && marker.outputSha256 === await sha256(path.join(saved, 'model.glb')) && marker.reportSha256 === await sha256(path.join(saved, 'conversion.json'));
      } catch { /* Missing or changed conversion cache must be rebuilt. */ }
      if (hit) {
        await linkOrCopy(path.join(saved, 'model.glb'), output);
        await linkOrCopy(path.join(saved, 'conversion.json'), report);
        console.log(`[hardware:${source.id}:${input.id}] verified original CAD conversion cache hit`);
      } else {
        await command(python(), [converter, resolved.file, output, '--report', report, '--source-up-axis', source.sourceUpAxis, '--provenance-json', JSON.stringify(provenance)], { cwd: root, log: path.join(cache, `${input.id}-conversion.log`), label: `${source.id}:${input.id}` });
        await fs.rm(saved, { recursive: true, force: true });
        await fs.mkdir(saved, { recursive: true });
        await linkOrCopy(output, path.join(saved, 'model.glb'));
        await linkOrCopy(report, path.join(saved, 'conversion.json'));
        await writeJson(path.join(saved, 'manifest.json'), { key: conversionKey, inputs: conversionInputs, outputSha256: await sha256(output), reportSha256: await sha256(report) });
      }
      await glbDescription(output);
      const info = JSON.parse(await fs.readFile(report, 'utf8'));
      if (info.unmeshedNondegenerateFaces.length || info.outputSha256 !== await sha256(output) || info.sourceSha256 !== conversionInputs.sourceSha256 || info.converter.version !== '7.8.1.1.post1') throw new Error(`Incomplete or mismatched CAD conversion ${source.id}`);
      const limited = info.nativeToleranceLimitedFaces || [];
      if (source.id === 'voron-2.4') {
        if (limited.length !== 1 || limited[0].face !== 8935 || limited[0].triangles !== 4) throw new Error('Voron original tolerance audit is absent or covers an unexpected face');
        await linkOrCopy(path.join(auditDirectory, 'voron-2.4-face-8935.json'), path.join(stage, 'source-precision-audit.json'));
      } else if (limited.length) throw new Error(`Unexpected source-precision exception in ${source.id}`);
    } finally {
      if (resolved.temporary) await fs.rm(path.dirname(resolved.file), { recursive: true, force: true });
    }
    models.push({ id: input.id, label: input.title, format: 'gltf', path: `${input.id}.glb`, unit: 'm', up: 'Y', role: 'assembly', source: { id: source.id, path: input.path }, limitations: ['从原 STEP 装配逐部件网格化，保留名称、放置矩阵和可读取的原颜色；没有推定关节、惯量、碰撞或设备遥测。', ...(source.id === 'voron-2.4' ? ['原第 8935 微薄面仅能按原 CAD 自身容差保留原内核 4 个三角形，其面积未认证；未删除、投影替换或补封原边。详见 source-precision-audit.json 与 nativeToleranceLimitedFaces。'] : [])] });
  }
  return models;
}
function licenseSummary(source) {
  return [...new Set(Object.entries(source.licenses).filter(([key]) => !['file', 'mapping', 'fonts'].includes(key)).map(([, value]) => value))].join(' / ');
}
async function writeSourceNotes(root, stage, source, published) {
  const body = `# ${source.title}\n\nThis integration preserves original upstream files. The complete local source archives and the original file index are linked from asset.json and originals.json. The original files are never edited.\n\n## Sources\n\n${published.map(item => `- ${item.repository} at ${item.revision}; Git tree ${item.tree}; ${item.license}; local archive: ${item.archive}`).join('\n')}\n\n## Actual capabilities\n\n${source.kind === 'original-assembly-application' ? 'The original OLSK 3D assembly application is independently built, including its original geometry, hierarchy, assembly steps, parts lists, cameras and diagrams. Three separately pinned public author spreadsheets provide the original manual text. Their snapshot date/hash are recorded in manual-snapshot-sources.json, independently of the Git commit. The same-origin adapted-source/ directory provides the corresponding modified app source, locked dependencies, public assets and adaptation record. Run npm ci --include=dev --ignore-scripts --legacy-peer-deps then npm run build in that app directory to reproduce it.' : 'The displayed assembly is tessellated directly from the original STEP with OpenCascade STEPCAF/XCAF. Original product names, occurrences, placements and colors are retained. Per-model conversion reports record source SHA-256, units, tessellation tolerances, face completeness and original assembly hierarchy.'}\n\nNo live machine connection, controller command, collision simulation or verified manufacturing behavior is added. CAD appearance and an original assembly manual are not represented as a complete live digital twin.\n\n## Licensing\n\n${licenseSummary(source)}. Original license files remain in the local sources. ${source.kind === 'original-assembly-application' ? 'The upstream .reuse/dep5 is the file-level map: app/firmware/settings code is AGPL-3.0-or-later; public assembly models/media are CC-BY-SA-4.0; CAD/BOM/schematics are CERN-OHL-W-2.0. Font notices remain separate. This entire package is not relicensed as MIT. The code adaptations are distributed under the original AGPL terms. Dependency licenses are reproduced in THIRD_PARTY_NOTICES.txt.' : 'The main mechanical design license and the independently sourced control-code licenses must not be conflated.'}\n\n## Preserved limitations\n\n${(source.limitations || []).map(item => `- ${item}`).join('\n')}\n- Browser WebGL, real mobile gestures, visual accuracy against the physical equipment, and long-duration resource release require separate observation; builds and HTTP checks do not replace that acceptance.\n\n## Reproduction\n\nFrom the digital-twin repository run: node scripts/hardware/build-devices.mjs ${source.id}\nThe recipe requires the pinned conversion environment and downloads the full fixed Git archives automatically if absent. A missing source, hash mismatch, failed original-app build, or incomplete CAD conversion stops the build.\n`;
  const precisionNotes = source.id === 'voron-2.4' ? `\n## One original CAD precision limitation\n\nThe fixed original STEP contains one exceptionally thin B-spline face (original face 8935) whose UV edges are sewn by the source file's own vertex/edge tolerances. Its signed surface integral is not a certified closed-domain area. The integration retains the original OpenCascade-generated four triangles, original surfaces, edges, tolerances and placement; it does not project replacement geometry, invent an end cap or delete that face.\n\nThis single source-hash-pinned case is separately checked against its original CAD precision. It is not counted as passing the ordinary closed-face 0.5% area check. See the local [fixed source-precision audit](source-precision-audit.json) and the independent \`nativeToleranceLimitedFaces\` section in the [actual assembly conversion report](assembly-conversion.json). All other unexpected incomplete or inaccurate faces still stop the build.\n` : '';
  await fs.writeFile(path.join(stage, 'SOURCE.md'), body + precisionNotes);
}
async function checkCache(assetDir, recipeHash) {
  try {
    const marker = JSON.parse(await fs.readFile(path.join(assetDir, 'build-manifest.json'), 'utf8'));
    if (marker.recipeHash !== recipeHash) return false;
    const actual = (await walk(assetDir)).filter(file => file !== 'build-manifest.json');
    if (JSON.stringify(actual) !== JSON.stringify(Object.keys(marker.files).sort())) return false;
    for (const file of actual) if (await sha256(path.join(assetDir, file)) !== marker.files[file].sha256) return false;
    return true;
  } catch { return false; }
}

export async function buildDevices({ repoRoot = defaultRoot, ids } = {}) {
  const root = path.resolve(repoRoot);
  const definitions = (await sourceDefinitions(root)).sources;
  const available = definitions.filter(source => source.kind !== 'supporting-originals');
  const requested = ids?.length ? ids : available.map(source => source.id);
  for (const id of requested) if (!available.some(source => source.id === id)) throw new Error(`Unknown device ${id}`);
  const results = [];
  for (const id of requested) {
    const source = available.find(item => item.id === id);
    const recipeHash = await fingerprint(root, source);
    const assetDir = path.join(root, 'public/hardware', id);
    if (await checkCache(assetDir, recipeHash)) {
      console.log(`[hardware:${id}] verified artifact cache hit`);
      results.push(JSON.parse(await fs.readFile(path.join(assetDir, 'asset.json'), 'utf8')));
      continue;
    }
    const cache = path.join(root, '.cache/hardware/device-builds', id);
    const stage = path.join(cache, 'publish');
    await fs.rm(stage, { recursive: true, force: true });
    await fs.mkdir(stage, { recursive: true });
    const prepared = await prepareSource(root, source);
    const supporting = [];
    for (const extra of source.additionalSources || []) supporting.push(await prepareSource(root, definitions.find(item => item.id === extra)));
    const models = source.kind === 'original-assembly-application' ? await buildOriginalApp(root, prepared, stage, cache) : await convertCad(root, prepared, stage, cache);
    const published = [];
    const originals = [];
    for (const item of [prepared, ...supporting]) {
      const exposed = item.selectedFiles.filter(file => !file.split('/').some(segment => segment.startsWith('.')));
      const result = await publishSource({ assetDir: stage, sourceRoot: item.sourceRoot, archivePath: item.archivePath, paths: exposed,
        source: { id: item.source.id, repository: item.source.repository, revision: item.source.revision, tree: item.lock.tree, license: licenseSummary(item.source) },
        fileIndex: item.lock.files.map(file => ({ path: file.path, size: file.size, sha256: file.sha256 })) });
      published.push(result.source);
      originals.push(...result.files);
      const mapping = path.join(item.sourceRoot, '.reuse/dep5');
      if (await exists(mapping)) {
        const localMapping = path.posix.join('licensing', item.source.id, 'reuse-dep5.txt');
        await linkOrCopy(mapping, path.join(stage, localMapping));
        const indexed = originals.find(file => file.sourceId === item.source.id && file.path === '.reuse/dep5');
        if (!indexed) throw new Error(`Original REUSE mapping lost from the source index: ${item.source.id}`);
        indexed.url = localMapping;
      }
    }
    const manifest = { schemaVersion: 1, id, title: source.title, kind: 'machine', description: source.kind === 'original-assembly-application' ? '原始 CNC 装配应用、机械结构、零件与本地完整设计原件。' : '原 CAD 真实装配、零件层级与本地完整设计原件。', sources: published, models,
      capabilities: { structure: '原始完整装配与源文件；逐部件名称、层级、放置与原可用颜色。', motion: source.kind === 'original-assembly-application' ? '原作者装配步骤、零件点选、图纸与镜头交互；没有新增设备运动求解。' : '当前为结构展示；控制源码单独保留研究，不由浏览器执行。', live: '未连接真实机器或控制器，没有实机反馈。' },
      limitations: [...(source.limitations || []), '未将 CAD 外观、预设装配步骤或构建通过称为实机验收。'], filesIndex: 'originals.json',
      ...(id === 'voron-2.4' ? { verificationReports: [{ path: 'source-precision-audit.json', label: '原第 8935 微薄面：固定来源与原公差审计' }, { path: 'assembly-conversion.json', label: '完整原装配转换报告与单独的精度限制记录' }] } : {}),
      ...(source.kind === 'original-assembly-application' ? { integrationSource: [{ path: 'adapted-source.tar.gz', label: '完整适配应用源码、原模型、手册快照、依赖锁与构建配置', license: 'AGPL-3.0-or-later (code); CC-BY-SA-4.0 (original assembly media); individual font/dependency licenses' }] } : {}) };
    await writeJson(path.join(stage, 'asset.json'), manifest);
    await writeJson(path.join(stage, 'originals.json'), { schemaVersion: 1, files: originals });
    await writeSourceNotes(root, stage, source, published);
    const files = {};
    for (const file of await walk(stage)) files[file] = { size: (await fs.stat(path.join(stage, file))).size, sha256: await sha256(path.join(stage, file)) };
    await writeJson(path.join(stage, 'build-manifest.json'), { schemaVersion: 1, id, recipeHash, sourceRevisions: published.map(item => ({ id: item.id, revision: item.revision, tree: item.tree })), files });
    await fs.mkdir(path.dirname(assetDir), { recursive: true });
    await fs.rm(assetDir, { recursive: true, force: true });
    await fs.rename(stage, assetDir);
    console.log(`[hardware:${id}] published ${models.length} models and ${originals.length} original source files`);
    results.push(manifest);
  }
  return results;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  ensureHardwarePython({ install: false }).then(() => buildDevices({ ids: process.argv.slice(2) })).catch(error => { console.error(error.stack || error); process.exitCode = 1; });
}
