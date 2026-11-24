import { getAgvFrame } from '../../integrations/smart-warehouse/upstream/src/core/agvSimulation.ts';

/** A caller-owned clock and state sampler, never a renderer or robot controller. */
export function createAgvStudy(routeLength: number, unloadProgress: number, vehicleCount = 7) {
  if (!Number.isFinite(routeLength) || routeLength <= 0) throw new RangeError('routeLength must be positive');
  if (!Number.isFinite(unloadProgress) || unloadProgress <= 0 || unloadProgress >= 1) throw new RangeError('unloadProgress must be inside (0, 1)');
  if (!Number.isInteger(vehicleCount) || vehicleCount < 1 || vehicleCount > 1000) throw new RangeError('vehicleCount must be an integer from 1 to 1000');
  let elapsed = 0;
  let paused = false;
  const snapshot = () => ({
    elapsed,
    paused,
    vehicles: Array.from({ length: vehicleCount }, (_, index) => ({
      id: index + 1,
      ...getAgvFrame(elapsed, index + 1, index / vehicleCount, routeLength, unloadProgress)
    }))
  });
  const checkTime = (seconds: number) => {
    if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError('Time must be finite and nonnegative');
  };
  return {
    snapshot,
    step(seconds: number) {
      checkTime(seconds);
      if (!paused) {
        checkTime(elapsed + seconds);
        elapsed += seconds;
      }
      return snapshot();
    },
    pause() { paused = true; return snapshot(); },
    resume() { paused = false; return snapshot(); },
    seek(seconds: number) { checkTime(seconds); elapsed = seconds; return snapshot(); }
  };
}
