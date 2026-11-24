import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function requireRoboticsSourceRoot(repositories = []) {
  const directory = path.resolve(process.env.ROBOTICS_SOURCE_ROOT || path.join(root, '.cache/robotics-upstream'));
  for (const repository of repositories) {
    if (!fs.existsSync(path.join(directory, repository))) throw new Error(`Missing original source ${repository} under ${directory}. Set ROBOTICS_SOURCE_ROOT to complete, version-checked upstream checkouts; legacy converters never synthesize a missing original.`);
  }
  return directory;
}

export function roboticsSourceFile(relative) {
  if (!relative || path.isAbsolute(relative) || relative.split('/').includes('..')) throw new Error(`Invalid robotics source path: ${relative}`);
  const file = path.join(requireRoboticsSourceRoot(), relative);
  if (!fs.existsSync(file)) throw new Error(`Missing original source: ${file}. Set ROBOTICS_SOURCE_ROOT; no generated substitute will be used.`);
  return file;
}
