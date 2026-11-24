import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildRoboticsArchive, isSyntheticBaseline } from './robotics-archive.mjs';

test('archive indexing never fabricates missing originals and flags historical synthetic chains', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'robotics-archive-'));
  try {
    const base = path.join(root, 'public/baselines'), repository = path.join(base, 'category/repo');
    fs.mkdirSync(path.join(repository, '_首选基准原件_PRIMARY'), { recursive: true });
    const synthetic = '<!-- 现实基准原件: repo --><robot><link name="link_1"/></robot>';
    const real = '<robot name="source"><link name="body"/></robot>';
    fs.writeFileSync(path.join(repository, 'model.urdf'), synthetic);
    fs.writeFileSync(path.join(repository, '_首选基准原件_PRIMARY/model.urdf'), real);
    fs.writeFileSync(path.join(base, 'MANIFEST_全量机器人基准清单.json'), JSON.stringify([{
      category: 'category', repository: 'repo', primaryBaselineFile: 'model.urdf', description: 'fixture', upstreamUrl: 'https://example.test/repo',
      kinematicFiles: ['model.urdf', 'missing.urdf'], docFiles: ['missing.png'], kinematicFileCount: 2, docFileCount: 1,
    }]));
    const { manifest, audit } = buildRoboticsArchive(root, []);
    assert.equal(manifest[0].primaryBaselineFile, '_首选基准原件_PRIMARY/model.urdf');
    assert.equal(manifest[0].fileIssues['model.urdf'].status, 'synthetic');
    assert.equal(manifest[0].fileIssues['missing.urdf'].status, 'missing');
    assert.equal(audit.summary.missing, 2);
    assert.equal(fs.existsSync(path.join(repository, 'missing.urdf')), false);
    assert.equal(fs.readFileSync(path.join(repository, 'model.urdf'), 'utf8'), synthetic);
    assert.equal(fs.readFileSync(path.join(repository, '_首选基准原件_PRIMARY/model.urdf'), 'utf8'), real);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test('ordinary upstream link names are not mistaken for this historical generator', () => {
  assert.equal(isSyntheticBaseline('<robot><link name="link_1"/></robot>'), false);
});
