import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { linkOrCopy, publishSource, sha256, writeJson } from './common.mjs';
import { ensureHardwarePython } from './toolchain.mjs';

const exec = promisify(execFile);
const ownRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const robotIds = ['odri', 'so101', 'thor', 'parol6'];
const sourceLicenses = {
  odri: 'BSD-3-Clause; retain all upstream notices.',
  'odri-web': 'BSD-3-Clause for the website; original generated eDrawings HTML retains embedded Dassault Systèmes copyright and bundled third-party notices. These notices are not relicensed as BSD.',
  so101: 'Apache-2.0; original notices retained.',
  thor: 'CC-BY-SA-4.0 in the repository LICENSE/README; native FreeCAD document metadata separately says All rights reserved. Both declarations are preserved and the discrepancy is recorded.',
  'thor-ros': 'CC-BY-SA-4.0 at repository root; thor_urdf package software also carries Apache-2.0. Original Thor-derived meshes and notices are retained.',
  'parol6-hardware': 'CERN-OHL-S-2.0 for hardware; control-board firmware GPL-3.0 and vendored dependencies retain their own notices.',
  'parol6-models': 'CC-BY-4.0 for models, geometry and documentation; Apache-2.0 for tools and ROS support. Historical source metadata retained; see ATTRIBUTION.md.',
};

async function readJson(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
}
async function exists(file) { try { await fs.access(file); return true; } catch { return false; } }
async function executableAvailable(name) {
  const candidates = name.includes(path.sep) ? [name] : (process.env.PATH || '').split(path.delimiter).map(directory => path.join(directory, name));
  for (const candidate of candidates) if (await exists(candidate)) return true;
  return false;
}
async function command(command, args, options = {}) {
  const { stdout } = await exec(command, args, { maxBuffer: 32 * 1024 * 1024, ...options });
  return stdout.trim();
}
async function runLogged(commandName, args, { cwd, env, log, timeout = 30 * 60 * 1000 } = {}) {
  if (log) await fs.mkdir(path.dirname(log), { recursive: true });
  const sink = log ? createWriteStream(log) : undefined;
  await new Promise((resolve, reject) => {
    const child = spawn(commandName, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error(`${commandName} exceeded ${timeout / 1000}s; see ${log || 'output'}`)); }, timeout);
    let tail = '';
    for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => {
      if (sink) sink.write(bytes);
      tail = (tail + bytes).slice(-6000);
    });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => {
      clearTimeout(timer);
      sink?.end();
      if (code === 0) resolve();
      else reject(new Error(`${commandName} failed (${code}); ${log || ''}\n${tail}`));
    });
  });
}

