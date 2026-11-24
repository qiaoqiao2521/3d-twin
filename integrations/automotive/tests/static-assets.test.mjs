import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const staticRoot = new URL('../../../public/twins/automotive/', import.meta.url);
const json = async path => JSON.parse(await readFile(new URL(path, staticRoot), 'utf8'));

test('automotive registry, four contracts, views and binding files resolve to real static assets', async () => {
  const manifest = await json('manifest.json');
  assert.equal(manifest.models.length, 2);
  const files = [manifest.entry, ...Object.values(manifest.views), ...manifest.contracts,
    manifest.licenseMetadata, 'LICENSE', 'v8/LICENSE', 'THIRD_PARTY_NOTICES.txt'];
  for (const path of files) assert.ok((await stat(new URL(path, staticRoot))).size > 0, path);
  const contracts = await Promise.all(manifest.contracts.map(json));
  assert.ok(contracts.every(data => data.schemaVersion === 1));
  const bindings = await json('data/bindings.json');
  assert.ok(bindings.bindings.some(binding => binding.sourceEvidence?.file));
  for (const binding of bindings.bindings) {
    if (binding.sourceEvidence?.file) assert.ok((await stat(new URL(binding.sourceEvidence.file, new URL('data/bindings.json', staticRoot)))).size > 0);
  }
});

test('vehicle GLB license metadata matches its embedded source and preserves attribution', async () => {
  const manifest = await json('manifest.json');
  const data = await json('data/models.json');
  const normalize = value => value.split(' (')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const model of manifest.models) {
    const bytes = await readFile(new URL(model.path, staticRoot));
    assert.equal(bytes.readUInt32LE(0), 0x46546c67, model.path);
    assert.equal(bytes.readUInt32LE(4), 2, model.path);
    assert.equal(bytes.readUInt32LE(8), bytes.length, model.path);
    const jsonLength = bytes.readUInt32LE(12);
    assert.equal(bytes.readUInt32LE(16), 0x4e4f534a, model.path);
    const asset = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8').trimEnd()).asset.extras;
    const metadata = data.models.find(row => row.id === model.id);
    assert.ok(asset.author && asset.source && metadata.assetLicense.attribution);
    assert.equal(normalize(asset.license), normalize(metadata.assetLicense.label), model.id);
    assert.equal(metadata.codeLicense.label, 'MIT');
  }
  const engine = data.models.find(row => row.id === 'v8-engine-explorer');
  assert.equal(engine.codeLicense.label, 'MIT');
  assert.equal(engine.audioLicense.label, 'CC BY-SA 3.0');
  assert.equal(engine.audioLicense.attribution, 'Edvvc');
});

test('all vehicle models have the required commercial CC BY 4.0 license', async () => {
  const manifest = await json('manifest.json');
  const data = await json('data/models.json');
  for (const model of manifest.models) {
    const metadata = data.models.find(row => row.id === model.id);
    assert.equal(metadata.assetLicense.label, 'CC BY 4.0', `${model.id} must be cleared for commercial use`);
  }
});
