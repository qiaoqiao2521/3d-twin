export const POLAR_RELAY = { x: 8, z: 7, radius: 3.2 } as const;
export const POLAR_HOLD = { x: 35, z: 7, radius: 4.5 } as const;
export const POLAR_GATE = { x: 22, z: 7, radius: 3.1, height: 9, kind: 'gate' } as const;
export const POLAR_BRIDGE = { x: 22, z: 7, length: 12, width: 6, floorY: 0.9 } as const;
export const POLAR_HIGH_PASS = { x: 22, z: -10, radius: 4 } as const;
export const POLAR_JAMMER = { x: POLAR_HIGH_PASS.x, z: POLAR_HIGH_PASS.z, radius: 2.8 } as const;
export const POLAR_HOLD_SECONDS = 8;

export const POLAR_RIDGE_COVER = [-59, -50, -41, -32, -23, -17, -3, 2, 12, 19, 28, 37, 46, 55, 62]
  .map(z => ({ x: POLAR_GATE.x, z, radius: Math.abs(z) >= 19 ? 5 : 2.85, height: 5.4, kind: 'boulder' as const }));

export type PolarMissionPhase = 'relay' | 'hold' | 'boss';
export interface PolarMissionState {
  phase: PolarMissionPhase;
  gateOpen: boolean;
  holdElapsed: number;
  interactBuffered: boolean;
  jammerActive: boolean;
  // The opening bridge surge has been resolved, either by spawning it or by jamming it.
  bridgeWaveSent: boolean;
}

export function createPolarMission(): PolarMissionState {
  return { phase: 'relay', gateOpen: false, holdElapsed: 0, interactBuffered: false, jammerActive: false, bridgeWaveSent: false };
}

export function samplePolarArenaHeight(x: number, z: number, baseline: number): number {
  const ridge = Math.exp(-(((x - POLAR_GATE.x) / 6.4) ** 2));
  const cut = (at: number, width: number) => Math.exp(-(((z - at) / width) ** 4));
  const high = cut(POLAR_HIGH_PASS.z, 4.3);
  const low = cut(POLAR_GATE.z, 4.2);
  const spawnBlend = Math.min(1, Math.max(0, (Math.hypot(x, z) - 3) / 5));
  const trench = Math.exp(-(((x - POLAR_BRIDGE.x) / 3.8) ** 6)) * low;
  return spawnBlend * (baseline * 0.31 + ridge * (7.3 - 4.35 * high - 7.9 * low) - trench * 2.8);
}

const inside = (zone: { x: number; z: number; radius: number }, x: number, z: number) =>
  Math.hypot(x - zone.x, z - zone.z) <= zone.radius;

const jammerAvailable = (mission: PolarMissionState) =>
  !mission.jammerActive && !mission.bridgeWaveSent && mission.phase !== 'boss';

export function readPolarMissionPrompt(mission: PolarMissionState | null, x: number, z: number) {
  if (!mission) return null;
  const canRelay = mission.phase === 'relay' && inside(POLAR_RELAY, x, z);
  const canJam = jammerAvailable(mission) && inside(POLAR_JAMMER, x, z);
  return {
    phase: mission.phase,
    canInteract: canRelay || canJam,
    interaction: canRelay ? 'relay' as const : canJam ? 'jammer' as const : null,
    canJam,
    jammerActive: mission.jammerActive,
    jammerAvailable: jammerAvailable(mission),
    inHoldZone: mission.phase === 'hold' && inside(POLAR_HOLD, x, z),
    holdElapsed: mission.holdElapsed,
    holdSeconds: POLAR_HOLD_SECONDS,
    target: mission.phase === 'relay' ? POLAR_RELAY : mission.phase === 'hold' ? POLAR_HOLD : null
  };
}

// Returns true exactly on the frame that transitions to the boss phase.
export function stepPolarMission(mission: PolarMissionState, dt: number, x: number, z: number, grounded: boolean): boolean {
  if (mission.interactBuffered && grounded) {
    const interaction = readPolarMissionPrompt(mission, x, z)?.interaction;
    if (interaction === 'relay') {
      mission.phase = 'hold';
      mission.gateOpen = true;
    } else if (interaction === 'jammer') {
      mission.jammerActive = true;
    }
  }
  mission.interactBuffered = false;
  if (mission.phase !== 'hold') return false;
  if (!inside(POLAR_HOLD, x, z)) {
    mission.holdElapsed = 0;
    return false;
  }
  if (!grounded) return false;
  mission.holdElapsed = Math.min(POLAR_HOLD_SECONDS, mission.holdElapsed + dt);
  if (mission.holdElapsed < POLAR_HOLD_SECONDS - 1e-8) return false;
  mission.holdElapsed = POLAR_HOLD_SECONDS;
  mission.phase = 'boss';
  return true;
}
