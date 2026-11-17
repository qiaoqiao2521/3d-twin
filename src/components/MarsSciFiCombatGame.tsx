import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  loadGlbSceneResilient,
  fetchTextAssetResilient,
  cloneSceneWithSkeletonSupport,
  ensureMeshoptLodReady,
  getOrBuildDecimatedLodGeometries,
  disposeSceneHierarchy
} from '../utils/resilientGlbLoader';
import { UrdfJointDef, parseUrdfJoints } from '../utils/manifestUtils';
import { computeSandboxUrdfJointAngle, SandboxKinematicState } from '../utils/actionSandboxEngine';
import {
  detectSoftwareWebGL,
  createStudioLightboxPmrem,
  upgradeGlbPbrAndBuildStaticBvh
} from '../utils/hybridRayTracing';
import { createCombatAnamorphicPostPipeline } from '../utils/cinemaOpticsPipeline';
import {
  createInitialCameraMicroImpulse,
  triggerCameraMicroImpulse,
  stepCameraMicroImpulse
} from '../utils/tactileCameraRig';
import { proceduralAudioSynth } from '../utils/proceduralAudioSynth';
import {
  GameShellState,
  PlayerMechId,
  CombatWeaponId,
  EnemyArchetypeId,
  BattlefieldMapId,
  BATTLEFIELD_MAP_SPECS,
  PLAYABLE_MECH_SPECS,
  COMBAT_WEAPONS,
  ENEMY_ARCHETYPE_SPECS,
  MARS_BATTLEFIELD_OBSTACLES,
  MarsCombatWorldState,
  RunSummarySnapshot,
  KillfeedEntry,
  HitmarkerFeedback,
  isLeggedCombatMech,
  isBiologicalXenoEnemy,
  sampleMarsArenaSurfaceHeight,
  getPlayableMechSpec,
  createInitialMarsCombatState,
  summonAresBoss,
  summonXenoQueenBoss,
  computeRelativeThreatAngleRad,
  computeCombatUpperLowerBodyIK,
  stepMarsCombatWorld
} from '../utils/marsCombatEngine';
import {
  createMarsBattlefieldEnvironment,
  createMarsCombatVFXController,
  createSoftShadowDiscTexture,
  createMountedSciFiPulseRifle,
  createPlayerDodgeThrusterRig,
  createLocalizedHexShieldMaterial,
  createAeroHunterGunshipFrame,
  createArmoredManipulatorCarrierBase
} from '../utils/marsCombatSceneFX';

export interface MarsSciFiCombatGameProps {
  initialAutostart?: boolean;
  initialMechId?: PlayerMechId;
  audioEnabled: boolean;
  onToggleAudio: () => void;
  onOpenFreeSandbox: (mechId: string) => void;
  onOpenCadHangar: (mechId: string) => void;
}

interface BoundUrdfNode {
  def: UrdfJointDef;
  node: THREE.Object3D;
  baseQuat: THREE.Quaternion;
  axisVec: THREE.Vector3;
}

interface RigMeshEntry {
  mesh: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
  baseGeo: THREE.BufferGeometry;
  lods: { lod1: THREE.BufferGeometry; lod2: THREE.BufferGeometry } | null;
  baseEmissive: THREE.Color;
  baseEmissiveIntensity: number;
}

interface Spawned3DEnemyRig {
  uid: number;
  archetype: EnemyArchetypeId;
  root: THREE.Group;
  modelPivot: THREE.Group;
  joints: BoundUrdfNode[];
  meshes: RigMeshEntry[];
  rotorNodes: THREE.Object3D[];
  gunshipFrame: ReturnType<typeof createAeroHunterGunshipFrame> | null;
  shieldDome: THREE.Mesh | null;
}

interface HudSyncSnapshot {
  hp: number;
  maxHp: number;
  ghostHp: number;
  shield: number;
  maxShield: number;
  boostEnergy: number;
  meleeCooldown: number;
  empCooldown: number;
  ultimateCharge: number;
  activeWeapon: CombatWeaponId;
  spreadBloom: number;
  score: number;
  bestScore: number;
  kills: number;
  vanguardTarget: number;
  combo: number;
  wave: number;
  headingDeg: number;
  bossBannerTimer: number;
  bossIsQueen: boolean;
  hitmarker: HitmarkerFeedback;
  threatAnglesDeg: { id: number; deg: number; opacity: number }[];
  killfeed: KillfeedEntry[];
  enemyScreenBars: {
    uid: number;
    x: number;
    y: number;
    hpPct: number;
    shieldPct: number;
    staggered: boolean;
    locked: boolean;
  }[];
  bossHud: {
    codeName: string;
    hp: number;
    maxHp: number;
    ghostHpPct: number;
    shieldPct: number;
    staggerPct: number;
    staggered: boolean;
    phase: 1 | 2;
    attackWarning: string | null;
  } | null;
  wingmanCooldown: number;
  wingmanMode: 'escort' | 'pounce_leap' | 'bite_slash';
  damagePopupsScreen: {
    id: number;
    x: number;
    y: number;
    amount: number;
    isCrit: boolean;
    isShield: boolean;
    opacity: number;
  }[];
}

const _muzzleWorldVec = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _projVec = new THREE.Vector3();
const _camTarget = new THREE.Vector3();
const _camDesired = new THREE.Vector3();
const _qAxis = new THREE.Quaternion();
const _wheelSpinQuat = new THREE.Quaternion();
const _wheelSpinAxis = new THREE.Vector3(0, 1, 0);

const _tmpUrdfKin: SandboxKinematicState = {
  x: 0,
  y: 0,
  z: 0,
  vx: 0,
  vy: 0,
  vz: 0,
  yaw: 0,
  pitch: 0,
  roll: 0,
  speed: 0,
  turnVel: 0,
  gaitDistance: 0,
  isGrounded: true,
  isBoosting: false,
  isBrakingReverse: false,
  reverserStroke: 0,
  throttlePct: 0,
  machNumber: 0,
  depthMeters: 0,
  trauma: 0,
  autoPatrol: false,
  activeWaypointIdx: 0,
  waypointHoldTimer: 0,
  emittedAutoScan: false,
  emittedAutoFire: false,
  emittedFootstep: false
};

/**
 * Normalizes a cloned GLB group so its bounding box max dimension equals `targetMaxDim`
 * and its bottom sits flush at local `y = 0`, enabling shadows & optional runtime Meshopt LODs.
 */
function normalizeAndGroundGlbGroup(
  rawGroup: THREE.Group,
  targetMaxDim: number,
  isSoftwareGl: boolean,
  tintAccentHex?: string,
  buildRuntimeLods: boolean = false
): {
  pivot: THREE.Group;
  normScale: number;
  meshes: RigMeshEntry[];
} {
  const pivot = new THREE.Group();
  rawGroup.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(rawGroup);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.01);
  const scale = targetMaxDim / maxDim;

  rawGroup.scale.setScalar(scale);
  rawGroup.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
  rawGroup.updateMatrixWorld(true);

  const meshes: RigMeshEntry[] = [];
  const accentCol = tintAccentHex ? new THREE.Color(tintAccentHex) : null;

  rawGroup.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const m = obj as THREE.Mesh;
      m.castShadow = !isSoftwareGl;
      m.receiveShadow = !isSoftwareGl;
      const srcMat = Array.isArray(m.material) ? m.material[0] : m.material;
      const std = (
        srcMat ? srcMat.clone() : new THREE.MeshStandardMaterial({ color: 0x94a3b8 })
      ) as THREE.MeshStandardMaterial;

      if (accentCol && m.name && /visor|head|lidar|camera|core|motor|eye|thruster/i.test(m.name)) {
        std.emissive = accentCol.clone();
        std.emissiveIntensity = 1.35;
      }
      const baseEmissive = std.emissive ? std.emissive.clone() : new THREE.Color(0x000000);
      const baseEmissiveIntensity = std.emissiveIntensity ?? 0;
      m.material = std;
      const baseGeo = m.geometry;
      const lods = buildRuntimeLods ? getOrBuildDecimatedLodGeometries(baseGeo) : null;
      meshes.push({ mesh: m, mat: std, baseGeo, lods, baseEmissive, baseEmissiveIntensity });
    }
  });

  pivot.add(rawGroup);
  return { pivot, normScale: scale, meshes };
}

const SPOT_ARM_MJCF_JOINTS: UrdfJointDef[] = [
  ...(['fl', 'fr', 'hl', 'hr'] as const).flatMap((leg) => [
    {
      name: `${leg}_hip_joint`,
      type: 'revolute' as const,
      parent: 'body',
      child: `${leg}_hip`,
      xyz: [0, 0, 0] as [number, number, number],
      rpy: [0, 0, 0] as [number, number, number],
      axis: [1, 0, 0] as [number, number, number],
      lower: -0.78,
      upper: 0.78
    },
    {
      name: `${leg}_uleg_joint`,
      type: 'revolute' as const,
      parent: `${leg}_hip`,
      child: `${leg}_uleg`,
      xyz: [0, 0, 0] as [number, number, number],
      rpy: [0, 0, 0] as [number, number, number],
      axis: [0, 1, 0] as [number, number, number],
      lower: -0.89,
      upper: 2.24
    },
    {
      name: `${leg}_lleg_joint`,
      type: 'revolute' as const,
      parent: `${leg}_uleg`,
      child: `${leg}_lleg`,
      xyz: [0, 0, 0] as [number, number, number],
      rpy: [0, 0, 0] as [number, number, number],
      axis: [0, 1, 0] as [number, number, number],
      lower: -2.79,
      upper: 0.65
    }
  ]),
  {
    name: 'arm_sh0',
    type: 'revolute',
    parent: 'body',
    child: 'arm_link_sh0',
    xyz: [0, 0, 0],
    rpy: [0, 0, 0],
    axis: [0, 0, 1],
    lower: -2.6,
    upper: 3.1
  },
  {
    name: 'arm_sh1',
    type: 'revolute',
    parent: 'arm_link_sh0',
    child: 'arm_link_sh1',
    xyz: [0, 0, 0],
    rpy: [0, 0, 0],
    axis: [0, 1, 0],
    lower: -3.1,
    upper: 0.52
  },
  {
    name: 'arm_el0',
    type: 'revolute',
    parent: 'arm_link_sh1',
    child: 'arm_link_el0',
    xyz: [0, 0, 0],
    rpy: [0, 0, 0],
    axis: [0, 1, 0],
    lower: -0.5,
    upper: 3.1
  },
  {
    name: 'arm_wr0',
    type: 'revolute',
    parent: 'arm_link_el1',
    child: 'arm_link_wr0',
    xyz: [0, 0, 0],
    rpy: [0, 0, 0],
    axis: [0, 1, 0],
    lower: -1.83,
    upper: 1.83
  }
];

function bindUrdfJointsToRoot(root: THREE.Object3D, defs: UrdfJointDef[]): BoundUrdfNode[] {
  if (!defs.length) return [];
  const byName = new Map<string, THREE.Object3D>();
  root.traverse((o) => {
    if (o.name) {
      byName.set(o.name, o);
      byName.set(o.name.toLowerCase(), o);
    }
  });

  const bound: BoundUrdfNode[] = [];
  for (const d of defs) {
    if (d.type === 'fixed') continue;
    const clean = d.child.replace(/^\//, '');
    const target =
      byName.get(clean) ||
      byName.get(clean.toLowerCase()) ||
      Array.from(byName.entries()).find(([k]) => k.toLowerCase().includes(clean.toLowerCase()))?.[1];
    if (target) {
      const ax = new THREE.Vector3(d.axis[0], d.axis[1], d.axis[2]);
      if (ax.lengthSq() < 1e-5) ax.set(1, 0, 0);
      else ax.normalize();
      bound.push({
        def: d,
        node: target,
        baseQuat: target.quaternion.clone(),
        axisVec: ax
      });
    }
  }
  return bound;
}

function collectRoverWheelNodes(
  root: THREE.Object3D
): { node: THREE.Object3D; baseQuat: THREE.Quaternion; axis: THREE.Vector3 }[] {
  const found: { node: THREE.Object3D; baseQuat: THREE.Quaternion; axis: THREE.Vector3 }[] = [];
  root.traverse((o) => {
    if (!o.name) return;
    const n = o.name.toLowerCase();
    if (
      /wheel/.test(n) &&
      !/steer|bogie|rocker|bracket|fender|hub_mount|fork|strut/.test(n) &&
      !found.some((f) => {
        let p = o.parent;
        while (p) {
          if (p === f.node) return true;
          p = p.parent;
        }
        return false;
      })
    ) {
      // Determine thin cylinder spin axis from local geometry bounds if mesh, else local Z/Y
      let spinAxis = new THREE.Vector3(0, 0, 1);
      if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry) {
        const g = (o as THREE.Mesh).geometry;
        if (!g.boundingBox) g.computeBoundingBox();
        if (g.boundingBox) {
          const sz = g.boundingBox.getSize(new THREE.Vector3());
          if (sz.x <= sz.y && sz.x <= sz.z) spinAxis.set(1, 0, 0);
          else if (sz.y <= sz.x && sz.y <= sz.z) spinAxis.set(0, 1, 0);
          else spinAxis.set(0, 0, 1);
        }
      }
      found.push({ node: o, baseQuat: o.quaternion.clone(), axis: spinAxis });
    }
  });
  return found;
}

