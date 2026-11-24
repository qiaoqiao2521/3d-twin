import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ensureRobotSource } from '../../../scripts/hardware/build-robots.mjs';

const exec = promisify(execFile);
const author = ['-c', 'user.name=Hardware source fixture', '-c', 'user.email=fixture@example.invalid'];
async function git(cwd, ...args) {
  return (await exec('git', args, { cwd })).stdout.trim();
}
async function fixture(context) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'robot-source-cache-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const remote = path.join(root, 'remote');
  await fs.mkdir(remote);
  await git(remote, 'init', '-q');
  await fs.writeFile(path.join(remote, 'LICENSE'), 'Test fixture license notice\n');
  await fs.writeFile(path.join(remote, 'model.txt'), 'Original fixture model\n');
  await git(remote, 'add', 'LICENSE', 'model.txt');
  await git(remote, ...author, 'commit', '-q', '-m', 'Frozen source fixture');
  const pin = {
    id: 'fixture', repository: remote,
    revision: await git(remote, 'rev-parse', 'HEAD'),
    tree: await git(remote, 'rev-parse', 'HEAD^{tree}'),
    licensePath: 'LICENSE', licenseBlob: await git(remote, 'rev-parse', 'HEAD:LICENSE'),
  };
  const cache = path.join(root, '.cache/hardware-sources/fixture');
  return { root, remote, pin, cache };
}
async function initializeEmpty(cache, repository) {
  await fs.mkdir(cache, { recursive: true });
  await git(cache, 'init', '-q');
  if (repository) await git(cache, 'remote', 'add', 'origin', repository);
}

test('retries a real failed fetch from an empty unborn-HEAD cache', async context => {
  const { root, remote, pin, cache } = await fixture(context);
  const availableLater = path.join(root, 'available-later');
  pin.repository = availableLater;
  await assert.rejects(ensureRobotSource(root, pin), /git failed/);
  await fs.access(path.join(cache, '.git'));
  await assert.rejects(git(cache, 'rev-parse', '--verify', 'HEAD'));
  await fs.rename(remote, availableLater);
  assert.equal(await ensureRobotSource(root, pin), cache);
  assert.equal(await git(cache, 'rev-parse', 'HEAD'), pin.revision);
  assert.equal(await fs.readFile(path.join(cache, 'model.txt'), 'utf8'), 'Original fixture model\n');
  assert.equal(await git(cache, 'status', '--porcelain'), '');
});

test('resumes an empty initialization before origin was installed', async context => {
  const { root, pin, cache } = await fixture(context);
  await initializeEmpty(cache);
  await ensureRobotSource(root, pin);
  assert.equal(await git(cache, 'rev-parse', 'HEAD'), pin.revision);
});

test('refuses unknown working files in an unborn-HEAD cache', async context => {
  const { root, pin, cache } = await fixture(context);
  await initializeEmpty(cache, pin.repository);
  const file = path.join(cache, 'user-data.txt');
  await fs.writeFile(file, 'Preserve this user file\n');
  await assert.rejects(ensureRobotSource(root, pin), /contains existing data or refs/);
  assert.equal(await fs.readFile(file, 'utf8'), 'Preserve this user file\n');
  await assert.rejects(git(cache, 'rev-parse', '--verify', 'HEAD'));
});

test('refuses staged data even when its working file has been deleted', async context => {
  const { root, pin, cache } = await fixture(context);
  await initializeEmpty(cache, pin.repository);
  const file = path.join(cache, 'staged-user-data.txt');
  await fs.writeFile(file, 'Keep the staged contents\n');
  await git(cache, 'add', 'staged-user-data.txt');
  await fs.rm(file);
  await assert.rejects(ensureRobotSource(root, pin), /contains existing data or refs/);
  assert.equal(await git(cache, 'show', ':staged-user-data.txt'), 'Keep the staged contents');
});

test('refuses a different origin in an otherwise empty cache', async context => {
  const { root, pin, cache } = await fixture(context);
  const other = path.join(root, 'other-origin');
  await initializeEmpty(cache, other);
  await assert.rejects(ensureRobotSource(root, pin), /different origin/);
  assert.equal(await git(cache, 'remote', 'get-url', 'origin'), other);
});

test('does not reset an existing wrong commit', async context => {
  const { root, pin, cache } = await fixture(context);
  await ensureRobotSource(root, pin);
  await git(cache, ...author, 'commit', '--allow-empty', '-q', '-m', 'Different existing commit');
  const existing = await git(cache, 'rev-parse', 'HEAD');
  await assert.rejects(ensureRobotSource(root, pin), /Frozen source mismatch/);
  assert.equal(await git(cache, 'rev-parse', 'HEAD'), existing);
});

test('does not reset edited originals or publish untracked additions', async context => {
  const { root, pin, cache } = await fixture(context);
  await ensureRobotSource(root, pin);
  const original = path.join(cache, 'model.txt');
  await fs.writeFile(original, 'User edits\n');
  await assert.rejects(ensureRobotSource(root, pin), /local changes or extra files/);
  assert.equal(await fs.readFile(original, 'utf8'), 'User edits\n');
  await fs.writeFile(original, 'Original fixture model\n');
  const added = path.join(cache, 'user-added.txt');
  await fs.writeFile(added, 'Keep addition\n');
  await assert.rejects(ensureRobotSource(root, pin), /local changes or extra files/);
  assert.equal(await fs.readFile(added, 'utf8'), 'Keep addition\n');
});
