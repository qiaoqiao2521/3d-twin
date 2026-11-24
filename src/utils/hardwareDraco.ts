import type { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

/** Release existing and late-initialized Three.js 0.170 Draco workers.
 *
 * DRACOLoader.dispose() does not cancel decoderPending: _getWorker() can still
 * create a worker after it resolves. That callback was registered before this
 * cleanup, so a second dispose on decoder settlement also releases the late
 * worker and its blob URL. Repeated cleanup is intentionally safe. Callers must
 * separately prevent new parsing work after their viewport is disposed.
 */
export function disposeHardwareDraco(loader: DRACOLoader): void {
  const pending = (loader as DRACOLoader & { decoderPending?: Promise<unknown> | null }).decoderPending;
  loader.dispose();
  if (pending) {
    const release = () => { loader.dispose(); };
    void pending.then(release, release);
  }
}
