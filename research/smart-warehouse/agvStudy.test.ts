import assert from 'node:assert/strict';
import test from 'node:test';
import { createAgvStudy } from './agvStudy.ts';
import { AGV_LAPS_PER_SECOND } from '../../integrations/smart-warehouse/upstream/src/core/agvSimulation.ts';

// Explicit study inputs. These are not a measurement of the original GLB.
const routeLength = 60;
const unloadProgress = 0.55;
const lapSeconds = 1 / AGV_LAPS_PER_SECOND;

test('caller time pauses without accumulating wall time and resumes from the same simulation point', () => {
  const study = createAgvStudy(routeLength, unloadProgress);
  const before = study.step(8);
  study.pause();
  const paused = study.step(300);
  assert.equal(paused.elapsed, 8);
  assert.deepEqual(paused.vehicles, before.vehicles);
  study.resume();
  const resumed = study.step(2);
  assert.equal(resumed.elapsed, 10);
  assert.deepEqual(resumed.vehicles, createAgvStudy(routeLength, unloadProgress).seek(10).vehicles);
});

test('pickup, loaded travel, unloading and empty return retain upstream state boundaries', () => {
  const study = createAgvStudy(routeLength, unloadProgress, 1);
  assert.equal(study.seek(0).vehicles[0].phase, 'pickup');
  assert.equal(study.seek(lapSeconds * 0.25).vehicles[0].phase, 'loaded');
  assert.equal(study.seek(lapSeconds * (unloadProgress - 0.001)).vehicles[0].hasCargo, true);
  const unloaded = study.seek(lapSeconds * (unloadProgress + 0.001)).vehicles[0];
  assert.equal(unloaded.phase, 'returning');
  assert.equal(unloaded.hasCargo, false);
});

test('the incoming belt parcel color becomes the vehicle parcel color across a lap boundary', () => {
  const study = createAgvStudy(routeLength, unloadProgress, 1);
  const before = study.seek(lapSeconds - 0.0001).vehicles[0];
  const after = study.seek(lapSeconds + 0.0001).vehicles[0];
  assert.ok(before.beltTransfer > 0.99);
  assert.equal(after.cargoIsKraft, !before.cargoIsKraft);
  assert.equal(after.hasCargo, true);
  assert.equal(after.phase, 'pickup');
});

test('equally spaced upstream offsets stay spaced through repeated laps without implying collision avoidance', () => {
  const study = createAgvStudy(routeLength, unloadProgress);
  for (const elapsed of [0, 8, lapSeconds, lapSeconds * 10.25]) {
    const frames = study.seek(elapsed).vehicles;
    for (let index = 0; index < frames.length; index++) {
      const next = frames[(index + 1) % frames.length];
      const gap = (next.progress - frames[index].progress + 1) % 1;
      assert.ok(Math.abs(gap - 1 / 7) < 1e-10);
    }
  }
});

test('invalid inputs fail before corrupting a study and snapshots do not expose mutable clock state', () => {
  assert.throws(() => createAgvStudy(0, unloadProgress), RangeError);
  assert.throws(() => createAgvStudy(routeLength, 1), RangeError);
  assert.throws(() => createAgvStudy(routeLength, unloadProgress, 0), RangeError);
  const study = createAgvStudy(routeLength, unloadProgress);
  for (const value of [-1, NaN, Infinity]) {
    assert.throws(() => study.step(value), RangeError);
    assert.throws(() => study.seek(value), RangeError);
  }
  const sample = study.snapshot();
  sample.vehicles[0].hasCargo = false;
  assert.equal(study.snapshot().vehicles[0].hasCargo, true);
  assert.equal(study.snapshot().elapsed, 0);
});
