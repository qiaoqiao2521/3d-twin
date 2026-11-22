import test from 'node:test';
import assert from 'node:assert/strict';
import { ironRevisionMatches, isTrustedIronEvent, parseIronEnvelope, parseIronState, resolveIronEndpoint } from './ironBridge.ts';

const revision = 'a'.repeat(40);
const state = () => ({
  revision,
  characters: [{ id: 'grimlock', name: '钢锁' }],
  selectedCharacterId: 'grimlock', transformProgress: 0.2,
  capabilities: ['inspect', 'scrub', 'select-part'], paused: false,
  selectedPartId: null, isolatedPartId: null,
  provenance: { kind: 'virtual', geometry: 'procedural', physicalTwin: false },
  inspection: {
    schemaVersion: 1, objectId: 'iron:grimlock',
    source: { project: 'iron', revision, geometry: 'procedural', reality: 'virtual', lengthUnit: 'unknown', state: 'procedural-animation', physicalEvidence: 'none' },
    nodes: [{ id: 'root', parentId: null, name: '钢锁', kind: 'assembly' }, { id: 'jaw', parentId: 'root', name: '下颌', kind: 'part' }]
  }
});

test('embed endpoint fixes the parent origin and rejects executable or credentialed URLs', () => {
  const endpoint = resolveIronEndpoint('https://iron.example/app?embed=0&parentOrigin=https://evil.example', 'https://twin.example');
  const url = new URL(endpoint.url);
  assert.equal(endpoint.origin, 'https://iron.example');
  assert.equal(url.searchParams.get('embed'), '1');
  assert.equal(url.searchParams.get('parentOrigin'), 'https://twin.example');
  for (const invalid of ['javascript:alert(1)', 'data:text/html,hi', 'https://name:password@iron.example']) {
    assert.throws(() => resolveIronEndpoint(invalid, 'https://twin.example'));
  }
});

test('same origin without the exact frame window cannot supply bridge state', () => {
  const frameWindow = {};
  assert.equal(isTrustedIronEvent({ origin: 'https://iron.example', source: frameWindow }, 'https://iron.example', frameWindow), true);
  assert.equal(isTrustedIronEvent({ origin: 'https://evil.example', source: frameWindow }, 'https://iron.example', frameWindow), false);
  assert.equal(isTrustedIronEvent({ origin: 'https://iron.example', source: {} }, 'https://iron.example', frameWindow), false);
  assert.equal(isTrustedIronEvent({ origin: 'null', source: null }, 'null', null), false);
});

test('unrelated channels, commands and malformed response envelopes are rejected', () => {
  const valid = { channel: 'iron.embed', version: 1, id: 'request-1', type: 'ready', payload: state() };
  assert.equal(parseIronEnvelope(valid)?.type, 'ready');
  assert.equal(parseIronEnvelope({ ...valid, channel: 'hardware.commands' }), null);
  assert.equal(parseIronEnvelope({ ...valid, type: 'execute' }), null);
  assert.equal(parseIronEnvelope({ ...valid, payload: null }), null);
  assert.equal(parseIronEnvelope({ ...valid, version: '1' }), null);
  assert.equal(parseIronEnvelope({ ...valid, version: 2 })?.version, 2, 'host must see incompatible versions instead of silently accepting v1');
});

test('a virtual character has usable inspection data without a manufactured file or metric scale', () => {
  const parsed = parseIronState(state());
  assert.equal(parsed.error, null);
  assert.equal(parsed.state?.inspection.source.lengthUnit, 'unknown');
  assert.equal(parsed.state?.inspection.source.physicalEvidence, 'none');
});

test('physical claims, wrong revisions, duplicate nodes and foreign selections fail closed', () => {
  const physical = state(); physical.provenance.physicalTwin = true;
  assert.equal(parseIronState(physical).state, null);
  const mismatch = state(); mismatch.inspection.source.revision = 'b'.repeat(40);
  assert.equal(parseIronState(mismatch).state, null);
  const wrongCharacter = state(); wrongCharacter.inspection.objectId = 'iron:optimus';
  assert.equal(parseIronState(wrongCharacter).state, null);
  const duplicate = state(); duplicate.inspection.nodes.push({ ...duplicate.inspection.nodes[1] });
  assert.equal(parseIronState(duplicate).state, null);
  const selection = { ...state(), selectedPartId: 'iron:another-character:part:1' };
  assert.equal(parseIronState(selection).state, null);
});

test('character mismatches, cycles and non-finite animation values are rejected', () => {
  assert.equal(parseIronState({ ...state(), selectedCharacterId: 'unknown' }).state, null);
  assert.equal(parseIronState({ ...state(), transformProgress: Infinity }).state, null);
  const cycle = state(); cycle.inspection.nodes[0].parentId = 'jaw';
  assert.equal(parseIronState(cycle).state, null);
});

test('production control requires the exact locked revision; missing revision is development only', () => {
  assert.equal(ironRevisionMatches(revision, revision), true);
  assert.equal(ironRevisionMatches(revision, 'b'.repeat(40)), false);
  assert.equal(ironRevisionMatches(revision, null, true), false);
  assert.equal(ironRevisionMatches(null, null), false);
  assert.equal(ironRevisionMatches(null, null, true), true);
});
