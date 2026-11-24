import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ROBOT_PACKS } from '../src/utils/manifestUtils.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const adaptedPaths = new Set([
  'rexrov2/rexrov2_description/robots/rexrov2_oberon7.xacro',
  'bluerov2/bluerov2_description/urdf/thrusters.xacro',
  'unitree_ros/robots/z1_description/xacro/z1.urdf',
  'unitree_ros/robots/z1_description/urdf/z1.urdf',
]);
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
export const isSyntheticBaseline = text => text.includes('LOCAL_GENERATED_DEMONSTRATION_NOT_UPSTREAM') ||
  (/现实基准原件(?:索引)?\s*[:：]/.test(text) &&
    (/<link\s+name="link_1"/.test(text) || /<geom\s+name="torso_hull"/.test(text)));

function checkedRelative(value) {
  if (typeof value !== 'string' || !value || path.posix.isAbsolute(value) || value.includes('\\') || value.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error(`Invalid archive path: ${value}`);
  }
  return value;
}

/** Index existing bytes only. This function never creates or repairs an upstream file. */
export function buildRoboticsArchive(projectRoot = root, packs = ROBOT_PACKS) {
  const base = path.join(projectRoot, 'public/baselines');
  const archive = JSON.parse(fs.readFileSync(path.join(base, 'MANIFEST_全量机器人基准清单.json'), 'utf8'));
  const summary = { repositories: archive.length, indexedKinematic: 0, indexedDocuments: 0, availableKinematic: 0, availableDocuments: 0, missing: 0, synthetic: 0, adapted: 0, localDocuments: 0 };
  const findings = [];
  const manifest = archive.map(repo => {
    const category = checkedRelative(repo.category), repository = checkedRelative(repo.repository);
    const directory = path.join(base, category, repository);
    const kinematicFiles = new Set((repo.kinematicFiles || []).map(checkedRelative));
    const docFiles = new Set((repo.docFiles || []).map(checkedRelative));
    const primaryDirectory = path.join(directory, '_首选基准原件_PRIMARY');
    if (fs.existsSync(primaryDirectory)) {
      for (const entry of fs.readdirSync(primaryDirectory, { withFileTypes: true })) {
        if (!entry.isFile()) continue;
        const relative = `_首选基准原件_PRIMARY/${entry.name}`;
        (/\.(urdf|xml|xacro|sdf)$/i.test(entry.name) ? kinematicFiles : docFiles).add(checkedRelative(relative));
      }
    }
    for (const pack of packs.filter(pack => pack.baselineRepo === `${category}/${repository}`)) kinematicFiles.add(checkedRelative(pack.primaryUrdf));
    if (fs.existsSync(path.join(directory, '00_来源与结构说明.md'))) docFiles.add('00_来源与结构说明.md');
    const files = [...new Set([...kinematicFiles, ...docFiles])];
    const fileIssues = {};
    for (const relative of files) {
      const file = path.join(directory, relative);
      let issue;
      if (!fs.existsSync(file)) {
        issue = { status: 'missing', reason: '历史清单包含此文件，当前归档缺失；上游固定版本与该资源许可未核实，未生成替代文件。' };
        summary.missing++;
      } else {
        if (!fs.statSync(file).isFile() || !fs.realpathSync(file).startsWith(fs.realpathSync(directory) + path.sep)) throw new Error(`Archive escaped its repository: ${file}`);
        const text = /\.(urdf|xml|xacro|sdf|md|txt)$/i.test(relative) ? fs.readFileSync(file, 'utf8') : '';
        if (isSyntheticBaseline(text)) {
          issue = { status: 'synthetic', reason: '历史 generate_all 生成的示意链；不是上游原件，不能用于真实机器人控制。' };
          const candidate = `_首选基准原件_PRIMARY/${path.posix.basename(relative)}`;
          const candidateFile = path.join(directory, candidate);
          if (files.includes(candidate) && fs.existsSync(candidateFile) && !isSyntheticBaseline(fs.readFileSync(candidateFile, 'utf8'))) issue.preferredPath = candidate;
          summary.synthetic++;
        } else if (adaptedPaths.has(`${repository}/${relative}`)) {
          issue = { status: 'adapted', reason: '本仓展开或补充的关节适配文件，来源见 compile_real_cad_glbs.mjs；不是原仓逐字节文件。' };
          summary.adapted++;
        } else if (relative === '00_来源与结构说明.md' || (relative === 'README.md' && text.includes('**Primary Kinematic Baseline**:') && text.includes('**Kinematic Topology**:'))) {
          issue = { status: 'local-document', reason: '历史本地导览，原版与零修改等旧声明需以当前档案状态核对。' };
          summary.localDocuments++;
        }
      }
      if (issue) { fileIssues[relative] = issue; findings.push({ repository, category, path: relative, ...issue }); }
    }
    const kinematic = [...kinematicFiles].sort(), documents = [...docFiles].sort();
    const available = list => list.filter(file => fileIssues[file]?.status !== 'missing').length;
    const availableCounts = { kinematic: available(kinematic), documents: available(documents) };
    let primaryBaselineFile = checkedRelative(repo.primaryBaselineFile || kinematic[0] || documents[0]);
    if (fileIssues[primaryBaselineFile]?.preferredPath) primaryBaselineFile = fileIssues[primaryBaselineFile].preferredPath;
    if (['missing', 'synthetic'].includes(fileIssues[primaryBaselineFile]?.status)) {
      primaryBaselineFile = kinematic.find(file => !['missing', 'synthetic'].includes(fileIssues[file]?.status)) || documents.find(file => !fileIssues[file]) || primaryBaselineFile;
    }
    summary.indexedKinematic += kinematic.length; summary.indexedDocuments += documents.length;
    summary.availableKinematic += availableCounts.kinematic; summary.availableDocuments += availableCounts.documents;
    return {
      category, repository, description: repo.description, upstreamUrl: repo.upstreamUrl,
      primaryBaselineFile, kinematicFileCount: kinematic.length, docFileCount: documents.length,
      archiveCounts: { kinematic: repo.kinematicFileCount, documents: repo.docFileCount },
      availableCounts, kinematicFiles: kinematic, docFiles: documents, fileIssues,
    };
  });
  const selectedSources = packs.map(pack => {
    const relative = `${pack.baselineRepo}/${pack.primaryUrdf}`;
    const bytes = fs.readFileSync(path.join(base, relative));
    if (isSyntheticBaseline(bytes.toString())) throw new Error(`${pack.id} selects a synthetic baseline`);
    return { id: pack.id, path: relative, bytes: bytes.length, sha256: hash(bytes), note: pack.baselineNote || '既有归档来源；机型与 GLB 结构由专属验证器检查，未伪称完整上游提交已核验。' };
  });
  return { manifest, audit: { schema: 1, sourceManifest: 'public/baselines/MANIFEST_全量机器人基准清单.json', summary, selectedSources, findings } };
}

export function writeRoboticsArchive({ projectRoot = root, check = false } = {}) {
  const { manifest, audit } = buildRoboticsArchive(projectRoot);
  for (const [relative, value] of [['src/robotics_manifest.json', manifest], ['docs/robotics-archive-status.json', audit]]) {
    const file = path.join(projectRoot, relative), text = JSON.stringify(value, null, 2) + '\n';
    if (check) {
      if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== text) throw new Error(`${relative} is stale; run node scripts/generate_all.mjs`);
    } else {
      fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text);
    }
  }
  console.log(JSON.stringify({ ...audit.summary, mode: check ? 'checked' : 'indexed existing files; upstream bytes unchanged' }, null, 2));
  return audit;
}
