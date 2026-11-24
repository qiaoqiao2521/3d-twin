import { spawn } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { demoById, digest, ensureSource, locations, run } from './open-demos.mjs';

try {
  const demo = demoById(process.argv[2]);
  if (!demo.backend) throw new Error(`${demo.name} is entirely client-side and needs no backend.`);
  await ensureSource(demo);
  const { cache, source } = locations(demo);
  const python = join(cache, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  try { await access(python); }
  catch { run(process.env.OPEN_DEMO_PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), ['-m', 'venv', join(cache, '.venv')], cache); }
  const requirement = join(source, demo.backend.requirements);
  const stamp = digest(await readFile(requirement));
  const marker = join(cache, '.backend-installed');
  let installed = '';
  try { installed = await readFile(marker, 'utf8'); } catch {}
  if (installed !== stamp) {
    run(python, ['-m', 'pip', 'install', '-r', requirement], source);
    await writeFile(marker, stamp);
    const result = run(python, ['-m', 'pip', 'freeze'], source, { stdio: 'pipe', encoding: 'utf8' });
    await writeFile(join(cache, 'backend-installed.txt'), result);
  }
  if (!process.argv.includes('--setup-only')) {
    const port = Number(process.env[demo.backend.portEnv] || demo.backend.port);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error(`Invalid ${demo.backend.portEnv}`);
    await mkdir(join(cache, 'data'), { recursive: true });
    const args = ['-m', 'uvicorn', demo.backend.app, '--host', '127.0.0.1', '--port', String(port)];
    if (demo.id === 'rftwin') args.push('--ws', 'wsproto');
    const child = spawn(python, args, {
      cwd: resolve(source, demo.backend.cwd), stdio: 'inherit',
      env: { ...process.env, TWIN_DB: process.env.TWIN_DB || join(cache, 'data/twin.db') },
    });
    const stop = (signal) => { if (!child.killed) child.kill(signal); };
    process.once('SIGINT', () => stop('SIGINT'));
    process.once('SIGTERM', () => stop('SIGTERM'));
    console.log(`${demo.name}: original backend → http://127.0.0.1:${port}; host proxy /open-demo-api/${demo.id}/`);
    process.exitCode = await new Promise((done, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => done(signal ? 0 : code ?? 1));
    });
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