export const MarsSciFiCombatGame: React.FC<MarsSciFiCombatGameProps> = ({
  initialAutostart = false,
  initialMechId = 'unitree_g1',
  audioEnabled,
  onToggleAudio,
  onOpenFreeSandbox,
  onOpenCadHangar
}) => {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const [selectedMechId, setSelectedMechId] = useState<PlayerMechId>(initialMechId);
  const [selectedMapId, setSelectedMapId] = useState<BattlefieldMapId>('jezero_crater');
  const [shellState, setShellState] = useState<GameShellState>(
    initialAutostart ? 'playing' : 'title'
  );
  const [isLoadingAssets, setIsLoadingAssets] = useState<boolean>(true);
  const [runSummary, setRunSummary] = useState<RunSummarySnapshot | null>(null);

  const worldRef = useRef<MarsCombatWorldState>(
    createInitialMarsCombatState(initialMechId, 0, initialAutostart, 'jezero_crater')
  );
  const shellStateRef = useRef<GameShellState>(initialAutostart ? 'playing' : 'title');
  const selectedMechRef = useRef<PlayerMechId>(initialMechId);
  const selectedMapRef = useRef<BattlefieldMapId>('jezero_crater');
  const audioEnabledRef = useRef<boolean>(audioEnabled);
  audioEnabledRef.current = audioEnabled;

  // Unified Input Hub (held + edge-triggered justPressed)
  const inputHubRef = useRef({
    keysHeld: new Set<string>(),
    mouseHeldL: false,
    missileJustPressed: false,
    meleeJustPressed: false,
    jumpJustPressed: false,
    dashJustPressed: false,
    empJustPressed: false,
    wingmanCommandJustPressed: false,
    ultimateJustPressed: false,
    summonBossJustPressed: false,
    summonQueenJustPressed: false,
    ventJustPressed: false,
    pointerNdcX: 0,
    pointerNdcY: 0,
    hasPointerSample: false,
    camYaw: 0,
    camPitch: -0.09
  });

  const [hud, setHud] = useState<HudSyncSnapshot>(() => {
    const spec = getPlayableMechSpec(initialMechId);
    return {
      hp: spec.maxHp,
      maxHp: spec.maxHp,
      ghostHp: spec.maxHp,
      shield: spec.maxShield,
      maxShield: spec.maxShield,
      boostEnergy: 100,
      meleeCooldown: 0,
      empCooldown: 0,
      ultimateCharge: 100,
      activeWeapon: 'pulse_rifle',
      spreadBloom: 0,
      score: 0,
      bestScore: 0,
      kills: 0,
      vanguardTarget: 6,
      combo: 0,
      wave: 1,
      headingDeg: 0,
      bossBannerTimer: 0,
      bossIsQueen: false,
      hitmarker: { timer: 0, isCrit: false, isShield: false, isKill: false, lastDamage: 0 },
      threatAnglesDeg: [],
      killfeed: [],
      enemyScreenBars: [],
      bossHud: null,
      wingmanCooldown: 0,
      wingmanMode: 'escort',
      damagePopupsScreen: []
    };
  });

  // Sync Game Shell state to document.body.dataset.state & release PointerLock when leaving 'playing'
  useEffect(() => {
    shellStateRef.current = shellState;
    document.body.dataset.state = shellState;
    if (shellState !== 'playing') {
      if (document.pointerLockElement) {
        try {
          document.exitPointerLock?.();
        } catch {
          // Safe fallback if pointer lock unsupported
        }
      }
      inputHubRef.current.keysHeld.clear();
      inputHubRef.current.mouseHeldL = false;
      proceduralAudioSynth.silenceContinuousLoops();
    }
    return () => {
      delete document.body.dataset.state;
    };
  }, [shellState]);

  const startOrRestartDeployment = (mechOverride?: PlayerMechId, mapOverride?: BattlefieldMapId) => {
    const mech = mechOverride || selectedMechRef.current;
    const mapId = mapOverride || selectedMapRef.current;
    const prevBest = worldRef.current.bestScore;
    const nextWorld = createInitialMarsCombatState(mech, prevBest, true, mapId);
    worldRef.current = nextWorld;
    inputHubRef.current.keysHeld.clear();
    inputHubRef.current.mouseHeldL = false;
    inputHubRef.current.hasPointerSample = false;
    inputHubRef.current.camYaw = 0;
    inputHubRef.current.camPitch = -0.09;
    setRunSummary(null);
    setShellState('playing');
    document.body.dataset.state = 'playing';
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    if (audioEnabledRef.current) {
      proceduralAudioSynth.playOrbitalDropfallAudio('touchdown_rise', true);
    }
  };

  const togglePauseGame = () => {
    if (shellStateRef.current === 'playing') {
      worldRef.current.shellState = 'paused';
      setShellState('paused');
    } else if (shellStateRef.current === 'paused') {
      worldRef.current.shellState = 'playing';
      setShellState('playing');
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    }
  };

  const selectWeaponSlot = (weaponId: CombatWeaponId) => {
    worldRef.current.activeWeapon = weaponId;
    setHud((prev) => ({ ...prev, activeWeapon: weaponId }));
    if (audioEnabledRef.current) {
      proceduralAudioSynth.playMechanicalLatchClick(820, true);
    }
  };

  // Global Keyboard & Focus-Loss Listeners
  useEffect(() => {
    const hub = inputHubRef.current;
    const onKeyDown = (e: KeyboardEvent) => {
      // Never hijack browser shortcuts like Ctrl+R, Cmd+R, Ctrl+Shift+I
      if (e.ctrlKey || e.metaKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const st = shellStateRef.current;

      if (st === 'title') {
        if ((e.code === 'Enter' || e.code === 'Space') && !e.repeat) {
          e.preventDefault();
          startOrRestartDeployment();
        }
        return;
      }

      if (st === 'gameover') {
        if ((e.code === 'Enter' || e.code === 'Space') && !e.repeat) {
          e.preventDefault();
          startOrRestartDeployment();
        }
        return;
      }

      if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat) {
        e.preventDefault();
        togglePauseGame();
        return;
      }

      if (st !== 'playing') return;

      hub.keysHeld.add(e.code);
      if (!e.repeat) {
        if (e.code === 'Digit1') selectWeaponSlot('pulse_rifle');
        else if (e.code === 'Digit2') selectWeaponSlot('railgun');
        else if (e.code === 'Digit3') selectWeaponSlot('missile_pod');
        else if (e.code === 'Digit4') selectWeaponSlot('compound_bow');
        else if (e.code === 'Space') {
          e.preventDefault();
          hub.jumpJustPressed = true;
        } else if (e.code === 'KeyC' || e.code === 'AltLeft') {
          // [C / Alt] Dedicated Vector Quick-Boost Dodge (decoupled from [Shift] Sprint!)
          e.preventDefault();
          hub.dashJustPressed = true;
        } else if (e.code === 'KeyX') {
          hub.meleeJustPressed = true;
        } else if (e.code === 'KeyE') {
          hub.empJustPressed = true;
        } else if (e.code === 'KeyQ') {
          hub.wingmanCommandJustPressed = true;
        } else if (e.code === 'KeyV') {
          // [V] Orbital Ion Cannon Ultimate (never accidentally triggered by [R]!)
          hub.ultimateJustPressed = true;
        } else if (e.code === 'KeyR') {
          // [R] Tactical Barrel Heat-Vent & Spread/Recoil Reset
          hub.ventJustPressed = true;
        } else if (e.code === 'KeyF') {
          hub.missileJustPressed = true;
        } else if (e.code === 'KeyB') {
          hub.summonBossJustPressed = true;
        } else if (e.code === 'KeyN') {
          hub.summonQueenJustPressed = true;
        } else if (e.code === 'KeyM') {
          onToggleAudio();
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      hub.keysHeld.delete(e.code);
    };

    const clearHeldInputs = () => {
      hub.keysHeld.clear();
      hub.mouseHeldL = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearHeldInputs);
    document.addEventListener('visibilitychange', clearHeldInputs);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearHeldInputs);
      document.removeEventListener('visibilitychange', clearHeldInputs);
    };
  }, [onToggleAudio]);

  // Mount Three.js Mars Combat Scene ONCE (stable WebGL lifecycle!)
  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    let disposed = false;
    let frameId = 0;
    const isSoftwareGl = detectSoftwareWebGL();
    const initW = container.clientWidth || 1280;
    const initH = container.clientHeight || 800;
    const initDpr = isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x3b1b13);
    scene.fog = new THREE.FogExp2(0x6b3524, 0.0072);

    const camera = new THREE.PerspectiveCamera(52, initW / initH, 0.1, 280);
    camera.position.set(-7.5, 4.2, 6.5);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance'
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(initDpr);
    renderer.setSize(initW, initH);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const envTex = createStudioLightboxPmrem(renderer);
    scene.environment = envTex;

    const combatPost = createCombatAnamorphicPostPipeline(
      renderer,
      initW,
      initH,
      isSoftwareGl,
      initDpr
    );
    let camMicroImpulse = createInitialCameraMicroImpulse();

    // Warm Martian Sun Key Light + Player-Following 2048x2048 Shadow Frustum + Cool Rim Light
    const hemi = new THREE.HemisphereLight(0xffcfb3, 0x1c1218, 0.72);
    scene.add(hemi);

    const sunKey = new THREE.DirectionalLight(0xffdfa8, 1.65);
    sunKey.position.set(28, 42, -24);
    sunKey.castShadow = !isSoftwareGl;
    sunKey.shadow.mapSize.set(2048, 2048);
    sunKey.shadow.camera.near = 4;
    sunKey.shadow.camera.far = 135;
    sunKey.shadow.camera.left = -44;
    sunKey.shadow.camera.right = 44;
    sunKey.shadow.camera.top = 44;
    sunKey.shadow.camera.bottom = -44;
    sunKey.shadow.bias = -0.0004;
    sunKey.shadow.normalBias = 0.02;
    scene.add(sunKey);
    scene.add(sunKey.target);

    const rimCool = new THREE.DirectionalLight(0x38bdf8, 0.68);
    rimCool.position.set(-24, 16, 28);
    scene.add(rimCool);

    // Battlefield Environment (`'jezero_crater'` vs `'polar_ice_canyon'`) + Live Sector Switcher
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    let currentLoadedMapId: BattlefieldMapId = selectedMapRef.current;
    let marsEnv = createMarsBattlefieldEnvironment(maxAniso, isSoftwareGl, currentLoadedMapId);
    upgradeGlbPbrAndBuildStaticBvh(marsEnv.terrainMesh, 'mars_terrain', () => 'L1');
    upgradeGlbPbrAndBuildStaticBvh(marsEnv.coverBoulderInst, 'mars_boulders', () => 'L1');
    upgradeGlbPbrAndBuildStaticBvh(marsEnv.pylonGroup, 'mars_pylons', () => 'L1');
    scene.add(marsEnv.root);

    const applySectorLighting = (mapId: BattlefieldMapId) => {
      if (mapId === 'polar_ice_canyon') {
        scene.background = new THREE.Color(0x0b1929);
        scene.fog = new THREE.FogExp2(0x1e3a5f, 0.0068);
        hemi.color.setHex(0xcffafe);
        hemi.groundColor.setHex(0x0f172a);
        hemi.intensity = 0.85;
        sunKey.color.setHex(0xe0f2fe);
        sunKey.intensity = 1.72;
        rimCool.color.setHex(0x34d399);
        rimCool.intensity = 0.82;
      } else {
        scene.background = new THREE.Color(0x3b1b13);
        scene.fog = new THREE.FogExp2(0x6b3524, 0.0072);
        hemi.color.setHex(0xffcfb3);
        hemi.groundColor.setHex(0x1c1218);
        hemi.intensity = 0.72;
        sunKey.color.setHex(0xffdfa8);
        sunKey.intensity = 1.65;
        rimCool.color.setHex(0x38bdf8);
        rimCool.intensity = 0.68;
      }
    };
    applySectorLighting(currentLoadedMapId);

    // Pooled Zero-GC Combat & Boss VFX Controller
    const vfxCtrl = createMarsCombatVFXController();
    scene.add(vfxCtrl.root);

    // Player Mech Root + Soft Radial Contact Shadow
    const playerRoot = new THREE.Group();
    scene.add(playerRoot);
    const softShadowTex = createSoftShadowDiscTexture();
    const contactShadowGeo = new THREE.PlaneGeometry(2.4, 2.4);
    contactShadowGeo.rotateX(-Math.PI / 2);
    const contactShadowMat = new THREE.MeshBasicMaterial({
      map: softShadowTex,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2
    });
    const playerShadow = new THREE.Mesh(contactShadowGeo, contactShadowMat);
    playerShadow.position.y = 0.04;
    playerRoot.add(playerShadow);

    let playerModelPivot: THREE.Group | null = null;
    let playerMeshes: RigMeshEntry[] = [];
    let playerWeaponAddonMeshes: RigMeshEntry[] = [];
    let playerHuskyCarrierMeshes: RigMeshEntry[] = [];
    let playerHuskyCarrierPivot: THREE.Group | null = null;
    let playerUrdfJoints: BoundUrdfNode[] = [];
    let playerRoverWheels: { node: THREE.Object3D; baseQuat: THREE.Quaternion; axis: THREE.Vector3 }[] = [];
    let playerCarrier: ReturnType<typeof createArmoredManipulatorCarrierBase> | null = null;
    let currentLoadedPlayerMechId: PlayerMechId | null = null;
    let playerRifle: ReturnType<typeof createMountedSciFiPulseRifle> | null = null;
    let playerBowGroup: THREE.Group | null = null;
    let playerAxeGroup: THREE.Group | null = null;
    let playerTurretMount: THREE.Group | null = null;

    const dodgeThrusterRig = createPlayerDodgeThrusterRig();
    playerRoot.add(dodgeThrusterRig.group);

    // Allied Wingman Go2 Companion 3D Rig
    const wingmanRoot = new THREE.Group();
    scene.add(wingmanRoot);
    const wingmanShadow = new THREE.Mesh(contactShadowGeo, contactShadowMat);
    wingmanShadow.scale.setScalar(0.52);
    wingmanShadow.position.y = 0.03;
    wingmanRoot.add(wingmanShadow);
    const wingmanRingGeo = new THREE.RingGeometry(0.4, 0.5, 28);
    wingmanRingGeo.rotateX(-Math.PI / 2);
    const wingmanRingMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.62,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2
    });
    const wingmanBeaconRing = new THREE.Mesh(wingmanRingGeo, wingmanRingMat);
    wingmanBeaconRing.position.y = 0.04;
    wingmanRoot.add(wingmanBeaconRing);
    let wingmanUrdfJoints: BoundUrdfNode[] = [];
    let wingmanMeshes: RigMeshEntry[] = [];

    // Template Cache for Real GLB Assets & URDFs (built with Static MeshBVH once at load!)
    const glbCache = new Map<string, THREE.Group>();
    const urdfCache = new Map<string, UrdfJointDef[]>();

    const fetchTemplate = async (urls: string[], urdfUrl?: string) => {
      const key = urls.join('|');
      let master = glbCache.get(key);
      if (!master) {
        await ensureMeshoptLodReady();
        const containerGroup = new THREE.Group();
        const scenes = await Promise.all(urls.map((u) => loadGlbSceneResilient(u)));
        for (const s of scenes) containerGroup.add(s);
        upgradeGlbPbrAndBuildStaticBvh(containerGroup, key, () => 'L1');
        glbCache.set(key, containerGroup);
        master = containerGroup;
      }
      let joints: UrdfJointDef[] = [];
      if (urdfUrl) {
        if (urdfCache.has(urdfUrl)) {
          joints = urdfCache.get(urdfUrl)!;
        } else {
          try {
            const xml = await fetchTextAssetResilient(urdfUrl);
            joints = parseUrdfJoints(xml);
            urdfCache.set(urdfUrl, joints);
          } catch {
            joints = [];
          }
        }
      }
      return { template: master, joints };
    };

    const disposeClonedRigMeshes = (entries: RigMeshEntry[]) => {
      for (const m of entries) {
        m.mat.dispose();
      }
    };

    const syncBattlefieldMap = (mapId: BattlefieldMapId) => {
      if (disposed || currentLoadedMapId === mapId) return;
      currentLoadedMapId = mapId;
      scene.remove(marsEnv.root);
      marsEnv.dispose();
      marsEnv = createMarsBattlefieldEnvironment(maxAniso, isSoftwareGl, mapId);
      upgradeGlbPbrAndBuildStaticBvh(marsEnv.terrainMesh, 'mars_terrain', () => 'L1');
      upgradeGlbPbrAndBuildStaticBvh(marsEnv.coverBoulderInst, 'mars_boulders', () => 'L1');
      upgradeGlbPbrAndBuildStaticBvh(marsEnv.pylonGroup, 'mars_pylons', () => 'L1');
      scene.add(marsEnv.root);
      applySectorLighting(mapId);
      if (mapId === 'polar_ice_canyon') {
        const cachedSpires = glbCache.get('/robotics_glb/infinigen_polar_ice_spires.glb');
        if (cachedSpires) {
          marsEnv.applyLoadedGlacialSpires(cachedSpires);
        } else {
          fetchTemplate(['/robotics_glb/infinigen_polar_ice_spires.glb'])
            .then(({ template }) => {
              if (!disposed && currentLoadedMapId === 'polar_ice_canyon') {
                marsEnv.applyLoadedGlacialSpires(template);
              }
            })
            .catch(() => {});
        }
      }
    };

    const attach3DCompoundBowAndAxe = async (rifleRig: ReturnType<typeof createMountedSciFiPulseRifle>) => {
      try {
        const [{ template: bowTpl }, { template: axeTpl }] = await Promise.all([
          fetchTemplate(['/robotics_glb/tactical_compound_bow.glb']),
          fetchTemplate(['/robotics_glb/high_freq_combat_axe.glb'])
        ]);
        if (disposed || playerRifle !== rifleRig) return;

        const bowCloned = cloneSceneWithSkeletonSupport(bowTpl);
        const { pivot: bowPivot, meshes: bowMeshes } = normalizeAndGroundGlbGroup(
          bowCloned,
          0.98,
          isSoftwareGl,
          '#10b981',
          false
        );
        bowPivot.position.set(0.28, -0.44, 0);
        bowPivot.visible = false;
        rifleRig.group.add(bowPivot);
        playerBowGroup = bowPivot;

        const axeCloned = cloneSceneWithSkeletonSupport(axeTpl);
        const { pivot: axePivot, meshes: axeMeshes } = normalizeAndGroundGlbGroup(
          axeCloned,
          0.95,
          isSoftwareGl,
          '#10b981',
          false
        );
        axePivot.position.set(0.24, -0.22, 0);
        axePivot.rotation.z = -Math.PI * 0.22;
        axePivot.visible = false;
        rifleRig.group.add(axePivot);
        playerAxeGroup = axePivot;

        playerWeaponAddonMeshes.push(...bowMeshes, ...axeMeshes);
      } catch {
        // Procedural fallback stays active if weapon GLB still streaming
      }
    };

    const syncPlayerMechModel = async (mechId: PlayerMechId) => {
      if (disposed || currentLoadedPlayerMechId === mechId) return;
      currentLoadedPlayerMechId = mechId;
      const spec = getPlayableMechSpec(mechId);
      try {
        const { template, joints } = await fetchTemplate(spec.glbUrls, spec.urdfUrl);
        if (disposed || selectedMechRef.current !== mechId) return;
        if (playerRifle) {
          playerRifle.dispose();
          playerRifle = null;
        }
        playerBowGroup = null;
        playerAxeGroup = null;
        disposeClonedRigMeshes(playerWeaponAddonMeshes);
        playerWeaponAddonMeshes = [];

        if (playerHuskyCarrierPivot) {
          playerRoot.remove(playerHuskyCarrierPivot);
          playerHuskyCarrierPivot = null;
          disposeClonedRigMeshes(playerHuskyCarrierMeshes);
          playerHuskyCarrierMeshes = [];
        }
        if (playerCarrier) {
          playerRoot.remove(playerCarrier.group);
          playerCarrier.dispose();
          playerCarrier = null;
        }
        playerTurretMount = null;
        playerRoverWheels = [];
        if (playerModelPivot) {
          playerRoot.remove(playerModelPivot);
          disposeClonedRigMeshes(playerMeshes);
          playerMeshes = [];
        }

        const cloned = cloneSceneWithSkeletonSupport(template);
        const isStationaryArm = mechId === 'unitree_z1' || mechId === 'baxter_dual_arm';
        const effectiveDim = isStationaryArm ? spec.targetMaxDim * 0.82 : spec.targetMaxDim;
        const { pivot, normScale, meshes } = normalizeAndGroundGlbGroup(
          cloned,
          effectiveDim,
          isSoftwareGl,
          '#00e5ff',
          false
        );

        // Mount stationary robotic arms onto a real Clearpath Husky 4x4 UGV Chassis (with procedural fallback)!
        if (isStationaryArm) {
          try {
            const { template: huskyTpl } = await fetchTemplate([
              '/robotics_glb/clearpath_husky_ugv.glb'
            ]);
            if (disposed || selectedMechRef.current !== mechId) return;
            const huskyCloned = cloneSceneWithSkeletonSupport(huskyTpl);
            const { pivot: hPivot, meshes: hMeshes } = normalizeAndGroundGlbGroup(
              huskyCloned,
              mechId === 'baxter_dual_arm' ? 1.85 : 1.58,
              isSoftwareGl,
              '#38bdf8',
              false
            );
            playerRoot.add(hPivot);
            playerHuskyCarrierPivot = hPivot;
            playerHuskyCarrierMeshes = hMeshes;
            const hBox = new THREE.Box3().setFromObject(hPivot);
            pivot.position.y = Math.max(0.42, hBox.max.y * 0.92);
            playerRoverWheels.push(...collectRoverWheelNodes(hPivot));
          } catch {
            const carrier = createArmoredManipulatorCarrierBase(mechId, isSoftwareGl);
            playerRoot.add(carrier.group);
            pivot.position.y = carrier.mountHeight;
            playerCarrier = carrier;
          }
        }

        playerRoot.add(pivot);
        playerModelPivot = pivot;
        playerMeshes = meshes;
        playerUrdfJoints = bindUrdfJointsToRoot(
          pivot,
          mechId === 'spot_arm' ? SPOT_ARM_MJCF_JOINTS : joints
        );

        if (mechId === 'mars2020' || mechId === 'hello_stretch' || mechId === 'husky_ugv') {
          playerRoverWheels.push(...collectRoverWheelNodes(pivot));
        }

        // Attach Sci-Fi Pulse Rifle + 3D Compound Bow + 3D War-Axe to humanoid/manipulator/Spot-Arm hand or dorsal turret
        let handSocketNode: THREE.Object3D | null = null;
        if (
          mechId === 'unitree_g1' ||
          mechId === 'nasa_valkyrie' ||
          mechId === 'spot_arm' ||
          mechId === 'unitree_h1' ||
          mechId === 'fourier_gr1' ||
          mechId === 'talos_humanoid' ||
          mechId === 'unitree_z1'
        ) {
          const priorityPatterns =
            mechId === 'unitree_z1'
              ? ['link06', 'joint6', 'link05']
              : mechId === 'spot_arm'
                ? ['arm_link_wr0', 'arm_link_fngr']
                : [
                    'right_hand_palm_link',
                    'rightpalm',
                    'right_wrist_yaw_link',
                    'right_wrist_pitch_link',
                    'rightforearm',
                    'right_hand',
                    'arm_right_7_link',
                    'r_wrist',
                    'right_elbow'
                  ];
          for (const pat of priorityPatterns) {
            pivot.traverse((o) => {
              if (!handSocketNode && o.name && o.name.toLowerCase().includes(pat)) {
                handSocketNode = o;
              }
            });
            if (handSocketNode) break;
          }
        }

        if (handSocketNode) {
          const rifle = createMountedSciFiPulseRifle(mechId, true, 1 / Math.max(0.1, normScale));
          rifle.group.position.set(0.03, 0, 0.01);
          (handSocketNode as THREE.Object3D).add(rifle.group);
          playerRifle = rifle;
          attach3DCompoundBowAndAxe(rifle);
        } else {
          const turret = new THREE.Group();
          const mountY =
            mechId === 'unitree_go2' || mechId === 'anymal_c' || mechId === 'spot_arm'
              ? 0.94
              : mechId === 'unitree_b2' || mechId === 'husky_ugv'
                ? 1.06
                : mechId === 'sar'
                  ? 1.18
                  : 1.48;
          turret.position.set(0.18, mountY, 0.22);
          const rifle = createMountedSciFiPulseRifle(mechId, false, 1.0);
          turret.add(rifle.group);
          pivot.add(turret);
          playerTurretMount = turret;
          playerRifle = rifle;
          attach3DCompoundBowAndAxe(rifle);
        }
      } catch (err) {
        console.warn('Player mech GLB load warning:', err);
      }
    };

    // Pre-warm Player Mech + Allied Wingman Go2 + All Enemy Archetypes + Tactical Weapons & Polar Spires
    (async () => {
      setIsLoadingAssets(true);
      await syncPlayerMechModel(selectedMechRef.current);
      const go2Spec = ENEMY_ARCHETYPE_SPECS.go2_hound;
      try {
        const { template: wTpl, joints: wJoints } = await fetchTemplate(
          go2Spec.glbUrls,
          go2Spec.urdfUrl
        );
        if (!disposed) {
          const wCloned = cloneSceneWithSkeletonSupport(wTpl);
          const { pivot: wPivot, meshes: wMeshes } = normalizeAndGroundGlbGroup(
            wCloned,
            0.86,
            isSoftwareGl,
            '#00e5ff',
            false
          );
          wingmanRoot.add(wPivot);
          wingmanMeshes = wMeshes;
          wingmanUrdfJoints = bindUrdfJointsToRoot(wPivot, wJoints);
        }
      } catch {
        // Wingman fallback safe
      }
      await Promise.all([
        ...Object.values(ENEMY_ARCHETYPE_SPECS).map((es) =>
          fetchTemplate(es.glbUrls, es.urdfUrl).catch(() => null)
        ),
        fetchTemplate(['/robotics_glb/tactical_compound_bow.glb']).catch(() => null),
        fetchTemplate(['/robotics_glb/high_freq_combat_axe.glb']).catch(() => null),
        fetchTemplate(['/robotics_glb/infinigen_polar_ice_spires.glb']).catch(() => null)
      ]);
      if (!disposed) setIsLoadingAssets(false);
    })();

    // Active 3D Enemy Rigs Map
    const enemyRigs = new Map<number, Spawned3DEnemyRig>();
    const enemyGroupRoot = new THREE.Group();
    scene.add(enemyGroupRoot);
    const shieldSphereGeo = new THREE.SphereGeometry(1, 28, 20);

    const disposeEnemyRig = (rig: Spawned3DEnemyRig) => {
      if (rig.shieldDome) {
        (rig.shieldDome.material as THREE.Material).dispose();
      }
      if (rig.gunshipFrame) {
        rig.gunshipFrame.dispose();
      }
      disposeClonedRigMeshes(rig.meshes);
      enemyGroupRoot.remove(rig.root);
    };

    const ensureEnemyRig = (uid: number, archetype: EnemyArchetypeId) => {
      if (enemyRigs.has(uid)) return enemyRigs.get(uid)!;
      const spec = ENEMY_ARCHETYPE_SPECS[archetype];
      const key = spec.glbUrls.join('|');
      const cached = glbCache.get(key);
      if (!cached) {
        fetchTemplate(spec.glbUrls, spec.urdfUrl).catch(() => null);
        return null;
      }
      const urdfDefs = spec.urdfUrl ? urdfCache.get(spec.urdfUrl) || [] : [];
      const rigRoot = new THREE.Group();
      const shadow = new THREE.Mesh(contactShadowGeo, contactShadowMat);
      shadow.scale.setScalar(
        archetype === 'ares_boss' || archetype === 'xeno_queen_boss'
          ? 2.85
          : archetype === 'xeno_spider'
            ? 0.65
            : 1.0
      );
      shadow.position.y = 0.03;
      rigRoot.add(shadow);

      const cloned = cloneSceneWithSkeletonSupport(cached);
      const { pivot, meshes } = normalizeAndGroundGlbGroup(
        cloned,
        spec.scaleDim,
        isSoftwareGl,
        spec.accentHex,
        true
      );
      rigRoot.add(pivot);

      // Collect spinning Skydio X2 quadrotor prop nodes on `aero_hunter`!
      const gunshipFrame: ReturnType<typeof createAeroHunterGunshipFrame> | null = null;
      const rotorNodes: THREE.Object3D[] = [];
      if (archetype === 'aero_hunter') {
        pivot.traverse((o) => {
          if (o.name && /fan|blade|rotor|prop|impeller|spinner/i.test(o.name)) {
            rotorNodes.push(o);
          }
        });
      }

      let shieldDome: THREE.Mesh | null = null;
      if (spec.maxShield > 0) {
        const domeMat = createLocalizedHexShieldMaterial(
          archetype === 'ares_boss' ? '#38bdf8' : '#00e5ff',
          archetype === 'ares_boss'
        );
        shieldDome = new THREE.Mesh(shieldSphereGeo, domeMat);
        shieldDome.position.y = archetype === 'ares_boss' ? 2.75 : spec.scaleDim * 0.44;
        shieldDome.scale.setScalar(spec.hitRadius * 1.08);
        rigRoot.add(shieldDome);
      }

      const joints = bindUrdfJointsToRoot(pivot, urdfDefs);
      enemyGroupRoot.add(rigRoot);
      const rig: Spawned3DEnemyRig = {
        uid,
        archetype,
        root: rigRoot,
        modelPivot: pivot,
        joints,
        meshes,
        rotorNodes,
        gunshipFrame,
        shieldDome
      };
      enemyRigs.set(uid, rig);
      return rig;
    };

    // Canvas PointerLock & Uniform-Sensitivity 3rd-Person Shooter Aiming
    let lastMouseX = 0;
    let lastMouseY = 0;

    const updateNdcFromClient = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) return;
      inputHubRef.current.pointerNdcX = ((clientX - rect.left) / rect.width) * 2 - 1;
      inputHubRef.current.pointerNdcY = -((clientY - rect.top) / rect.height) * 2 + 1;
    };

    const onPointerDown = (ev: PointerEvent) => {
      updateNdcFromClient(ev.clientX, ev.clientY);
      lastMouseX = ev.clientX;
      lastMouseY = ev.clientY;
      inputHubRef.current.hasPointerSample = true;
      if (shellStateRef.current !== 'playing') return;

      if (document.pointerLockElement !== renderer.domElement) {
        try {
          const lockPromise = renderer.domElement.requestPointerLock?.() as
            | Promise<void>
            | undefined;
          if (lockPromise && typeof lockPromise.catch === 'function') {
            lockPromise.catch(() => {});
          }
        } catch {
          // Graceful fallback when PointerLock is disallowed in headless environments
        }
      }

      if (ev.button === 0) {
        inputHubRef.current.mouseHeldL = true;
      } else if (ev.button === 1) {
        ev.preventDefault();
        inputHubRef.current.wingmanCommandJustPressed = true;
      } else if (ev.button === 2) {
        inputHubRef.current.missileJustPressed = true;
      }
    };

    const onPointerMove = (ev: PointerEvent) => {
      const isLocked = document.pointerLockElement === renderer.domElement;
      if (!inputHubRef.current.hasPointerSample) {
        lastMouseX = ev.clientX;
        lastMouseY = ev.clientY;
        inputHubRef.current.hasPointerSample = true;
      }
      const dx = isLocked ? ev.movementX : ev.clientX - lastMouseX;
      const dy = isLocked ? ev.movementY : ev.clientY - lastMouseY;
      lastMouseX = ev.clientX;
      lastMouseY = ev.clientY;

      if (isLocked) {
        inputHubRef.current.pointerNdcX = 0;
        inputHubRef.current.pointerNdcY = 0;
      } else {
        updateNdcFromClient(ev.clientX, ev.clientY);
      }

      if (shellStateRef.current === 'playing') {
        // Uniform shooter mouse sensitivity (zero 2.88x jump when holding LMB!)
        const sensitivity = 0.0022;
        inputHubRef.current.camYaw += dx * sensitivity;
        inputHubRef.current.camPitch = THREE.MathUtils.clamp(
          inputHubRef.current.camPitch - dy * sensitivity * 0.78,
          -0.48,
          0.36
        );
      }
    };

    const onPointerUp = (ev: PointerEvent) => {
      if (ev.button === 0) {
        inputHubRef.current.mouseHeldL = false;
      }
    };

    const onContextMenu = (ev: MouseEvent) => {
      if (shellStateRef.current === 'playing') {
        ev.preventDefault();
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('contextmenu', onContextMenu);

    const resizeObs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(320, Math.floor(entry.contentRect.width));
        const h = Math.max(240, Math.floor(entry.contentRect.height));
        const nextDpr = isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setPixelRatio(nextDpr);
        renderer.setSize(w, h);
        combatPost.setSize(w, h, nextDpr);
      }
    });
    resizeObs.observe(container);

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
            frameId = window.setTimeout(cb, 80);
          }
        };
        frameId = window.setTimeout(poll, 5);
      } else {
        frameId = window.setTimeout(cb, 80);
      }
    }

    let lastTime = performance.now();
    let simElapsed = 0;
    let lastHudSyncAt = 0;

    const syncPlayerRigTransforms = (
      wState: MarsCombatWorldState,
      camYaw: number,
      camPitch: number
    ) => {
      const legged = isLeggedCombatMech(selectedMechRef.current);
      const heavyCrouchDrop = legged
        ? Math.min(1, wState.heavyPostureTimer / 0.22) * 0.16
        : 0;
      playerRoot.position.set(wState.x, wState.y - heavyCrouchDrop, wState.z);
      playerRoot.rotation.set(0, -wState.yaw, 0);
      if (playerModelPivot) {
        playerModelPivot.rotation.set(0, 0, wState.dodgeBankRad);
      }
      if (playerTurretMount) {
        let relTurretYaw = camYaw - wState.yaw;
        while (relTurretYaw > Math.PI) relTurretYaw -= Math.PI * 2;
        while (relTurretYaw < -Math.PI) relTurretYaw += Math.PI * 2;
        playerTurretMount.rotation.set(0, -relTurretYaw, camPitch + wState.recoilPos * 0.22);
      }
    };

    const tick = () => {
      if (disposed) return;
      const nowMs = performance.now();
      const rawDt = (nowMs - lastTime) / 1000;
      lastTime = nowMs;
      const dt = Math.min(Math.max(rawDt, 0.001), 0.1);
      if (shellStateRef.current !== 'paused') {
        simElapsed += dt;
      }

      if (currentLoadedPlayerMechId !== selectedMechRef.current) {
        syncPlayerMechModel(selectedMechRef.current);
      }
      if (currentLoadedMapId !== selectedMapRef.current) {
        syncBattlefieldMap(selectedMapRef.current);
      }

      const wState = worldRef.current;
      const hub = inputHubRef.current;

      if (shellStateRef.current === 'title') {
        const tourAngle = simElapsed * 0.28 + hub.pointerNdcX * 0.35;
        const heroY = wState.y;
        playerRoot.position.set(0, heroY, 0);
        playerRoot.rotation.set(0, 0.45, 0);
        if (playerModelPivot) playerModelPivot.rotation.set(0, 0, 0);
        dodgeThrusterRig.update(0, false, simElapsed);
        if (playerRifle) playerRifle.updateWeaponVisuals('pulse_rifle', 0, 0, dt);

        sunKey.target.position.set(0, heroY, 0);
        sunKey.position.set(28, heroY + 42, -24);

        wingmanRoot.visible = true;
        wingmanRoot.position.set(1.15, heroY, 1.45);
        wingmanRoot.rotation.set(0, 0.38, 0);

        _tmpUrdfKin.gaitDistance = 0;
        _tmpUrdfKin.speed = 0;
        _tmpUrdfKin.vy = 0;
        _tmpUrdfKin.turnVel = 0;
        _tmpUrdfKin.pitch = 0;
        _tmpUrdfKin.isBoosting = false;
        _tmpUrdfKin.isGrounded = true;
        for (let ji = 0; ji < playerUrdfJoints.length; ji++) {
          const j = playerUrdfJoints[ji];
          const baseAng = computeSandboxUrdfJointAngle(
            selectedMechRef.current,
            j.def,
            ji,
            _tmpUrdfKin,
            simElapsed,
            0
          );
          const ikAng = computeCombatUpperLowerBodyIK({
            mechId: selectedMechRef.current,
            jointName: j.def.name,
            axis: j.def.axis,
            limitLower: j.def.lower,
            limitUpper: j.def.upper,
            baseGaitAngle: baseAng,
            chassisYaw: -0.45,
            aimYaw: -0.35 + hub.pointerNdcX * 0.25,
            aimPitch: hub.pointerNdcY * 0.15,
            recoilPos: 0,
            heavyPostureTimer: 0,
            wingmanCommandTimer: 0
          });
          _qAxis.setFromAxisAngle(j.axisVec, ikAng);
          j.node.quaternion.copy(j.baseQuat).multiply(_qAxis);
        }

        const camDist = 6.2;
        camera.position.set(
          Math.cos(tourAngle) * camDist - 1.1,
          heroY + 2.35 + hub.pointerNdcY * 0.35,
          Math.sin(tourAngle) * camDist + 1.4
        );
        camera.lookAt(-1.25, heroY + 1.25, 0.2);
        marsEnv.updateAtmosphere(dt, 0, 0, simElapsed);
      } else if (shellStateRef.current === 'playing') {
        const moveFwd =
          (hub.keysHeld.has('KeyW') || hub.keysHeld.has('ArrowUp') ? 1 : 0) -
          (hub.keysHeld.has('KeyS') || hub.keysHeld.has('ArrowDown') ? 1 : 0);
        const moveRight =
          (hub.keysHeld.has('KeyD') || hub.keysHeld.has('ArrowRight') ? 1 : 0) -
          (hub.keysHeld.has('KeyA') || hub.keysHeld.has('ArrowLeft') ? 1 : 0);
        const fireHeld = hub.mouseHeldL || hub.keysHeld.has('Enter');

        // Keyboard left/right camera assist when turning with arrow keys
        if (hub.keysHeld.has('ArrowLeft')) hub.camYaw -= 1.8 * dt;
        if (hub.keysHeld.has('ArrowRight')) hub.camYaw += 1.8 * dt;

        // Raycast center reticle (0, 0.06) === screen (50%, calc(50% - 3vh)), filtering out behind-player parallax hits!
        _ndc.set(0, 0.06);
        _raycaster.setFromCamera(_ndc, camera);
        const camToPlayerDist = Math.hypot(
          wState.x - camera.position.x,
          wState.y + 1.2 - camera.position.y,
          wState.z - camera.position.z
        );
        const minAimHitDist = Math.max(1.5, camToPlayerDist + 0.5);

        const pickMeshes: THREE.Object3D[] = [
          marsEnv.terrainMesh,
          marsEnv.coverBoulderInst,
          marsEnv.pylonGroup
        ];
        enemyRigs.forEach((r) => {
          if (r.root.visible) pickMeshes.push(r.modelPivot);
        });
        const hits = _raycaster.intersectObjects(pickMeshes, true);
        const validHit = hits.find((h) => h.distance > minAimHitDist);
        let aimWorld: [number, number, number];
        if (validHit) {
          aimWorld = [validHit.point.x, validHit.point.y, validHit.point.z];
        } else {
          _projVec.copy(_raycaster.ray.direction).multiplyScalar(56).add(_raycaster.ray.origin);
          aimWorld = [_projVec.x, _projVec.y, _projVec.z];
        }

        // Pre-sync turret/chassis orientation to current aim BEFORE reading muzzle socket (eliminates 1-frame muzzle lag!)
        syncPlayerRigTransforms(wState, hub.camYaw, hub.camPitch);
        let muzzleWorldPoint: [number, number, number] | null = null;
        if (playerRifle) {
          playerRoot.updateMatrixWorld(true);
          playerRifle.muzzleSocket.getWorldPosition(_muzzleWorldVec);
          muzzleWorldPoint = [_muzzleWorldVec.x, _muzzleWorldVec.y, _muzzleWorldVec.z];
        }

        const stepInput = {
          moveForward: moveFwd,
          moveRight,
          sprintHeld: hub.keysHeld.has('ShiftLeft') || hub.keysHeld.has('ShiftRight'),
          fireHeld,
          missileJustPressed: hub.missileJustPressed,
          meleeJustPressed: hub.meleeJustPressed,
          jumpJustPressed: hub.jumpJustPressed,
          jumpHeld: hub.keysHeld.has('Space'),
          dashJustPressed: hub.dashJustPressed,
          empJustPressed: hub.empJustPressed,
          wingmanCommandJustPressed: hub.wingmanCommandJustPressed,
          ultimateJustPressed: hub.ultimateJustPressed,
          summonBossJustPressed: hub.summonBossJustPressed,
          summonQueenJustPressed: hub.summonQueenJustPressed,
          ventJustPressed: hub.ventJustPressed,
          aimYaw: hub.camYaw,
          aimPitch: hub.camPitch,
          aimWorldPoint: aimWorld,
          muzzleWorldPoint
        };
        hub.missileJustPressed = false;
        hub.meleeJustPressed = false;
        hub.jumpJustPressed = false;
        hub.dashJustPressed = false;
        hub.empJustPressed = false;
        hub.wingmanCommandJustPressed = false;
        hub.ultimateJustPressed = false;
        hub.summonBossJustPressed = false;
        hub.summonQueenJustPressed = false;
        hub.ventJustPressed = false;

        // Engine natively handles hitstop + lossless one-shot input buffering (zero double-hitstop!)
        stepMarsCombatWorld(wState, dt, stepInput);

        // Tactile Camera Micro-Impulse on heavy weapon fire, melee cleave, shield shatter, kills, and Boss breaks
        if (
          wState.events.firedWeapon === 'railgun' ||
          wState.events.firedWeapon === 'orbital_ion' ||
          wState.events.firedWeapon === 'melee_axe'
        ) {
          camMicroImpulse = triggerCameraMicroImpulse(
            wState.events.firedWeapon === 'orbital_ion' ? 1.05 : 0.78,
            [-Math.cos(hub.camYaw), 0.25, -Math.sin(hub.camYaw)],
            0.14
          );
        } else if (
          wState.events.firedWeapon === 'missile_pod' ||
          wState.events.firedWeapon === 'compound_bow'
        ) {
          camMicroImpulse = triggerCameraMicroImpulse(0.52, [0, -0.8, 0.2], 0.11);
        }
        if (
          wState.events.hitConfirmed?.shieldShattered ||
          wState.events.hitConfirmed?.kill ||
          wState.events.bossCue === 'acs_stagger_break' ||
          wState.events.bossCue === 'emp_nova'
        ) {
          camMicroImpulse = triggerCameraMicroImpulse(0.9, [0.18, -0.95, 0.12], 0.14);
        }

        if (wState.events.ejectedShell) {
          vfxCtrl.spawnEjectedShell(wState.events.ejectedShell);
        }
        for (const imp of wState.events.sparkImpacts) {
          vfxCtrl.spawnDirectionalHitSparks(imp);
        }

        if (audioEnabledRef.current) {
          if (wState.events.firedWeapon) {
            proceduralAudioSynth.playCombatWeaponFire(wState.events.firedWeapon, true);
          }
          if (wState.events.wingmanPounced) {
            proceduralAudioSynth.playWingmanCommandPing(true);
          }
          if (wState.events.hitConfirmed) {
            if (wState.events.hitConfirmed.shieldShattered) {
              proceduralAudioSynth.playShieldShatterBurst(true);
            }
            proceduralAudioSynth.playCodHitmarkerTick(
              wState.events.hitConfirmed.crit,
              wState.events.hitConfirmed.kill,
              true
            );
          }
          if (wState.events.bossCue) {
            proceduralAudioSynth.playBossEventCue(wState.events.bossCue, true);
          }
        }

        if (wState.shellState === 'gameover') {
          shellStateRef.current = 'gameover';
          setRunSummary(wState.runSnapshot);
          setShellState('gameover');
        }

        // Update Player 3D Pose, Carrier/Rover Wheel Spin, & Split Upper/Lower Body Aiming IK
        syncPlayerRigTransforms(wState, hub.camYaw, hub.camPitch);

        // Snap shadow frustum center to 0.5m texels around player to prevent shadow-edge swimming
        const snapX = Math.round(wState.x * 2) * 0.5;
        const snapZ = Math.round(wState.z * 2) * 0.5;
        sunKey.target.position.set(snapX, wState.y, snapZ);
        sunKey.position.set(snapX + 28, wState.y + 42, snapZ - 24);

        if (playerCarrier) {
          const wheelAngle = -wState.gaitDist / Math.max(0.12, playerCarrier.wheelRadius);
          for (const w of playerCarrier.wheels) {
            w.rotation.z = wheelAngle;
          }
        }
        if (playerRoverWheels.length > 0) {
          const rSpin = wState.gaitDist / 0.26;
          for (const rw of playerRoverWheels) {
            _wheelSpinQuat.setFromAxisAngle(rw.axis, rSpin);
            rw.node.quaternion.copy(rw.baseQuat).multiply(_wheelSpinQuat);
          }
        }

        const pSpeed = Math.hypot(wState.vx, wState.vz);
        _tmpUrdfKin.gaitDistance = wState.gaitDist;
        _tmpUrdfKin.speed = pSpeed;
        _tmpUrdfKin.vy = wState.vy;
        _tmpUrdfKin.turnVel = 0;
        _tmpUrdfKin.pitch = 0;
        _tmpUrdfKin.isBoosting = wState.dashTimer > 0;
        _tmpUrdfKin.isGrounded = wState.isGrounded;
        for (let ji = 0; ji < playerUrdfJoints.length; ji++) {
          const j = playerUrdfJoints[ji];
          const baseGait = computeSandboxUrdfJointAngle(
            selectedMechRef.current,
            j.def,
            ji,
            _tmpUrdfKin,
            simElapsed,
            0
          );
          const ikAng = computeCombatUpperLowerBodyIK({
            mechId: selectedMechRef.current,
            jointName: j.def.name,
            axis: j.def.axis,
            limitLower: j.def.lower,
            limitUpper: j.def.upper,
            baseGaitAngle: baseGait,
            chassisYaw: wState.yaw,
            aimYaw: hub.camYaw,
            aimPitch: hub.camPitch,
            recoilPos: wState.recoilPos,
            heavyPostureTimer: wState.heavyPostureTimer,
            wingmanCommandTimer: wState.wingmanCommandTimer,
            activeWeapon: wState.activeWeapon,
            meleeSwingTimer: wState.meleeSwingTimer
          });
          _qAxis.setFromAxisAngle(j.axisVec, ikAng);
          j.node.quaternion.copy(j.baseQuat).multiply(_qAxis);
        }

        if (playerRifle) {
          const showAxe = wState.meleeSwingTimer > 0 && Boolean(playerAxeGroup);
          const showBow = !showAxe && wState.activeWeapon === 'compound_bow' && Boolean(playerBowGroup);
          playerRifle.barrelCluster.visible = !showAxe && !showBow;
          if (playerBowGroup) playerBowGroup.visible = showBow;
          if (playerAxeGroup) playerAxeGroup.visible = showAxe;
          playerRifle.updateWeaponVisuals(
            wState.activeWeapon,
            wState.muzzleFlashTimer,
            wState.recoilPos,
            dt
          );
        }
        dodgeThrusterRig.update(
          wState.dashTimer,
          !wState.isGrounded && wState.vy > 1.2,
          simElapsed
        );

        // Update Allied Wingman Go2 Companion 3D Rig & URDF Gait
        wingmanRoot.visible = true;
        wingmanRoot.position.set(wState.wingman.x, wState.wingman.y, wState.wingman.z);
        const leapPitch =
          wState.wingman.mode === 'pounce_leap'
            ? -0.28 * Math.cos((1 - wState.wingman.modeTimer / 0.52) * Math.PI)
            : 0;
        wingmanRoot.rotation.set(0, -wState.wingman.yaw, leapPitch);
        wingmanRingMat.opacity =
          wState.wingman.mode !== 'escort' ? 0.92 : 0.45 + Math.sin(simElapsed * 5) * 0.14;
        _tmpUrdfKin.gaitDistance = wState.wingman.gaitDist;
        _tmpUrdfKin.speed = Math.hypot(wState.wingman.vx, wState.wingman.vz);
        _tmpUrdfKin.vy = wState.wingman.mode === 'pounce_leap' ? 4.5 : 0;
        _tmpUrdfKin.isBoosting = wState.wingman.mode !== 'escort';
        _tmpUrdfKin.isGrounded = wState.wingman.mode !== 'pounce_leap';
        for (let ji = 0; ji < wingmanUrdfJoints.length; ji++) {
          const j = wingmanUrdfJoints[ji];
          const wAng = computeSandboxUrdfJointAngle(
            'unitree_go2',
            j.def,
            ji,
            _tmpUrdfKin,
            simElapsed + 3.7,
            wState.wingman.mode === 'bite_slash' ? 0.7 : 0
          );
          _qAxis.setFromAxisAngle(j.axisVec, wAng);
          j.node.quaternion.copy(j.baseQuat).multiply(_qAxis);
        }

        // Over-the-Shoulder 3rd-Person Spring-Arm Camera with Terrain/Obstacle Anti-Clipping
        const camBackDist = wState.dashTimer > 0 ? 7.6 : wState.heavyPostureTimer > 0 ? 6.15 : 6.6;
        const fwdX = Math.cos(hub.camYaw);
        const fwdZ = Math.sin(hub.camYaw);
        const rightX = -fwdZ;
        const rightZ = fwdX;

        const anchorX = wState.x + rightX * 0.55;
        const anchorY = wState.y + 1.65;
        const anchorZ = wState.z + rightZ * 0.55;

        const rawCamX = wState.x - fwdX * camBackDist + rightX * 1.15;
        const rawCamY = wState.y + 2.85 - Math.sin(hub.camPitch) * 3.2;
        const rawCamZ = wState.z - fwdZ * camBackDist + rightZ * 1.15;

        // 6-step Spring-Arm sweep from shoulder anchor to rawCam against MARS_BATTLEFIELD_OBSTACLES
        let armFraction = 1.0;
        for (let s = 1; s <= 6; s++) {
          const t = s / 6;
          const sx = anchorX + (rawCamX - anchorX) * t;
          const sy = anchorY + (rawCamY - anchorY) * t;
          const sz = anchorZ + (rawCamZ - anchorZ) * t;
          let blocked = false;
          for (const obs of MARS_BATTLEFIELD_OBSTACLES) {
            const dx = sx - obs.x;
            const dz = sz - obs.z;
            if (dx * dx + dz * dz < (obs.radius + 0.48) * (obs.radius + 0.48)) {
              const obsTop = sampleMarsArenaSurfaceHeight(obs.x, obs.z) + obs.height + 0.35;
              if (sy < obsTop) {
                blocked = true;
                break;
              }
            }
          }
          if (blocked) {
            armFraction = Math.max(0.24, (s - 1) / 6);
            break;
          }
        }

        const resolvedCamX = anchorX + (rawCamX - anchorX) * armFraction;
        const resolvedCamZ = anchorZ + (rawCamZ - anchorZ) * armFraction;
        const terrainFloorAtCam = sampleMarsArenaSurfaceHeight(resolvedCamX, resolvedCamZ) + 0.65;
        const resolvedCamY = Math.max(
          anchorY + (rawCamY - anchorY) * armFraction,
          terrainFloorAtCam
        );

        _camDesired.set(resolvedCamX, resolvedCamY, resolvedCamZ);
        const dampK = 1 - Math.exp(-14 * dt);
        camera.position.lerp(_camDesired, dampK);
        const liveFloorY = sampleMarsArenaSurfaceHeight(camera.position.x, camera.position.z) + 0.55;
        if (camera.position.y < liveFloorY) {
          camera.position.y = liveFloorY;
        }

        // Smooth Multi-Sine Camera-Local Trauma Shake (projected strictly along camera Right & Up — zero Math.random jitter!)
        const shake = wState.cameraTrauma * wState.cameraTrauma * 0.34;
        const shakeRight =
          (Math.sin(simElapsed * 37.0) * 0.6 + Math.sin(simElapsed * 61.0 + 1.3) * 0.4) * shake;
        const shakeUp =
          (Math.cos(simElapsed * 43.0 + 0.7) * 0.6 + Math.sin(simElapsed * 73.0) * 0.4) * shake;

        _camTarget.set(
          wState.x + fwdX * 14 + rightX * (0.65 + shakeRight),
          wState.y + 1.45 + Math.sin(hub.camPitch) * 12 + shakeUp,
          wState.z + fwdZ * 14 + rightZ * (0.65 + shakeRight)
        );
        camera.lookAt(_camTarget);

        const targetFov =
          wState.dashTimer > 0 ? 60 : wState.heavyPostureTimer > 0 ? 56.8 : 52;
        if (Math.abs(camera.fov - targetFov) > 0.1) {
          camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-14 * dt));
          camera.updateProjectionMatrix();
        }

        // Sync 3D Enemy Robot Rigs + Runtime Meshopt LOD0/1/2 + VTOL Rotors + Localized Shield!
        const liveUids = new Set<number>();
        for (const e of wState.enemies) {
          liveUids.add(e.uid);
          const rig = ensureEnemyRig(e.uid, e.archetype);
          if (!rig) continue;

          rig.root.visible = true;
          const invDrop = 1 - e.dropPodProgress;
          const dropOffset = e.dropPodProgress < 1 ? invDrop * invDrop * 16 : 0;
          rig.root.position.set(e.x, e.y + dropOffset, e.z);

          const koTilt = e.koTimer > 0 ? (1 - e.koTimer / 0.42) * 1.15 : 0;
          const staggerPitch =
            e.staggeredTimer > 0 ? 0.24 : e.shieldBreakStunTimer > 0 ? 0.16 : 0;
          const isBioOrWarrior =
            isBiologicalXenoEnemy(e.archetype) || e.archetype === 'deathless_vanguard';
          const eSpd = Math.hypot(e.vx, e.vz);
          const strideFreq = e.archetype === 'xeno_spider' ? 6.5 : e.isBoss ? 1.85 : 3.4;
          const bioBob =
            isBioOrWarrior && e.koTimer <= 0 && e.dropPodProgress >= 1
              ? Math.abs(Math.sin(e.gaitDist * strideFreq)) *
                Math.min(0.18, eSpd * (e.archetype === 'xeno_spider' ? 0.012 : 0.018))
              : 0;
          const bioLungePitch =
            isBioOrWarrior && e.attackPhase === 'active'
              ? -0.22
              : isBioOrWarrior && e.attackPhase === 'windup'
                ? 0.16
                : 0;
          const bioSwayRoll =
            isBioOrWarrior && eSpd > 0.5
              ? Math.sin(e.gaitDist * strideFreq) * (e.archetype === 'xeno_spider' ? 0.14 : 0.09)
              : 0;

          rig.root.position.set(e.x, e.y + dropOffset + bioBob, e.z);
          rig.root.rotation.set(staggerPitch, -e.yaw, koTilt + bioLungePitch);
          rig.modelPivot.rotation.set(e.hitTiltRoll + bioSwayRoll, 0, -e.hitTiltPitch);

          if (rig.rotorNodes.length > 0) {
            for (const rn of rig.rotorNodes) {
              _wheelSpinQuat.setFromAxisAngle(_wheelSpinAxis, 34 * dt);
              rn.quaternion.multiply(_wheelSpinQuat);
            }
          }

          if (rig.shieldDome) {
            const showShield =
              (e.shield > 0 || e.shieldShatterTimer > 0 || e.shieldRippleTimer > 0) &&
              e.koTimer <= 0;
            rig.shieldDome.visible = showShield;
            if (showShield) {
              const sMat = rig.shieldDome.material as THREE.ShaderMaterial;
              sMat.uniforms.uTime.value = simElapsed;
              sMat.uniforms.uShieldRatio.value =
                e.maxShield > 0
                  ? Math.max(e.shieldRippleTimer > 0 ? 0.25 : 0, e.shield / e.maxShield)
                  : 0;
              sMat.uniforms.uRippleTimer.value = e.shieldRippleTimer;
              sMat.uniforms.uShatterTimer.value = e.shieldShatterTimer;
              sMat.uniforms.uHitLocalDir.value.set(
                e.lastShieldHitLocalDir[0],
                e.lastShieldHitLocalDir[1],
                e.lastShieldHitLocalDir[2]
              );
            }
          }

          // Animate Enemy URDF Joints (TALOS Boss uses 32-DOF 'talos_humanoid' bipedal gait!)
          const actorKey =
            e.archetype === 'go2_hound'
              ? 'unitree_go2'
              : e.archetype === 'g1_vanguard'
                ? 'unitree_g1'
                : e.archetype === 'sar_siege'
                  ? 'sar'
                  : e.archetype === 'ares_boss'
                    ? 'talos_humanoid'
                    : 'rexrov2';
          _tmpUrdfKin.gaitDistance = e.gaitDist;
          _tmpUrdfKin.speed = eSpd;
          _tmpUrdfKin.vy = e.vy;
          _tmpUrdfKin.turnVel = 0;
          _tmpUrdfKin.pitch = 0;
          _tmpUrdfKin.isBoosting = e.attackPhase === 'active';
          _tmpUrdfKin.isGrounded = e.archetype !== 'aero_hunter';
          const eFireAnim = e.attackPhase === 'active' ? 0.5 : 0;
          for (let ji = 0; ji < rig.joints.length; ji++) {
            const j = rig.joints[ji];
            const ang = computeSandboxUrdfJointAngle(
              actorKey,
              j.def,
              ji,
              _tmpUrdfKin,
              simElapsed + e.uid,
              eFireAnim
            );
            _qAxis.setFromAxisAngle(j.axisVec, ang);
            j.node.quaternion.copy(j.baseQuat).multiply(_qAxis);
          }

          // Runtime Distance-Based Meshopt LOD0 / LOD1 / LOD2 Switching + Emissive State Feedback
          const distToCam = Math.hypot(
            e.x - camera.position.x,
            e.y - camera.position.y,
            e.z - camera.position.z
          );
          const lodTier = e.isBoss
            ? distToCam > 52
              ? 1
              : 0
            : distToCam > 42
              ? 2
              : distToCam > 20
                ? 1
                : 0;

          for (const m of rig.meshes) {
            if (m.lods) {
              const targetGeo =
                lodTier === 2 ? m.lods.lod2 : lodTier === 1 ? m.lods.lod1 : m.baseGeo;
              if (m.mesh.geometry !== targetGeo) {
                m.mesh.geometry = targetGeo;
              }
            }
            if (e.shieldBreakStunTimer > 0) {
              m.mat.emissive.setHex(0x00b8d4);
              m.mat.emissiveIntensity = 0.45 + Math.sin(simElapsed * 32) * 0.25;
            } else if (e.isBoss && e.bossPhase === 2) {
              m.mat.emissive.setHex(0xff1e4d);
              m.mat.emissiveIntensity = 0.55 + Math.sin(simElapsed * 10) * 0.25;
            } else if (e.staggeredTimer > 0) {
              m.mat.emissive.setHex(0xf59e0b);
              m.mat.emissiveIntensity = 0.7;
            } else {
              m.mat.emissive.copy(m.baseEmissive);
              m.mat.emissiveIntensity = m.baseEmissiveIntensity;
            }
          }
        }

        // Clean up defeated enemy 3D rigs + cloned materials (zero VRAM leak!)
        enemyRigs.forEach((rig, uid) => {
          if (!liveUids.has(uid)) {
            disposeEnemyRig(rig);
            enemyRigs.delete(uid);
          }
        });

        vfxCtrl.update({
          dt,
          simTime: simElapsed,
          projectiles: wState.projectiles,
          hazards: wState.hazards,
          pickups: wState.pickups,
          enemies: wState.enemies,
          empWaveTimer: wState.empWaveTimer,
          empWaveOrigin: wState.empWaveOrigin,
          ultimateBeamTimer: wState.ultimateBeamTimer,
          ultimateBeamTarget: wState.ultimateBeamTarget,
          explosions: wState.events.explosions,
          wingmanSlash: {
            x: wState.wingman.x,
            y: wState.wingman.y,
            z: wState.wingman.z,
            yaw: wState.wingman.yaw,
            flashTimer: wState.wingman.slashFlashTimer
          },
          playerMeleeSlash: {
            x: wState.x,
            y: wState.y,
            z: wState.z,
            yaw: hub.camYaw,
            swingTimer: wState.meleeSwingTimer
          }
        });
        marsEnv.updateAtmosphere(dt, wState.x, wState.z, simElapsed);

        // Throttled ~15Hz HUD Sync
        if (simElapsed - lastHudSyncAt >= 0.065) {
          lastHudSyncAt = simElapsed;
          const rectW = container.clientWidth || 1280;
          const rectH = container.clientHeight || 800;

          const enemyBars: HudSyncSnapshot['enemyScreenBars'] = [];
          for (const e of wState.enemies) {
            if (e.isBoss || e.koTimer > 0 || e.dropPodProgress < 0.85) continue;
            _projVec.set(e.x, e.y + (e.archetype === 'aero_hunter' ? 1.5 : 2.2), e.z);
            _projVec.project(camera);
            if (_projVec.z >= -1 && _projVec.z <= 1) {
              const sx = (_projVec.x * 0.5 + 0.5) * rectW;
              const sy = (-_projVec.y * 0.5 + 0.5) * rectH;
              if (sx > 40 && sx < rectW - 40 && sy > 50 && sy < rectH - 90) {
                enemyBars.push({
                  uid: e.uid,
                  x: sx,
                  y: sy,
                  hpPct: Math.max(0, Math.round((e.hp / e.maxHp) * 100)),
                  shieldPct:
                    e.maxShield > 0 ? Math.max(0, Math.round((e.shield / e.maxShield) * 100)) : 0,
                  staggered: e.staggeredTimer > 0,
                  locked: Math.hypot(_projVec.x, _projVec.y - 0.06) < 0.16
                });
              }
            }
          }

          const activeBoss = wState.enemies.find((e) => e.isBoss && e.koTimer <= 0) || null;
          let attackWarning: string | null = null;
          if (activeBoss) {
            if (activeBoss.staggeredTimer > 0) {
              attackWarning = 'ACS 架势崩溃 · 2.5x 弱点直击窗口';
            } else if (activeBoss.attackPhase === 'windup') {
              if (activeBoss.bossAttackKind === 'balteus_salvo') {
                attackWarning = '高危预警 · 环形蜂群追踪导弹齐射 [C 瞬步规避 / E 脉冲拦截]';
              } else if (activeBoss.bossAttackKind === 'coral_laser_sweep') {
                attackWarning = '高危预警 · 360° 红莲高能扫射巨炮 [Space 腾空跃过]';
              } else if (activeBoss.bossAttackKind === 'orbital_pillars') {
                attackWarning = '高危预警 · 天基电磁轰炸圈锁定 [脱离红圈]';
              } else if (activeBoss.bossAttackKind === 'queen_acid_barrage') {
                attackWarning = '高危预警 · 女皇强酸流星雨喷吐 [机动规避酸液池]';
              } else if (activeBoss.bossAttackKind === 'queen_tail_scythe') {
                attackWarning = '高危预警 · 女皇巨尾横扫突刺 [Space 跃起 / C 瞬步闪避]';
              } else if (activeBoss.bossAttackKind === 'queen_brood_call') {
                attackWarning = '高危预警 · 巢穴虫潮孵化召唤 [X 高周波战斧顺劈清群]';
              }
            }
          }

          const degHeading = (((Math.round((hub.camYaw * 180) / Math.PI) % 360) + 360) % 360);

          setHud({
            hp: Math.round(wState.hp),
            maxHp: wState.maxHp,
            ghostHp: Math.round(wState.ghostHp),
            shield: Math.round(wState.shield),
            maxShield: wState.maxShield,
            boostEnergy: Math.round(wState.boostEnergy),
            meleeCooldown: wState.meleeCooldown,
            empCooldown: wState.empCooldown,
            ultimateCharge: Math.round(wState.ultimateCharge),
            activeWeapon: wState.activeWeapon,
            spreadBloom: wState.spreadBloom,
            score: wState.score,
            bestScore: wState.bestScore,
            kills: wState.kills,
            vanguardTarget: wState.vanguardKillsTarget,
            combo: wState.combo,
            wave: wState.wave,
            headingDeg: degHeading,
            bossBannerTimer: wState.bossBannerTimer,
            bossIsQueen: activeBoss?.archetype === 'xeno_queen_boss',
            hitmarker: { ...wState.hitmarker },
            threatAnglesDeg: wState.threats.map((t) => ({
              id: t.id,
              deg: Math.round(
                (computeRelativeThreatAngleRad(
                  wState.x,
                  wState.z,
                  hub.camYaw,
                  t.worldX,
                  t.worldZ
                ) *
                  180) /
                  Math.PI
              ),
              opacity: Math.max(0, (t.life / t.maxLife) * t.intensity)
            })),
            killfeed: wState.killfeed.map((k) => ({ ...k })),
            enemyScreenBars: enemyBars,
            bossHud: activeBoss
              ? {
                  codeName:
                    activeBoss.bossPhase === 2
                      ? `${activeBoss.codeName} ${
                          activeBoss.archetype === 'xeno_queen_boss'
                            ? '[狂暴产卵二阶段]'
                            : '[红莲二阶段]'
                        }`
                      : activeBoss.codeName,
                  hp: Math.round(activeBoss.hp),
                  maxHp: activeBoss.maxHp,
                  ghostHpPct: Math.max(0, (activeBoss.ghostHp / activeBoss.maxHp) * 100),
                  shieldPct:
                    activeBoss.maxShield > 0
                      ? Math.max(0, (activeBoss.shield / activeBoss.maxShield) * 100)
                      : 0,
                  staggerPct: Math.min(100, (activeBoss.stagger / activeBoss.maxStagger) * 100),
                  staggered: activeBoss.staggeredTimer > 0,
                  phase: activeBoss.bossPhase,
                  attackWarning
                }
              : null,
            wingmanCooldown: wState.wingman.commandCooldown,
            wingmanMode: wState.wingman.mode,
            damagePopupsScreen: wState.damagePopups
              .map((dp) => {
                _projVec.set(dp.worldX, dp.worldY, dp.worldZ);
                _projVec.project(camera);
                if (_projVec.z < -1 || _projVec.z > 1) return null;
                return {
                  id: dp.id,
                  x: (_projVec.x * 0.5 + 0.5) * rectW,
                  y: (-_projVec.y * 0.5 + 0.5) * rectH,
                  amount: dp.amount,
                  isCrit: dp.isCrit,
                  isShield: dp.isShield,
                  opacity: Math.max(0, Math.min(1, dp.life / 0.45))
                };
              })
              .filter((x): x is NonNullable<typeof x> => x !== null)
          });
        }
      }

      // Freeze camera impulse & trauma vignette cleanly when paused
      const isPlayingNow = shellStateRef.current === 'playing';
      const impStep = stepCameraMicroImpulse(camMicroImpulse, isPlayingNow ? dt : 0);
      if (isPlayingNow) {
        camMicroImpulse = impStep.next;
      }
      const [impX, impY, impZ] = isPlayingNow ? impStep.offsetMeters : [0, 0, 0];
      camera.position.x += impX;
      camera.position.y += impY;
      camera.position.z += impZ;

      combatPost.render(scene, camera, {
        rawDt: Math.max(0.001, rawDt),
        simTime: simElapsed,
        anamorphicStrength: 0.44,
        impulseIntensity01: isPlayingNow
          ? Math.max(impStep.vignette01, worldRef.current.cameraTrauma * 0.45)
          : 0
      });

      camera.position.x -= impX;
      camera.position.y -= impY;
      camera.position.z -= impZ;

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    frameId = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObs.disconnect();
      if (document.pointerLockElement === renderer.domElement) {
        try {
          document.exitPointerLock?.();
        } catch {
          // Ignore
        }
      }
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('contextmenu', onContextMenu);

      enemyRigs.forEach((rig) => disposeEnemyRig(rig));
      enemyRigs.clear();
      disposeClonedRigMeshes(playerMeshes);
      disposeClonedRigMeshes(playerWeaponAddonMeshes);
      disposeClonedRigMeshes(playerHuskyCarrierMeshes);
      disposeClonedRigMeshes(wingmanMeshes);
      if (playerCarrier) playerCarrier.dispose();
      if (playerRifle) playerRifle.dispose();
      glbCache.forEach((tpl) =>
        disposeSceneHierarchy(tpl, {
          disposeGeometries: true,
          disposeMaterials: true,
          disposeTextures: true
        })
      );
      glbCache.clear();

      dodgeThrusterRig.dispose();
      wingmanRingGeo.dispose();
      wingmanRingMat.dispose();
      contactShadowGeo.dispose();
      contactShadowMat.dispose();
      softShadowTex.dispose();
      shieldSphereGeo.dispose();
      marsEnv.dispose();
      vfxCtrl.dispose();
      combatPost.dispose();
      envTex.dispose();
      renderer.dispose();
    };
  }, []);

  const currentMechSpec = getPlayableMechSpec(selectedMechId);
  const hpPct = Math.max(0, Math.min(100, (hud.hp / Math.max(1, hud.maxHp)) * 100));
  const ghostHpPct = Math.max(0, Math.min(100, (hud.ghostHp / Math.max(1, hud.maxHp)) * 100));
  const shieldPct = Math.max(0, Math.min(100, (hud.shield / Math.max(1, hud.maxShield)) * 100));
  const reticleGapPx = Math.round(8 + hud.spreadBloom * 240);

  return (
    <div
      data-testid="mars-combat-game-root"
      className="relative w-full h-screen bg-[#120705] overflow-hidden select-none text-slate-100"
    >
      {/* Dedicated Isolated Three.js WebGL Mount */}
      <div
        ref={canvasMountRef}
        data-testid="mars-combat-canvas"
        className="w-full h-full cursor-crosshair"
      />

      {/* Critical Low-HP Peripheral Screen Vignette */}
      {shellState === 'playing' && hpPct < 32 && (
        <div
          aria-hidden="true"
          className="fixed inset-0 pointer-events-none z-10"
          style={{
            boxShadow: 'inset 0 0 110px rgba(239, 68, 68, 0.45)'
          }}
        />
      )}

      {/* ===================================================================== */}
      {/* STATE 1: AAA LIVE-3D MARS TITLE SCREEN (Asymmetric Left Negative Space) */}
      {/* ===================================================================== */}
      {shellState === 'title' && (
        <div
          data-testid="mars-combat-title-screen"
          className="fixed inset-0 pointer-events-none z-20 flex flex-col justify-between p-8 md:p-12"
          style={{
            background:
              'linear-gradient(90deg, rgba(11,8,10,0.88) 0%, rgba(11,8,10,0.58) 38%, rgba(11,8,10,0.0) 68%)'
          }}
        >
          <div className="flex items-center justify-between">
            <div className="text-xs font-mono tracking-widest text-amber-300/90">
              JEZERO SECTOR · ORBITAL DEFENSE PROTOCOL
            </div>
            <div className="pointer-events-auto flex items-center gap-2.5">
              <button
                type="button"
                data-testid="title-open-sandbox-btn"
                onClick={() => onOpenFreeSandbox(selectedMechId)}
                className="px-3.5 py-2 rounded-lg bg-[#121620]/90 hover:border-cyan-400/70 border border-white/15 text-xs font-medium text-slate-100 transition cursor-pointer whitespace-nowrap"
              >
                自由实景沙盒
              </button>
              <button
                type="button"
                data-testid="title-open-hangar-btn"
                onClick={() => onOpenCadHangar(selectedMechId)}
                className="px-3.5 py-2 rounded-lg bg-[#121620]/90 hover:border-cyan-400/70 border border-white/15 text-xs font-medium text-slate-100 transition cursor-pointer whitespace-nowrap"
              >
                数字孪生机库
              </button>
            </div>
          </div>

          <div className="pointer-events-auto max-w-[440px] space-y-5 my-auto">
            <div className="space-y-3">
              <svg
                width="340"
                height="68"
                viewBox="0 0 340 68"
                aria-label="赤星战区 MARS FRONTLINE"
                className="overflow-visible"
              >
                <polygon
                  points="0,12 12,0 44,0 56,12 44,56 12,56"
                  fill="#1a0d0e"
                  stroke="#ff3b5c"
                  strokeWidth="1.8"
                />
                <polygon points="16,12 40,12 28,44" fill="#ff3b5c" />
                <circle cx="28" cy="22" r="4" fill="#fff1f2" />
                <text
                  x="70"
                  y="34"
                  fill="#f8fafc"
                  fontSize="30"
                  fontWeight="800"
                  letterSpacing="2"
                >
                  赤星机甲战区
                </text>
                <text
                  x="72"
                  y="54"
                  fill="#fb7185"
                  fontSize="12"
                  fontFamily="monospace"
                  fontWeight="700"
                  letterSpacing="4.5"
                >
                  MARS FRONTLINE · TITAN RAID
                </text>
              </svg>
              <p className="text-sm text-slate-300 leading-relaxed max-w-[38ch]">
                驾驶真实运动学机甲空降杰泽罗赤红战区或极冠冰封巢谷，迎击异形虫潮、不死重盾禁卫与双领主 Boss。
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="text-xs font-medium text-slate-300">选择空降战区地图</div>
              <div className="grid grid-cols-2 gap-2">
                {BATTLEFIELD_MAP_SPECS.map((mp) => {
                  const activeMap = mp.id === selectedMapId;
                  return (
                    <button
                      key={mp.id}
                      type="button"
                      data-testid={`combat-map-select-${mp.id}`}
                      onClick={() => {
                        selectedMapRef.current = mp.id;
                        worldRef.current.mapId = mp.id;
                        setSelectedMapId(mp.id);
                        if (audioEnabledRef.current) {
                          proceduralAudioSynth.playMechanicalLatchClick(840, true);
                        }
                      }}
                      className={`px-3 py-2 rounded-lg border text-left transition cursor-pointer ${
                        activeMap
                          ? mp.id === 'polar_ice_canyon'
                            ? 'bg-[#0e2030]/95 border-cyan-400 text-white'
                            : 'bg-[#1f1218]/95 border-[#ff3b5c] text-white'
                          : 'bg-[#11151e]/85 border-white/10 text-slate-300 hover:border-white/25'
                      }`}
                    >
                      <div className="text-xs font-semibold truncate">{mp.title}</div>
                      <div className="text-[10px] text-slate-400 truncate">{mp.subtitle}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium text-slate-300 flex items-center justify-between">
                <span>选择出击机体 ({PLAYABLE_MECH_SPECS.length} 款实装)</span>
                <span className="font-mono tabular-nums text-cyan-300">
                  AP {currentMechSpec.maxHp} · 护盾 {currentMechSpec.maxShield}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-1.5 max-h-[245px] overflow-y-auto pr-1">
                {PLAYABLE_MECH_SPECS.map((m) => {
                  const active = m.id === selectedMechId;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      data-testid={`combat-mech-select-${m.id}`}
                      onClick={() => {
                        selectedMechRef.current = m.id;
                        setSelectedMechId(m.id);
                        if (audioEnabledRef.current) {
                          proceduralAudioSynth.playMechanicalLatchClick(760, true);
                        }
                      }}
                      className={`px-3.5 py-2 rounded-lg border text-left flex items-center justify-between transition cursor-pointer ${
                        active
                          ? 'bg-[#1f1218]/95 border-[#ff3b5c] text-white'
                          : 'bg-[#11151e]/85 border-white/10 text-slate-300 hover:border-white/25 hover:text-white'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold truncate">{m.title}</div>
                        <div className="text-[11px] text-slate-400 truncate">{m.roleTag}</div>
                      </div>
                      <span className="text-[11px] font-mono text-rose-300 shrink-0 ml-2">
                        {m.codeName}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                data-start="true"
                data-testid="mars-combat-start-btn"
                onClick={() => startOrRestartDeployment()}
                className="px-7 py-3 rounded-lg bg-[#e11d48] hover:bg-[#f43f5e] text-white font-semibold text-sm tracking-wide shadow-[0_10px_28px_rgba(225,29,72,0.45)] transition cursor-pointer whitespace-nowrap"
              >
                {isLoadingAssets ? '立即出击 (流式同步中)' : '立即出击'}
              </button>
              <button
                type="button"
                onClick={onToggleAudio}
                className="px-4 py-3 rounded-lg bg-[#141821]/90 border border-white/15 hover:border-white/30 text-xs font-medium text-slate-200 transition cursor-pointer whitespace-nowrap"
              >
                {audioEnabled ? '声效：开启' : '声效：静音'}
              </button>
            </div>
          </div>

          <div className="text-xs font-mono text-slate-300/85 tracking-wide">
            WASD 机动 · Shift 推进冲刺 · 鼠标瞄准射击 · 1-4 切枪(含复合穿甲弓) · X 高周波战斧顺劈 · 右键/F 蜂群导弹 · C/Alt 瞬步 · Q 僚机扑咬 · E 脉冲盾 · V 天基离子炮 · B/N 召唤双领主
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* STATE 2: PLAYING VISOR HUD (>= 88% Clear Unobstructed 3D Playfield!)  */}
      {/* ===================================================================== */}
      {shellState === 'playing' && (
        <div className="fixed inset-0 pointer-events-none z-20">
          {hud.damagePopupsScreen.map((dp) => (
            <div
              key={dp.id}
              style={{
                transform: `translate3d(${Math.round(dp.x - 16)}px, ${Math.round(dp.y - 12)}px, 0)`,
                opacity: dp.opacity
              }}
              className={`absolute top-0 left-0 font-mono font-bold tabular-nums pointer-events-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)] ${
                dp.isCrit
                  ? 'text-sm text-amber-300'
                  : dp.isShield
                    ? 'text-xs text-cyan-300'
                    : 'text-xs text-slate-100'
              }`}
            >
              {dp.isCrit ? `CRIT ${dp.amount}` : dp.amount}
            </div>
          ))}

          {hud.enemyScreenBars.map((eb) => (
            <div
              key={eb.uid}
              style={{
                transform: `translate3d(${Math.round(eb.x - 24)}px, ${Math.round(eb.y - 16)}px, 0)`
              }}
              className="absolute top-0 left-0 w-12 space-y-0.5"
            >
              {eb.shieldPct > 0 && (
                <div className="h-1 w-full bg-black/75 overflow-hidden rounded-sm">
                  <div
                    style={{
                      transform: `scaleX(${eb.shieldPct / 100})`,
                      transformOrigin: 'left'
                    }}
                    className="h-full w-full bg-cyan-400"
                  />
                </div>
              )}
              <div className="h-1.5 w-full bg-black/80 border border-white/15 overflow-hidden rounded-sm">
                <div
                  style={{
                    transform: `scaleX(${eb.hpPct / 100})`,
                    transformOrigin: 'left'
                  }}
                  className={`h-full w-full ${eb.staggered ? 'bg-amber-400' : 'bg-rose-500'}`}
                />
              </div>
              {eb.locked && (
                <div className="text-[9px] font-mono text-amber-300 text-center leading-none">
                  LOCK
                </div>
              )}
            </div>
          ))}

          {/* 2. EXACT NDC (0, +0.06) === (50%, calc(50% - 3vh)) CoD Dynamic Tactical Reticle */}
          <div
            aria-hidden="true"
            className="fixed left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            style={{ top: 'calc(50% - 3vh)' }}
          >
            <svg width="260" height="260" viewBox="-130 -130 260 260" className="overflow-visible">
              {hud.threatAnglesDeg.map((th) => (
                <g key={th.id} transform={`rotate(${th.deg})`} opacity={th.opacity}>
                  <path
                    d="M -24 -94 A 98 98 0 0 1 24 -94"
                    fill="none"
                    stroke="#ff2a55"
                    strokeWidth="4.5"
                    strokeLinecap="round"
                  />
                  <polygon points="0,-108 -7,-96 7,-96" fill="#ff2a55" />
                </g>
              ))}

              <circle cx="0" cy="0" r="2" fill="#00e5ff" />
              <line
                x1={-reticleGapPx - 10}
                y1="0"
                x2={-reticleGapPx}
                y2="0"
                stroke="#e2e8f0"
                strokeWidth="1.6"
              />
              <line
                x1={reticleGapPx}
                y1="0"
                x2={reticleGapPx + 10}
                y2="0"
                stroke="#e2e8f0"
                strokeWidth="1.6"
              />
              <line
                x1="0"
                y1={-reticleGapPx - 10}
                x2="0"
                y2={-reticleGapPx}
                stroke="#e2e8f0"
                strokeWidth="1.6"
              />
              <line
                x1="0"
                y1={reticleGapPx}
                x2="0"
                y2={reticleGapPx + 10}
                stroke="#e2e8f0"
                strokeWidth="1.6"
              />

              {hud.hitmarker.timer > 0 && (
                <g
                  stroke={
                    hud.hitmarker.isKill
                      ? '#ff2a55'
                      : hud.hitmarker.isCrit
                        ? '#f59e0b'
                        : hud.hitmarker.isShield
                          ? '#00e5ff'
                          : '#ffffff'
                  }
                  strokeWidth={hud.hitmarker.isKill || hud.hitmarker.isCrit ? '2.6' : '1.9'}
                  strokeLinecap="round"
                >
                  <line x1="-13" y1="-13" x2="-5" y2="-5" />
                  <line x1="13" y1="-13" x2="5" y2="-5" />
                  <line x1="-13" y1="13" x2="-5" y2="5" />
                  <line x1="13" y1="13" x2="5" y2="5" />
                </g>
              )}
            </svg>
            {hud.hitmarker.timer > 0 && hud.hitmarker.isCrit && (
              <div className="absolute left-1/2 top-1/2 translate-x-4 -translate-y-5 text-[11px] font-mono font-bold text-amber-300 whitespace-nowrap">
                CRIT {hud.hitmarker.lastDamage}
              </div>
            )}
          </div>

          {/* 3. TOP-CENTER: Slim Military Azimuth Strip + Armored Core 6 Boss HP & ACS Stagger Bar */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 w-[min(540px,62vw)]">
            <div className="flex items-center gap-4 px-4 py-1 rounded-md bg-[#0b0e14]/85 border border-white/10 text-xs font-mono tabular-nums">
              <span className="text-slate-400">HDG {String(hud.headingDeg).padStart(3, '0')}°</span>
              <span className="text-slate-600">|</span>
              <span className="text-rose-300 font-semibold">WAVE {hud.wave}</span>
              <span className="text-slate-600">|</span>
              <span className="text-slate-200">
                歼敌 {hud.kills}
                {!hud.bossHud ? ` / ${hud.vanguardTarget}` : ''}
              </span>
              <span className="text-slate-600">|</span>
              <span className="text-cyan-300 font-bold">SCORE {hud.score}</span>
              {hud.combo > 1 && (
                <span className="text-amber-300 font-bold">{hud.combo}x COMBO</span>
              )}
            </div>

            {hud.bossBannerTimer > 0 && (
              <div
                data-testid="boss-arrival-warning-banner"
                className={`px-5 py-1.5 rounded-md border text-xs font-mono font-bold tracking-widest shadow-2xl ${
                  hud.bossIsQueen
                    ? 'bg-[#10260d]/95 border-lime-400 text-lime-100'
                    : 'bg-[#280810]/95 border-[#ff2a55] text-rose-100'
                }`}
              >
                {hud.bossIsQueen
                  ? 'WARNING · 巢穴异形禁卫女皇已破冰苏醒'
                  : 'WARNING · 轨道核能泰坦领主已空降战区'}
              </div>
            )}

            {hud.bossHud && (
              <div
                data-testid="mars-boss-hud-bar"
                className="w-full px-4 py-2 rounded-lg bg-[#0d0a10]/90 border border-rose-500/45 shadow-2xl space-y-1.5"
              >
                <div className="flex items-center justify-between text-xs font-mono tabular-nums">
                  <span className="font-bold text-rose-100 tracking-wide">
                    {hud.bossHud.codeName}
                  </span>
                  <span className="text-rose-300">
                    {hud.bossHud.hp} / {hud.bossHud.maxHp} AP
                  </span>
                </div>

                <div className="relative h-2.5 w-full bg-black/80 rounded-sm overflow-hidden border border-white/10">
                  <div
                    style={{
                      transform: `scaleX(${hud.bossHud.ghostHpPct / 100})`,
                      transformOrigin: 'left'
                    }}
                    className="absolute inset-0 bg-white/70 transition-transform duration-150"
                  />
                  <div
                    style={{
                      transform: `scaleX(${Math.max(0, hud.bossHud.hp / hud.bossHud.maxHp)})`,
                      transformOrigin: 'left'
                    }}
                    className={`absolute inset-0 ${
                      hud.bossHud.phase === 2 ? 'bg-[#ff1e4d]' : 'bg-rose-500'
                    }`}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-amber-300 shrink-0">ACS 架势</span>
                  <div className="relative h-1.5 flex-1 bg-black/80 rounded-sm overflow-hidden">
                    <div
                      style={{
                        transform: `scaleX(${hud.bossHud.staggerPct / 100})`,
                        transformOrigin: 'left'
                      }}
                      className={`h-full w-full ${
                        hud.bossHud.staggered || hud.bossHud.staggerPct > 80
                          ? 'bg-amber-400'
                          : 'bg-amber-500/85'
                      }`}
                    />
                  </div>
                  {hud.bossHud.shieldPct > 0 && (
                    <span className="text-[10px] font-mono text-cyan-300 tabular-nums shrink-0">
                      脉冲盾 {Math.round(hud.bossHud.shieldPct)}%
                    </span>
                  )}
                </div>

                {hud.bossHud.attackWarning && (
                  <div className="text-[11px] font-mono text-amber-200 truncate">
                    {hud.bossHud.attackWarning}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 4. TOP-RIGHT: Compact Utility Strip + CoD Tactical Killfeed */}
          <div className="absolute top-3 right-3 flex flex-col items-end gap-2">
            <div className="pointer-events-auto flex items-center gap-1.5">
              {!hud.bossHud && (
                <>
                  <button
                    type="button"
                    tabIndex={-1}
                    data-testid="summon-queen-now-btn"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      worldRef.current.aimYaw = inputHubRef.current.camYaw;
                      summonXenoQueenBoss(worldRef.current);
                      if (audioEnabledRef.current) {
                        proceduralAudioSynth.playBossEventCue('xeno_screech', true);
                      }
                    }}
                    className="px-2.5 py-1.5 rounded-md bg-[#11260e]/90 hover:border-lime-400 border border-lime-500/55 text-[11px] font-mono font-semibold text-lime-200 cursor-pointer whitespace-nowrap"
                    title="立即召唤 XENO-OMEGA 巢穴异形禁卫女皇 Boss (快捷键 N)"
                  >
                    召唤异形女皇 [N]
                  </button>
                  <button
                    type="button"
                    tabIndex={-1}
                    data-testid="summon-boss-now-btn"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      worldRef.current.aimYaw = inputHubRef.current.camYaw;
                      summonAresBoss(worldRef.current);
                      if (audioEnabledRef.current) {
                        proceduralAudioSynth.playBossEventCue('boss_warning', true);
                      }
                    }}
                    className="px-2.5 py-1.5 rounded-md bg-[#260b12]/90 hover:border-rose-400 border border-rose-500/50 text-[11px] font-mono font-semibold text-rose-200 cursor-pointer whitespace-nowrap"
                    title="立即空投召唤 ARES-09 核能泰坦 Boss (快捷键 B)"
                  >
                    召唤泰坦 Boss [B]
                  </button>
                </>
              )}

              <button
                type="button"
                tabIndex={-1}
                data-testid="combat-switch-sandbox-btn"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onOpenFreeSandbox(selectedMechId);
                }}
                className="px-2.5 py-1.5 rounded-md bg-[#0b0e14]/90 hover:border-cyan-400/60 border border-white/15 text-[11px] font-medium text-slate-200 cursor-pointer whitespace-nowrap"
              >
                自由沙盒
              </button>

              <button
                type="button"
                tabIndex={-1}
                data-testid="combat-switch-hangar-btn"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onOpenCadHangar(selectedMechId);
                }}
                className="px-2.5 py-1.5 rounded-md bg-[#0b0e14]/90 hover:border-cyan-400/60 border border-white/15 text-[11px] font-medium text-slate-200 cursor-pointer whitespace-nowrap"
              >
                精拆机库
              </button>

              <button
                type="button"
                tabIndex={-1}
                aria-label={audioEnabled ? '静音音效 [M]' : '开启音效 [M]'}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onToggleAudio();
                }}
                className="w-8 h-8 rounded-md bg-[#0b0e14]/90 hover:border-white/30 border border-white/15 flex items-center justify-center text-slate-200 cursor-pointer"
                title="音效开关 [M]"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  {audioEnabled ? (
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14" />
                  ) : (
                    <line x1="23" y1="9" x2="17" y2="15" />
                  )}
                </svg>
              </button>

              <button
                type="button"
                tabIndex={-1}
                data-testid="combat-pause-btn"
                aria-label="暂停战斗 [P]"
                onClick={(e) => {
                  e.currentTarget.blur();
                  togglePauseGame();
                }}
                className="w-8 h-8 rounded-md bg-[#0b0e14]/90 hover:border-white/30 border border-white/15 flex items-center justify-center text-slate-200 cursor-pointer"
                title="暂停菜单 [P / Esc]"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              </button>
            </div>

            <div className="flex flex-col items-end gap-1">
              {hud.killfeed.map((kf) => (
                <div
                  key={kf.id}
                  className="px-2.5 py-1 rounded bg-[#0b0e14]/85 border border-white/10 text-[11px] font-mono tabular-nums text-slate-200 flex items-center gap-1.5"
                >
                  <span className="text-cyan-300">{kf.weaponLabel}</span>
                  <span className="text-slate-500">──▶</span>
                  <span className={kf.isBoss ? 'text-amber-300 font-bold' : 'text-rose-300'}>
                    {kf.victimName}
                  </span>
                  <span className="text-emerald-300 font-semibold">+{kf.points}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 5. BOTTOM-LEFT: Pilot Mech Vitality & Thruster Cluster */}
          <div
            data-testid="mars-pilot-vitality-hud"
            className="absolute bottom-4 left-4 w-[256px] p-3 rounded-lg bg-[#0b0e14]/85 border border-white/15 space-y-2"
          >
            <div className="flex items-baseline justify-between">
              <div>
                <div className="text-[10px] font-mono text-slate-400">ARMOR AP</div>
                <div
                  className="text-2xl font-mono font-bold tabular-nums leading-none text-white"
                  style={{ paintOrder: 'stroke fill' }}
                >
                  {hud.hp}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-mono text-cyan-300">SHIELD</div>
                <div className="text-lg font-mono font-bold tabular-nums leading-none text-cyan-200">
                  {hud.shield}
                </div>
              </div>
            </div>

            <div className="h-1.5 w-full bg-black/80 rounded-sm overflow-hidden">
              <div
                style={{ transform: `scaleX(${shieldPct / 100})`, transformOrigin: 'left' }}
                className="h-full w-full bg-[#00e5ff]"
              />
            </div>

            <div className="relative h-2.5 w-full bg-black/80 rounded-sm overflow-hidden">
              <div
                style={{ transform: `scaleX(${ghostHpPct / 100})`, transformOrigin: 'left' }}
                className="absolute inset-0 bg-white/70 transition-transform duration-150"
              />
              <div
                style={{ transform: `scaleX(${hpPct / 100})`, transformOrigin: 'left' }}
                className={`absolute inset-0 ${hpPct < 32 ? 'bg-rose-500' : 'bg-emerald-400'}`}
              />
            </div>

            <div className="flex items-center gap-2 pt-0.5">
              <span className="text-[10px] font-mono text-slate-400 shrink-0">BOOST</span>
              <div className="h-1 flex-1 bg-black/80 rounded-sm overflow-hidden">
                <div
                  style={{
                    transform: `scaleX(${hud.boostEnergy / 100})`,
                    transformOrigin: 'left'
                  }}
                  className="h-full w-full bg-amber-400"
                />
              </div>
              <span className="text-[10px] font-mono tabular-nums text-amber-300">
                {hud.boostEnergy}%
              </span>
            </div>
          </div>

          {/* 6. BOTTOM-RIGHT: 3-Weapon Selector + Tactical Skill Cooldown Rack */}
          <div
            data-testid="mars-weapon-skill-rack"
            className="pointer-events-auto absolute bottom-4 right-4 flex flex-col items-end gap-2"
          >
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                tabIndex={-1}
                data-testid="combat-skill-melee-btn"
                onClick={(e) => {
                  e.currentTarget.blur();
                  inputHubRef.current.meleeJustPressed = true;
                }}
                className={`px-2.5 py-1.5 rounded-md border text-[11px] font-mono tabular-nums cursor-pointer ${
                  hud.meleeCooldown <= 0
                    ? 'bg-[#0b2019]/90 border-emerald-400/65 text-emerald-100'
                    : 'bg-[#0b0e14]/80 border-white/10 text-slate-400'
                }`}
              >
                <span className="text-emerald-300 font-bold">[X]</span>{' '}
                {hud.meleeCooldown > 0 ? `战斧顺劈 ${hud.meleeCooldown.toFixed(1)}s` : '战斧顺劈'}
              </button>

              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  inputHubRef.current.dashJustPressed = true;
                }}
                className="px-2.5 py-1.5 rounded-md bg-[#0b0e14]/88 border border-white/15 hover:border-amber-400/60 text-[11px] font-mono tabular-nums text-slate-200 cursor-pointer"
              >
                <span className="text-amber-300 font-bold">[C]</span> 矢量瞬步
              </button>

              <button
                type="button"
                tabIndex={-1}
                data-testid="combat-skill-wingman-btn"
                onClick={(e) => {
                  e.currentTarget.blur();
                  inputHubRef.current.wingmanCommandJustPressed = true;
                }}
                className={`px-2.5 py-1.5 rounded-md border text-[11px] font-mono tabular-nums cursor-pointer ${
                  hud.wingmanMode !== 'escort'
                    ? 'bg-[#09222c]/95 border-cyan-300 text-cyan-100 font-semibold'
                    : hud.wingmanCooldown <= 0
                      ? 'bg-[#0b1620]/90 border-cyan-400/60 text-cyan-100'
                      : 'bg-[#0b0e14]/80 border-white/10 text-slate-400'
                }`}
              >
                <span className="text-cyan-300 font-bold">[Q]</span>{' '}
                {hud.wingmanMode !== 'escort'
                  ? '僚机撕咬中'
                  : hud.wingmanCooldown > 0
                    ? `僚机扑咬 ${hud.wingmanCooldown.toFixed(1)}s`
                    : '僚机Go2扑咬'}
              </button>

              <button
                type="button"
                tabIndex={-1}
                data-testid="combat-skill-emp-btn"
                onClick={(e) => {
                  e.currentTarget.blur();
                  inputHubRef.current.empJustPressed = true;
                }}
                className={`px-2.5 py-1.5 rounded-md border text-[11px] font-mono tabular-nums cursor-pointer ${
                  hud.empCooldown <= 0
                    ? 'bg-[#0b1620]/90 border-cyan-400/60 text-cyan-100'
                    : 'bg-[#0b0e14]/80 border-white/10 text-slate-400'
                }`}
              >
                <span className="text-cyan-300 font-bold">[E]</span>{' '}
                {hud.empCooldown > 0 ? `脉冲盾 ${hud.empCooldown.toFixed(1)}s` : '脉冲护盾'}
              </button>

              <button
                type="button"
                tabIndex={-1}
                data-testid="combat-skill-ultimate-btn"
                onClick={(e) => {
                  e.currentTarget.blur();
                  inputHubRef.current.ultimateJustPressed = true;
                }}
                className={`px-2.5 py-1.5 rounded-md border text-[11px] font-mono tabular-nums cursor-pointer ${
                  hud.ultimateCharge >= 100
                    ? 'bg-[#241208]/95 border-amber-400 text-amber-100 font-semibold'
                    : 'bg-[#0b0e14]/80 border-white/10 text-slate-300'
                }`}
              >
                <span className="text-amber-300 font-bold">[V]</span> 天基离子炮 {hud.ultimateCharge}%
              </button>
            </div>

            <div className="flex items-center gap-1.5 bg-[#080c14]/95 border border-white/20 shadow-2xl rounded-lg p-1.5">
              {COMBAT_WEAPONS.map((w) => {
                const active = hud.activeWeapon === w.id;
                return (
                  <button
                    key={w.id}
                    type="button"
                    tabIndex={-1}
                    data-testid={`combat-weapon-${w.id}`}
                    onClick={(e) => {
                      e.currentTarget.blur();
                      selectWeaponSlot(w.id);
                    }}
                    className={`px-3 py-1.5 rounded-md border text-left transition cursor-pointer ${
                      active
                        ? 'bg-cyan-500/15 border-cyan-400 text-white'
                        : 'border-transparent text-slate-200 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <div className="text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap">
                      <span className="font-mono text-cyan-300">[{w.slotKey}]</span>
                      <span>{w.name}</span>
                    </div>
                    <div className="text-[10px] text-slate-300/85 whitespace-nowrap">{w.roleHint}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* STATE 3: PAUSED MODAL ('paused')                                      */}
      {/* ===================================================================== */}
      {shellState === 'paused' && (
        <div
          data-testid="mars-combat-pause-modal"
          className="fixed inset-0 z-40 bg-black/75 flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md rounded-xl bg-[#11141c] border border-white/15 p-6 space-y-5 shadow-2xl">
            <div className="space-y-1">
              <div className="text-xs font-mono text-cyan-300">TACTICAL PAUSE</div>
              <h2 className="text-xl font-bold text-white">战术链路已挂起</h2>
            </div>

            <div className="grid grid-cols-3 gap-2.5 text-center">
              <div className="p-2.5 rounded-lg bg-[#0b0d13] border border-white/10">
                <div className="text-[11px] text-slate-400">当前得分</div>
                <div className="text-lg font-mono font-bold tabular-nums text-cyan-300">
                  {hud.score}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-[#0b0d13] border border-white/10">
                <div className="text-[11px] text-slate-400">歼灭机体</div>
                <div className="text-lg font-mono font-bold tabular-nums text-white">
                  {hud.kills}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-[#0b0d13] border border-white/10">
                <div className="text-[11px] text-slate-400">作战波次</div>
                <div className="text-lg font-mono font-bold tabular-nums text-rose-300">
                  WAVE {hud.wave}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={togglePauseGame}
                className="w-full py-2.5 rounded-lg bg-[#e11d48] hover:bg-[#f43f5e] text-white font-semibold text-sm cursor-pointer"
              >
                继续战斗
              </button>
              <button
                type="button"
                onClick={() => startOrRestartDeployment()}
                className="w-full py-2 rounded-lg bg-[#181d28] hover:bg-[#202736] border border-white/10 text-slate-200 text-xs font-medium cursor-pointer"
              >
                重新空投部署
              </button>
              <div className="grid grid-cols-3 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    worldRef.current.shellState = 'title';
                    setShellState('title');
                  }}
                  className="py-2 rounded-lg bg-[#141821] hover:border-white/25 border border-white/10 text-xs text-slate-300 cursor-pointer"
                >
                  返回标题页
                </button>
                <button
                  type="button"
                  onClick={() => onOpenFreeSandbox(selectedMechId)}
                  className="py-2 rounded-lg bg-[#141821] hover:border-cyan-400/60 border border-white/10 text-xs text-slate-300 cursor-pointer"
                >
                  自由实景沙盒
                </button>
                <button
                  type="button"
                  onClick={() => onOpenCadHangar(selectedMechId)}
                  className="py-2 rounded-lg bg-[#141821] hover:border-cyan-400/60 border border-white/10 text-xs text-slate-300 cursor-pointer"
                >
                  数字孪生机库
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* STATE 4: VICTORY / DEFEAT MODAL ('gameover')                          */}
      {/* ===================================================================== */}
      {shellState === 'gameover' && runSummary && (
        <div
          data-testid="mars-combat-gameover-modal"
          className="fixed inset-0 z-40 bg-black/80 flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md rounded-xl bg-[#12141d] border border-white/15 p-6 space-y-5 shadow-2xl">
            <div className="space-y-1">
              <div
                className={`text-xs font-mono font-bold tracking-wider ${
                  runSummary.outcome === 'victory' ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {runSummary.outcome === 'victory'
                  ? 'MISSION ACCOMPLISHED · TITAN NEUTRALIZED'
                  : 'ARMOR CRITICAL · SIGNAL LOST'}
              </div>
              <h2 className="text-2xl font-bold text-white">
                {runSummary.outcome === 'victory' ? '赤星战区肃清完成' : '机体装甲损毁'}
              </h2>
              <div className="text-xs text-slate-400">出击机体：{runSummary.mechTitle}</div>
            </div>

            <div className="grid grid-cols-3 gap-2.5 text-center">
              <div className="p-3 rounded-lg bg-[#0b0d13] border border-white/10">
                <div className="text-[11px] text-slate-400">战区得分</div>
                <div className="text-lg font-mono font-bold tabular-nums text-cyan-300">
                  {runSummary.score}
                </div>
                <div className="text-[10px] font-mono tabular-nums text-slate-500">
                  纪录 {runSummary.bestScore}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-[#0b0d13] border border-white/10">
                <div className="text-[11px] text-slate-400">歼灭敌机</div>
                <div className="text-lg font-mono font-bold tabular-nums text-white">
                  {runSummary.kills}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-[#0b0d13] border border-white/10">
                <div className="text-[11px] text-slate-400">
                  {runSummary.outcome === 'victory' ? '作战用时' : '泰坦剩余装甲'}
                </div>
                <div className="text-lg font-mono font-bold tabular-nums text-amber-300">
                  {runSummary.outcome === 'victory'
                    ? `${runSummary.clearTimeSec}s`
                    : `${runSummary.bossHpRemainingPct}%`}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                data-start="true"
                data-testid="mars-combat-play-again-btn"
                onClick={() => startOrRestartDeployment()}
                className="w-full py-3 rounded-lg bg-[#e11d48] hover:bg-[#f43f5e] text-white font-semibold text-sm cursor-pointer"
              >
                {runSummary.outcome === 'victory' ? '再次出击战区' : '重新空投再战'}
              </button>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    worldRef.current.shellState = 'title';
                    setShellState('title');
                  }}
                  className="py-2 rounded-lg bg-[#161a24] border border-white/10 text-xs text-slate-300 cursor-pointer"
                >
                  更换出击机体
                </button>
                <button
                  type="button"
                  onClick={() => onOpenFreeSandbox(selectedMechId)}
                  className="py-2 rounded-lg bg-[#161a24] border border-white/10 text-xs text-slate-300 cursor-pointer"
                >
                  自由实景沙盒
                </button>
                <button
                  type="button"
                  onClick={() => onOpenCadHangar(selectedMechId)}
                  className="py-2 rounded-lg bg-[#161a24] border border-white/10 text-xs text-slate-300 cursor-pointer"
                >
                  数字孪生机库
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
