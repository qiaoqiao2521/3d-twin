import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import {
  Wrench,
  Crosshair,
  Radar,
  Navigation,
  Eye,
  Volume2,
  VolumeX,
  Zap,
  Clock,
  AlertTriangle,
  Sparkles,
  Radio,
  Flame,
  ScanSearch,
  Tv,
  ArrowDownToLine,
  RotateCcw,
  SlidersHorizontal,
  ChevronDown,
  Swords
} from 'lucide-react';
import { UrdfJointDef, parseUrdfJoints, classifyMeshLayer } from '../utils/manifestUtils';
import { loadGlbSceneResilient, fetchTextAssetResilient } from '../utils/resilientGlbLoader';
import {
  SANDBOX_ACTORS,
  SandboxActorSpec,
  SandboxCamMode,
  SandboxInputState,
  SandboxKinematicState,
  getSandboxActorSpec,
  buildArenaWaypoints,
  buildNaturalLandTerrainFeatures,
  createInitialKinematicState,
  sampleLandTerrainHeight,
  sampleSeabedHeight,
  stepSandboxKinematics,
  computeSandboxUrdfJointAngle
} from '../utils/actionSandboxEngine';
import {
  OrthogonalExplosionPlan,
  buildSubAssemblyMatrix,
  computePartOrthogonalExplosionPlan
} from '../utils/cadDisassemblyEngine';
import { createExplodedTraceLinesController } from '../utils/cadBlueprintSceneFX';
import {
  IkJointLinkSpec,
  MoltenKerfNode,
  extractManipulatorJointIndices,
  solveCcdIkChain,
  stepMoltenKerfTrail
} from '../utils/ccdIkSolver';
import {
  BulletTimeState,
  ActiveFaultRecord,
  SandboxVisionMode,
  createInitialBulletTimeState,
  stepBulletTimeController,
  createChronoStrobeScheduler,
  stepChronoStrobeScheduler,
  classifyFaultSubsystem,
  computeFaultTolerantAttitudeOffsets,
  applyFaultToUrdfJointAngle,
  computeFaultOscilloscopeHarmonic,
  evaluateSwarmTacticalState,
  computeFlirWhiteHotLuminance
} from '../utils/hallOfFameEngine';
import {
  createSandevistanStrobeController,
  createSwarmSceneFXController,
  createMachineVisionFXController,
  createIkAndPlasmaFXController
} from '../utils/hallOfFameSceneFX';
import {
  EmissiveAreaLightSource,
  DynamicEmissivePoint,
  DualGearRayTracingController,
  createStudioLightboxPmrem,
  upgradeGlbPbrAndBuildStaticBvh,
  createDualGearRayTracingPipeline
} from '../utils/hybridRayTracing';
import { PathTracingHudBar } from './PathTracingHudBar';
import { TwinMaterialUniforms, attachTwinShaderEffects } from '../utils/liveTwinSceneFX';
import {
  WindTunnelDisasterConfig,
  SlsMaterializationState,
  createInitialSlsState,
  triggerSlsMaterialization,
  stepSlsMaterializationState,
  clampMagLensRadius,
  computeMpcRolloutFan,
  createDefaultWindTunnelConfig,
  buildMicroFpvCavityWaypoints,
  evaluateMicroFpvSplinePose
} from '../utils/sciTechEngine';
import {
  createMagLensAndSlsRigController,
  createMpcAndPowerArteriesController,
  createWindTunnelDisasterFXController
} from '../utils/sciTechSceneFX';
import { proceduralAudioSynth } from '../utils/proceduralAudioSynth';
import {
  ODRADEK_TOTAL_DURATION,
  ObstacleFootprint,
  OdradekBeaconTarget,
  findOdradekSensorJointIndex,
  computeOdradekSensorSnapPose,
  sampleOdradekTraversabilityGrid,
  evaluateOdradekTargetBeacons
} from '../utils/odradekScannerEngine';
import {
  TerrainWavefrontUniforms,
  attachTopographicWavefrontToTerrain,
  createOdradekScannerController
} from '../utils/odradekSceneFX';
import {
  OrbitalDropState,
  OverheatAndRcsState,
  SurfaceWeatheringState,
  createInitialOrbitalDropState,
  triggerOrbitalDropfall,
  stepOrbitalDropfall,
  computeDropfallUrdfJointDelta,
  createInitialOverheatState,
  stepOverheatAndRcsState,
  createInitialWeatheringState,
  stepDynamicWeathering,
  computeHorizonFocusMode,
  computeDiegeticSpineTelemetry
} from '../utils/aaaGameVfxEngine';
import { createAaaSandboxSceneFXController } from '../utils/aaaGameSceneFX';
import {
  LocomotionModeId,
  DirectorCameraMode,
  UltimateSkillState,
  InteractiveFieldTarget,
  TacticalScoreState,
  VectorDashState,
  getLocomotionModeSpec,
  cycleLocomotionMode,
  computeLocomotionUrdfJointDelta,
  createInitialVectorDashState,
  triggerVectorDash,
  stepVectorDash,
  getRobotUltimateMeta,
  createInitialUltimateSkillState,
  triggerUltimateSkill,
  stepUltimateSkill,
  computeUltimateUrdfJointDelta,
  getDirectorModeLabel,
  cycleDirectorCameraMode,
  computeDirectorCameraPose,
  createInitialTacticalScoreState,
  createArenaInteractiveTargets,
  damageInteractiveTarget,
  stepInteractiveTargets,
  findBestInteractiveTarget
} from '../utils/signatureShowcaseEngine';
import { createSignatureShowcaseSceneFXController } from '../utils/signatureShowcaseSceneFX';

interface ActionSandboxViewProps {
  initialActorId: string;
  onExitSandbox: (lastActorId: string) => void;
  onEnterMarsCombat?: (lastActorId: string) => void;
  audioSynthEnabled?: boolean;
  onChangeAudioSynth?: (enabled: boolean) => void;
}

interface ProjectedTargetBadge {
  id: string;
  label: string;
  distMeters: number;
  azimuthDeg: number;
  screenX: number;
  screenY: number;
  locked: boolean;
  odradekMinimalistTag?: string;
  isChiralGold?: boolean;
}

interface BoundSandboxJoint {
  def: UrdfJointDef;
  node: THREE.Object3D;
  basePos: THREE.Vector3;
  baseQuat: THREE.Quaternion;
  axisVec: THREE.Vector3;
  prevAngle: number;
  omegaRadS: number;
}

interface SandboxCadPart {
  mesh: THREE.Mesh;
  partName: string;
  layer: 'L1' | 'L2' | 'L3';
  basePos: THREE.Vector3;
  baseQuat: THREE.Quaternion;
  geomLocalCenter: THREE.Vector3;
  socketInParentLocal: THREE.Vector3;
  localOrthoVec: THREE.Vector3;
  orthoPlan: OrthogonalExplosionPlan;
  mountOriginWorld: THREE.Vector3;
  currentCenterWorld: THREE.Vector3;
  origMat: THREE.MeshStandardMaterial;
  origColor: THREE.Color;
  origEmissive: THREE.Color;
  origWireframe: boolean;
  twinUniforms: TwinMaterialUniforms;
  localFootCorners: THREE.Vector3[];
  role:
    | 'wheel'
    | 'suspension'
    | 'arm'
    | 'mast'
    | 'n1_rotor'
    | 'n2_rotor'
    | 'reverser_port'
    | 'reverser_stbd'
    | 'other';
}

interface LoadedWingmanInstance {
  actorId: string;
  root: THREE.Group;
  joints: BoundSandboxJoint[];
  meshes: { mesh: THREE.Mesh; origMat: THREE.MeshStandardMaterial; origColor: THREE.Color }[];
}

const PARTICLE_POOL_SIZE = 320;
const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _vCorner = new THREE.Vector3();
const _qA = new THREE.Quaternion();
const _eulerA = new THREE.Euler(0, 0, 0, 'YXZ');
const _axisX = new THREE.Vector3(1, 0, 0);
const _axisY = new THREE.Vector3(0, 1, 0);
const _box3 = new THREE.Box3();
const _invActorMat = new THREE.Matrix4();
const _partToActorMat = new THREE.Matrix4();
const _raycaster = new THREE.Raycaster();
const _pointerNdc = new THREE.Vector2();

function createProceduralSurfaceTexture(palette: 'mars' | 'seabed'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = palette === 'mars' ? '#5c2c1d' : '#08263a';
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 1600; i++) {
    const x = (i * 73) % 256;
    const y = (i * 137) % 256;
    const r = 1 + (i % 4);
    if (palette === 'mars') {
      ctx.fillStyle = i % 3 === 0 ? 'rgba(180, 92, 54, 0.22)' : 'rgba(38, 16, 10, 0.24)';
    } else {
      ctx.fillStyle = i % 3 === 0 ? 'rgba(14, 165, 233, 0.18)' : 'rgba(3, 18, 32, 0.28)';
    }
    ctx.fillRect(x, y, r * 2, r * 2);
  }

  ctx.strokeStyle = palette === 'mars' ? 'rgba(217, 119, 6, 0.12)' : 'rgba(56, 189, 248, 0.16)';
  ctx.lineWidth = 1.5;
  for (let k = 0; k < 14; k++) {
    ctx.beginPath();
    const y0 = k * 18;
    ctx.moveTo(0, y0);
    ctx.bezierCurveTo(85, y0 + 10, 170, y0 - 10, 256, y0);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(16, 16);
  return tex;
}

function createSoftParticleTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 64, 64);
  const grad = ctx.createRadialGradient(32, 32, 0.5, 32, 32, 28);
  grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
  grad.addColorStop(0.24, 'rgba(255, 250, 235, 0.86)');
  grad.addColorStop(0.55, 'rgba(255, 255, 255, 0.24)');
  grad.addColorStop(0.86, 'rgba(255, 255, 255, 0.03)');
  grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(32, 32, 29, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createFbmCloudSpriteTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);
  const img = ctx.createImageData(size, size);
  const data = img.data;

  const hash2 = (ix: number, iy: number) => {
    const s = Math.sin(ix * 127.1 + iy * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const vnoise = (x: number, y: number) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const a = hash2(ix, iy);
    const b = hash2(ix + 1, iy);
    const c = hash2(ix, iy + 1);
    const d = hash2(ix + 1, iy + 1);
    return a + (b - a) * ux + (c - a) * uy * (1 - ux) + (d - b) * ux * uy;
  };
  const fbm = (x: number, y: number) =>
    0.52 * vnoise(x, y) +
    0.28 * vnoise(x * 2.03 + 5.2, y * 2.03 + 1.3) +
    0.14 * vnoise(x * 4.11 + 9.7, y * 4.11 + 3.8) +
    0.06 * vnoise(x * 8.17 + 2.1, y * 8.17 + 7.4);

  for (let py = 0; py < size; py++) {
    const ny = (py / (size - 1)) * 2 - 1;
    for (let px = 0; px < size; px++) {
      const nx = (px / (size - 1)) * 2 - 1;
      const r = Math.hypot(nx, ny * 1.18);
      const idx = (py * size + px) * 4;
      if (r >= 0.96) {
        data[idx + 3] = 0;
        continue;
      }
      const radialFalloff = Math.pow(Math.max(0, 1 - r / 0.96), 2.15);
      const n = fbm((nx + 1.5) * 2.6, (ny + 1.5) * 2.6);
      const wisp = Math.max(0, Math.min(1, (n - 0.24) * 1.55)) * radialFalloff;
      const shade = Math.round(212 + 40 * (0.5 - ny * 0.35));
      data[idx] = Math.min(255, shade);
      data[idx + 1] = Math.min(255, shade + 4);
      data[idx + 2] = 255;
      data[idx + 3] = Math.round(wisp * 225);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createCustomDiscGeometry(radius: number, segs: number = 32): THREE.BufferGeometry {
  const pos = new Float32Array(segs * 9);
  const norm = new Float32Array(segs * 9);
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2;
    const a1 = ((i + 1) / segs) * Math.PI * 2;
    const b = i * 9;
    pos[b] = 0;
    pos[b + 1] = 0;
    pos[b + 2] = 0;
    pos[b + 3] = Math.cos(a0) * radius;
    pos[b + 4] = 0;
    pos[b + 5] = Math.sin(a0) * radius;
    pos[b + 6] = Math.cos(a1) * radius;
    pos[b + 7] = 0;
    pos[b + 8] = Math.sin(a1) * radius;
    for (let k = 0; k < 9; k += 3) {
      norm[b + k] = 0;
      norm[b + k + 1] = 1;
      norm[b + k + 2] = 0;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
  return g;
}

class TacticalSynthAudio {
  private ctx: AudioContext | null = null;
  public muted = false;

  private ensureCtx(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  playFire(domain: 'land' | 'sea' | 'air') {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (domain === 'air') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(145, now);
      osc.frequency.exponentialRampToValueAtTime(32, now + 0.48);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc.start(now);
      osc.stop(now + 0.52);
    } else if (domain === 'sea') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(620, now);
      osc.frequency.exponentialRampToValueAtTime(190, now + 0.36);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
      osc.start(now);
      osc.stop(now + 0.4);
    } else {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(980, now);
      osc.frequency.exponentialRampToValueAtTime(160, now + 0.28);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.32);
    }
  }

  playScan() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(1120, now + 0.35);
    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.44);
  }

  playBulletTimeSnap(entering: boolean) {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(entering ? 520 : 120, now);
    osc.frequency.exponentialRampToValueAtTime(entering ? 54 : 680, now + 0.28);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.32);
  }
}

