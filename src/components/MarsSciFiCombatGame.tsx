import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { loadGlbSceneResilient, fetchTextAssetResilient } from '../utils/resilientGlbLoader';
import { UrdfJointDef, parseUrdfJoints } from '../utils/manifestUtils';
import { computeSandboxUrdfJointAngle, SandboxKinematicState } from '../utils/actionSandboxEngine';
import { detectSoftwareWebGL, createStudioLightboxPmrem } from '../utils/hybridRayTracing';
import { proceduralAudioSynth } from '../utils/proceduralAudioSynth';
import {
  GameShellState,
  PlayerMechId,
  CombatWeaponId,
  EnemyArchetypeId,
  PLAYABLE_MECH_SPECS,
  COMBAT_WEAPONS,
  ENEMY_ARCHETYPE_SPECS,
  MarsCombatWorldState,
  RunSummarySnapshot,
  KillfeedEntry,
  HitmarkerFeedback,
  getPlayableMechSpec,
  createInitialMarsCombatState,
  spawnRandomEnemyWave,
  summonAresBoss,
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
  createLocalizedHexShieldMaterial
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

interface Spawned3DEnemyRig {
  uid: number;
  archetype: EnemyArchetypeId;
  root: THREE.Group;
  modelPivot: THREE.Group;
  joints: BoundUrdfNode[];
  meshes: {
    mesh: THREE.Mesh;
    mat: THREE.MeshStandardMaterial;
    baseEmissive: THREE.Color;
    baseEmissiveIntensity: number;
  }[];
  shieldDome: THREE.Mesh | null;
}

interface HudSyncSnapshot {
  hp: number;
  maxHp: number;
  ghostHp: number;
  shield: number;
  maxShield: number;
  boostEnergy: number;
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
 * and its bottom sits flush at local `y = 0`.
 */
function normalizeAndGroundGlbGroup(
  rawGroup: THREE.Group,
  targetMaxDim: number,
  tintAccentHex?: string
): {
  pivot: THREE.Group;
  normScale: number;
  meshes: {
    mesh: THREE.Mesh;
    mat: THREE.MeshStandardMaterial;
    baseEmissive: THREE.Color;
    baseEmissiveIntensity: number;
  }[];
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

  const meshes: {
    mesh: THREE.Mesh;
    mat: THREE.MeshStandardMaterial;
    baseEmissive: THREE.Color;
    baseEmissiveIntensity: number;
  }[] = [];

  const accentCol = tintAccentHex ? new THREE.Color(tintAccentHex) : null;

  rawGroup.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const m = obj as THREE.Mesh;
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
      meshes.push({ mesh: m, mat: std, baseEmissive, baseEmissiveIntensity });
    }
  });

  pivot.add(rawGroup);
  return { pivot, normScale: scale, meshes };
}

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
  const [shellState, setShellState] = useState<GameShellState>(
    initialAutostart ? 'playing' : 'title'
  );
  const [isLoadingAssets, setIsLoadingAssets] = useState<boolean>(true);
  const [runSummary, setRunSummary] = useState<RunSummarySnapshot | null>(null);

  const worldRef = useRef<MarsCombatWorldState>(
    createInitialMarsCombatState(initialMechId, 0, initialAutostart)
  );
  const shellStateRef = useRef<GameShellState>(initialAutostart ? 'playing' : 'title');
  const selectedMechRef = useRef<PlayerMechId>(initialMechId);
  const audioEnabledRef = useRef<boolean>(audioEnabled);
  audioEnabledRef.current = audioEnabled;

  // Unified Input Hub (held + edge-triggered justPressed)
  const inputHubRef = useRef({
    keysHeld: new Set<string>(),
    mouseHeldL: false,
    missileJustPressed: false,
    jumpJustPressed: false,
    dashJustPressed: false,
    empJustPressed: false,
    wingmanCommandJustPressed: false,
    ultimateJustPressed: false,
    summonBossJustPressed: false,
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

  // Sync Game Shell state to document.body.dataset.state
  useEffect(() => {
    shellStateRef.current = shellState;
    document.body.dataset.state = shellState;
    if (shellState !== 'playing') {
      document.exitPointerLock?.();
      inputHubRef.current.keysHeld.clear();
      inputHubRef.current.mouseHeldL = false;
      proceduralAudioSynth.silenceContinuousLoops();
    }
    return () => {
      delete document.body.dataset.state;
    };
  }, [shellState]);

  const startOrRestartDeployment = (mechOverride?: PlayerMechId) => {
    const mech = mechOverride || selectedMechRef.current;
    const prevBest = worldRef.current.bestScore;
    const nextWorld = createInitialMarsCombatState(mech, prevBest, true);
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
        else if (e.code === 'Space') {
          e.preventDefault();
          hub.jumpJustPressed = true;
        } else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'AltLeft') {
          hub.dashJustPressed = true;
        } else if (e.code === 'KeyE') {
          hub.empJustPressed = true;
        } else if (e.code === 'KeyQ') {
          // [Q] Tactical Left-Arm Point + Allied Wingman Go2 Pounce!
          hub.wingmanCommandJustPressed = true;
        } else if (e.code === 'KeyV' || e.code === 'KeyR') {
          // [V / R] Orbital Ion Cannon Ultimate!
          hub.ultimateJustPressed = true;
        } else if (e.code === 'KeyF') {
          hub.missileJustPressed = true;
        } else if (e.code === 'KeyB') {
          hub.summonBossJustPressed = true;
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
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(initW, initH);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Studio PBR environment reflection for real metallic GLB robot hulls
    const envTex = createStudioLightboxPmrem(renderer);
    scene.environment = envTex;

    // Warm Martian Sun Key Light + Cool Sky/Canyon Hemisphere Fill + Rim Light
    const hemi = new THREE.HemisphereLight(0xffcfb3, 0x1c1218, 0.72);
    scene.add(hemi);

    const sunKey = new THREE.DirectionalLight(0xffdfa8, 1.65);
    sunKey.position.set(28, 42, -24);
    sunKey.castShadow = !isSoftwareGl;
    sunKey.shadow.mapSize.set(1024, 1024);
    sunKey.shadow.camera.near = 4;
    sunKey.shadow.camera.far = 120;
    sunKey.shadow.camera.left = -38;
    sunKey.shadow.camera.right = 38;
    sunKey.shadow.camera.top = 38;
    sunKey.shadow.camera.bottom = -38;
    sunKey.shadow.bias = -0.0005;
    scene.add(sunKey);

    const rimCool = new THREE.DirectionalLight(0x38bdf8, 0.68);
    rimCool.position.set(-24, 16, 28);
    scene.add(rimCool);

    // Martian Jezero Battlefield + Natural Perimeter + Orbital Frigate Vista
    const marsEnv = createMarsBattlefieldEnvironment(
      renderer.capabilities.getMaxAnisotropy(),
      isSoftwareGl
    );
    scene.add(marsEnv.root);

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
    let playerUrdfJoints: BoundUrdfNode[] = [];
    let currentLoadedPlayerMechId: PlayerMechId | null = null;
    let playerRifle: ReturnType<typeof createMountedSciFiPulseRifle> | null = null;
    let playerTurretMount: THREE.Group | null = null;

    // Dorsal Tactical Jet-Dodge Thruster Plumes
    const dodgeThrusterRig = createPlayerDodgeThrusterRig();
    playerRoot.add(dodgeThrusterRig.group);

    // Allied Wingman Go2 Companion 3D Rig (Fights alongside player + responds to [Q / Middle Click]!)
    const wingmanRoot = new THREE.Group();
    scene.add(wingmanRoot);
    const wingmanShadow = new THREE.Mesh(contactShadowGeo, contactShadowMat);
    wingmanShadow.scale.setScalar(0.52);
    wingmanShadow.position.y = 0.03;
    wingmanRoot.add(wingmanShadow);
    const wingmanRingGeo = new THREE.RingGeometry(0.40, 0.50, 28);
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

    // Template Cache for Real GLB Assets & URDFs (loaded once, cloned cleanly for enemies & wingman!)
    const glbCache = new Map<string, THREE.Group>();
    const urdfCache = new Map<string, UrdfJointDef[]>();

    const fetchTemplate = async (urls: string[], urdfUrl?: string) => {
      const key = urls.join('|');
      let master = glbCache.get(key);
      if (!master) {
        const containerGroup = new THREE.Group();
        const scenes = await Promise.all(urls.map((u) => loadGlbSceneResilient(u)));
        for (const s of scenes) containerGroup.add(s);
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
        playerTurretMount = null;
        if (playerModelPivot) {
          playerRoot.remove(playerModelPivot);
        }
        const cloned = template.clone(true);
        const { pivot, normScale } = normalizeAndGroundGlbGroup(
          cloned,
          spec.targetMaxDim,
          '#00e5ff'
        );
        playerRoot.add(pivot);
        playerModelPivot = pivot;
        playerUrdfJoints = bindUrdfJointsToRoot(pivot, joints);

        // Attach Multi-Part Sci-Fi Pulse Rifle / Arm Cannon directly to right hand/forearm URDF node (or dorsal turret mount)!
        let handSocketNode: THREE.Object3D | null = null;
        if (mechId === 'unitree_g1' || mechId === 'unitree_z1') {
          const priorityPatterns =
            mechId === 'unitree_g1'
              ? ['right_hand_palm_link', 'right_wrist_yaw_link', 'right_wrist_pitch_link', 'right_elbow_link']
              : ['link06', 'joint6', 'link05'];
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
          // Slight palm offset forward & centered in hand grip
          rifle.group.position.set(0.03, 0, 0.01);
          (handSocketNode as THREE.Object3D).add(rifle.group);
          playerRifle = rifle;
        } else {
          // Dorsal / Shoulder Weapon Turret Gimbal for Quadruped Go2, Tracked SAR, and Mars2020 Rover!
          const turret = new THREE.Group();
          const mountY =
            mechId === 'unitree_go2' ? 0.92 : mechId === 'sar' ? 1.18 : 1.48;
          turret.position.set(0.18, mountY, 0.22);
          const rifle = createMountedSciFiPulseRifle(mechId, false, 1.0);
          turret.add(rifle.group);
          pivot.add(turret);
          playerTurretMount = turret;
          playerRifle = rifle;
        }
      } catch (err) {
        console.warn('Player mech GLB load warning:', err);
      }
    };

    // Pre-warm Player Mech + Allied Wingman Go2 + All Enemy Archetypes + ARES-09 Boss GLBs in parallel!
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
          const wCloned = wTpl.clone(true);
          const { pivot: wPivot } = normalizeAndGroundGlbGroup(wCloned, 0.86, '#00e5ff');
          wingmanRoot.add(wPivot);
          wingmanUrdfJoints = bindUrdfJointsToRoot(wPivot, wJoints);
        }
      } catch {
        // Wingman fallback safe
      }
      await Promise.all(
        Object.values(ENEMY_ARCHETYPE_SPECS).map((es) =>
          fetchTemplate(es.glbUrls, es.urdfUrl).catch(() => null)
        )
      );
      if (!disposed) setIsLoadingAssets(false);
    })();

    // Active 3D Enemy Rigs Map
    const enemyRigs = new Map<number, Spawned3DEnemyRig>();
    const enemyGroupRoot = new THREE.Group();
    scene.add(enemyGroupRoot);
    const shieldSphereGeo = new THREE.SphereGeometry(1, 28, 20);

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
      shadow.scale.setScalar(archetype === 'ares_boss' ? 2.8 : 1.0);
      shadow.position.y = 0.03;
      rigRoot.add(shadow);

      const cloned = cached.clone(true);
      const { pivot, meshes } = normalizeAndGroundGlbGroup(cloned, spec.scaleDim, spec.accentHex);
      rigRoot.add(pivot);

      // Translucent Fresnel + Localized Hexagonal Honeycomb Impact Ripple Energy Shield (ZERO wireframe!)
      let shieldDome: THREE.Mesh | null = null;
      if (spec.maxShield > 0) {
        const domeMat = createLocalizedHexShieldMaterial(
          archetype === 'ares_boss' ? '#38bdf8' : '#00e5ff',
          archetype === 'ares_boss'
        );
        shieldDome = new THREE.Mesh(shieldSphereGeo, domeMat);
        shieldDome.position.y = archetype === 'ares_boss' ? 1.85 : spec.scaleDim * 0.42;
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
        shieldDome
      };
      enemyRigs.set(uid, rig);
      return rig;
    };

    // Canvas Pointer & Aiming Handlers (live getBoundingClientRect!)
    let draggingLook = false;
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
      if (ev.button === 0) {
        inputHubRef.current.mouseHeldL = true;
        draggingLook = true;
      } else if (ev.button === 1) {
        ev.preventDefault();
        inputHubRef.current.wingmanCommandJustPressed = true;
      } else if (ev.button === 2) {
        inputHubRef.current.missileJustPressed = true;
      }
    };

    const onPointerMove = (ev: PointerEvent) => {
      if (!inputHubRef.current.hasPointerSample) {
        lastMouseX = ev.clientX;
        lastMouseY = ev.clientY;
        inputHubRef.current.hasPointerSample = true;
      }
      const dx = ev.clientX - lastMouseX;
      const dy = ev.clientY - lastMouseY;
      lastMouseX = ev.clientX;
      lastMouseY = ev.clientY;
      updateNdcFromClient(ev.clientX, ev.clientY);

      if (shellStateRef.current === 'playing') {
        const sensitivity = draggingLook ? 0.0046 : 0.0016;
        inputHubRef.current.camYaw += dx * sensitivity;
        inputHubRef.current.camPitch = THREE.MathUtils.clamp(
          inputHubRef.current.camPitch - dy * sensitivity * 0.75,
          -0.48,
          0.36
        );
      }
    };

    const onPointerUp = (ev: PointerEvent) => {
      if (ev.button === 0) {
        inputHubRef.current.mouseHeldL = false;
        draggingLook = false;
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

    // ResizeObserver for crisp responsive viewport
    const resizeObs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(320, Math.floor(entry.contentRect.width));
        const h = Math.max(240, Math.floor(entry.contentRect.height));
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
    });
    resizeObs.observe(container);

    // Software WebGL fence-paced loop helper
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

    const tick = () => {
      if (disposed) return;
      const nowMs = performance.now();
      const rawDt = (nowMs - lastTime) / 1000;
      lastTime = nowMs;
      const dt = Math.min(Math.max(rawDt, 0.001), 0.1);
      simElapsed += dt;

      // Sync player mech model if user switched loadout on Title Screen
      if (currentLoadedPlayerMechId !== selectedMechRef.current) {
        syncPlayerMechModel(selectedMechRef.current);
      }

      const wState = worldRef.current;
      const hub = inputHubRef.current;

      if (shellStateRef.current === 'title') {
        // Live World Camera Tour orbiting Hero Mech on Mars!
        const tourAngle = simElapsed * 0.28 + hub.pointerNdcX * 0.35;
        const heroY = wState.y;
        playerRoot.position.set(0, heroY, 0);
        playerRoot.rotation.set(0, 0.45, 0);
        if (playerModelPivot) playerModelPivot.rotation.set(0, 0, 0);
        dodgeThrusterRig.update(0, false, simElapsed);
        if (playerRifle) playerRifle.updateWeaponVisuals('pulse_rifle', 0, 0);

        // Pose Wingman Go2 beside Hero Mech on Title Screen!
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

        // Frame hero mech on right-center so left-third negative space holds Title Lockup cleanly!
        const camDist = 6.2;
        camera.position.set(
          Math.cos(tourAngle) * camDist - 1.1,
          heroY + 2.35 + hub.pointerNdcY * 0.35,
          Math.sin(tourAngle) * camDist + 1.4
        );
        camera.lookAt(-1.25, heroY + 1.25, 0.2);
        marsEnv.updateAtmosphere(dt, 0, 0, simElapsed);
      } else if (shellStateRef.current === 'playing') {
        // Gather movement & raycast world aim point
        const moveFwd =
          (hub.keysHeld.has('KeyW') || hub.keysHeld.has('ArrowUp') ? 1 : 0) -
          (hub.keysHeld.has('KeyS') || hub.keysHeld.has('ArrowDown') ? 1 : 0);
        const moveRight =
          (hub.keysHeld.has('KeyD') || hub.keysHeld.has('ArrowRight') ? 1 : 0) -
          (hub.keysHeld.has('KeyA') || hub.keysHeld.has('ArrowLeft') ? 1 : 0);
        const fireHeld = hub.mouseHeldL || hub.keysHeld.has('Enter');

        // Raycast center reticle (0, 0.06) against enemy rigs + Mars terrain for accurate 3rd-person shooting!
        _ndc.set(0, 0.06);
        _raycaster.setFromCamera(_ndc, camera);
        let aimWorld: [number, number, number] | null = null;
        const pickMeshes: THREE.Object3D[] = [marsEnv.terrainMesh];
        enemyRigs.forEach((r) => {
          if (r.root.visible) pickMeshes.push(r.modelPivot);
        });
        const hits = _raycaster.intersectObjects(pickMeshes, true);
        if (hits.length > 0) {
          aimWorld = [hits[0].point.x, hits[0].point.y, hits[0].point.z];
        } else {
          _projVec.copy(_raycaster.ray.direction).multiplyScalar(48).add(_raycaster.ray.origin);
          aimWorld = [_projVec.x, _projVec.y, _projVec.z];
        }

        // Extract exact 3D Muzzle World Coordinate from mounted rifle barrel socket!
        let muzzleWorldPoint: [number, number, number] | null = null;
        if (playerRifle) {
          playerRoot.updateMatrixWorld(true);
          playerRifle.muzzleSocket.getWorldPosition(_muzzleWorldVec);
          muzzleWorldPoint = [_muzzleWorldVec.x, _muzzleWorldVec.y, _muzzleWorldVec.z];
        }

        // Consume one-shot edge triggers
        const stepInput = {
          moveForward: moveFwd,
          moveRight,
          sprintHeld: hub.keysHeld.has('ShiftLeft') || hub.keysHeld.has('ShiftRight'),
          fireHeld,
          missileJustPressed: hub.missileJustPressed,
          jumpJustPressed: hub.jumpJustPressed,
          jumpHeld: hub.keysHeld.has('Space'),
          dashJustPressed: hub.dashJustPressed,
          empJustPressed: hub.empJustPressed,
          wingmanCommandJustPressed: hub.wingmanCommandJustPressed,
          ultimateJustPressed: hub.ultimateJustPressed,
          summonBossJustPressed: hub.summonBossJustPressed,
          aimYaw: hub.camYaw,
          aimPitch: hub.camPitch,
          aimWorldPoint: aimWorld,
          muzzleWorldPoint
        };
        hub.missileJustPressed = false;
        hub.jumpJustPressed = false;
        hub.dashJustPressed = false;
        hub.empJustPressed = false;
        hub.wingmanCommandJustPressed = false;
        hub.ultimateJustPressed = false;
        hub.summonBossJustPressed = false;

        // Keyboard left/right camera assist when turning with arrow keys
        if (hub.keysHeld.has('ArrowLeft')) hub.camYaw -= 1.8 * dt;
        if (hub.keysHeld.has('ArrowRight')) hub.camYaw += 1.8 * dt;

        stepMarsCombatWorld(wState, dt, stepInput);

        // Trigger procedural WebAudio cues & pooled 3D shell/spark VFX from emitted events
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

        // Transition to GameOver modal if world state reached gameover
        if (wState.shellState === 'gameover') {
          shellStateRef.current = 'gameover';
          setRunSummary(wState.runSnapshot);
          setShellState('gameover');
        }

        // Update Player 3D Pose, Tactical Dodge Bank + Thrusters, & Split Upper/Lower Body Aiming IK!
        const heavyCrouchDrop = Math.min(1, wState.heavyPostureTimer / 0.22) * 0.16;
        playerRoot.position.set(wState.x, wState.y - heavyCrouchDrop, wState.z);
        playerRoot.rotation.set(0, -wState.yaw, 0);
        if (playerModelPivot) {
          playerModelPivot.rotation.set(0, 0, wState.dodgeBankRad);
        }
        if (playerTurretMount) {
          let relTurretYaw = hub.camYaw - wState.yaw;
          while (relTurretYaw > Math.PI) relTurretYaw -= Math.PI * 2;
          while (relTurretYaw < -Math.PI) relTurretYaw += Math.PI * 2;
          playerTurretMount.rotation.set(0, -relTurretYaw, hub.camPitch + wState.recoilPos * 0.22);
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
            wingmanCommandTimer: wState.wingmanCommandTimer
          });
          _qAxis.setFromAxisAngle(j.axisVec, ikAng);
          j.node.quaternion.copy(j.baseQuat).multiply(_qAxis);
        }

        if (playerRifle) {
          playerRifle.updateWeaponVisuals(
            wState.activeWeapon,
            wState.muzzleFlashTimer,
            wState.recoilPos
          );
        }
        dodgeThrusterRig.update(
          wState.dashTimer,
          !wState.isGrounded && wState.vy > 1.2,
          simElapsed
        );

        // Update Allied Wingman Go2 Companion 3D Rig & URDF Gait!
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

        // Over-the-Shoulder 3rd-Person Tactical Camera with Exponential Damping + Trauma Shake
        const camBackDist = wState.dashTimer > 0 ? 7.6 : wState.heavyPostureTimer > 0 ? 6.15 : 6.6;
        const fwdX = Math.cos(hub.camYaw);
        const fwdZ = Math.sin(hub.camYaw);
        const rightX = -fwdZ;
        const rightZ = fwdX;

        _camDesired.set(
          wState.x - fwdX * camBackDist + rightX * 1.15,
          Math.max(
            wState.y + 2.85 - Math.sin(hub.camPitch) * 3.2,
            marsEnv.terrainMesh ? wState.y + 1.35 : 2.0
          ),
          wState.z - fwdZ * camBackDist + rightZ * 1.15
        );
        const dampK = 1 - Math.exp(-14 * dt);
        camera.position.lerp(_camDesired, dampK);

        const shake = wState.cameraTrauma * wState.cameraTrauma * 0.36;
        const sx = (Math.random() - 0.5) * shake;
        const sy = (Math.random() - 0.5) * shake;

        _camTarget.set(
          wState.x + fwdX * 14 + rightX * 0.65,
          wState.y + 1.45 + Math.sin(hub.camPitch) * 12 + sy,
          wState.z + fwdZ * 14 + rightZ * 0.65 + sx
        );
        camera.lookAt(_camTarget);

        // Dynamic FOV punch during Vector Dash or Heavy Skill Braced Firing Posture!
        const targetFov =
          wState.dashTimer > 0 ? 60 : wState.heavyPostureTimer > 0 ? 56.8 : 52;
        if (Math.abs(camera.fov - targetFov) > 0.1) {
          camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-14 * dt));
          camera.updateProjectionMatrix();
        }

        // Sync 3D Enemy Robot Rigs + Localized Fresnel Hex Shield Ripple + Physical Spring Hit-Stagger!
        const liveUids = new Set<number>();
        for (const e of wState.enemies) {
          liveUids.add(e.uid);
          const rig = ensureEnemyRig(e.uid, e.archetype);
          if (!rig) continue;

          rig.root.visible = true;
          const invDrop = 1 - e.dropPodProgress;
          const dropOffset = e.dropPodProgress < 1 ? invDrop * invDrop * 16 : 0;
          rig.root.position.set(e.x, e.y + dropOffset, e.z);

          // KO topple pitch/roll or Stagger/Shield-Break kneel + Physical Spring Hit-Stagger on modelPivot!
          const koTilt = e.koTimer > 0 ? (1 - e.koTimer / 0.42) * 1.15 : 0;
          const staggerPitch =
            e.staggeredTimer > 0 ? 0.24 : e.shieldBreakStunTimer > 0 ? 0.16 : 0;
          rig.root.rotation.set(staggerPitch, -e.yaw, koTilt);
          rig.modelPivot.rotation.set(e.hitTiltRoll, 0, -e.hitTiltPitch);

          if (rig.shieldDome) {
            const showShield = (e.shield > 0 || e.shieldShatterTimer > 0) && e.koTimer <= 0;
            rig.shieldDome.visible = showShield;
            if (showShield) {
              const sMat = rig.shieldDome.material as THREE.ShaderMaterial;
              sMat.uniforms.uTime.value = simElapsed;
              sMat.uniforms.uShieldRatio.value =
                e.maxShield > 0 ? Math.max(0, e.shield / e.maxShield) : 0;
              sMat.uniforms.uRippleTimer.value = e.shieldRippleTimer;
              sMat.uniforms.uShatterTimer.value = e.shieldShatterTimer;
              sMat.uniforms.uHitLocalDir.value.set(
                e.lastShieldHitLocalDir[0],
                e.lastShieldHitLocalDir[1],
                e.lastShieldHitLocalDir[2]
              );
            }
          }

          // Animate Enemy URDF Joints
          const eSpd = Math.hypot(e.vx, e.vz);
          const actorKey =
            e.archetype === 'go2_hound'
              ? 'unitree_go2'
              : e.archetype === 'g1_vanguard'
                ? 'unitree_g1'
                : e.archetype === 'sar_siege'
                  ? 'sar'
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

          // Clean PBR Armor Shading: NO blind-white full-body flash! Only Boss Phase 2 Coral, ACS Stagger, or Shield-Break electric shimmer!
          for (const m of rig.meshes) {
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

        // Clean up defeated enemy 3D rigs
        enemyRigs.forEach((rig, uid) => {
          if (!liveUids.has(uid)) {
            if (rig.shieldDome) {
              (rig.shieldDome.material as THREE.Material).dispose();
            }
            enemyGroupRoot.remove(rig.root);
            enemyRigs.delete(uid);
          }
        });

        // Update Combat VFX & Martian Dust Atmosphere
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
          }
        });
        marsEnv.updateAtmosphere(dt, wState.x, wState.z, simElapsed);

        // Throttled ~15Hz HUD Sync (keeps React reconciliation completely off the 60fps loop!)
        if (simElapsed - lastHudSyncAt >= 0.065) {
          lastHudSyncAt = simElapsed;
          const rectW = container.clientWidth || 1280;
          const rectH = container.clientHeight || 800;

          const enemyBars: HudSyncSnapshot['enemyScreenBars'] = [];
          for (const e of wState.enemies) {
            if (e.isBoss || e.koTimer > 0 || e.dropPodProgress < 0.85) continue;
            _projVec.set(e.x, e.y + (e.archetype === 'aero_hunter' ? 1.2 : 2.2), e.z);
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
                  locked: Math.hypot(_projVec.x, _projVec.y) < 0.16
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
                attackWarning = '高危预警 · 环形蜂群追踪导弹齐射 [Shift 瞬步规避 / E 脉冲拦截]';
              } else if (activeBoss.bossAttackKind === 'coral_laser_sweep') {
                attackWarning = '高危预警 · 360° 红莲高能扫射巨炮 [Space 腾空跃过]';
              } else if (activeBoss.bossAttackKind === 'orbital_pillars') {
                attackWarning = '高危预警 · 天基电磁轰炸圈锁定 [脱离红圈]';
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
                      ? `${activeBoss.codeName} [红莲二阶段]`
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

      renderer.render(scene, camera);
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
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('contextmenu', onContextMenu);
      if (playerRifle) playerRifle.dispose();
      dodgeThrusterRig.dispose();
      wingmanRingGeo.dispose();
      wingmanRingMat.dispose();
      contactShadowGeo.dispose();
      contactShadowMat.dispose();
      softShadowTex.dispose();
      shieldSphereGeo.dispose();
      marsEnv.dispose();
      vfxCtrl.dispose();
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
          {/* Top-Right Secondary Mode Entry Points (Preserves Free Sandbox & Digital Twin Hub 100%!) */}
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

          {/* Left-Third Asymmetric Title Lockup + Mech Loadout + Primary Start CTA */}
          <div className="pointer-events-auto max-w-[440px] space-y-6 my-auto">
            {/* Bespoke Inline <svg> Sci-Fi Crest Emblem & Display Title Lockup */}
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
                驾驶真实运动学机甲空降杰泽罗赤红战区，迎击轨道空投机械军团与多阶段核能泰坦领主。
              </p>
            </div>

            {/* Playable Real .GLB Mech Loadout Selector */}
            <div className="space-y-2">
              <div className="text-xs font-medium text-slate-300 flex items-center justify-between">
                <span>选择出击机体</span>
                <span className="font-mono tabular-nums text-cyan-300">
                  AP {currentMechSpec.maxHp} · 护盾 {currentMechSpec.maxShield}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-1.5">
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

            {/* Primary Start CTA (data-start="true") */}
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

          {/* Flat Single-Line Control Hint in Bottom Safe Margin */}
          <div className="text-xs font-mono text-slate-300/85 tracking-wide">
            WASD 机动 · 鼠标举枪瞄准射击 · 右键/F 蜂群导弹 · 1-3 切换武器 · Shift 瞬步闪避 · Q/中键 僚机Go2扑咬 · E 脉冲盾 · V 天基离子炮
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* STATE 2: PLAYING VISOR HUD (>= 88% Clear Unobstructed 3D Playfield!)  */}
      {/* ===================================================================== */}
      {shellState === 'playing' && (
        <div className="fixed inset-0 pointer-events-none z-20">
          {/* 1A. Floating 3D Projected Damage & CRIT Numbers */}
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

          {/* 1B. Projected Compact Enemy Health / Shield Micro-Bars (non-occluding, 44px slim!) */}
          {hud.enemyScreenBars.map((eb) => (
            <div
              key={eb.uid}
              style={{
                transform: `translate3d(${Math.round(eb.x - 24)}px, ${Math.round(eb.y - 16)}px, 0)`
              }}
              className="absolute top-0 left-0 w-12 space-y-0.5"
            >
              {eb.shieldPct > 0 && (
                <div className="h-1 w-full bg-black/75 overflow-hidden rounded-xs">
                  <div
                    style={{
                      transform: `scaleX(${eb.shieldPct / 100})`,
                      transformOrigin: 'left'
                    }}
                    className="h-full w-full bg-cyan-400"
                  />
                </div>
              )}
              <div className="h-1.5 w-full bg-black/80 border border-white/15 overflow-hidden rounded-xs">
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

          {/* 2. EXACT CENTER (50%, 50%) CoD Dynamic Tactical Reticle + Hitmarker + Directional Threat Arcs */}
          <div
            aria-hidden="true"
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            style={{ marginTop: '-3%' }}
          >
            <svg width="260" height="260" viewBox="-130 -130 260 260" className="overflow-visible">
              {/* CoD Directional Incoming Threat Arcs */}
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

              {/* Center Dot + Dynamic Spread Crosshair Ticks */}
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

              {/* CoD 45° X-Tick Hitmarker */}
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

            {/* Boss Arrival Alert Banner */}
            {hud.bossBannerTimer > 0 && (
              <div
                data-testid="boss-arrival-warning-banner"
                className="px-5 py-1.5 rounded-md bg-[#280810]/95 border border-[#ff2a55] text-rose-100 text-xs font-mono font-bold tracking-widest shadow-2xl"
              >
                WARNING · 轨道核能泰坦领主已空降战区
              </div>
            )}

            {/* Armored Core 6 Style Boss Vitality + ACS Attitude Stagger Bar */}
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

                {/* Boss HP Bar with Delayed White Ghost Drain Bar */}
                <div className="relative h-2.5 w-full bg-black/80 rounded-xs overflow-hidden border border-white/10">
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

                {/* Boss Shield & ACS Stagger Gauge */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-amber-300 shrink-0">ACS 架势</span>
                  <div className="relative h-1.5 flex-1 bg-black/80 rounded-xs overflow-hidden">
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

            {/* CoD Minimalist Tactical Killfeed */}
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

          {/* 5. BOTTOM-LEFT: Pilot Mech Vitality & Thruster Cluster (CoD:IW Visor Style) */}
          <div
            data-testid="mars-pilot-vitality-hud"
            className="absolute bottom-4 left-4 w-[256px] p-3 rounded-lg bg-[#0b0e14]/85 border border-white/12 space-y-2"
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

            {/* Shield Bar */}
            <div className="h-1.5 w-full bg-black/80 rounded-xs overflow-hidden">
              <div
                style={{ transform: `scaleX(${shieldPct / 100})`, transformOrigin: 'left' }}
                className="h-full w-full bg-[#00e5ff]"
              />
            </div>

            {/* Armor Bar with Delayed White Damage Ghost Bar */}
            <div className="relative h-2.5 w-full bg-black/80 rounded-xs overflow-hidden">
              <div
                style={{ transform: `scaleX(${ghostHpPct / 100})`, transformOrigin: 'left' }}
                className="absolute inset-0 bg-white/70 transition-transform duration-150"
              />
              <div
                style={{ transform: `scaleX(${hpPct / 100})`, transformOrigin: 'left' }}
                className={`absolute inset-0 ${hpPct < 32 ? 'bg-rose-500' : 'bg-emerald-400'}`}
              />
            </div>

            {/* Thruster Boost Energy */}
            <div className="flex items-center gap-2 pt-0.5">
              <span className="text-[10px] font-mono text-slate-400 shrink-0">BOOST</span>
              <div className="h-1 flex-1 bg-black/80 rounded-xs overflow-hidden">
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
            {/* 3 Tactical Rig Abilities */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  inputHubRef.current.dashJustPressed = true;
                }}
                className="px-2.5 py-1.5 rounded-md bg-[#0b0e14]/88 border border-white/12 hover:border-amber-400/60 text-[11px] font-mono tabular-nums text-slate-200 cursor-pointer"
              >
                <span className="text-amber-300 font-bold">[Shift]</span> 矢量瞬步
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

            {/* 3 Sci-Fi Primary Weapons */}
            <div className="flex items-center gap-1.5 bg-[#0b0e14]/88 border border-white/12 rounded-lg p-1.5">
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
                        ? 'bg-white/10 border-cyan-400 text-white'
                        : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/5'
                    }`}
                  >
                    <div className="text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap">
                      <span className="font-mono text-cyan-300">[{w.slotKey}]</span>
                      <span>{w.name}</span>
                    </div>
                    <div className="text-[10px] text-slate-400 whitespace-nowrap">{w.roleHint}</div>
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
              <div className="p-2.5 rounded-lg bg-[#0b0d13] border border-white/8">
                <div className="text-[11px] text-slate-400">当前得分</div>
                <div className="text-lg font-mono font-bold tabular-nums text-cyan-300">
                  {hud.score}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-[#0b0d13] border border-white/8">
                <div className="text-[11px] text-slate-400">歼灭机体</div>
                <div className="text-lg font-mono font-bold tabular-nums text-white">
                  {hud.kills}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-[#0b0d13] border border-white/8">
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
              <div className="p-3 rounded-lg bg-[#0b0d13] border border-white/8">
                <div className="text-[11px] text-slate-400">战区得分</div>
                <div className="text-lg font-mono font-bold tabular-nums text-cyan-300">
                  {runSummary.score}
                </div>
                <div className="text-[10px] font-mono tabular-nums text-slate-500">
                  纪录 {runSummary.bestScore}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-[#0b0d13] border border-white/8">
                <div className="text-[11px] text-slate-400">歼灭敌机</div>
                <div className="text-lg font-mono font-bold tabular-nums text-white">
                  {runSummary.kills}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-[#0b0d13] border border-white/8">
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
