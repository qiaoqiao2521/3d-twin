// Historical command retained as an index-only entry point. Never fabricate upstream files.
import { writeRoboticsArchive } from './robotics-archive.mjs';
const args = process.argv.slice(2);
if (args.some(arg => arg !== '--check')) throw new Error('Usage: node scripts/generate_all.mjs [--check]');
writeRoboticsArchive({ check: args.includes('--check') });