export const ActionSandboxView: React.FC<ActionSandboxViewProps> = ({
  initialActorId,
  onExitSandbox,
  onEnterMarsCombat,
  audioSynthEnabled = false,
  onChangeAudioSynth
}) => {
  const [actorSpec, setActorSpec] = useState<SandboxActorSpec>(() =>
    getSandboxActorSpec(initialActorId)
  );
  const [camMode, setCamMode] = useState<SandboxCamMode>('chase');
  const [visionMode, setVisionMode] = useState<SandboxVisionMode>('normal');
  const [autoPatrol, setAutoPatrol] = useState<boolean>(false);
  const [muted, setMuted] = useState<boolean>(false);
  const [isLoadingModel, setIsLoadingModel] = useState<boolean>(true);
  const [glbLoadError, setGlbLoadError] = useState<string | null>(null);
  const [glbReloadNonce, setGlbReloadNonce] = useState<number>(0);
  const [targetBadges, setTargetBadges] = useState<ProjectedTargetBadge[]>([]);
  const [activeActionToast, setActiveActionToast] = useState<string>('');

  // Hall-of-Fame 5 Modules State
  const [strobeEnabled, setStrobeEnabled] = useState<boolean>(true);
  const [bulletTimeActive, setBulletTimeActive] = useState<boolean>(false);
  const [bulletExplosionTarget, setBulletExplosionTarget] = useState<number>(0.88);
  const [faultInjectMode, setFaultInjectMode] = useState<boolean>(false);
  const [activeFaults, setActiveFaults] = useState<ActiveFaultRecord[]>([]);
  const [faultAnchorScreen, setFaultAnchorScreen] = useState<[number, number] | null>(null);
  const [swarmOpsEnabled, setSwarmOpsEnabled] = useState<boolean>(false);
  const [swarmPhaseBanner, setSwarmPhaseBanner] = useState<string>('');
  const [ikEnabled, setIkEnabled] = useState<boolean>(false);
  const [plasmaCutting, setPlasmaCutting] = useState<boolean>(false);

  // Dual-Gear Hybrid Ray-Tracing State
  const [pathTracingEnabled, setPathTracingEnabled] = useState<boolean>(false);
  const [ptSpp, setPtSpp] = useState<number>(0);
  const [bvhStats, setBvhStats] = useState<{ meshes: number; emissives: number }>({
    meshes: 0,
    emissives: 0
  });
  const [isExporting4K, setIsExporting4K] = useState<boolean>(false);

  // 5 Hardcore Sci-Tech & Audiovisual Modules State
  const [magLensEnabled, setMagLensEnabled] = useState<boolean>(false);
  const [magLensRadius, setMagLensRadius] = useState<number>(0.48);
  const [slsActive, setSlsActive] = useState<boolean>(false);
  const [mpcEnabled, setMpcEnabled] = useState<boolean>(false);
  const [totalPowerWatts, setTotalPowerWatts] = useState<number>(0);
  const [windTunnelConfig, setWindTunnelConfig] = useState<WindTunnelDisasterConfig>(() =>
    createDefaultWindTunnelConfig()
  );
  const [microFpvActive, setMicroFpvActive] = useState<boolean>(false);
  const [microFpvSegmentLabel, setMicroFpvSegmentLabel] = useState<string>('');

  // Death Stranding Odradek + Six AAA Game VFX Systems State
  const [odradekActive, setOdradekActive] = useState<boolean>(false);
  const [odradekTierSummary, setOdradekTierSummary] = useState<{
    safeBlue: number;
    warnYellow: number;
    dangerRed: number;
  } | null>(null);
  const [autoOrbitalDropOnSwitch, setAutoOrbitalDropOnSwitch] = useState<boolean>(false);
  const [orbitalDropActive, setOrbitalDropActive] = useState<boolean>(false);
  const [overheatVentingUI, setOverheatVentingUI] = useState<boolean>(false);
  const [heatPctUI, setHeatPctUI] = useState<number>(14);
  const [focusWeakpointEnabled, setFocusWeakpointEnabled] = useState<boolean>(false);
  const [diegeticHudActive, setDiegeticHudActive] = useState<boolean>(false);
  const [weatheringDirtyUI, setWeatheringDirtyUI] = useState<boolean>(false);

  // Minimalist Industrial Dark Glass Dropdown & Auxiliary Drawer States (all collapsed by default!)
  const [actorMenuOpen, setActorMenuOpen] = useState<boolean>(false);
  const [visionMenuOpen, setVisionMenuOpen] = useState<boolean>(false);
  const [fxDrawerOpen, setFxDrawerOpen] = useState<boolean>(false);
  const [hintDimmed, setHintDimmed] = useState<boolean>(false);

  // Signature Multi-Mode Locomotion [1-4], Director Camera [K], Ultimate Showcase [Q] & Interactive Targets State
  const [locomotionMode, setLocomotionMode] = useState<LocomotionModeId>('standard');
  const [directorCamMode, setDirectorCamMode] = useState<DirectorCameraMode>('off');
  const [ultimateHudState, setUltimateHudState] = useState<{
    active: boolean;
    phaseLabel: string;
    progressPct: number;
  }>({ active: false, phaseLabel: '', progressPct: 0 });
  const [tacticalHudSummary, setTacticalHudSummary] = useState<{
    destroyedCount: number;
    comboCount: number;
    rallyActive: boolean;
    lockedTarget: {
      codeName: string;
      roleLabel: string;
      shieldPct: number;
      hpPct: number;
      distMeters: number;
    } | null;
  }>({
    destroyedCount: 0,
    comboCount: 0,
    rallyActive: false,
    lockedTarget: null
  });

  // High-frequency HUD DOM refs (mutated directly at 60Hz to avoid React reconciliation overhead)
  const speedDomRef = useRef<HTMLSpanElement | null>(null);
  const secMetricDomRef = useRef<HTMLSpanElement | null>(null);
  const headingDomRef = useRef<HTMLSpanElement | null>(null);
  const throttleBarDomRef = useRef<HTMLDivElement | null>(null);
  const faultOscPathRef = useRef<SVGPathElement | null>(null);

  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const rayTracerRef = useRef<DualGearRayTracingController | null>(null);
  const renderOnceRef = useRef<(() => void) | null>(null);
  const audioRef = useRef<TacticalSynthAudio>(new TacticalSynthAudio());

  const waypoints = useMemo(() => buildArenaWaypoints(actorSpec.domain), [actorSpec.domain]);

  const runtimeRef = useRef({
    camMode: 'chase' as SandboxCamMode,
    visionMode: 'normal' as SandboxVisionMode,
    autoPatrol: false,
    strobeEnabled: true,
    bulletTimeActive: false,
    bulletExplosionTarget: 0.88,
    faultInjectMode: false,
    activeFaults: [] as ActiveFaultRecord[],
    swarmOpsEnabled: false,
    ikEnabled: false,
    plasmaCutting: false,
    pathTracingEnabled: false,
    audioSynthEnabled: false,
    muted: false,
    magLensEnabled: false,
    magLensHoverValid: false,
    magLensCenter: new THREE.Vector3(),
    magLensRadius: 0.48,
    slsRelState: createInitialSlsState(1.8) as SlsMaterializationState,
    mpcEnabled: false,
    windTunnelConfig: createDefaultWindTunnelConfig(),
    microFpvActive: false,
    microFpvPhase: 0,
    autoOrbitalDropOnSwitch: false,
    focusWeakpointEnabled: false,
    diegeticHudActive: false,
    locomotionMode: 'standard' as LocomotionModeId,
    directorCamMode: 'off' as DirectorCameraMode,
    triggerUltimateRequested: false,
    triggerDashRequested: false,
    dashStrafeSign: 0,
    triggerOrbitalDropRequested: false,
    triggerOverheatVentRequested: false,
    cleanWeatheringRequested: false,
    triggerFireRequested: false,
    triggerScanRequested: false,
    triggerJumpRequested: false,
    quickFaultRequested: false
  });

  useEffect(() => {
    const r = runtimeRef.current;
    r.camMode = camMode;
    r.visionMode = visionMode;
    r.autoPatrol = autoPatrol;
    r.strobeEnabled = strobeEnabled;
    r.bulletTimeActive = bulletTimeActive;
    r.bulletExplosionTarget = bulletExplosionTarget;
    r.faultInjectMode = faultInjectMode;
    r.activeFaults = activeFaults;
    r.swarmOpsEnabled = swarmOpsEnabled;
    r.ikEnabled = ikEnabled;
    r.plasmaCutting = plasmaCutting;
    r.pathTracingEnabled = pathTracingEnabled;
    r.audioSynthEnabled = audioSynthEnabled && !muted;
    r.muted = muted;
    r.magLensEnabled = magLensEnabled;
    r.magLensRadius = magLensRadius;
    r.mpcEnabled = mpcEnabled;
    r.windTunnelConfig = windTunnelConfig;
    r.microFpvActive = microFpvActive;
    r.autoOrbitalDropOnSwitch = autoOrbitalDropOnSwitch;
    r.focusWeakpointEnabled = focusWeakpointEnabled;
    r.diegeticHudActive = diegeticHudActive;
    r.locomotionMode = locomotionMode;
    r.directorCamMode = directorCamMode;
  }, [
    camMode,
    visionMode,
    autoPatrol,
    strobeEnabled,
    bulletTimeActive,
    bulletExplosionTarget,
    faultInjectMode,
    activeFaults,
    swarmOpsEnabled,
    ikEnabled,
    plasmaCutting,
    pathTracingEnabled,
    audioSynthEnabled,
    muted,
    magLensEnabled,
    magLensRadius,
    mpcEnabled,
    windTunnelConfig,
    microFpvActive,
    autoOrbitalDropOnSwitch,
    focusWeakpointEnabled,
    diegeticHudActive,
    locomotionMode,
    directorCamMode
  ]);

  const onExitSandboxRef = useRef(onExitSandbox);
  useEffect(() => {
    onExitSandboxRef.current = onExitSandbox;
  }, [onExitSandbox]);

  useEffect(() => {
    audioRef.current.muted = muted;
    if (muted) {
      proceduralAudioSynth.silenceContinuousLoops();
    }
  }, [muted]);

  useEffect(() => {
    document.body.dataset.state = 'playing';
    const hintTimer = window.setTimeout(() => setHintDimmed(true), 5000);
    return () => {
      window.clearTimeout(hintTimer);
      delete document.body.dataset.state;
      proceduralAudioSynth.silenceContinuousLoops();
    };
  }, []);

  // Reset per-actor transient faults when switching actor (and optionally trigger Orbital Dropfall!)
  useEffect(() => {
    setActiveFaults([]);
    setFaultAnchorScreen(null);
    setBulletTimeActive(false);
    setPathTracingEnabled(false);
    setMicroFpvActive(false);
    setLocomotionMode('standard');
    setUltimateHudState({ active: false, phaseLabel: '', progressPct: 0 });
    runtimeRef.current.locomotionMode = 'standard';
    runtimeRef.current.microFpvActive = false;
    if (runtimeRef.current.autoOrbitalDropOnSwitch) {
      runtimeRef.current.triggerOrbitalDropRequested = true;
    }
  }, [actorSpec.id]);

  const triggerUltimateAction = () => {
    setPathTracingEnabled(false);
    runtimeRef.current.pathTracingEnabled = false;
    runtimeRef.current.triggerUltimateRequested = true;
    audioRef.current.playFire(actorSpec.domain);
    if (runtimeRef.current.audioSynthEnabled) {
      proceduralAudioSynth.playSubBassImpact('emp_bullettime');
    }
    const meta = getRobotUltimateMeta(actorSpec.id);
    setActiveActionToast(`终极绝技激发：${meta.skillName}`);
  };

  const cycleLocomotionAction = () => {
    setLocomotionMode((prev) => {
      const next = cycleLocomotionMode(prev);
      runtimeRef.current.locomotionMode = next;
      const spec = getLocomotionModeSpec(actorSpec.id, actorSpec.domain, next);
      proceduralAudioSynth.playMechanicalLatchClick(760, !runtimeRef.current.muted);
      setActiveActionToast(spec.fullTitle);
      return next;
    });
  };

  const cycleDirectorCamAction = () => {
    setDirectorCamMode((prev) => {
      const next = cycleDirectorCameraMode(prev);
      runtimeRef.current.directorCamMode = next;
      proceduralAudioSynth.playMechanicalLatchClick(820, !runtimeRef.current.muted);
      setActiveActionToast(`导演运镜切换：${getDirectorModeLabel(next)}`);
      return next;
    });
  };

  const handleTriggerSlsPrint = () => {
    runtimeRef.current.slsRelState = triggerSlsMaterialization(0, 1.8);
    setSlsActive(true);
    if (runtimeRef.current.audioSynthEnabled) {
      proceduralAudioSynth.playSubBassImpact('sls_print');
    }
    setActiveActionToast('1.8s 双激光 SLS 金属增材烧结重构：已激发');
  };

  const handleToggleMicroFpv = () => {
    setMicroFpvActive((prev) => {
      const next = !prev;
      runtimeRef.current.microFpvActive = next;
      setActiveActionToast(
        next
          ? '纳米穿越机微距钻膛大片 [near=0.002]：已切入内部腔体航线'
          : '已退出微距钻膛航线 · 恢复实景战术镜头'
      );
      return next;
    });
  };

  const triggerFireAction = () => {
    runtimeRef.current.triggerFireRequested = true;
    audioRef.current.playFire(actorSpec.domain);
    if (runtimeRef.current.audioSynthEnabled) {
      proceduralAudioSynth.playSubBassImpact('laser');
    }
    setActiveActionToast(`已击发：${actorSpec.fireActionTitle}`);
  };

  const triggerScanAction = () => {
    runtimeRef.current.triggerScanRequested = true;
    proceduralAudioSynth.playOdradekScanSignature(!runtimeRef.current.muted);
    setActiveActionToast(
      actorSpec.domain === 'air'
        ? '高空三维球面空域雷达波已激发 · 空域无障碍净空锁定'
        : '奥德拉克地形可通行性矩阵已锁定 (平坦 · △陡坡 · ✕禁区)'
    );
  };

  const triggerOrbitalDropAction = () => {
    runtimeRef.current.triggerOrbitalDropRequested = true;
    setOrbitalDropActive(true);
    proceduralAudioSynth.playOrbitalDropfallAudio('launch_fall', !runtimeRef.current.muted);
    setActiveActionToast('泰坦级轨道超音速空投部署启动 (Y=+160m 激波俯冲 → 12m 反推 → 液压起身)');
  };

  const triggerOverheatVentAction = () => {
    runtimeRef.current.triggerOverheatVentRequested = true;
    setActiveActionToast('核心过热强制开甲排温：外层护甲弹开 12% · 高压冷却白雾喷射');
  };

  const handleCleanWeathering = () => {
    runtimeRef.current.cleanWeatheringRequested = true;
    setWeatheringDirtyUI(false);
    proceduralAudioSynth.playMechanicalLatchClick(920, !runtimeRef.current.muted);
    setActiveActionToast('纳米自清洁完成 · 表面红尘/结霜/高温氧化层已清零');
  };

  const togglePatrolAction = () => {
    setAutoPatrol((prev) => {
      const next = !prev;
      setActiveActionToast(
        next
          ? '战术航点自动驾驶巡逻 + 地平线鎏金箭头流光导航带：已启动'
          : '已切回手动驾驶控制 (WASD)'
      );
      return next;
    });
  };

  const toggleBulletTimeAction = () => {
    setBulletTimeActive((prev) => {
      const next = !prev;
      audioRef.current.playBulletTimeSnap(next);
      if (runtimeRef.current.audioSynthEnabled) {
        proceduralAudioSynth.playSubBassImpact('emp_bullettime');
      }
      setActiveActionToast(
        next
          ? '子弹时间悬停爆甲 [0.01x] 已开启 · 4工序装甲正交剥离悬停检视中 (按 R 开启路径追踪)'
          : '装甲咔嚓咬合收拢 · 1.0x 全速恢复实景机动！'
      );
      return next;
    });
  };

  const handleSelfHealAll = () => {
    setActiveFaults([]);
    setFaultInjectMode(false);
    setFaultAnchorScreen(null);
    setActiveActionToast('逆时自愈修复完成 · 全身伺服与推力分配矩阵恢复 100% 标称状态');
  };

  const handleExport4K = async () => {
    if (!rayTracerRef.current || !renderOnceRef.current || isExporting4K) return;
    setIsExporting4K(true);
    try {
      await rayTracerRef.current.export4KFrame(
        `${actorSpec.id}_sandbox_raytraced_4k_${Date.now()}.png`,
        renderOnceRef.current
      );
      setActiveActionToast('已导出 3840×2160 (4K UHD) 物理光追渲染帧 (.png)');
    } finally {
      setIsExporting4K(false);
    }
  };

  useEffect(() => {
    if (!activeActionToast) return;
    const t = window.setTimeout(() => setActiveActionToast(''), 2500);
    return () => window.clearTimeout(t);
  }, [activeActionToast]);

  // Core Three.js Action Sandbox Scene + 5 Hall-of-Fame Modules + Dual-Gear Hybrid Ray-Tracing Loop
  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;
    let disposed = false;

    const width = container.clientWidth || 1280;
    const height = container.clientHeight || 760;

    const probeCanvas = document.createElement('canvas');
    const probeGl = probeCanvas.getContext('webgl2');
    const dbgExt = probeGl?.getExtension('WEBGL_debug_renderer_info');
    const gpuStr = probeGl
      ? String(probeGl.getParameter(dbgExt ? dbgExt.UNMASKED_RENDERER_WEBGL : probeGl.RENDERER))
      : '';
    probeGl?.getExtension('WEBGL_lose_context')?.loseContext();
    const isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpuStr);

    const scene = new THREE.Scene();
    const domainBgHex =
      actorSpec.domain === 'air'
        ? 0x0b1d3a
        : actorSpec.domain === 'sea'
          ? 0x041829
          : 0xb56542;
    const normalBgColor = new THREE.Color(domainBgHex);
    const darkVoidBgColor = new THREE.Color(0x02050b);
    const flirBgColor = new THREE.Color(0x101318);

    scene.background = normalBgColor.clone();
    const normalFogDensity =
      actorSpec.domain === 'air' ? 0.0075 : actorSpec.domain === 'sea' ? 0.024 : 0.0115;
    const sceneFog = new THREE.FogExp2(domainBgHex, normalFogDensity);
    scene.fog = sceneFog;

    const camera = new THREE.PerspectiveCamera(52, width / height, 0.05, 340);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance'
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const envTex = createStudioLightboxPmrem(renderer);
    scene.environment = envTex;

    const rayTracer = createDualGearRayTracingPipeline(renderer, width, height, isSoftwareGl);
    rayTracerRef.current = rayTracer;
    let emissiveSources: EmissiveAreaLightSource[] = [];

    // Domain-Matched Warm/Cool Lighting Contrast
    let keyLight: THREE.DirectionalLight;
    let rimLight: THREE.DirectionalLight;
    if (actorSpec.domain === 'land') {
      const hemi = new THREE.HemisphereLight(0xfde68a, 0x3b180e, 1.2);
      scene.add(hemi);
      keyLight = new THREE.DirectionalLight(0xffedd5, 2.6);
      keyLight.position.set(28, 42, 18);
      scene.add(keyLight);
      rimLight = new THREE.DirectionalLight(0x38bdf8, 1.1);
      rimLight.position.set(-24, 15, -20);
      scene.add(rimLight);
    } else if (actorSpec.domain === 'sea') {
      const hemi = new THREE.HemisphereLight(0x38bdf8, 0x020617, 1.35);
      scene.add(hemi);
      keyLight = new THREE.DirectionalLight(0x67e8f9, 2.1);
      keyLight.position.set(10, 45, 12);
      scene.add(keyLight);
      rimLight = new THREE.DirectionalLight(0x0ea5e9, 1.25);
      rimLight.position.set(-20, 8, -18);
      scene.add(rimLight);
    } else {
      const hemi = new THREE.HemisphereLight(0xe0f2fe, 0x1e293b, 1.45);
      scene.add(hemi);
      keyLight = new THREE.DirectionalLight(0xfff7ed, 2.8);
      keyLight.position.set(35, 60, -25);
      scene.add(keyLight);
      rimLight = new THREE.DirectionalLight(0x38bdf8, 1.4);
      rimLight.position.set(-30, -12, 20);
      scene.add(rimLight);
    }

    // =========================================================================
    // BUILD DOMAIN-SPECIFIC PROCEDURAL ENVIRONMENT (ZERO PRIMITIVE GEOMETRIES!)
    // =========================================================================
    const envGroup = new THREE.Group();
    scene.add(envGroup);
    let surfaceTex: THREE.CanvasTexture | null = null;
    let primaryTerrainMat: THREE.MeshStandardMaterial | null = null;
    let clickableGroundMesh: THREE.Mesh | null = null;
    let terrainWaveUniforms: TerrainWavefrontUniforms | null = null;
    let obstacleMat: THREE.MeshStandardMaterial | null = null;
    let origObstacleColor = new THREE.Color(0xffffff);
    const arenaObstacles: ObstacleFootprint[] = [];
    const softParticleTex = createSoftParticleTexture();
    let fbmCloudTex: THREE.CanvasTexture | null = null;
    let ambientDrifters: THREE.Points | null = null;

    if (actorSpec.domain === 'land') {
      // Martian Dusk Rayleigh Atmospheric Sky Dome (inverted LatheGeometry — zero primitive shapes!)
      const skyProfile: THREE.Vector2[] = [];
      for (let k = 0; k <= 16; k++) {
        const theta = (k / 16) * Math.PI;
        skyProfile.push(
          new THREE.Vector2(Math.max(0.01, Math.sin(theta) * 240), -Math.cos(theta) * 240)
        );
      }
      const skyDomeGeo = new THREE.LatheGeometry(skyProfile, 32);
      const skyDomeMat = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        vertexShader: `
          varying vec3 vSkyDir;
          void main() {
            vSkyDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying vec3 vSkyDir;
          void main() {
            float h = clamp(vSkyDir.y, -0.15, 1.0);
            vec3 horizon = vec3(0.788, 0.478, 0.325);
            vec3 midSky = vec3(0.431, 0.208, 0.173);
            vec3 zenith = vec3(0.102, 0.059, 0.078);
            vec3 sunDir = normalize(vec3(0.55, 0.24, 0.36));
            float sunHalo = pow(max(0.0, dot(normalize(vSkyDir), sunDir)), 9.0);
            vec3 col = h < 0.28
              ? mix(horizon, midSky, smoothstep(-0.08, 0.28, h))
              : mix(midSky, zenith, smoothstep(0.28, 0.92, h));
            col += vec3(0.95, 0.62, 0.35) * sunHalo * 0.42;
            gl_FragColor = vec4(col, 1.0);
          }
        `
      });
      const skyDome = new THREE.Mesh(skyDomeGeo, skyDomeMat);
      skyDome.frustumCulled = false;
      envGroup.add(skyDome);

      const segs = 96;
      const span = 150;
      const vertCount = (segs + 1) * (segs + 1);
      const posArr = new Float32Array(vertCount * 3);
      const uvArr = new Float32Array(vertCount * 2);
      const indices: number[] = [];

      let vi = 0;
      for (let iz = 0; iz <= segs; iz++) {
        const z = (iz / segs - 0.5) * span;
        for (let ix = 0; ix <= segs; ix++) {
          const x = (ix / segs - 0.5) * span;
          const y = sampleLandTerrainHeight(x, z);
          posArr[vi * 3] = x;
          posArr[vi * 3 + 1] = y;
          posArr[vi * 3 + 2] = z;
          uvArr[vi * 2] = (ix / segs) * 16;
          uvArr[vi * 2 + 1] = (iz / segs) * 16;
          vi++;
        }
      }
      for (let iz = 0; iz < segs; iz++) {
        for (let ix = 0; ix < segs; ix++) {
          const a = iz * (segs + 1) + ix;
          const b = a + 1;
          const c = a + (segs + 1);
          const d = c + 1;
          indices.push(a, c, b, b, c, d);
        }
      }

      const terrainGeo = new THREE.BufferGeometry();
      terrainGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
      terrainGeo.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
      terrainGeo.setIndex(indices);
      terrainGeo.computeVertexNormals();

      surfaceTex = createProceduralSurfaceTexture('mars');
      primaryTerrainMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: surfaceTex,
        bumpMap: surfaceTex,
        bumpScale: 0.16,
        roughness: 0.88,
        metalness: 0.06
      });
      terrainWaveUniforms = attachTopographicWavefrontToTerrain(primaryTerrainMat, false);
      clickableGroundMesh = new THREE.Mesh(terrainGeo, primaryTerrainMat);
      envGroup.add(clickableGroundMesh);

      // Analytical natural terrain ridges & crater rims ONLY — zero fake chocolate-cone rocks!
      for (const feat of buildNaturalLandTerrainFeatures()) {
        arenaObstacles.push(feat);
      }
    } else if (actorSpec.domain === 'sea') {
      const segs = 68;
      const span = 130;
      const vertCount = (segs + 1) * (segs + 1);
      const posArr = new Float32Array(vertCount * 3);
      const uvArr = new Float32Array(vertCount * 2);
      const indices: number[] = [];

      let vi = 0;
      for (let iz = 0; iz <= segs; iz++) {
        const z = (iz / segs - 0.5) * span;
        for (let ix = 0; ix <= segs; ix++) {
          const x = (ix / segs - 0.5) * span;
          posArr[vi * 3] = x;
          posArr[vi * 3 + 1] = sampleSeabedHeight(x, z);
          posArr[vi * 3 + 2] = z;
          uvArr[vi * 2] = (ix / segs) * 12;
          uvArr[vi * 2 + 1] = (iz / segs) * 12;
          vi++;
        }
      }
      for (let iz = 0; iz < segs; iz++) {
        for (let ix = 0; ix < segs; ix++) {
          const a = iz * (segs + 1) + ix;
          const b = a + 1;
          const c = a + (segs + 1);
          const d = c + 1;
          indices.push(a, c, b, b, c, d);
        }
      }
      const bedGeo = new THREE.BufferGeometry();
      bedGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
      bedGeo.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
      bedGeo.setIndex(indices);
      bedGeo.computeVertexNormals();

      surfaceTex = createProceduralSurfaceTexture('seabed');
      primaryTerrainMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: surfaceTex,
        roughness: 0.72,
        metalness: 0.15,
        emissive: new THREE.Color(0x032238),
        emissiveIntensity: 0.42
      });
      terrainWaveUniforms = attachTopographicWavefrontToTerrain(primaryTerrainMat, true);
      clickableGroundMesh = new THREE.Mesh(bedGeo, primaryTerrainMat);
      envGroup.add(clickableGroundMesh);

      const towerProfile = [
        new THREE.Vector2(0.08, 3.8),
        new THREE.Vector2(0.24, 3.4),
        new THREE.Vector2(0.18, 1.8),
        new THREE.Vector2(0.55, 0.35),
        new THREE.Vector2(0.85, 0.0)
      ];
      const towerGeo = new THREE.LatheGeometry(towerProfile, 12);
      obstacleMat = new THREE.MeshStandardMaterial({
        color: 0x0ea5e9,
        roughness: 0.35,
        metalness: 0.55,
        emissive: new THREE.Color(0x0284c7),
        emissiveIntensity: 0.35
      });
      origObstacleColor = obstacleMat.color.clone();
      waypoints.forEach((wp) => {
        const bx = wp.x + wp.targetRockOffset[0];
        const bz = wp.z + wp.targetRockOffset[2];
        const by = sampleSeabedHeight(bx, bz);
        const towerMesh = new THREE.Mesh(towerGeo, obstacleMat!);
        towerMesh.position.set(bx, by, bz);
        envGroup.add(towerMesh);
        arenaObstacles.push({ x: bx, y: by, z: bz, radius: 1.05 });
      });

      const plankCount = 420;
      const pPos = new Float32Array(plankCount * 3);
      for (let i = 0; i < plankCount; i++) {
        pPos[i * 3] = (((i * 97) % 100) - 50) * 1.1;
        pPos[i * 3 + 1] = -3.8 + ((i * 53) % 100) * 0.12;
        pPos[i * 3 + 2] = (((i * 131) % 100) - 50) * 1.1;
      }
      const pGeo = new THREE.BufferGeometry();
      pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
      ambientDrifters = new THREE.Points(
        pGeo,
        new THREE.PointsMaterial({
          color: 0x38bdf8,
          map: softParticleTex,
          size: 0.2,
          transparent: true,
          opacity: 0.68,
          alphaTest: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        })
      );
      envGroup.add(ambientDrifters);
    } else {
      // Multi-layer procedural FBM soft cloud sprites (zero flat UFO discs!)
      fbmCloudTex = createFbmCloudSpriteTexture();
      const cloudCount = 140;
      const cPos = new Float32Array(cloudCount * 3);
      for (let i = 0; i < cloudCount; i++) {
        const ang = (i / cloudCount) * Math.PI * 2 * 4.1;
        const rad = 14 + ((i * 29) % 105);
        const layerY = i % 3 === 0 ? 22 + (i % 8) * 1.4 : 2.5 + (i % 7) * 1.15;
        cPos[i * 3] = Math.cos(ang) * rad;
        cPos[i * 3 + 1] = layerY;
        cPos[i * 3 + 2] = Math.sin(ang) * rad;
      }
      const cGeo = new THREE.BufferGeometry();
      cGeo.setAttribute('position', new THREE.BufferAttribute(cPos, 3));
      const cloudSprites = new THREE.Points(
        cGeo,
        new THREE.PointsMaterial({
          color: 0xdbeafe,
          map: fbmCloudTex,
          size: 13.5,
          transparent: true,
          opacity: 0.34,
          alphaTest: 0,
          depthWrite: false
        })
      );
      cloudSprites.frustumCulled = false;
      envGroup.add(cloudSprites);

      const streakCount = 180;
      const sPos = new Float32Array(streakCount * 3);
      for (let i = 0; i < streakCount; i++) {
        sPos[i * 3] = (((i * 67) % 120) - 60) * 1.4;
        sPos[i * 3 + 1] = 6 + ((i * 41) % 20);
        sPos[i * 3 + 2] = (((i * 113) % 120) - 60) * 1.4;
      }
      const sGeo = new THREE.BufferGeometry();
      sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
      ambientDrifters = new THREE.Points(
        sGeo,
        new THREE.PointsMaterial({
          color: 0xbae6fd,
          map: softParticleTex,
          size: 0.26,
          transparent: true,
          opacity: 0.65,
          alphaTest: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        })
      );
      envGroup.add(ambientDrifters);
    }

    // =========================================================================
    // WAYPOINTS & HALL-OF-FAME SCENE FX CONTROLLERS
    // =========================================================================
    const wpGroup = new THREE.Group();
    scene.add(wpGroup);
    const wpRingMeshes: THREE.LineLoop[] = [];
    waypoints.forEach((wp) => {
      const rPts: THREE.Vector3[] = [];
      const rad = actorSpec.domain === 'air' ? 3.2 : 1.75;
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        if (actorSpec.domain === 'air') {
          rPts.push(new THREE.Vector3(0, Math.cos(a) * rad, Math.sin(a) * rad));
        } else {
          rPts.push(new THREE.Vector3(Math.cos(a) * rad, 0.08, Math.sin(a) * rad));
        }
      }
      const loop = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(rPts),
        new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.85 })
      );
      loop.position.set(wp.x, wp.y, wp.z);
      wpGroup.add(loop);
      wpRingMeshes.push(loop);

      const beamPts = [
        new THREE.Vector3(wp.x, wp.y, wp.z),
        new THREE.Vector3(wp.x, wp.y + (actorSpec.domain === 'air' ? 5.5 : 4.2), wp.z)
      ];
      wpGroup.add(
        new THREE.LineSegments(
          new THREE.BufferGeometry().setFromPoints(beamPts),
          new THREE.LineBasicMaterial({ color: 0x0ea5e9, transparent: true, opacity: 0.42 })
        )
      );
    });

    // 1. Sandevistan 4D Chrono-Pose Strobe Trail (<= 3 faint Fresnel rim slots, zero geometry duplication!)
    const strobeController = createSandevistanStrobeController(3);
    scene.add(strobeController.group);

    // 2. Mid-Air Bullet-Time 4-Stage Orthogonal CAD Trace Lines
    const bulletTraceController = createExplodedTraceLinesController(260);
    scene.add(bulletTraceController.group);

    // 3. Multi-GLB Swarm Link-16 Laser Mesh & Subsea Catenary Umbilical Tether
    const swarmFxController = createSwarmSceneFXController();
    scene.add(swarmFxController.group);
    const swarmUnitsGroup = new THREE.Group();
    scene.add(swarmUnitsGroup);

    // 4. Machine-Eye Native Visions (Pure LiDAR SLAM Point Cloud & Acoustic Echo)
    const visionFxController = createMachineVisionFXController(
      actorSpec.domain,
      waypoints,
      softParticleTex
    );
    scene.add(visionFxController.group);

    // 5. Real 6-DOF CCD IK Target Gizmo, Plasma Arc Torch & Molten Kerf Trail
    const ikPlasmaController = createIkAndPlasmaFXController(softParticleTex);
    scene.add(ikPlasmaController.group);

    // 6. Five Hardcore Sci-Tech Scene FX Controllers (Mag-Lens + SLS Rig, 11-Arc MPC + Power Arteries, Wind-Tunnel Disaster)
    const magSlsRig = createMagLensAndSlsRigController();
    scene.add(magSlsRig.group);
    const mpcPowerCtrl = createMpcAndPowerArteriesController();
    scene.add(mpcPowerCtrl.group);
    const disasterFx = createWindTunnelDisasterFXController();
    scene.add(disasterFx.group);

    // 7. Death Stranding Odradek 2,500-Point Traversability Scanner + Six AAA Game VFX Controllers
    const odradekCtrl = createOdradekScannerController();
    scene.add(odradekCtrl.group);
    const aaaSandboxFx = createAaaSandboxSceneFXController();
    scene.add(aaaSandboxFx.worldGroup);
    const signatureSandboxFx = createSignatureShowcaseSceneFXController(4);
    scene.add(signatureSandboxFx.rootGroup);

    // =========================================================================
    // LEAD ACTOR RIG + REAL GLB MODEL LOADER + ATTACHED DOMAIN VFX
    // =========================================================================
    const actorRoot = new THREE.Group();
    scene.add(actorRoot);
    actorRoot.add(aaaSandboxFx.actorAttachedGroup);

    const modelHolder = new THREE.Group();
    actorRoot.add(modelHolder);

    const contactShadow = new THREE.Mesh(
      createCustomDiscGeometry(1.15, 32),
      new THREE.MeshBasicMaterial({
        color: 0x020617,
        transparent: true,
        opacity: actorSpec.domain === 'land' ? 0.44 : 0.0,
        depthWrite: false
      })
    );
    contactShadow.position.y = 0.025;
    scene.add(contactShadow);

    const subseaHeadlightGroup = new THREE.Group();
    if (actorSpec.domain === 'sea') {
      const coneProfile = [
        new THREE.Vector2(0.03, 0.0),
        new THREE.Vector2(0.32, 1.4),
        new THREE.Vector2(0.76, 4.8)
      ];
      const coneGeo = new THREE.LatheGeometry(coneProfile, 24);
      coneGeo.rotateZ(-Math.PI / 2);
      const coneMat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        vertexShader: `
          varying float vAxial;
          varying vec3 vNormalW;
          varying vec3 vWorldPos;
          void main() {
            vAxial = clamp(position.x / 4.8, 0.0, 1.0);
            vNormalW = normalize(mat3(modelMatrix) * normal);
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorldPos = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `,
        fragmentShader: `
          varying float vAxial;
          varying vec3 vNormalW;
          varying vec3 vWorldPos;
          void main() {
            vec3 viewDir = normalize(cameraPosition - vWorldPos);
            float softEdge = pow(clamp(abs(dot(normalize(vNormalW), viewDir)), 0.0, 1.0), 1.85);
            float axialFade = (1.0 - smoothstep(0.0, 0.06, 0.06 - vAxial)) * exp(-vAxial * 1.95);
            float alpha = softEdge * axialFade * 0.16;
            gl_FragColor = vec4(vec3(0.35, 0.88, 1.0) * alpha * 1.4, alpha);
          }
        `
      });
      const leftBeam = new THREE.Mesh(coneGeo, coneMat);
      leftBeam.position.set(0.65, 0.05, 0.35);
      const rightBeam = new THREE.Mesh(coneGeo, coneMat);
      rightBeam.position.set(0.65, 0.05, -0.35);
      subseaHeadlightGroup.add(leftBeam, rightBeam);
      actorRoot.add(subseaHeadlightGroup);
    }

    const machPlumeGroup = new THREE.Group();
    const boomUniforms = { uOpacity: { value: 0.0 } };
    const sonicBoomConeMesh = (() => {
      const boomProfile = [
        new THREE.Vector2(0.28, 0.0),
        new THREE.Vector2(1.45, -1.15),
        new THREE.Vector2(2.35, -2.05)
      ];
      const g = new THREE.LatheGeometry(boomProfile, 36);
      g.rotateZ(-Math.PI / 2);
      const m = new THREE.ShaderMaterial({
        uniforms: boomUniforms,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: `
          varying float vU;
          varying vec3 vNormalW;
          varying vec3 vWorldPos;
          void main() {
            vU = clamp(-position.x / 2.05, 0.0, 1.0);
            vNormalW = normalize(mat3(modelMatrix) * normal);
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorldPos = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `,
        fragmentShader: `
          uniform float uOpacity;
          varying float vU;
          varying vec3 vNormalW;
          varying vec3 vWorldPos;
          void main() {
            vec3 viewDir = normalize(cameraPosition - vWorldPos);
            float sil = pow(clamp(abs(dot(normalize(vNormalW), viewDir)), 0.0, 1.0), 1.5);
            float ringEnv = sin(vU * 3.14159265);
            float alpha = sil * ringEnv * ringEnv * min(0.28, uOpacity);
            gl_FragColor = vec4(vec3(0.85, 0.95, 1.0) * alpha * 1.35, alpha);
          }
        `
      });
      return new THREE.Mesh(g, m);
    })();

    if (actorSpec.domain === 'air') {
      const outerFlameProfile = [
        new THREE.Vector2(0.28, 0.0),
        new THREE.Vector2(0.36, 0.95),
        new THREE.Vector2(0.19, 2.55),
        new THREE.Vector2(0.01, 3.65)
      ];
      const flameGeo = new THREE.LatheGeometry(outerFlameProfile, 28);
      flameGeo.rotateZ(Math.PI / 2);
      const flameMat = new THREE.ShaderMaterial({
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: `
          varying float vAxial;
          varying vec3 vNormalW;
          varying vec3 vWorldPos;
          void main() {
            vAxial = clamp(-position.x / 3.65, 0.0, 1.0);
            vNormalW = normalize(mat3(modelMatrix) * normal);
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorldPos = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `,
        fragmentShader: `
          varying float vAxial;
          varying vec3 vNormalW;
          varying vec3 vWorldPos;
          void main() {
            vec3 viewDir = normalize(cameraPosition - vWorldPos);
            float coreSoft = pow(clamp(abs(dot(normalize(vNormalW), viewDir)), 0.0, 1.0), 1.65);
            float tailDecay = exp(-vAxial * 2.55) * smoothstep(0.0, 0.07, vAxial);
            float machDiamonds = pow(max(0.0, sin(vAxial * 18.0)), 4.0) * (1.0 - vAxial);
            vec3 baseBlue = vec3(0.22, 0.58, 1.0);
            vec3 diamondViolet = vec3(0.78, 0.88, 1.0);
            vec3 col = mix(baseBlue, diamondViolet, machDiamonds * 0.85);
            float alpha = coreSoft * tailDecay * (0.42 + machDiamonds * 0.34);
            gl_FragColor = vec4(col * alpha * 1.65, alpha);
          }
        `
      });
      machPlumeGroup.add(new THREE.Mesh(flameGeo, flameMat));
      machPlumeGroup.position.set(-1.02, 0.0, 0);
      actorRoot.add(machPlumeGroup);
      actorRoot.add(sonicBoomConeMesh);
    }

    // =========================================================================
    // ZERO-GC POOLED PARTICLE RING BUFFER
    // =========================================================================
    const pPositions = new Float32Array(PARTICLE_POOL_SIZE * 3);
    const pColors = new Float32Array(PARTICLE_POOL_SIZE * 3);
    const pVel = new Float32Array(PARTICLE_POOL_SIZE * 3);
    const pLife = new Float32Array(PARTICLE_POOL_SIZE);
    let pCursor = 0;
    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      pPositions[i * 3 + 1] = -999;
    }

    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
    particleGeo.setAttribute('color', new THREE.BufferAttribute(pColors, 3));
    const particleMesh = new THREE.Points(
      particleGeo,
      new THREE.PointsMaterial({
        map: softParticleTex,
        size: actorSpec.domain === 'sea' ? 0.24 : actorSpec.domain === 'air' ? 0.42 : 0.32,
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        alphaTest: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    particleMesh.frustumCulled = false;
    scene.add(particleMesh);

    const spawnParticle = (
      x: number,
      y: number,
      z: number,
      vx: number,
      vy: number,
      vz: number,
      r: number,
      g: number,
      b: number,
      life: number
    ) => {
      const idx = pCursor % PARTICLE_POOL_SIZE;
      pCursor++;
      pPositions[idx * 3] = x;
      pPositions[idx * 3 + 1] = y;
      pPositions[idx * 3 + 2] = z;
      pVel[idx * 3] = vx;
      pVel[idx * 3 + 1] = vy;
      pVel[idx * 3 + 2] = vz;
      pColors[idx * 3] = r;
      pColors[idx * 3 + 1] = g;
      pColors[idx * 3 + 2] = b;
      pLife[idx] = life;
    };

    // Tactical Laser, Projectile & Expanding Scan/Shock Rings
    const laserPosArr = new Float32Array(6);
    const laserGeo = new THREE.BufferGeometry();
    laserGeo.setAttribute('position', new THREE.BufferAttribute(laserPosArr, 3));
    const laserMat = new THREE.LineBasicMaterial({
      color: 0xf97316,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending
    });
    const laserBeamLine = new THREE.LineSegments(laserGeo, laserMat);
    laserBeamLine.frustumCulled = false;
    scene.add(laserBeamLine);

    const projProfile = [
      new THREE.Vector2(0.01, 0.42),
      new THREE.Vector2(0.14, 0.25),
      new THREE.Vector2(0.14, -0.22),
      new THREE.Vector2(0.04, -0.35)
    ];
    const projGeo = new THREE.LatheGeometry(projProfile, 12);
    projGeo.rotateZ(-Math.PI / 2);
    const projectileMesh = new THREE.Mesh(
      projGeo,
      new THREE.MeshStandardMaterial({
        color: actorSpec.domain === 'sea' ? 0x38bdf8 : 0xfbbf24,
        emissive: new THREE.Color(actorSpec.domain === 'sea' ? 0x0284c7 : 0xd97706),
        emissiveIntensity: 0.85,
        roughness: 0.25,
        metalness: 0.65
      })
    );
    projectileMesh.visible = false;
    scene.add(projectileMesh);

    const buildDynamicWaveRing = (colorHex: number) => {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < 80; i++) {
        const a = (i / 80) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
      }
      const mat = new THREE.LineBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const loop = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), mat);
      loop.visible = false;
      scene.add(loop);
      return { loop, mat };
    };

    const pulseScanWave = buildDynamicWaveRing(0x38bdf8);
    const impactShockRing = buildDynamicWaveRing(actorSpec.domain === 'sea' ? 0x22d3ee : 0xf59e0b);

    // =========================================================================
    // LOAD 100% REAL GLB MESHES + REAL URDF JOINTS + STATIC BVH + CAD EXPLOSION PLANS
    // =========================================================================
    setIsLoadingModel(true);
    setGlbLoadError(null);
    const boundJoints: BoundSandboxJoint[] = [];
    const cadParts: SandboxCadPart[] = [];
    const realMeshesForStrobe: THREE.Mesh[] = [];
    let odradekSensorJointIdx = -1;
    let modelHeightSpan = 1.65;
    let fpvLocalWaypoints = buildMicroFpvCavityWaypoints(
      actorSpec.id,
      [-1.1, 0.0, -0.9],
      [1.1, 1.65, 0.9]
    );
    let ikChainIndices: number[] = [];
    let ikChainSpecs: IkJointLinkSpec[] = [];
    let ikAngles: number[] = [];
    const ikChainRootInv = new THREE.Matrix4();
    const ikTargetLocalOffset = new THREE.Vector3(1.15, 0.75, 0.35);
    const ikTargetWorld = new THREE.Vector3();
    let kerfNodes: MoltenKerfNode[] = [];

    const loadGlbPromise = (url: string) => loadGlbSceneResilient(url);

    const urdfPromise = actorSpec.urdfUrl
      ? fetchTextAssetResilient(actorSpec.urdfUrl)
          .then((xml) => parseUrdfJoints(xml))
          .catch(() => [] as UrdfJointDef[])
      : Promise.resolve([] as UrdfJointDef[]);

    Promise.all([Promise.all(actorSpec.glbUrls.map(loadGlbPromise)), urdfPromise])
      .then(([scenes, parsedJoints]) => {
        if (disposed) return;
        const combined = new THREE.Group();
        scenes.forEach((sc, idx) => {
          sc.name = `glb_layer_${idx}`;
          combined.add(sc);
        });

        combined.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(combined);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z, 0.001);
        const targetSpan = actorSpec.domain === 'air' ? 2.55 : 2.15;
        const scale = targetSpan / maxDim;

        combined.scale.setScalar(scale);
        combined.position.sub(center.multiplyScalar(scale));
        combined.rotation.y = actorSpec.modelYawOffset;
        combined.updateMatrixWorld(true);

        const normBox = new THREE.Box3().setFromObject(combined);
        const modelFootOffset = -normBox.min.y;
        combined.position.y += modelFootOffset;
        combined.updateMatrixWorld(true);

        const groundedBox = new THREE.Box3().setFromObject(combined);
        modelHeightSpan = Math.max(0.55, groundedBox.max.y - groundedBox.min.y);
        fpvLocalWaypoints = buildMicroFpvCavityWaypoints(
          actorSpec.id,
          [groundedBox.min.x, groundedBox.min.y, groundedBox.min.z],
          [groundedBox.max.x, groundedBox.max.y, groundedBox.max.z]
        );

        // Collect all real GLB sub-meshes & build 4-Stage Orthogonal CAD Explosion Plans for Bullet-Time!
        const rawMeshMeta: {
          mesh: THREE.Mesh;
          name: string;
          tris: number;
          layer: 'L1' | 'L2' | 'L3';
          worldCenter: THREE.Vector3;
          geomLocalCenter: THREE.Vector3;
          socketInParentLocal: THREE.Vector3;
          stdMat: THREE.MeshStandardMaterial;
          twinUniforms: TwinMaterialUniforms;
        }[] = [];

        const objectByName = new Map<string, THREE.Object3D>();
        const usedNames = new Set<string>();

        combined.traverse((obj) => {
          if (obj.name) {
            objectByName.set(obj.name, obj);
            objectByName.set(obj.name.toLowerCase(), obj);
          }
          if ((obj as THREE.Mesh).isMesh) {
            const m = obj as THREE.Mesh;
            const geom = m.geometry;
            const verts = geom.attributes.position?.count || 0;
            const tris = geom.index ? Math.round(geom.index.count / 3) : Math.round(verts / 3);
            if (tris < 8) return;

            if (!geom.boundingBox) geom.computeBoundingBox();
            const geomLocalCenter = geom.boundingBox
              ? geom.boundingBox.getCenter(new THREE.Vector3())
              : new THREE.Vector3();

            const pBox = new THREE.Box3().setFromObject(m);
            const worldCenter = pBox.isEmpty()
              ? m.getWorldPosition(new THREE.Vector3())
              : pBox.getCenter(new THREE.Vector3());
            const socketInParentLocal = m.parent
              ? m.parent.worldToLocal(worldCenter.clone())
              : worldCenter.clone();

            let partName = m.name || `part_${rawMeshMeta.length}`;
            if (usedNames.has(partName)) partName = `${partName}_${rawMeshMeta.length}`;
            usedNames.add(partName);
            m.name = partName;

            const layer = classifyMeshLayer(partName);
            const baseMat = Array.isArray(m.material) ? m.material[0] : m.material;
            const stdMat = (
              baseMat ? baseMat.clone() : new THREE.MeshStandardMaterial({ color: 0x94a3b8 })
            ) as THREE.MeshStandardMaterial;
            const twinUniforms = attachTwinShaderEffects(stdMat, layer === 'L1');
            m.material = stdMat;

            rawMeshMeta.push({
              mesh: m,
              name: partName,
              tris,
              layer,
              worldCenter,
              geomLocalCenter,
              socketInParentLocal,
              stdMat,
              twinUniforms
            });
            realMeshesForStrobe.push(m);
          }
        });

        const subMatrix = buildSubAssemblyMatrix(
          actorSpec.id,
          rawMeshMeta.map((rm) => ({
            name: rm.name,
            tris: rm.tris,
            layer: rm.layer,
            center: [rm.worldCenter.x, rm.worldCenter.y - 1.0, rm.worldCenter.z]
          }))
        );

        const boundJointNodes = new Set<THREE.Object3D>();
        for (const rm of rawMeshMeta) {
          const m = rm.mesh;
          const bb = m.geometry.boundingBox;
          const localFootCorners: THREE.Vector3[] = [];
          if (bb) {
            localFootCorners.push(
              new THREE.Vector3(bb.min.x, bb.min.y, bb.min.z),
              new THREE.Vector3(bb.max.x, bb.min.y, bb.min.z),
              new THREE.Vector3(bb.min.x, bb.min.y, bb.max.z),
              new THREE.Vector3(bb.max.x, bb.min.y, bb.max.z),
              new THREE.Vector3(bb.min.x, bb.max.y, bb.min.z),
              new THREE.Vector3(bb.max.x, bb.max.y, bb.min.z),
              new THREE.Vector3(bb.min.x, bb.max.y, bb.max.z),
              new THREE.Vector3(bb.max.x, bb.max.y, bb.max.z)
            );
          }

          const orthoPlan = computePartOrthogonalExplosionPlan(
            actorSpec.id,
            rm.name,
            rm.layer,
            [rm.worldCenter.x, rm.worldCenter.y - 1.0, rm.worldCenter.z],
            subMatrix
          );
          const parentNode = m.parent;
          const originParentLocal = parentNode
            ? parentNode.worldToLocal(rm.worldCenter.clone())
            : rm.worldCenter.clone();
          const orthoTargetWorld = rm.worldCenter
            .clone()
            .add(new THREE.Vector3(...orthoPlan.orthoVector));
          const localOrthoVec = parentNode
            ? parentNode.worldToLocal(orthoTargetWorld).sub(originParentLocal)
            : new THREE.Vector3(...orthoPlan.orthoVector);

          const n = rm.name.toLowerCase();
          let role: SandboxCadPart['role'] = 'other';
          if (n.includes('wheel')) role = 'wheel';
          else if (n.includes('suspension')) role = 'suspension';
          else if (n.includes('thrust_reverser') && (n.includes('port') || m.position.z >= 0))
            role = 'reverser_port';
          else if (n.includes('thrust_reverser')) role = 'reverser_stbd';
          else if (n.includes('n1_wide_chord') || n.includes('lpc')) role = 'n1_rotor';
          else if (
            n.includes('hpc') ||
            n.includes('hpt') ||
            n.includes('lpt') ||
            n.includes('shaft')
          )
            role = 'n2_rotor';
          else if (n.includes('mast') || n.includes('head') || n.includes('cylinder015'))
            role = 'mast';
          else if (n.includes('turret') || n.includes('arm')) role = 'arm';

          cadParts.push({
            mesh: m,
            partName: rm.name,
            layer: rm.layer,
            basePos: m.position.clone(),
            baseQuat: m.quaternion.clone(),
            geomLocalCenter: rm.geomLocalCenter,
            socketInParentLocal: rm.socketInParentLocal,
            localOrthoVec,
            orthoPlan,
            mountOriginWorld: rm.worldCenter.clone(),
            currentCenterWorld: rm.worldCenter.clone(),
            origMat: rm.stdMat,
            origColor: rm.stdMat.color ? rm.stdMat.color.clone() : new THREE.Color(0x94a3b8),
            origEmissive: rm.stdMat.emissive
              ? rm.stdMat.emissive.clone()
              : new THREE.Color(0x000000),
            origWireframe: Boolean(rm.stdMat.wireframe),
            twinUniforms: rm.twinUniforms,
            localFootCorners,
            role
          });
        }

        // Bind URDF Joints
        for (const j of parsedJoints) {
          if (j.type === 'fixed') continue;
          const cleanChild = j.child.replace(/^\//, '');
          const target =
            objectByName.get(cleanChild) ||
            objectByName.get(cleanChild.toLowerCase()) ||
            Array.from(objectByName.entries()).find(([k]) =>
              k.toLowerCase().includes(cleanChild.toLowerCase())
            )?.[1];
          if (target) {
            const ax = new THREE.Vector3(j.axis[0], j.axis[1], j.axis[2]);
            if (ax.lengthSq() < 1e-5) ax.set(1, 0, 0);
            else ax.normalize();
            boundJoints.push({
              def: j,
              node: target,
              basePos: target.position.clone(),
              baseQuat: target.quaternion.clone(),
              axisVec: ax,
              prevAngle: 0,
              omegaRadS: 0
            });
            boundJointNodes.add(target);
          }
        }
        (modelHolder.userData as { boundJointNodes?: Set<THREE.Object3D> }).boundJointNodes =
          boundJointNodes;

        modelHolder.add(combined);

        // Locate primary real .glb sensor joint for Death Stranding Odradek 0.15s snap & flare!
        odradekSensorJointIdx = findOdradekSensorJointIndex(boundJoints.map((b) => b.def));

        // Bind Sandevistan 4D Strobe, MPC Future Wireframe Ghosts & Faraday Surface Skin Sampler!
        strobeController.bindRealMeshes(realMeshesForStrobe);
        mpcPowerCtrl.bindFutureGhostModel(combined);
        disasterFx.bindRealGlbSurfaceVertices(combined);
        if (runtimeRef.current.autoOrbitalDropOnSwitch) {
          runtimeRef.current.triggerOrbitalDropRequested = true;
          runtimeRef.current.slsRelState.active = false;
          setSlsActive(false);
          setOrbitalDropActive(true);
          proceduralAudioSynth.playOrbitalDropfallAudio('launch_fall', !runtimeRef.current.muted);
        } else if (!runtimeRef.current.triggerOrbitalDropRequested) {
          // Spawn immediately solid & grounded in combat/exploration sandbox (SLS print remains available on demand in Auxiliary FX drawer)
          runtimeRef.current.slsRelState.active = false;
          setSlsActive(false);
        }

        // Build Static per-mesh BLAS (MeshBVH) once & upgrade PBR microfacet / Emissive Area Light tags!
        const bvhInfo = upgradeGlbPbrAndBuildStaticBvh(combined, actorSpec.id, classifyMeshLayer);
        emissiveSources = bvhInfo.emissiveSources;
        setBvhStats({ meshes: bvhInfo.bvhMeshCount, emissives: bvhInfo.emissiveSources.length });
        rayTracer.resetAccumulation();

        // Extract 6-DOF / 7-DOF Serial Manipulator Chain for Real-Time CCD IK!
        ikChainIndices = extractManipulatorJointIndices(
          actorSpec.id,
          boundJoints.map((b) => b.def)
        );
        ikChainSpecs = [];
        ikAngles = new Array(ikChainIndices.length).fill(0);
        if (ikChainIndices.length > 0) {
          const firstB = boundJoints[ikChainIndices[0]];
          const chainParent = firstB.node.parent || combined;
          chainParent.updateMatrixWorld(true);
          let prevWorldPos = chainParent.getWorldPosition(new THREE.Vector3());
          let prevWorldQuat = chainParent.getWorldQuaternion(new THREE.Quaternion());
          for (let k = 0; k < ikChainIndices.length; k++) {
            const b = boundJoints[ikChainIndices[k]];
            const wPos = b.node.getWorldPosition(new THREE.Vector3());
            const wQuat = b.node.getWorldQuaternion(new THREE.Quaternion());
            const invPrevQ = prevWorldQuat.clone().invert();
            const locOff = wPos.clone().sub(prevWorldPos).applyQuaternion(invPrevQ);
            const origQ = invPrevQ.multiply(wQuat);
            ikChainSpecs.push({
              name: b.def.name,
              axis: [b.axisVec.x, b.axisVec.y, b.axisVec.z],
              localOffset: [locOff.x, locOff.y, locOff.z],
              originQuat: [origQ.x, origQ.y, origQ.z, origQ.w],
              lower: b.def.lower,
              upper: b.def.upper
            });
            prevWorldPos = wPos;
            prevWorldQuat = wQuat;
          }
        }

        setGlbLoadError(null);
        setIsLoadingModel(false);
      })
      .catch((err) => {
        if (disposed) return;
        console.warn('[Sandbox] 真机 GLB 资产网络重试已耗尽:', err);
        setGlbLoadError(err instanceof Error ? err.message : '网络传输中断');
        setIsLoadingModel(false);
      });

    // =========================================================================
    // ON-DEMAND REAL GLB + URDF SWARM WINGMAN LOADER (Land Go2+SAR+G1 / Sea RexROV2+BlueROV2)
    // =========================================================================
    const loadedWingmen = new Map<string, LoadedWingmanInstance>();
    const loadingWingmen = new Set<string>();

    const ensureWingmanLoaded = (wingActorId: string) => {
      if (loadedWingmen.has(wingActorId) || loadingWingmen.has(wingActorId)) return;
      loadingWingmen.add(wingActorId);
      const wSpec = getSandboxActorSpec(wingActorId);
      const wUrdfP = wSpec.urdfUrl
        ? fetchTextAssetResilient(wSpec.urdfUrl)
            .then((xml) => parseUrdfJoints(xml))
            .catch(() => [] as UrdfJointDef[])
        : Promise.resolve([] as UrdfJointDef[]);

      Promise.all([Promise.all(wSpec.glbUrls.map(loadGlbPromise)), wUrdfP])
        .then(([wScenes, wJoints]) => {
          if (disposed) return;
          const wRoot = new THREE.Group();
          const wInner = new THREE.Group();
          wScenes.forEach((s) => wInner.add(s));
          wInner.updateMatrixWorld(true);
          const wBox = new THREE.Box3().setFromObject(wInner);
          const wSize = wBox.getSize(new THREE.Vector3());
          const wCenter = wBox.getCenter(new THREE.Vector3());
          const wScale = (wSpec.domain === 'air' ? 2.35 : 2.0) / Math.max(wSize.x, wSize.y, wSize.z, 0.001);
          wInner.scale.setScalar(wScale);
          wInner.position.sub(wCenter.multiplyScalar(wScale));
          wInner.rotation.y = wSpec.modelYawOffset;
          wInner.updateMatrixWorld(true);
          const wNormBox = new THREE.Box3().setFromObject(wInner);
          wInner.position.y += -wNormBox.min.y;
          wInner.updateMatrixWorld(true);

          const wObjByName = new Map<string, THREE.Object3D>();
          const wMeshes: LoadedWingmanInstance['meshes'] = [];
          wInner.traverse((o) => {
            if (o.name) {
              wObjByName.set(o.name, o);
              wObjByName.set(o.name.toLowerCase(), o);
            }
            if ((o as THREE.Mesh).isMesh) {
              const m = o as THREE.Mesh;
              const bm = Array.isArray(m.material) ? m.material[0] : m.material;
              const sm = (
                bm ? bm.clone() : new THREE.MeshStandardMaterial({ color: 0x94a3b8 })
              ) as THREE.MeshStandardMaterial;
              m.material = sm;
              wMeshes.push({
                mesh: m,
                origMat: sm,
                origColor: sm.color ? sm.color.clone() : new THREE.Color(0x94a3b8)
              });
            }
          });

          const wBound: BoundSandboxJoint[] = [];
          for (const j of wJoints) {
            if (j.type === 'fixed') continue;
            const cName = j.child.replace(/^\//, '');
            const tNode =
              wObjByName.get(cName) ||
              wObjByName.get(cName.toLowerCase()) ||
              Array.from(wObjByName.entries()).find(([k]) =>
                k.toLowerCase().includes(cName.toLowerCase())
              )?.[1];
            if (tNode) {
              const ax = new THREE.Vector3(j.axis[0], j.axis[1], j.axis[2]);
              if (ax.lengthSq() < 1e-5) ax.set(1, 0, 0);
              else ax.normalize();
              wBound.push({
                def: j,
                node: tNode,
                basePos: tNode.position.clone(),
                baseQuat: tNode.quaternion.clone(),
                axisVec: ax,
                prevAngle: 0,
                omegaRadS: 0
              });
            }
          }

          upgradeGlbPbrAndBuildStaticBvh(wInner, wingActorId, classifyMeshLayer);
          wRoot.add(wInner);
          swarmUnitsGroup.add(wRoot);
          loadedWingmen.set(wingActorId, {
            actorId: wingActorId,
            root: wRoot,
            joints: wBound,
            meshes: wMeshes
          });
        })
        .catch(() => {
          loadingWingmen.delete(wingActorId);
        });
    };

    // =========================================================================
    // POINTER RAYCASTING FOR 3D FAULT INJECTION & 6-DOF IK TARGET DRAGGING
    // =========================================================================
    let pointerDownPos: [number, number] | null = null;
    let draggingIk = false;
    const ikDragPlane = new THREE.Plane();
    const ikDragHit = new THREE.Vector3();

    const injectFaultAtPart = (partName: string, simClock: number) => {
      const info = classifyFaultSubsystem(actorSpec.id, partName, actorSpec.domain);
      const rec: ActiveFaultRecord = {
        partName,
        kind: info.kind,
        injectedAtSimTime: simClock,
        alertTitle: info.alertTitle,
        compensationLaw: info.compensationLaw
      };
      setActiveFaults((prev) => [...prev.filter((f) => f.partName !== partName), rec]);
      setActiveActionToast(`${info.alertTitle} · ${info.compensationLaw}`);
    };

    const onPointerDown = (ev: PointerEvent) => {
      if (ev.button !== 0) return;
      pointerDownPos = [ev.clientX, ev.clientY];
      if (runtimeRef.current.ikEnabled) {
        const rect = renderer.domElement.getBoundingClientRect();
        if (rect.width > 10 && rect.height > 10) {
          _pointerNdc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
          _pointerNdc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
          _raycaster.setFromCamera(_pointerNdc, camera);
          if (_raycaster.intersectObject(ikPlasmaController.hitProxyMesh, false).length > 0) {
            draggingIk = true;
            const camDir = new THREE.Vector3();
            camera.getWorldDirection(camDir);
            ikDragPlane.setFromNormalAndCoplanarPoint(camDir.negate(), ikTargetWorld);
          }
        }
      }
    };

    const onPointerMove = (ev: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) return;
      _pointerNdc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      _pointerNdc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;

      if (draggingIk) {
        _raycaster.setFromCamera(_pointerNdc, camera);
        if (_raycaster.ray.intersectPlane(ikDragPlane, ikDragHit)) {
          // Store offset relative to actorRoot so target travels naturally with vehicle!
          const invActor = actorRoot.matrixWorld.clone().invert();
          const loc = ikDragHit.clone().applyMatrix4(invActor);
          loc.clampLength(0.45, 2.35);
          ikTargetLocalOffset.copy(loc);
        }
        return;
      }

      if (runtimeRef.current.magLensEnabled) {
        _raycaster.setFromCamera(_pointerNdc, camera);
        const hits = _raycaster.intersectObjects(
          cadParts.map((c) => c.mesh),
          false
        );
        if (hits.length > 0) {
          runtimeRef.current.magLensCenter.copy(hits[0].point);
          runtimeRef.current.magLensHoverValid = true;
        } else {
          runtimeRef.current.magLensHoverValid = false;
        }
      } else {
        runtimeRef.current.magLensHoverValid = false;
      }
    };

    const onPointerLeave = () => {
      runtimeRef.current.magLensHoverValid = false;
    };

    const onWheel = (ev: WheelEvent) => {
      if (!runtimeRef.current.magLensEnabled) return;
      ev.preventDefault();
      ev.stopPropagation();
      const nextR = clampMagLensRadius(runtimeRef.current.magLensRadius, ev.deltaY);
      runtimeRef.current.magLensRadius = nextR;
      setMagLensRadius(nextR);
    };

    const onPointerUp = (ev: PointerEvent) => {
      if (draggingIk) {
        draggingIk = false;
        pointerDownPos = null;
        return;
      }
      if (!pointerDownPos || ev.button !== 0) return;
      const dist = Math.hypot(ev.clientX - pointerDownPos[0], ev.clientY - pointerDownPos[1]);
      pointerDownPos = null;
      if (dist >= 6) return;

      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) return;
      _pointerNdc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      _pointerNdc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      _raycaster.setFromCamera(_pointerNdc, camera);

      if (runtimeRef.current.faultInjectMode || runtimeRef.current.ikEnabled) {
        const hits = _raycaster.intersectObjects(
          cadParts.map((c) => c.mesh),
          false
        );
        if (hits.length > 0) {
          const hitMesh = hits[0].object as THREE.Mesh;
          const found = cadParts.find((c) => c.mesh === hitMesh);
          if (found) {
            if (runtimeRef.current.faultInjectMode) {
              injectFaultAtPart(found.partName, simTime);
            } else if (runtimeRef.current.ikEnabled) {
              const invActor = actorRoot.matrixWorld.clone().invert();
              ikTargetLocalOffset.copy(hits[0].point).applyMatrix4(invActor);
            }
          }
          return;
        }
      }

      // 1. Interactive 3D Tactical Field Target Click-to-Lock & Precision Strike!
      const tgtHits = _raycaster.intersectObjects(signatureSandboxFx.targetHitProxies, false);
      if (tgtHits.length > 0) {
        const hitTargetId = tgtHits[0].object.userData.interactiveTargetId as string | undefined;
        const matchedTarget = hitTargetId
          ? interactiveTargets.find((t) => t.id === hitTargetId && t.alive)
          : undefined;
        if (matchedTarget) {
          tacticalScore = { ...tacticalScore, lockedTargetId: matchedTarget.id };
          runtimeRef.current.triggerFireRequested = true;
          audioRef.current.playFire(actorSpec.domain);
          setActiveActionToast(`已锁定并齐射标靶：${matchedTarget.codeName}`);
          return;
        }
      }

      // 2. Click-to-Command 3D Tactical Ground Rally Beacon!
      if (clickableGroundMesh && actorSpec.domain !== 'air') {
        const gHits = _raycaster.intersectObject(clickableGroundMesh, false);
        if (gHits.length > 0) {
          const pt = gHits[0].point;
          rallyPoint = {
            active: true,
            x: Math.max(-58, Math.min(58, pt.x)),
            y: pt.y,
            z: Math.max(-58, Math.min(58, pt.z))
          };
          runtimeRef.current.autoPatrol = false;
          setAutoPatrol(false);
          proceduralAudioSynth.playMechanicalLatchClick(740, !runtimeRef.current.muted);
          setActiveActionToast(
            `战术集结信标已部署 (${pt.x.toFixed(0)}, ${pt.z.toFixed(0)}) · 真机自主导航前往`
          );
        }
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerleave', onPointerLeave);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

    // =========================================================================
    // KEYBOARD INPUT HUB (WASD / 1-4 / Alt / Q / K / Tab / R / T / B / X / I / F / E / P / V / G)
    // =========================================================================
    const keysDown = new Set<string>();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const code = e.code;
      if (code === 'Tab') {
        e.preventDefault();
        if (!e.repeat) {
          setBulletTimeActive((prev) => {
            const next = !prev;
            audioRef.current.playBulletTimeSnap(next);
            setActiveActionToast(
              next
                ? '子弹时间悬停爆甲 [0.01x] 已开启 · 4工序装甲正交剥离悬停检视中'
                : '装甲咔嚓咬合收拢 · 1.0x 全速恢复实景机动！'
            );
            return next;
          });
        }
        return;
      }

      if (code === 'AltLeft' || code === 'AltRight') {
        e.preventDefault();
        if (!e.repeat) {
          runtimeRef.current.triggerDashRequested = true;
          runtimeRef.current.dashStrafeSign =
            keysDown.has('KeyA') || keysDown.has('ArrowLeft')
              ? -1
              : keysDown.has('KeyD') || keysDown.has('ArrowRight')
                ? 1
                : 0;
        }
        return;
      }

      if (!keysDown.has(code)) {
        keysDown.add(code);
        if (code === 'Space' && actorSpec.domain === 'land') {
          runtimeRef.current.triggerJumpRequested = true;
        } else if (code === 'Digit1' || code === 'Digit2' || code === 'Digit3' || code === 'Digit4') {
          const modeMap: Record<string, LocomotionModeId> = {
            Digit1: 'standard',
            Digit2: 'assault',
            Digit3: 'agile',
            Digit4: 'acrobatic'
          };
          const nextM = modeMap[code];
          runtimeRef.current.locomotionMode = nextM;
          setLocomotionMode(nextM);
          const spec = getLocomotionModeSpec(actorSpec.id, actorSpec.domain, nextM);
          proceduralAudioSynth.playMechanicalLatchClick(760, !runtimeRef.current.muted);
          setActiveActionToast(spec.fullTitle);
        } else if (code === 'KeyQ') {
          setPathTracingEnabled(false);
          runtimeRef.current.pathTracingEnabled = false;
          runtimeRef.current.triggerUltimateRequested = true;
          audioRef.current.playFire(actorSpec.domain);
          const meta = getRobotUltimateMeta(actorSpec.id);
          setActiveActionToast(`终极绝技激发：${meta.skillName}`);
        } else if (code === 'KeyK') {
          setDirectorCamMode((prev) => {
            const next = cycleDirectorCameraMode(prev);
            runtimeRef.current.directorCamMode = next;
            proceduralAudioSynth.playMechanicalLatchClick(820, !runtimeRef.current.muted);
            setActiveActionToast(`导演运镜切换：${getDirectorModeLabel(next)}`);
            return next;
          });
        } else if (code === 'Escape' && runtimeRef.current.diegeticHudActive) {
          runtimeRef.current.diegeticHudActive = false;
          setDiegeticHudActive(false);
          setActiveActionToast('已退出实机背脊 UI 沉浸模式 · 2D 战术面板恢复显示');
        } else if (code === 'KeyU') {
          const next = !runtimeRef.current.diegeticHudActive;
          runtimeRef.current.diegeticHudActive = next;
          setDiegeticHudActive(next);
          proceduralAudioSynth.playMechanicalLatchClick(next ? 860 : 620, !runtimeRef.current.muted);
          if (!next) {
            setActiveActionToast('已退出实机背脊 UI 沉浸模式 · 2D 战术面板恢复显示');
          }
        } else if (code === 'KeyF') {
          runtimeRef.current.triggerFireRequested = true;
          audioRef.current.playFire(actorSpec.domain);
        } else if (code === 'KeyE') {
          runtimeRef.current.triggerScanRequested = true;
          proceduralAudioSynth.playOdradekScanSignature(!runtimeRef.current.muted);
          setActiveActionToast(
            actorSpec.domain === 'air'
              ? '高空三维球面空域雷达波已激发 · 空域无障碍净空锁定'
              : '奥德拉克地形可通行性矩阵已锁定 (平坦 · △陡坡 · ✕禁区)'
          );
        } else if (code === 'KeyP') {
          setAutoPatrol((p) => !p);
        } else if (code === 'KeyV') {
          if (runtimeRef.current.visionMode === 'normal' && runtimeRef.current.camMode === 'chase') {
            setCamMode('fpv');
          } else if (runtimeRef.current.visionMode === 'normal' && runtimeRef.current.camMode === 'fpv') {
            setCamMode('chase');
            setVisionMode('slam');
          } else if (runtimeRef.current.visionMode === 'slam') {
            setVisionMode('flir');
          } else if (runtimeRef.current.visionMode === 'flir') {
            setVisionMode('acoustic');
          } else {
            setVisionMode('normal');
            setCamMode('chase');
          }
        } else if (code === 'KeyT') {
          runtimeRef.current.triggerOrbitalDropRequested = true;
          setOrbitalDropActive(true);
          proceduralAudioSynth.playOrbitalDropfallAudio('launch_fall', !runtimeRef.current.muted);
          setActiveActionToast('泰坦级轨道超音速空投部署启动 (Y=+160m 激波俯冲 → 12m 反推 → 液压起身)');
        } else if (code === 'KeyZ') {
          setStrobeEnabled((s) => !s);
        } else if (code === 'KeyB') {
          setSwarmOpsEnabled((s) => !s);
        } else if (code === 'KeyX') {
          runtimeRef.current.triggerOverheatVentRequested = true;
          setActiveActionToast('核心过热强制开甲排温：外层护甲弹开 12% · 高压冷却白雾喷射');
        } else if (code === 'KeyJ') {
          runtimeRef.current.quickFaultRequested = true;
          setFaultInjectMode(true);
        } else if (code === 'KeyI') {
          setIkEnabled((v) => !v);
        } else if (code === 'KeyY') {
          setIkEnabled(true);
          setPlasmaCutting((v) => !v);
        } else if (code === 'KeyC') {
          handleToggleMicroFpv();
        } else if (code === 'KeyR') {
          setPathTracingEnabled((v) => !v);
        } else if (code === 'KeyM') {
          setMuted((m) => !m);
        } else if (code === 'KeyG') {
          onExitSandboxRef.current(actorSpec.id);
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysDown.delete(e.code);
    };

    const clearHeldInputs = () => {
      keysDown.clear();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearHeldInputs);

    // =========================================================================
    // SIMULATION, BULLET-TIME, STROBE, SWARM, ODRADEK, TARGETS & ULTIMATE STATE
    // =========================================================================
    let kin: SandboxKinematicState = createInitialKinematicState(actorSpec);
    camera.position.set(kin.x - 5.2, kin.y + 2.6, kin.z);
    camera.lookAt(kin.x + 2.0, kin.y + 0.9, kin.z);

    let bulletState: BulletTimeState = createInitialBulletTimeState();
    let strobeState = createChronoStrobeScheduler(3);

    const sampleArenaGroundY =
      actorSpec.domain === 'land'
        ? sampleLandTerrainHeight
        : actorSpec.domain === 'sea'
           ? sampleSeabedHeight
           : () => 12.0;
    let interactiveTargets: InteractiveFieldTarget[] = createArenaInteractiveTargets(
      actorSpec.domain,
      sampleArenaGroundY
    );
    let tacticalScore: TacticalScoreState = createInitialTacticalScoreState();
    let ultimateSkill: UltimateSkillState = createInitialUltimateSkillState();
    let dashState: VectorDashState = createInitialVectorDashState();
    let rallyPoint: { active: boolean; x: number; y: number; z: number } | null = null;
    let activeProjectileTargetId: string | null = null;

    // Death Stranding Odradek + AAA Systems Runtime State
    let odradekElapsed = 0; // 0 = inactive; >0 = active [0 .. ODRADEK_TOTAL_DURATION]
    const odradekOrigin = new THREE.Vector3();
    const odradekSensorWorld = new THREE.Vector3();
    let activeOdradekBeacons: OdradekBeaconTarget[] = [];
    let dropState: OrbitalDropState = createInitialOrbitalDropState();
    let overheatState: OverheatAndRcsState = createInitialOverheatState();
    let weatheringState: SurfaceWeatheringState = createInitialWeatheringState();
    let prevSpeedForRcs = kin.speed;
    let prevYawRateForRcs = 0;

    let fireAnimTimer = 0;
    let leapBoostTimer = 0;
    let scanWaveTimer = 0;
    const scanOrigin = new THREE.Vector3();
    let projActive = false;
    let projTime = 0;
    const projStart = new THREE.Vector3();
    const projEnd = new THREE.Vector3();
    let shockTimer = 0;
    const shockCenter = new THREE.Vector3();

    let frameId = 0;
    let lastTime = performance.now() / 1000;
    let simTime = 0;
    let realElapsed = 0;
    let lastHudBadgeSync = 0;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (gl && typeof gl.fenceSync === 'function') {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (disposed) return;
          const status = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (status === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(cb, 65);
          }
        };
        frameId = window.setTimeout(poll, 5);
      } else {
        frameId = window.setTimeout(cb, 65);
      }
    }

    function findNearestTargetWorldPos(
      fromX: number,
      fromY: number,
      fromZ: number,
      yaw: number
    ): THREE.Vector3 {
      const bestInteractive = findBestInteractiveTarget(
        interactiveTargets,
        fromX,
        fromY,
        fromZ,
        yaw,
        tacticalScore.lockedTargetId
      );
      if (bestInteractive) {
        return new THREE.Vector3(bestInteractive.x, bestInteractive.y + 1.35, bestInteractive.z);
      }
      let bestDist = Infinity;
      const best = new THREE.Vector3(
        fromX + Math.cos(yaw) * 11,
        fromY + 0.4,
        fromZ + Math.sin(yaw) * 11
      );
      for (const wp of waypoints) {
        const tx = wp.x + wp.targetRockOffset[0];
        const ty = wp.y + wp.targetRockOffset[1];
        const tz = wp.z + wp.targetRockOffset[2];
        const d = Math.hypot(tx - fromX, tz - fromZ);
        if (d < bestDist && d > 2.0) {
          bestDist = d;
          best.set(tx, ty, tz);
        }
      }
      return best;
    }

    function applyStrikeToTarget(targetId: string, damage: number) {
      const dmgRes = damageInteractiveTarget(interactiveTargets, tacticalScore, targetId, damage);
      interactiveTargets = dmgRes.targets;
      tacticalScore = dmgRes.score;
      if (dmgRes.hitOccurred) {
        const struck = interactiveTargets.find((t) => t.id === targetId);
        if (struck) {
          kin.trauma = Math.min(1.0, kin.trauma + (dmgRes.justDestroyed ? 0.68 : 0.35));
          const sparkCount = dmgRes.justDestroyed ? 24 : 12;
          for (let s = 0; s < sparkCount; s++) {
            const ang = (s / sparkCount) * Math.PI * 2;
            const spd = (dmgRes.justDestroyed ? 3.8 : 2.1) + (s % 4) * 0.85;
            spawnParticle(
              struck.x,
              struck.y + 1.4,
              struck.z,
              Math.cos(ang) * spd,
              1.6 + (s % 4) * 0.75,
              Math.sin(ang) * spd,
              dmgRes.justDestroyed ? 1.0 : 0.25,
              dmgRes.justDestroyed ? 0.68 : 0.92,
              dmgRes.justDestroyed ? 0.22 : 1.0,
              0.82
            );
          }
          if (dmgRes.justDestroyed) {
            proceduralAudioSynth.playSubBassImpact('laser');
            setActiveActionToast(
              `击破标靶 [${struck.codeName}] · 连击 x${tacticalScore.comboCount} (6s 后重组)`
            );
          }
        }
      }
    }

    function executeFireVfx() {
      fireAnimTimer = 1.0;
      kin.trauma = Math.min(1.0, kin.trauma + 0.52);

      const fx = Math.cos(kin.yaw);
      const fz = Math.sin(kin.yaw);
      const lockedCandidate = findBestInteractiveTarget(
        interactiveTargets,
        kin.x,
        kin.y,
        kin.z,
        kin.yaw,
        tacticalScore.lockedTargetId
      );
      if (lockedCandidate) {
        tacticalScore = { ...tacticalScore, lockedTargetId: lockedCandidate.id };
      }
      const targetPos = findNearestTargetWorldPos(kin.x, kin.y, kin.z, kin.yaw);

      if (actorSpec.id === 'unitree_go2') {
        kin.vy = 6.6;
        kin.isGrounded = false;
        leapBoostTimer = 0.65;
        shockTimer = 1.0;
        shockCenter.set(kin.x, kin.y + 0.1, kin.z);
        projActive = true;
        projTime = 0;
        projStart.set(kin.x + fx * 0.45, kin.y + 0.55, kin.z + fz * 0.45);
        projEnd.copy(targetPos);
        activeProjectileTargetId = null;
        if (lockedCandidate && Math.hypot(lockedCandidate.x - kin.x, lockedCandidate.z - kin.z) < 42) {
          applyStrikeToTarget(lockedCandidate.id, 62);
        }
      } else if (actorSpec.id === 'unitree_g1') {
        shockTimer = 1.0;
        shockCenter.set(kin.x, kin.y + 0.6, kin.z);
        projActive = true;
        projTime = 0;
        projStart.set(kin.x, kin.y + 1.4, kin.z);
        projEnd.copy(targetPos);
        activeProjectileTargetId = lockedCandidate ? lockedCandidate.id : null;
      } else if (actorSpec.domain === 'air') {
        const rx = -fz;
        const rz = fx;
        for (const side of [-1, 1]) {
          for (let k = 0; k < 12; k++) {
            const spread = 4.6 + k * 0.42;
            spawnParticle(
              kin.x - fx * (0.55 + k * 0.14) + rx * side * 0.35,
              kin.y - 0.15,
              kin.z - fz * (0.55 + k * 0.14) + rz * side * 0.35,
              rx * side * spread - fx * 3.4,
              1.6 - k * 0.28,
              rz * side * spread - fz * 3.4,
              1.0,
              0.88 - k * 0.025,
              0.42,
              1.1
            );
            if (k % 2 === 0) {
              spawnParticle(
                kin.x - fx * (0.75 + k * 0.16) + rx * side * 0.42,
                kin.y - 0.18,
                kin.z - fz * (0.75 + k * 0.16) + rz * side * 0.42,
                rx * side * (spread * 0.72) - fx * 4.2,
                1.1 - k * 0.22,
                rz * side * (spread * 0.72) - fz * 4.2,
                0.76,
                0.68,
                0.62,
                1.25
              );
            }
          }
        }
        if (lockedCandidate && Math.hypot(lockedCandidate.x - kin.x, lockedCandidate.z - kin.z) < 62) {
          applyStrikeToTarget(lockedCandidate.id, 66);
        }
      } else if (actorSpec.domain === 'sea') {
        projActive = true;
        projTime = 0;
        projStart.set(kin.x + fx * 0.9, kin.y - 0.25, kin.z + fz * 0.9);
        projEnd.copy(targetPos);
        activeProjectileTargetId = lockedCandidate ? lockedCandidate.id : null;
      } else {
        projActive = true;
        projTime = 0;
        projStart.set(kin.x, kin.y + 1.25, kin.z);
        projEnd.copy(targetPos);
        activeProjectileTargetId = null;

        if (lockedCandidate && Math.hypot(lockedCandidate.x - kin.x, lockedCandidate.z - kin.z) < 42) {
          applyStrikeToTarget(lockedCandidate.id, 64);
        } else {
          for (let s = 0; s < 22; s++) {
            const a = (s / 22) * Math.PI * 2;
            const spd = 1.8 + (s % 5) * 0.9;
            spawnParticle(
              targetPos.x,
              targetPos.y + 0.3,
              targetPos.z,
              Math.cos(a) * spd,
              2.2 + (s % 4) * 0.8,
              Math.sin(a) * spd,
              1.0,
              0.55 + (s % 3) * 0.15,
              0.12,
              0.85
            );
          }
        }
      }
    }

    function executeScanVfx() {
      scanWaveTimer = 0.01;
      scanOrigin.set(kin.x, kin.y + 0.15, kin.z);

      // Finish any initial SLS genesis sweep so solid metallic PBR chassis is 100% visible during scan!
      runtimeRef.current.slsRelState.active = false;

      // Sample 2,500-point (50x50, 0.85m world-integer snapped) 3-Tier Traversability Matrix!
      const sampledGrid = sampleOdradekTraversabilityGrid(
        kin.x,
        kin.y,
        kin.z,
        actorSpec.domain,
        arenaObstacles
      );
      odradekCtrl.uploadGridSnapshot(sampledGrid);
      odradekOrigin.set(sampledGrid.snappedOriginX, kin.y, sampledGrid.snappedOriginZ);
      odradekElapsed = 0.001;
      setOdradekTierSummary(sampledGrid.counts);
      setOdradekActive(true);
    }

    function tick() {
      if (disposed) return;
      const now = performance.now() / 1000;
      const rawDt = Math.max(0.001, now - lastTime);
      const realDt = Math.min(0.05, rawDt);
      const wallDt = Math.min(0.65, rawDt);
      lastTime = now;
      realElapsed += wallDt;

      const rt = runtimeRef.current;

      // Immediately finish initial SLS genesis powder sweep if user activates interactive AAA modes!
      if (
        rt.diegeticHudActive ||
        rt.focusWeakpointEnabled ||
        rt.triggerOrbitalDropRequested ||
        rt.triggerOverheatVentRequested
      ) {
        rt.slsRelState.active = false;
      }

      // Quick fault injection request from HUD button or KeyJ
      if (rt.quickFaultRequested && cadParts.length > 0) {
        rt.quickFaultRequested = false;
        const preferred =
          cadParts.find((c) => {
            const n = c.partName.toLowerCase();
            return (
              n.startsWith('fl_') ||
              n.includes('thruster') ||
              n.includes('hpc') ||
              n.includes('flipper') ||
              n.includes('wheel')
            );
          }) || cadParts[0];
        injectFaultAtPart(preferred.partName, simTime);
      }

      // =======================================================================
      // MODULE 1: BULLET-TIME (0.01x) + MID-AIR ORTHOGONAL EXPLOSION CONTROLLER
      // =======================================================================
      bulletState.active = rt.bulletTimeActive;
      bulletState.explosionTarget = rt.bulletExplosionTarget;
      // When Gear-2 Progressive Path Tracing [R] is enabled, freeze time completely (0.0x) so 256 SPP converges cleanly!
      if (rt.pathTracingEnabled) {
        bulletState = {
          ...bulletState,
          explosionProgress: bulletState.active
            ? bulletState.explosionProgress +
              (bulletState.explosionTarget - bulletState.explosionProgress) *
                (1 - Math.exp(-8 * realDt))
            : bulletState.explosionProgress
        };
      } else {
        bulletState = stepBulletTimeController(bulletState, realDt);
      }

      // Advance 1.8s Dual-Laser SLS Materialization Sweep (wall-clock paced)
      if (rt.slsRelState.active && !rt.pathTracingEnabled) {
        rt.slsRelState = stepSlsMaterializationState(rt.slsRelState, wallDt, 0, modelHeightSpan);
      }

      // =======================================================================
      // SIGNATURE ULTIMATE SKILL [KEY Q] + INTERACTIVE FIELD TARGETS & HITSTOP
      // =======================================================================
      if (rt.triggerUltimateRequested) {
        rt.triggerUltimateRequested = false;
        rt.slsRelState.active = false;
        ultimateSkill = triggerUltimateSkill();
        executeScanVfx();
      }
      ultimateSkill = stepUltimateSkill(
        ultimateSkill,
        rt.pathTracingEnabled ? 0 : wallDt,
        actorSpec.id
      );
      if (ultimateSkill.justTriggeredBurst) {
        kin.trauma = Math.min(1.0, kin.trauma + 0.75);
        shockTimer = 1.0;
        shockCenter.set(kin.x, kin.y + 0.3, kin.z);
        audioRef.current.playFire(actorSpec.domain);
        for (const tgt of interactiveTargets) {
          if (!tgt.alive) continue;
          const dist = Math.hypot(tgt.x - kin.x, tgt.z - kin.z);
          if (dist < 48) {
            applyStrikeToTarget(tgt.id, 95);
          }
        }
      }

      const steppedTgt = stepInteractiveTargets(
        interactiveTargets,
        tacticalScore,
        rt.pathTracingEnabled ? 0 : realDt,
        realElapsed
      );
      interactiveTargets = steppedTgt.targets;
      tacticalScore = steppedTgt.score;

      const hitstopScale = tacticalScore.hitstopTimer > 0 ? 0.0 : 1.0;
      const simDt = rt.pathTracingEnabled
        ? 0.0
        : realDt * bulletState.simTimeScale * ultimateSkill.timeDilation * hitstopScale;
      const vfxWallDt = rt.pathTracingEnabled ? 0.0 : wallDt * bulletState.simTimeScale;
      simTime += simDt;

      kin.autoPatrol = rt.autoPatrol;

      const manualMoveHeld =
        keysDown.has('KeyW') ||
        keysDown.has('ArrowUp') ||
        keysDown.has('KeyS') ||
        keysDown.has('ArrowDown') ||
        keysDown.has('KeyA') ||
        keysDown.has('ArrowLeft') ||
        keysDown.has('KeyD') ||
        keysDown.has('ArrowRight');
      if (manualMoveHeld && rallyPoint?.active) {
        rallyPoint = null;
      }

      let rallyForward = false;
      let rallyLeft = false;
      let rallyRight = false;
      if (rallyPoint && rallyPoint.active && !manualMoveHeld) {
        const rDx = rallyPoint.x - kin.x;
        const rDz = rallyPoint.z - kin.z;
        const rDist = Math.hypot(rDx, rDz);
        if (rDist < 2.15) {
          rallyPoint = null;
          setActiveActionToast('已精准抵达战术集结信标');
        } else {
          const desiredYaw = Math.atan2(rDz, rDx);
          let errYaw = desiredYaw - kin.yaw;
          while (errYaw > Math.PI) errYaw -= Math.PI * 2;
          while (errYaw < -Math.PI) errYaw += Math.PI * 2;
          rallyForward = Math.abs(errYaw) < 1.15;
          rallyLeft = errYaw < -0.09;
          rallyRight = errYaw > 0.09;
        }
      }

      const input: SandboxInputState = {
        forward: keysDown.has('KeyW') || keysDown.has('ArrowUp') || rallyForward,
        backward: keysDown.has('KeyS') || keysDown.has('ArrowDown'),
        left: keysDown.has('KeyA') || keysDown.has('ArrowLeft') || rallyLeft,
        right: keysDown.has('KeyD') || keysDown.has('ArrowRight') || rallyRight,
        up: keysDown.has('Space'),
        down: keysDown.has('ControlLeft') || keysDown.has('ControlRight'),
        sprint: keysDown.has('ShiftLeft') || keysDown.has('ShiftRight')
      };

      const locoSpec = getLocomotionModeSpec(actorSpec.id, actorSpec.domain, rt.locomotionMode);
      const effectiveSpec: SandboxActorSpec = {
        ...actorSpec,
        cruiseSpeed: actorSpec.cruiseSpeed * locoSpec.speedMultiplier,
        boostSpeed: actorSpec.boostSpeed * locoSpec.speedMultiplier,
        turnRate: actorSpec.turnRate * locoSpec.turnMultiplier
      };

      if (rt.triggerDashRequested) {
        rt.triggerDashRequested = false;
        dashState = triggerVectorDash(dashState, kin.yaw, rt.dashStrafeSign, effectiveSpec.boostSpeed);
        const fxNow = Math.cos(kin.yaw);
        const fzNow = Math.sin(kin.yaw);
        for (let k = 0; k < 12; k++) {
          spawnParticle(
            kin.x - fxNow * 0.4,
            kin.y + 0.35,
            kin.z - fzNow * 0.4,
            -dashState.dirX * (3.5 + (k % 4)) + (Math.random() - 0.5) * 1.4,
            0.5 + (k % 3) * 0.4,
            -dashState.dirZ * (3.5 + (k % 4)) + (Math.random() - 0.5) * 1.4,
            0.15,
            0.9,
            1.0,
            0.52
          );
        }
      }
      const dashStep = stepVectorDash(dashState, simDt);
      dashState = dashStep.next;

      const jumpReq = rt.triggerJumpRequested;
      rt.triggerJumpRequested = false;

      let instYawRate = 0;
      if (simDt > 0 && (!dropState.active || dropState.phase === 'hydraulic_crouch_rise')) {
        if (leapBoostTimer > 0) leapBoostTimer = Math.max(0, leapBoostTimer - simDt);

        const prevYaw = kin.yaw;
        const prevAutoPatrol = kin.autoPatrol;
        kin = stepSandboxKinematics(
          kin,
          input,
          effectiveSpec,
          waypoints,
          simDt,
          jumpReq,
          leapBoostTimer
        );
        if (Math.abs(dashStep.dispX) > 1e-5 || Math.abs(dashStep.dispZ) > 1e-5) {
          kin.x = Math.max(-62, Math.min(62, kin.x + dashStep.dispX));
          kin.z = Math.max(-62, Math.min(62, kin.z + dashStep.dispZ));
          if (actorSpec.domain === 'land' && kin.isGrounded) {
            kin.y = sampleLandTerrainHeight(kin.x, kin.z);
          }
        }
        let dyaw = kin.yaw - prevYaw;
        while (dyaw > Math.PI) dyaw -= Math.PI * 2;
        while (dyaw < -Math.PI) dyaw += Math.PI * 2;
        instYawRate = Math.max(-2.6, Math.min(2.6, dyaw / Math.max(1e-3, simDt)));
        if (prevAutoPatrol && !kin.autoPatrol) {
          rt.autoPatrol = false;
          setAutoPatrol(false);
        }
      }

      const justFiredWeapon = Boolean(rt.triggerFireRequested || kin.emittedAutoFire);
      if (justFiredWeapon) {
        rt.triggerFireRequested = false;
        executeFireVfx();
      }

      if (rt.triggerScanRequested || kin.emittedAutoScan) {
        rt.triggerScanRequested = false;
        executeScanVfx();
      }

      // =======================================================================
      // AAA SYSTEM 1: TITANFALL 2 ORBITAL SUPERSONIC DROPFALL DEPLOYMENT [KEY T]
      // =======================================================================
      if (rt.triggerOrbitalDropRequested) {
        rt.triggerOrbitalDropRequested = false;
        dropState = triggerOrbitalDropfall();
        setOrbitalDropActive(true);
      }
      if (dropState.active && vfxWallDt > 0) {
        dropState = stepOrbitalDropfall(dropState, vfxWallDt);
        if (dropState.justTouchedDown) {
          kin.trauma = Math.min(1.0, kin.trauma + 0.9);
          proceduralAudioSynth.playOrbitalDropfallAudio('touchdown_rise', !rt.muted);
          for (let d = 0; d < 28; d++) {
            const ang = (d / 28) * Math.PI * 2;
            const spd = 4.2 + (d % 5) * 1.4;
            spawnParticle(
              kin.x + Math.cos(ang) * 0.65,
              kin.y + 0.15,
              kin.z + Math.sin(ang) * 0.65,
              Math.cos(ang) * spd,
              1.6 + (d % 4) * 0.9,
              Math.sin(ang) * spd,
              d % 3 === 0 ? 1.0 : 0.78,
              d % 3 === 0 ? 0.58 : 0.64,
              d % 3 === 0 ? 0.16 : 0.52,
              0.92
            );
          }
        }
      }

      // =======================================================================
      // AAA SYSTEM 2 & 4: AC6 OVERHEAT ARMOR-POP + 90ms RCS + DYNAMIC WEATHERING
      // =======================================================================
      const manualVentRequested = rt.triggerOverheatVentRequested;
      rt.triggerOverheatVentRequested = false;
      const dtSafe = Math.max(0.016, simDt);
      const yawAccelRadS2 = (instYawRate - prevYawRateForRcs) / dtSafe;
      const forwardDecelMS2 = Math.max(0, (prevSpeedForRcs - kin.speed) / dtSafe);
      prevYawRateForRcs = instYawRate;
      prevSpeedForRcs = kin.speed;

      if (vfxWallDt > 0 || manualVentRequested) {
        overheatState = stepOverheatAndRcsState(overheatState, {
          dt: Math.max(0.016, vfxWallDt),
          isBoosting: kin.isBoosting,
          justFiredWeapon,
          manualVentRequested,
          yawAccelRadS2,
          forwardDecelMS2
        });
        if (overheatState.justTriggeredVent) {
          proceduralAudioSynth.playOverheatVentAudio('open_steam', !rt.muted);
        }
        if (overheatState.justSnappedShut) {
          proceduralAudioSynth.playOverheatVentAudio('lock_shut', !rt.muted);
        }
      }

      if (rt.cleanWeatheringRequested) {
        rt.cleanWeatheringRequested = false;
        weatheringState = createInitialWeatheringState();
      } else if (vfxWallDt > 0) {
        weatheringState = stepDynamicWeathering(weatheringState, {
          dt: vfxWallDt,
          domain: actorSpec.domain,
          speedMetersPerSec: Math.abs(kin.speed),
          throttlePct: kin.throttlePct
        });
      }

      // =======================================================================
      // MODULE 2: FAULT-TOLERANT LIMP-HOME ATTITUDE & THRUSTER REALLOCATION
      // =======================================================================
      const faultAttitude = computeFaultTolerantAttitudeOffsets(
        rt.activeFaults,
        simTime,
        kin.gaitDistance,
        kin.speed,
        actorSpec.domain
      );

      const gaitBob =
        actorSpec.domain === 'land' && kin.isGrounded
          ? Math.abs(Math.sin(kin.gaitDistance * 2.55)) *
            Math.min(0.08, Math.abs(kin.speed) * 0.012) *
            (actorSpec.id === 'unitree_g1' || actorSpec.id === 'unitree_go2' ? 1.0 : 0.22)
          : Math.sin(simTime * 2.2) * 0.04;

      // Mid-air hover lift (+0.55m) when Bullet-Time Explosion is active on land + Orbital Dropfall altitude & hydraulic crouch!
      const bulletHoverLift =
        actorSpec.domain === 'land' ? bulletState.explosionProgress * 0.62 : 0.0;
      const dropAltitudeOffset =
        dropState.altitudeOffsetMeters - dropState.crouchCompression * 0.02;

      actorRoot.position.set(
        kin.x,
        kin.y +
          gaitBob +
          faultAttitude.hopYOffset +
          bulletHoverLift +
          dropAltitudeOffset +
          locoSpec.heightOffsetMeters +
          ultimateSkill.altitudeOffset,
        kin.z
      );
      _eulerA.set(
        kin.roll * locoSpec.rollBankMultiplier +
          faultAttitude.rollOffset +
          dashStep.rollOffset +
          ultimateSkill.rollOffset,
        -kin.yaw + ultimateSkill.yawSpinOffset,
        kin.pitch + locoSpec.pitchBiasRad + faultAttitude.pitchOffset + ultimateSkill.pitchOffset,
        'YXZ'
      );
      actorRoot.quaternion.setFromEuler(_eulerA);
      actorRoot.updateMatrixWorld(true);

      if (actorSpec.domain === 'land') {
        const groundH = sampleLandTerrainHeight(kin.x, kin.z);
        contactShadow.position.set(kin.x, groundH + 0.025, kin.z);
        const shadowScale = Math.max(
          0.35,
          1.15 - Math.max(0, actorRoot.position.y - groundH) * 0.18
        );
        contactShadow.scale.setScalar(shadowScale);
      }

      if (fireAnimTimer > 0 && simDt > 0) {
        fireAnimTimer = Math.max(0, fireAnimTimer - simDt * 1.15);
      }

      // =======================================================================
      // MODULE 5: REAL URDF 6-DOF CCD IK + NOMINAL / LIMP-HOME JOINT DRIVERS
      // =======================================================================
      let endEffectorWorld = actorRoot.position.clone().add(new THREE.Vector3(0, 0.8, 0));
      ikTargetWorld.copy(ikTargetLocalOffset).applyMatrix4(actorRoot.matrixWorld);

      if (rt.ikEnabled && ikChainSpecs.length > 0 && boundJoints.length > 0) {
        const firstB = boundJoints[ikChainIndices[0]];
        const chainParent = firstB.node.parent || modelHolder;
        chainParent.updateMatrixWorld(true);
        ikChainRootInv.copy(chainParent.matrixWorld).invert();
        const tgtLocal = ikTargetWorld.clone().applyMatrix4(ikChainRootInv);
        const solved = solveCcdIkChain(
          ikChainSpecs,
          ikAngles,
          [tgtLocal.x, tgtLocal.y, tgtLocal.z],
          [0.2, 0.02, 0],
          10,
          0.35
        );
        ikAngles = solved.angles;
        endEffectorWorld
          .set(solved.endEffectorPos[0], solved.endEffectorPos[1], solved.endEffectorPos[2])
          .applyMatrix4(chainParent.matrixWorld);
      }

      let poseChecksum = kin.x * 0.5 + kin.y * 0.7 + kin.z * 0.9 + kin.yaw * 1.3;
      let sumJointSpeedRadS = 0;

      // Advance Odradek Scan Elapsed Clock (wall-clock paced) & Compute 0.15s Real Sensor Snap Pose!
      if (odradekElapsed > 0) {
        if (vfxWallDt > 0) {
          odradekElapsed += vfxWallDt;
        }
        if (odradekElapsed > ODRADEK_TOTAL_DURATION) {
          odradekElapsed = 0;
        }
      }
      const odradekSnap = computeOdradekSensorSnapPose(odradekElapsed);

      for (let i = 0; i < boundJoints.length; i++) {
        const bj = boundJoints[i];
        const ikSlot = rt.ikEnabled ? ikChainIndices.indexOf(i) : -1;
        let angle =
          ikSlot >= 0
            ? ikAngles[ikSlot]
            : computeSandboxUrdfJointAngle(
                actorSpec.id,
                bj.def,
                i,
                kin,
                simTime,
                fireAnimTimer
              );

        // Apply 4-Mode Embodied Locomotion Posture & Gait Delta!
        if (ikSlot < 0 && rt.locomotionMode !== 'standard') {
          angle += computeLocomotionUrdfJointDelta(
            actorSpec.id,
            bj.def,
            rt.locomotionMode,
            kin.gaitDistance * locoSpec.strideFreqMultiplier,
            simTime
          );
        }

        // Apply Signature Ultimate Skill [Q] Bespoke URDF Stunt Pose!
        if (ultimateSkill.active && ikSlot < 0) {
          angle += computeUltimateUrdfJointDelta(actorSpec.id, bj.def, ultimateSkill);
        }

        // Apply Titanfall 2 Orbital Dropfall Hydraulic Knee / Flipper / Suspension Crouch!
        if (dropState.crouchCompression > 0.002 && ikSlot < 0) {
          angle += computeDropfallUrdfJointDelta(actorSpec.id, bj.def, dropState.crouchCompression);
        }

        // Apply Death Stranding Odradek 0.15s Crisp Mechanical Sensor Snap!
        if (odradekSnap.active && i === odradekSensorJointIdx) {
          angle += odradekSnap.yawSnapOffsetRad;
        }

        if (ikSlot < 0 && rt.activeFaults.length > 0) {
          angle = applyFaultToUrdfJointAngle(
            angle,
            bj.def.name,
            i,
            rt.activeFaults,
            simTime,
            kin.gaitDistance
          );
        }

        bj.omegaRadS = Math.min(25.0, Math.abs(angle - bj.prevAngle) / Math.max(0.004, realDt));
        bj.prevAngle = angle;
        sumJointSpeedRadS += bj.omegaRadS;
        poseChecksum += angle * (i + 1) * 0.1;

        if (bj.def.type === 'prismatic') {
          bj.node.position.copy(bj.basePos).addScaledVector(bj.axisVec, angle);
        } else {
          _qA.setFromAxisAngle(bj.axisVec, angle);
          bj.node.quaternion.copy(bj.baseQuat).multiply(_qA);
        }
      }

      // Module 5: Procedural Physical WebAudio Telemetry (FOC Servo Whine / CFM56 Dual-Spool BPF / Ping360 Sonar)
      if (rt.audioSynthEnabled) {
        if (actorSpec.id === 'b737_cfm56') {
          const n1Rpm = 1400 + (kin.throttlePct / 100) * 3900;
          const n2Rpm = 8800 + (kin.throttlePct / 100) * 6100;
          proceduralAudioSynth.updateAeroTurbofanTelemetry(n1Rpm, n2Rpm, kin.reverserStroke > 0.3);
        } else {
          const effectiveServoSpeed =
            sumJointSpeedRadS > 0.05 ? sumJointSpeedRadS : Math.abs(kin.speed) * 2.2;
          proceduralAudioSynth.updateFocServoTelemetry(
            effectiveServoSpeed,
            actorSpec.domain === 'sea',
            simTime
          );
        }
      }

      // =======================================================================
      // MID-AIR 4-STAGE ORTHOGONAL CAD EXPLOSION + MACHINE-EYE VISION MATERIALS
      // =======================================================================
      const expProg = Math.max(
        rt.microFpvActive ? 0.45 : 0,
        bulletState.explosionProgress,
        ultimateSkill.armorExplosionRatio
      );
      const windows: Record<1 | 2 | 3 | 4, [number, number]> = {
        1: [0.0, 0.3],
        2: [0.22, 0.56],
        3: [0.48, 0.82],
        4: [0.72, 1.0]
      };

      const isSlam = rt.visionMode === 'slam';
      const isFlir = rt.visionMode === 'flir';
      const isAcoustic = rt.visionMode === 'acoustic';

      // Switch Scene Background, Fog & Terrain Materials for Machine-Eye Native Visions!
      if (isSlam || isAcoustic) {
        scene.background = darkVoidBgColor;
        sceneFog.color.copy(darkVoidBgColor);
        sceneFog.density = 0.008;
        if (primaryTerrainMat) primaryTerrainMat.visible = false;
        if (obstacleMat) {
          obstacleMat.wireframe = true;
          obstacleMat.color.setHex(isAcoustic ? 0x0ea5e9 : 0x10b981);
        }
      } else if (isFlir) {
        scene.background = flirBgColor;
        sceneFog.color.copy(flirBgColor);
        sceneFog.density = 0.012;
        if (primaryTerrainMat) {
          primaryTerrainMat.visible = true;
          const lumT = computeFlirWhiteHotLuminance('terrain');
          primaryTerrainMat.color.setRGB(lumT, lumT, lumT);
          primaryTerrainMat.map = null;
          primaryTerrainMat.needsUpdate = true;
        }
        if (obstacleMat) {
          obstacleMat.wireframe = false;
          const lumO = computeFlirWhiteHotLuminance('obstacle');
          obstacleMat.color.setRGB(lumO, lumO, lumO);
        }
      } else {
        scene.background = normalBgColor;
        sceneFog.color.copy(normalBgColor);
        sceneFog.density = normalFogDensity;
        if (primaryTerrainMat) {
          primaryTerrainMat.visible = true;
          primaryTerrainMat.color.setHex(0xffffff);
          if (primaryTerrainMat.map !== surfaceTex) {
            primaryTerrainMat.map = surfaceTex;
            primaryTerrainMat.needsUpdate = true;
          }
        }
        if (obstacleMat) {
          obstacleMat.wireframe = false;
          obstacleMat.color.copy(origObstacleColor);
        }
      }

      const boundJointNodeSet = (
        modelHolder.userData as { boundJointNodes?: Set<THREE.Object3D> }
      ).boundJointNodes;

      for (let i = 0; i < cadParts.length; i++) {
        const cp = cadParts[i];
        const m = cp.mesh;
        const isUrdfJointNode = Boolean(boundJointNodeSet && boundJointNodeSet.has(m));

        // 4-Stage Mid-Air Orthogonal Explosion displacement + AC6 12% Overheat Outer-Armor Pop!
        const [w0, w1] = windows[cp.orthoPlan.stage];
        const rawU = expProg <= w0 ? 0 : expProg >= w1 ? 1 : (expProg - w0) / (w1 - w0);
        const stageU = rawU * rawU * (3 - 2 * rawU);
        const ac6ArmorPop = cp.layer === 'L1' ? overheatState.armorGapRatio : 0.0;
        const orthoDisp = stageU * 1.15 + ac6ArmorPop;

        if (isUrdfJointNode) {
          if (orthoDisp > 1e-4) {
            m.position.addScaledVector(cp.localOrthoVec, orthoDisp);
          }
        } else {
          m.position.copy(cp.basePos).addScaledVector(cp.localOrthoVec, orthoDisp);
          m.quaternion.copy(cp.baseQuat);
        }

        if (actorSpec.id === 'mars2020') {
          if (cp.role === 'wheel') {
            const locked = rt.activeFaults.some((f) => f.partName === cp.partName);
            _qA.setFromAxisAngle(_axisX, locked ? 0 : kin.gaitDistance * 1.8);
            m.quaternion.multiply(_qA);
          } else if (cp.role === 'suspension') {
            _qA.setFromAxisAngle(
              _axisX,
              Math.sin(kin.gaitDistance * 1.5) * 0.18 +
                kin.pitch * 0.6 +
                dropState.crouchCompression * 0.42
            );
            m.quaternion.multiply(_qA);
          } else if (cp.role === 'mast') {
            const aimYaw =
              odradekSnap.active
                ? odradekSnap.yawSnapOffsetRad * 1.4
                : fireAnimTimer > 0
                  ? 0.0
                  : Math.sin(simTime * 1.2) * 0.45;
            _qA.setFromAxisAngle(_axisY, aimYaw);
            m.quaternion.multiply(_qA);
          } else if (cp.role === 'arm') {
            const armPitch = rt.ikEnabled
              ? -0.55 + (ikTargetLocalOffset.y - 0.6) * 0.65
              : -0.2 + Math.sin(simTime * 1.6) * 0.08;
            _qA.setFromAxisAngle(_axisX, armPitch);
            m.quaternion.multiply(_qA);
            if (rt.ikEnabled) {
              endEffectorWorld.copy(ikTargetWorld);
            }
          }
        } else if (actorSpec.id === 'b737_cfm56') {
          if (cp.role === 'n1_rotor') {
            _qA.setFromAxisAngle(
              _axisX,
              simTime * (12.0 + kin.speed * 0.85) * faultAttitude.speedMultiplier
            );
            m.quaternion.multiply(_qA);
          } else if (cp.role === 'n2_rotor') {
            _qA.setFromAxisAngle(
              _axisX,
              simTime * (26.0 + kin.speed * 1.65) * faultAttitude.speedMultiplier
            );
            m.quaternion.multiply(_qA);
          } else if (cp.role === 'reverser_port' || cp.role === 'reverser_stbd') {
            m.position.x += kin.reverserStroke * 0.46;
          }
        }

        // Material appearance for Fault Flash vs Machine-Eye Visions vs Standard PBR
        const isFaulted = rt.activeFaults.some((f) => f.partName === cp.partName);
        const mat = cp.origMat;
        if (isFaulted) {
          const flash = 0.5 + 0.5 * Math.sin(realElapsed * 26.0);
          mat.wireframe = false;
          mat.color.setRGB(0.96, 0.12 + 0.18 * flash, 0.12);
          if (mat.emissive) mat.emissive.setRGB(0.92 * flash, 0.06, 0.04);
        } else if (isSlam || isAcoustic) {
          mat.wireframe = true;
          mat.color.setHex(isAcoustic ? 0x38bdf8 : 0x34d399);
          if (mat.emissive) mat.emissive.setHex(isAcoustic ? 0x0284c7 : 0x059669);
        } else if (isFlir) {
          mat.wireframe = false;
          const lum = computeFlirWhiteHotLuminance(
            cp.layer === 'L3' || cp.role === 'n2_rotor' ? 'robot_actuator' : 'robot_chassis',
            kin.throttlePct / 100
          );
          mat.color.setRGB(lum, lum, lum);
          if (mat.emissive) mat.emissive.setRGB(lum * 0.35, lum * 0.35, lum * 0.35);
        } else {
          mat.wireframe = cp.origWireframe;
          mat.color.copy(cp.origColor);
          if (mat.emissive) mat.emissive.copy(cp.origEmissive);
        }

        const worldSlsLaserY = actorRoot.position.y + rt.slsRelState.laserY;
        const focusCode = computeHorizonFocusMode(
          rt.focusWeakpointEnabled,
          cp.partName,
          cp.layer
        );
        cp.twinUniforms.uMagLensActive.value =
          rt.magLensEnabled && rt.magLensHoverValid ? 1.0 : 0.0;
        cp.twinUniforms.uMagLensCenter.value.copy(rt.magLensCenter);
        cp.twinUniforms.uMagLensRadius.value = rt.magLensRadius;
        if (rt.windTunnelConfig.schlierenMode) {
          rt.slsRelState.active = false;
        }
        cp.twinUniforms.uSlsActive.value = rt.slsRelState.active ? 1.0 : 0.0;
        cp.twinUniforms.uSlsLaserY.value = worldSlsLaserY;
        cp.twinUniforms.uFocusMode.value = focusCode;
        cp.twinUniforms.uSalvagePulse.value = realElapsed;
        cp.twinUniforms.uDustAmount.value = weatheringState.marsDust;
        cp.twinUniforms.uFrostAmount.value = weatheringState.intakeFrost;
        cp.twinUniforms.uHeatBluing.value = weatheringState.titaniumHeatBluing;
        cp.twinUniforms.uOverheatCoreGlow.value = Math.max(
          overheatState.coreGlowIntensity,
          ultimateSkill.coreGlowIntensity * 0.9
        );
        cp.twinUniforms.uModelMinY.value = actorRoot.position.y;
        cp.twinUniforms.uModelSpanY.value = modelHeightSpan;
      }

      // Live Dynamic Lowest-Foot / Paw / Track / Wheel Grounding (Zero Underground Burial & Zero Floating!)
      actorRoot.updateMatrixWorld(true);
      if (actorSpec.domain === 'land' && expProg < 0.02 && cadParts.length > 0) {
        _invActorMat.copy(actorRoot.matrixWorld).invert();
        let minRawRelY = Infinity;
        const curHolderY = modelHolder.position.y;
        for (let i = 0; i < cadParts.length; i++) {
          const cp = cadParts[i];
          const corners = cp.localFootCorners;
          if (!cp.mesh.visible || corners.length === 0) continue;
          _partToActorMat.multiplyMatrices(_invActorMat, cp.mesh.matrixWorld);
          for (let c = 0; c < corners.length; c++) {
            _vCorner.copy(corners[c]).applyMatrix4(_partToActorMat);
            const rawY = _vCorner.y - curHolderY;
            if (rawY < minRawRelY) minRawRelY = rawY;
          }
        }
        if (Number.isFinite(minRawRelY)) {
          const targetHolderY = Math.max(-0.65, Math.min(0.65, -minRawRelY + 0.012));
          if (Math.abs(targetHolderY - modelHolder.position.y) > 0.12) {
            modelHolder.position.y = targetHolderY;
          } else {
            modelHolder.position.y +=
              (targetHolderY - modelHolder.position.y) * (1 - Math.exp(-22 * realDt));
          }
          actorRoot.updateMatrixWorld(true);
        }
      } else if (Math.abs(modelHolder.position.y) > 1e-4) {
        modelHolder.position.y *= Math.exp(-12 * realDt);
        actorRoot.updateMatrixWorld(true);
      }

      // Update Mid-Air Bullet-Time Dashed Assembly Trace Lines
      if (expProg > 0.015 && cadParts.length > 0) {
        const anchors = cadParts.map((cp) => {
          if (cp.mesh.parent) {
            cp.mountOriginWorld.copy(cp.socketInParentLocal);
            cp.mesh.parent.localToWorld(cp.mountOriginWorld);
          }
          cp.currentCenterWorld.copy(cp.geomLocalCenter);
          cp.mesh.localToWorld(cp.currentCenterWorld);
          return {
            originWorld: cp.mountOriginWorld,
            currentWorld: cp.currentCenterWorld,
            visible: cp.mesh.visible
          };
        });
        bulletTraceController.updateTraces(anchors, true);
      } else {
        bulletTraceController.updateTraces([], false);
      }

      // =======================================================================
      // SANDEVISTAN 4D CHRONO-POSE STROBE TRAIL (<= 3 faint Fresnel rim slots)
      // =======================================================================
      const isManeuvering =
        Math.abs(kin.speed) > actorSpec.cruiseSpeed * 0.65 ||
        kin.isBoosting ||
        !kin.isGrounded ||
        fireAnimTimer > 0.05;
      if (simDt > 0) {
        const steppedStrobe = stepChronoStrobeScheduler(
          strobeState,
          realDt,
          rt.strobeEnabled && !bulletState.active,
          isManeuvering
        );
        strobeState = steppedStrobe.next;
        if (steppedStrobe.captureSlotIndex >= 0 && realMeshesForStrobe.length > 0) {
          strobeController.capturePoseIntoSlot(
            steppedStrobe.captureSlotIndex,
            realMeshesForStrobe,
            actorRoot.position
          );
        }
      }
      strobeController.updateSlots(
        strobeState.slots,
        rt.strobeEnabled && !bulletState.active,
        actorRoot.position
      );

      // =======================================================================
      // MODULE 3: MULTI-GLB SWARM FORMATION & LINK-16 / UMBILICAL KILL-CHAIN
      // =======================================================================
      const nearestTgtVec = findNearestTargetWorldPos(kin.x, kin.y, kin.z, kin.yaw);
      if (rt.swarmOpsEnabled) {
        const swarmState = evaluateSwarmTacticalState(
          actorSpec.id,
          actorSpec.domain,
          kin.x,
          kin.y,
          kin.z,
          kin.yaw,
          kin.gaitDistance,
          simTime,
          [nearestTgtVec.x, nearestTgtVec.y, nearestTgtVec.z]
        );
        swarmUnitsGroup.visible = true;

        const activeWingIds = new Set(swarmState.wingmen.map((w) => w.actorId));
        loadedWingmen.forEach((inst, id) => {
          inst.root.visible = activeWingIds.has(id);
        });

        const linkNodes: THREE.Vector3[] = [
          new THREE.Vector3(kin.x, actorRoot.position.y + 1.15, kin.z)
        ];

        for (const wpPose of swarmState.wingmen) {
          ensureWingmanLoaded(wpPose.actorId);
          const inst = loadedWingmen.get(wpPose.actorId);
          if (inst) {
            inst.root.visible = true;
            inst.root.position.set(wpPose.x, wpPose.y, wpPose.z);
            _eulerA.set(wpPose.roll, -wpPose.yaw, wpPose.pitch, 'YXZ');
            inst.root.quaternion.setFromEuler(_eulerA);

            const fakeKin: SandboxKinematicState = {
              ...kin,
              x: wpPose.x,
              y: wpPose.y,
              z: wpPose.z,
              yaw: wpPose.yaw,
              gaitDistance: wpPose.gaitDistance,
              isGrounded: true
            };
            for (let jIdx = 0; jIdx < inst.joints.length; jIdx++) {
              const jB = inst.joints[jIdx];
              const jAng = computeSandboxUrdfJointAngle(
                wpPose.actorId,
                jB.def,
                jIdx,
                fakeKin,
                simTime,
                wpPose.isFiring ? 0.8 : 0
              );
              if (jB.def.type === 'prismatic') {
                jB.node.position.copy(jB.basePos).addScaledVector(jB.axisVec, jAng);
              } else {
                _qA.setFromAxisAngle(jB.axisVec, jAng);
                jB.node.quaternion.copy(jB.baseQuat).multiply(_qA);
              }
            }

            // Apply Machine-Eye Vision materials to wingman meshes too
            for (const wm of inst.meshes) {
              if (isSlam || isAcoustic) {
                wm.origMat.wireframe = true;
                wm.origMat.color.setHex(isAcoustic ? 0x38bdf8 : 0x34d399);
              } else if (isFlir) {
                wm.origMat.wireframe = false;
                wm.origMat.color.setRGB(0.75, 0.75, 0.75);
              } else {
                wm.origMat.wireframe = false;
                wm.origMat.color.copy(wm.origColor);
              }
            }
          }
          linkNodes.push(new THREE.Vector3(wpPose.x, wpPose.y + 1.15, wpPose.z));
        }

        if (actorSpec.domain === 'sea' && swarmState.wingmen.length > 0) {
          const partner = swarmState.wingmen[0];
          swarmFxController.updateSeaUmbilical(
            [kin.x, actorRoot.position.y + 0.35, kin.z],
            [partner.x, partner.y + 0.35, partner.z],
            simTime,
            true
          );
        } else {
          swarmFxController.updateSeaUmbilical([0, 0, 0], [0, 0, 0], simTime, false);
          swarmFxController.updateLandLink16(
            linkNodes,
            nearestTgtVec,
            swarmState.phase,
            simTime,
            true
          );
        }

        if (now - lastHudBadgeSync > 0.12) {
          setSwarmPhaseBanner(swarmState.phaseLabel);
        }
      } else {
        swarmUnitsGroup.visible = false;
        swarmFxController.updateLandLink16([], nearestTgtVec, 0, simTime, false);
        swarmFxController.updateSeaUmbilical([0, 0, 0], [0, 0, 0], simTime, false);
      }

      // =======================================================================
      // MODULE 4: UPDATE MACHINE-EYE SLAM / ACOUSTIC ECHO POINT CLOUDS
      // =======================================================================
      visionFxController.updateVision(rt.visionMode, actorRoot.position, simTime);

      // =======================================================================
      // SCI-TECH MODULES 1, 2 & 3: MAG-LENS + SLS RIG, 11-ARC MPC & DISASTER FX
      // =======================================================================
      const actorCenterWorld = _vA.set(
        kin.x,
        actorRoot.position.y + modelHeightSpan * 0.48,
        kin.z
      );
      const worldSlsState: SlsMaterializationState = {
        ...rt.slsRelState,
        laserY: actorRoot.position.y + rt.slsRelState.laserY
      };
      magSlsRig.update({
        magLensEnabled: rt.magLensEnabled,
        magLensHoverValid: rt.magLensHoverValid,
        magLensCenter: rt.magLensCenter,
        magLensRadius: rt.magLensRadius,
        slsState: worldSlsState,
        modelCenter: actorCenterWorld,
        yMax: actorRoot.position.y + modelHeightSpan,
        simTime: realElapsed
      });

      let mpcPowerWatts = 0;
      if (rt.mpcEnabled || ultimateSkill.active) {
        const sampleMpcY =
          actorSpec.domain === 'land'
            ? sampleLandTerrainHeight
            : () => actorRoot.position.y;
        const mpcFan = computeMpcRolloutFan(
          kin.x,
          actorRoot.position.y,
          kin.z,
          kin.yaw,
          kin.speed,
          instYawRate,
          sampleMpcY,
          simTime,
          2.0,
          16
        );
        const jointArteryInputs =
          boundJoints.length > 0
            ? boundJoints.map((bj) => ({
                def: bj.def,
                node: bj.node,
                omegaRadS:
                  bj.omegaRadS > 0.04 ? bj.omegaRadS : Math.abs(kin.speed) * 0.45 + 0.25,
                torqueNm: 16.0 + (kin.throttlePct / 100) * 26.0
              }))
            : cadParts.slice(0, 16).map((cp, idx) => ({
                def: { name: cp.partName, type: 'revolute' },
                node: cp.mesh,
                omegaRadS: 1.0 + (kin.throttlePct / 100) * (2.2 + (idx % 3) * 0.8),
                torqueNm: 22.0
              }));
        const resMpc = mpcPowerCtrl.updateMpcAndPower({
          enabled: true,
          mpcResult: mpcFan,
          powerCoreWorld: actorCenterWorld,
          jointNodes: jointArteryInputs,
          simTime: realElapsed
        });
        mpcPowerWatts = resMpc.totalPowerWatts;
      } else {
        mpcPowerCtrl.updateMpcAndPower({
          enabled: false,
          mpcResult: null,
          powerCoreWorld: actorCenterWorld,
          jointNodes: [],
          simTime: realElapsed
        });
      }

      disasterFx.updateDisasterFX({
        config: rt.windTunnelConfig,
        anchorWorld: actorCenterWorld,
        headingYaw: kin.yaw,
        modelScaleRadius: 1.25,
        simTime: realElapsed
      });

      // =======================================================================
      // CONTINUOUS TRAILS, FAULT SPARKS / HALON / SURGE & PLASMA KERF TRAIL
      // =======================================================================
      const fx = Math.cos(kin.yaw);
      const fz = Math.sin(kin.yaw);
      const rx = -fz;
      const rz = fx;
      const dynamicEmissives: DynamicEmissivePoint[] = [];

      if (simDt > 0) {
        if (actorSpec.domain === 'land' && kin.emittedFootstep) {
          for (const side of [-0.52, 0.52]) {
            spawnParticle(
              kin.x - fx * 0.5 + rx * side,
              kin.y + 0.08,
              kin.z - fz * 0.5 + rz * side,
              -fx * 0.8 + (Math.random() - 0.5) * 0.9,
              0.85 + Math.random() * 0.6,
              -fz * 0.8 + (Math.random() - 0.5) * 0.9,
              0.85,
              0.52,
              0.32,
              0.75
            );
          }
        } else if (
          actorSpec.domain === 'sea' &&
          (Math.abs(kin.speed) > 0.5 || Math.abs(kin.vy) > 0.3 || faultAttitude.rovReallocated)
        ) {
          const bubbleCount = faultAttitude.rovReallocated ? 2 : 1;
          for (let b = 0; b < bubbleCount; b++) {
            for (const side of [-0.42, 0.42]) {
              spawnParticle(
                kin.x - fx * 0.85 + rx * side,
                kin.y + Math.sin(simTime * 14 + side * 5) * 0.14,
                kin.z - fz * 0.85 + rz * side,
                -fx * 1.8,
                0.65 + Math.random() * 0.4,
                -fz * 1.8,
                0.72,
                0.94,
                1.0,
                0.95
              );
            }
          }
        } else if (actorSpec.domain === 'air') {
          const boostRatio = Math.max(0.35, Math.min(1.65, kin.speed / actorSpec.cruiseSpeed));
          machPlumeGroup.visible = !kin.isBrakingReverse && rt.activeFaults.length === 0;
          machPlumeGroup.scale.set(
            boostRatio * (1.0 + Math.sin(simTime * 42) * 0.08),
            0.92 + Math.sin(simTime * 35) * 0.05,
            0.92 + Math.cos(simTime * 35) * 0.05
          );
          if (machPlumeGroup.visible) {
            dynamicEmissives.push({
              pos: new THREE.Vector3(kin.x - fx * 1.6, actorRoot.position.y, kin.z - fz * 1.6),
              color: new THREE.Color(0x6366f1),
              radiance: 3.4
            });
          }
          if (faultAttitude.surgeBackfireActive) {
            // Violent Compressor Surge orange intake backfire blast!
            for (let s = 0; s < 3; s++) {
              spawnParticle(
                kin.x + fx * 1.15,
                actorRoot.position.y,
                kin.z + fz * 1.15,
                fx * 9.5 + (Math.random() - 0.5) * 3.5,
                (Math.random() - 0.5) * 3.0,
                fz * 9.5 + (Math.random() - 0.5) * 3.5,
                1.0,
                0.42,
                0.08,
                0.45
              );
            }
          } else if (faultAttitude.halonSprayActive) {
            // Azure-Blue Halon Fire-Extinguishing Mist Spray!
            for (let s = 0; s < 2; s++) {
              spawnParticle(
                kin.x,
                actorRoot.position.y + 0.25,
                kin.z,
                -fx * 3.2 + (Math.random() - 0.5) * 1.8,
                (Math.random() - 0.5) * 1.4,
                -fz * 3.2 + (Math.random() - 0.5) * 1.8,
                0.22,
                0.78,
                1.0,
                0.72
              );
            }
          }
        }

        // Fault Electric Arc Sparks + Trailing Dark Smoke on Damaged .glb Sub-Mesh!
        if (rt.activeFaults.length > 0) {
          const latestF = rt.activeFaults[rt.activeFaults.length - 1];
          const fPart = cadParts.find((c) => c.partName === latestF.partName);
          if (fPart) {
            _vA.copy(fPart.geomLocalCenter);
            fPart.mesh.localToWorld(_vA);
            spawnParticle(
              _vA.x,
              _vA.y,
              _vA.z,
              (Math.random() - 0.5) * 3.4,
              1.4 + Math.random() * 2.0,
              (Math.random() - 0.5) * 3.4,
              1.0,
              0.72,
              0.18,
              0.42
            );
            spawnParticle(
              _vA.x,
              _vA.y + 0.15,
              _vA.z,
              -fx * 0.9 + (Math.random() - 0.5) * 0.5,
              1.35,
              -fz * 0.9 + (Math.random() - 0.5) * 0.5,
              0.24,
              0.26,
              0.3,
              0.85
            );
          }
        }

        // Plasma Arc Cutting Torch Sparks & Glowing Molten Kerf Trail!
        if (rt.ikEnabled && rt.plasmaCutting) {
          const cutPt: [number, number, number] = [
            ikTargetWorld.x + Math.sin(simTime * 3.2) * 0.22,
            ikTargetWorld.y + Math.cos(simTime * 2.5) * 0.12,
            ikTargetWorld.z + Math.cos(simTime * 3.2) * 0.22
          ];
          kerfNodes = stepMoltenKerfTrail(kerfNodes, simDt, cutPt, 96);
          for (let sp = 0; sp < 2; sp++) {
            spawnParticle(
              cutPt[0],
              cutPt[1],
              cutPt[2],
              (Math.random() - 0.5) * 3.2,
              1.2 + Math.random() * 2.4,
              (Math.random() - 0.5) * 3.2,
              0.72,
              0.94,
              1.0,
              0.48
            );
          }
        } else if (kerfNodes.length > 0) {
          kerfNodes = stepMoltenKerfTrail(kerfNodes, simDt, null, 96);
        }
      }

      if (rt.ikEnabled && rt.plasmaCutting) {
        dynamicEmissives.push({
          pos: ikTargetWorld.clone(),
          color: new THREE.Color(0x67e8f9),
          radiance: 4.0
        });
      }

      ikPlasmaController.updateIkAndPlasma(
        rt.ikEnabled,
        ikTargetWorld,
        endEffectorWorld,
        rt.ikEnabled && rt.plasmaCutting,
        kerfNodes,
        simTime
      );

      // Sonic Boom Vapor Ring (feathered edges, <= 0.28 opacity)
      if (actorSpec.domain === 'air') {
        if (fireAnimTimer > 0.15) {
          sonicBoomConeMesh.visible = true;
          const s = 0.88 + (1 - fireAnimTimer) * 0.72;
          sonicBoomConeMesh.scale.set(s, s, s);
          boomUniforms.uOpacity.value = fireAnimTimer * 0.28;
        } else {
          sonicBoomConeMesh.visible = false;
        }
      }

      // Laser Beam (Land: Mars 2020 / SAR / Z1) — also acts as an Emissive Area Light in Bullet-Time Path Tracing!
      if (
        fireAnimTimer > 0.25 &&
        actorSpec.domain === 'land' &&
        actorSpec.id !== 'unitree_go2' &&
        actorSpec.id !== 'unitree_g1'
      ) {
        laserPosArr[0] = kin.x + fx * 0.65;
        laserPosArr[1] = actorRoot.position.y + 1.05;
        laserPosArr[2] = kin.z + fz * 0.65;
        laserPosArr[3] = nearestTgtVec.x;
        laserPosArr[4] = nearestTgtVec.y + 0.35;
        laserPosArr[5] = nearestTgtVec.z;
        laserGeo.attributes.position.needsUpdate = true;
        laserMat.opacity = 0.75 + 0.25 * Math.sin(simTime * 60);
        laserBeamLine.visible = true;
        dynamicEmissives.push({
          pos: new THREE.Vector3(
            (laserPosArr[0] + laserPosArr[3]) * 0.5,
            (laserPosArr[1] + laserPosArr[4]) * 0.5,
            (laserPosArr[2] + laserPosArr[5]) * 0.5
          ),
          color: new THREE.Color(0xf97316),
          radiance: 3.8
        });
      } else {
        laserBeamLine.visible = false;
      }

      // Projectile
      if (projActive) {
        if (simDt > 0) projTime += simDt * 1.25;
        if (projTime >= 1.0) {
          projActive = false;
          projectileMesh.visible = false;
          shockTimer = 1.0;
          shockCenter.copy(projEnd);
          if (activeProjectileTargetId) {
            applyStrikeToTarget(activeProjectileTargetId, 68);
            activeProjectileTargetId = null;
          }
          for (let k = 0; k < 18; k++) {
            const a = (k / 18) * Math.PI * 2;
            spawnParticle(
              projEnd.x,
              projEnd.y,
              projEnd.z,
              Math.cos(a) * 3.4,
              1.6,
              Math.sin(a) * 3.4,
              0.22,
              0.88,
              1.0,
              0.9
            );
          }
        } else {
          projectileMesh.visible = true;
          _vA.lerpVectors(projStart, projEnd, projTime);
          const arcHeight = actorSpec.domain === 'sea' ? 0.35 : 3.4;
          _vA.y += Math.sin(projTime * Math.PI) * arcHeight;
          projectileMesh.position.copy(_vA);
          projectileMesh.rotation.set(simTime * 12, -kin.yaw, 0);
        }
      }

      // Shockwave & Scan Rings
      if (shockTimer > 0) {
        if (simDt > 0) shockTimer = Math.max(0, shockTimer - simDt * 1.25);
        impactShockRing.loop.visible = true;
        const rad = 0.8 + (1.0 - shockTimer) * 7.8;
        impactShockRing.loop.position.copy(shockCenter);
        impactShockRing.loop.scale.set(rad, 1, rad);
        impactShockRing.mat.opacity = shockTimer * 0.92;
      } else {
        impactShockRing.loop.visible = false;
      }

      if (scanWaveTimer > 0) {
        if (simDt > 0) scanWaveTimer += simDt;
        if (scanWaveTimer > 2.2) {
          scanWaveTimer = 0;
          pulseScanWave.loop.visible = false;
        } else {
          pulseScanWave.loop.visible = true;
          const rad = 1.0 + scanWaveTimer * 22.0;
          pulseScanWave.loop.position.copy(scanOrigin);
          pulseScanWave.loop.scale.set(rad, 1, rad);
          pulseScanWave.mat.opacity = Math.max(0, 1.0 - scanWaveTimer / 2.2) * 0.95;
        }
      }

      // Particle Pool Update (frozen in mid-air during 0.01x Bullet-Time & 0.0x Path-Tracing!)
      if (simDt > 0) {
        const isSeaDomain = actorSpec.domain === 'sea';
        for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
          if (pLife[i] > 0) {
            pLife[i] -= simDt;
            if (pLife[i] <= 0) {
              pPositions[i * 3 + 1] = -999;
            } else {
              if (isSeaDomain) {
                pVel[i * 3 + 1] += 0.35 * simDt;
                pVel[i * 3] += Math.sin(simTime * 5.0 + i) * 0.28 * simDt;
                pVel[i * 3 + 2] += Math.cos(simTime * 4.7 + i) * 0.28 * simDt;
              }
              pPositions[i * 3] += pVel[i * 3] * simDt;
              pPositions[i * 3 + 1] += pVel[i * 3 + 1] * simDt;
              pPositions[i * 3 + 2] += pVel[i * 3 + 2] * simDt;
            }
          }
        }
        particleGeo.attributes.position.needsUpdate = true;
        particleGeo.attributes.color.needsUpdate = true;
      }

      for (let i = 0; i < wpRingMeshes.length; i++) {
        const isCurrentTarget = kin.autoPatrol && kin.activeWaypointIdx % wpRingMeshes.length === i;
        wpRingMeshes[i].rotation.y += simDt * (isCurrentTarget ? 2.6 : 0.8);
      }
      if (surfaceTex && actorSpec.domain === 'sea' && simDt > 0) {
        surfaceTex.offset.x = (simTime * 0.025) % 1;
        surfaceTex.offset.y = (simTime * 0.018) % 1;
      }

      // =======================================================================
      // CAMERA RIG: ORBITAL DROPFALL TRACKING / MICRO-FPV [C] / CHASE / FPV HUD
      // =======================================================================
      let activeFpvSegLabel = '';
      if (!rt.pathTracingEnabled) {
        const shakeMag = kin.trauma * kin.trauma * 0.24 * bulletState.simTimeScale;
        const shakeX = Math.sin(simTime * 53.0) * shakeMag;
        const shakeY = Math.cos(simTime * 47.0) * shakeMag;

        if (dropState.active && dropState.phase !== 'hydraulic_crouch_rise') {
          // Titanfall 2 Upward Tracking Camera during Supersonic Dive & 12m Retro-Burn!
          if (camera.near !== 0.05) {
            camera.near = 0.05;
            camera.up.set(0, 1, 0);
            camera.updateProjectionMatrix();
          }
          modelHolder.visible = true;
          const groundRefY =
            actorSpec.domain === 'land' ? sampleLandTerrainHeight(kin.x, kin.z) : kin.y;
          camera.position.set(
            kin.x - Math.cos(kin.yaw) * 6.8 + shakeX,
            groundRefY + 2.2 + shakeY,
            kin.z - Math.sin(kin.yaw) * 6.8
          );
          camera.lookAt(actorRoot.position.x, actorRoot.position.y + 0.8, actorRoot.position.z);
          camera.fov = 58;
          camera.updateProjectionMatrix();
        } else if (rt.microFpvActive) {
          modelHolder.visible = true;
          rt.microFpvPhase = (rt.microFpvPhase + realDt * 0.088) % 1.0;
          const localPose = evaluateMicroFpvSplinePose(fpvLocalWaypoints, rt.microFpvPhase, 0.72);
          activeFpvSegLabel = localPose.segmentLabel;

          _vA.set(localPose.position[0], localPose.position[1], localPose.position[2]);
          actorRoot.localToWorld(_vA);
          _vB.set(localPose.lookAt[0], localPose.lookAt[1], localPose.lookAt[2]);
          actorRoot.localToWorld(_vB);

          if (camera.near !== 0.002) {
            camera.near = 0.002;
            camera.fov = 64;
            camera.updateProjectionMatrix();
          }
          camera.position.copy(_vA);
          camera.up
            .set(localPose.up[0], localPose.up[1], localPose.up[2])
            .applyQuaternion(actorRoot.quaternion)
            .normalize();
          camera.lookAt(_vB);
        } else if (rt.camMode === 'fpv' && !bulletState.active) {
          if (camera.near !== 0.05) {
            camera.near = 0.05;
            camera.up.set(0, 1, 0);
            camera.updateProjectionMatrix();
          }
          modelHolder.visible = actorSpec.id === 'mars2020' || actorSpec.id === 'sar';
          const eyeHeight =
            actorSpec.domain === 'air' ? 0.55 : actorSpec.id === 'unitree_g1' ? 1.55 : 0.95;
          camera.position.set(
            kin.x + fx * 0.72 + shakeX * 0.4,
            actorRoot.position.y + eyeHeight + shakeY * 0.4,
            kin.z + fz * 0.72
          );
          camera.lookAt(
            kin.x + fx * 18.0,
            actorRoot.position.y + eyeHeight - kin.pitch * 8.0,
            kin.z + fz * 18.0
          );
          const targetFov = kin.isBoosting ? 68 : 60;
          camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-7 * realDt));
          camera.updateProjectionMatrix();
        } else if (rt.directorCamMode !== 'off' || ultimateSkill.active) {
          if (camera.near !== 0.05) {
            camera.near = 0.05;
          }
          modelHolder.visible = true;
          const dPose = computeDirectorCameraPose({
            mode: rt.directorCamMode,
            anchorX: kin.x,
            anchorY: actorRoot.position.y + modelHeightSpan * 0.45 + modelHolder.position.y * 0.88,
            anchorZ: kin.z,
            actorYaw: kin.yaw,
            modelRadius: actorSpec.domain === 'air' ? 2.65 : 2.15,
            elapsed: realElapsed,
            ultimateActive: ultimateSkill.active,
            ultimateProgress01: ultimateSkill.progress01
          });
          let desiredCamY = dPose.position[1] + shakeY;
          if (actorSpec.domain === 'land') {
            const camGround = sampleLandTerrainHeight(dPose.position[0], dPose.position[2]) + 0.55;
            desiredCamY = Math.max(camGround, desiredCamY);
          }
          const dLerp = 1 - Math.exp(-8.5 * realDt);
          camera.position.x += (dPose.position[0] + shakeX - camera.position.x) * dLerp;
          camera.position.y += (desiredCamY - camera.position.y) * dLerp;
          camera.position.z += (dPose.position[2] - camera.position.z) * dLerp;
          camera.up.set(dPose.up[0], dPose.up[1], dPose.up[2]).normalize();
          _vB.set(dPose.lookAt[0], dPose.lookAt[1], dPose.lookAt[2]);
          camera.lookAt(_vB);
          camera.fov += (dPose.fovDeg - camera.fov) * (1 - Math.exp(-8 * realDt));
          camera.updateProjectionMatrix();
        } else {
          camera.near = 0.05;
          camera.up.set(0, 1, 0);
          modelHolder.visible = true;
          const baseDist = actorSpec.domain === 'air' ? 6.4 : rt.swarmOpsEnabled ? 7.2 : 5.2;
          const chaseDist = bulletState.active ? 4.45 : baseDist;
          const chaseHeight = bulletState.active ? 1.95 : actorSpec.domain === 'air' ? 2.1 : 2.35;
          const camOrbitYaw = kin.yaw + bulletState.orbitYawOffset;
          const cFx = Math.cos(camOrbitYaw);
          const cFz = Math.sin(camOrbitYaw);

          const desiredCamX = kin.x - cFx * chaseDist + shakeX;
          const desiredCamZ = kin.z - cFz * chaseDist;
          let desiredCamY = actorRoot.position.y + chaseHeight + shakeY;
          if (actorSpec.domain === 'land') {
            const camGround = sampleLandTerrainHeight(desiredCamX, desiredCamZ) + 0.85;
            desiredCamY = Math.max(camGround, desiredCamY);
          }

          const camLerp = 1 - Math.exp(-6.5 * realDt);
          camera.position.x += (desiredCamX - camera.position.x) * camLerp;
          camera.position.y += (desiredCamY - camera.position.y) * camLerp;
          camera.position.z += (desiredCamZ - camera.position.z) * camLerp;

          if (bulletState.active) {
            _vB.set(kin.x, actorRoot.position.y + 0.65, kin.z);
          } else {
            _vB.set(kin.x + fx * 2.2, actorRoot.position.y + 0.85, kin.z + fz * 2.2);
          }
          camera.lookAt(_vB);

          const speedRatio = Math.min(1.2, Math.abs(kin.speed) / Math.max(1, actorSpec.boostSpeed));
          const targetFov = bulletState.active
            ? 46
            : 50 + speedRatio * 14 + (kin.isBoosting ? 5 : 0);
          camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-6 * realDt));
          camera.updateProjectionMatrix();
        }
      }

      // =======================================================================
      // UPDATE DEATH STRANDING ODRADEK 2,500-POINT GPU MATRIX & AAA SCENE VFX!
      // =======================================================================
      if (odradekSensorJointIdx >= 0 && odradekSensorJointIdx < boundJoints.length) {
        boundJoints[odradekSensorJointIdx].node.getWorldPosition(odradekSensorWorld);
      } else {
        odradekSensorWorld.set(
          actorRoot.position.x + fx * 0.35,
          actorRoot.position.y + modelHeightSpan * 0.82,
          actorRoot.position.z + fz * 0.35
        );
      }

      if (terrainWaveUniforms) {
        terrainWaveUniforms.uOdradekActive.value = odradekElapsed > 0 ? 1.0 : 0.0;
        terrainWaveUniforms.uOdradekOrigin.value.copy(odradekOrigin);
        terrainWaveUniforms.uOdradekElapsed.value = odradekElapsed;
        terrainWaveUniforms.uSimTime.value = realElapsed;
      }

      if (odradekElapsed > 0) {
        const wingmenList: { id: string; label: string; x: number; y: number; z: number }[] = [];
        if (rt.swarmOpsEnabled) {
          loadedWingmen.forEach((inst, wid) => {
            if (inst.root.visible) {
              wingmenList.push({
                id: wid,
                label: wid.toUpperCase(),
                x: inst.root.position.x,
                y: inst.root.position.y,
                z: inst.root.position.z
              });
            }
          });
        }
        activeOdradekBeacons = evaluateOdradekTargetBeacons({
          scanElapsed: odradekElapsed,
          scanOrigin: [odradekOrigin.x, odradekOrigin.y, odradekOrigin.z],
          actorPos: [kin.x, actorRoot.position.y, kin.z],
          domain: actorSpec.domain,
          waypoints,
          obstacles: arenaObstacles,
          wingmenPositions: wingmenList
        });
      } else {
        activeOdradekBeacons = [];
      }

      odradekCtrl.updateFrame({
        active: odradekElapsed > 0,
        scanElapsed: odradekElapsed,
        domain: actorSpec.domain,
        camera,
        sensorWorldPos: odradekSensorWorld,
        flareIntensity: odradekSnap.flareIntensity,
        beacons: activeOdradekBeacons
      });

      const activePatrolWp = waypoints[kin.activeWaypointIdx % waypoints.length];
      const patrolTargetVec = activePatrolWp
        ? _vB.set(activePatrolWp.x, activePatrolWp.y, activePatrolWp.z)
        : null;
      const groundHAtActor =
        actorSpec.domain === 'land'
          ? sampleLandTerrainHeight(kin.x, kin.z)
          : actorSpec.domain === 'sea'
            ? sampleSeabedHeight(kin.x, kin.z)
            : kin.y - 1.5;

      const spineTelem = computeDiegeticSpineTelemetry({
        throttlePct: kin.throttlePct,
        heatPct: overheatState.heatPct,
        speedNorm: Math.min(1.0, Math.abs(kin.speed) / Math.max(1.0, actorSpec.boostSpeed)),
        fireCooldownTimer: fireAnimTimer
      });

      aaaSandboxFx.updateSandboxAaaFX({
        dt: vfxWallDt,
        simTime: realElapsed,
        actorWorldPos: actorRoot.position,
        actorGroundY: groundHAtActor,
        actorYaw: kin.yaw,
        modelHeightSpan,
        speedMetersPerSec: kin.speed,
        yawRateRadS: instYawRate,
        dropState,
        overheatState,
        patrolRibbonActive: kin.autoPatrol,
        patrolTargetWorld: patrolTargetVec,
        sampleGroundHeight:
          actorSpec.domain === 'land'
            ? sampleLandTerrainHeight
            : actorSpec.domain === 'sea'
              ? sampleSeabedHeight
              : () => kin.y - 0.5,
        diegeticHudActive: rt.diegeticHudActive,
        spineTelemetry: spineTelem,
        cameraWorldPos: camera.position,
        cameraQuaternion: camera.quaternion
      });

      signatureSandboxFx.updateSandboxInteractiveFX({
        skill: ultimateSkill,
        actorWorld: actorRoot.position,
        actorGroundY: groundHAtActor,
        modelRadius: Math.max(1.25, modelHeightSpan),
        accentHex: getRobotUltimateMeta(actorSpec.id).accentHex,
        targets: interactiveTargets,
        lockedTargetId: tacticalScore.lockedTargetId,
        rallyPoint,
        simTime: realElapsed
      });

      // =======================================================================
      // DUAL-GEAR HYBRID RAY-TRACING & 256-SPP PROGRESSIVE PATH TRACER RENDER
      // =======================================================================
      const executeSandboxRender = () =>
        rayTracer.renderFrame({
          scene,
          camera,
          keyLight,
          rimLight,
          pathTracingEnabled: rt.pathTracingEnabled,
          explosionProgress: expProg,
          clipRatio: 1.0,
          poseChecksum,
          emissiveSources,
          dynamicEmissives,
          schlierenMode: rt.windTunnelConfig.schlierenMode,
          simTime: realElapsed
        });

      renderOnceRef.current = () => {
        executeSandboxRender();
      };
      const ptRes = executeSandboxRender();

      // Direct 60Hz DOM Telemetry & Fault Harmonic Mini-Oscilloscope Mutation!
      if (speedDomRef.current) {
        const dispKmh =
          actorSpec.domain === 'air'
            ? Math.round(kin.machNumber * 1062 * faultAttitude.speedMultiplier)
            : Math.round(Math.abs(kin.speed) * 3.6 * faultAttitude.speedMultiplier);
        speedDomRef.current.textContent = `${dispKmh}`;
      }
      if (secMetricDomRef.current) {
        if (bulletState.active) {
          secMetricDomRef.current.textContent = `TIME 0.01x · EXP ${Math.round(expProg * 100)}%`;
        } else if (actorSpec.domain === 'air') {
          secMetricDomRef.current.textContent = `MACH ${kin.machNumber.toFixed(2)}`;
        } else if (actorSpec.domain === 'sea') {
          secMetricDomRef.current.textContent = `DEPTH ${kin.depthMeters.toFixed(0)}m`;
        } else {
          secMetricDomRef.current.textContent = `ALT ${(1420 + kin.y * 4.5).toFixed(0)}m`;
        }
      }
      if (headingDomRef.current) {
        const deg = ((((kin.yaw * 180) / Math.PI) % 360) + 360) % 360;
        headingDomRef.current.textContent = `HDG ${deg.toFixed(0).padStart(3, '0')}°`;
      }
      if (throttleBarDomRef.current) {
        throttleBarDomRef.current.style.transform = `scaleX(${Math.max(0.05, kin.throttlePct / 100)})`;
      }
      if (faultOscPathRef.current && rt.activeFaults.length > 0) {
        let d = '';
        for (let k = 0; k < 28; k++) {
          const val = computeFaultOscilloscopeHarmonic(
            0.5,
            realElapsed - (27 - k) * 0.02,
            true,
            0
          );
          const x = (k / 27) * 196;
          const y = 22 - val * 20;
          d += k === 0 ? `M${x.toFixed(1)},${y.toFixed(1)}` : ` L${x.toFixed(1)},${y.toFixed(1)}`;
        }
        faultOscPathRef.current.setAttribute('d', d);
      }

      // Throttled ~10Hz Projected Badges, FLIR Lock-Box, Fault Probe & SPP Sync
      if (now - lastHudBadgeSync > 0.1) {
        lastHudBadgeSync = now;
        const w = container.clientWidth || 1280;
        const h = container.clientHeight || 760;
        setPtSpp(ptRes.spp);
        setSlsActive(rt.slsRelState.active);
        setTotalPowerWatts(mpcPowerWatts);
        setOdradekActive(odradekElapsed > 0);
        setOrbitalDropActive(dropState.active);
        setOverheatVentingUI(overheatState.ventingActive);
        setHeatPctUI(Math.round(overheatState.heatPct));
        setWeatheringDirtyUI(
          weatheringState.marsDust > 0.08 ||
            weatheringState.intakeFrost > 0.08 ||
            weatheringState.titaniumHeatBluing > 0.08
        );
        if (rt.microFpvActive) {
          setMicroFpvSegmentLabel(activeFpvSegLabel);
        }
        setUltimateHudState({
          active: ultimateSkill.active,
          phaseLabel: ultimateSkill.phaseLabel,
          progressPct: Math.round(ultimateSkill.progress01 * 100)
        });
        const lockedObj = tacticalScore.lockedTargetId
          ? interactiveTargets.find((t) => t.id === tacticalScore.lockedTargetId && t.alive) || null
          : null;
        setTacticalHudSummary({
          destroyedCount: tacticalScore.destroyedCount,
          comboCount: tacticalScore.comboCount,
          rallyActive: Boolean(rallyPoint?.active),
          lockedTarget: lockedObj
            ? {
                codeName: lockedObj.codeName,
                roleLabel: lockedObj.roleLabel,
                shieldPct: Math.round((lockedObj.shield / Math.max(1, lockedObj.maxShield)) * 100),
                hpPct: Math.round((lockedObj.hp / Math.max(1, lockedObj.maxHp)) * 100),
                distMeters: Math.round(
                  Math.hypot(lockedObj.x - kin.x, lockedObj.y - kin.y, lockedObj.z - kin.z)
                )
              }
            : null
        });

        // Project 3D Fault Callout Anchor (O(1) localToWorld — zero high-poly Box3 traversal!)
        if (rt.activeFaults.length > 0 && cadParts.length > 0) {
          const lf = rt.activeFaults[rt.activeFaults.length - 1];
          const fp = cadParts.find((c) => c.partName === lf.partName);
          if (fp) {
            _vA.copy(fp.geomLocalCenter);
            fp.mesh.localToWorld(_vA);
            _vA.project(camera);
            if (_vA.z >= -1 && _vA.z <= 1) {
              setFaultAnchorScreen([(_vA.x * 0.5 + 0.5) * w, (-_vA.y * 0.5 + 0.5) * h]);
            }
          }
        }

        const showTargets =
          odradekElapsed > 0 ||
          scanWaveTimer > 0 ||
          kin.autoPatrol ||
          rt.visionMode === 'flir' ||
          rt.swarmOpsEnabled;
        if (showTargets) {
          const nextBadges: ProjectedTargetBadge[] = [];

          // 1) Death Stranding Odradek Minimalist Cold Callouts on Chiral Target Beacons!
          if (odradekElapsed > 0 && activeOdradekBeacons.length > 0) {
            for (const bc of activeOdradekBeacons) {
              _vA.set(bc.x, bc.y + 2.35, bc.z);
              _vA.project(camera);
              if (_vA.z >= -1 && _vA.z <= 1) {
                const sx = Math.max(96, Math.min(w - 96, (_vA.x * 0.5 + 0.5) * w));
                const sy = Math.max(76, Math.min(h - 115, (-_vA.y * 0.5 + 0.5) * h));
                nextBadges.push({
                  id: bc.id,
                  label: bc.title,
                  distMeters: Math.round(bc.slantRangeMeters),
                  azimuthDeg: 0,
                  screenX: sx,
                  screenY: sy,
                  locked: true,
                  odradekMinimalistTag: bc.formattedTag,
                  isChiralGold: bc.category !== 'wingman'
                });
              }
            }
          } else {
            waypoints.forEach((wp, idx) => {
              const isPatrolTarget =
                (kin.autoPatrol && kin.activeWaypointIdx % waypoints.length === idx) ||
                (rt.visionMode === 'flir' && idx === 0);
              if (!scanWaveTimer && !rt.visionMode && !isPatrolTarget) return;
              _vA.set(wp.x, wp.y + 1.2, wp.z);
              const dist = Math.hypot(wp.x - kin.x, wp.y - kin.y, wp.z - kin.z);
              const az =
                ((((Math.atan2(wp.z - kin.z, wp.x - kin.x) * 180) / Math.PI) % 360) + 360) % 360;
              _vA.project(camera);
              if (_vA.z >= -1 && _vA.z <= 1) {
                const sx = (_vA.x * 0.5 + 0.5) * w;
                const sy = (-_vA.y * 0.5 + 0.5) * h;
                if (sx > 40 && sx < w - 40 && sy > 60 && sy < h - 90) {
                  nextBadges.push({
                    id: wp.id,
                    label: wp.label,
                    distMeters: Math.round(dist * 3.5),
                    azimuthDeg: Math.round(az),
                    screenX: sx,
                    screenY: sy,
                    locked: isPatrolTarget
                  });
                }
              }
            });
          }
          setTargetBadges(nextBadges);
        } else {
          setTargetBadges([]);
        }
      }

      if (isSoftwareGl) afterDraw(tick);
      else frameId = requestAnimationFrame(tick);
    }

    frameId = requestAnimationFrame(tick);

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || 1280;
      const h = container.clientHeight || 760;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      rayTracer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearHeldInputs);
      window.removeEventListener('resize', handleResize);
      odradekCtrl.dispose();
      aaaSandboxFx.dispose();
      signatureSandboxFx.dispose();
      magSlsRig.dispose();
      mpcPowerCtrl.dispose();
      disasterFx.dispose();
      strobeController.dispose();
      bulletTraceController.dispose();
      swarmFxController.dispose();
      visionFxController.dispose();
      ikPlasmaController.dispose();
      rayTracer.dispose();
      rayTracerRef.current = null;
      surfaceTex?.dispose();
      fbmCloudTex?.dispose();
      softParticleTex.dispose();
      envTex.dispose();
      renderer.dispose();
    };
  }, [actorSpec, waypoints, glbReloadNonce]);

  const latestFault = activeFaults[activeFaults.length - 1] || null;
  const anyOverlayMenuOpen = actorMenuOpen || visionMenuOpen || fxDrawerOpen;

  const fxItemCls = (active: boolean, warnTone = false) =>
    `px-2.5 py-1.5 rounded-lg text-[11px] font-mono border flex items-center justify-between gap-1.5 transition cursor-pointer whitespace-nowrap ${
      active
        ? warnTone
          ? 'bg-amber-500/15 border-amber-400/75 text-amber-100 font-semibold'
          : 'bg-cyan-500/15 border-[#00e5ff]/75 text-cyan-100 font-semibold'
        : 'bg-[#0c1320]/90 border-white/10 text-slate-300 hover:border-white/25 hover:text-white'
    }`;

  const fxDot = (active: boolean, warnTone = false) => (
    <span
      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
        active ? (warnTone ? 'bg-amber-400' : 'bg-[#00e5ff]') : 'bg-slate-600'
      }`}
    />
  );

  return (
    <div
      data-testid="action-sandbox-root"
      data-diegetic-hud={diegeticHudActive ? 'active' : 'off'}
      className="relative w-full h-full bg-[#050912] overflow-hidden select-none"
    >
      {/* Dedicated WebGL Mount */}
      <div ref={canvasMountRef} className="w-full h-full" data-testid="action-sandbox-canvas" />

      {/* WHEN DIEGETIC 3D SPINE HUD [KEY U] IS ACTIVE: 100% ZERO 2D DOM BORDERS, PANELS OR TEXT! */}
      {!diegeticHudActive && (
        <>
          {/* FPV Aiming Crosshair OR Military FLIR White-Hot Pod Targeting Reticle */}
          {(camMode === 'fpv' || visionMode === 'flir') && (
            <div
              className="fixed inset-0 pointer-events-none flex items-center justify-center z-10"
              aria-hidden="true"
            >
              <svg width="310" height="310" viewBox="0 0 310 310" className="opacity-90">
                <rect
                  x="55"
                  y="55"
                  width="200"
                  height="200"
                  fill="none"
                  stroke={visionMode === 'flir' ? '#f8fafc' : '#00e5ff'}
                  strokeWidth="1.3"
                  strokeDasharray="18 142 18 0"
                />
                <circle
                  cx="155"
                  cy="155"
                  r="52"
                  fill="none"
                  stroke={visionMode === 'flir' ? '#e2e8f0' : '#00e5ff'}
                  strokeWidth="1.1"
                  strokeDasharray="8 6"
                />
                <path
                  d="M110 155 H140 M170 155 H200 M155 110 V140 M155 170 V200"
                  stroke={visionMode === 'flir' ? '#ffffff' : '#00e5ff'}
                  strokeWidth="1.5"
                />
                <circle
                  cx="155"
                  cy="155"
                  r="2.2"
                  fill={visionMode === 'flir' ? '#f59e0b' : '#00e5ff'}
                />
              </svg>
              {visionMode === 'flir' && (
                <div className="absolute mt-64 px-2.5 py-0.5 rounded bg-[#0a101a]/90 border border-white/20 text-[10px] font-mono text-slate-100 tracking-wider">
                  FLIR WHITE-HOT POD · LASER DESIG 1688
                </div>
              )}
            </div>
          )}

          {/* Projected 3D Odradek Minimalist Callouts, Waypoint Locks & Fault Probe (auto-dimmed when menus open!) */}
          <div
            className={`absolute inset-0 pointer-events-none overflow-hidden z-10 transition-opacity duration-150 ${
              anyOverlayMenuOpen ? 'opacity-10' : 'opacity-100'
            }`}
            aria-hidden="true"
          >
            {targetBadges
              .filter(
                (b) =>
                  Boolean(b.odradekMinimalistTag) ||
                  odradekActive ||
                  visionMode === 'flir' ||
                  b.locked
              )
              .map((b) =>
                b.odradekMinimalistTag ? (
                  <div
                    key={b.id}
                    data-testid="odradek-beacon-tag"
                    style={{
                      transform: `translate3d(${Math.round(b.screenX - 110)}px, ${Math.round(b.screenY - 22)}px, 0)`
                    }}
                    className={`absolute top-0 left-0 px-2 py-0.5 rounded border bg-[#0a101a]/90 text-[10px] font-mono tracking-wider tabular-nums shadow-xl whitespace-nowrap ${
                      b.isChiralGold
                        ? 'border-amber-400/60 text-amber-200'
                        : 'border-[#00e5ff]/60 text-cyan-100'
                    }`}
                  >
                    {b.odradekMinimalistTag}
                  </div>
                ) : (
                  <div
                    key={b.id}
                    style={{
                      transform: `translate3d(${Math.round(b.screenX - 72)}px, ${Math.round(b.screenY - 28)}px, 0)`
                    }}
                    className={`absolute top-0 left-0 px-2 py-0.5 rounded border bg-[#0a101a]/90 text-[10px] font-mono tabular-nums shadow-lg ${
                      visionMode === 'flir'
                        ? 'border-white/60 text-white'
                        : b.locked
                          ? 'border-amber-400/70 text-amber-200'
                          : 'border-[#00e5ff]/50 text-slate-200'
                    }`}
                  >
                    <div className="font-semibold">{b.label}</div>
                    <div className="text-[9px] text-cyan-300">
                      RNG {b.distMeters}m · AZ {String(b.azimuthDeg).padStart(3, '0')}°
                    </div>
                  </div>
                )
              )}

            {latestFault && faultAnchorScreen && (
              <div
                data-testid="sandbox-fault-3d-probe"
                style={{
                  transform: `translate3d(${Math.round(faultAnchorScreen[0] + 56)}px, ${Math.round(faultAnchorScreen[1] - 96)}px, 0)`
                }}
                className="absolute top-0 left-0 px-2.5 py-1.5 rounded-lg bg-[#0a101a]/95 border border-amber-400/75 text-slate-100 text-[10px] font-mono shadow-2xl max-w-[250px]"
              >
                <div className="font-bold text-amber-300">{latestFault.alertTitle}</div>
                <div className="text-slate-300 mt-0.5 truncate">PART: {latestFault.partName}</div>
                <div className="text-cyan-300 mt-0.5">{latestFault.compensationLaw}</div>
              </div>
            )}
          </div>

          {/* Minimalist Industrial Dark Glass HUD (>= 85% Unobstructed Viewport!) */}
          <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-3 z-20">
            {/* TOP PERIMETER: Left Telemetry + Actor Dropdown | Right Toast + Vision/FX/Exit */}
            <div className="flex items-start justify-between gap-3">
              {/* Top-Left: Compact Telemetry Card + Actor Switcher Dropdown */}
              <div className="pointer-events-auto flex items-start gap-2">
                <div className="bg-[#0a101a]/90 border border-white/10 rounded-xl px-3 py-2 shadow-2xl min-w-[205px]">
                  <div className="flex items-center justify-between gap-2 text-[10px] font-mono text-slate-400">
                    <span className="truncate">{actorSpec.domainBadge}</span>
                    <span ref={headingDomRef} className="text-cyan-300 font-semibold tabular-nums">
                      HDG 000°
                    </span>
                  </div>
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <span
                      ref={speedDomRef}
                      className="text-2xl font-mono font-bold tabular-nums text-white tracking-tight"
                    >
                      0
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">KM/H</span>
                    <span
                      ref={secMetricDomRef}
                      className="ml-auto text-xs font-mono font-semibold tabular-nums text-slate-200"
                    >
                      ALT 1420m
                    </span>
                  </div>
                  <div className="h-1 w-full bg-slate-900 rounded-full overflow-hidden mt-1.5">
                    <div
                      ref={throttleBarDomRef}
                      style={{ transform: 'scaleX(0.15)', transformOrigin: 'left' }}
                      className="h-full w-full bg-[#00e5ff]"
                    />
                  </div>

                  {/* Odradek Matrix Readout ONLY on Land & Sea (strict airspace isolation!) */}
                  {odradekActive && odradekTierSummary && actorSpec.domain !== 'air' && (
                    <div
                      data-testid="odradek-matrix-readout"
                      className="mt-1.5 pt-1 border-t border-white/10 flex items-center justify-between text-[9px] font-mono tabular-nums"
                    >
                      <span className="text-cyan-300">平坦 {odradekTierSummary.safeBlue}</span>
                      <span className="text-amber-300">△陡坡 {odradekTierSummary.warnYellow}</span>
                      <span className="text-rose-300">✕禁区 {odradekTierSummary.dangerRed}</span>
                    </div>
                  )}

                  {/* Interactive Tactical Target Lock & Score / Combo Readout */}
                  {(tacticalHudSummary.destroyedCount > 0 ||
                    tacticalHudSummary.comboCount > 0 ||
                    tacticalHudSummary.lockedTarget ||
                    tacticalHudSummary.rallyActive) && (
                    <div
                      data-testid="sandbox-tactical-target-card"
                      className="mt-1.5 pt-1 border-t border-white/10 space-y-1 text-[9px] font-mono tabular-nums"
                    >
                      <div className="flex items-center justify-between text-slate-300">
                        <span>击破 {tacticalHudSummary.destroyedCount}</span>
                        {tacticalHudSummary.comboCount > 0 && (
                          <span className="text-amber-300 font-semibold">
                            连击 x{tacticalHudSummary.comboCount}
                          </span>
                        )}
                        {tacticalHudSummary.rallyActive && (
                          <span className="text-cyan-300">信标导航中</span>
                        )}
                      </div>
                      {tacticalHudSummary.lockedTarget && (
                        <div className="space-y-0.5">
                          <div className="flex items-center justify-between text-cyan-200">
                            <span className="truncate max-w-[135px]">
                              {tacticalHudSummary.lockedTarget.codeName}
                            </span>
                            <span>{tacticalHudSummary.lockedTarget.distMeters}m</span>
                          </div>
                          <div className="h-1 w-full bg-slate-900 rounded-full overflow-hidden">
                            <div
                              style={{
                                transform: `scaleX(${tacticalHudSummary.lockedTarget.shieldPct / 100})`,
                                transformOrigin: 'left'
                              }}
                              className="h-full w-full bg-[#00e5ff]"
                            />
                          </div>
                          <div className="h-1 w-full bg-slate-900 rounded-full overflow-hidden">
                            <div
                              style={{
                                transform: `scaleX(${tacticalHudSummary.lockedTarget.hpPct / 100})`,
                                transformOrigin: 'left'
                              }}
                              className="h-full w-full bg-amber-400"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {latestFault && (
                    <div
                      data-testid="sandbox-fault-oscilloscope"
                      className="mt-1.5 pt-1.5 border-t border-amber-400/30 space-y-0.5"
                    >
                      <div className="flex items-center justify-between text-[9px] font-mono text-amber-300 font-semibold">
                        <span>60Hz HARMONIC</span>
                        <span>LIMP-HOME</span>
                      </div>
                      <svg
                        width="196"
                        height="20"
                        className="w-full h-5 bg-[#060a12] rounded border border-white/10"
                      >
                        <path
                          ref={faultOscPathRef}
                          d="M0,10 L196,10"
                          fill="none"
                          stroke="#f59e0b"
                          strokeWidth="1.4"
                        />
                      </svg>
                    </div>
                  )}

                  {isLoadingModel && (
                    <div className="text-[10px] font-mono text-cyan-300 mt-1">
                      正在加载真机 GLB 与 URDF 关节...
                    </div>
                  )}

                  {glbLoadError && !isLoadingModel && (
                    <div className="mt-1.5 flex items-center gap-2 bg-[#0c1320] border border-amber-400/60 rounded-lg px-2 py-1 text-[10px] text-amber-200">
                      <span>GLB 传输中断</span>
                      <button
                        type="button"
                        data-testid="sandbox-retry-glb-btn"
                        onClick={() => setGlbReloadNonce((n) => n + 1)}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-400 text-amber-100 font-semibold cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        重试
                      </button>
                    </div>
                  )}
                </div>

                {/* Actor Dropdown Selector */}
                <div className="relative z-50">
                  <button
                    type="button"
                    data-testid="sandbox-actor-dropdown-btn"
                    aria-expanded={actorMenuOpen}
                    onClick={(e) => {
                      e.currentTarget.blur();
                      setActorMenuOpen((v) => !v);
                      setVisionMenuOpen(false);
                      setFxDrawerOpen(false);
                    }}
                    className={`px-3 py-2 rounded-xl border text-xs font-mono flex items-center gap-2 shadow-2xl transition cursor-pointer whitespace-nowrap ${
                      actorMenuOpen
                        ? 'bg-[#0a101a]/95 border-[#00e5ff]/75 text-cyan-100 font-semibold'
                        : 'bg-[#0a101a]/90 border-white/10 text-slate-200 hover:border-white/25'
                    }`}
                  >
                    <span>切换出战真机：{actorSpec.shortName}</span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-cyan-300 transition-transform ${
                        actorMenuOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {actorMenuOpen && (
                    <div
                      data-testid="sandbox-actor-dropdown-menu"
                      className="absolute top-full left-0 mt-1.5 w-64 bg-[#0a101a]/95 border border-white/15 rounded-xl p-1.5 shadow-2xl z-50 space-y-1"
                    >
                      {SANDBOX_ACTORS.map((item) => {
                        const active = item.id === actorSpec.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            data-testid={`sandbox-actor-${item.id}`}
                            onClick={(e) => {
                              e.currentTarget.blur();
                              setActorSpec(item);
                              setActorMenuOpen(false);
                            }}
                            className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-mono border flex items-center justify-between transition cursor-pointer ${
                              active
                                ? 'bg-cyan-500/15 border-[#00e5ff]/75 text-cyan-100 font-semibold'
                                : 'bg-transparent border-transparent text-slate-300 hover:bg-white/5 hover:text-white'
                            }`}
                          >
                            <span className="truncate">{item.shortName}</span>
                            {fxDot(active)}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Top-Right: Vision Dropdown + Auxiliary FX Drawer + Mute + Exit + 2.5s Micro-Toast */}
              <div className="pointer-events-auto flex flex-col items-end gap-1.5 z-50">
                <div className="flex items-center gap-1.5">
                  {/* Camera & Machine-Eye Vision Dropdown [V] */}
                  <div className="relative">
                    <button
                      type="button"
                      data-testid="sandbox-cam-toggle"
                      aria-expanded={visionMenuOpen}
                      onClick={(e) => {
                        e.currentTarget.blur();
                        setVisionMenuOpen((v) => !v);
                        setActorMenuOpen(false);
                        setFxDrawerOpen(false);
                      }}
                      className={`px-2.5 py-1.5 rounded-xl border text-xs font-mono flex items-center gap-1.5 shadow-xl transition cursor-pointer whitespace-nowrap ${
                        visionMenuOpen || camMode === 'fpv' || visionMode !== 'normal'
                          ? 'bg-[#0a101a]/95 border-[#00e5ff]/75 text-cyan-100 font-semibold'
                          : 'bg-[#0a101a]/90 border-white/10 text-slate-200 hover:border-white/25'
                      }`}
                      title="切换追尾 / 瞄准镜 FPV / 机器原生视觉谱系 (快捷键 V)"
                    >
                      <Eye className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
                      <span>
                        {visionMode !== 'normal'
                          ? `视觉: ${visionMode.toUpperCase()} [V]`
                          : camMode === 'fpv'
                            ? '瞄准镜 FPV [V]'
                            : '视角/视觉 [V]'}
                      </span>
                      <ChevronDown className="w-3 h-3 text-slate-400" />
                    </button>

                    {visionMenuOpen && (
                      <div
                        data-testid="sandbox-vision-switcher"
                        className="absolute top-full right-0 mt-1.5 w-52 bg-[#0a101a]/95 border border-white/15 rounded-xl p-1.5 shadow-2xl z-50 space-y-1"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setCamMode((m) => (m === 'chase' ? 'fpv' : 'chase'));
                            setVisionMenuOpen(false);
                          }}
                          className={fxItemCls(camMode === 'fpv')}
                        >
                          <span>{camMode === 'fpv' ? '切回追尾视角' : '切至第一人称 FPV'}</span>
                          {fxDot(camMode === 'fpv')}
                        </button>
                        <button
                          type="button"
                          data-testid="sandbox-director-cam-btn"
                          onClick={() => {
                            cycleDirectorCamAction();
                          }}
                          className={fxItemCls(directorCamMode !== 'off')}
                        >
                          <span>
                            {directorCamMode === 'off'
                              ? '导演环绕运镜 [K]'
                              : `${getDirectorModeLabel(directorCamMode)} [K]`}
                          </span>
                          {fxDot(directorCamMode !== 'off')}
                        </button>
                        <button
                          type="button"
                          data-testid="vision-mode-normal"
                          onClick={() => {
                            setVisionMode('normal');
                            setVisionMenuOpen(false);
                          }}
                          className={fxItemCls(visionMode === 'normal')}
                        >
                          <span>标准光学视觉</span>
                          {fxDot(visionMode === 'normal')}
                        </button>
                        <button
                          type="button"
                          data-testid="vision-mode-slam"
                          onClick={() => {
                            setVisionMode((v) => (v === 'slam' ? 'normal' : 'slam'));
                            setVisionMenuOpen(false);
                          }}
                          className={fxItemCls(visionMode === 'slam')}
                        >
                          <span>激光点云 SLAM</span>
                          {fxDot(visionMode === 'slam')}
                        </button>
                        <button
                          type="button"
                          data-testid="vision-mode-flir"
                          onClick={() => {
                            setVisionMode((v) => (v === 'flir' ? 'normal' : 'flir'));
                            setVisionMenuOpen(false);
                          }}
                          className={fxItemCls(visionMode === 'flir')}
                        >
                          <span>白热红外 FLIR</span>
                          {fxDot(visionMode === 'flir')}
                        </button>
                        <button
                          type="button"
                          data-testid="vision-mode-acoustic"
                          onClick={() => {
                            setVisionMode((v) => (v === 'acoustic' ? 'normal' : 'acoustic'));
                            setVisionMenuOpen(false);
                          }}
                          className={fxItemCls(visionMode === 'acoustic')}
                        >
                          <span>深海声学回波</span>
                          {fxDot(visionMode === 'acoustic')}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Auxiliary FX & Embodied Lab Drawer (Collapsed by default!) */}
                  <div className="relative">
                    <button
                      type="button"
                      data-testid="sandbox-fx-drawer-btn"
                      aria-expanded={fxDrawerOpen}
                      onClick={(e) => {
                        e.currentTarget.blur();
                        setFxDrawerOpen((v) => !v);
                        setActorMenuOpen(false);
                        setVisionMenuOpen(false);
                      }}
                      className={`px-2.5 py-1.5 rounded-xl border text-xs font-mono flex items-center gap-1.5 shadow-xl transition cursor-pointer whitespace-nowrap ${
                        fxDrawerOpen ||
                        pathTracingEnabled ||
                        swarmOpsEnabled ||
                        ikEnabled ||
                        activeFaults.length > 0 ||
                        windTunnelConfig.schlierenMode
                          ? 'bg-[#0a101a]/95 border-[#00e5ff]/75 text-cyan-100 font-semibold'
                          : 'bg-[#0a101a]/90 border-white/10 text-slate-200 hover:border-white/25'
                      }`}
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
                      <span>辅助特效</span>
                      <ChevronDown
                        className={`w-3 h-3 text-slate-400 transition-transform ${
                          fxDrawerOpen ? 'rotate-180' : ''
                        }`}
                      />
                    </button>

                    {fxDrawerOpen && (
                      <div
                        data-testid="sandbox-hall-of-fame-bar"
                        className="absolute top-full right-0 mt-1.5 w-[440px] max-w-[92vw] bg-[#0a101a]/95 border border-white/15 rounded-xl p-3 shadow-2xl z-50 space-y-2.5"
                      >
                        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                          <span>01. 机动入场、编队与具身容错实验</span>
                          <button
                            type="button"
                            onClick={() => setFxDrawerOpen(false)}
                            className="text-slate-400 hover:text-white cursor-pointer"
                          >
                            收起
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            type="button"
                            data-testid="sandbox-orbital-drop-btn"
                            onClick={() => {
                              triggerOrbitalDropAction();
                              setFxDrawerOpen(false);
                            }}
                            className={fxItemCls(orbitalDropActive)}
                          >
                            <span className="flex items-center gap-1.5 truncate">
                              <ArrowDownToLine className="w-3 h-3 text-cyan-300 shrink-0" />
                              <span>轨道空投部署 [T]</span>
                            </span>
                            {fxDot(orbitalDropActive)}
                          </button>

                          <button
                            type="button"
                            data-testid="sandbox-auto-drop-toggle"
                            onClick={() => setAutoOrbitalDropOnSwitch((v) => !v)}
                            className={fxItemCls(autoOrbitalDropOnSwitch)}
                          >
                            <span>切机默认空投</span>
                            {fxDot(autoOrbitalDropOnSwitch)}
                          </button>

                          <button
                            type="button"
                            data-testid="sandbox-toggle-strobe"
                            onClick={() => setStrobeEnabled((s) => !s)}
                            className={fxItemCls(strobeEnabled)}
                          >
                            <span className="flex items-center gap-1.5 truncate">
                              <Zap className="w-3 h-3 text-cyan-300 shrink-0" />
                              <span>4D 边缘残影 [Z]</span>
                            </span>
                            {fxDot(strobeEnabled)}
                          </button>

                          <button
                            type="button"
                            data-testid="sandbox-toggle-swarm"
                            onClick={() => setSwarmOpsEnabled((s) => !s)}
                            className={fxItemCls(swarmOpsEnabled)}
                          >
                            <span className="flex items-center gap-1.5 truncate">
                              <Radio className="w-3 h-3 text-cyan-300 shrink-0" />
                              <span>多机协同编队 [B]</span>
                            </span>
                            {fxDot(swarmOpsEnabled)}
                          </button>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              data-testid="sandbox-toggle-fault"
                              onClick={() => {
                                if (activeFaults.length === 0) {
                                  runtimeRef.current.quickFaultRequested = true;
                                  setFaultInjectMode(true);
                                } else {
                                  setFaultInjectMode((m) => !m);
                                }
                              }}
                              className={`flex-1 ${fxItemCls(
                                activeFaults.length > 0 || faultInjectMode,
                                true
                              )}`}
                            >
                              <span className="flex items-center gap-1.5 truncate">
                                <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                                <span>
                                  战损注入 [J]
                                  {activeFaults.length > 0 ? ` (${activeFaults.length})` : ''}
                                </span>
                              </span>
                              {fxDot(activeFaults.length > 0 || faultInjectMode, true)}
                            </button>
                            {activeFaults.length > 0 && (
                              <button
                                type="button"
                                data-testid="sandbox-self-heal-btn"
                                onClick={handleSelfHealAll}
                                className="px-2 py-1.5 rounded-lg text-[10px] font-mono border border-cyan-400/60 bg-cyan-500/15 text-cyan-100 cursor-pointer shrink-0"
                              >
                                自愈
                              </button>
                            )}
                          </div>

                          <button
                            type="button"
                            data-testid="sandbox-diegetic-hud-btn"
                            onClick={() => {
                              runtimeRef.current.diegeticHudActive = true;
                              setDiegeticHudActive(true);
                              setFxDrawerOpen(false);
                              proceduralAudioSynth.playMechanicalLatchClick(860, !muted);
                            }}
                            className={fxItemCls(diegeticHudActive)}
                          >
                            <span className="flex items-center gap-1.5 truncate">
                              <Tv className="w-3 h-3 text-cyan-300 shrink-0" />
                              <span>实机背脊全息UI [U]</span>
                            </span>
                            {fxDot(diegeticHudActive)}
                          </button>

                          <button
                            type="button"
                            data-testid="sandbox-toggle-ik"
                            onClick={() => {
                              const next = !ikEnabled;
                              setIkEnabled(next);
                              if (!next) setPlasmaCutting(false);
                            }}
                            className={fxItemCls(ikEnabled)}
                          >
                            <span>6-DOF IK 牵引 [I]</span>
                            {fxDot(ikEnabled)}
                          </button>

                          <button
                            type="button"
                            data-testid="sandbox-toggle-plasma"
                            onClick={() => {
                              if (!plasmaCutting) setIkEnabled(true);
                              setPlasmaCutting((p) => !p);
                            }}
                            className={fxItemCls(plasmaCutting)}
                          >
                            <span className="flex items-center gap-1.5 truncate">
                              <ScanSearch className="w-3 h-3 text-cyan-300 shrink-0" />
                              <span>等离子电弧切割 [Y]</span>
                            </span>
                            {fxDot(plasmaCutting)}
                          </button>
                        </div>

                        <div className="pt-2 border-t border-white/10 space-y-1.5">
                          <div className="text-[10px] font-mono text-slate-400">
                            02. 透视、光刻、风洞与 256-SPP 物理光追
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            <button
                              type="button"
                              data-testid="toggle-maglens-btn"
                              onClick={() => setMagLensEnabled((v) => !v)}
                              className={fxItemCls(magLensEnabled)}
                            >
                              <span>
                                磁力透视球 {magLensEnabled ? `${magLensRadius.toFixed(2)}m` : ''}
                              </span>
                              {fxDot(magLensEnabled)}
                            </button>

                            <button
                              type="button"
                              data-testid="trigger-sls-print-btn"
                              onClick={handleTriggerSlsPrint}
                              className={fxItemCls(slsActive)}
                            >
                              <span className="flex items-center gap-1.5 truncate">
                                <Sparkles className="w-3 h-3 text-cyan-300 shrink-0" />
                                <span>双激光 SLS 光刻</span>
                              </span>
                              {fxDot(slsActive)}
                            </button>

                            <button
                              type="button"
                              data-testid="toggle-mpc-btn"
                              onClick={() => setMpcEnabled((v) => !v)}
                              className={fxItemCls(mpcEnabled)}
                            >
                              <span>
                                MPC 预判轨线
                                {mpcEnabled && totalPowerWatts > 1
                                  ? ` ${Math.round(totalPowerWatts)}W`
                                  : ''}
                              </span>
                              {fxDot(mpcEnabled)}
                            </button>

                            <button
                              type="button"
                              data-testid="toggle-focus-btn"
                              onClick={() => setFocusWeakpointEnabled((v) => !v)}
                              className={fxItemCls(focusWeakpointEnabled)}
                            >
                              <span>Focus 核心弱点透视</span>
                              {fxDot(focusWeakpointEnabled)}
                            </button>

                            <button
                              type="button"
                              data-testid="toggle-microfpv-btn"
                              onClick={() => {
                                handleToggleMicroFpv();
                                setFxDrawerOpen(false);
                              }}
                              className={fxItemCls(microFpvActive)}
                            >
                              <span>
                                {microFpvActive
                                  ? `退出微距钻膛 [C] · ${microFpvSegmentLabel || '穿腔'}`
                                  : '微距钻膛航线 [C]'}
                              </span>
                              {fxDot(microFpvActive)}
                            </button>

                            <button
                              type="button"
                              data-testid="clean-weathering-btn"
                              onClick={handleCleanWeathering}
                              className={fxItemCls(weatheringDirtyUI)}
                            >
                              <span>纳米表面自清洁</span>
                              {fxDot(weatheringDirtyUI)}
                            </button>

                            <button
                              type="button"
                              data-testid="wt-toggle-schlieren"
                              onClick={() =>
                                setWindTunnelConfig((p) => ({
                                  ...p,
                                  schlierenMode: !p.schlierenMode
                                }))
                              }
                              className={fxItemCls(windTunnelConfig.schlierenMode)}
                            >
                              <span>光学纹影风洞</span>
                              {fxDot(windTunnelConfig.schlierenMode)}
                            </button>

                            <button
                              type="button"
                              data-testid="wt-toggle-plasma"
                              onClick={() =>
                                setWindTunnelConfig((p) => ({
                                  ...p,
                                  mach8PlasmaSheath: !p.mach8PlasmaSheath
                                }))
                              }
                              className={fxItemCls(windTunnelConfig.mach8PlasmaSheath, true)}
                            >
                              <span>马赫8 等离子鞘</span>
                              {fxDot(windTunnelConfig.mach8PlasmaSheath, true)}
                            </button>
                          </div>

                          <div className="pt-1 flex items-center justify-between gap-2">
                            <PathTracingHudBar
                              pathTracingEnabled={pathTracingEnabled}
                              spp={ptSpp}
                              bvhMeshCount={bvhStats.meshes}
                              emissiveLightCount={bvhStats.emissives}
                              isExporting4K={isExporting4K}
                              onTogglePathTracing={() => setPathTracingEnabled((p) => !p)}
                              onExport4K={handleExport4K}
                              inlineDock
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Audio Mute [M] */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      const nextMuted = !muted;
                      setMuted(nextMuted);
                      if (onChangeAudioSynth) {
                        onChangeAudioSynth(!nextMuted);
                      } else {
                        proceduralAudioSynth.setEnabled(!nextMuted);
                      }
                    }}
                    aria-label={muted ? '开启物理声效合成' : '静音音效'}
                    className="p-2 rounded-xl bg-[#0a101a]/90 border border-white/10 text-slate-200 hover:border-white/25 shadow-xl transition cursor-pointer"
                    title="物理声效合成与战术音效开关 [M]"
                  >
                    {muted ? (
                      <VolumeX className="w-4 h-4 text-slate-400" />
                    ) : (
                      <Volume2 className="w-4 h-4 text-cyan-300" />
                    )}
                  </button>

                  {onEnterMarsCombat && (
                    <button
                      type="button"
                      onClick={() => onEnterMarsCombat(actorSpec.id)}
                      data-testid="sandbox-enter-combat-btn"
                      className="px-3 py-1.5 rounded-xl bg-[#0a101a]/90 hover:border-amber-400/75 border border-amber-500/35 text-amber-100 font-mono font-semibold text-xs flex items-center gap-1.5 shadow-xl transition cursor-pointer whitespace-nowrap"
                      title="进入赤星战区火星科幻机甲战斗模式"
                    >
                      <Swords className="w-3.5 h-3.5 text-amber-400" />
                      <span>赤星战区</span>
                    </button>
                  )}

                  {/* Exit to Hangar [G] */}
                  <button
                    type="button"
                    onClick={() => onExitSandbox(actorSpec.id)}
                    data-testid="exit-sandbox-btn"
                    className="px-3 py-1.5 rounded-xl bg-[#0a101a]/90 hover:border-[#00e5ff]/75 border border-white/15 text-slate-100 font-mono font-semibold text-xs flex items-center gap-1.5 shadow-xl transition cursor-pointer whitespace-nowrap"
                    title="返回机库精拆与蓝图总控台 (快捷键 G)"
                  >
                    <Wrench className="w-3.5 h-3.5 text-cyan-300" />
                    <span>返回机库 [G]</span>
                  </button>
                </div>

                {/* Top-Right 2.5s Auto-Dismissing Micro-Toast (never covers bottom buttons!) */}
                {activeActionToast && (
                  <div
                    data-testid="sandbox-micro-toast"
                    className="pointer-events-none px-3 py-1 rounded-lg bg-[#0a101a]/90 border border-[#00e5ff]/45 text-slate-100 text-[11px] font-mono shadow-xl max-w-[380px] truncate"
                  >
                    {activeActionToast}
                  </div>
                )}
                {swarmOpsEnabled && swarmPhaseBanner && (
                  <div
                    data-testid="swarm-killchain-banner"
                    className="pointer-events-none px-3 py-0.5 rounded-lg bg-[#0a101a]/90 border border-white/15 text-cyan-200 text-[10px] font-mono shadow-xl"
                  >
                    {swarmPhaseBanner}
                  </div>
                )}
              </div>
            </div>

            {/* TOP-CENTER ULTIMATE SHOWCASE BANNER (pinned to top negative space so center 3D viewport stays 100% clear) */}
            {ultimateHudState.active && (
              <div
                data-testid="sandbox-ultimate-showcase-banner"
                className="pointer-events-none absolute top-14 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-xl bg-[#0a101a]/95 border border-[#00e5ff]/75 shadow-2xl text-center max-w-[520px] z-30"
              >
                <div className="text-xs font-mono font-bold text-cyan-100 tracking-wide">
                  {getRobotUltimateMeta(actorSpec.id).skillName}
                </div>
                <div className="text-[10px] font-mono text-cyan-300 mt-0.5">
                  {ultimateHudState.phaseLabel} · {ultimateHudState.progressPct}%
                </div>
                <div className="mt-1 flex items-center justify-center gap-1.5 text-[9px] font-mono text-slate-300">
                  {getRobotUltimateMeta(actorSpec.id).showcaseSystems.map((sys, idx) => (
                    <React.Fragment key={sys}>
                      {idx > 0 && <span aria-hidden="true">·</span>}
                      <span>{sys}</span>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            )}

            {/* BOTTOM PERIMETER: Compact Single-Row Tactical Action Hotbar + Subtle Bottom-Left Legend */}
            <div className="relative flex items-end justify-center">
              {/* Subtle Auto-Fading Bottom-Left Movement Hint (2xl+ so 1440px keeps clear negative space around hotbar) */}
              <div
                className={`hidden 2xl:flex items-center gap-1.5 text-[10px] font-mono text-slate-300 absolute left-0 bottom-1.5 transition-opacity duration-500 ${
                  hintDimmed ? 'opacity-25 hover:opacity-80' : 'opacity-75'
                }`}
              >
                <span>WASD 机动</span>
                <span>·</span>
                <span>1-4 步态</span>
                <span>·</span>
                <span>Alt 瞬步</span>
                <span>·</span>
                <span>点地/点靶</span>
              </div>

              {/* Center Stack: Optional Bullet-Time Slider + Single-Row Action Hotbar */}
              <div className="flex flex-col items-center gap-1.5 max-w-[calc(100%-1rem)]">
                {bulletTimeActive && (
                  <div
                    data-testid="bullet-time-explosion-bar"
                    className="pointer-events-auto flex items-center gap-2.5 px-3 py-1 rounded-xl bg-[#0a101a]/95 border border-[#00e5ff]/60 text-slate-100 text-[11px] font-mono shadow-2xl"
                  >
                    <Clock className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
                    <span>0.01x 悬停爆甲拆解</span>
                    <input
                      type="range"
                      aria-label="空中悬停四工序正交爆炸度"
                      min={0}
                      max={1}
                      step={0.01}
                      value={bulletExplosionTarget}
                      onChange={(e) => setBulletExplosionTarget(parseFloat(e.target.value))}
                      className="w-24 accent-[#00e5ff]"
                    />
                    <span className="text-cyan-300 font-bold tabular-nums">
                      {Math.round(bulletExplosionTarget * 100)}%
                    </span>
                  </div>
                )}

                {/* Single-Row Tactical Hotbar */}
                <div
                  data-testid="sandbox-primary-hotbar"
                  className="pointer-events-auto flex items-center gap-1.5 bg-[#0a101a]/90 border border-white/10 rounded-xl px-2 py-1.5 shadow-2xl overflow-x-auto max-w-full"
                >
                  {/* Unified 4-Shot Camera + Action Ultimate Showcase [Q] */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      triggerUltimateAction();
                    }}
                    data-testid="sandbox-skill-ultimate"
                    className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0 ${
                      ultimateHudState.active
                        ? 'bg-cyan-500/20 border-[#00e5ff] text-cyan-100 font-semibold'
                        : 'bg-[#0c1320]/95 border-[#00e5ff]/45 text-cyan-100 hover:border-[#00e5ff]'
                    }`}
                    title="镜头+动作四镜联动大片：低仰推轨内窥 -> 希区柯克甩镜跟拍 URDF 极限绝技 -> 战术俯仰脉冲锁定 -> 英雄定帧合甲 [快捷键 Q]"
                  >
                    <Zap className="w-3.5 h-3.5 text-[#00e5ff] shrink-0" />
                    <span>{ultimateHudState.active ? '四镜展演中' : '绝技大片'}</span>
                    <span className="text-[10px] text-[#00e5ff] font-bold">[Q]</span>
                  </button>

                  {/* 4-Mode Embodied Locomotion Cycler [1-4] */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      cycleLocomotionAction();
                    }}
                    data-testid="sandbox-locomotion-mode-btn"
                    className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0 ${
                      locomotionMode !== 'standard'
                        ? 'bg-cyan-500/15 border-[#00e5ff]/80 text-cyan-100 font-semibold'
                        : 'bg-[#0c1320]/95 border-white/10 text-slate-200 hover:border-white/25'
                    }`}
                    title="切换 4 种真机具身机动步态/模态 (数字键 1-4 切换 · Alt 矢量瞬步)"
                  >
                    <span>
                      模态:{getLocomotionModeSpec(actorSpec.id, actorSpec.domain, locomotionMode).shortLabel}
                    </span>
                    <span className="text-[10px] text-cyan-300 font-bold">
                      [{getLocomotionModeSpec(actorSpec.id, actorSpec.domain, locomotionMode).keyHint}]
                    </span>
                  </button>

                  {/* [F] Tactical Fire */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      triggerFireAction();
                    }}
                    data-testid="sandbox-skill-fire"
                    className="px-2.5 py-1.5 rounded-lg bg-[#0c1320]/95 hover:border-amber-400/75 border border-amber-400/35 text-slate-100 text-xs font-mono flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0"
                    title={actorSpec.fireActionTitle}
                  >
                    <Crosshair className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>战术发射</span>
                    <span className="text-[10px] text-amber-300 font-bold">[F]</span>
                  </button>

                  {/* [E] Terrain / Airspace Scan */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      triggerScanAction();
                    }}
                    data-testid="sandbox-skill-scan"
                    className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0 ${
                      odradekActive
                        ? 'bg-cyan-500/15 border-[#00e5ff]/80 text-cyan-100 font-semibold'
                        : 'bg-[#0c1320]/95 border-white/10 text-slate-200 hover:border-white/25'
                    }`}
                  >
                    <Radar className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
                    <span>{actorSpec.domain === 'air' ? '空域雷达' : '地形扫描'}</span>
                    <span className="text-[10px] text-cyan-300 font-bold">[E]</span>
                    {fxDot(odradekActive)}
                  </button>

                  {/* [X] Overheat Armor-Pop Venting */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      triggerOverheatVentAction();
                    }}
                    data-testid="sandbox-overheat-vent-btn"
                    className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono tabular-nums flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0 ${
                      overheatVentingUI
                        ? 'bg-amber-500/15 border-amber-400/80 text-amber-100 font-semibold'
                        : 'bg-[#0c1320]/95 border-white/10 text-slate-200 hover:border-white/25'
                    }`}
                  >
                    <Flame className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                    <span>{overheatVentingUI ? '排温中' : `排温 ${heatPctUI}%`}</span>
                    <span className="text-[10px] text-slate-400 font-bold">[X]</span>
                  </button>

                  {/* [Tab] Bullet-Time Explosion */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      toggleBulletTimeAction();
                    }}
                    data-testid="sandbox-toggle-bullettime"
                    className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0 ${
                      bulletTimeActive
                        ? 'bg-cyan-500/15 border-[#00e5ff]/80 text-cyan-100 font-semibold'
                        : 'bg-[#0c1320]/95 border-white/10 text-slate-200 hover:border-white/25'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
                    <span>子弹时间</span>
                    <span className="text-[10px] text-cyan-300 font-bold">[Tab]</span>
                    {fxDot(bulletTimeActive)}
                  </button>

                  {/* [P] Autonomous Patrol */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      togglePatrolAction();
                    }}
                    data-testid="sandbox-skill-patrol"
                    className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0 ${
                      autoPatrol
                        ? 'bg-cyan-500/15 border-[#00e5ff]/80 text-cyan-100 font-semibold'
                        : 'bg-[#0c1320]/95 border-white/10 text-slate-200 hover:border-white/25'
                    }`}
                  >
                    <Navigation className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
                    <span>自动巡逻</span>
                    <span className="text-[10px] text-cyan-300 font-bold">[P]</span>
                    {fxDot(autoPatrol)}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
