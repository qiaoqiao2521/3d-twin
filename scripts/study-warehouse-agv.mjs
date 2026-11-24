import { createAgvStudy } from '../research/smart-warehouse/agvStudy.ts';

const args = process.argv.slice(2);
if (args.length !== 2 || args.some((value) => !value.trim())) {
  console.error('Usage: npm run study:warehouse -- <route-length> <unload-progress>\nExample fixture: npm run study:warehouse -- 60 0.55\nParameters are supplied study data, not measured warehouse geometry.');
  process.exit(1);
}
const [routeLength, unloadProgress] = args.map(Number);
const study = createAgvStudy(routeLength, unloadProgress);
const frames = [];
frames.push({ action: 'start', ...study.snapshot() });
frames.push({ action: 'advance 8 seconds', ...study.step(8) });
study.pause();
frames.push({ action: 'pause for 30 seconds', ...study.step(30) });
study.resume();
frames.push({ action: 'resume for 4 seconds', ...study.step(4) });
console.log(JSON.stringify({
  kind: 'independent-state-study',
  provenance: 'Xxcool/smart-warehouse@13f04d17304fedbc4cb4cf53002c4eb4abc4d188',
  inputs: { routeLength, unloadProgress, vehicleCount: 7, origin: 'user-supplied-study-parameters' },
  capabilities: ['fixed-route-phase-sampling', 'caller-clock', 'pause-resume', 'deterministic-seek'],
  notImplemented: ['rendering', 'collision-avoidance', 'path-planning', 'task-dispatch', 'device-connection'],
  frames
}, null, 2));
