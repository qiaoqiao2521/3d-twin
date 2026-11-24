import test from 'node:test';
import assert from 'node:assert/strict';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { disposeHardwareDraco } from './hardwareDraco.ts';

class WorkerProbe {
  terminated = false;
  source: string;
  constructor(source: string) { this.source = source; }
  postMessage() {}
  terminate() { this.terminated = true; }
}
type DracoInternals = DRACOLoader & {
  _loadLibrary: (name: string, type: string) => Promise<string | ArrayBuffer>;
  _getWorker: (task: number, cost: number) => Promise<WorkerProbe>;
  decoderPending: Promise<unknown> | null;
  workerPool: WorkerProbe[];
  workerSourceURL: string;
};

async function withWorkers(run: (loader: DracoInternals) => Promise<void>) {
  const runtime = globalThis as unknown as { Worker?: typeof WorkerProbe };
  const previous = runtime.Worker;
  runtime.Worker = WorkerProbe;
  const loader = new DRACOLoader().setDecoderConfig({ type: 'js' }) as DracoInternals;
  try { await run(loader); }
  finally {
    loader.dispose();
    if (previous) runtime.Worker = previous;
    else delete runtime.Worker;
  }
}

test('a real DRACOLoader late initialization cannot leave a worker or blob URL alive after cleanup', async () => {
  await withWorkers(async loader => {
    let ready!: (content: string) => void;
    loader._loadLibrary = () => new Promise<string>(resolve => { ready = resolve; });
    const waitingWorker = loader._getWorker(1, 100);
    assert.equal(loader.workerPool.length, 0);
    disposeHardwareDraco(loader);
    disposeHardwareDraco(loader);
    ready('/* CPU lifecycle test: worker source is never executed. */');
    const late = await waitingWorker;
    await Promise.resolve();
    assert.equal(late.terminated, true);
    assert.equal(loader.workerPool.length, 0);
    assert.match(loader.workerSourceURL, /^blob:/);
    await assert.rejects(fetch(loader.workerSourceURL), TypeError);
  });
});

test('existing Draco workers are released immediately and repeated settlement cleanup stays safe', async () => {
  await withWorkers(async loader => {
    loader._loadLibrary = async () => '/* CPU lifecycle probe only. */';
    const active = await loader._getWorker(2, 100);
    assert.equal(active.terminated, false);
    assert.equal((await fetch(loader.workerSourceURL)).ok, true);
    disposeHardwareDraco(loader);
    assert.equal(active.terminated, true);
    assert.equal(loader.workerPool.length, 0);
    await assert.rejects(fetch(loader.workerSourceURL), TypeError);
    await loader.decoderPending;
    disposeHardwareDraco(loader);
    await Promise.resolve();
    assert.equal(loader.workerPool.length, 0);
  });
});

test('decoder initialization rejection is handled without starting a worker or an unhandled cleanup rejection', async () => {
  await withWorkers(async loader => {
    let fail!: (error: Error) => void;
    loader._loadLibrary = () => new Promise((_resolve, reject) => { fail = reject; });
    const waitingWorker = loader._getWorker(3, 100);
    const expectedRejection = assert.rejects(waitingWorker, /decoder download failed/);
    disposeHardwareDraco(loader);
    disposeHardwareDraco(loader);
    fail(new Error('decoder download failed'));
    await expectedRejection;
    await Promise.resolve();
    assert.equal(loader.workerPool.length, 0);
    assert.equal(loader.workerSourceURL, '');
  });
});

test('disposing an unused Draco loader never starts decoder downloads', async () => {
  await withWorkers(async loader => {
    loader._loadLibrary = async () => { assert.fail('cleanup must not initialize a decoder'); };
    disposeHardwareDraco(loader);
    disposeHardwareDraco(loader);
    assert.equal(loader.decoderPending, null);
    assert.equal(loader.workerPool.length, 0);
  });
});
