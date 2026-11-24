import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { Group, Vector3 } from 'three';
import { ROBOT_PACKS, parseUrdfJoints, filterMovableJoints } from '../src/utils/manifestUtils.ts';
import { createExactNodeIndex, resolveExactJointNode } from '../src/utils/jointBinding.ts';
import { applyRobotJointPose } from '../src/utils/robotJointPose.ts';
import { roboticsAssetUrl } from '../src/utils/roboticsRoute.ts';
import { buildRoboticsArchive, writeRoboticsArchive } from './robotics-archive.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.some(arg => !arg.startsWith('--base=') && !['--serve', '--preview'].includes(arg))) throw new Error('Usage: node scripts/verify-robotics.mjs [--base=http://127.0.0.1:3000 | --serve | --preview]');
let base = args.find(arg => arg.startsWith('--base='))?.slice(7);
if ([Boolean(base), args.includes('--serve'), args.includes('--preview')].filter(Boolean).length > 1) throw new Error('Choose one HTTP server mode');
let server;
try {
if (args.includes('--serve') || args.includes('--preview')) {
  const vite = await import('vite');
  if (args.includes('--preview')) {
    server = await vite.preview({ root, preview: { host: '127.0.0.1', port: 0, strictPort: false } });
  } else {
    server = await vite.createServer({ root, server: { host: '127.0.0.1', port: 0, strictPort: false, watch: null } });
    await server.listen();
  }
  const address = server.httpServer.address();
  base = `http://127.0.0.1:${address.port}`;
}
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
writeRoboticsArchive({ check: true });
const { manifest, audit } = buildRoboticsArchive();
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
const models = [];
for (const pack of ROBOT_PACKS) {
  const file = path.join(root, 'public', pack.glbUrl);
  const before = hash(fs.readFileSync(file));
  // Read and actually decode every primitive, including Draco. No browser renderer is involved.
  const document = await io.read(file);
  const originalNodes = document.getRoot().listNodes();
  const graph = new Group();
  const mapping = new Map(originalNodes.map(original => {
    const node = new Group(); node.name = original.getName();
    node.position.fromArray(original.getTranslation()); node.quaternion.fromArray(original.getRotation()); node.scale.fromArray(original.getScale());
    return [original, node];
  }));
  for (const original of originalNodes) for (const child of original.listChildren()) mapping.get(original).add(mapping.get(child));
  for (const node of mapping.values()) if (!node.parent) graph.add(node);
  graph.updateMatrixWorld(true);
  const index = createExactNodeIndex(mapping.values());
  const joints = parseUrdfJoints(fs.readFileSync(path.join(root, 'public/baselines', pack.baselineRepo, pack.primaryUrdf), 'utf8'));
  const movable = filterMovableJoints(joints);
  assert.ok(movable.length > 0, `${pack.id} has no controllable joint definitions`);
  let exercised = 0;
  for (const joint of joints) {
    const result = resolveExactJointNode(index, joint.child, node => node.parent?.name === joint.parent);
    assert.equal(result.status, 'bound', `${pack.id}/${joint.name}: ${result.status}`);
    const node = result.node, position = node.position.clone(), quaternion = node.quaternion.clone();
    if (joint.type === 'fixed') continue;
    const axis = new Vector3(...joint.axis).normalize();
    assert.ok(axis.lengthSq() > .99, `${pack.id}/${joint.name}: invalid axis`);
    const lower = joint.type === 'continuous' ? -.5 : joint.lower, upper = joint.type === 'continuous' ? .5 : joint.upper;
    assert.ok(Number.isFinite(lower) && Number.isFinite(upper) && lower <= upper, `${pack.id}/${joint.name}: invalid limits`);
    const value = Math.max(lower, Math.min(upper, joint.type === 'prismatic' ? .02 : .25));
    const beforeMatrix = node.matrixWorld.toArray();
    applyRobotJointPose(node, joint.type, axis, position, quaternion, value);
    graph.updateMatrixWorld(true);
    assert.ok(node.matrixWorld.elements.every(Number.isFinite));
    if (Math.abs(value) > 1e-9) assert.notDeepEqual(node.matrixWorld.toArray(), beforeMatrix, `${pack.id}/${joint.name}: transform did not change`);
    applyRobotJointPose(node, joint.type, axis, position, quaternion, 0);
    graph.updateMatrixWorld(true);
    assert.deepEqual(node.position.toArray(), position.toArray());
    assert.ok(node.quaternion.angleTo(quaternion) < 1e-7);
    exercised++;
  }
  let triangles = 0;
  for (const mesh of document.getRoot().listMeshes()) for (const primitive of mesh.listPrimitives()) {
    const positions = primitive.getAttribute('POSITION');
    assert.ok(positions && positions.getCount() > 0, `${pack.id}: missing decoded geometry`);
    triangles += (primitive.getIndices()?.getCount() || positions.getCount()) / 3;
  }
  assert.equal(hash(fs.readFileSync(file)), before, 'Verification must never change a published GLB');
  models.push({ id: pack.id, baseline: `${pack.baselineRepo}/${pack.primaryUrdf}`, nodes: originalNodes.length,
    meshes: document.getRoot().listMeshes().length, triangles, parsedJoints: joints.length, boundJoints: joints.length,
    exercisedMovableJoints: exercised, glbSha256: before });
}

let httpRequests = 0, servedBytes = 0;
if (base) {
  const files = new Set(ROBOT_PACKS.flatMap(pack => [pack.glbUrl.slice(1), pack.previewUrl.slice(1)]));
  const missing = [];
  for (const repo of manifest) for (const file of [...repo.kinematicFiles, ...repo.docFiles]) {
    const relative = `baselines/${repo.category}/${repo.repository}/${file}`;
    if (repo.fileIssues[file]?.status === 'missing') missing.push(relative); else files.add(relative);
  }
  const queue = [...files];
  await Promise.all(Array.from({ length: 4 }, async () => {
    for (;;) {
      const relative = queue.shift(); if (!relative) return;
      const expected = fs.readFileSync(path.join(root, 'public', relative));
      const url = new URL(roboticsAssetUrl(relative), base);
      const response = await fetch(url); httpRequests++;
      assert.equal(response.status, 200, relative);
      const actual = Buffer.from(await response.arrayBuffer());
      assert.equal(hash(actual), hash(expected), `${relative}: served bytes differ or server returned SPA HTML`);
      servedBytes += actual.length;
    }
  }));
  // Vite's default public middleware previously returned SPA HTML for this valid
  // percent-encoded '+' path. Keep an independent encoded-path regression even
  // though the workbench's canonical asset URL preserves literal '+'.
  const plusPath = [...files].find(relative => relative.endsWith('/R1_C++.xml'));
  assert.ok(plusPath, 'Missing the real R1_C++.xml fixture for encoded-path verification');
  const encodedPlusUrl = new URL(`/${plusPath.split('/').map(encodeURIComponent).join('/')}`, base);
  assert.ok(encodedPlusUrl.pathname.includes('%2B%2B'));
  const encodedPlusResponse = await fetch(encodedPlusUrl); httpRequests++;
  assert.equal(encodedPlusResponse.status, 200, 'Encoded + archive path must serve its actual file');
  const encodedPlusBytes = Buffer.from(await encodedPlusResponse.arrayBuffer());
  assert.equal(hash(encodedPlusBytes), hash(fs.readFileSync(path.join(root, 'public', plusPath))), 'Encoded + archive path returned different bytes or SPA HTML');
  servedBytes += encodedPlusBytes.length;
  // The UI prevents missing-file fetches. Servers must not relabel a missing file as an original.
  for (const relative of [missing[0], 'baselines/__missing_robot.urdf'].filter(Boolean)) {
    const response = await fetch(new URL(roboticsAssetUrl(relative), base)); httpRequests++;
    assert.equal(response.status, 404, `${relative}: missing archive resources must return 404`);
  }
}
const report = { schema: 1, date: new Date().toISOString(), node: process.version, archive: audit.summary,
  models, parsedJoints: models.reduce((sum, model) => sum + model.parsedJoints, 0),
  exercisedMovableJoints: models.reduce((sum, model) => sum + model.exercisedMovableJoints, 0),
  http: base ? { kind: args.includes('--preview') ? 'Vite production preview' : args.includes('--serve') ? 'Vite development server' : 'external server', base, requests: httpRequests, bytes: servedBytes } : 'not-run',
  scope: 'Original GLB decode, exact structural binding, CPU joint transforms, archive source status; no browser rendering, dynamics or hardware validation',
  browser: 'not-run' };
fs.writeFileSync(path.join(root, 'docs/robotics-verification.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ models: models.length, boundJoints: report.parsedJoints, exercisedMovableJoints: report.exercisedMovableJoints, http: report.http, browser: report.browser }, null, 2));
} finally {
  if (server) {
    if ('close' in server) await server.close();
    else await new Promise(resolve => server.httpServer.close(resolve));
  }
}
