import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DOMParser, Document, Element } from 'linkedom';
import * as THREE from 'three';
import URDFLoader from 'urdf-loader';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { HARDWARE_CATALOG, validateHardwareAsset } from '../src/utils/hardware.ts';

// A DOM parser is needed for actual upstream URDF/Collada parsing. There is no
// browser, canvas, WebGL context, fabricated mesh, image decoder or hardware I/O.
Object.assign(globalThis, { DOMParser, Document, Element });
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const vector = (value, fallback) => value ? value.trim().split(/\s+/).map(Number) : fallback;
const children = (element, tag) => [...element.children].filter(child => child.tagName === tag);
const child = (element, tag) => children(element, tag)[0];
const scalar = (value, fallback = 0) => value == null ? fallback : Number(value);
const close = (a, b, label) => assert.ok(Math.abs(a - b) < 1e-7, `${label}: ${a} != ${b}`);

function dispose(root) {
  const geometries = new Set(), materials = new Set();
  root.traverse(node => {
    if (node.geometry) geometries.add(node.geometry);
    if (node.material) for (const item of Array.isArray(node.material) ? node.material : [node.material]) materials.add(item);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  root.clear();
}

export async function verifyHardwareUrdfModel(asset, model, assetRoot) {
  const label = `${asset.id}/${model.id}`;
  const resources = new Map();
  const checkedPath = value => {
    const file = value.startsWith('file:') ? fileURLToPath(value) : path.resolve(assetRoot, value);
    const real = fs.realpathSync(file);
    assert.ok(real.startsWith(fs.realpathSync(assetRoot) + path.sep), `${label}: resource escapes its original asset directory`);
    assert.ok(fs.statSync(real).isFile(), `${label}: expected an actual original file`);
    return real;
  };
  function read(value) {
    const file = checkedPath(value), bytes = fs.readFileSync(file);
    assert.ok(bytes.length > 0 && !bytes.subarray(0, 100).toString().startsWith('version https://git-lfs.github.com/spec/'), `${label}: empty mesh or unresolved Git LFS pointer`);
    resources.set(path.relative(assetRoot, file).split(path.sep).join('/'), { bytes: bytes.length, sha256: hash(bytes) });
    return { file, bytes };
  }
  const source = read(model.path);
  const xml = new DOMParser().parseFromString(source.bytes.toString(), 'text/xml');
  const root = [...xml.children].find(node => node.tagName === 'robot');
  assert.ok(root, `${label}: a real robot XML element is required`);
  assert.ok(!/\$\{|\$\(find\b|<xacro:/.test(source.bytes.toString()), `${label}: unexpanded Xacro cannot be loaded`);
  // Current published URDF variants use literal material colors. A future
  // bitmap-dependent model must add real image decoding before this check can
  // claim it has validated those resources; never supply an empty fake image.
  assert.equal(root.querySelectorAll('texture[filename]').length, 0, `${label}: bitmap texture decoding is outside this CPU geometry verifier`);
  const sourceJoints = children(root, 'joint');
  assert.equal(new Set(sourceJoints.map(joint => joint.getAttribute('name'))).size, sourceJoints.length, `${label}: duplicate original joint names`);
  const manager = new THREE.LoadingManager();
  manager.setURLModifier(url => pathToFileURL(checkedPath(url)).href);
  const loader = new URDFLoader(manager);
  loader.workingPath = pathToFileURL(path.dirname(source.file) + path.sep).href;
  loader.packages = Object.fromEntries(Object.entries(model.packages || {}).map(([key, relative]) => [key, pathToFileURL(path.resolve(assetRoot, relative)).href]));
  loader.loadMeshCb = (url, _manager, material, complete) => {
    const { file, bytes } = read(manager.resolveURL(url));
    const extension = path.extname(file).toLowerCase();
    let object;
    if (extension === '.stl') {
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      object = new THREE.Mesh(new STLLoader().parse(buffer), material);
    } else if (extension === '.obj') {
      object = new OBJLoader(manager).parse(bytes.toString());
      object.traverse(node => {
        if (!node.isMesh) return;
        for (const original of Array.isArray(node.material) ? node.material : [node.material]) original.dispose();
        node.material = material;
      });
    } else if (extension === '.dae') {
      const dae = new DOMParser().parseFromString(bytes.toString(), 'text/xml');
      assert.equal(dae.querySelectorAll('library_images image init_from').length, 0, `${label}: Collada bitmap decoding is not implemented by this CPU verifier`);
      object = new ColladaLoader(manager).parse(bytes.toString(), pathToFileURL(path.dirname(file) + path.sep).href).scene;
    } else {
      throw new Error(`${label}: unsupported original mesh format ${extension}; add a real decoder, do not substitute geometry`);
    }
    complete(object);
  };
  const robot = loader.parse(xml);
  try {
    assert.equal(Object.keys(robot.links).length, children(root, 'link').length, `${label}: all original links must be present`);
    assert.equal(Object.keys(robot.joints).length, sourceJoints.length, `${label}: all original joints must be present`);
    const joints = [];
    for (const original of sourceJoints) {
      const name = original.getAttribute('name'), joint = robot.joints[name];
      const type = original.getAttribute('type');
      assert.ok(joint, `${label}/${name}: joint not loaded`);
      assert.equal(joint.jointType, type);
      const parent = child(original, 'parent')?.getAttribute('link'), descendant = child(original, 'child')?.getAttribute('link');
      assert.equal(joint.parent, robot.links[parent], `${label}/${name}: exact original parent`);
      assert.ok(joint.children.includes(robot.links[descendant]), `${label}/${name}: exact original child`);
      const origin = child(original, 'origin');
      const xyz = vector(origin?.getAttribute('xyz'), [0, 0, 0]), rpy = vector(origin?.getAttribute('rpy'), [0, 0, 0]);
      assert.ok(xyz.length === 3 && rpy.length === 3 && [...xyz, ...rpy].every(Number.isFinite));
      xyz.forEach((value, index) => close(joint.position.toArray()[index], value, `${label}/${name}: original origin`));
      const expectedQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(...rpy, 'ZYX'));
      assert.ok(joint.quaternion.angleTo(expectedQuaternion) < 1e-7, `${label}/${name}: original joint frame rotation`);
      const rawAxis = vector(child(original, 'axis')?.getAttribute('xyz'), [1, 0, 0]);
      assert.ok(rawAxis.length === 3 && rawAxis.every(Number.isFinite));
      const axis = new THREE.Vector3(...rawAxis).normalize();
      if (type !== 'fixed') {
        assert.ok(['revolute', 'continuous', 'prismatic'].includes(type), `${label}/${name}: unsupported motion type ${type}`);
        assert.ok(axis.lengthSq() > .99, `${label}/${name}: zero joint axis`);
        assert.ok(joint.axis.distanceTo(axis) < 1e-7, `${label}/${name}: original joint axis`);
      }
      const limit = child(original, 'limit');
      const lower = scalar(limit?.getAttribute('lower')), upper = scalar(limit?.getAttribute('upper'));
      if (['revolute', 'prismatic'].includes(type)) {
        assert.ok(Number.isFinite(lower) && Number.isFinite(upper) && upper > lower, `${label}/${name}: finite nonempty original range`);
        close(joint.limit.lower, lower, `${label}/${name}: lower limit`);
        close(joint.limit.upper, upper, `${label}/${name}: upper limit`);
      }
      const mimic = child(original, 'mimic');
      const mimicInfo = mimic ? { joint: mimic.getAttribute('joint'), multiplier: scalar(mimic.getAttribute('multiplier'), 1), offset: scalar(mimic.getAttribute('offset'), 0) } : null;
      if (mimicInfo) {
        assert.equal(joint.mimicJoint, mimicInfo.joint);
        close(joint.multiplier, mimicInfo.multiplier, `${label}/${name}: mimic multiplier`);
        close(joint.offset, mimicInfo.offset, `${label}/${name}: mimic offset`);
      }
      joints.push({ name, type, parent, child: descendant, origin: { xyz, rpy }, axis: rawAxis,
        limit: ['revolute', 'prismatic'].includes(type) ? { lower, upper } : null, mimic: mimicInfo });
    }
    if (model.initialJoints) robot.setJointValues(model.initialJoints);
    robot.updateMatrixWorld(true);
    const baseline = new Map(Object.values(robot.joints).map(joint => [joint, { values: [...joint.jointValue], position: joint.position.clone(), quaternion: joint.quaternion.clone() }]));
    const drivers = joints.filter(joint => joint.type !== 'fixed' && !joint.mimic);
    assert.ok(drivers.length > 0, `${label}: no original driven joints`);
    let motionChecks = 0, limitChecks = 0, mimicChecks = 0, resetChecks = 0;
    const verifyMimics = () => {
      for (const row of joints.filter(row => row.mimic)) {
        const follower = robot.joints[row.name], driver = robot.joints[row.mimic.joint];
        const target = driver.jointValue[0] * row.mimic.multiplier + row.mimic.offset;
        const expected = row.type === 'continuous' ? target : Math.max(follower.limit.lower, Math.min(follower.limit.upper, target));
        close(follower.jointValue[0], expected, `${label}/${row.name}: actual mimic propagation`);
        mimicChecks++;
      }
    };
    for (const row of drivers) {
      const joint = robot.joints[row.name], start = baseline.get(joint);
      const samples = row.limit ? [row.limit.lower, row.limit.lower + (row.limit.upper - row.limit.lower) * .37, row.limit.upper] : [-.3, .3, Math.PI * 2 + .2];
      for (const value of samples) {
        const previous = joint.jointValue[0] || 0, matrix = joint.matrixWorld.toArray();
        robot.setJointValue(row.name, value); robot.updateMatrixWorld(true);
        close(joint.jointValue[0], value, `${label}/${row.name}: requested legal value`);
        assert.ok(joint.matrixWorld.elements.every(Number.isFinite));
        if (Math.abs(value - previous) > 1e-8) assert.notDeepEqual(joint.matrixWorld.toArray(), matrix, `${label}/${row.name}: movement changes the real transform`);
        verifyMimics(); motionChecks++;
      }
      if (row.limit) {
        for (const [value, expected] of [[row.limit.lower - 1, row.limit.lower], [row.limit.upper + 1, row.limit.upper]]) {
          robot.setJointValue(row.name, value); robot.updateMatrixWorld(true);
          close(joint.jointValue[0], expected, `${label}/${row.name}: original limit clamps an out-of-range command`);
          verifyMimics(); limitChecks++;
        }
      }
      robot.setJointValue(row.name, ...start.values); robot.updateMatrixWorld(true);
      for (const [object, expected] of baseline) {
        assert.ok(object.position.distanceTo(expected.position) < 1e-7 && object.quaternion.angleTo(expected.quaternion) < 1e-7, `${label}/${row.name}: reset must restore every original joint, including followers`);
      }
      resetChecks++;
    }
    let meshes = 0, vertices = 0, triangles = 0;
    robot.traverse(node => {
      assert.ok(node.matrixWorld.elements.every(Number.isFinite), `${label}: finite original hierarchy`);
      if (!node.isMesh) return;
      const geometry = node.geometry, positions = geometry.attributes.position;
      assert.ok(positions && positions.count > 0, `${label}: missing decoded original geometry`);
      assert.ok(positions.array.every(Number.isFinite), `${label}: invalid actual vertex data`);
      for (const index of geometry.index?.array || []) assert.ok(index >= 0 && index < positions.count, `${label}: invalid original vertex index`);
      meshes++; vertices += positions.count; triangles += (geometry.index?.count || positions.count) / 3;
    });
    assert.ok(meshes > 0 && triangles > 0 && Number.isInteger(triangles));
    const bounds = new THREE.Box3().setFromObject(robot);
    assert.ok(!bounds.isEmpty() && [...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite));
    assert.equal(hash(fs.readFileSync(source.file)), hash(source.bytes), `${label}: original URDF must stay unchanged`);
    return { id: model.id, path: model.path, source: model.source, urdfSha256: hash(source.bytes),
      links: Object.keys(robot.links).length, originalJoints: joints, drivenJoints: drivers.length,
      mimicJoints: joints.filter(joint => joint.mimic).length, meshes, vertices, triangles,
      boundsInOriginalUrdfUnits: { minimum: bounds.min.toArray(), maximum: bounds.max.toArray() },
      motionChecks, limitChecks, mimicChecks, resetChecks,
      resources: [...resources].map(([relative, data]) => ({ path: relative, ...data })) };
  } finally { dispose(robot); }
}

export async function verifyHardwareKinematics({ root = path.join(repo, 'public'), ids = HARDWARE_CATALOG.map(entry => entry.id) } = {}) {
  const assets = [];
  for (const id of ids) {
    assert.ok(HARDWARE_CATALOG.some(entry => entry.id === id), `Unknown hardware asset ${id}`);
    const assetRoot = path.join(root, 'hardware', id);
    const asset = validateHardwareAsset(JSON.parse(fs.readFileSync(path.join(assetRoot, 'asset.json'), 'utf8')), id);
    const models = [];
    for (const model of asset.models.filter(model => model.format === 'urdf')) {
      const row = await verifyHardwareUrdfModel(asset, model, assetRoot); models.push(row);
      console.log(`${id}/${model.id}: ${row.meshes} actual meshes, ${row.drivenJoints} driven joints, ${row.mimicJoints} followers; CPU geometry/axis/limit/motion/reset passed`);
    }
    assets.push({ id, urdfModels: models.length, models });
  }
  const models = assets.flatMap(asset => asset.models);
  assert.ok(models.length > 0, 'The selected manifests contain no original URDF models');
  const sum = key => models.reduce((total, model) => total + model[key], 0);
  return { schemaVersion: 1, checkedAt: new Date().toISOString(), node: process.version, root: path.basename(root),
    scope: 'CPU only: actual urdf-loader 0.13.1 and Three.js STL/OBJ/Collada parsing; original joint frames, axes, limits, mimic, movement and reset. No browser, pixels, GPU, physical dynamics or hardware control.',
    dependencies: { 'urdf-loader': '0.13.1', linkedom: '0.18.12' },
    allCatalogManifests: HARDWARE_CATALOG.every(entry => assets.some(asset => asset.id === entry.id)), visualAcceptance: false,
    summary: { manifests: assets.length, urdfModels: models.length, meshes: sum('meshes'), triangles: sum('triangles'), drivenJoints: sum('drivenJoints'), mimicJoints: sum('mimicJoints'), motionChecks: sum('motionChecks'), limitChecks: sum('limitChecks'), mimicChecks: sum('mimicChecks'), resetChecks: sum('resetChecks') }, assets };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  assert.ok(args.every(arg => arg === '--dist' || arg.startsWith('--asset=') || arg.startsWith('--report=')), 'Usage: node scripts/verify-hardware-kinematics.mjs [--dist] [--asset=parol6] [--report=FILE]');
  const selected = args.filter(arg => arg.startsWith('--asset=')).map(arg => arg.slice(8));
  const report = await verifyHardwareKinematics({ root: path.join(repo, args.includes('--dist') ? 'dist' : 'public'), ...(selected.length ? { ids: [...new Set(selected)] } : {}) });
  const target = path.resolve(repo, args.find(arg => arg.startsWith('--report='))?.slice(9) || 'docs/hardware-kinematics-verification.json');
  fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ...report.summary, visualAcceptance: false, report: path.relative(repo, target) }, null, 2));
}
