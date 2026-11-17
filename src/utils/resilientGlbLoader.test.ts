import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import {
  isValidGlbMagicBytes,
  bufferContainsDracoExtension,
  isValidWasmMagicBytes,
  isValidTextAssetPayload,
  resolvePublicAssetUrl,
  computeRetryDelayMs,
  cloneSceneWithSkeletonSupport,
  ensureMeshoptLodReady,
  getOrBuildDecimatedLodGeometries,
  disposeSceneHierarchy
} from './resilientGlbLoader';

function toExactArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

function buildMinimalUncompressedGlb(): ArrayBuffer {
  const jsonStr = JSON.stringify({ asset: { version: '2.0' }, scenes: [{ nodes: [] }], nodes: [] });
  const pad = (4 - (jsonStr.length % 4)) % 4;
  const paddedJson = Buffer.from(jsonStr + ' '.repeat(pad), 'utf8');
  const totalLen = 12 + 8 + paddedJson.byteLength;
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0); // 'glTF'
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLen, 8);
  header.writeUInt32LE(paddedJson.byteLength, 12);
  header.writeUInt32LE(0x4e4f534a, 16); // 'JSON'
  return toExactArrayBuffer(Buffer.concat([header, paddedJson]));
}

describe('resilientGlbLoader pure verification suite', () => {
  it('validates real .glb magic headers on disk and rejects warmup HTML or truncated buffers', () => {
    const sarBuf = fs.readFileSync(
      path.resolve('public/robotics_glb/search_and_rescue_tracked_robot.glb')
    );
    const marsL1Buf = fs.readFileSync(
      path.resolve('public/twins/models/L1_mobility_rocker_bogie.glb')
    );

    assert.equal(isValidGlbMagicBytes(toExactArrayBuffer(sarBuf)), true);
    assert.equal(isValidGlbMagicBytes(toExactArrayBuffer(marsL1Buf)), true);

    const warmupHtml = Buffer.from('<!DOCTYPE html><html><body>Warming up...</body></html>', 'utf8');
    assert.equal(isValidGlbMagicBytes(toExactArrayBuffer(warmupHtml)), false);
    assert.equal(isValidGlbMagicBytes(new ArrayBuffer(0)), false);
    assert.equal(isValidGlbMagicBytes(new ArrayBuffer(12)), false);
  });

  it('accurately detects KHR_draco_mesh_compression in remastered Draco vs uncompressed .glb assets', () => {
    const sarAb = toExactArrayBuffer(
      fs.readFileSync(path.resolve('public/robotics_glb/search_and_rescue_tracked_robot.glb'))
    );
    const marsL1Ab = toExactArrayBuffer(
      fs.readFileSync(path.resolve('public/twins/models/L1_mobility_rocker_bogie.glb'))
    );
    const plainAb = buildMinimalUncompressedGlb();

    assert.equal(bufferContainsDracoExtension(sarAb), true);
    assert.equal(bufferContainsDracoExtension(marsL1Ab), true);
    assert.equal(bufferContainsDracoExtension(plainAb), false);
  });

  it('validates Draco WASM binary magic bytes and rejects HTML warmup text payloads', () => {
    const wasmAb = toExactArrayBuffer(
      fs.readFileSync(path.resolve('public/draco/draco_decoder.wasm'))
    );
    assert.equal(isValidWasmMagicBytes(wasmAb), true);
    assert.equal(
      isValidWasmMagicBytes(toExactArrayBuffer(Buffer.from('<html>502</html>', 'utf8'))),
      false
    );

    const wrapperJs = fs.readFileSync(path.resolve('public/draco/draco_wasm_wrapper.js'), 'utf8');
    assert.equal(isValidTextAssetPayload(wrapperJs), true);
    assert.equal(isValidTextAssetPayload('<!DOCTYPE html>\n<html>Warmup</html>'), false);
    assert.equal(isValidTextAssetPayload('<?xml version="1.0"?><robot name="sar"/>'), true);
  });

  it('normalizes public asset URLs without double-encoding Chinese URDF paths and bounds retry backoff', () => {
    const rawChineseUrdf =
      '/baselines/01-履带越障搜救机器人/Search-and-Rescue-Robot/urdf/sar_urdf.urdf';
    const onceEncoded = resolvePublicAssetUrl(rawChineseUrdf, '/');
    const twiceEncoded = resolvePublicAssetUrl(onceEncoded, '/');

    assert.equal(onceEncoded, twiceEncoded);
    assert.ok(!twiceEncoded.includes('%25'));
    assert.equal(
      resolvePublicAssetUrl('/robotics_glb/search_and_rescue_tracked_robot.glb', '/'),
      '/robotics_glb/search_and_rescue_tracked_robot.glb'
    );

    assert.equal(computeRetryDelayMs(0, 300, 2600), 300);
    assert.equal(computeRetryDelayMs(1, 300, 2600), 600);
    assert.equal(computeRetryDelayMs(2, 300, 2600), 1200);
    assert.equal(computeRetryDelayMs(6, 300, 2600), 2600);
  });

  it('builds decimated Meshopt LOD1/LOD2 index buffers and safely clones/disposes hierarchies', async () => {
    await ensureMeshoptLodReady();
    const hiPolySphere = new THREE.SphereGeometry(1, 48, 32);
    const lods = getOrBuildDecimatedLodGeometries(hiPolySphere);
    assert.ok(lods !== null);
    assert.ok(lods!.lod1.getIndex()!.count < hiPolySphere.getIndex()!.count);
    assert.ok(lods!.lod2.getIndex()!.count < lods!.lod1.getIndex()!.count);

    const grp = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const mesh = new THREE.Mesh(hiPolySphere, mat);
    grp.add(mesh);

    const cloned = cloneSceneWithSkeletonSupport(grp);
    assert.equal(cloned.children.length, 1);
    disposeSceneHierarchy(cloned, { sharedGeometries: new Set([hiPolySphere]) });
    disposeSceneHierarchy(grp);
  });
});
