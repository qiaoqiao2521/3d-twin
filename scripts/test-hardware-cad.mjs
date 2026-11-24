import { spawn } from 'node:child_process';
import { ensureHardwarePython, repoRoot } from './hardware/toolchain.mjs';

const python = await ensureHardwarePython();
await new Promise((resolve, reject) => {
  const child = spawn(python, ['-m', 'unittest', 'discover', '-s', 'integrations/hardware/devices', '-p', 'test_*.py', '-v'], { cwd: repoRoot, stdio: 'inherit' });
  child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Original CAD conversion regressions failed (${code})`)));
});
