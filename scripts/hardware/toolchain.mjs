import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const requirements = { 'cadquery-ocp': '7.8.1.1.post1', xacro: '2.1.1' };
function run(command, args, capture = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: repoRoot, stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
    let output = ''; if (capture) { child.stdout.on('data', data => output += data); child.stderr.on('data', data => output += data); }
    child.on('error', reject); child.on('close', code => code === 0 ? resolve(output.trim()) : reject(new Error(`${command} exited ${code}${capture ? `: ${output.slice(-1000)}` : ''}`)));
  });
}
async function matches(python) {
  try {
    const output = await run(python, ['-c', 'import sys; assert sys.version_info >= (3,11); import importlib.metadata as m,json; import OCP,xacro; print(json.dumps({p:m.version(p) for p in ["cadquery-ocp","xacro"]}))'], true);
    const installed = JSON.parse(output);
    return Object.entries(requirements).every(([name, version]) => installed[name] === version);
  } catch { return false; }
}
export async function ensureHardwarePython({ install = false } = {}) {
  const local = path.join(repoRoot, '.cache/hardware/python', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  for (const candidate of [...new Set([process.env.HARDWARE_PYTHON, local, 'python3', 'python'].filter(Boolean))]) {
    if (await matches(candidate)) { process.env.HARDWARE_PYTHON = candidate; return candidate; }
  }
  if (!install) throw new Error('CAD 工具链尚未准备：先运行 npm run install:hardware（Python 3.11+、cadquery-ocp 7.8.1.1.post1、xacro 2.1.1）；原件不会被替代或静默跳过。');
  let bootstrap;
  for (const candidate of [process.env.HARDWARE_PYTHON, 'python3', 'python'].filter(Boolean)) {
    try { await run(candidate, ['-c', 'import sys; assert sys.version_info >= (3,11)'], true); bootstrap = candidate; break; } catch { /* Try another Python executable. */ }
  }
  if (!bootstrap) throw new Error('请先安装 Python 3.11 或更新版本，再运行 npm run install:hardware。');
  await fs.mkdir(path.dirname(path.dirname(local)), { recursive: true });
  // Reuse a matching host OCP wheel when available; pinned dependencies installed
  // into this project environment shadow any incompatible system packages.
  await run(bootstrap, ['-m', 'venv', '--system-site-packages', path.join(repoRoot, '.cache/hardware/python')]);
  await run(local, ['-m', 'pip', 'install', '--disable-pip-version-check', '--no-cache-dir', ...Object.entries(requirements).map(([name, version]) => `${name}==${version}`)]);
  if (!await matches(local)) throw new Error('固定 CAD 工具链安装后校验失败');
  process.env.HARDWARE_PYTHON = local; return local;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Hardware Python: ${await ensureHardwarePython({ install: true })}`);
}
