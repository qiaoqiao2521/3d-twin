import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

// Reuse the adjacent viewer's installed dependencies and actual class implementation.
// No browser/WebGL context is required to exercise its placement updates.
const requireViewer = createRequire(new URL('../../../package.json', import.meta.url));
const ts = requireViewer('typescript');
const THREE = requireViewer('three');
const filename = new URL('../auto-atlas/src/three/glb-scene.ts', import.meta.url);
const source = readFileSync(filename, 'utf8');
const ast = ts.createSourceFile(filename.pathname, source, ts.ScriptTarget.Latest, true);
const sceneClass = ast.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === 'GlbCarScene');
const animate = sceneClass?.members.find(node => ts.isPropertyDeclaration(node) && node.name?.getText(ast) === 'animate');
assert.ok(animate?.initializer, 'Viewer must expose its real animate initializer to this fixture');

// Extract the unchanged arrow initializer so it closes over the fixture as `this`.
// Constructing the full class would require WebGL; all tested method bodies remain original.
const augmented = source + `\nexport function __makeAnimateForTest() { return ${animate.initializer.getText(ast)}; }\n`;
const compiled = ts.transpileModule(augmented, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const viewer = {};
new Function('require', 'exports', 'requestAnimationFrame', 'cancelAnimationFrame', compiled)(
  requireViewer, viewer, () => 1, () => {},
);

function fixture() {
  const scene = Object.create(viewer.GlbCarScene.prototype);
  const parts = ['paint', 'glass', 'trim'].map((id, index) => ({
    id, sourcePath: `door/${id}`, base: new THREE.Vector3(index, 0, 0),
    dir: new THREE.Vector3(1, 0, 0), boost: 1,
  }));
  Object.assign(scene, {
    active: true, renderedFrames: 0, loadedModelId: 'test-model',
    modelMaxExtent: 10,
    // Source-space X becomes scene-space Y. Translation must not affect a direction.
    modelDirectionMatrix: new THREE.Matrix4().compose(
      new THREE.Vector3(10, 20, 30),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2),
      new THREE.Vector3(2, 3, 4),
    ),
    bindingPlacements: new Map(), amount: 1,
    latest: { explode: 1, hidden: new Set(), isolate: false },
    controls: { update() {} }, clock: { getDelta: () => 0.016 },
    renderer: { render() {} }, parts,
    meshById: new Map(parts.map(part => [part.id, { position: new THREE.Vector3(), visible: true }])),
    grid: new Map(parts.map(part => [part.id, new THREE.Vector3(99, 99, 99)])),
    scene: {}, camera: {},
  });
  scene.animate = viewer.__makeAnimateForTest.call(scene);
  return scene;
}

function nearVector(actual, expected) {
  actual.toArray().forEach((value, index) => assert.ok(
    Math.abs(value - expected[index]) < 1e-10,
    `axis ${index}: ${value} should be near ${expected[index]}`,
  ));
}

test('vector moves a multi-mesh binding together in transformed model space, bypassing shelf layout', () => {
  const scene = fixture();
  scene.setBindingRules([{
    paths: ['door/paint', 'door/glass'],
    explode: { mode: 'vector', direction: [1, 0, 0], distance: 0.2,
      coordinateSpace: 'model', distanceUnit: 'relative_model_max_extent' },
  }]);
  scene.animate();
  nearVector(scene.meshById.get('paint').position, [0, 2, 0]);
  nearVector(scene.meshById.get('glass').position, [1, 2, 0]);
  nearVector(scene.meshById.get('trim').position, [99, 99, 99]);
  assert.equal(scene.getRuntimeState().appliedRuleCount, 1);
  assert.equal(scene.getRuntimeState().bindingRuleMeshCount, 2);
});

test('disabled binding remains at assembled base even at full shelf progress', () => {
  const scene = fixture();
  scene.setBindingRules([{ paths: ['door/paint'], explode: { mode: 'disabled' } }]);
  scene.animate();
  nearVector(scene.meshById.get('paint').position, [0, 0, 0]);
  nearVector(scene.meshById.get('glass').position, [99, 99, 99]);
});

test('inherit preserves the viewer original shelf behavior', () => {
  const plain = fixture();
  plain.animate();
  const inherited = fixture();
  inherited.setBindingRules([{ paths: ['door/paint'], explode: { mode: 'inherit' } }]);
  inherited.animate();
  nearVector(inherited.meshById.get('paint').position, plain.meshById.get('paint').position.toArray());
  nearVector(inherited.meshById.get('paint').position, [99, 99, 99]);
});

test('invalid zero direction warns and falls back to the original viewer behavior', () => {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = value => warnings.push(value);
  try {
  const scene = fixture();
  scene.setBindingRules([{
    paths: ['door/paint'],
    explode: { mode: 'vector', direction: [0, 0, 0], distance: 0.2,
      coordinateSpace: 'model', distanceUnit: 'relative_model_max_extent' },
  }]);
  scene.animate();
  nearVector(scene.meshById.get('paint').position, [99, 99, 99]);
  assert.equal(scene.getRuntimeState().appliedRuleCount, 0);
  assert.ok(warnings.some(message => message.includes('invalid model-space vector')));
  } finally {
    console.warn = originalWarn;
  }
});
