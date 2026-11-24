import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
export async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
export async function linkOrCopy(from, to) {
  await fs.mkdir(path.dirname(to), { recursive: true });
  try {
    const [a, b] = await Promise.all([fs.stat(from), fs.stat(to)]);
    if (a.ino === b.ino && a.dev === b.dev) return;
  } catch { /* First publication. */ }
  await fs.rm(to, { force: true });
  try { await fs.link(from, to); }
  catch (error) {
    if (!['EXDEV', 'EPERM', 'EACCES', 'ENOTSUP', 'EMLINK'].includes(error.code)) throw error;
    await fs.copyFile(from, to);
  }
}
export function safeRelative(value) {
  const normalized = String(value).replaceAll('\\', '/');
  if (!normalized || normalized.startsWith('/') || normalized.split('/').includes('..') || normalized.includes('\0')) throw new Error(`Unsafe source path: ${value}`);
  return normalized.replace(/^\.\//, '');
}
async function walk(root, relative = '') {
  const result = [];
  for (const entry of await fs.readdir(path.join(root, relative), { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const name = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) result.push(...await walk(root, name));
    else if (entry.isFile()) result.push(name);
  }
  return result;
}
async function archiveIndex(archivePath) {
  // Streaming inspection: all archived originals are indexed without another full extraction.
  const script = `import json,sys,tarfile,zipfile,posixpath
p=sys.argv[1]
rows=[]
if zipfile.is_zipfile(p):
 with zipfile.ZipFile(p) as z:
  rows=[{'path':i.filename,'size':i.file_size} for i in z.infolist() if not i.is_dir()]
else:
 with tarfile.open(p,'r|*') as t:
  for i in t:
   if i.isfile() or i.issym(): rows.append({'path':i.name,'size':i.size})
names=[r['path'].removeprefix('./') for r in rows]
roots={n.split('/')[0] for n in names}
strip=len(roots)==1 and all('/' in n for n in names)
for row,name in zip(rows,names): row['path']=name.split('/',1)[1] if strip else name
print(json.dumps(rows,ensure_ascii=False))`;
  const { stdout } = await exec(process.env.HARDWARE_PYTHON || 'python3', ['-c', script, archivePath], { maxBuffer: 50 * 1024 * 1024 });
  return JSON.parse(stdout);
}

/** Publish byte-identical originals. Never edit a hardlinked source after this call. */
export async function publishSource({ assetDir, sourceRoot, source, archivePath, paths, fileIndex }) {
  if (!source.id || !source.repository || !/^[a-f0-9]{40}$/i.test(source.revision || '')) throw new Error('A frozen source requires id, repository and full commit SHA');
  const published = { ...source, repository: source.repository.startsWith('https://') ? source.repository : `https://github.com/${source.repository.replace(/\.git$/, '')}`, root: source.root || `originals/${source.id}/` };
  const rows = new Map();
  if (archivePath) {
    published.archive = source.archive || `originals/${source.id}${archivePath.endsWith('.zip') ? '.zip' : '.tar.gz'}`;
    await linkOrCopy(archivePath, path.join(assetDir, safeRelative(published.archive)));
    published.archiveSha256 = await sha256(archivePath);
    published.archiveSize = (await fs.stat(archivePath)).size;
    const index = fileIndex || await archiveIndex(archivePath);
    for (const entry of index) {
      const name = safeRelative(entry.path);
      rows.set(name, { ...entry, path: name, sourceId: source.id, archive: published.archive });
    }
  }
  if (sourceRoot) {
    let names;
    if (paths) {
      names = [];
      for (const name of paths) {
        const relative = safeRelative(name);
        const info = await fs.stat(path.join(sourceRoot, relative));
        names.push(...(info.isDirectory() ? (await walk(path.join(sourceRoot, relative))).map(p => path.posix.join(relative, p)) : [relative]));
      }
    } else {
      try {
        const { stdout } = await exec('git', ['ls-files', '-z'], { cwd: sourceRoot, maxBuffer: 20 * 1024 * 1024 });
        names = stdout.split('\0').filter(Boolean);
        if (!names.length) names = await walk(sourceRoot);
      } catch { names = await walk(sourceRoot); }
    }
    for (const name of [...new Set(names)].sort()) {
      const relative = safeRelative(name);
      const from = path.join(sourceRoot, relative);
      const stat = await fs.stat(from);
      if (!stat.isFile()) continue;
      const actual = await fs.realpath(from);
      const root = await fs.realpath(sourceRoot);
      if (!actual.startsWith(`${root}${path.sep}`)) throw new Error(`Source symlink leaves original tree: ${name}`);
      const url = path.posix.join(published.root, relative);
      await linkOrCopy(from, path.join(assetDir, safeRelative(url)));
      rows.set(relative, { ...(rows.get(relative) || {}), sourceId: source.id, path: relative, size: stat.size, sha256: await sha256(from), url, ...(published.archive ? { archive: published.archive } : {}) });
    }
  }
  if (!rows.size) throw new Error(`No original files published for ${source.id}`);
  published.fileCount = rows.size;
  return { source: published, files: [...rows.values()].sort((a, b) => a.path.localeCompare(b.path)) };
}

export async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  try {
    await fs.writeFile(temporary, JSON.stringify(data, null, 2) + '\n');
    // A published or previous dist file can share this inode. Replace the
    // directory entry, never truncate a hardlinked earlier release in place.
    await fs.rename(temporary, file);
  } finally { await fs.rm(temporary, { force: true }); }
}