/** Fetch exact originals; never reset a user's edited source cache. */
export async function ensureRobotSource(repoRoot, pin) {
  const root = path.join(repoRoot, '.cache/hardware-sources', pin.id);
  if (!await exists(path.join(root, '.git'))) {
    if (await exists(root) && (await fs.readdir(root)).length) throw new Error(`Non-Git source cache already exists: ${root}`);
    await fs.mkdir(root, { recursive: true });
    await command('git', ['init', '-q'], { cwd: root });
    await command('git', ['remote', 'add', 'origin', pin.repository], { cwd: root });
  }
  let head;
  try { head = await command('git', ['rev-parse', '--verify', '--quiet', 'HEAD'], { cwd: root }); } catch {
    // A failed first network fetch leaves a valid, empty initialized repo.
    // Resume only this narrowly identifiable state; never reset unknown data,
    // a staged file, an existing ref, or a broken detached HEAD.
    let inside, symbolic, tracked, refs, remotes;
    try {
      inside = await command('git', ['rev-parse', '--is-inside-work-tree'], { cwd: root });
      symbolic = await command('git', ['symbolic-ref', '--quiet', 'HEAD'], { cwd: root });
      tracked = await command('git', ['ls-files', '--stage'], { cwd: root });
      refs = await command('git', ['for-each-ref', '--format=%(refname)'], { cwd: root });
      remotes = (await command('git', ['remote'], { cwd: root })).split('\n').filter(Boolean);
    } catch { throw new Error(`Invalid or unknown incomplete source cache: ${root}`); }
    const unknown = (await fs.readdir(root)).filter(name => name !== '.git');
    if (inside !== 'true' || !symbolic.startsWith('refs/heads/') || unknown.length || tracked || refs || remotes.some(name => name !== 'origin')) {
      throw new Error(`Incomplete source cache contains existing data or refs; refusing to overwrite: ${root}`);
    }
    if (remotes.includes('origin')) {
      const origin = await command('git', ['remote', 'get-url', 'origin'], { cwd: root });
      if (origin !== pin.repository) throw new Error(`Incomplete source cache has a different origin: ${root}`);
    } else {
      await command('git', ['remote', 'add', 'origin', pin.repository], { cwd: root });
    }
  }
  if (!head) {
    await runLogged('git', ['-c', 'advice.detachedHead=false', 'fetch', '--depth', '1', 'origin', pin.revision], { cwd: root, log: `${root}.log` });
    await command('git', ['-c', 'advice.detachedHead=false', 'checkout', '--detach', pin.revision], { cwd: root });
  }
  const actual = await command('git', ['rev-parse', 'HEAD', 'HEAD^{tree}'], { cwd: root });
  if (actual !== `${pin.revision}\n${pin.tree}`) throw new Error(`Frozen source mismatch for ${pin.id}: ${actual}`);
  if (await command('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: root })) throw new Error(`Original source ${pin.id} has local changes or extra files; restore them explicitly before building.`);
  if (await command('git', ['rev-parse', `HEAD:${pin.licensePath}`], { cwd: root }) !== pin.licenseBlob) throw new Error(`Frozen license changed for ${pin.id}`);
  return root;
}

async function sourceIndex(repoRoot, sourceRoot, pin) {
  const cache = path.join(repoRoot, '.cache/hardware-source-index', `${pin.id}-${pin.revision}.json`);
  const previous = await readJson(cache);
  if (previous?.tree === pin.tree && previous?.schemaVersion === 1) return previous.files;
  const { stdout } = await exec('git', ['ls-tree', '-rlz', pin.revision], { cwd: sourceRoot, maxBuffer: 32 * 1024 * 1024 });
  const files = [];
  for (const entry of stdout.split('\0').filter(Boolean)) {
    const tab = entry.indexOf('\t');
    const [mode, type, blob, rawSize] = entry.slice(0, tab).trim().split(/\s+/);
    const relative = entry.slice(tab + 1);
    if (type !== 'blob' || mode === '120000') throw new Error(`Unexpected nonregular original: ${pin.id}/${relative}`);
    const size = Number(rawSize);
    const original = path.join(sourceRoot, relative);
    if ((await fs.stat(original)).size !== size) throw new Error(`Original size differs from Git: ${pin.id}/${relative}`);
    const gitHash = createHash('sha1').update(`blob ${size}\0`);
    const digest = createHash('sha256');
    for await (const chunk of createReadStream(original)) { gitHash.update(chunk); digest.update(chunk); }
    if (gitHash.digest('hex') !== blob) throw new Error(`Original content differs from Git: ${pin.id}/${relative}`);
    files.push({ path: relative, size, sha256: digest.digest('hex') });
  }
  await writeJson(cache, { schemaVersion: 1, tree: pin.tree, files });
  return files;
}

async function sourceArchive(repoRoot, sourceRoot, pin, files) {
  const archive = path.join(repoRoot, '.cache/hardware-archives', `${pin.id}-${pin.revision}.tar.gz`);
  const metadataPath = `${archive}.json`;
  const previous = await readJson(metadataPath);
  if (previous?.tree === pin.tree && await exists(archive) && await sha256(archive) === previous.sha256) return archive;
  await fs.mkdir(path.dirname(archive), { recursive: true });
  const temporary = `${archive}.tmp`;
  const git = spawn('git', ['archive', '--format=tar', `--prefix=${pin.id}/`, pin.revision], { cwd: sourceRoot, stdio: ['ignore', 'pipe', 'pipe'] });
  const gzip = spawn('gzip', ['-n', '-6'], { stdio: ['pipe', 'pipe', 'pipe'] });
  const complete = child => new Promise((resolve, reject) => {
    let error = ''; child.stderr.on('data', data => error += data);
    child.once('error', reject); child.once('close', code => code === 0 ? resolve() : reject(new Error(`Original archive failed: ${error}`)));
  });
  await Promise.all([complete(git), complete(gzip), pipeline(git.stdout, gzip.stdin), pipeline(gzip.stdout, createWriteStream(temporary))]);
  // A full archive must contain exactly the tracked source tree, including
  // originals which are not individually scattered into the public directory.
  const listing = await command(process.env.HARDWARE_PYTHON || 'python3', ['-c', 'import sys,tarfile,json\nwith tarfile.open(sys.argv[1],"r|gz") as t: print(json.dumps([{ "path":m.name.split("/",1)[1],"size":m.size} for m in t if m.isfile()]))', temporary], { maxBuffer: 32 * 1024 * 1024 });
  const archived = JSON.parse(listing).sort((a, b) => a.path.localeCompare(b.path));
  const expected = files.map(({ path, size }) => ({ path, size })).sort((a, b) => a.path.localeCompare(b.path));
  if (JSON.stringify(archived) !== JSON.stringify(expected)) throw new Error(`Incomplete source archive: ${pin.id}`);
  await fs.rename(temporary, archive);
  await writeJson(metadataPath, { schemaVersion: 1, tree: pin.tree, sha256: await sha256(archive), files: files.length });
  return archive;
}

async function prepareSource(context, id, paths) {
  const pin = context.pins.find(source => source.id === id);
  if (!pin) throw new Error(`Unknown robot source: ${id}`);
  const sourceRoot = await ensureRobotSource(context.repoRoot, pin);
  const files = await sourceIndex(context.repoRoot, sourceRoot, pin);
  const archivePath = await sourceArchive(context.repoRoot, sourceRoot, pin, files);
  const result = await publishSource({
    assetDir: context.assetDir, sourceRoot, archivePath, paths, fileIndex: files,
    source: { id, repository: pin.repository.replace(/\.git$/, ''), revision: pin.revision, tree: pin.tree, license: sourceLicenses[id] },
  });
  context.sources.push(result.source); context.files.push(...result.files);
  return { root: sourceRoot, pin };
}

async function convertedStep(context, { id, source, sourceInfo, deflection = 0.25, angle = 0.45 }) {
  const directory = path.join(context.repoRoot, '.cache/hardware-converted', id);
  const output = path.join(directory, 'assembly.glb');
  const reportFile = path.join(directory, 'conversion.json');
  const converter = path.join(context.repoRoot, 'integrations/hardware/devices/convert-step.py');
  const helperDirectory = path.dirname(converter);
  const helpers = (await fs.readdir(helperDirectory))
    .filter(name => name.endsWith('_tessellation.py') && !name.startsWith('test_'))
    .sort();
  const fingerprint = createHash('sha256').update(await sha256(converter));
  // Every narrowly guarded meshing helper affects the derived geometry. A new,
  // changed or removed helper must invalidate cached output automatically.
  for (const helper of helpers) fingerprint.update(helper).update('\0').update(await sha256(path.join(helperDirectory, helper))).update('\0');
  const auditDirectory = path.join(helperDirectory, 'native-tolerance-audits');
  const audits = await exists(auditDirectory) ? (await fs.readdir(auditDirectory)).filter(name => name.endsWith('.json')).sort() : [];
  // A frozen source's explicit native-tolerance audit is part of the display
  // acceptance recipe, not a general relaxation of the face accuracy gate.
  for (const audit of audits) fingerprint.update(`native-tolerance-audits/${audit}`).update('\0').update(await sha256(path.join(auditDirectory, audit))).update('\0');
  const recipeHash = fingerprint.update(JSON.stringify({ sourceInfo, deflection, angle, sourceSha256: await sha256(source) })).digest('hex');
  const recipeFile = path.join(directory, 'recipe.json');
  const recipe = await readJson(recipeFile);
  const report = await readJson(reportFile);
  const valid = report?.sourceSha256 === await sha256(source) && report?.linearDeflectionMillimetres === deflection && report?.angularDeflectionRadians === angle &&
    report?.unmeshedNondegenerateFaces?.length === 0 && report?.trianglesIncludingInstances > 0 && report?.converter?.version === '7.8.1.1.post1' &&
    await exists(output) && report?.outputSha256 === await sha256(output) && recipe?.hash === recipeHash;
  if (!valid) {
    console.log(`[hardware:${context.id}] Converting original CAD ${sourceInfo.path}`);
    // Previous cache files may be hardlinked into a still-served public/dist
    // tree. Detach the cache path before a converter creates its replacement.
    await fs.rm(output, { force: true });
    await fs.rm(reportFile, { force: true });
    await runLogged(process.env.HARDWARE_PYTHON || 'python3', [converter, source, output, '--report', reportFile, '--source-up-axis', 'Z', '--deflection', String(deflection), '--angle', String(angle), '--provenance-json', JSON.stringify(sourceInfo)], { log: path.join(directory, 'conversion.log') });
  }
  await writeJson(recipeFile, { hash: recipeHash });
  const published = `models/${id}.glb`;
  await linkOrCopy(output, path.join(context.assetDir, published));
  await linkOrCopy(reportFile, path.join(context.assetDir, `reports/${id}-conversion.json`));
  return published;
}

async function originalHtml(sourceRoot, relative) {
  const html = await fs.readFile(path.join(sourceRoot, relative), 'utf8');
  const external = [...html.matchAll(/<(?:script|iframe|img|link|source)\b[^>]*(?:src|href)\s*=\s*["'](https?:\/\/[^"']+)["']/gi)].map(match => match[1]);
  if (external.length) throw new Error(`Original eDrawings HTML requires external static resources: ${external.join(', ')}`);
}

async function buildOdri(context) {
  const hardware = await prepareSource(context, 'odri', ['LICENSE', 'README.md', 'mechanics/actuator_module_v1', 'mechanics/quadruped_robot_12dof_v1/README.md', 'mechanics/quadruped_robot_12dof_v1/details', 'mechanics/quadruped_robot_12dof_v1/solidworks_files', 'mechanics/biped_6dof_v1/README.md']);
  const web = await prepareSource(context, 'odri-web', ['license.txt', 'cad_files/quadruped_12dof.html', 'cad_files/leg_3dof_v1.html', 'cad_files/quadruped_12dof_body_structure.html']);
  const cache = path.join(context.repoRoot, '.cache/hardware-converted/odri-actuator');
  const originalPath = 'mechanics/biped_6dof_v1/cad_files/STEP/biped_6dof_v1.STEP';
  const original = path.join(hardware.root, originalPath);
  const selected = path.join(cache, 'original-upper-leg-actuator.step');
  const selectionReport = path.join(cache, 'selection.json');
  const extraction = path.join(context.repoRoot, 'integrations/hardware/robots/extract-odri-actuator.py');
  const selectionRecipe = createHash('sha256').update(hardware.pin.tree).update(await sha256(extraction)).digest('hex');
  const selectionRecipeFile = path.join(cache, 'selection-recipe.json');
  const previousSelectionRecipe = await readJson(selectionRecipeFile);
  const metadata = await readJson(selectionReport);
  if (metadata?.sourceSha256 !== await sha256(original) || !await exists(selected) || metadata?.outputSha256 !== await sha256(selected) || previousSelectionRecipe?.hash !== selectionRecipe) {
    await fs.rm(selected, { force: true });
    await fs.rm(selectionReport, { force: true });
    await runLogged(process.env.HARDWARE_PYTHON || 'python3', [extraction, original, selected, selectionReport], { log: path.join(cache, 'selection.log') });
  }
  await writeJson(selectionRecipeFile, { hash: selectionRecipe });
  await linkOrCopy(selected, path.join(context.assetDir, 'models/original-upper-leg-actuator.step'));
  await linkOrCopy(selectionReport, path.join(context.assetDir, 'reports/odri-actuator-selection.json'));
  const glb = await convertedStep(context, { id: 'odri-actuator', source: selected, sourceInfo: { repository: hardware.pin.repository, revision: hardware.pin.revision, path: originalPath, selectedOriginalProduct: '_upper_leg_200mm' } });
  const models = [{ id: 'actuator', label: '原上腿执行器总成 · 电机 / 编码器 / 双级皮带', format: 'gltf', path: glb, unit: 'm', up: 'Y', role: 'assembly', source: { id: 'odri', path: originalPath }, limitations: ['从原 Bolt STEP 按产品树选出完整 _upper_leg_200mm 子装配，保留原局部位置；这是静态 CAD，未推断传动与关节运动。'] }];
  for (const [id, file, label] of [['solo12', 'quadruped_12dof.html', 'Solo12 完整原装配 · eDrawings'], ['leg', 'leg_3dof_v1.html', '三自由度单腿原装配 · eDrawings'], ['body', 'quadruped_12dof_body_structure.html', 'Solo12 机身原装配 · eDrawings']]) {
    await originalHtml(web.root, `cad_files/${file}`);
    models.push({ id, label, format: 'html', path: `originals/odri-web/cad_files/${file}`, unit: 'mm', up: 'Z', role: 'original-app', source: { id: 'odri-web', path: `cad_files/${file}` }, limitations: ['原作者导出的自包含 eDrawings HTML；原嵌入运行时及第三方版权声明全部保留。静态装配查看不等于步态或动力学仿真。'] });
  }
  return {
    title: 'ODRI 执行器与 Solo12', description: '原电机、编码器、两级皮带、皮带轮、张紧器与紧固件，以及原作者 Solo12 / 单腿 / 机身装配。', models,
    capabilities: { structure: '原完整执行器子装配 GLB，以及原 Solo12、三自由度单腿和机身 eDrawings；完整硬件源、SolidWorks 原件、STEP、BOM 与图纸可下载。', motion: '静态装配检查与原 eDrawings 查看；本入口没有运行 Solo12 步态、接触物理或电机控制。', live: '未连接真实机器人、驱动板或遥测。' },
    limitations: ['执行器视图是原 Bolt 上腿子装配，不能冒充 Solo12 专属零件总成；完整 Solo12 原装配另有独立入口。', '原 eDrawings HTML 保持字节不变；静态依赖检查通过仍不等于浏览器 WebGL 视觉验收。', 'BSD 源码许可不替代嵌入 eDrawings 和其他第三方运行时的原版权声明。'],
  };
}

async function buildSo101(context) {
  const source = await prepareSource(context, 'so101', ['LICENSE', 'README.md', '3DPRINT.md', 'Simulation/SO101', 'STEP/SO101', 'Software']);
  const originalPath = 'STEP/SO101/SO101 Assembly.step';
  const glb = await convertedStep(context, { id: 'so101', source: path.join(source.root, originalPath), deflection: 0.05, angle: 0.2, sourceInfo: { repository: source.pin.repository, revision: source.pin.revision, path: originalPath } });
  const models = [{ id: 'assembly', label: 'SO101 原 STEP 完整机械装配', format: 'gltf', path: glb, unit: 'm', up: 'Y', role: 'assembly', source: { id: 'so101', path: originalPath }, limitations: ['原 STEP 静态装配；伺服的内部减速齿轮、绕组等未在原件中展开，不能由外壳推断。'] }];
  for (const [id, file, label] of [['follower', 'so101_new_calib.urdf', 'Follower · 新标定'], ['camera', 'so101_new_calib_camera.urdf', 'Follower · 原相机配置'], ['leader', 'so101_leader_new_calib.urdf', 'Leader · 原手柄与扳机'], ['old-calibration', 'so101_old_calib.urdf', 'Follower · 旧标定']]) {
    models.push({ id, label, format: 'urdf', path: `originals/so101/Simulation/SO101/${file}`, unit: 'm', up: 'Z', role: 'kinematic', source: { id: 'so101', path: `Simulation/SO101/${file}` }, limitations: ['原 URDF 的 5 个机械臂关节与夹爪 / 扳机关节可按原轴和范围调整；这是运动学预览，不是 MuJoCo 仿真或实机控制。', ...(id === 'leader' ? ['上游说明 Leader 扳机 0–45° 为暂定范围，打印件惯量来自估算，尚无 Leader MJCF。'] : [])] });
  }
  return {
    title: 'SO101 原机械装配与 Leader / Follower', description: '完整 STEP 装配与四种原 URDF，保留原模型和标定差异；原 MJCF、代码及制造文件同源可下载。', models,
    capabilities: { structure: '原整机 STEP、分件、STL、四种 URDF、Follower MJCF 与制造说明；原装配名称、颜色和实例位置保留。', motion: '原关节运动学与夹爪 / 扳机滑块；新旧标定和相机 / Leader 配置分开显示。原 MJCF 作为下载原件提供。', live: '未连接 LeRobot、STS3215 总线、摄像头或真实 Leader / Follower。' },
    limitations: ['原 STEP 中 11 个 Wiring_holder 产品只有坐标框架、没有曲面；GLB 保留这 11 个原节点与位置，不补造上游未提供的实体。', '当前 URDF/MJCF 没有体现 LeRobot 的夹爪 0–100 线性映射；保留上游原旋转关节定义。', '原作者说明部分电机参数借用 Open Duck Mini，Leader 扳机限位和打印件惯量尚未经实机测定。', '已移除基座碰撞网格是上游模型现状；宿主没有补造碰撞或伺服内部结构。'],
  };
}

async function buildThor(context) {
  const hardware = await prepareSource(context, 'thor', ['LICENSE', 'README.md', 'step', 'doc/wiki', 'doc/ThorDimensions.png']);
  const ros = await prepareSource(context, 'thor-ros', ['LICENSE', 'README.md', 'Docs', 'ws_thor/src/thor_urdf', 'ws_thor/src/thor_controller']);
  const cache = path.join(context.repoRoot, '.cache/hardware-converted/thor');
  await fs.mkdir(cache, { recursive: true });
  const sourcePath = 'freecad-src/Assembly.FCStd';
  const original = path.join(hardware.root, sourcePath);
  const exported = path.join(cache, 'original-assembly.step');
  const colored = path.join(cache, 'native-colored-root-references.step');
  const exportReport = path.join(cache, 'freecad-export.json');
  const selectionReport = path.join(cache, 'assembly-selection.json');
  const caseReport = path.join(cache, 'freecad-case-aliases.json');
  const exportRecipe = createHash('sha256').update(hardware.pin.tree).update(await sha256(path.join(context.repoRoot, 'integrations/hardware/robots/prepare-thor-work.py'))).update(await sha256(path.join(context.repoRoot, 'integrations/hardware/robots/export-thor-headless.py'))).update(await sha256(path.join(context.repoRoot, 'integrations/hardware/robots/select-thor-assembly.py'))).digest('hex');
  const exportRecipeFile = path.join(cache, 'freecad-export-recipe.json');
  const previousRecipe = await readJson(exportRecipeFile);
  const metadata = await readJson(exportReport);
  const selection = await readJson(selectionReport);
  if (metadata?.sourceSha256 !== await sha256(original) || !(metadata?.originalSolids > 0) || !await exists(exported) || selection?.outputSha256 !== await sha256(exported) || selection?.sourceSha256 !== metadata?.outputSha256 || selection?.originalSolids !== metadata?.originalSolids || previousRecipe?.hash !== exportRecipe) {
    const freecad = process.env.HARDWARE_FREECAD_CMD || 'freecadcmd';
    if (!await executableAvailable(freecad)) throw new Error('Thor 原完整装配转换需要 FreeCADCmd 1.0+ 的 App/Part/Import 模块；请安装 FreeCAD 或设置 HARDWARE_FREECAD_CMD。原模型不会被静默跳过。');
    const work = path.join(cache, 'freecad-work');
    await fs.rm(exported, { force: true });
    await fs.rm(colored, { force: true });
    await fs.rm(exportReport, { force: true });
    await fs.rm(selectionReport, { force: true });
    await fs.rm(caseReport, { force: true });
    await runLogged(process.env.HARDWARE_PYTHON || 'python3', [path.join(context.repoRoot, 'integrations/hardware/robots/prepare-thor-work.py'), path.dirname(original), work, caseReport], { log: path.join(cache, 'freecad-work.log') });
    await runLogged(freecad, ['--user-cfg', path.join(cache, 'freecad-user.cfg'), path.join(context.repoRoot, 'integrations/hardware/robots/export-thor-headless.py')], {
      env: { HARDWARE_THOR_SOURCE: path.join(work, 'Assembly.FCStd'), HARDWARE_THOR_ORIGINAL: original, HARDWARE_THOR_STEP: colored, HARDWARE_THOR_REPORT: exportReport }, log: path.join(cache, 'freecad-export.log'), timeout: 10 * 60 * 1000,
    });
    await runLogged(process.env.HARDWARE_PYTHON || 'python3', [path.join(context.repoRoot, 'integrations/hardware/robots/select-thor-assembly.py'), colored, exported, exportReport, selectionReport], { log: path.join(cache, 'assembly-selection.log') });
  }
  await writeJson(exportRecipeFile, { hash: exportRecipe });
  const exportedMetadata = await readJson(exportReport);
  await linkOrCopy(exported, path.join(context.assetDir, 'models/original-assembly.step'));
  await linkOrCopy(exportReport, path.join(context.assetDir, 'reports/thor-freecad-export.json'));
  await linkOrCopy(selectionReport, path.join(context.assetDir, 'reports/thor-assembly-selection.json'));
  await linkOrCopy(caseReport, path.join(context.assetDir, 'reports/thor-freecad-working-copy.json'));
  await convertedStep(context, { id: 'thor', source: exported, sourceInfo: { repository: hardware.pin.repository, revision: hardware.pin.revision, path: sourcePath, intermediate: 'Native FreeCAD saved-assembly STEP export with original GuiDocument per-face colors; original Model subtree selected' } });
  const displayGlb = path.join(cache, 'assembly-with-datums.glb');
  const datumsReport = path.join(cache, 'auxiliary-frames.json');
  const appearanceReport = path.join(cache, 'appearance-verification.json');
  await fs.rm(datumsReport, { force: true });
  await fs.rm(appearanceReport, { force: true });
  await runLogged(process.env.HARDWARE_PYTHON || 'python3', [path.join(context.repoRoot, 'integrations/hardware/robots/retain-thor-datums.py'), path.join(cache, 'assembly.glb'), exportReport, displayGlb, datumsReport], { log: path.join(cache, 'auxiliary-frames.log') });
  await runLogged(process.env.HARDWARE_PYTHON || 'python3', [path.join(context.repoRoot, 'integrations/hardware/robots/verify-thor-appearance.py'), exportReport, displayGlb, appearanceReport], { log: path.join(cache, 'appearance-verification.log') });
  const glb = 'models/thor-with-datums.glb';
  await linkOrCopy(displayGlb, path.join(context.assetDir, glb));
  await linkOrCopy(datumsReport, path.join(context.assetDir, 'reports/thor-auxiliary-frames.json'));
  await linkOrCopy(appearanceReport, path.join(context.assetDir, 'reports/thor-appearance-verification.json'));
  const urdf = path.join(cache, 'thor.urdf');
  const expansionReport = path.join(cache, 'xacro-expansion.json');
  await fs.rm(urdf, { force: true });
  await fs.rm(expansionReport, { force: true });
  await runLogged(process.env.HARDWARE_PYTHON || 'python3', [path.join(context.repoRoot, 'integrations/hardware/robots/expand-thor.py'), ros.root, urdf, expansionReport], { log: path.join(cache, 'xacro-expansion.log') });
  await linkOrCopy(urdf, path.join(context.assetDir, 'models/thor.urdf'));
  await linkOrCopy(expansionReport, path.join(context.assetDir, 'reports/thor-xacro-expansion.json'));
  return {
    title: 'Thor 原机械装配与 ROS 运动模型', description: '从原 FreeCAD 完整装配保留零件、颜色与位置，同时提供原 ROS Xacro 展开的关节预览；原 CAD 与控制项目均可下载。',
    models: [
      { id: 'assembly', label: `完整原机械装配 · ${exportedMetadata.originalSolids} 个原实体`, format: 'gltf', path: glb, unit: 'm', up: 'Y', role: 'assembly', source: { id: 'thor', path: sourcePath }, limitations: ['读取原 FreeCAD 链接、保存几何与位置，经 STEP 转 GLB；无重新建模或运动约束推断。独立转换副本只解决文件名大小写并停用附加工作台的序列化 Python 对象，原 B-rep、颜色与位置数据保留。', '3 个原 LCS 坐标系的无限数学辅助面不作为机械实体绘制；原名、原父级、坐标、辅助类型与原可见性保留在 GLB 无网格节点和报告中，没有生成有限替代平面。'] },
      { id: 'kinematic', label: '原 ROS 关节模型 · 六轴与联动夹爪', format: 'urdf', path: 'models/thor.urdf', unit: 'm', up: 'Z', role: 'kinematic', source: { id: 'thor-ros', path: 'ws_thor/src/thor_urdf/urdf/thor.urdf.xacro' }, packages: { thor_urdf: 'originals/thor-ros/ws_thor/src/thor_urdf/' }, limitations: ['使用标准 xacro 展开原模型，仅将构建机的包查找转为同源 package 路径；6 个机械臂关节与原夹爪 mimic 关系保留。', 'ROS 模型惯性参数是原作者占位值，不用于声称真实动力学。'] },
    ],
    capabilities: { structure: '完整 FreeCAD 原件、原 STEP 分件、齿轮 / 皮带轮 / 张紧器 / 轴承等机械结构，以及原 ROS 网格与文档。', motion: '六轴与联动夹爪的原 URDF 运动学；完整机械 CAD 独立作为静态装配查看。', live: '未启动 ROS 2 / MoveIt / Gazebo，也未连接 Thor 控制器；原控制项目随完整归档保留。' },
    limitations: ['上游根 LICENSE/README 为 CC-BY-SA-4.0，但原 FreeCAD 文档元数据标为 All rights reserved；两者保留，未替作者更改或消除该不一致。', '静态转换使用原保存的 B-rep 和装配位置；原生参数化编辑仍需要作者使用的 Assembly4 / Fasteners / gears 工作台，并处理原旧文件的迁移提示，不能把静态预览当成完整 CAD 编辑器。', '原 ROS 的统一质量 / 惯量值是占位参数；机械装配与运动模型来自两个分别固定版本的官方项目。'],
  };
}

async function buildParol(context) {
  await prepareSource(context, 'parol6-hardware', ['LICENSE', 'README.md', 'BOM', 'Building instructions', 'Print table', 'STL', 'VERSIONS.md', 'SAFETY_WARNING_AND_DISCLAIMER.md']);
  await prepareSource(context, 'parol6-models', ['LICENSE', 'LICENSES', 'ATTRIBUTION.md', 'README.md', 'REPOSITORY_GUIDE.md', 'docs', 'urdf/parol6_description', 'mujoco/parol6']);
  const models = [['flange', 'parol6_flange.urdf', '原法兰 · 六轴机械臂'], ['msg', 'parol6_msg.urdf', 'MSG · 原刚性夹爪'], ['msg-tpu', 'parol6_msg_tpu_glue.urdf', 'MSG · 原 TPU / 胶贴指端'], ['ssg48', 'parol6_ssg48.urdf', 'SSG48 · 原夹持指端'], ['ssg48-stock', 'parol6_ssg48_stock.urdf', 'SSG48 · 原 Fin Ray 指端'], ['pneumatic', 'parol6_pneumatic.urdf', '原气动夹爪']].map(([id, file, label]) => ({ id, label, format: 'urdf', path: `originals/parol6-models/urdf/parol6_description/${file}`, unit: 'm', up: 'Z', role: 'kinematic', source: { id: 'parol6-models', path: `urdf/parol6_description/${file}` }, limitations: ['六轴和夹爪依原 URDF 运动学与 mimic 关系显示；TPU / Fin Ray 也是原刚体模型，未模拟软体变形或实际抓取。'] }));
  return {
    title: 'PAROL6 官方模型与制造资料', description: '六种原工具配置、原网格与运动模型，加上硬件 STL、BOM、装配图纸和固件原件，两套官方来源与许可分别保留。', models,
    capabilities: { structure: '官方中央模型包六种 PAROL6 配置与原 MJCF；硬件仓的 45 个打印 STL、BOM、装配 PDF、打印表及固件完整归档。', motion: '原六轴及夹爪滑块与 mimic 关系；提供运动学预览，原 MuJoCo / MoveIt 文件可下载另行运行。', live: '未连接 RCB、真实机械臂、驱动器或遥测；原项目也将真实硬件联调列为待完成。' },
    limitations: ['此硬件版本没有完整可编辑的整机 STEP 装配；不能将打印 STL 或运动模型冒充传动内部完整 CAD。', '上游 MODEL_STATUS.md 仍将部分关节限位、速度 / effort、摩擦、转子惯量、驱动增益与部分工具惯量列为待确认或估计；J6 保留原 continuous 标签。', '中央模型和文档 CC-BY-4.0，工具与 ROS 支持 Apache-2.0；硬件 CERN-OHL-S-2.0，固件 GPL-3.0。不同来源的许可不可合并替代。'],
  };
}

export async function buildRobots({ repoRoot = ownRoot, ids = robotIds } = {}) {
  const selected = ids.filter(id => robotIds.includes(id));
  if (ids.some(id => !robotIds.includes(id))) throw new Error(`Unknown robot ids: ${ids.filter(id => !robotIds.includes(id)).join(', ')}`);
  const pins = await readJson(path.join(repoRoot, 'integrations/hardware/robots/sources.json'));
  const builders = { odri: buildOdri, so101: buildSo101, thor: buildThor, parol6: buildParol };
  const result = [];
  for (const id of selected) {
    console.log(`[hardware:${id}] Preparing frozen originals and original models`);
    const context = { id, repoRoot, pins, assetDir: path.join(repoRoot, 'public/hardware', id), sources: [], files: [] };
    const data = await builders[id](context);
    const asset = { schemaVersion: 1, id, kind: 'robot', ...data, sources: context.sources, filesIndex: 'originals.json' };
    await writeJson(path.join(context.assetDir, 'asset.json'), asset);
    await writeJson(path.join(context.assetDir, 'originals.json'), { schemaVersion: 1, files: context.files });
    await runLogged(process.env.HARDWARE_PYTHON || 'python3', [path.join(repoRoot, 'integrations/hardware/robots/verify-robots.py'), context.assetDir], { log: path.join(repoRoot, '.cache/hardware-converted', id, 'verification.log') });
    result.push(asset);
    console.log(`[hardware:${id}] ${asset.models.length} original models; ${context.files.length} indexed original files`);
  }
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await ensureHardwarePython({ install: false });
  const ids = process.argv.slice(2);
  await buildRobots({ ids: ids.length ? ids : robotIds });
}
