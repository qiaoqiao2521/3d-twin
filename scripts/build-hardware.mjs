import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureHardwarePython, repoRoot } from './hardware/toolchain.mjs';
import { verifyHardware, hardwareIds } from './verify-hardware.mjs';
import { publishHardwareHost } from './hardware/publish-host.mjs';

export async function buildHardware({ ids } = {}) {
  const selected = ids || hardwareIds;
  for (const id of selected) if (!hardwareIds.includes(id)) throw new Error(`Unknown hardware id: ${id}`);
  await ensureHardwarePython({ install: true });
  await publishHardwareHost({ repoRoot });
  const { buildRobots } = await import('./hardware/build-robots.mjs');
  const { buildDevices } = await import('./hardware/build-devices.mjs');
  // Large CAD conversions deliberately run sequentially to limit peak memory.
  const robots = selected.filter(id => ['odri', 'so101', 'thor', 'parol6', 'motoman-weld'].includes(id));
  const devices = selected.filter(id => !robots.includes(id));
  if (robots.length) await buildRobots({ repoRoot, ids: robots });
  if (devices.length) await buildDevices({ repoRoot, ids: devices });
  await verifyHardware({ root: path.join(repoRoot, 'public'), ids: selected });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ids = process.argv.slice(2).filter(value => !value.startsWith('--'));
  await buildHardware({ ids: ids.length ? ids : undefined });
}
