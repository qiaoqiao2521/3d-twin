import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  isValidGlbMagicBytes,
  bufferContainsDracoExtension,
  isValidWasmMagicBytes,
  isValidTextAssetPayload,
  resolvePublicAssetUrl,
  computeRetryDelayMs
} from './resilientGlbLoader';

function toExactArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
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

  it('accurately detects KHR_draco_mesh_compression in Draco vs non-Draco .glb assets', () => {
    const sarAb = toExactArrayBuffer(
      fs.readFileSync(path.resolve('public/robotics_glb/search_and_rescue_tracked_robot.glb'))
    );
    const marsL1Ab = toExactArrayBuffer(
      fs.readFileSync(path.resolve('public/twins/models/L1_mobility_rocker_bogie.glb'))
    );

    assert.equal(bufferContainsDracoExtension(sarAb), false);
    assert.equal(bufferContainsDracoExtension(marsL1Ab), true);
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
});
