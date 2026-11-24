import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  loadGltfResilient,
  fetchTextAssetResilient,
  disposeSceneHierarchy
} from '../utils/resilientGlbLoader';
import {
  Layers,
  Box,
  FileCode,
  Search,
  ExternalLink,
  Sliders,
  RotateCcw,
  Activity,
  Bot,
  Zap,
  Gamepad2,
  Grid3x3,
  Minimize2,
  X,
  ChevronDown,
  Swords,
  Crosshair
} from 'lucide-react';
import manifestDataRaw from '../robotics_manifest.json';
import {
  ROBOT_PACKS,
  TWIN_WORKSTATIONS,
  RobotPack,
  ManifestRepo,
  DrillLevel,
  UrdfJointDef,
  filterRepositories,
  parseKinematicStats,
  parseUrdfJoints,
  filterMovableJoints,
  classifyMeshLayer,
  computeGhostMaterialState,
  computeClipPlaneConstant
} from '../utils/manifestUtils';
import {
  HangarRegime,
  HANGAR_REGIMES,
  computeRobotLiveJointTarget,
  computeThermalIrColor,
  buildSpatialTelemetryProbes,
  dampValue,
  computeFresnelPulseIntensity
} from '../utils/liveTwinEngine';
import {
  TwinMaterialUniforms,
  attachTwinShaderEffects,
  createOpticalSectionAssembly,
  createFlowAndSensorField,
  FlowAndSensorFieldController
} from '../utils/liveTwinSceneFX';
import {
  SubAssemblyDef,
  OrthogonalExplosionPlan,
  PartBlueprintMetadata,
  AutoDisassemblyState,
  buildSubAssemblyMatrix,
  computePartOrthogonalExplosionPlan,
  evaluateStagedExplosionOffset,
  stepAutoDisassemblyDemo,
  computePartBlueprintMetadata
} from '../utils/cadDisassemblyEngine';
import {
  createExplodedTraceLinesController,
  createBlueprintDimensionRig
} from '../utils/cadBlueprintSceneFX';
const WorkstationTwinView = React.lazy(() => import('./WorkstationTwinView').then((m) => ({ default: m.WorkstationTwinView })));
const ActionSandboxView = React.lazy(() => import('./ActionSandboxView').then((m) => ({ default: m.ActionSandboxView })));
const MarsSciFiCombatGame = React.lazy(() => import('./MarsSciFiCombatGame').then((m) => ({ default: m.MarsSciFiCombatGame })));
import { PlayerMechId } from '../utils/marsCombatEngine';
import {
  PartBlueprintCapsule,
  BlueprintAxisScreenLabels
} from './PartBlueprintCapsule';
import {
  SpatialTelemetryOverlay,
  ProjectedTelemetryItem
} from './SpatialTelemetryOverlay';
import { LiveBusSparklines } from './LiveBusSparklines';
import { PathTracingHudBar } from './PathTracingHudBar';
import { ViewportSettingsMenu } from './ViewportSettingsMenu';
import { DissectionControlsPopover } from './DissectionControlsPopover';
import {
  HangarCameraPresetId,
  IkJointLinkSpec,
  MoltenKerfNode,
  getHangarCameraPreset,
  extractManipulatorJointIndices,
  solveCcdIkChain,
  stepMoltenKerfTrail
} from '../utils/ccdIkSolver';
import {
  ActiveFaultRecord,
  classifyFaultSubsystem,
  applyFaultToUrdfJointAngle
} from '../utils/hallOfFameEngine';
import { createIkAndPlasmaFXController } from '../utils/hallOfFameSceneFX';
import {
  DirectorCameraMode,
  UltimateSkillState,
  createInitialUltimateSkillState,
  triggerUltimateSkill,
  stepUltimateSkill,
  computeUltimateUrdfJointDelta,
  getRobotUltimateMeta,
  cycleDirectorCameraMode,
  computeDirectorCameraPose
} from '../utils/signatureShowcaseEngine';
import { createSignatureShowcaseSceneFXController } from '../utils/signatureShowcaseSceneFX';
import {
  EmissiveAreaLightSource,
  DynamicEmissivePoint,
  DualGearRayTracingController,
  detectSoftwareWebGL,
  createStudioLightboxPmrem,
  upgradeGlbPbrAndBuildStaticBvh,
  createSaltlineReflectorDeck,
  createDualGearRayTracingPipeline
} from '../utils/hybridRayTracing';
import { VisualLabPopoverButton } from './VisualLabPopoverButton';
import { FloatingSceneGraphSection } from './FloatingSceneGraphSection';
import {
  HoveredPartCalloutOverlay,
  HoveredPartCalloutInfo
} from './HoveredPartCalloutOverlay';
import {
  SlsMaterializationState,
  WindTunnelDisasterConfig,
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
  SpringDamperVec3State,
  SurfaceWeatheringState,
  classifyShipbreakerPartRole,
  stepSpringDamperVec3,
  stepDynamicWeathering,
  computeHorizonFocusMode
} from '../utils/aaaGameVfxEngine';
import { createShipbreakerSalvageController } from '../utils/aaaGameSceneFX';
import {
  HangarGazeState,
  PushRecoveryState,
  AssemblySnapShakeState,
  HangarMpcWalkState,
  MICRO_FPV_SAFE_EXPLOSION_RATIO,
  createInitialHangarGazeState,
  stepHangarGazeTracking,
  computeHangarGazeUrdfDelta,
  createInitialPushRecoveryState,
  triggerPushRecoveryImpulse,
  stepPushRecoveryState,
  computePushRecoveryUrdfDelta,
  isHighLoadPushJointPart,
  triggerAssemblySnapShake,
  stepAssemblySnapShake,
  createInitialHangarMpcWalkState,
  setMpcFloorTarget,
  stepHangarMpcWalk,
  reconcileHangarStateTransition,
  shouldAutoRevealInternalSkeleton,
  buildSafeWorldBBoxFpvWaypoints
} from '../utils/hangarLivingPhysicsEngine';
import {
  CinemaOpticsConfig,
  createDefaultCinemaOpticsConfig,
  computeSmartFocusDistanceMeters,
  createStudioAtmosphereRig
} from '../utils/cinemaOpticsPipeline';
import {
  ScientificVizConfig,
  PartMassSample,
  TorqueJointSample,
  createDefaultScientificVizConfig,
  feaColorMapToShaderCode,
  computeLinkVonMisesStress,
  computeRobotComAndSupportPolygon,
  computeCalibratedFlirTemperatureC,
  createScientificVizSceneController
} from '../utils/scientificVizEngine';
import {
  SciFiVfxConfig,
  NaniteMaterializeState,
  TacticalPulseWaveState,
  createDefaultSciFiVfxConfig,
  createInitialNaniteState,
  triggerNaniteSpawnSweep,
  triggerNaniteDemoCycle,
  stepNaniteState,
  createInitialTacticalPulseState,
  triggerTacticalPulseWave,
  stepTacticalPulseWave,
  createSciFiHangarVfxController
} from '../utils/scifiVfxShaders';
import {
  CinemaMacroId,
  TactileDirectorConfig,
  CameraMicroImpulseState,
  JointLimitWarningSample,
  CanvasWebmRecorderController,
  createDefaultTactileDirectorConfig,
  computeHandheldCameraMicroSway,
  createInitialCameraMicroImpulse,
  triggerCameraMicroImpulse,
  stepCameraMicroImpulse,
  detectJointLimitProximity,
  evaluateCinemaMacroPose,
  createTactileInteractionSceneController,
  createCanvasWebmRecorder
} from '../utils/tactileCameraRig';

const manifestData = manifestDataRaw as ManifestRepo[];

type MainTab = 'hangar_3d' | 'mars2020' | 'b737_cfm56' | 'b737_bridge' | 'urdf_explorer';

interface LoadedRobotPart {
  mesh: THREE.Mesh;
  partName: string;
  layer: 'L1' | 'L2' | 'L3';
  tris: number;
  vertices: number;
  basePos: THREE.Vector3;
  geomLocalCenter: THREE.Vector3;
  socketInParentLocal: THREE.Vector3;
  localOrthoVec: THREE.Vector3;
  localPeelVec: THREE.Vector3;
  normSize: [number, number, number];
  orthoPlan: OrthogonalExplosionPlan;
  mountOriginWorld: THREE.Vector3;
  currentCenterWorld: THREE.Vector3;
  peelAmount: number;
  normAxialX: number;
  origMat: THREE.MeshStandardMaterial;
  origSide: THREE.Side;
  origColor: THREE.Color;
  twinUniforms: TwinMaterialUniforms;
}

interface BoundUrdfJoint {
  def: UrdfJointDef;
  targetNode: THREE.Object3D;
  basePos: THREE.Vector3;
  baseQuat: THREE.Quaternion;
  axisVec: THREE.Vector3;
  currentVal: number;
  omegaRadS: number;
}

interface SkeletonDynamicNode {
  target: THREE.Object3D;
  axes: THREE.AxesHelper;
  ring: THREE.LineLoop;
}

const HANGAR_DRILL_LEVELS: { level: DrillLevel; label: string; desc: string }[] = [
  { level: 'L0', label: 'L0 · 整机总成与URDF关节骨架', desc: '全层级实体显示 + URDF 局部坐标轴系与连杆拓扑' },
  { level: 'L1', label: 'L1 · 底盘/车体/主承力外壳', desc: '聚焦底盘与主推进构型，L2/L3 自动切换为幽灵上下文 (opacity: 0.12)' },
  { level: 'L2', label: 'L2 · 越障摆臂/机械臂/四足连杆', desc: '聚焦 Flippers 摆臂、6-DOF/7-DOF 机械臂与腿部连杆，其余幽灵化' },
  { level: 'L3', label: 'L3 · 关节电机/激光雷达/声呐末端', desc: '下钻至 motor 电机、LiDAR 雷达、Ping360 声呐与灵巧手末端' }
];

const _tmpVec3 = new THREE.Vector3();
const _tmpVec3B = new THREE.Vector3();
const _tmpParentVec3 = new THREE.Vector3();
const _decompPos = new THREE.Vector3();
const _parentQuat = new THREE.Quaternion();
const _parentScale = new THREE.Vector3();
const _localDelta = new THREE.Vector3();
const _ikTgtLocalScratch = new THREE.Vector3();
const _endEffScratch = new THREE.Vector3();
const _grappleCenterScratch = new THREE.Vector3();
const _salvageFallbackAxis = new THREE.Vector3(0, 1, 0);
const _plasmaEmissiveColor = new THREE.Color(0x67e8f9);
const _faultEmissiveColor = new THREE.Color(0xf97316);
const _faultEmissivePos = new THREE.Vector3();
const _tmpCamRight = new THREE.Vector3();
const _tmpCamUp = new THREE.Vector3();
const _tmpCamFwd = new THREE.Vector3();
const _tmpEmitterW = new THREE.Vector3();
const _tmpQuat = new THREE.Quaternion();
const _tmpBox3 = new THREE.Box3();
const _raycaster = new THREE.Raycaster();
const _pointerNdc = new THREE.Vector2();
const _tmpThermalSpikeColor = new THREE.Color(0xfb923c);
const _tmpWorkspaceOrigin = new THREE.Vector3();
const _tmpLidarOrigin = new THREE.Vector3();
const _tmpRobotBox = new THREE.Box3();
const _tmpTransientCamOffset = new THREE.Vector3();

import type { EngineeringMode } from '../utils/workspaceRoutes';
import { createExactNodeIndex, resolveExactJointNode } from '../utils/jointBinding';
import { applyRobotJointPose } from '../utils/robotJointPose';
import { normalizeRoboticsLocation, readRoboticsLocation, roboticsLocationSearch, roboticsAssetUrl, type RoboticsLocation } from '../utils/roboticsRoute';
const BASELINE_STATUS_LABELS = { missing: '缺失', synthetic: '历史合成示意', adapted: '本仓适配', 'local-document': '本地导览' } as const;

function resolvePlayableCombatMechId(actorId: string): PlayerMechId {
  if (actorId === 'sar_tracked' || actorId === 'sar') return 'sar';
  if (actorId === 'talos' || actorId === 'talos_humanoid') return 'talos_humanoid';
  if (actorId === 'cassie' || actorId === 'cassie_biped') return 'cassie_biped';
  if (actorId === 'baxter' || actorId === 'baxter_dual_arm') return 'baxter_dual_arm';
  if (
    actorId === 'unitree_g1' ||
    actorId === 'unitree_go2' ||
    actorId === 'nasa_valkyrie' ||
    actorId === 'spot_arm' ||
    actorId === 'husky_ugv' ||
    actorId === 'mars2020' ||
    actorId === 'unitree_z1' ||
    actorId === 'unitree_h1' ||
    actorId === 'unitree_b2' ||
    actorId === 'fourier_gr1' ||
    actorId === 'anymal_c' ||
    actorId === 'hello_stretch'
  ) {
    return actorId;
  }
  return 'unitree_g1';
}

export default function TwinWorkbench({ initialMode = 'cad_hub' }: { initialMode?: EngineeringMode }) {
  const [appMode, setAppMode] = useState<EngineeringMode>(initialMode);
  const [combatAutostart] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.get('autostart') === '1';
  });
  const [sandboxActorId, setSandboxActorId] = useState<string>(() => {
    if (typeof window === 'undefined') return 'unitree_g1';
    const params = new URLSearchParams(window.location.search);
    return params.get('actor') || 'unitree_g1';
  });
  const sandboxMode = appMode === 'sandbox';

  const [initialRoboticsLocation] = useState(() => readRoboticsLocation(typeof window === 'undefined' ? '' : window.location.search, manifestData));
  const [activeTab, setActiveTabState] = useState<MainTab>(initialRoboticsLocation.tab);
  const [selectedPack, setSelectedPackState] = useState<RobotPack>(() => ROBOT_PACKS.find(pack => pack.id === initialRoboticsLocation.robot)!);
  const [activeDrillLevel, setActiveDrillLevel] = useState<DrillLevel>('L0');
  const [explosion, setExplosion] = useState<number>(0);
  const [clipRatio, setClipRatio] = useState<number>(1.0);
  const [autoSectionScan, setAutoSectionScan] = useState<boolean>(false);
  const [xrayMode, setXrayMode] = useState<boolean>(false);
  const [thermalMode, setThermalMode] = useState<boolean>(false);
  const [flowSensorMode, setFlowSensorMode] = useState<boolean>(false);
  const [showProbes, setShowProbes] = useState<boolean>(false);
  const [showSkeleton, setShowSkeleton] = useState<boolean>(false);
  const [autoRotate, setAutoRotate] = useState<boolean>(false);

  // Module 1: Live Twin Operating Regimes & Manual FK Override
  const [liveSim, setLiveSim] = useState<boolean>(true);
  const [hangarRegime, setHangarRegime] = useState<HangarRegime>('patrol');

  const [meshNodes, setMeshNodes] = useState<{ name: string; tris: number; layer: 'L1' | 'L2' | 'L3' }[]>([]);
  const meshNodesRef = useRef<{ name: string; tris: number; layer: 'L1' | 'L2' | 'L3' }[]>([]);
  const [highlightedPart, setHighlightedPart] = useState<string | null>(null);
  const [hoveredPart, setHoveredPart] = useState<string | null>(null);
  const [viewportHoveredPart, setViewportHoveredPart] = useState<string | null>(null);
  const [hoveredCallout, setHoveredCallout] = useState<HoveredPartCalloutInfo | null>(null);
  const [leftAcc, setLeftAcc] = useState<{ subs: boolean; bus: boolean }>({
    subs: true,
    bus: true
  });
  const [isLoadingGlb, setIsLoadingGlb] = useState<boolean>(true);
  const [glbLoadError, setGlbLoadError] = useState<string | null>(null);
  const [glbReloadNonce, setGlbReloadNonce] = useState<number>(0);

  // System 1: 8-12 Sub-Assembly Matrix + Single-Part Blueprint Workbench + 4-Stage Auto Disassembly
  const [subAssemblies, setSubAssemblies] = useState<SubAssemblyDef[]>([]);
  const [activeSubAssembly, setActiveSubAssembly] = useState<string | null>(null);
  const [isolatedPart, setIsolatedPart] = useState<string | null>(null);
  const [peeledParts, setPeeledParts] = useState<Record<string, boolean>>({});
  const [hiddenParts, setHiddenParts] = useState<Record<string, boolean>>({});
  const [autoDisassembly, setAutoDisassembly] = useState<boolean>(false);
  const [autoStageLabel, setAutoStageLabel] = useState<string>('');
  const [selectedBlueprintMeta, setSelectedBlueprintMeta] = useState<PartBlueprintMetadata | null>(null);
  const [selectedAnchorScreen, setSelectedAnchorScreen] = useState<[number, number] | null>(null);
  const [blueprintAxisScreens, setBlueprintAxisScreens] = useState<BlueprintAxisScreenLabels>({
    xScreen: null,
    yScreen: null,
    zScreen: null
  });

  // Parsed URDF Joints & FK Slider Angles (rad)
  const [urdfJoints, setUrdfJoints] = useState<UrdfJointDef[]>([]);
  const [jointBindingReport, setJointBindingReport] = useState<{ bound: string[]; missing: string[]; ambiguous: string[] }>({ bound: [], missing: [], ambiguous: [] });
  const [jointAngles, setJointAngles] = useState<Record<string, number>>({});
  const [jointSearch, setJointSearch] = useState('');

  // Projected 3D Spatial Telemetry Callouts
  const [projectedProbes, setProjectedProbes] = useState<ProjectedTelemetryItem[]>([]);
  const [viewportSize, setViewportSize] = useState<{ w: number; h: number }>({ w: 960, h: 640 });

  // Hangar Camera Presets, Dual-Gear Hybrid Ray-Tracing, Fault Injection & 6-DOF CCD IK State
  const [activeCamPreset, setActiveCamPreset] = useState<HangarCameraPresetId | null>(null);
  const [pathTracingEnabled, setPathTracingEnabled] = useState<boolean>(false);
  const [ptSpp, setPtSpp] = useState<number>(0);
  const [bvhStats, setBvhStats] = useState<{ meshes: number; emissives: number }>({ meshes: 0, emissives: 0 });
  const [isExporting4K, setIsExporting4K] = useState<boolean>(false);
  const [faultInjectMode, setFaultInjectMode] = useState<boolean>(false);
  const [activeFaults, setActiveFaults] = useState<ActiveFaultRecord[]>([]);
  const [ikEnabled, setIkEnabled] = useState<boolean>(false);
  const [plasmaCutting, setPlasmaCutting] = useState<boolean>(false);

  // Five Hardcore Sci-Tech & Audiovisual Modules State
  const [audioSynthEnabled, setAudioSynthEnabled] = useState<boolean>(() =>
    proceduralAudioSynth.isEnabled()
  );
  const [magLensEnabled, setMagLensEnabled] = useState<boolean>(false);
  const [magLensRadius, setMagLensRadius] = useState<number>(0.44);
  const [slsActive, setSlsActive] = useState<boolean>(false);
  const [mpcEnabled, setMpcEnabled] = useState<boolean>(false);
  const [totalPowerWatts, setTotalPowerWatts] = useState<number>(0);
  const [windTunnelConfig, setWindTunnelConfig] = useState<WindTunnelDisasterConfig>(() =>
    createDefaultWindTunnelConfig()
  );
  const [microFpvActive, setMicroFpvActive] = useState<boolean>(false);
  const [microFpvSegmentLabel, setMicroFpvSegmentLabel] = useState<string>('');

  // AAA Hangar Systems: Hardspace: Shipbreaker Magnetic Grapple, Horizon Focus Weakpoint & Dynamic Weathering
  const [shipbreakerEnabled, setShipbreakerEnabled] = useState<boolean>(false);
  const [floatingPartsCount, setFloatingPartsCount] = useState<number>(0);
  const [focusWeakpointEnabled, setFocusWeakpointEnabled] = useState<boolean>(false);
  const [weatheringActive, setWeatheringActive] = useState<boolean>(false);
  const resetGrappledPartsRef = useRef<(() => void) | null>(null);
  const [zenMode, setZenMode] = useState<boolean>(false);
  const [visualPopoverOpen, setVisualPopoverOpen] = useState<boolean>(false);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [dissectOpen, setDissectOpen] = useState<boolean>(false);
  const [activeDrawer, setActiveDrawer] = useState<
    'robots' | 'structure' | 'kinematics' | 'scenegraph' | null
  >(null);
  const [directorCamMode, setDirectorCamMode] = useState<DirectorCameraMode>('off');
  const [ultimateActiveUI, setUltimateActiveUI] = useState<boolean>(false);
  const [ultimatePhaseLabelUI, setUltimatePhaseLabelUI] = useState<string>('');
  const [pushTestArmed, setPushTestArmed] = useState<boolean>(false);
  const [pushTorqueSpikeNm, setPushTorqueSpikeNm] = useState<number>(0);
  const [pushCalloutHud, setPushCalloutHud] = useState<{
    screenX: number;
    screenY: number;
    forceN: number;
    partName: string;
  } | null>(null);

  // Master Dimensions 1-4: Cinema Optics, Scientific Computing, Sci-Fi VFX & Tactile Game Feel
  const [cinemaOptics, setCinemaOptics] = useState<CinemaOpticsConfig>(() =>
    createDefaultCinemaOpticsConfig()
  );
  const [scientificConfig, setScientificConfig] = useState<ScientificVizConfig>(() =>
    createDefaultScientificVizConfig()
  );
  const [peakStressMpa, setPeakStressMpa] = useState<number>(0);
  const [comStabilityStatus, setComStabilityStatus] = useState<'stable' | 'warning' | 'critical' | 'unknown'>(
    'unknown'
  );
  const [hoverThermalReadout, setHoverThermalReadout] = useState<{
    tempC: number;
    zoneLabel: string;
    partName: string;
  } | null>(null);
  const [scifiConfig, setScifiConfig] = useState<SciFiVfxConfig>(() =>
    createDefaultSciFiVfxConfig()
  );
  const [tactileConfig, setTactileConfig] = useState<TactileDirectorConfig>(() =>
    createDefaultTactileDirectorConfig()
  );
  const [ikTensionNewtons, setIkTensionNewtons] = useState<number>(0);
  const [audioVolume, setAudioVolume] = useState<number>(() =>
    proceduralAudioSynth.getVolume()
  );
  const [isRecordingWebm, setIsRecordingWebm] = useState<boolean>(false);
  const webmRecorderRef = useRef<CanvasWebmRecorderController | null>(null);

  // URDF / XML Baseline Explorer state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [fileSearch, setFileSearch] = useState('');
  const [selectedRepo, setSelectedRepoState] = useState<ManifestRepo>(() => manifestData.find(repo => repo.repository === initialRoboticsLocation.repository)!);
  const [selectedFileRel, setSelectedFileRelState] = useState(initialRoboticsLocation.file);
  const [fileContent, setFileContent] = useState<string>('正在加载原始基准文件...');
  const applyRoboticsLocation = useCallback((route: RoboticsLocation) => {
    setActiveTabState(route.tab);
    setSelectedPackState(ROBOT_PACKS.find(pack => pack.id === route.robot)!);
    setSelectedRepoState(manifestData.find(repo => repo.repository === route.repository)!);
    setSelectedFileRelState(route.file);
  }, []);
  const navigateRobotics = useCallback((patch: Partial<RoboticsLocation>) => {
    const current = readRoboticsLocation(window.location.search, manifestData);
    const next = normalizeRoboticsLocation({ ...current, ...patch }, manifestData);
    const search = roboticsLocationSearch(next, window.location.search);
    if (search !== window.location.search) window.history.pushState(null, '', `${window.location.pathname}${search}${window.location.hash}`);
    applyRoboticsLocation(next);
  }, [applyRoboticsLocation]);
  const setActiveTab = (tab: MainTab) => navigateRobotics({ tab });
  const setSelectedPack = (pack: RobotPack) => { setJointSearch(''); navigateRobotics({ robot: pack.id }); };
  const setSelectedFileRel = (file: string) => navigateRobotics({ file });
  useEffect(() => {
    const onPopState = () => { setJointSearch(''); setFileSearch(''); applyRoboticsLocation(readRoboticsLocation(window.location.search, manifestData)); };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [applyRoboticsLocation]);
  const selectedFileIssue = selectedRepo?.fileIssues?.[selectedFileRel];
  const selectedFileIsImage = /\.(png|jpe?g|webp|gif|svg)$/i.test(selectedFileRel);
  const selectedFileUrl = selectedRepo ? roboticsAssetUrl(`baselines/${selectedRepo.category}/${selectedRepo.repository}/${selectedFileRel}`) : '';
  const visibleKinematicFiles = (selectedRepo?.kinematicFiles || []).filter(file => file.toLowerCase().includes(fileSearch.trim().toLowerCase()));
  const visibleDocFiles = (selectedRepo?.docFiles || []).filter(file => file.toLowerCase().includes(fileSearch.trim().toLowerCase()));

  const mountRef = useRef<HTMLDivElement | null>(null);
  const rayTracerRef = useRef<DualGearRayTracingController | null>(null);
  const renderOnceRef = useRef<(() => void) | null>(null);
  const partsRef = useRef<LoadedRobotPart[]>([]);
  const subAssembliesRef = useRef<SubAssemblyDef[]>([]);
  const assemblyNormMaxDimRef = useRef<number>(2.05);
  const boundJointsRef = useRef<BoundUrdfJoint[]>([]);
  const rebuildSkeletonRef = useRef<(() => void) | null>(null);
  const skeletonGroupRef = useRef<THREE.Group | null>(null);
  const clipPlaneRef = useRef<THREE.Plane>(new THREE.Plane(new THREE.Vector3(0, -1, 0), 10));
  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const bboxMaxYRef = useRef<number>(2.0);
  const bboxMinYRef = useRef<number>(-2.0);
  const bboxMinVecRef = useRef<[number, number, number]>([-1, -0.8, -1]);
  const bboxMaxVecRef = useRef<[number, number, number]>([1, 0.8, 1]);
  const urdfJointsRef = useRef<UrdfJointDef[]>([]);

  const stateRef = useRef({
    activeDrillLevel: 'L0' as DrillLevel,
    targetExplosion: 0,
    curExplosion: 0,
    targetClipRatio: 1.0,
    curClipRatio: 1.0,
    autoSectionScan: false,
    xrayMode: false,
    thermalMode: false,
    flowSensorMode: false,
    showProbes: false,
    showSkeleton: false,
    autoRotate: false,
    liveSim: true,
    hangarRegime: 'patrol' as HangarRegime,
    manualJointAngles: {} as Record<string, number>,
    highlightedPart: null as string | null,
    hoveredPart: null as string | null,
    highlightSelectTime: -10,
    activeSubAssembly: null as string | null,
    isolatedPart: null as string | null,
    peeledParts: {} as Record<string, boolean>,
    hiddenParts: {} as Record<string, boolean>,
    autoDisassemblyState: {
      active: false,
      progress: 0,
      direction: 1 as 1 | -1,
      holdTimer: 0,
      currentStage: 0 as 0 | 1 | 2 | 3 | 4,
      stageLabel: ''
    } as AutoDisassemblyState,
    camGlideActive: false,
    camTargetPos: new THREE.Vector3(2.35, 1.65, 2.75),
    camTargetLook: new THREE.Vector3(0, 0, 0),
    activeCamPreset: null as HangarCameraPresetId | null,
    pathTracingEnabled: false,
    faultInjectMode: false,
    activeFaults: [] as ActiveFaultRecord[],
    ikEnabled: false,
    plasmaCutting: false,
    ikTargetWorld: new THREE.Vector3(0.68, 0.25, 0.35),
    kerfNodes: [] as MoltenKerfNode[],
    audioSynthEnabled: false,
    magLensEnabled: false,
    magLensRadius: 0.44,
    magLensHoverValid: false,
    magLensCenter: new THREE.Vector3(0, 999, 0),
    slsState: createInitialSlsState(1.8) as SlsMaterializationState,
    mpcEnabled: false,
    windTunnelConfig: createDefaultWindTunnelConfig(),
    microFpvActive: false,
    microFpvPhase: 0,
    shipbreakerEnabled: false,
    focusWeakpointEnabled: false,
    weathering: { marsDust: 0.22, intakeFrost: 0.08, titaniumHeatBluing: 0.18 } as SurfaceWeatheringState,
    directorCamMode: 'off' as DirectorCameraMode,
    ultimateSkill: createInitialUltimateSkillState() as UltimateSkillState,
    pushTestArmed: false,
    cursorValid: false,
    pointerNdcX: 0,
    pointerNdcY: 0,
    gazeState: createInitialHangarGazeState() as HangarGazeState,
    pushState: createInitialPushRecoveryState() as PushRecoveryState,
    snapShake: { timer: 0, amplitude: 0 } as AssemblySnapShakeState,
    mpcWalkState: createInitialHangarMpcWalkState() as HangarMpcWalkState,
    cinemaOptics: createDefaultCinemaOpticsConfig() as CinemaOpticsConfig,
    scientificConfig: createDefaultScientificVizConfig() as ScientificVizConfig,
    scifiConfig: createDefaultSciFiVfxConfig() as SciFiVfxConfig,
    naniteState: createInitialNaniteState() as NaniteMaterializeState,
    tacticalPulse: createInitialTacticalPulseState() as TacticalPulseWaveState,
    tactileConfig: createDefaultTactileDirectorConfig() as TactileDirectorConfig,
    macroElapsed: 0,
    camImpulse: createInitialCameraMicroImpulse() as CameraMicroImpulseState,
    activeDrawer: null as 'robots' | 'structure' | 'kinematics' | 'scenegraph' | null,
    visualPopoverOpen: false
  });
  const initialPackLoadedRef = useRef(false);

  useEffect(() => {
    const s = stateRef.current;
    s.activeDrillLevel = activeDrillLevel;
    s.activeDrawer = activeDrawer;
    s.visualPopoverOpen = visualPopoverOpen;
    if (!autoDisassembly && tactileConfig.activeMacro === 'off') {
      s.targetExplosion = explosion;
    }
    s.targetClipRatio = clipRatio;
    s.autoSectionScan = autoSectionScan;
    s.xrayMode = xrayMode;
    s.thermalMode = thermalMode;
    s.flowSensorMode = flowSensorMode;
    s.showProbes = showProbes;
    s.showSkeleton = showSkeleton;
    s.autoRotate = autoRotate;
    s.liveSim = liveSim;
    s.hangarRegime = hangarRegime;
    s.activeSubAssembly = activeSubAssembly;
    s.isolatedPart = isolatedPart;
    s.peeledParts = peeledParts;
    s.hiddenParts = hiddenParts;
    s.autoDisassemblyState.active = autoDisassembly;
    s.activeCamPreset = activeCamPreset;
    s.pathTracingEnabled = pathTracingEnabled;
    s.faultInjectMode = faultInjectMode;
    s.activeFaults = activeFaults;
    s.ikEnabled = ikEnabled;
    s.plasmaCutting = plasmaCutting;
    s.audioSynthEnabled = audioSynthEnabled;
    s.magLensEnabled = magLensEnabled;
    s.magLensRadius = magLensRadius;
    s.mpcEnabled = mpcEnabled;
    s.windTunnelConfig = windTunnelConfig;
    s.microFpvActive = microFpvActive;
    s.shipbreakerEnabled = shipbreakerEnabled;
    s.focusWeakpointEnabled = focusWeakpointEnabled;
    s.directorCamMode = directorCamMode;
    s.pushTestArmed = pushTestArmed;
    s.cinemaOptics = cinemaOptics;
    s.scientificConfig = scientificConfig;
    s.scifiConfig = scifiConfig;
    s.tactileConfig = tactileConfig;
    if (
      controlsRef.current &&
      !activeCamPreset &&
      !microFpvActive &&
      directorCamMode === 'off' &&
      tactileConfig.activeMacro === 'off'
    ) {
      controlsRef.current.enableZoom = !magLensEnabled;
    }
    if (!liveSim) {
      s.manualJointAngles = jointAngles;
    }
  }, [
    activeDrillLevel,
    explosion,
    clipRatio,
    autoSectionScan,
    xrayMode,
    thermalMode,
    flowSensorMode,
    showProbes,
    showSkeleton,
    autoRotate,
    liveSim,
    hangarRegime,
    activeSubAssembly,
    isolatedPart,
    peeledParts,
    hiddenParts,
    autoDisassembly,
    activeCamPreset,
    pathTracingEnabled,
    faultInjectMode,
    activeFaults,
    ikEnabled,
    plasmaCutting,
    audioSynthEnabled,
    magLensEnabled,
    magLensRadius,
    mpcEnabled,
    windTunnelConfig,
    microFpvActive,
    shipbreakerEnabled,
    focusWeakpointEnabled,
    directorCamMode,
    pushTestArmed,
    cinemaOptics,
    scientificConfig,
    scifiConfig,
    tactileConfig,
    jointAngles,
    activeDrawer,
    visualPopoverOpen
  ]);

  const handleTriggerUltimateShowcase = () => {
    setPathTracingEnabled(false);
    setIsolatedPart(null);
    stateRef.current.isolatedPart = null;
    stateRef.current.slsState.active = false;
    stateRef.current.curClipRatio = 0.34;
    stateRef.current.ultimateSkill = triggerUltimateSkill();
    setUltimateActiveUI(true);
    setUltimatePhaseLabelUI('镜头 I · 俯掠推轨 + 激光断层内窥蓄力');
    setLiveSim(true);
    proceduralAudioSynth.playMechanicalLatchClick(760);
  };

  const handleCycleDirectorCamera = () => {
    setDirectorCamMode((prev) => {
      const next = cycleDirectorCameraMode(prev);
      stateRef.current.directorCamMode = next;
      if (next === 'off' && cameraRef.current && controlsRef.current && !stateRef.current.microFpvActive) {
        cameraRef.current.fov = 42;
        cameraRef.current.up.set(0, 1, 0);
        cameraRef.current.updateProjectionMatrix();
        controlsRef.current.enabled = !stateRef.current.activeCamPreset;
      }
      return next;
    });
  };

  const handleResetGrappledParts = () => {
    if (resetGrappledPartsRef.current) {
      resetGrappledPartsRef.current();
    }
    stateRef.current.snapShake = triggerAssemblySnapShake(1.15);
    stateRef.current.camImpulse = triggerCameraMicroImpulse(0.42);
    setFloatingPartsCount(0);
    proceduralAudioSynth.playMagneticSnapBackThud(true);
  };

  const handleCleanWeathering = () => {
    stateRef.current.weathering = { marsDust: 0, intakeFrost: 0, titaniumHeatBluing: 0 };
    setWeatheringActive(false);
    proceduralAudioSynth.playMechanicalLatchClick(960);
  };

  const handleToggleAudioSynth = () => {
    setAudioSynthEnabled((prev) => {
      const next = !prev;
      proceduralAudioSynth.setEnabled(next);
      return next;
    });
  };

  const handleChangeAudioVolume = (vol01: number) => {
    const v = Math.max(0, Math.min(1, vol01));
    setAudioVolume(v);
    proceduralAudioSynth.setVolume(v);
  };

  const handleTriggerNaniteDemo = () => {
    setClipRatio(1.0);
    setAutoSectionScan(false);
    stateRef.current.targetClipRatio = 1.0;
    stateRef.current.autoSectionScan = false;
    stateRef.current.naniteState = triggerNaniteDemoCycle(2.4);
    if (stateRef.current.audioSynthEnabled) {
      proceduralAudioSynth.playSubBassImpact('sls_print');
    }
  };

  const handleTriggerTacticalPulse = () => {
    stateRef.current.tacticalPulse = triggerTacticalPulseWave(
      [stateRef.current.mpcWalkState.x, stateRef.current.mpcWalkState.z],
      1.75
    );
    stateRef.current.camImpulse = triggerCameraMicroImpulse(0.28, [0, -1, 0], 0.11);
    proceduralAudioSynth.playTacticalPulseRadarSweep(true);
  };

  const handleTriggerCinemaMacro = (macroId: CinemaMacroId) => {
    setPathTracingEnabled(false);
    setActiveCamPreset(null);
    stateRef.current.activeCamPreset = null;
    stateRef.current.macroElapsed = 0;
    setTactileConfig((prev) => {
      const resolved = prev.activeMacro === macroId ? 'off' : macroId;
      stateRef.current.tactileConfig = { ...prev, activeMacro: resolved };
      if (resolved === 'off' && cameraRef.current && controlsRef.current) {
        cameraRef.current.fov = 42;
        cameraRef.current.up.set(0, 1, 0);
        cameraRef.current.updateProjectionMatrix();
        controlsRef.current.enabled = true;
      }
      return { ...prev, activeMacro: resolved };
    });
    proceduralAudioSynth.playMechanicalLatchClick(790);
  };

  const handleToggleRecordWebm = () => {
    const rec = webmRecorderRef.current;
    if (!rec) return;
    if (rec.isRecording()) {
      rec.stopRecording();
      setIsRecordingWebm(false);
    } else {
      const ok = rec.startRecording(`${selectedPack.id}_hangar_hd`);
      setIsRecordingWebm(ok);
    }
  };

  const handleTriggerPushImpulse = (customHit?: {
    point: [number, number, number];
    dir: [number, number, number];
    partName: string;
    forceN?: number;
  }) => {
    // Module 4 Coordinator: standalone physical test smoothly resets any active Optical Sectioning plane
    setClipRatio(1.0);
    setAutoSectionScan(false);
    setIsolatedPart(null);
    setPathTracingEnabled(false);
    setLiveSim(true);
    stateRef.current.targetClipRatio = 1.0;
    stateRef.current.autoSectionScan = false;
    stateRef.current.isolatedPart = null;
    stateRef.current.liveSim = true;

    let contactPt: [number, number, number] = [0.06, 0.24, 0.14];
    let pushDir: [number, number, number] = [-0.62, -0.05, -0.78];
    let partLabel = 'torso_link';
    if (customHit) {
      contactPt = customHit.point;
      pushDir = customHit.dir;
      partLabel = customHit.partName;
    } else {
      const torsoPart =
        partsRef.current.find((p) => {
          const n = p.partName.toLowerCase();
          return n.includes('torso') || n.includes('pelvis') || n.includes('base') || n.includes('chassis');
        }) || partsRef.current[0];
      if (torsoPart && torsoPart.mesh.visible) {
        const wc = torsoPart.geomLocalCenter.clone();
        torsoPart.mesh.localToWorld(wc);
        const sideSign = Math.sin(performance.now() * 0.0031) >= 0 ? 1 : -1;
        contactPt = [wc.x + sideSign * 0.16, wc.y + 0.08, wc.z + 0.08];
        partLabel = torsoPart.partName;
        // Crisp lateral-frontal impulse vector so 3D Force Arrow reads clearly in profile
        pushDir = [-sideSign * 0.88, -0.06, -0.46];
      } else {
        const angle = (performance.now() * 0.0017) % (Math.PI * 2);
        pushDir = [-Math.cos(angle) * 0.84, -0.05, -0.52];
      }
    }

    const forceN = customHit?.forceN ?? 225;
    stateRef.current.pushState = triggerPushRecoveryImpulse(stateRef.current.pushState, {
      contactWorld: contactPt,
      pushDirWorld: pushDir,
      forceNewtons: forceN,
      impactPartName: partLabel,
      robotYaw: stateRef.current.mpcWalkState.yaw
    });
    setPushTorqueSpikeNm(stateRef.current.pushState.telemetryTorqueSpikeNm);
    stateRef.current.camImpulse = triggerCameraMicroImpulse(
      Math.min(1.2, forceN / 240),
      [pushDir[0], -0.25, pushDir[2]],
      0.13
    );
    proceduralAudioSynth.playPushImpactThud(forceN, true);
  };

  const handleTriggerSlsPrint = () => {
    setClipRatio(1.0);
    setAutoSectionScan(false);
    stateRef.current.targetClipRatio = 1.0;
    stateRef.current.autoSectionScan = false;
    stateRef.current.slsState = triggerSlsMaterialization(bboxMinYRef.current, 1.8);
    setSlsActive(true);
    proceduralAudioSynth.playSubBassImpact('sls_print');
  };

  const handleToggleMicroFpv = () => {
    setMicroFpvActive((prev) => {
      const next = !prev;
      const coord = reconcileHangarStateTransition(
        {
          explosion: stateRef.current.targetExplosion,
          clipRatio: stateRef.current.targetClipRatio,
          autoSectionScan: stateRef.current.autoSectionScan,
          autoDisassembly: stateRef.current.autoDisassemblyState.active,
          microFpvActive: prev,
          isolatedPart: stateRef.current.isolatedPart
        },
        next ? { type: 'enter_micro_fpv' } : { type: 'exit_micro_fpv' }
      );
      stateRef.current.microFpvActive = coord.microFpvActive;
      stateRef.current.targetExplosion = coord.explosion;
      stateRef.current.targetClipRatio = coord.clipRatio;
      stateRef.current.autoSectionScan = coord.autoSectionScan;
      stateRef.current.autoDisassemblyState.active = coord.autoDisassembly;
      stateRef.current.isolatedPart = coord.isolatedPart;
      setExplosion(coord.explosion);
      setClipRatio(coord.clipRatio);
      setAutoSectionScan(coord.autoSectionScan);
      setAutoDisassembly(coord.autoDisassembly);
      setIsolatedPart(coord.isolatedPart);

      const cam = cameraRef.current;
      const ctrl = controlsRef.current;
      if (cam && ctrl) {
        if (next) {
          setPathTracingEnabled(false);
          cam.near = 0.002;
          cam.fov = 64;
          cam.updateProjectionMatrix();
          ctrl.enabled = false;
        } else {
          cam.near = 0.01;
          cam.fov = 42;
          cam.up.set(0, 1, 0);
          cam.updateProjectionMatrix();
          ctrl.enabled = !stateRef.current.activeCamPreset;
          if (!stateRef.current.activeCamPreset) {
            cam.position.set(2.35, 1.65, 2.75);
            ctrl.target.set(0, 0, 0);
            ctrl.update();
          }
        }
      }
      return next;
    });
  };

  const handleSelectCameraPreset = (presetId: HangarCameraPresetId | null) => {
    if (microFpvActive) {
      setMicroFpvActive(false);
      stateRef.current.microFpvActive = false;
      if (cameraRef.current) {
        cameraRef.current.near = 0.01;
        cameraRef.current.fov = 42;
        cameraRef.current.updateProjectionMatrix();
      }
    }
    setActiveCamPreset(presetId);
    stateRef.current.activeCamPreset = presetId;
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;
    if (!cam || !ctrl) return;

    if (!presetId) {
      cam.up.set(0, 1, 0);
      ctrl.enabled = true;
      stateRef.current.camGlideActive = false;
      ctrl.update();
      return;
    }

    const spec = getHangarCameraPreset(presetId);
    // Bypass OrbitControls temporarily while locked to fixed camera preset
    ctrl.enabled = false;
    stateRef.current.camGlideActive = false;
    cam.up.set(spec.up[0], spec.up[1], spec.up[2]);
    ctrl.target.set(0, 0, 0);
    cam.position.set(spec.offset[0], spec.offset[1], spec.offset[2]);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();
  };

  const handleInjectFaultOnPart = (partNameOverride?: string) => {
    const domain =
      selectedPack.id === 'bluerov2' || selectedPack.id === 'rexrov2' ? 'sea' : 'land';
    const candidatePart =
      partNameOverride ||
      highlightedPart ||
      partsRef.current.find((p) => {
        const n = p.partName.toLowerCase();
        return n.includes('fl_') || n.includes('thruster') || n.includes('flipper') || n.includes('thigh');
      })?.partName ||
      partsRef.current[0]?.partName;
    if (!candidatePart) return;

    const info = classifyFaultSubsystem(selectedPack.id, candidatePart, domain);
    const rec: ActiveFaultRecord = {
      partName: candidatePart,
      kind: info.kind,
      injectedAtSimTime: performance.now() / 1000,
      alertTitle: info.alertTitle,
      compensationLaw: info.compensationLaw
    };
    setActiveFaults((prev) => [...prev.filter((f) => f.partName !== candidatePart), rec]);
    setLiveSim(true);
  };

  const handleSelfHealAllFaults = () => {
    setActiveFaults([]);
    setFaultInjectMode(false);
  };

  const handleExport4K = async () => {
    if (!rayTracerRef.current || !renderOnceRef.current || isExporting4K) return;
    setIsExporting4K(true);
    try {
      await rayTracerRef.current.export4KFrame(
        `${selectedPack.id}_hangar_raytraced_4k_${Date.now()}.png`,
        renderOnceRef.current
      );
    } finally {
      setIsExporting4K(false);
    }
  };

  const handleEnterSandbox = (actorOverride?: string) => {
    const resolvedActor =
      actorOverride ||
      (activeTab === 'mars2020'
        ? 'mars2020'
        : activeTab === 'b737_cfm56' || activeTab === 'b737_bridge'
          ? 'b737_cfm56'
          : selectedPack.id);
    setSandboxActorId(resolvedActor);
    setAppMode('sandbox');
  };

  const handleExitSandbox = (lastActorId: string) => {
    setAppMode('cad_hub');
    if (lastActorId === 'mars2020') {
      setActiveTab('mars2020');
    } else if (lastActorId === 'b737_cfm56') {
      setActiveTab('b737_cfm56');
    } else {
      const matchedPack = ROBOT_PACKS.find((p) => p.id === lastActorId);
      navigateRobotics({ tab: 'hangar_3d', ...(matchedPack ? { robot: matchedPack.id } : {}) });
    }
  };

  const handleEnterMarsCombat = (actorOverride?: string) => {
    const resolvedActor =
      actorOverride ||
      (activeTab === 'mars2020'
        ? 'mars2020'
        : activeTab === 'b737_cfm56' || activeTab === 'b737_bridge'
          ? 'unitree_g1'
          : selectedPack.id);
    setSandboxActorId(resolvedActor);
    setAppMode('mars_combat');
  };

  // Global KeyG (Action Sandbox) and KeyR (Hangar Progressive Path Tracing) shortcuts while in CAD Hub
  useEffect(() => {
    if (appMode !== 'cad_hub') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'KeyG' && !e.repeat) {
        const actor =
          activeTab === 'mars2020'
            ? 'mars2020'
            : activeTab === 'b737_cfm56' || activeTab === 'b737_bridge'
              ? 'b737_cfm56'
              : selectedPack.id;
        setSandboxActorId(actor);
        setAppMode('sandbox');
      } else if (e.code === 'KeyR' && !e.repeat && activeTab === 'hangar_3d') {
        setPathTracingEnabled((prev) => !prev);
      } else if (e.code === 'KeyQ' && !e.repeat && activeTab === 'hangar_3d') {
        handleTriggerUltimateShowcase();
      } else if (e.code === 'KeyK' && !e.repeat && activeTab === 'hangar_3d') {
        handleCycleDirectorCamera();
      } else if (e.code === 'KeyC' && !e.repeat && activeTab === 'hangar_3d') {
        handleToggleMicroFpv();
      } else if (e.code === 'KeyP' && !e.repeat && activeTab === 'hangar_3d') {
        setPushTestArmed(true);
        handleTriggerPushImpulse();
      } else if (e.code === 'KeyN' && !e.repeat && activeTab === 'hangar_3d') {
        handleResetGrappledParts();
      } else if (e.code === 'KeyT' && !e.repeat && activeTab === 'hangar_3d') {
        handleTriggerTacticalPulse();
      } else if (e.code === 'KeyH' && !e.repeat) {
        setZenMode((z) => !z);
      } else if (e.code === 'Escape') {
        setActiveDrawer(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [appMode, activeTab, selectedPack.id]);

  // Fetch and parse real .urdf / .xacro file for the selected robot pack
  useEffect(() => {
    const urdfPath = `/baselines/${selectedPack.baselineRepo}/${selectedPack.primaryUrdf}`;
    let cancelled = false;
    urdfJointsRef.current = [];
    setUrdfJoints([]);
    setJointAngles({});
    fetchTextAssetResilient(urdfPath)
      .then((xmlText) => {
        if (cancelled) return;
        const parsed = parseUrdfJoints(xmlText);
        urdfJointsRef.current = parsed;
        setUrdfJoints(parsed);
        setJointAngles({});
      })
      .catch(() => {
        if (!cancelled) {
          urdfJointsRef.current = [];
          setUrdfJoints([]);
          setJointAngles({});
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedPack]);

  // Load raw URDF/XML/MD file content in Baseline Explorer
  useEffect(() => {
    if (!selectedRepo || !selectedFileRel) return;
    const issue = selectedRepo.fileIssues?.[selectedFileRel];
    if (issue?.status === 'missing') { setFileContent(issue.reason); return; }
    if (/\.(png|jpe?g|webp|gif|svg)$/i.test(selectedFileRel)) { setFileContent(''); return; }
    const rawPath = roboticsAssetUrl(`baselines/${selectedRepo.category}/${selectedRepo.repository}/${selectedFileRel}`);
    let cancelled = false;
    setFileContent(`正在读取已归档基准文件: ${rawPath} ...`);

    fetchTextAssetResilient(rawPath)
      .then((txt) => {
        if (cancelled) return;
        setFileContent(txt);
      })
      .catch((err) => {
        if (cancelled) return;
        setFileContent(
          `读取提示 (${err instanceof Error ? err.message : '网络重试已耗尽'})：可从右侧直接打开或从 GitHub 仓库查看完整文件。\n路径: ${rawPath}`
        );
      });

    return () => {
      cancelled = true;
    };
  }, [selectedRepo, selectedFileRel]);

  const triggerSmoothCameraFocus = useCallback((targetLook: THREE.Vector3, offset: THREE.Vector3) => {
    stateRef.current.camTargetLook.copy(targetLook);
    stateRef.current.camTargetPos.copy(targetLook).add(offset);
    stateRef.current.camGlideActive = true;
  }, []);

  // Smooth camera framing when switching L0 -> L1 -> L2 -> L3 in Hangar
  const handleSelectDrillLevel = (lvl: DrillLevel) => {
    setActiveDrillLevel(lvl);
    setActiveSubAssembly(null);
    setIsolatedPart(null);
    if (lvl === 'L0') {
      triggerSmoothCameraFocus(new THREE.Vector3(0, 0, 0), new THREE.Vector3(2.35, 1.65, 2.75));
    } else {
      const layerMeshes = partsRef.current.filter((p) => p.layer === lvl).map((p) => p.mesh);
      if (layerMeshes.length > 0) {
        const box = new THREE.Box3();
        layerMeshes.forEach((m) => box.expandByObject(m));
        if (!box.isEmpty()) {
          const center = box.getCenter(new THREE.Vector3());
          triggerSmoothCameraFocus(center, new THREE.Vector3(1.75, 1.15, 2.0));
        }
      }
    }
  };

  const handleSelectSubAssembly = (subId: string) => {
    setIsolatedPart(null);
    const nextId = activeSubAssembly === subId ? null : subId;
    setActiveSubAssembly(nextId);
    if (!nextId) {
      triggerSmoothCameraFocus(new THREE.Vector3(0, 0, 0), new THREE.Vector3(2.35, 1.65, 2.75));
      return;
    }
    const subDef = subAssembliesRef.current.find((sa) => sa.id === subId);
    if (subDef) {
      const box = new THREE.Box3();
      partsRef.current.forEach((p) => {
        if (subDef.partNames.includes(p.partName) && !hiddenParts[p.partName]) {
          box.expandByObject(p.mesh);
        }
      });
      if (!box.isEmpty()) {
        const center = box.getCenter(new THREE.Vector3());
        triggerSmoothCameraFocus(center, new THREE.Vector3(1.5, 0.96, 1.72));
      }
    }
  };

  const handleSelectSubPart = useCallback(
    (partName: string | null) => {
      setHighlightedPart(partName);
      stateRef.current.highlightedPart = partName;
      if (!partName) {
        setIsolatedPart(null);
        setSelectedBlueprintMeta(null);
        setSelectedAnchorScreen(null);
        return;
      }

      stateRef.current.highlightSelectTime = performance.now() / 1000;
      const found = partsRef.current.find((p) => p.partName === partName);
      if (found) {
        const matchedSub = subAssembliesRef.current.find((sa) => sa.partNames.includes(partName));
        const meta = computePartBlueprintMetadata(
          selectedPack.id,
          found.partName,
          found.layer,
          matchedSub?.label || `${found.layer} 运动子总成`,
          found.normSize,
          assemblyNormMaxDimRef.current,
          found.tris,
          found.vertices,
          urdfJointsRef.current
        );
        setSelectedBlueprintMeta(meta);

        const box = new THREE.Box3().setFromObject(found.mesh);
        if (!box.isEmpty()) {
          const center = box.getCenter(new THREE.Vector3());
          triggerSmoothCameraFocus(center, new THREE.Vector3(1.38, 0.9, 1.58));
        }
      }
    },
    [selectedPack.id, triggerSmoothCameraFocus]
  );

  const handleToggleIsolateBlueprint = () => {
    if (!highlightedPart) return;
    const nextIso = isolatedPart === highlightedPart ? null : highlightedPart;
    setIsolatedPart(nextIso);
    const found = partsRef.current.find((p) => p.partName === highlightedPart);
    if (found) {
      const box = new THREE.Box3().setFromObject(found.mesh);
      if (!box.isEmpty()) {
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const d = Math.max(0.72, Math.max(size.x, size.y, size.z) * 2.1);
        triggerSmoothCameraFocus(
          center,
          nextIso ? new THREE.Vector3(d * 0.95, d * 0.65, d * 1.1) : new THREE.Vector3(2.35, 1.65, 2.75)
        );
      }
    }
  };

  const handleTogglePeelPart = () => {
    if (!highlightedPart) return;
    if (peeledParts[highlightedPart]) {
      stateRef.current.snapShake = triggerAssemblySnapShake(0.95);
    }
    proceduralAudioSynth.playMechanicalLatchClick(820);
    setPeeledParts((prev) => {
      const next = { ...prev };
      if (next[highlightedPart]) delete next[highlightedPart];
      else next[highlightedPart] = true;
      return next;
    });
  };

  const handleHideSelectedPart = () => {
    if (!highlightedPart) return;
    setHiddenParts((prev) => ({ ...prev, [highlightedPart]: true }));
    setIsolatedPart(null);
    setHighlightedPart(null);
    stateRef.current.highlightedPart = null;
    setSelectedBlueprintMeta(null);
    setSelectedAnchorScreen(null);
  };

  const handleToggleHidePartInGraph = useCallback((partName: string) => {
    const wasHidden = Boolean(stateRef.current.hiddenParts[partName]);
    setHiddenParts((prev) => {
      const next = { ...prev };
      if (next[partName]) {
        delete next[partName];
      } else {
        next[partName] = true;
      }
      return next;
    });
    if (stateRef.current.isolatedPart === partName) {
      setIsolatedPart(null);
    }
    if (stateRef.current.highlightedPart === partName && !wasHidden) {
      setHighlightedPart(null);
      stateRef.current.highlightedPart = null;
      setSelectedBlueprintMeta(null);
      setSelectedAnchorScreen(null);
    }
  }, []);

  const handleHoverSceneGraphPart = useCallback((partName: string | null) => {
    if (partName && partName !== stateRef.current.hoveredPart) {
      proceduralAudioSynth.playPartHoverTick();
    }
    setHoveredPart(partName);
    stateRef.current.hoveredPart = partName;
    if (!partName) {
      setHoveredCallout(null);
      setHoverThermalReadout(null);
      return;
    }
    const cam = cameraRef.current;
    const container = mountRef.current;
    const idx = partsRef.current.findIndex((p) => p.partName === partName);
    if (cam && container && idx >= 0) {
      const hovP = partsRef.current[idx];
      const graphIdx = meshNodesRef.current.findIndex((n) => n.name === hovP.partName);
      if (hovP.mesh.visible) {
        const worldPos = hovP.geomLocalCenter.clone();
        hovP.mesh.localToWorld(worldPos);
        const proj = worldPos.clone().project(cam);
        if (proj.z >= -1 && proj.z <= 1) {
          const w = container.clientWidth || 960;
          const h = container.clientHeight || 640;
          setHoveredCallout({
            partName: hovP.partName,
            index: graphIdx >= 0 ? graphIdx : idx,
            layer: hovP.layer,
            tris: hovP.tris,
            screenX: (proj.x * 0.5 + 0.5) * w,
            screenY: (-proj.y * 0.5 + 0.5) * h,
            worldMm: [worldPos.x * 1000, worldPos.y * 1000, worldPos.z * 1000]
          });
        }
      }
    }
  }, []);

  const handleResetAllParts = () => {
    setIsolatedPart(null);
    setPeeledParts({});
    setHiddenParts({});
    setHoveredPart(null);
    setViewportHoveredPart(null);
    setHoveredCallout(null);
    stateRef.current.hoveredPart = null;
    setActiveSubAssembly(null);
    setAutoDisassembly(false);
    setAutoStageLabel('');
    setExplosion(0);
    stateRef.current.autoDisassemblyState.active = false;
    stateRef.current.autoDisassemblyState.progress = 0;
    stateRef.current.targetExplosion = 0;
    triggerSmoothCameraFocus(new THREE.Vector3(0, 0, 0), new THREE.Vector3(2.35, 1.65, 2.75));
  };

  // Initialize Three.js Mega-Hangar Viewport & Load Real GLB via GLTFLoader
  useEffect(() => {
    if (appMode !== 'cad_hub' || activeTab !== 'hangar_3d' || !mountRef.current) return;
    let disposed = false;
    const container = mountRef.current;
    const width = container.clientWidth || 960;
    const height = container.clientHeight || 640;
    setViewportSize({ w: width, h: height });

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d1017);
    scene.fog = new THREE.FogExp2(0x0d1017, 0.036);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.01, 200);
    camera.position.set(2.35, 1.65, 2.75);
    cameraRef.current = camera;

    const isSoftwareGl = detectSoftwareWebGL();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance'
      });
    } catch {
      cameraRef.current = null;
      boundJointsRef.current = [];
      rebuildSkeletonRef.current = null;
      setMeshNodes([]);
      setJointBindingReport({ bound: [], missing: [], ambiguous: [] });
      setIsLoadingGlb(false);
      setGlbLoadError('当前浏览器无法创建 WebGL 画面。原始档案与其他工作区仍可使用，启用 WebGL 后可点击重试。');
      return;
    }
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.localClippingEnabled = true;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Procedural HDR Industrial Studio Lightbox PMREM Environment
    const envTex = createStudioLightboxPmrem(renderer);
    scene.environment = envTex;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controlsRef.current = controls;

    const onControlStart = () => {
      stateRef.current.camGlideActive = false;
      if (stateRef.current.directorCamMode !== 'off') {
        stateRef.current.directorCamMode = 'off';
        setDirectorCamMode('off');
        camera.fov = 42;
        camera.up.set(0, 1, 0);
        camera.updateProjectionMatrix();
      }
    };
    controls.addEventListener('start', onControlStart);

    // Calibrated CAD / Digital Twin Key-Fill-Rim Studio Lighting (prevents white-shell clipping while carving volumetric form)
    const hemi = new THREE.HemisphereLight(0xdbeafe, 0x11151d, 0.62);
    scene.add(hemi);
    const keyLight = new THREE.DirectionalLight(0xfff7ed, 1.28);
    keyLight.position.set(4.6, 7.6, 5.4);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 1.0;
      keyLight.shadow.camera.far = 20.0;
      keyLight.shadow.camera.left = -2.4;
      keyLight.shadow.camera.right = 2.4;
      keyLight.shadow.camera.top = 2.4;
      keyLight.shadow.camera.bottom = -2.4;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.015;
    }
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x7dd3fc, 0.78);
    rimLight.position.set(-5.8, 3.8, -4.8);
    scene.add(rimLight);
    const bottomLight = new THREE.DirectionalLight(0x38bdf8, 0.26);
    bottomLight.position.set(0, -5, 2);
    scene.add(bottomLight);

    // Infinite Matte Space-Gray Industrial Deck with Soft Near-Ground Contact Shadow & Subtle Grazing Reflection
    const saltlineDeck = createSaltlineReflectorDeck(isSoftwareGl, -0.86);
    scene.add(saltlineDeck.mesh);

    // Dual-Gear Hybrid Ray-Tracing & Progressive Monte Carlo Path-Tracing Pipeline
    const rayTracer = createDualGearRayTracingPipeline(renderer, width, height, isSoftwareGl);
    rayTracerRef.current = rayTracer;
    let emissiveSources: EmissiveAreaLightSource[] = [];

    // Soft radial sprite texture for Hangar Fault Sparks / Smoke & Plasma Kerf Beads
    const sparkCanvas = document.createElement('canvas');
    sparkCanvas.width = 64;
    sparkCanvas.height = 64;
    const sCtx = sparkCanvas.getContext('2d')!;
    const sGrad = sCtx.createRadialGradient(32, 32, 2, 32, 32, 30);
    sGrad.addColorStop(0, 'rgba(255,255,255,1)');
    sGrad.addColorStop(0.4, 'rgba(255,255,255,0.68)');
    sGrad.addColorStop(1, 'rgba(255,255,255,0)');
    sCtx.fillStyle = sGrad;
    sCtx.fillRect(0, 0, 64, 64);
    const softSpriteTex = new THREE.CanvasTexture(sparkCanvas);
    softSpriteTex.colorSpace = THREE.SRGBColorSpace;

    // 6-DOF CCD IK Holographic Target Gizmo & Plasma Cutting Torch FX
    const ikPlasmaFx = createIkAndPlasmaFXController(softSpriteTex);
    scene.add(ikPlasmaFx.group);

    // Pooled Spark / Smoke Particle System for Fault Injection & Plasma Cutting
    const sparkPoolCount = 120;
    const sparkPos = new Float32Array(sparkPoolCount * 3);
    const sparkCol = new Float32Array(sparkPoolCount * 3);
    const sparkVel = new Float32Array(sparkPoolCount * 3);
    const sparkLife = new Float32Array(sparkPoolCount);
    let sparkCursor = 0;
    for (let i = 0; i < sparkPoolCount; i++) sparkPos[i * 3 + 1] = -999;
    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
    sparkGeo.setAttribute('color', new THREE.BufferAttribute(sparkCol, 3));
    const sparkPoints = new THREE.Points(
      sparkGeo,
      new THREE.PointsMaterial({
        map: softSpriteTex,
        size: 0.16,
        vertexColors: true,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    sparkPoints.frustumCulled = false;
    scene.add(sparkPoints);

    const spawnHangarSpark = (
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
      const idx = sparkCursor % sparkPoolCount;
      sparkCursor++;
      sparkPos[idx * 3] = x;
      sparkPos[idx * 3 + 1] = y;
      sparkPos[idx * 3 + 2] = z;
      sparkVel[idx * 3] = vx;
      sparkVel[idx * 3 + 1] = vy;
      sparkVel[idx * 3 + 2] = vz;
      sparkCol[idx * 3] = r;
      sparkCol[idx * 3 + 1] = g;
      sparkCol[idx * 3 + 2] = b;
      sparkLife[idx] = life;
    };

    // Hangar Bay Calibration Perimeter Ring (pure LineLoop, zero primitive geometry)
    const bayRingPts: THREE.Vector3[] = [];
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      bayRingPts.push(new THREE.Vector3(Math.cos(a) * 1.62, 0, Math.sin(a) * 1.62));
    }
    const bayRing = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(bayRingPts),
      new THREE.LineBasicMaterial({ color: 0x2c3646, transparent: true, opacity: 0.18 })
    );
    bayRing.position.y = -0.83;
    scene.add(bayRing);

    const modelRoot = new THREE.Group();
    scene.add(modelRoot);

    const skelGroup = new THREE.Group();
    scene.add(skelGroup);
    skeletonGroupRef.current = skelGroup;

    // Module 5: Precision Optical Laser Section Plane
    const opticalSection = createOpticalSectionAssembly(1.42);
    scene.add(opticalSection.group);

    // System 1: Exploded Trace Dashed Lines & CAD Engineering Dimension Wireframe Rig
    const traceController = createExplodedTraceLinesController(260);
    scene.add(traceController.group);
    const blueprintRig = createBlueprintDimensionRig();
    scene.add(blueprintRig.group);

    // Five Hardcore Sci-Tech 3D Scene FX Controllers (Mag-Lens + SLS, MPC + Power Arteries, Wind-Tunnel Disaster)
    const magSlsRig = createMagLensAndSlsRigController();
    scene.add(magSlsRig.group);
    const mpcPowerCtrl = createMpcAndPowerArteriesController();
    scene.add(mpcPowerCtrl.group);
    const disasterFx = createWindTunnelDisasterFXController();
    scene.add(disasterFx.group);
    const salvageFx = createShipbreakerSalvageController();
    scene.add(salvageFx.group);
    const signatureFx = createSignatureShowcaseSceneFXController(0);
    scene.add(signatureFx.rootGroup);
    const studioRig = createStudioAtmosphereRig(isSoftwareGl);
    scene.add(studioRig.group);
    const sciVizCtrl = createScientificVizSceneController();
    scene.add(sciVizCtrl.group);
    const scifiVfxCtrl = createSciFiHangarVfxController();
    scene.add(scifiVfxCtrl.group);
    const tactileCtrl = createTactileInteractionSceneController();
    scene.add(tactileCtrl.group);
    const webmRecorder = createCanvasWebmRecorder(() => renderer.domElement);
    webmRecorderRef.current = webmRecorder;
    const _ultEuler = new THREE.Euler();

    // Module 3A: Unitree-Signature 3D Push-Recovery Impact Force Vector Arrow Rig
    const pushArrowGroup = new THREE.Group();
    pushArrowGroup.visible = false;
    const pushShaftGeo = new THREE.CylinderGeometry(0.019, 0.019, 0.64, 14);
    const pushHeadGeo = new THREE.ConeGeometry(0.058, 0.165, 16);
    const pushRingGeo = new THREE.RingGeometry(0.05, 0.105, 28);
    const pushArrowMat = new THREE.MeshBasicMaterial({
      color: 0xf97316,
      transparent: true,
      opacity: 0.96,
      depthTest: false,
      blending: THREE.AdditiveBlending
    });
    const pushRingMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide,
      depthTest: false,
      blending: THREE.AdditiveBlending
    });
    // Orient along local +Z pointing into origin (0,0,0): shaft at z = -0.40, cone tip at z = 0
    const pushShaftMesh = new THREE.Mesh(pushShaftGeo, pushArrowMat);
    pushShaftMesh.rotation.x = Math.PI * 0.5;
    pushShaftMesh.position.set(0, 0, -0.40);
    pushShaftMesh.renderOrder = 14;
    const pushHeadMesh = new THREE.Mesh(pushHeadGeo, pushArrowMat);
    pushHeadMesh.rotation.x = Math.PI * 0.5;
    pushHeadMesh.position.set(0, 0, -0.085);
    pushHeadMesh.renderOrder = 14;
    const pushContactRing = new THREE.Mesh(pushRingGeo, pushRingMat);
    pushContactRing.renderOrder = 15;
    pushArrowGroup.add(pushShaftMesh, pushHeadMesh, pushContactRing);
    scene.add(pushArrowGroup);
    const _pushLookTarget = new THREE.Vector3();

    // Module 3B: 3D MPC Floor-Click Target Beacon Ring
    const mpcBeaconGroup = new THREE.Group();
    mpcBeaconGroup.visible = false;
    const mpcOuterRingGeo = new THREE.RingGeometry(0.12, 0.155, 36);
    const mpcInnerDiscGeo = new THREE.CircleGeometry(0.05, 24);
    const mpcBeaconMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const mpcOuterRing = new THREE.Mesh(mpcOuterRingGeo, mpcBeaconMat);
    mpcOuterRing.rotation.x = -Math.PI * 0.5;
    const mpcInnerDisc = new THREE.Mesh(mpcInnerDiscGeo, mpcBeaconMat);
    mpcInnerDisc.rotation.x = -Math.PI * 0.5;
    mpcBeaconGroup.add(mpcOuterRing, mpcInnerDisc);
    scene.add(mpcBeaconGroup);

    // Hardspace: Shipbreaker 2nd-Order Spring-Damper Grapple State per .glb sub-part
    const grappleSprings = new Map<string, SpringDamperVec3State>();
    let draggingGrapplePart: string | null = null;
    let lastGrappledPart: string | null = null;
    let grappleGrabStartTarget: [number, number, number] = [0, 0, 0];
    const grappleGrabPointWorld = new THREE.Vector3();
    const grappleDragPlane = new THREE.Plane();
    const grappleDragHit = new THREE.Vector3();

    resetGrappledPartsRef.current = () => {
      grappleSprings.forEach((sp) => {
        sp.target = [0, 0, 0];
      });
      draggingGrapplePart = null;
      lastGrappledPart = null;
    };
    setFloatingPartsCount(0);

    // 3D Viewport Mouse Click Raycasting + 6-DOF IK Holographic Target Dragging + Shipbreaker Grapple + 3D Mag-Lens Hover!
    let pointerDownPos: [number, number] | null = null;
    let draggingIkGizmo = false;
    let lastMagRaycastAt = 0;
    let lastHoverRaycastAt = 0;
    let lastViewportHoverName: string | null = null;
    const ikDragPlane = new THREE.Plane();
    const ikDragHit = new THREE.Vector3();

    const onPointerDown = (ev: PointerEvent) => {
      if (ev.button !== 0) return;
      pointerDownPos = [ev.clientX, ev.clientY];

      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 10 || rect.height <= 10) return;
      _pointerNdc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      _pointerNdc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      _raycaster.setFromCamera(_pointerNdc, camera);

      if (stateRef.current.ikEnabled) {
        const gizmoHits = _raycaster.intersectObject(ikPlasmaFx.hitProxyMesh, false);
        if (gizmoHits.length > 0) {
          draggingIkGizmo = true;
          controls.enabled = false;
          const camDir = new THREE.Vector3();
          camera.getWorldDirection(camDir);
          ikDragPlane.setFromNormalAndCoplanarPoint(
            camDir.negate(),
            stateRef.current.ikTargetWorld
          );
          return;
        }
      }

      if (stateRef.current.shipbreakerEnabled && !stateRef.current.isolatedPart) {
        const pickables = partsRef.current
          .filter((p) => p.mesh.visible && !stateRef.current.hiddenParts[p.partName])
          .map((p) => p.mesh);
        const hits = _raycaster.intersectObjects(pickables, false);
        if (hits.length > 0) {
          const hitMesh = hits[0].object as THREE.Mesh;
          const hitPart = partsRef.current.find((p) => p.mesh === hitMesh);
          if (hitPart) {
            draggingGrapplePart = hitPart.partName;
            lastGrappledPart = hitPart.partName;
            controls.enabled = false;
            grappleGrabPointWorld.copy(hits[0].point);
            const camDir = new THREE.Vector3();
            camera.getWorldDirection(camDir);
            grappleDragPlane.setFromNormalAndCoplanarPoint(camDir.negate(), hits[0].point);
            let existing = grappleSprings.get(hitPart.partName);
            if (!existing) {
              existing = { pos: [0, 0, 0], vel: [0, 0, 0], target: [0, 0, 0] };
              grappleSprings.set(hitPart.partName, existing);
            }
            grappleGrabStartTarget = [...existing.target];
            proceduralAudioSynth.playMechanicalLatchClick(540);
          }
        }
      }
    };

    const onPointerMove = (ev: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) return;

      const curNdcX = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      const curNdcY = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      stateRef.current.cursorValid = true;
      stateRef.current.pointerNdcX = curNdcX;
      stateRef.current.pointerNdcY = curNdcY;

      if (draggingIkGizmo) {
        _pointerNdc.set(curNdcX, curNdcY);
        _raycaster.setFromCamera(_pointerNdc, camera);
        if (_raycaster.ray.intersectPlane(ikDragPlane, ikDragHit)) {
          ikDragHit.clampLength(0.18, 1.85);
          stateRef.current.ikTargetWorld.copy(ikDragHit);
        }
        return;
      }

      if (draggingGrapplePart) {
        _pointerNdc.set(curNdcX, curNdcY);
        _raycaster.setFromCamera(_pointerNdc, camera);
        if (_raycaster.ray.intersectPlane(grappleDragPlane, grappleDragHit)) {
          const dx = grappleDragHit.x - grappleGrabPointWorld.x;
          const dy = grappleDragHit.y - grappleGrabPointWorld.y;
          const dz = grappleDragHit.z - grappleGrabPointWorld.z;
          const sp = grappleSprings.get(draggingGrapplePart);
          if (sp) {
            const tx = Math.max(-1.85, Math.min(1.85, grappleGrabStartTarget[0] + dx));
            const ty = Math.max(-1.25, Math.min(1.85, grappleGrabStartTarget[1] + dy));
            const tz = Math.max(-1.85, Math.min(1.85, grappleGrabStartTarget[2] + dz));
            sp.target = [tx, ty, tz];
          }
        }
        return;
      }

      if (stateRef.current.magLensEnabled) {
        const nowMs = performance.now();
        if (nowMs - lastMagRaycastAt < 28) return;
        lastMagRaycastAt = nowMs;
        _pointerNdc.set(curNdcX, curNdcY);
        _raycaster.setFromCamera(_pointerNdc, camera);
        const pickables = partsRef.current
          .filter((p) => p.mesh.visible && !stateRef.current.hiddenParts[p.partName])
          .map((p) => p.mesh);
        const hits = _raycaster.intersectObjects(pickables, false);
        if (hits.length > 0) {
          stateRef.current.magLensHoverValid = true;
          stateRef.current.magLensCenter.copy(hits[0].point);
        } else {
          stateRef.current.magLensHoverValid = false;
        }
        return;
      }

      if (ev.buttons === 0 && !stateRef.current.isolatedPart) {
        const nowMs = performance.now();
        if (nowMs - lastHoverRaycastAt >= 55) {
          lastHoverRaycastAt = nowMs;
          _pointerNdc.set(curNdcX, curNdcY);
          _raycaster.setFromCamera(_pointerNdc, camera);
          const pickables = partsRef.current
            .filter((p) => p.mesh.visible && !stateRef.current.hiddenParts[p.partName])
            .map((p) => p.mesh);
          const hits = _raycaster.intersectObjects(pickables, false);
          const hitName = hits.length > 0
            ? partsRef.current.find((p) => p.mesh === (hits[0].object as THREE.Mesh))?.partName || null
            : null;
          if (hitName !== lastViewportHoverName) {
            if (hitName) {
              proceduralAudioSynth.playPartHoverTick();
            }
            lastViewportHoverName = hitName;
            setViewportHoveredPart(hitName);
          }
        }
      }
    };

    const onPointerLeave = () => {
      stateRef.current.cursorValid = false;
      stateRef.current.magLensHoverValid = false;
      if (lastViewportHoverName !== null) {
        lastViewportHoverName = null;
        setViewportHoveredPart(null);
      }
    };

    let magWheelRaf = 0;
    const onWheel = (ev: WheelEvent) => {
      if (!stateRef.current.magLensEnabled) return;
      ev.preventDefault();
      ev.stopPropagation();
      const next = clampMagLensRadius(stateRef.current.magLensRadius, ev.deltaY);
      stateRef.current.magLensRadius = next;
      if (!magWheelRaf) {
        magWheelRaf = requestAnimationFrame(() => {
          magWheelRaf = 0;
          if (!disposed) {
            setMagLensRadius(stateRef.current.magLensRadius);
          }
        });
      }
    };

    const onPointerUp = (ev: PointerEvent) => {
      if (draggingIkGizmo) {
        draggingIkGizmo = false;
        if (!stateRef.current.activeCamPreset && !stateRef.current.microFpvActive) {
          controls.enabled = true;
        }
        pointerDownPos = null;
        return;
      }
      if (draggingGrapplePart) {
        const releasedPartName = draggingGrapplePart;
        draggingGrapplePart = null;
        if (!stateRef.current.activeCamPreset && !stateRef.current.microFpvActive) {
          controls.enabled = true;
        }
        const clickDist = pointerDownPos
          ? Math.hypot(ev.clientX - pointerDownPos[0], ev.clientY - pointerDownPos[1])
          : 99;
        pointerDownPos = null;
        const sp = grappleSprings.get(releasedPartName);
        const hitPart = partsRef.current.find((p) => p.partName === releasedPartName);
        if (sp && hitPart && clickDist < 5) {
          // Single-click in Shipbreaker mode pops the part outward along its peel vector onto the magnetic tether!
          const curMag = Math.hypot(sp.target[0], sp.target[1], sp.target[2]);
          if (curMag < 0.06) {
            const pv = hitPart.orthoPlan.peelVector;
            sp.target = [pv[0] * 1.45, Math.max(0.18, pv[1] * 1.45 + 0.14), pv[2] * 1.45];
          } else {
            sp.target = [0, 0, 0];
            stateRef.current.snapShake = triggerAssemblySnapShake(1.1);
            proceduralAudioSynth.playMechanicalLatchClick(920);
          }
          handleSelectSubPart(releasedPartName);
        }
        let floatCnt = 0;
        grappleSprings.forEach((st) => {
          if (Math.hypot(st.target[0], st.target[1], st.target[2]) > 0.03) floatCnt++;
        });
        setFloatingPartsCount(floatCnt);
        if (floatCnt === 0) lastGrappledPart = null;
        return;
      }
      if (!pointerDownPos || ev.button !== 0) return;
      const dist = Math.hypot(ev.clientX - pointerDownPos[0], ev.clientY - pointerDownPos[1]);
      pointerDownPos = null;
      if (dist >= 5) return;

      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) return;
      _pointerNdc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      _pointerNdc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      _raycaster.setFromCamera(_pointerNdc, camera);

      // Dimension 3: Conformal Hex Energy Shield 3D Raycast Hit Ripple on click!
      if (stateRef.current.scifiConfig.hexShieldEnabled && !stateRef.current.isolatedPart) {
        const shieldHits = _raycaster.intersectObject(scifiVfxCtrl.shieldMesh, false);
        if (shieldHits.length > 0) {
          scifiVfxCtrl.triggerShieldHit(shieldHits[0].point);
          proceduralAudioSynth.playHexShieldRippleResonance(true);
          stateRef.current.camImpulse = triggerCameraMicroImpulse(0.38, [0, -0.5, 0], 0.11);
        }
      }

      const pickables = partsRef.current
        .filter((p) => p.mesh.visible && !stateRef.current.hiddenParts[p.partName])
        .map((p) => p.mesh);
      const hits = _raycaster.intersectObjects(pickables, false);
      if (hits.length > 0) {
        const hitMesh = hits[0].object as THREE.Mesh;
        const hitPart = partsRef.current.find((p) => p.mesh === hitMesh);
        if (hitPart) {
          if (stateRef.current.tactileConfig.kineticImpactArmed && !stateRef.current.isolatedPart) {
            const hp = hits[0].point.clone();
            camera.matrixWorld.extractBasis(_tmpCamRight, _tmpCamUp, _tmpCamFwd);
            _tmpEmitterW
              .copy(camera.position)
              .addScaledVector(_tmpCamRight, 0.38)
              .addScaledVector(_tmpCamUp, -0.24)
              .addScaledVector(_tmpCamFwd, -0.35);
            tactileCtrl.launchKineticProjectile(
              _tmpEmitterW,
              hp,
              stateRef.current.tactileConfig.kineticImpulseNs,
              hitPart.partName,
              (hitWorld, dirXZ, impNs, pName) => {
                handleTriggerPushImpulse({
                  point: [hitWorld.x, hitWorld.y, hitWorld.z],
                  dir: [dirXZ[0], -0.06, dirXZ[1]],
                  partName: pName,
                  forceN: impNs
                });
                for (let sp = 0; sp < 10; sp++) {
                  spawnHangarSpark(
                    hitWorld.x,
                    hitWorld.y,
                    hitWorld.z,
                    (Math.random() - 0.5) * 2.6,
                    0.5 + Math.random() * 1.4,
                    (Math.random() - 0.5) * 2.6,
                    1.0,
                    0.62,
                    0.18,
                    0.38
                  );
                }
              }
            );
            proceduralAudioSynth.playMechanicalLatchClick(620);
          } else if (stateRef.current.pushTestArmed || ev.altKey) {
            const hp = hits[0].point;
            const rayDir = _raycaster.ray.direction;
            const forceVal = 215 + Math.round(Math.random() * 45);
            handleTriggerPushImpulse({
              point: [hp.x, hp.y, hp.z],
              dir: [rayDir.x, rayDir.y * 0.25, rayDir.z],
              partName: hitPart.partName,
              forceN: forceVal
            });
            for (let sp = 0; sp < 8; sp++) {
              spawnHangarSpark(
                hp.x,
                hp.y,
                hp.z,
                (Math.random() - 0.5) * 2.4,
                0.5 + Math.random() * 1.3,
                (Math.random() - 0.5) * 2.4,
                1.0,
                0.58,
                0.15,
                0.35
              );
            }
          } else if (stateRef.current.ikEnabled && !stateRef.current.faultInjectMode) {
            // Snap 6-DOF IK target directly onto clicked 3D surface point ("指哪伸哪")!
            stateRef.current.ikTargetWorld.copy(hits[0].point);
          } else if (stateRef.current.faultInjectMode) {
            handleInjectFaultOnPart(hitPart.partName);
          } else {
            proceduralAudioSynth.playMechanicalLatchClick(740);
            handleSelectSubPart(hitPart.partName);
          }
        }
      } else {
        // Module 3B: Floor-Click MPC Predictive Walk when MPC is active!
        if (stateRef.current.mpcEnabled && !stateRef.current.isolatedPart) {
          const floorHits = _raycaster.intersectObject(saltlineDeck.mesh, false);
          if (floorHits.length > 0) {
            const fp = floorHits[0].point;
            stateRef.current.mpcWalkState = setMpcFloorTarget(
              stateRef.current.mpcWalkState,
              fp.x,
              fp.z,
              2.55
            );
            setLiveSim(true);
            stateRef.current.liveSim = true;
            proceduralAudioSynth.playMechanicalLatchClick(680);
            return;
          }
        }
        if (!stateRef.current.isolatedPart && !stateRef.current.ikEnabled) {
          handleSelectSubPart(null);
        }
      }
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerleave', onPointerLeave);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

    let flowController: FlowAndSensorFieldController | null = null;
    const traceAnchorsBuf: {
      originWorld: THREE.Vector3;
      currentWorld: THREE.Vector3;
      visible: boolean;
    }[] = [];
    const prismaticJointNodes = new Set<THREE.Object3D>();
    const jointLimitPool = Array.from({ length: 12 }, () => ({
      worldPos: new THREE.Vector3(),
      severity: 'amber' as 'amber' | 'critical'
    }));
    const torqueSamplePool = Array.from({ length: 16 }, () => ({
      worldPos: new THREE.Vector3(),
      axisWorld: new THREE.Vector3(0, 1, 0),
      torqueRatio01: 0,
      omegaRadS: 0
    }));
    const salvageAnchorPool = Array.from({ length: 28 }, () => ({
      pos: new THREE.Vector3(),
      axisWorld: new THREE.Vector3(0, 1, 0)
    }));
    let fpvWaypoints = buildSafeWorldBBoxFpvWaypoints(selectedPack.id, [-1, -0.8, -1], [1, 0.8, 1]);
    void buildMicroFpvCavityWaypoints;
    let skelNodes: SkeletonDynamicNode[] = [];
    let skelRootAxes: THREE.AxesHelper | null = null;
    let skelTopoLinesGeo: THREE.BufferGeometry | null = null;
    let ikChainIndices: number[] = [];
    let ikChainSpecs: IkJointLinkSpec[] = [];
    let ikAngles: number[] = [];
    let ikTipOffset: [number, number, number] = [0.18, 0, 0];

    // Load Real High-Poly GLB Asset via GLTFLoader (Y-up native, no rotation.x override)
    setIsLoadingGlb(true);
    setGlbLoadError(null);
    setJointBindingReport({ bound: [], missing: [], ambiguous: [] });
    loadGltfResilient(selectedPack.glbUrl)
      .then((gltf) => {
        if (disposed) {
          disposeSceneHierarchy(gltf.scene, { disposeTextures: true });
          return;
        }
        const root = gltf.scene;
        root.updateMatrixWorld(true);

        const box = new THREE.Box3().setFromObject(root);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z, 0.001);
        const scale = 2.05 / maxDim;

        root.scale.setScalar(scale);
        root.position.sub(center.multiplyScalar(scale));
        root.updateMatrixWorld(true);

        const normBox = new THREE.Box3().setFromObject(root);
        const normAssemblySize = normBox.getSize(new THREE.Vector3());
        assemblyNormMaxDimRef.current = Math.max(
          normAssemblySize.x,
          normAssemblySize.y,
          normAssemblySize.z,
          0.2
        );
        bboxMinYRef.current = normBox.min.y;
        bboxMaxYRef.current = normBox.max.y;
        const minX = normBox.min.x;
        const spanX = Math.max(0.01, normBox.max.x - normBox.min.x);
        saltlineDeck.setFloorY(normBox.min.y - 0.022);
        saltlineDeck.setContactFootprint(
          (normBox.min.x + normBox.max.x) * 0.5,
          (normBox.min.z + normBox.max.z) * 0.5,
          Math.max(0.42, (normBox.max.x - normBox.min.x) * 0.54),
          Math.max(0.42, (normBox.max.z - normBox.min.z) * 0.54)
        );
        bayRing.position.y = normBox.min.y - 0.018;

        // Module 3: 3D Flow Streamlines & Sensor Perception Cones
        flowController = createFlowAndSensorField(selectedPack.id, normBox.min.y - 0.03);
        scene.add(flowController.group);

        interface TempHangarMesh {
          mesh: THREE.Mesh;
          partName: string;
          layer: 'L1' | 'L2' | 'L3';
          tris: number;
          vertices: number;
          worldCenter: THREE.Vector3;
          normSize: [number, number, number];
          geomLocalCenter: THREE.Vector3;
          socketInParentLocal: THREE.Vector3;
          stdMat: THREE.MeshStandardMaterial;
          twinUniforms: TwinMaterialUniforms;
        }

        const tempMeshes: TempHangarMesh[] = [];
        const nodeList: { name: string; tris: number; layer: 'L1' | 'L2' | 'L3' }[] = [];
        const sourceNodes: THREE.Object3D[] = [];
        root.traverse((node) => sourceNodes.push(node));
        const authoredNodeId = (node: THREE.Object3D): string => {
          const association = gltf.parser.associations.get(node);
          const name = association?.nodes !== undefined ? gltf.parser.json.nodes?.[association.nodes]?.name : undefined;
          return typeof name === 'string' ? name : node.name;
        };
        const objectByName = createExactNodeIndex(sourceNodes, authoredNodeId);
        const usedNames = new Set<string>();

        root.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const m = obj as THREE.Mesh;
            const geom = m.geometry;
            const verts = geom.attributes.position?.count || 0;
            const tris = geom.index ? Math.round(geom.index.count / 3) : Math.round(verts / 3);
            if (tris < 10) return;

            if (!geom.boundingBox) geom.computeBoundingBox();
            const geomLocalCenter = geom.boundingBox
              ? geom.boundingBox.getCenter(new THREE.Vector3())
              : new THREE.Vector3();
            const geomLocalSize = geom.boundingBox
              ? geom.boundingBox.getSize(new THREE.Vector3())
              : new THREE.Vector3(0.05, 0.05, 0.05);
            const meshWorldScale = m.getWorldScale(new THREE.Vector3());
            const obbSizeVec = new THREE.Vector3(
              Math.max(0.002, Math.abs(geomLocalSize.x * meshWorldScale.x)),
              Math.max(0.002, Math.abs(geomLocalSize.y * meshWorldScale.y)),
              Math.max(0.002, Math.abs(geomLocalSize.z * meshWorldScale.z))
            );

            const partBox = new THREE.Box3().setFromObject(m);
            const worldCenter = partBox.isEmpty()
              ? m.getWorldPosition(new THREE.Vector3())
              : partBox.getCenter(new THREE.Vector3());

            const socketInParentLocal = m.parent
              ? m.parent.worldToLocal(worldCenter.clone())
              : worldCenter.clone();

            let partName = m.name || `cad_mesh_${tempMeshes.length}`;
            if (usedNames.has(partName)) {
              partName = `${partName}_${tempMeshes.length}`;
            }
            usedNames.add(partName);
            m.name = partName;

            const layer = classifyMeshLayer(partName);
            const baseMat = Array.isArray(m.material) ? m.material[0] : m.material;
            const stdMat = (
              baseMat ? baseMat.clone() : new THREE.MeshStandardMaterial({ color: 0x94a3b8 })
            ) as THREE.MeshStandardMaterial;
            stdMat.clippingPlanes = [clipPlaneRef.current];
            stdMat.clipShadows = true;
            // Module 1: Pass layer === 'L1' + layer code so outer armor dissolves under Mag-Lens & sliced faces show alloy cross-hatching!
            const twinUniforms = attachTwinShaderEffects(stdMat, layer === 'L1', layer);
            m.material = stdMat;
            m.castShadow = !isSoftwareGl;
            m.receiveShadow = !isSoftwareGl;

            if (tris >= 150) {
              nodeList.push({ name: partName, tris, layer });
            }

            tempMeshes.push({
              mesh: m,
              partName,
              layer,
              tris,
              vertices: verts,
              worldCenter,
              normSize: [obbSizeVec.x, obbSizeVec.y, obbSizeVec.z],
              geomLocalCenter,
              socketInParentLocal,
              stdMat,
              twinUniforms
            });
          }
        });

        // Build 8-12 Fine-Grained Sub-Assembly Matrix from actual loaded GLB meshes
        const computedSubs = buildSubAssemblyMatrix(
          selectedPack.id,
          tempMeshes.map((tm) => ({
            name: tm.partName,
            tris: tm.tris,
            layer: tm.layer,
            center: [tm.worldCenter.x, tm.worldCenter.y, tm.worldCenter.z]
          }))
        );
        subAssembliesRef.current = computedSubs;
        setSubAssemblies(computedSubs);

        const rawPlanByMesh = new Map<THREE.Object3D, OrthogonalExplosionPlan>();
        for (const tm of tempMeshes) {
          rawPlanByMesh.set(
            tm.mesh,
            computePartOrthogonalExplosionPlan(
              selectedPack.id,
              tm.partName,
              tm.layer,
              [tm.worldCenter.x, tm.worldCenter.y, tm.worldCenter.z],
              computedSubs
            )
          );
        }

        traceAnchorsBuf.length = 0;
        const loadedParts: LoadedRobotPart[] = tempMeshes.map((tm) => {
          const m = tm.mesh;
          const rawPlan = rawPlanByMesh.get(m)!;
          let anc = m.parent;
          let parentRawPlan: OrthogonalExplosionPlan | undefined;
          while (anc) {
            const hit = rawPlanByMesh.get(anc);
            if (hit) {
              parentRawPlan = hit;
              break;
            }
            anc = anc.parent;
          }
          const adjVec: [number, number, number] = [
            rawPlan.orthoVector[0],
            rawPlan.orthoVector[1],
            rawPlan.orthoVector[2]
          ];
          if (parentRawPlan) {
            for (let a = 0; a < 3; a++) {
              const c = rawPlan.orthoVector[a];
              const p = parentRawPlan.orthoVector[a];
              if (c * p > 0) {
                adjVec[a] = Math.sign(c) * Math.max(Math.abs(c) * 0.15, Math.abs(c) - Math.abs(p));
              }
            }
          }
          const orthoPlan: OrthogonalExplosionPlan = parentRawPlan
            ? { ...rawPlan, orthoVector: adjVec }
            : rawPlan;

          const parentNode = m.parent;
          const originParentLocal = parentNode
            ? parentNode.worldToLocal(tm.worldCenter.clone())
            : tm.worldCenter.clone();
          const orthoTargetWorld = tm.worldCenter
            .clone()
            .add(new THREE.Vector3(...orthoPlan.orthoVector));
          const peelTargetWorld = tm.worldCenter
            .clone()
            .add(new THREE.Vector3(...orthoPlan.peelVector));
          const localOrthoVec = parentNode
            ? parentNode.worldToLocal(orthoTargetWorld).sub(originParentLocal)
            : new THREE.Vector3(...orthoPlan.orthoVector);
          const localPeelVec = parentNode
            ? parentNode.worldToLocal(peelTargetWorld).sub(originParentLocal)
            : new THREE.Vector3(...orthoPlan.peelVector);

          const normAxialX = ((tm.worldCenter.x - minX) / spanX) * 2 - 1;
          const mountOriginWorld = tm.worldCenter.clone();
          const currentCenterWorld = tm.worldCenter.clone();
          traceAnchorsBuf.push({
            originWorld: mountOriginWorld,
            currentWorld: currentCenterWorld,
            visible: true
          });

          return {
            mesh: m,
            partName: tm.partName,
            layer: tm.layer,
            tris: tm.tris,
            vertices: tm.vertices,
            basePos: m.position.clone(),
            geomLocalCenter: tm.geomLocalCenter,
            socketInParentLocal: tm.socketInParentLocal,
            localOrthoVec,
            localPeelVec,
            normSize: tm.normSize,
            orthoPlan,
            mountOriginWorld,
            currentCenterWorld,
            peelAmount: 0,
            normAxialX,
            origMat: tm.stdMat,
            origSide: tm.stdMat.side,
            origColor: tm.stdMat.color ? tm.stdMat.color.clone() : new THREE.Color(0x94a3b8),
            twinUniforms: tm.twinUniforms
          };
        });

        nodeList.sort((a, b) => b.tris - a.tris);
        modelRoot.add(root);
        partsRef.current = loadedParts;
        meshNodesRef.current = nodeList;
        setMeshNodes(nodeList);

        // Build Static per-mesh BLAS (MeshBVH) once & upgrade PBR microfacet / Emissive Area Light tags!
        const bvhInfo = upgradeGlbPbrAndBuildStaticBvh(root, selectedPack.id, classifyMeshLayer);
        for (let i = 0; i < loadedParts.length; i++) {
          const lp = loadedParts[i];
          lp.twinUniforms.uMicroSurfaceClass.value = Number(
            lp.origMat.userData?.microSurfaceClass ?? 0
          );
        }
        emissiveSources = bvhInfo.emissiveSources;
        setBvhStats({ meshes: bvhInfo.bvhMeshCount, emissives: bvhInfo.emissiveSources.length });
        rayTracer.resetAccumulation();

        // Bind Sci-Tech Module 1 (1.8s Dual-Laser SLS Genesis Print), Module 2 (MPC Future Ghosts), Module 3 (GLB Skin Vertices), Module 4 (Micro-FPV Cavity Spline)
        bboxMinVecRef.current = [normBox.min.x, normBox.min.y, normBox.min.z];
        bboxMaxVecRef.current = [normBox.max.x, normBox.max.y, normBox.max.z];
        fpvWaypoints = buildSafeWorldBBoxFpvWaypoints(
          selectedPack.id,
          bboxMinVecRef.current,
          bboxMaxVecRef.current
        );
        mpcPowerCtrl.bindFutureGhostModel(root);
        disasterFx.bindRealGlbSurfaceVertices(root);
        stateRef.current.slsState = {
          ...createInitialSlsState(1.8),
          active: false,
          laserY: normBox.max.y + 0.5,
          progress: 1
        };
        setSlsActive(false);
        sciVizCtrl.clearLidarCloud();
        if (initialPackLoadedRef.current && stateRef.current.scifiConfig.autoSpawnMaterialize) {
          stateRef.current.naniteState = triggerNaniteSpawnSweep(0.65);
        } else {
          stateRef.current.naniteState = createInitialNaniteState();
        }
        initialPackLoadedRef.current = true;

        setIsLoadingGlb(false);

        // Bind parsed URDF joints to the real gltf.scene nodes & build dynamic L0 Coordinate Skeleton + CCD IK Chain
        // NOTE: skelGroup materials are intentionally UNCLIPPED so Optical Sectioning exposes the full internal URDF skeleton inside sliced regions!
        const buildSkeletonAndBindJoints = () => {
          disposeSceneHierarchy(skelGroup);
          skelGroup.clear();
          skelNodes = [];
          skelTopoLinesGeo = null;
          prismaticJointNodes.clear();

          const rootAxes = new THREE.AxesHelper(1.25);
          skelRootAxes = rootAxes;
          skelGroup.add(rootAxes);

          const circlePts: THREE.Vector3[] = [];
          for (let i = 0; i < 28; i++) {
            const a = (i / 28) * Math.PI * 2;
            circlePts.push(new THREE.Vector3(Math.cos(a) * 0.065, Math.sin(a) * 0.065, 0));
          }
          const ringGeo = new THREE.BufferGeometry().setFromPoints(circlePts);
          const ringMat = new THREE.LineBasicMaterial({
            color: 0x38bdf8,
            transparent: true,
            opacity: 0.88
          });

          root.updateMatrixWorld(true);
          const jointsToBind = urdfJointsRef.current;

          if (jointsToBind.length > 0) {
            const bindings: BoundUrdfJoint[] = [];
            const report = { bound: [] as string[], missing: [] as string[], ambiguous: [] as string[] };
            for (const j of jointsToBind) {
              const match = resolveExactJointNode(objectByName, j.child, node => !!node.parent && authoredNodeId(node.parent) === j.parent);
              report[match.status].push(j.name);
              const target = match.node;
              if (target) {
                const ax = new THREE.Vector3(j.axis[0], j.axis[1], j.axis[2]);
                if (ax.lengthSq() < 1e-5) ax.set(1, 0, 0);
                else ax.normalize();
                bindings.push({
                  def: j,
                  targetNode: target,
                  basePos: target.position.clone(),
                  baseQuat: target.quaternion.clone(),
                  axisVec: ax,
                  currentVal: 0,
                  omegaRadS: 0
                });
                if (j.type === 'prismatic') {
                  prismaticJointNodes.add(target);
                }
              }
            }
            boundJointsRef.current = bindings;
            setJointBindingReport(report);

            // Extract 6-DOF / 7-DOF Serial Manipulator Chain for Real-Time CCD IK!
            ikChainIndices = extractManipulatorJointIndices(
              selectedPack.id,
              bindings.map((b) => b.def)
            );
            ikChainSpecs = [];
            ikAngles = new Array(ikChainIndices.length).fill(0);
            if (ikChainIndices.length > 0) {
              const firstBind = bindings[ikChainIndices[0]];
              const chainParent = firstBind.targetNode.parent || root;
              chainParent.updateMatrixWorld(true);
              const ikChainScale = Math.max(
                1e-6,
                chainParent.getWorldScale(new THREE.Vector3()).x
              );

              let prevWorldPos = new THREE.Vector3();
              let prevWorldQuat = new THREE.Quaternion();
              chainParent.getWorldPosition(prevWorldPos);
              chainParent.getWorldQuaternion(prevWorldQuat);

              for (let k = 0; k < ikChainIndices.length; k++) {
                const b = bindings[ikChainIndices[k]];
                const wPos = b.targetNode.getWorldPosition(new THREE.Vector3());
                const wQuat = b.targetNode.getWorldQuaternion(new THREE.Quaternion());
                const invPrevQ = prevWorldQuat.clone().invert();
                const locOff = wPos
                  .clone()
                  .sub(prevWorldPos)
                  .applyQuaternion(invPrevQ)
                  .divideScalar(ikChainScale);
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
              ikTipOffset = [0.16 / ikChainScale, 0.02 / ikChainScale, 0.0];
              stateRef.current.ikTargetWorld.set(
                prevWorldPos.x + 0.24,
                prevWorldPos.y + 0.14,
                prevWorldPos.z + 0.18
              );
            }
          }

          const targetsForSkel: THREE.Object3D[] =
            boundJointsRef.current.length > 0
              ? boundJointsRef.current.map((b) => b.targetNode)
              : loadedParts.slice(0, 32).map((p) => p.mesh);

          for (const tNode of targetsForSkel) {
            const localAxes = new THREE.AxesHelper(0.11);
            const jointRing = new THREE.LineLoop(ringGeo, ringMat);
            skelGroup.add(localAxes);
            skelGroup.add(jointRing);
            skelNodes.push({ target: tNode, axes: localAxes, ring: jointRing });
          }

          if (skelNodes.length >= 2) {
            const posBuf = new Float32Array(skelNodes.length * 6);
            skelTopoLinesGeo = new THREE.BufferGeometry();
            skelTopoLinesGeo.setAttribute('position', new THREE.BufferAttribute(posBuf, 3));
            const lineMat = new THREE.LineBasicMaterial({
              color: 0xf59e0b,
              transparent: true,
              opacity: 0.82
            });
            skelGroup.add(new THREE.LineSegments(skelTopoLinesGeo, lineMat));
          }
        };

        boundJointsRef.current = [];
        rebuildSkeletonRef.current = buildSkeletonAndBindJoints;
        buildSkeletonAndBindJoints();
      })
      .catch((err) => {
        if (disposed) return;
        console.warn('[Hangar] 参考 GLB 资产网络重试已耗尽:', err);
        setGlbLoadError(err instanceof Error ? err.message : '网络传输中断');
        setIsLoadingGlb(false);
      });

    // Software-WebGL guarded continuous live digital twin loop
    let frameId = 0;
    let lastTime = performance.now() / 1000;
    let simElapsed = 0;
    let lastUiSync = 0;

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

    function tick() {
      if (disposed) return;
      const now = performance.now() / 1000;
      const rawDt = Math.max(0.001, now - lastTime);
      const dt = Math.min(0.08, rawDt);
      const wallDt = Math.min(0.65, rawDt);
      lastTime = now;

      const s = stateRef.current;
      const simDt = dt * s.tactileConfig.bulletTimeScale;

      // Dimension 1: Studio Lighting Preset & Volumetric Atmosphere Rig
      studioRig.applyPreset(s.cinemaOptics.lightingPreset, {
        scene,
        hemiLight: hemi,
        keyLight,
        rimLight,
        bottomLight,
        setDeckStyle: saltlineDeck.setDeckStyle
      });

      // Pause continuous time advance during stationary Gear-2 DSLR Path-Tracing exposure so SPP converges to 256!
      if (s.liveSim && !s.pathTracingEnabled) {
        simElapsed += simDt;
      }

      if (s.shipbreakerEnabled || s.focusWeakpointEnabled || s.windTunnelConfig.schlierenMode) {
        s.slsState.active = false;
      }

      // Module 1B: Advance 1.8s Dual-Laser SLS Metal 3D Printing Materialization Sweep
      if (s.slsState.active && !s.pathTracingEnabled) {
        s.slsState = stepSlsMaterializationState(
          s.slsState,
          wallDt,
          bboxMinYRef.current,
          bboxMaxYRef.current
        );
      }

      // Dimension 3: Step Nanite Dissolve / 0.65s Spawn Materialization & Tactical Topographic Pulse Wave
      const naniteFrame = stepNaniteState(
        s.naniteState,
        s.pathTracingEnabled ? 0 : dt,
        bboxMinYRef.current,
        bboxMaxYRef.current,
        s.scifiConfig.naniteDissolveEnabled,
        s.scifiConfig.naniteProgress
      );
      s.naniteState = naniteFrame.nextState;
      if (s.tacticalPulse.active && !s.pathTracingEnabled) {
        s.tacticalPulse = stepTacticalPulseWave(s.tacticalPulse, dt, 14.0);
      }

      // System 1: Step 4-Stage Auto Disassembly Demo if active
      if (s.autoDisassemblyState.active && !s.pathTracingEnabled) {
        s.autoDisassemblyState = stepAutoDisassemblyDemo(s.autoDisassemblyState, simDt);
        s.targetExplosion = s.autoDisassemblyState.progress;
      }

      // Step 4-Phase Signature Ultimate Skill Visual Showcase [Key Q]
      if (s.ultimateSkill.active && !s.pathTracingEnabled) {
        s.ultimateSkill = stepUltimateSkill(s.ultimateSkill, wallDt * s.tactileConfig.bulletTimeScale, selectedPack.id);
        if (s.ultimateSkill.justFinished) {
          modelRoot.position.set(0, 0, 0);
          modelRoot.rotation.set(0, 0, 0);
          if (s.directorCamMode === 'off') {
            camera.fov = 42;
            camera.up.set(0, 1, 0);
            camera.updateProjectionMatrix();
          }
        }
      }

      // Step Module 3 Embodied Living Physics: Gaze Tracking, Push-Recovery Impulse, Snap-Back Shake & Floor-Click MPC Walk
      if (!s.pathTracingEnabled) {
        s.gazeState = stepHangarGazeTracking(s.gazeState, {
          dt: simDt,
          cursorValid: s.cursorValid,
          pointerNdcX: s.pointerNdcX,
          pointerNdcY: s.pointerNdcY,
          explosion: s.curExplosion,
          isolatedPart: s.isolatedPart,
          microFpvActive: s.microFpvActive,
          ultimateActive: s.ultimateSkill.active
        });
        s.pushState = stepPushRecoveryState(s.pushState, simDt);
        if (s.mpcEnabled && !s.isolatedPart && s.curExplosion < 0.05) {
          s.mpcWalkState = stepHangarMpcWalk(s.mpcWalkState, simDt);
        } else if (s.mpcWalkState.hasTarget || Math.hypot(s.mpcWalkState.x, s.mpcWalkState.z) > 1e-4) {
          s.mpcWalkState = createInitialHangarMpcWalkState();
        }
      }
      const snapVib = stepAssemblySnapShake(s.snapShake, dt);
      s.snapShake = snapVib.next;

      if (s.ultimateSkill.active) {
        modelRoot.position.set(
          s.mpcWalkState.x + s.pushState.rootShiftX,
          s.ultimateSkill.altitudeOffset * 0.42 + snapVib.offsetY,
          s.mpcWalkState.z + s.pushState.rootShiftZ
        );
        _ultEuler.set(
          s.ultimateSkill.rollOffset + snapVib.pitchRad,
          s.ultimateSkill.yawSpinOffset + s.mpcWalkState.yaw,
          s.ultimateSkill.pitchOffset + snapVib.rollRad,
          'YXZ'
        );
        modelRoot.quaternion.setFromEuler(_ultEuler);
      } else {
        const rx = s.mpcWalkState.x + s.pushState.rootShiftX;
        const ry = snapVib.offsetY;
        const rz = s.mpcWalkState.z + s.pushState.rootShiftZ;
        const pitch = s.pushState.tiltPitch * 0.28 + snapVib.pitchRad;
        const yaw = s.mpcWalkState.yaw;
        const roll = s.pushState.tiltRoll * 0.28 + snapVib.rollRad;
        modelRoot.position.set(rx, ry, rz);
        _ultEuler.set(pitch, yaw, roll, 'YXZ');
        modelRoot.quaternion.setFromEuler(_ultEuler);
      }

      // Update 3D Push-Recovery Impact Force Vector Arrow & MPC Floor Target Beacon
      if (s.pushState.arrowVisibleTimer > 0 && !s.isolatedPart) {
        pushArrowGroup.visible = true;
        const [cx, cy, cz] = s.pushState.contactWorld;
        const [dx, dy, dz] = s.pushState.pushDirWorld;
        pushArrowGroup.position.set(cx, cy, cz);
        _pushLookTarget.set(cx + dx, cy + dy, cz + dz);
        pushArrowGroup.lookAt(_pushLookTarget);
        const fade = Math.min(1, s.pushState.arrowVisibleTimer / 0.35);
        const pulse = 1.0 + 0.14 * Math.sin(now * 22.0);
        pushArrowGroup.scale.setScalar((0.85 + 0.35 * fade) * pulse);
        pushArrowMat.opacity = 0.94 * fade;
        pushRingMat.opacity = 0.85 * fade;
        pushContactRing.scale.setScalar(0.85 + (1 - fade) * 1.45);
      } else {
        pushArrowGroup.visible = false;
      }

      if (s.mpcEnabled && s.mpcWalkState.hasTarget && !s.isolatedPart) {
        mpcBeaconGroup.visible = true;
        mpcBeaconGroup.position.set(
          s.mpcWalkState.targetX,
          bboxMinYRef.current - 0.014,
          s.mpcWalkState.targetZ
        );
        const bp = 1.0 + 0.24 * Math.sin(now * 6.5);
        mpcOuterRing.scale.setScalar(bp);
        mpcBeaconMat.opacity = s.mpcWalkState.isWalking ? 0.88 : 0.42;
      } else {
        mpcBeaconGroup.visible = false;
      }

      // Dimension 4: Step 6.0s Automated Cinema Camera Macro if active
      let macroPoseActive = false;
      if (s.tactileConfig.activeMacro !== 'off' && !s.pathTracingEnabled) {
        s.macroElapsed += dt;
        const mPose = evaluateCinemaMacroPose(
          s.tactileConfig.activeMacro,
          s.macroElapsed,
          bboxMinVecRef.current,
          bboxMaxVecRef.current,
          Math.max(1.1, assemblyNormMaxDimRef.current * 0.58)
        );
        if (mPose.active) {
          macroPoseActive = true;
          if (mPose.suggestedExplosion !== undefined) {
            s.targetExplosion = mPose.suggestedExplosion;
          }
          const kMacro = 1 - Math.exp(-7.0 * dt);
          camera.position.x += (mPose.position[0] - camera.position.x) * kMacro;
          camera.position.y += (mPose.position[1] - camera.position.y) * kMacro;
          camera.position.z += (mPose.position[2] - camera.position.z) * kMacro;
          camera.up.set(0, 1, 0);
          controls.target.set(mPose.lookAt[0], mPose.lookAt[1], mPose.lookAt[2]);
          camera.lookAt(controls.target);
          camera.fov += (mPose.fovDeg - camera.fov) * kMacro;
          camera.updateProjectionMatrix();
        } else {
          s.macroElapsed = 0;
          s.tactileConfig = { ...s.tactileConfig, activeMacro: 'off' };
          setTactileConfig((prev) => ({ ...prev, activeMacro: 'off' }));
          camera.fov = 42;
          camera.up.set(0, 1, 0);
          camera.updateProjectionMatrix();
          controls.enabled = !s.activeCamPreset;
        }
      }

      // Smooth exponential damping for Explosion ([C] Micro-FPV clamped to safe 18% micro-gap!) & Optical Section Clipping
      const effectiveTargetExplosion = s.ultimateSkill.active
        ? Math.max(s.targetExplosion, s.ultimateSkill.armorExplosionRatio)
        : s.microFpvActive
          ? MICRO_FPV_SAFE_EXPLOSION_RATIO
          : s.targetExplosion;
      const uiStepDt = Math.min(0.28, rawDt);
      s.curExplosion = dampValue(s.curExplosion, effectiveTargetExplosion, 10.5, uiStepDt);
      saltlineDeck.setExplosionFade(s.curExplosion);
      studioRig.update(
        simElapsed,
        bboxMinYRef.current,
        Boolean(s.isolatedPart || s.windTunnelConfig.schlierenMode)
      );

      if (s.ultimateSkill.active && s.ultimateSkill.showcaseClipRatio < 0.995 && !s.pathTracingEnabled) {
        s.curClipRatio = dampValue(
          s.curClipRatio,
          Math.min(s.targetClipRatio, s.ultimateSkill.showcaseClipRatio),
          11.0,
          uiStepDt
        );
      } else if (s.autoSectionScan && !s.pathTracingEnabled) {
        const sweepTarget = 0.54 + 0.38 * Math.sin(now * 0.95);
        s.curClipRatio = dampValue(s.curClipRatio, sweepTarget, 6.0, simDt);
      } else {
        s.curClipRatio = dampValue(s.curClipRatio, s.targetClipRatio, 10.5, uiStepDt);
      }

      // Module 4: Millimeter-Scale Micro-FPV Cavity Fly-Through vs Signature Director Camera [K] vs OrbitControls
      let activeFpvSegLabel = '';
      if (macroPoseActive) {
        // Camera already driven by 6.0s Cinema Macro above
      } else if (s.microFpvActive && !s.pathTracingEnabled) {
        s.microFpvPhase = (s.microFpvPhase + simDt * 0.085) % 1.0;
        const fpvPose = evaluateMicroFpvSplinePose(fpvWaypoints, s.microFpvPhase, 0.72);
        activeFpvSegLabel = fpvPose.segmentLabel;
        if (camera.near !== 0.002) {
          camera.near = 0.002;
          camera.updateProjectionMatrix();
        }
        camera.position.set(fpvPose.position[0], fpvPose.position[1], fpvPose.position[2]);
        camera.up.set(fpvPose.up[0], fpvPose.up[1], fpvPose.up[2]);
        camera.lookAt(fpvPose.lookAt[0], fpvPose.lookAt[1], fpvPose.lookAt[2]);
      } else if ((s.directorCamMode !== 'off' || s.ultimateSkill.active) && !s.pathTracingEnabled) {
        if (camera.near !== 0.01) {
          camera.near = 0.01;
        }
        const dirPose = computeDirectorCameraPose({
          mode: s.directorCamMode,
          anchorX: 0,
          anchorY: (bboxMinYRef.current + bboxMaxYRef.current) * 0.45 + modelRoot.position.y * 0.5,
          anchorZ: 0,
          actorYaw: 0,
          modelRadius: Math.max(1.15, assemblyNormMaxDimRef.current * 0.62),
          elapsed: now,
          ultimateActive: s.ultimateSkill.active,
          ultimateProgress01: s.ultimateSkill.progress01
        });
        const kLerp = 1 - Math.exp(-6.5 * dt);
        camera.position.x += (dirPose.position[0] - camera.position.x) * kLerp;
        camera.position.y += (dirPose.position[1] - camera.position.y) * kLerp;
        camera.position.z += (dirPose.position[2] - camera.position.z) * kLerp;
        camera.up.set(dirPose.up[0], dirPose.up[1], dirPose.up[2]);
        controls.target.set(dirPose.lookAt[0], dirPose.lookAt[1], dirPose.lookAt[2]);
        camera.lookAt(controls.target);
        camera.fov += (dirPose.fovDeg - camera.fov) * kLerp;
        camera.updateProjectionMatrix();
      } else {
        // Smooth camera focus glide (when not locked to a fixed preset)
        if (s.camGlideActive && !s.activeCamPreset) {
          camera.position.x = dampValue(camera.position.x, s.camTargetPos.x, 5.5, dt);
          camera.position.y = dampValue(camera.position.y, s.camTargetPos.y, 5.5, dt);
          camera.position.z = dampValue(camera.position.z, s.camTargetPos.z, 5.5, dt);
          controls.target.x = dampValue(controls.target.x, s.camTargetLook.x, 6.5, dt);
          controls.target.y = dampValue(controls.target.y, s.camTargetLook.y, 6.5, dt);
          controls.target.z = dampValue(controls.target.z, s.camTargetLook.z, 6.5, dt);
          if (camera.position.distanceTo(s.camTargetPos) < 0.015) {
            s.camGlideActive = false;
          }
        }

        if (!s.activeCamPreset) {
          controls.autoRotate = !isSoftwareGl && s.autoRotate && !s.pathTracingEnabled;
          controls.autoRotateSpeed = 1.8;
          controls.update();
        }
      }

      const regimeSpec = HANGAR_REGIMES.find((r) => r.id === s.hangarRegime) || HANGAR_REGIMES[1];
      const loadFactor = s.liveSim ? regimeSpec.loadFactor : 0.35;

      // 1. Update Optical Laser Clipping Plane
      const clipY = computeClipPlaneConstant(bboxMinYRef.current, bboxMaxYRef.current, s.curClipRatio);
      clipPlaneRef.current.constant = clipY;
      const isSectionCutVisible = (s.curClipRatio < 0.985 || s.autoSectionScan) && !s.isolatedPart;
      opticalSection.updateSection(clipY, isSectionCutVisible, now);

      // 2. Update 3D Flow Streamlines & Sensor Cones (pause downward LiDAR cones during active CAD section cut & 4-shot showcase so sliced interior stays crystal clear!)
      if (flowController) {
        flowController.group.visible =
          s.flowSensorMode &&
          !isSectionCutVisible &&
          !s.ultimateSkill.active &&
          !s.isolatedPart &&
          !s.windTunnelConfig.schlierenMode;
        flowController.update(simElapsed, loadFactor);
      }

      // 3. Apply Real URDF Forward Kinematics + Fault-Tolerant Limp-Home + Real-Time 6-DOF CCD IK!
      const bindings = boundJointsRef.current;
      let poseChecksum = 0;

      // Solve 6-DOF CCD IK if active (zero per-frame GC allocations!)
      const endEffectorWorld = _endEffScratch.set(0.45, 0.2, 0.25);
      if (s.ikEnabled && ikChainSpecs.length > 0 && bindings.length > 0) {
        const firstBind = bindings[ikChainIndices[0]];
        const chainParent = firstBind.targetNode.parent || modelRoot;
        chainParent.updateMatrixWorld(true);
        _ikTgtLocalScratch.copy(s.ikTargetWorld);
        chainParent.worldToLocal(_ikTgtLocalScratch);
        const solved = solveCcdIkChain(
          ikChainSpecs,
          ikAngles,
          [_ikTgtLocalScratch.x, _ikTgtLocalScratch.y, _ikTgtLocalScratch.z],
          ikTipOffset,
          10,
          0.32
        );
        ikAngles = solved.angles;
        endEffectorWorld.set(
          solved.endEffectorPos[0],
          solved.endEffectorPos[1],
          solved.endEffectorPos[2]
        );
        chainParent.localToWorld(endEffectorWorld);
      }

      let sumJointSpeedRadS = 0;
      let peakTorqueRatio01 = 0;
      const jointLimitWarnings: JointLimitWarningSample[] = [];
      const torqueSamples: TorqueJointSample[] = [];

      for (let i = 0; i < bindings.length; i++) {
        const b = bindings[i];
        if (b.def.type === 'fixed') continue;
        const prevVal = b.currentVal;

        const ikSlot = s.ikEnabled ? ikChainIndices.indexOf(i) : -1;
        if (ikSlot >= 0) {
          b.currentVal = dampValue(b.currentVal, ikAngles[ikSlot], 16.0, dt);
        } else if (s.liveSim) {
          const effectiveRegime = s.mpcWalkState.isWalking ? 'patrol' : s.hangarRegime;
          const gaitPhaseTime = s.mpcWalkState.isWalking
            ? simElapsed + s.mpcWalkState.gaitDistance * 0.85
            : simElapsed;
          let targetVal = computeRobotLiveJointTarget(
            selectedPack.id,
            b.def,
            i,
            effectiveRegime,
            gaitPhaseTime
          );
          targetVal += computeHangarGazeUrdfDelta(selectedPack.id, b.def, s.gazeState);
          targetVal += computePushRecoveryUrdfDelta(selectedPack.id, b.def, s.pushState);
          if (s.ultimateSkill.active) {
            targetVal += computeUltimateUrdfJointDelta(selectedPack.id, b.def, s.ultimateSkill);
          }
          if (s.activeFaults.length > 0) {
            targetVal = applyFaultToUrdfJointAngle(
              targetVal,
              b.def.name,
              i,
              s.activeFaults,
              simElapsed,
              simElapsed * 2.4
            );
          }
          if (b.def.type === 'continuous') {
            b.currentVal = targetVal;
          } else {
            const respLambda = s.pushState.active
              ? 16.5
              : s.ultimateSkill.active
                ? 14.0
                : 8.5;
            b.currentVal = dampValue(b.currentVal, targetVal, respLambda, simDt);
          }
        } else {
          const manualTarget =
            (s.manualJointAngles[b.def.name] || 0) +
            computeHangarGazeUrdfDelta(selectedPack.id, b.def, s.gazeState) +
            computePushRecoveryUrdfDelta(selectedPack.id, b.def, s.pushState) +
            (s.ultimateSkill.active
              ? computeUltimateUrdfJointDelta(selectedPack.id, b.def, s.ultimateSkill)
              : 0);
          b.currentVal = dampValue(b.currentVal, manualTarget, 13.5, dt);
        }

        const limInfo = detectJointLimitProximity(
          b.currentVal,
          b.def.lower,
          b.def.upper,
          b.def.type
        );
        if (s.tactileConfig.jointLimitGuardEnabled && (!s.liveSim || ikSlot >= 0)) {
          b.currentVal = limInfo.clampedElasticValue;
        }

        b.omegaRadS = Math.min(25.0, Math.abs(b.currentVal - prevVal) / Math.max(0.004, dt));
        sumJointSpeedRadS += b.omegaRadS;
        poseChecksum += b.currentVal * (i + 1);

        const pushJointSurge =
          s.pushState.thermalSpike01 > 0.02 && isHighLoadPushJointPart(b.def.name)
            ? s.pushState.thermalSpike01 * 0.55
            : s.pushState.thermalSpike01 * 0.2;
        const jTorque01 = Math.min(
          1.0,
          0.18 + loadFactor * 0.34 + Math.min(0.38, b.omegaRadS * 0.08) + pushJointSurge
        );
        if (jTorque01 > peakTorqueRatio01) peakTorqueRatio01 = jTorque01;

        applyRobotJointPose(b.targetNode, b.def.type, b.axisVec, b.basePos, b.baseQuat, b.currentVal);

        if (
          s.tactileConfig.jointLimitGuardEnabled &&
          limInfo.nearLimit &&
          jointLimitWarnings.length < jointLimitPool.length
        ) {
          const slot = jointLimitPool[jointLimitWarnings.length];
          b.targetNode.getWorldPosition(slot.worldPos);
          slot.severity = limInfo.severity === 'critical' ? 'critical' : 'amber';
          jointLimitWarnings.push(slot);
        }

        if (s.scientificConfig.torqueVectorsEnabled && torqueSamples.length < torqueSamplePool.length) {
          const slot = torqueSamplePool[torqueSamples.length];
          b.targetNode.getWorldPosition(slot.worldPos);
          b.targetNode.getWorldQuaternion(_tmpQuat);
          slot.axisWorld.copy(b.axisVec).applyQuaternion(_tmpQuat).normalize();
          slot.torqueRatio01 = jTorque01;
          slot.omegaRadS = b.omegaRadS;
          torqueSamples.push(slot);
        }
      }

      // Sync articulated URDF matrices BEFORE transforming world-space explosion deltas into live parent-local coordinates!
      modelRoot.updateMatrixWorld(true);

      // Module 5: Procedural WebAudio FOC Brushless Servo & Subsea Ping360 Sonar Telemetry (modulated by torque!)
      if (s.audioSynthEnabled) {
        proceduralAudioSynth.updateFocServoTelemetry(
          sumJointSpeedRadS,
          selectedPack.id === 'bluerov2' || selectedPack.id === 'rexrov2',
          simElapsed,
          peakTorqueRatio01
        );
      }

      // 4. Apply 4-Stage Orthogonal CAD Explosion, Peel, Isolate Blueprint, Ghost Context, Thermal IR & Fresnel Pulse
      const activeSubObj = s.activeSubAssembly
        ? subAssembliesRef.current.find((sa) => sa.id === s.activeSubAssembly) || null
        : null;
      const activeFocusPart = s.hoveredPart || lastViewportHoverName || s.highlightedPart;
      const anyHighlighted = Boolean(activeFocusPart) && !s.isolatedPart;
      const pulseStrength = s.hoveredPart || lastViewportHoverName
        ? 0.92
        : s.highlightedPart
          ? computeFresnelPulseIntensity(now - s.highlightSelectTime)
          : 0.0;

      const parts = partsRef.current;
      let anyPartDisplaced = s.curExplosion > 0.012;
      let framePeakStressMpa = 0;
      const feaMapCode = feaColorMapToShaderCode(s.scientificConfig.feaColorMap);
      const avgJointOmega = bindings.length > 0 ? sumJointSpeedRadS / bindings.length : 0.4;
      const massSamples: PartMassSample[] = [];
      _tmpRobotBox.makeEmpty();

      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        const m = p.mesh;

        if (s.isolatedPart) {
          m.visible = p.partName === s.isolatedPart;
        } else {
          m.visible = !s.hiddenParts[p.partName];
        }
        if (!m.visible) continue;

        const targetPeel = s.peeledParts[p.partName] ? 1 : 0;
        p.peelAmount = dampValue(p.peelAmount, targetPeel, 9.0, dt);
        if (p.peelAmount > 0.012) anyPartDisplaced = true;

        if (!prismaticJointNodes.has(m)) {
          m.position.copy(p.basePos);
        }

        // Evaluate 4-stage smoothstep world-space explosion + peel offset and project dynamically into m.parent local space!
        const [exWx, exWy, exWz] = evaluateStagedExplosionOffset(
          p.orthoPlan,
          s.curExplosion,
          p.peelAmount
        );
        if (Math.abs(exWx) > 1e-5 || Math.abs(exWy) > 1e-5 || Math.abs(exWz) > 1e-5) {
          if (m.parent) {
            m.parent.matrixWorld.decompose(_decompPos, _parentQuat, _parentScale);
            _parentQuat.invert();
            _localDelta
              .set(exWx, exWy, exWz)
              .applyQuaternion(_parentQuat)
              .set(
                _localDelta.x / (Math.abs(_parentScale.x) > 1e-6 ? _parentScale.x : 1),
                _localDelta.y / (Math.abs(_parentScale.y) > 1e-6 ? _parentScale.y : 1),
                _localDelta.z / (Math.abs(_parentScale.z) > 1e-6 ? _parentScale.z : 1)
              );
            m.position.add(_localDelta);
          } else {
            m.position.x += exWx;
            m.position.y += exWy;
            m.position.z += exWz;
          }
        }

        // Hardspace: Shipbreaker 2nd-Order Spring-Damper 3D Floating Offset
        const grappleSp = grappleSprings.get(p.partName);
        if (grappleSp) {
          const stepped = stepSpringDamperVec3(grappleSp, dt, 95.0, 12.5);
          grappleSprings.set(p.partName, stepped);
          const dispMag = Math.hypot(stepped.pos[0], stepped.pos[1], stepped.pos[2]);
          if (dispMag > 0.002) {
            anyPartDisplaced = true;
            const hoverBob =
              draggingGrapplePart === p.partName
                ? 0
                : Math.sin(now * 2.8 + p.normAxialX * 3.1) * 0.014 * Math.min(1, dispMag * 4);
            const wx = stepped.pos[0];
            const wy = stepped.pos[1] + hoverBob;
            const wz = stepped.pos[2];
            if (m.parent) {
              m.parent.matrixWorld.decompose(_decompPos, _parentQuat, _parentScale);
              _parentQuat.invert();
              _localDelta
                .set(wx, wy, wz)
                .applyQuaternion(_parentQuat)
                .set(
                  _localDelta.x / (Math.abs(_parentScale.x) > 1e-6 ? _parentScale.x : 1),
                  _localDelta.y / (Math.abs(_parentScale.y) > 1e-6 ? _parentScale.y : 1),
                  _localDelta.z / (Math.abs(_parentScale.z) > 1e-6 ? _parentScale.z : 1)
                );
              m.position.add(_localDelta);
            } else {
              m.position.x += wx;
              m.position.y += wy;
              m.position.z += wz;
            }
          }
        }

        if (anyPartDisplaced && m.children.length > 0) {
          m.updateMatrixWorld();
        }

        const isHighlighted = Boolean(activeFocusPart && p.partName === activeFocusPart);
        let ghostState = computeGhostMaterialState(
          p.layer,
          s.isolatedPart ? 'L0' : s.activeDrillLevel,
          isHighlighted,
          anyHighlighted,
          s.xrayMode && !s.isolatedPart
        );

        if (!s.isolatedPart && activeSubObj && !isHighlighted && !s.hoveredPart && !lastViewportHoverName) {
          const inSub = activeSubObj.partNames.includes(p.partName);
          if (!inSub) {
            ghostState = {
              transparent: true,
              opacity: 0.11,
              depthWrite: false,
              wireframe: s.xrayMode,
              emissiveHex: 0x000000
            };
          } else {
            ghostState = {
              transparent: s.xrayMode,
              opacity: s.xrayMode ? 0.35 : 1.0,
              depthWrite: !s.xrayMode,
              wireframe: s.xrayMode,
              emissiveHex: 0x072840
            };
          }
        }

        const mat = p.origMat;
        const targetSide = isSectionCutVisible ? THREE.DoubleSide : p.origSide;
        if (mat.side !== targetSide) {
          mat.side = targetSide;
        }
        mat.wireframe = ghostState.wireframe;
        if (isSectionCutVisible && !s.xrayMode && !activeSubObj && !anyHighlighted) {
          // Keep sliced L1/L2/L3 metal solids crisp & opaque during section cuts so 45-deg CNC cross-hatched caps read cleanly!
          mat.transparent = false;
          mat.opacity = 1.0;
          mat.depthWrite = true;
        } else {
          mat.transparent = ghostState.transparent;
          mat.opacity = ghostState.opacity;
          mat.depthWrite = ghostState.depthWrite;
        }

        const isFaulted = s.activeFaults.some((f) => f.partName === p.partName);
        if (isFaulted) {
          const flash = 0.5 + 0.5 * Math.sin(now * 24.0);
          mat.color.setRGB(0.95, 0.14 + 0.15 * flash, 0.14);
          if (mat.emissive) {
            mat.emissive.setRGB(0.85 * flash, 0.06, 0.04);
          }
        } else if (s.thermalMode) {
          const flir = computeCalibratedFlirTemperatureC({
            contextId: selectedPack.id,
            partName: p.partName,
            layer: p.layer,
            loadFactor,
            pushSpike01: s.pushState.thermalSpike01
          });
          const [tr, tg, tb] = computeThermalIrColor(flir.normalized01);
          mat.color.setRGB(tr, tg, tb);
          if (mat.emissive) {
            mat.emissive.setRGB(
              tr * 0.42 * flir.normalized01,
              tg * 0.35 * flir.normalized01,
              tb * 0.25 * flir.normalized01
            );
          }
        } else if (s.pushState.thermalSpike01 > 0.04 && isHighLoadPushJointPart(p.partName)) {
          // Cross-module physical coupling: stressed hip/knee/waist joints flare orange-red thermal overload during push recovery!
          const spike = s.pushState.thermalSpike01;
          mat.color.copy(p.origColor).lerp(_tmpThermalSpikeColor, spike * 0.48);
          if (mat.emissive) {
            mat.emissive.setRGB(0.76 * spike, 0.24 * spike, 0.04 * spike);
          }
        } else {
          mat.color.copy(p.origColor);
          if (mat.emissive) {
            mat.emissive.setHex(ghostState.emissiveHex);
          }
        }

        // Dimension 2: Real-time Von Mises Structural FEA Stress Cloud
        const cantileverDist = Math.hypot(p.basePos.x, p.basePos.y, p.basePos.z);
        const feaRes = computeLinkVonMisesStress({
          partName: p.partName,
          layer: p.layer,
          cantileverDistMeters: cantileverDist,
          jointOmegaRadS: avgJointOmega,
          loadFactor,
          pushSpike01: s.pushState.thermalSpike01,
          isImpactTarget: s.pushState.active && s.pushState.impactPartName === p.partName
        });
        if (feaRes.stressMpa > framePeakStressMpa) {
          framePeakStressMpa = feaRes.stressMpa;
        }

        if (s.scientificConfig.comZmpEnabled || s.scifiConfig.hexShieldEnabled || s.scientificConfig.lidarPersistEnabled) {
          _tmpVec3B.copy(p.geomLocalCenter);
          m.localToWorld(_tmpVec3B);
          _tmpRobotBox.expandByPoint(_tmpVec3B);
          if (s.scientificConfig.comZmpEnabled) {
            const pLow = p.partName.toLowerCase();
            const isFootOrWheel =
              pLow.includes('foot') ||
              pLow.includes('ankle') ||
              pLow.includes('calf') ||
              pLow.includes('wheel') ||
              pLow.includes('track') ||
              pLow.includes('tire');
            massSamples.push({
              partName: p.partName,
              worldPos: [_tmpVec3B.x, _tmpVec3B.y, _tmpVec3B.z],
              volumeWeight: Math.max(0.02, p.normSize[0] * p.normSize[1] * p.normSize[2] * 12),
              isGroundContactCandidate: isFootOrWheel
            });
          }
        }

        const salvageCode =
          s.shipbreakerEnabled && !s.isolatedPart
            ? classifyShipbreakerPartRole(p.partName, p.layer).code
            : 0;
        const focusCode = computeHorizonFocusMode(
          s.focusWeakpointEnabled && !s.isolatedPart,
          p.partName,
          p.layer
        );

        p.twinUniforms.uFresnelPulse.value = isHighlighted ? pulseStrength : 0.0;
        p.twinUniforms.uLaserClipY.value = clipY;
        p.twinUniforms.uLaserActive.value = isSectionCutVisible ? 1.0 : 0.0;
        p.twinUniforms.uMagLensActive.value =
          s.magLensEnabled && s.magLensHoverValid && !s.isolatedPart ? 1.0 : 0.0;
        p.twinUniforms.uMagLensCenter.value.copy(s.magLensCenter);
        p.twinUniforms.uMagLensRadius.value = s.magLensRadius;
        p.twinUniforms.uSlsActive.value = s.slsState.active ? 1.0 : 0.0;
        p.twinUniforms.uSlsLaserY.value = s.slsState.laserY;
        p.twinUniforms.uSalvageRole.value = salvageCode;
        p.twinUniforms.uSalvagePulse.value = now;
        p.twinUniforms.uFocusMode.value = focusCode;
        p.twinUniforms.uDustAmount.value = s.weathering.marsDust;
        p.twinUniforms.uFrostAmount.value = s.weathering.intakeFrost;
        p.twinUniforms.uHeatBluing.value = s.weathering.titaniumHeatBluing;
        p.twinUniforms.uOverheatCoreGlow.value = s.ultimateSkill.coreGlowIntensity * 0.85;
        p.twinUniforms.uModelMinY.value = bboxMinYRef.current;
        p.twinUniforms.uModelSpanY.value = Math.max(0.4, bboxMaxYRef.current - bboxMinYRef.current);
        p.twinUniforms.uFeaActive.value =
          s.scientificConfig.feaEnabled && !s.isolatedPart ? 1.0 : 0.0;
        p.twinUniforms.uFeaSigma.value = feaRes.sigma01;
        p.twinUniforms.uFeaColorMap.value = feaMapCode;
        p.twinUniforms.uFeaContours.value = s.scientificConfig.feaContourLines ? 1.0 : 0.0;
        p.twinUniforms.uNaniteActive.value = naniteFrame.active ? 1.0 : 0.0;
        p.twinUniforms.uNaniteSweepY.value = naniteFrame.sweepWorldY;
        p.twinUniforms.uNaniteDissolve.value = naniteFrame.dissolveAmount01;
      }

      if (s.liveSim && !s.pathTracingEnabled) {
        const hangarDomain =
          selectedPack.id === 'bluerov2' || selectedPack.id === 'rexrov2' ? 'sea' : 'land';
        s.weathering = stepDynamicWeathering(s.weathering, {
          dt: dt * 0.25,
          domain: hangarDomain,
          speedMetersPerSec: 1.2 + loadFactor * 2.4,
          throttlePct: 45 + loadFactor * 45
        });
      }

      modelRoot.updateMatrixWorld(true);

      // Update Exploded Assembly Dashed Trace Lines (zero per-frame GC allocations!)
      if (anyPartDisplaced && !s.isolatedPart && parts.length > 0 && traceAnchorsBuf.length === parts.length) {
        for (let i = 0; i < parts.length; i++) {
          const p = parts[i];
          if (p.mesh.visible) {
            if (p.mesh.parent) {
              p.mountOriginWorld.copy(p.socketInParentLocal);
              p.mesh.parent.localToWorld(p.mountOriginWorld);
            }
            p.currentCenterWorld.copy(p.geomLocalCenter);
            p.mesh.localToWorld(p.currentCenterWorld);
          }
          traceAnchorsBuf[i].visible = p.mesh.visible;
        }
        traceController.updateTraces(traceAnchorsBuf, true);
      } else {
        traceController.updateTraces([], false);
      }

      // Update 3D CAD Engineering Dimension Wireframe Rig when Isolate Blueprint is active
      let isoLabelWorlds: { xLabelWorld: THREE.Vector3; yLabelWorld: THREE.Vector3; zLabelWorld: THREE.Vector3 } | null = null;
      if (s.isolatedPart) {
        const isoPart = parts.find((p) => p.partName === s.isolatedPart);
        if (isoPart && isoPart.mesh.visible) {
          _tmpBox3.setFromObject(isoPart.mesh);
          isoLabelWorlds = blueprintRig.updateForBox(_tmpBox3, true, now);
        } else {
          blueprintRig.updateForBox(_tmpBox3.makeEmpty(), false, now);
        }
      } else {
        blueprintRig.updateForBox(_tmpBox3.makeEmpty(), false, now);
      }

      // 5. Update L0 Engineering Coordinate Skeleton dynamically in place
      // Module 4 Fix: Optical Sectioning (`isSectionCutVisible`) automatically reveals the FULL internal URDF skeleton
      // across the entire robot (including above clipY!) so slicing never leaves empty air above two severed feet!
      if (skeletonGroupRef.current) {
        const showSkel = shouldAutoRevealInternalSkeleton(
          s.showSkeleton,
          s.curClipRatio,
          s.autoSectionScan,
          s.isolatedPart,
          s.windTunnelConfig.schlierenMode
        );
        skeletonGroupRef.current.visible = showSkel;
        if (skelRootAxes) {
          skelRootAxes.visible = !isSectionCutVisible;
        }
        if (showSkel && skelNodes.length > 0) {
          const posAttr = skelTopoLinesGeo?.getAttribute('position') as THREE.BufferAttribute | undefined;
          let lineIdx = 0;

          for (let i = 0; i < skelNodes.length; i++) {
            const sn = skelNodes[i];
            sn.target.getWorldPosition(_tmpVec3);
            sn.target.getWorldQuaternion(_tmpQuat);
            sn.axes.visible = true;
            sn.ring.visible = true;
            sn.axes.position.copy(_tmpVec3);
            sn.ring.position.copy(_tmpVec3);
            sn.ring.quaternion.copy(_tmpQuat);

            if (posAttr && sn.target.parent) {
              sn.target.parent.getWorldPosition(_tmpParentVec3);
              posAttr.array[lineIdx] = _tmpParentVec3.x;
              posAttr.array[lineIdx + 1] = _tmpParentVec3.y;
              posAttr.array[lineIdx + 2] = _tmpParentVec3.z;
              posAttr.array[lineIdx + 3] = _tmpVec3.x;
              posAttr.array[lineIdx + 4] = _tmpVec3.y;
              posAttr.array[lineIdx + 5] = _tmpVec3.z;
              lineIdx += 6;
            }
          }
          if (posAttr) {
            posAttr.needsUpdate = true;
          }
        }
      }

      // Update 6-DOF CCD IK & Plasma Torch + Molten Kerf Trail + Fault Sparks
      const dynamicEmissives: DynamicEmissivePoint[] = [];
      if (s.ikEnabled && s.plasmaCutting && !s.pathTracingEnabled) {
        const swingPt: [number, number, number] = [
          s.ikTargetWorld.x + Math.sin(now * 2.8) * 0.14,
          s.ikTargetWorld.y + Math.cos(now * 2.1) * 0.08,
          s.ikTargetWorld.z + Math.cos(now * 2.8) * 0.14
        ];
        s.kerfNodes = stepMoltenKerfTrail(s.kerfNodes, dt, swingPt, 84);
        for (let sp = 0; sp < 2; sp++) {
          spawnHangarSpark(
            swingPt[0],
            swingPt[1],
            swingPt[2],
            (Math.random() - 0.5) * 1.9,
            0.7 + Math.random() * 1.2,
            (Math.random() - 0.5) * 1.9,
            0.65,
            0.92,
            1.0,
            0.42
          );
        }
      } else if (!s.pathTracingEnabled && s.kerfNodes.length > 0) {
        s.kerfNodes = stepMoltenKerfTrail(s.kerfNodes, dt, null, 84);
      }

      if (s.ikEnabled && s.plasmaCutting) {
        dynamicEmissives.push({
          pos: s.ikTargetWorld,
          color: _plasmaEmissiveColor,
          radiance: 3.6
        });
      }

      if (s.activeFaults.length > 0 && !s.pathTracingEnabled) {
        const fp = parts.find((pt) => pt.partName === s.activeFaults[s.activeFaults.length - 1].partName);
        if (fp && fp.mesh.visible) {
          _tmpVec3B.copy(fp.geomLocalCenter);
          fp.mesh.localToWorld(_tmpVec3B);
          // Electric arc sparks + dark rising smoke
          spawnHangarSpark(
            _tmpVec3B.x,
            _tmpVec3B.y,
            _tmpVec3B.z,
            (Math.random() - 0.5) * 2.1,
            0.6 + Math.random() * 1.4,
            (Math.random() - 0.5) * 2.1,
            1.0,
            0.68,
            0.18,
            0.38
          );
          spawnHangarSpark(
            _tmpVec3B.x,
            _tmpVec3B.y + 0.06,
            _tmpVec3B.z,
            (Math.random() - 0.5) * 0.35,
            0.85,
            (Math.random() - 0.5) * 0.35,
            0.22,
            0.24,
            0.28,
            0.75
          );
          dynamicEmissives.push({
            pos: _faultEmissivePos.copy(_tmpVec3B),
            color: _faultEmissiveColor,
            radiance: 2.5
          });
        }
      }

      if (!s.pathTracingEnabled) {
        for (let i = 0; i < sparkPoolCount; i++) {
          if (sparkLife[i] > 0) {
            sparkLife[i] -= dt;
            if (sparkLife[i] <= 0) {
              sparkPos[i * 3 + 1] = -999;
            } else {
              sparkPos[i * 3] += sparkVel[i * 3] * dt;
              sparkPos[i * 3 + 1] += sparkVel[i * 3 + 1] * dt;
              sparkPos[i * 3 + 2] += sparkVel[i * 3 + 2] * dt;
              sparkVel[i * 3 + 1] -= 2.4 * dt;
            }
          }
        }
        sparkGeo.attributes.position.needsUpdate = true;
        sparkGeo.attributes.color.needsUpdate = true;
      }

      ikPlasmaFx.updateIkAndPlasma(
        s.ikEnabled,
        s.ikTargetWorld,
        endEffectorWorld,
        s.ikEnabled && s.plasmaCutting,
        s.kerfNodes,
        now
      );

      // Update Sci-Tech Modules 1, 2 & 3 Scene FX Controllers
      _tmpVec3.set(0, (bboxMinYRef.current + bboxMaxYRef.current) * 0.5, 0);
      magSlsRig.update({
        magLensEnabled: s.magLensEnabled && !s.isolatedPart,
        magLensHoverValid: s.magLensHoverValid,
        magLensCenter: s.magLensCenter,
        magLensRadius: s.magLensRadius,
        slsState: s.slsState,
        modelCenter: _tmpVec3,
        yMax: bboxMaxYRef.current,
        simTime: now
      });

      const ultMeta = getRobotUltimateMeta(selectedPack.id);
      signatureFx.updateHangarShowcase({
        skill: s.ultimateSkill,
        anchorWorld: _tmpVec3,
        floorY: -0.84,
        modelRadius: Math.max(0.9, assemblyNormMaxDimRef.current * 0.55),
        accentHex: ultMeta.accentHex,
        simTime: now
      });

      _tmpVec3.set(
        modelRoot.position.x,
        (bboxMinYRef.current + bboxMaxYRef.current) * 0.5 + modelRoot.position.y,
        modelRoot.position.z
      );

      let mpcPowerWatts = 0;
      const showInternalArteries =
        (s.mpcEnabled || s.ultimateSkill.active || isSectionCutVisible || s.pushState.active) &&
        !s.isolatedPart;
      if (showInternalArteries) {
        const floorY = bboxMinYRef.current;
        const mpcFan =
          s.mpcEnabled || s.ultimateSkill.active
            ? computeMpcRolloutFan(
                s.mpcWalkState.x,
                floorY,
                s.mpcWalkState.z,
                s.mpcWalkState.hasTarget
                  ? s.mpcWalkState.yaw
                  : Math.sin(simElapsed * 0.65) * 0.28,
                s.mpcWalkState.isWalking
                  ? Math.max(0.85, s.mpcWalkState.speed * 1.65)
                  : 1.75 + loadFactor * 1.45,
                s.mpcWalkState.isWalking
                  ? s.mpcWalkState.turnVel * 0.35
                  : Math.cos(simElapsed * 1.05) * 0.42,
                () => floorY,
                simElapsed,
                2.0,
                16
              )
            : null;
        const pushArteryExtraNm = s.pushState.powerArteryBoost * 58.0;
        const jointArteryInputs =
          bindings.length > 0
            ? bindings.map((b) => ({
                def: b.def,
                node: b.targetNode,
                omegaRadS: b.omegaRadS + s.pushState.powerArteryBoost * 2.4,
                torqueNm:
                  14.0 +
                  loadFactor * 22.0 +
                  (isHighLoadPushJointPart(b.def.name) ? pushArteryExtraNm : pushArteryExtraNm * 0.35)
              }))
            : parts.slice(0, 18).map((pt, idx) => ({
                def: { name: pt.partName, type: 'revolute' },
                node: pt.mesh,
                omegaRadS:
                  (s.liveSim ? 0.8 + loadFactor * (1.2 + (idx % 3) * 0.6) : 0.1) +
                  s.pushState.powerArteryBoost * 2.2,
                torqueNm: 15.0 + pushArteryExtraNm * 0.6
              }));
        const resMpc = mpcPowerCtrl.updateMpcAndPower({
          enabled: true,
          mpcResult: mpcFan,
          powerCoreWorld: _tmpVec3,
          jointNodes: jointArteryInputs,
          simTime: now
        });
        mpcPowerWatts = resMpc.totalPowerWatts;
      } else {
        mpcPowerCtrl.updateMpcAndPower({
          enabled: false,
          mpcResult: null,
          powerCoreWorld: _tmpVec3,
          jointNodes: [],
          simTime: now
        });
      }

      disasterFx.updateDisasterFX({
        config: s.windTunnelConfig,
        anchorWorld: _tmpVec3,
        headingYaw: 0,
        modelScaleRadius: assemblyNormMaxDimRef.current * 0.52,
        simTime: now
      });

      // Update Hardspace: Shipbreaker URDF Joint Assembly Lock-Rings & Curved Bézier Magnetic Grapple Tether
      if (s.shipbreakerEnabled && !s.isolatedPart) {
        const jointWorldAnchors: { pos: THREE.Vector3; axisWorld: THREE.Vector3 }[] = [];
        if (bindings.length > 0) {
          const lim = Math.min(salvageAnchorPool.length, bindings.length);
          for (let i = 0; i < lim; i++) {
            const b = bindings[i];
            const slot = salvageAnchorPool[i];
            b.targetNode.getWorldPosition(slot.pos);
            b.targetNode.getWorldQuaternion(_tmpQuat);
            slot.axisWorld.copy(b.axisVec).applyQuaternion(_tmpQuat).normalize();
            jointWorldAnchors.push(slot);
          }
        } else {
          const lim = Math.min(16, parts.length);
          for (let i = 0; i < lim; i++) {
            const pt = parts[i];
            const slot = salvageAnchorPool[i];
            slot.pos.copy(pt.geomLocalCenter);
            pt.mesh.localToWorld(slot.pos);
            slot.axisWorld.copy(_salvageFallbackAxis);
            jointWorldAnchors.push(slot);
          }
        }

        camera.matrixWorld.extractBasis(_tmpCamRight, _tmpCamUp, _tmpCamFwd);
        _tmpEmitterW
          .copy(camera.position)
          .addScaledVector(_tmpCamRight, 0.52)
          .addScaledVector(_tmpCamUp, -0.38)
          .addScaledVector(_tmpCamFwd, -0.62);

        const activeBeamPartName = draggingGrapplePart || lastGrappledPart;
        let grappledCenter: THREE.Vector3 | null = null;
        let grappledRadius = 0.22;
        if (activeBeamPartName) {
          const gp = parts.find((pt) => pt.partName === activeBeamPartName);
          if (gp && gp.mesh.visible) {
            _grappleCenterScratch.copy(gp.geomLocalCenter);
            gp.mesh.localToWorld(_grappleCenterScratch);
            grappledCenter = _grappleCenterScratch;
            grappledRadius = Math.max(gp.normSize[0], gp.normSize[1], gp.normSize[2]) * 0.58;
          }
        }

        salvageFx.updateSalvageFX({
          enabled: true,
          simTime: now,
          jointWorldAnchors,
          grappleActive: Boolean(grappledCenter),
          emitterWorld: _tmpEmitterW,
          grappledPartCenterWorld: grappledCenter,
          grappledPartRadius: grappledRadius
        });
      } else {
        salvageFx.updateSalvageFX({
          enabled: false,
          simTime: now,
          jointWorldAnchors: [],
          grappleActive: false,
          emitterWorld: _tmpEmitterW,
          grappledPartCenterWorld: null,
          grappledPartRadius: 0.2
        });
      }

      // Update Master Dimensions 2, 3 & 4 Scene Controllers
      const comResult =
        s.scientificConfig.comZmpEnabled && !s.isolatedPart && massSamples.length > 0
          ? computeRobotComAndSupportPolygon({
              samples: massSamples,
              floorY: -0.84,
              comAccelXZ: [
                s.pushState.pushDirWorld[0] * s.pushState.thermalSpike01 * 5.2,
                s.pushState.pushDirWorld[2] * s.pushState.thermalSpike01 * 5.2
              ]
            })
          : null;

      if (ikChainIndices.length > 0 && bindings[ikChainIndices[0]]) {
        bindings[ikChainIndices[0]].targetNode.getWorldPosition(_tmpWorkspaceOrigin);
      } else {
        _tmpWorkspaceOrigin.set(
          modelRoot.position.x,
          (bboxMinYRef.current + bboxMaxYRef.current) * 0.55,
          modelRoot.position.z
        );
      }
      _tmpLidarOrigin.set(
        modelRoot.position.x,
        bboxMaxYRef.current - 0.16 + modelRoot.position.y,
        modelRoot.position.z
      );
      if (_tmpRobotBox.isEmpty()) {
        _tmpRobotBox.min.set(
          bboxMinVecRef.current[0] + modelRoot.position.x,
          bboxMinVecRef.current[1] + modelRoot.position.y,
          bboxMinVecRef.current[2] + modelRoot.position.z
        );
        _tmpRobotBox.max.set(
          bboxMaxVecRef.current[0] + modelRoot.position.x,
          bboxMaxVecRef.current[1] + modelRoot.position.y,
          bboxMaxVecRef.current[2] + modelRoot.position.z
        );
      } else {
        _tmpRobotBox.expandByScalar(0.14);
      }

      sciVizCtrl.update({
        config: s.scientificConfig,
        contextId: selectedPack.id,
        floorY: -0.84,
        simTime: simElapsed,
        dt: simDt,
        comZmp: comResult,
        torqueSamples,
        workspaceOriginWorld: _tmpWorkspaceOrigin,
        workspaceMaxRadius: Math.max(0.68, assemblyNormMaxDimRef.current * 0.48),
        lidarOriginWorld: _tmpLidarOrigin,
        robotBoundsBox: _tmpRobotBox,
        hidden: Boolean(s.isolatedPart || s.windTunnelConfig.schlierenMode)
      });

      scifiVfxCtrl.update({
        config: s.scifiConfig,
        naniteFrame,
        pulseState: s.tacticalPulse,
        robotBounds: _tmpRobotBox,
        floorY: -0.84,
        simTime: simElapsed,
        dt: simDt,
        loadFactor: loadFactor + s.pushState.thermalSpike01 * 0.6,
        hidden: Boolean(s.isolatedPart || s.windTunnelConfig.schlierenMode)
      });

      const tactileRes = tactileCtrl.update({
        dt,
        simTime: now,
        ikSpringActive: Boolean(s.ikEnabled && s.tactileConfig.jointLimitGuardEnabled),
        ikTargetWorld: s.ikTargetWorld,
        ikEndEffectorWorld: endEffectorWorld,
        jointLimitWarnings,
        hidden: Boolean(s.isolatedPart || s.windTunnelConfig.schlierenMode)
      });

      // Transient Handheld Micro-Sway + Micro Camera Impulse (non-accumulating so OrbitControls never drifts!)
      const impStep = stepCameraMicroImpulse(s.camImpulse, rawDt);
      s.camImpulse = impStep.next;
      const swayOff = computeHandheldCameraMicroSway(
        now,
        s.tactileConfig.handheldMicroSway && !s.pathTracingEnabled
      );
      _tmpTransientCamOffset.set(
        swayOff[0] + impStep.offsetMeters[0],
        swayOff[1] + impStep.offsetMeters[1],
        swayOff[2] + impStep.offsetMeters[2]
      );
      const hasCamTransient = !s.pathTracingEnabled && _tmpTransientCamOffset.lengthSq() > 1e-8;
      if (hasCamTransient) {
        camera.position.add(_tmpTransientCamOffset);
        camera.updateMatrixWorld();
      }

      // Compute Smart Focus Distance for shallow Bokeh DOF (locks to isolated/hovered/highlighted part or OrbitControls target)
      let focusTargetX = controls.target.x;
      let focusTargetY = controls.target.y;
      let focusTargetZ = controls.target.z;
      const dofFocusPartName = s.isolatedPart || s.hoveredPart || lastViewportHoverName || s.highlightedPart;
      if (dofFocusPartName) {
        const fp = parts.find((pt) => pt.partName === dofFocusPartName);
        if (fp && fp.mesh.visible) {
          _tmpVec3B.copy(fp.geomLocalCenter);
          fp.mesh.localToWorld(_tmpVec3B);
          focusTargetX = _tmpVec3B.x;
          focusTargetY = _tmpVec3B.y;
          focusTargetZ = _tmpVec3B.z;
        }
      }
      const smartFocusDist = computeSmartFocusDistanceMeters(
        [camera.position.x, camera.position.y, camera.position.z],
        [focusTargetX, focusTargetY, focusTargetZ]
      );

      const showDeck = !s.isolatedPart && !s.windTunnelConfig.schlierenMode;
      saltlineDeck.mesh.visible = showDeck;
      bayRing.visible = showDeck;
      // Skip 630k-triangle floor reflection pass immediately when Path-Tracing [R] is active for 0ms instant response!
      if (showDeck && !s.pathTracingEnabled) {
        saltlineDeck.updateReflection(renderer, scene, camera);
      }

      const executePipelineRender = () =>
        rayTracer.renderFrame({
          scene,
          camera,
          keyLight,
          rimLight,
          pathTracingEnabled: s.pathTracingEnabled,
          explosionProgress: s.curExplosion,
          clipRatio: s.curClipRatio,
          poseChecksum:
            poseChecksum +
            (s.hoveredPart ? 41 : 0) +
            (s.thermalMode ? 7 : 0) +
            (s.scientificConfig.feaEnabled ? 17 : 0) +
            (s.xrayMode ? 13 : 0) +
            (s.slsState.active ? s.slsState.laserY * 31 : 0) +
            (naniteFrame.active ? naniteFrame.sweepWorldY * 29 : 0) +
            (s.ikEnabled ? s.ikTargetWorld.x * 19 + s.ikTargetWorld.y * 23 : 0),
          emissiveSources,
          dynamicEmissives,
          schlierenMode: s.windTunnelConfig.schlierenMode,
          simTime: now,
          cinemaOptics: s.cinemaOptics,
          focusDistanceMeters: smartFocusDist,
          bulletTimeScale: s.tactileConfig.bulletTimeScale,
          impulseVignette01: impStep.vignette01,
          rawDt
        });

      renderOnceRef.current = () => {
        executePipelineRender();
      };
      const ptRes = executePipelineRender();

      if (hasCamTransient) {
        camera.position.sub(_tmpTransientCamOffset);
        camera.updateMatrixWorld();
      }

      // 6. Throttled ~10Hz HUD Sync for FK Sliders, SPP Counter, SLS, MPC Power, Micro-FPV, Auto-Disassembly, Blueprint Capsule & 3D Telemetry Callouts
      if (now - lastUiSync > 0.1) {
        lastUiSync = now;
        const w = container.clientWidth || 960;
        const h = container.clientHeight || 640;
        setPtSpp(ptRes.spp);
        setSlsActive(s.slsState.active);
        if (s.scientificConfig.feaEnabled || s.visualPopoverOpen) {
          setPeakStressMpa(framePeakStressMpa);
        }
        if (comResult) {
          setComStabilityStatus(comResult.statusLevel);
        }
        setIkTensionNewtons(tactileRes.ikTensionNewtons);
        setUltimateActiveUI(s.ultimateSkill.active);
        if (s.ultimateSkill.active) {
          setUltimatePhaseLabelUI(s.ultimateSkill.phaseLabel);
        }
        setWeatheringActive(
          s.weathering.marsDust > 0.05 ||
            s.weathering.intakeFrost > 0.05 ||
            s.weathering.titaniumHeatBluing > 0.05
        );
        if (s.mpcEnabled || s.pushState.active) {
          setTotalPowerWatts(mpcPowerWatts);
        }
        setPushTorqueSpikeNm(s.pushState.telemetryTorqueSpikeNm);
        if (s.pushState.arrowVisibleTimer > 0 && !s.isolatedPart) {
          _tmpVec3B.set(
            s.pushState.contactWorld[0],
            s.pushState.contactWorld[1] + 0.14,
            s.pushState.contactWorld[2]
          );
          _tmpVec3B.project(camera);
          if (_tmpVec3B.z >= -1 && _tmpVec3B.z <= 1) {
            setPushCalloutHud({
              screenX: (_tmpVec3B.x * 0.5 + 0.5) * w,
              screenY: (-_tmpVec3B.y * 0.5 + 0.5) * h,
              forceN: s.pushState.forceNewtons,
              partName: s.pushState.impactPartName
            });
          } else {
            setPushCalloutHud(null);
          }
        } else {
          setPushCalloutHud(null);
        }
        if (s.microFpvActive) {
          setMicroFpvSegmentLabel(activeFpvSegLabel);
        }

        if (s.liveSim && s.activeDrawer === 'kinematics' && bindings.length > 0) {
          const synced: Record<string, number> = {};
          for (let i = 0; i < Math.min(20, bindings.length); i++) {
            const b = bindings[i];
            if (b.def.type !== 'fixed') {
              synced[b.def.name] = Number(b.currentVal.toFixed(2));
            }
          }
          setJointAngles(synced);
        }
        if (s.autoSectionScan) {
          setClipRatio(Number(s.curClipRatio.toFixed(2)));
        }
        if (s.autoDisassemblyState.active) {
          setExplosion(Number(s.autoDisassemblyState.progress.toFixed(2)));
          setAutoStageLabel(s.autoDisassemblyState.stageLabel);
        }

        if (s.highlightedPart) {
          const selP = parts.find((pt) => pt.partName === s.highlightedPart);
          if (selP && selP.mesh.visible) {
            _tmpVec3B.copy(selP.geomLocalCenter);
            selP.mesh.localToWorld(_tmpVec3B);
            _tmpVec3B.project(camera);
            if (_tmpVec3B.z >= -1 && _tmpVec3B.z <= 1) {
              setSelectedAnchorScreen([
                (_tmpVec3B.x * 0.5 + 0.5) * w,
                (-_tmpVec3B.y * 0.5 + 0.5) * h
              ]);
            }
          }
        }

        const activeHoverTarget = s.hoveredPart || lastViewportHoverName;
        if (activeHoverTarget && !s.isolatedPart) {
          const hovIdx = parts.findIndex((pt) => pt.partName === activeHoverTarget);
          if (hovIdx >= 0 && parts[hovIdx].mesh.visible) {
            const hovP = parts[hovIdx];
            const graphIdx = meshNodesRef.current.findIndex((n) => n.name === hovP.partName);
            _tmpVec3.copy(hovP.geomLocalCenter);
            hovP.mesh.localToWorld(_tmpVec3);
            const wxMm = _tmpVec3.x * 1000;
            const wyMm = _tmpVec3.y * 1000;
            const wzMm = _tmpVec3.z * 1000;
            const hovFlir = computeCalibratedFlirTemperatureC({
              contextId: selectedPack.id,
              partName: hovP.partName,
              layer: hovP.layer,
              loadFactor,
              pushSpike01: s.pushState.thermalSpike01
            });
            setHoverThermalReadout({
              tempC: hovFlir.tempC,
              zoneLabel: hovFlir.zoneLabel,
              partName: hovP.partName
            });
            const badgeParts: string[] = [];
            if (s.thermalMode) {
              badgeParts.push(`温度示例 ${hovFlir.tempC.toFixed(1)} °C · ${hovFlir.zoneLabel}`);
            }
            if (s.scientificConfig.feaEnabled) {
              const hovFea = computeLinkVonMisesStress({
                partName: hovP.partName,
                layer: hovP.layer,
                cantileverDistMeters: Math.hypot(hovP.basePos.x, hovP.basePos.y, hovP.basePos.z),
                jointOmegaRadS: avgJointOmega,
                loadFactor,
                pushSpike01: s.pushState.thermalSpike01,
                isImpactTarget: s.pushState.active && s.pushState.impactPartName === hovP.partName
              });
              badgeParts.push(`受力示意 ${Math.round(hovFea.sigma01 * 100)}%`);
            }
            _tmpVec3B.copy(_tmpVec3).project(camera);
            if (_tmpVec3B.z >= -1 && _tmpVec3B.z <= 1) {
              setHoveredCallout({
                partName: hovP.partName,
                index: graphIdx >= 0 ? graphIdx : hovIdx,
                layer: hovP.layer,
                tris: hovP.tris,
                screenX: (_tmpVec3B.x * 0.5 + 0.5) * w,
                screenY: (-_tmpVec3B.y * 0.5 + 0.5) * h,
                worldMm: [wxMm, wyMm, wzMm],
                telemetryBadge: badgeParts.length > 0 ? badgeParts.join(' · ') : undefined
              });
            } else {
              setHoveredCallout(null);
            }
          } else {
            setHoveredCallout(null);
            setHoverThermalReadout(null);
          }
        } else {
          setHoveredCallout(null);
          setHoverThermalReadout(null);
        }

        if (s.isolatedPart && isoLabelWorlds) {
          const projPt = (v: THREE.Vector3): [number, number] | null => {
            _tmpVec3B.copy(v).project(camera);
            if (_tmpVec3B.z < -1 || _tmpVec3B.z > 1) return null;
            return [(_tmpVec3B.x * 0.5 + 0.5) * w, (-_tmpVec3B.y * 0.5 + 0.5) * h];
          };
          setBlueprintAxisScreens({
            xScreen: projPt(isoLabelWorlds.xLabelWorld),
            yScreen: projPt(isoLabelWorlds.yLabelWorld),
            zScreen: projPt(isoLabelWorlds.zLabelWorld)
          });
        }

        if (s.showProbes && !s.isolatedPart && partsRef.current.length > 0) {
          const rawProbes = buildSpatialTelemetryProbes(selectedPack.id, now, loadFactor);
          const nextProjected: ProjectedTelemetryItem[] = rawProbes.map((pr) => {
            const matched = partsRef.current.find((pt) =>
              pr.partKeywords.some((kw) => pt.partName.toLowerCase().includes(kw))
            );
            let anchorName = pr.partKeywords[0];
            if (matched) {
              anchorName = matched.partName;
              _tmpVec3.copy(matched.geomLocalCenter);
              matched.mesh.localToWorld(_tmpVec3);
            } else {
              _tmpVec3.set(pr.fallbackLocalPos[0], pr.fallbackLocalPos[1], pr.fallbackLocalPos[2]);
            }
            const probeWorldY = _tmpVec3.y;
            _tmpVec3.project(camera);
            const sx = (_tmpVec3.x * 0.5 + 0.5) * w;
            const sy = (-_tmpVec3.y * 0.5 + 0.5) * h;
            const inFront =
              _tmpVec3.z >= -1 &&
              _tmpVec3.z <= 1 &&
              (!isSectionCutVisible || probeWorldY <= clipY + 0.025);
            return {
              probe: pr,
              partName: anchorName,
              screenX: sx,
              screenY: sy,
              visible: inFront
            };
          });

          // Prepend Crimson CRITICAL FAULT 3D Probe if any part has active battle damage / actuator fault!
          if (s.activeFaults.length > 0) {
            const latestFault = s.activeFaults[s.activeFaults.length - 1];
            const fPart = partsRef.current.find((pt) => pt.partName === latestFault.partName);
            if (fPart) {
              _tmpVec3.copy(fPart.geomLocalCenter);
              fPart.mesh.localToWorld(_tmpVec3);
              _tmpVec3.project(camera);
              if (_tmpVec3.z >= -1 && _tmpVec3.z <= 1) {
                nextProjected.unshift({
                  probe: {
                    source: 'demo',
                    connected: false,
                    id: 'hangar_critical_fault',
                    label: latestFault.alertTitle,
                    partKeywords: [latestFault.partName],
                    fallbackLocalPos: [0, 0.4, 0],
                    primaryValue: `LOCKED · ${latestFault.partName}`,
                    secondaryValue: latestFault.compensationLaw,
                    status: 'ELEVATED'
                  },
                  partName: latestFault.partName,
                  screenX: (_tmpVec3.x * 0.5 + 0.5) * w,
                  screenY: (-_tmpVec3.y * 0.5 + 0.5) * h,
                  visible: true
                });
              }
            }
          }

          setProjectedProbes(nextProjected);
        }
      }

      if (isSoftwareGl) afterDraw(tick);
      else frameId = requestAnimationFrame(tick);
    }

    frameId = requestAnimationFrame(tick);

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || 960;
      const h = container.clientHeight || 640;
      setViewportSize({ w, h });
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
      renderer.setSize(w, h);
      rayTracer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);
    const resizeObs =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(handleResize) : null;
    resizeObs?.observe(container);

    return () => {
      disposed = true;
      // Late URDF fetches and persistent HTML controls must not rebuild or
      // address objects belonging to a viewport that has already been left.
      renderOnceRef.current = null;
      rebuildSkeletonRef.current = null;
      skeletonGroupRef.current = null;
      boundJointsRef.current = [];
      partsRef.current = [];
      subAssembliesRef.current = [];
      cameraRef.current = null;
      cancelAnimationFrame(frameId);
      cancelAnimationFrame(magWheelRaf);
      clearTimeout(frameId);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      controls.removeEventListener('start', onControlStart);
      controls.dispose();
      controlsRef.current = null;
      window.removeEventListener('resize', handleResize);
      resizeObs?.disconnect();
      if (webmRecorder.isRecording()) {
        webmRecorder.stopRecording();
      }
      webmRecorderRef.current = null;
      studioRig.dispose();
      sciVizCtrl.dispose();
      scifiVfxCtrl.dispose();
      tactileCtrl.dispose();
      magSlsRig.dispose();
      mpcPowerCtrl.dispose();
      disasterFx.dispose();
      salvageFx.dispose();
      signatureFx.dispose();
      ikPlasmaFx.dispose();
      traceController.dispose?.();
      (opticalSection as { dispose?: () => void }).dispose?.();
      disposeSceneHierarchy(opticalSection.group);
      (flowController as { dispose?: () => void } | null)?.dispose?.();
      if (flowController) {
        disposeSceneHierarchy(flowController.group);
      }
      (blueprintRig as { dispose?: () => void }).dispose?.();
      disposeSceneHierarchy(blueprintRig.group);
      disposeSceneHierarchy(skelGroup);
      bayRing.geometry.dispose();
      (bayRing.material as THREE.Material).dispose();
      disposeSceneHierarchy(modelRoot, { disposeTextures: true });
      sparkGeo.dispose();
      (sparkPoints.material as THREE.Material).dispose();
      pushShaftGeo.dispose();
      pushHeadGeo.dispose();
      pushRingGeo.dispose();
      pushArrowMat.dispose();
      pushRingMat.dispose();
      mpcOuterRingGeo.dispose();
      mpcInnerDiscGeo.dispose();
      mpcBeaconMat.dispose();
      softSpriteTex.dispose();
      saltlineDeck.dispose();
      rayTracer.dispose();
      rayTracerRef.current = null;
      envTex.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement.parentElement === container) container.removeChild(renderer.domElement);
    };
  }, [appMode, activeTab, selectedPack, glbReloadNonce]);

  // Re-bind URDF joints whenever urdfJoints finishes loading
  useEffect(() => {
    boundJointsRef.current = [];
    if (rebuildSkeletonRef.current) {
      rebuildSkeletonRef.current();
    }
  }, [urdfJoints]);

  const movableJoints = useMemo(() => filterMovableJoints(urdfJoints), [urdfJoints]);
  const visibleMovableJoints = useMemo(() => filterMovableJoints(urdfJoints, jointSearch), [urdfJoints, jointSearch]);

  const filteredRepos = useMemo(
    () => filterRepositories(manifestData, searchQuery),
    [searchQuery]
  );

  const fileKinematicStats = useMemo(
    () => parseKinematicStats(fileContent, selectedFileRel),
    [fileContent, selectedFileRel]
  );

  const activeRegimeLoad =
    HANGAR_REGIMES.find((r) => r.id === hangarRegime)?.loadFactor ?? 0.68;

  const hangarSparklineLabels: [string, string, string] =
    selectedPack.id === 'bluerov2' || selectedPack.id === 'rexrov2'
      ? ['母线总功率', 'IMU 姿态振动', '矢量推进合力']
      : ['母线总功率', '关节角速度包络', '伺服峰值力矩'];

  if (appMode === 'mars_combat') {
    return (
      <div className="h-full w-full bg-[#0c0807] text-slate-100 overflow-hidden">
        <MarsSciFiCombatGame
          initialAutostart={combatAutostart}
          initialMechId={resolvePlayableCombatMechId(sandboxActorId)}
          audioEnabled={audioSynthEnabled}
          onToggleAudio={handleToggleAudioSynth}
          onOpenFreeSandbox={(mechId) => {
            setSandboxActorId(mechId);
            setAppMode('sandbox');
          }}
          onOpenCadHangar={(mechId) => {
            handleExitSandbox(mechId);
          }}
        />
      </div>
    );
  }

  if (sandboxMode) {
    return (
      <div className="h-full w-full bg-[#050912] text-slate-100 overflow-hidden">
        <ActionSandboxView
          initialActorId={sandboxActorId}
          onExitSandbox={handleExitSandbox}
          onEnterMarsCombat={(lastId) => handleEnterMarsCombat(lastId)}
          audioSynthEnabled={audioSynthEnabled}
          onChangeAudioSynth={(next) => {
            setAudioSynthEnabled(next);
            proceduralAudioSynth.setEnabled(next);
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-[#0d1017] text-slate-100 select-none overflow-hidden">
      {/* Clean 3-Zone Top Navigation Bar */}
      <header className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-[#12141a]/[0.96] border-b border-white/[0.08] z-30">
        <span className="font-semibold tracking-tight text-sm text-slate-100 whitespace-nowrap shrink-0">
          工程模型与机构
        </span>

        {/* 5 Concise Single-Line Workstation Navigation Links */}
        <nav
          aria-label="主工作站切换"
          className="flex items-center gap-1 bg-[#161922] p-1 rounded-xl border border-white/[0.08] max-w-full overflow-x-auto"
        >
          <button
            type="button"
            onClick={() => {
              setActiveDrawer(null);
              setActiveTab('hangar_3d');
            }}
            className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 border transition cursor-pointer ${
              activeTab === 'hangar_3d'
                ? 'bg-cyan-500/[0.14] border-[#00e5ff]/70 text-cyan-100 font-semibold'
                : 'border-transparent text-slate-300 hover:text-white hover:bg-white/[0.05]'
            }`}
          >
            具身机库
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveDrawer(null);
              setActiveTab('mars2020');
            }}
            className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 border transition cursor-pointer ${
              activeTab === 'mars2020'
                ? 'bg-cyan-500/[0.14] border-[#00e5ff]/70 text-cyan-100 font-semibold'
                : 'border-transparent text-slate-300 hover:text-white hover:bg-white/[0.05]'
            }`}
          >
            毅力号火星车
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveDrawer(null);
              setActiveTab('b737_cfm56');
            }}
            className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 border transition cursor-pointer ${
              activeTab === 'b737_cfm56'
                ? 'bg-cyan-500/[0.14] border-[#00e5ff]/70 text-cyan-100 font-semibold'
                : 'border-transparent text-slate-300 hover:text-white hover:bg-white/[0.05]'
            }`}
          >
            CFM56 涡扇
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveDrawer(null);
              setActiveTab('b737_bridge');
            }}
            className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 border transition cursor-pointer ${
              activeTab === 'b737_bridge'
                ? 'bg-cyan-500/[0.14] border-[#00e5ff]/70 text-cyan-100 font-semibold'
                : 'border-transparent text-slate-300 hover:text-white hover:bg-white/[0.05]'
            }`}
          >
            传力拓扑
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveDrawer(null);
              setActiveTab('urdf_explorer');
            }}
            className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 border transition cursor-pointer ${
              activeTab === 'urdf_explorer'
                ? 'bg-cyan-500/[0.14] border-[#00e5ff]/70 text-cyan-100 font-semibold'
                : 'border-transparent text-slate-300 hover:text-white hover:bg-white/[0.05]'
            }`}
          >
            URDF 仓库
          </button>
        </nav>

        <span className="text-[11px] text-slate-400" title="这里显示公开模型与离线运动预览，未连接实体设备">
          参考模型 · 离线预览
        </span>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 relative overflow-hidden">
        {/* TAB 1: Zero-Occlusion Flex-Docked 3D Digital Twin Hangar */}
        {activeTab === 'hangar_3d' && (
          <div className="flex h-full w-full bg-[#0d1017] overflow-hidden">
            {/* LEFT FLEX-DOCKED INSPECTOR PANEL (shrinks & re-centers 3D viewport instead of covering the robot!) */}
            {!zenMode && activeDrawer && (
              <div className="w-[296px] shrink-0 h-full bg-[#10131a] border-r border-white/[0.08] flex flex-col overflow-hidden z-20">
                {/* Drawer 0: 6 Flagship Robot Assets Switcher */}
                {activeDrawer === 'robots' && (
                  <aside
                    data-testid="hangar-robots-drawer"
                    className="flex-1 flex flex-col overflow-hidden"
                  >
                    <div className="px-3 py-2 border-b border-white/[0.06] flex items-center justify-between gap-2 shrink-0">
                      <span className="text-xs font-semibold text-slate-100">
                        切换工程参考模型 ({ROBOT_PACKS.length})
                      </span>
                      <button
                        type="button"
                        aria-label="关闭参考模型列表"
                        onClick={() => setActiveDrawer(null)}
                        className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/[0.06] cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
                      {ROBOT_PACKS.map((pack) => {
                        const active = pack.id === selectedPack.id;
                        return (
                          <button
                            key={pack.id}
                            type="button"
                            data-testid={`pack-card-${pack.id}`}
                            onClick={() => {
                              setSelectedPack(pack);
                              setActiveDrillLevel('L0');
                              handleResetAllParts();
                              handleSelectSubPart(null);
                              setActiveDrawer(null);
                            }}
                            className={`w-full text-left p-2 rounded-lg border transition flex gap-2.5 items-center cursor-pointer ${
                              active
                                ? 'bg-cyan-500/[0.14] border-[#00e5ff]/65'
                                : 'bg-[#161922]/85 border-white/[0.06] hover:border-white/20'
                            }`}
                          >
                            <img
                              src={pack.previewUrl}
                              alt={pack.name}
                              referrerPolicy="no-referrer"
                              className="w-12 h-9 object-cover rounded bg-[#0d1017] border border-white/[0.08] shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="text-[10px] text-slate-400 truncate">
                                {pack.category}
                              </div>
                              <div className="text-xs font-medium text-slate-100 truncate">
                                {pack.name}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </aside>
                )}

                {/* Drawer 1: Structure (L0-L3 Drill + Sub-Assemblies + Telemetry Bus) */}
                {activeDrawer === 'structure' && (
                  <aside
                    data-testid="hangar-floating-left-hud"
                    className="flex-1 flex flex-col overflow-hidden"
                  >
                    <div className="px-3 py-2 border-b border-white/[0.06] flex items-center justify-between gap-2 shrink-0">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-100 truncate">
                          结构层级与遥测总线
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">
                          {selectedPack.category} · {urdfJoints.length} 关节定义
                        </div>
                      </div>
                      <button
                        type="button"
                        aria-label="关闭结构面板"
                        onClick={() => setActiveDrawer(null)}
                        className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/[0.06] cursor-pointer shrink-0"
                      >
                        <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                      </button>
                    </div>

                    <div className="p-3 border-b border-white/[0.06] space-y-1.5 shrink-0">
                      <div className="flex items-center justify-between text-xs text-slate-300">
                        <span>四级工程下钻</span>
                        <span className="font-mono tabular-nums text-cyan-300">
                          {activeDrillLevel}
                        </span>
                      </div>
                      <div className="grid grid-cols-4 gap-1 bg-[#0d1017]/80 p-0.5 rounded-lg border border-white/[0.06]">
                        {HANGAR_DRILL_LEVELS.map((d) => {
                          const isAct = activeDrillLevel === d.level && !activeSubAssembly;
                          return (
                            <button
                              key={d.level}
                              type="button"
                              data-testid={`hangar-drill-${d.level}`}
                              onClick={() => handleSelectDrillLevel(d.level)}
                              title={d.desc}
                              className={`py-1 px-1.5 rounded-md text-xs font-mono font-semibold border transition cursor-pointer ${
                                isAct
                                  ? 'bg-cyan-500/[0.16] border-[#00e5ff]/70 text-cyan-100'
                                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
                              }`}
                            >
                              {d.level}
                            </button>
                          );
                        })}
                      </div>
                      {autoDisassembly && autoStageLabel && (
                        <div className="text-[11px] text-cyan-300 truncate pt-0.5">
                          {autoStageLabel}
                        </div>
                      )}
                    </div>

                    <div className="flex-1 overflow-y-auto divide-y divide-white/[0.06]">
                      <div data-testid="hangar-sub-assembly-matrix">
                        <div className="px-3 py-2 flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => setLeftAcc((p) => ({ ...p, subs: !p.subs }))}
                            aria-expanded={leftAcc.subs}
                            className="flex items-center gap-1.5 text-left cursor-pointer min-w-0"
                          >
                            <Grid3x3
                              className="w-3.5 h-3.5 text-slate-400 shrink-0"
                              strokeWidth={1.5}
                            />
                            <span className="text-xs font-medium text-slate-200 truncate">
                              子总成矩阵
                            </span>
                            <span className="text-[11px] font-mono tabular-nums text-slate-500 shrink-0">
                              ({subAssemblies.length})
                            </span>
                            <ChevronDown
                              className={`w-3.5 h-3.5 text-slate-500 transition-transform shrink-0 ${
                                leftAcc.subs ? 'rotate-0' : '-rotate-90'
                              }`}
                              strokeWidth={1.5}
                            />
                          </button>
                          {activeSubAssembly && (
                            <button
                              type="button"
                              onClick={() => setActiveSubAssembly(null)}
                              className="text-[11px] text-cyan-300 hover:underline cursor-pointer shrink-0"
                            >
                              全部
                            </button>
                          )}
                        </div>
                        {leftAcc.subs && (
                          <div className="px-3 pb-2.5 grid grid-cols-2 gap-1">
                            {subAssemblies.map((sa) => {
                              const isAct = activeSubAssembly === sa.id;
                              return (
                                <button
                                  key={sa.id}
                                  type="button"
                                  data-testid={`hangar-sub-chip-${sa.id}`}
                                  onClick={() => handleSelectSubAssembly(sa.id)}
                                  className={`text-left px-2 py-1 rounded-md border transition cursor-pointer ${
                                    isAct
                                      ? 'bg-cyan-500/[0.14] border-[#00e5ff]/70 text-cyan-100'
                                      : 'bg-[#161922]/80 border-white/[0.06] hover:border-white/20 text-slate-200'
                                  }`}
                                  title={`${sa.label} (${sa.partNames.length} 件 · ${sa.totalTris.toLocaleString()} tris)`}
                                >
                                  <div className="flex items-center justify-between text-[10px] font-mono tabular-nums">
                                    <span className="text-cyan-300 font-semibold">
                                      {sa.shortCode}
                                    </span>
                                    <span className="text-slate-500">
                                      S{sa.stage}·{sa.partNames.length}
                                    </span>
                                  </div>
                                  <div className="text-[11px] font-medium truncate mt-0.5">
                                    {sa.label}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div>
                        <button
                          type="button"
                          onClick={() => setLeftAcc((p) => ({ ...p, bus: !p.bus }))}
                          aria-expanded={leftAcc.bus}
                          className="w-full px-3 py-2 flex items-center justify-between text-left cursor-pointer hover:bg-white/[0.03] transition"
                        >
                          <span className="flex items-center gap-1.5 text-xs font-medium text-slate-200">
                            <Activity className="w-3.5 h-3.5 text-slate-400" strokeWidth={1.5} />
                            <span>离线示意波形</span>
                          </span>
                          <ChevronDown
                            className={`w-3.5 h-3.5 text-slate-500 transition-transform ${
                              leftAcc.bus ? 'rotate-0' : '-rotate-90'
                            }`}
                            strokeWidth={1.5}
                          />
                        </button>
                        {leftAcc.bus && (
                          <LiveBusSparklines
                            contextId={selectedPack.id}
                            loadFactor={liveSim ? activeRegimeLoad : 0.25}
                            liveSim={liveSim}
                            channelLabels={hangarSparklineLabels}
                            faultActive={activeFaults.length > 0}
                            faultLabel={activeFaults[activeFaults.length - 1]?.alertTitle}
                            torqueSpikeNm={pushTorqueSpikeNm}
                          >
                            <div className="space-y-1 pt-1.5 border-t border-white/[0.06]">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-slate-400">开源基准源</span>
                                <a
                                  href={selectedPack.upstreamUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-cyan-300 hover:underline flex items-center gap-1"
                                >
                                  <span>GitHub</span>
                                  <ExternalLink className="w-3 h-3" strokeWidth={1.5} />
                                </a>
                              </div>
                              {selectedPack.specs.slice(0, 2).map((s) => (
                                <div key={s.label} className="flex justify-between text-[11px] gap-2">
                                  <span className="text-slate-400 shrink-0">{s.label === '网格精度' ? '当前网格统计' : s.label}</span>
                                  <span className="text-slate-200 font-mono tabular-nums truncate">
                                    {s.label === '网格精度' ? isLoadingGlb ? '正在读取模型…' : `${meshNodes.reduce((sum, node) => sum + node.tris, 0).toLocaleString()} 三角形 / ${meshNodes.length} 网格节点` : s.value}
                                  </span>
                                </div>
                              ))}
                              <button
                                type="button"
                                onClick={() => {
                                  const found = manifestData.find((r) => selectedPack.baselineRepo === `${r.category}/${r.repository}`);
                                  if (found) {
                                    navigateRobotics({ tab: 'urdf_explorer', repository: found.repository, file: selectedPack.primaryUrdf });
                                  }
                                  setActiveDrawer(null);
                                }}
                                className="w-full mt-1 py-1.5 px-2.5 rounded-lg bg-[#161922] hover:border-cyan-400/55 border border-white/[0.08] text-slate-200 text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                              >
                                <FileCode className="w-3.5 h-3.5 text-cyan-300" strokeWidth={1.5} />
                                <span>查看归档 URDF 运动学源码</span>
                              </button>
                            </div>
                          </LiveBusSparklines>
                        )}
                      </div>
                    </div>
                  </aside>
                )}

                {/* Drawer 2: Operating Regimes & URDF Joint FK Sliders */}
                {activeDrawer === 'kinematics' && (
                  <aside
                    data-testid="hangar-kinematics-drawer"
                    className="flex-1 flex flex-col overflow-hidden"
                  >
                    <div className="px-3 py-2 border-b border-white/[0.06] flex items-center justify-between gap-2 shrink-0">
                      <span className="text-xs font-semibold text-slate-100">
                        示意工况与关节驱动
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setLiveSim(!liveSim)}
                          className={`px-2 py-0.5 rounded border text-[10px] font-mono font-semibold transition whitespace-nowrap cursor-pointer ${
                            liveSim
                              ? 'bg-cyan-500/[0.14] border-[#00e5ff]/70 text-cyan-100'
                              : 'bg-[#161922] border-white/[0.12] text-slate-300'
                          }`}
                        >
                          {liveSim ? '动作预览' : '手动驱动'}
                        </button>
                        <button
                          type="button"
                          aria-label="关闭关节面板"
                          onClick={() => setActiveDrawer(null)}
                          className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/[0.06] cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-3 space-y-3">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-200">
                          <Zap className="w-3.5 h-3.5 text-slate-400" strokeWidth={1.5} />
                          <span>预设运动演示</span>
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                          {HANGAR_REGIMES.map((r) => {
                            const active = liveSim && hangarRegime === r.id;
                            return (
                              <button
                                key={r.id}
                                type="button"
                                onClick={() => {
                                  setHangarRegime(r.id);
                                  setLiveSim(true);
                                }}
                                className={`py-1.5 px-1.5 rounded-md text-[11px] border transition truncate cursor-pointer ${
                                  active
                                    ? 'bg-cyan-500/[0.14] border-[#00e5ff]/70 text-cyan-100 font-semibold'
                                    : 'bg-[#161922]/85 border-white/[0.07] text-slate-300 hover:border-white/20'
                                }`}
                                title={r.label}
                              >
                                {r.shortLabel}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="pt-2.5 border-t border-white/[0.06] space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-slate-200">
                            URDF 关节预览 ({visibleMovableJoints.length}/{movableJoints.length})
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setLiveSim(false);
                              setJointAngles({});
                            }}
                            className="text-[11px] text-slate-400 hover:text-cyan-300 border border-white/[0.08] rounded px-2 py-0.5 cursor-pointer"
                          >
                            归零
                          </button>
                        </div>

                        <input aria-label="筛选全部关节" value={jointSearch} onChange={event => setJointSearch(event.target.value)} placeholder="按关节或连杆名筛选全部关节" className="w-full rounded bg-slate-900 border border-white/10 px-2 py-1.5 text-xs" />
                        <p className="text-[10px] leading-4 text-slate-400">离线 FK / IK 预览；未连接实机，未求解减速器、负载或闭环动力学。{selectedPack.baselineNote}</p>

                        <div data-testid="joint-binding-report" className="text-[11px] leading-5 text-slate-400">
                          精确绑定 {jointBindingReport.bound.length}/{urdfJoints.length}
                          {jointBindingReport.missing.length > 0 && <p className="text-amber-300">缺失 {jointBindingReport.missing.length}：{jointBindingReport.missing.slice(0, 3).join('、')}</p>}
                          {jointBindingReport.ambiguous.length > 0 && <p className="text-red-300">重名冲突 {jointBindingReport.ambiguous.length}：{jointBindingReport.ambiguous.slice(0, 3).join('、')}</p>}
                        </div>
                        <div className="space-y-2">
                          {visibleMovableJoints.map((j) => {
                            const isBound = jointBindingReport.bound.includes(j.name);
                            const val = jointAngles[j.name] || 0;
                            const min = j.type === 'continuous' ? -Math.PI : j.lower;
                            const max = j.type === 'continuous' ? Math.PI : j.upper;
                            return (
                              <div key={j.name} className="space-y-0.5">
                                <div className="flex items-center justify-between text-[11px]">
                                  <span
                                    className="font-mono text-slate-300 truncate"
                                    title={`${j.name} (${j.parent} -> ${j.child})`}
                                  >
                                    {j.name}
                                  </span>
                                  <span className="font-mono tabular-nums text-cyan-300 text-[10px] shrink-0">
                                    {isBound ? `${val >= 0 ? '+' : ''}${val.toFixed(2)} ${j.type === 'prismatic' ? 'm' : 'rad'}` : '未绑定'}
                                  </span>
                                </div>
                                <input
                                  type="range"
                                  aria-label={`关节 ${j.name}`}
                                  disabled={!isBound}
                                  min={min}
                                  max={max}
                                  step={0.02}
                                  value={val}
                                  onChange={(e) => {
                                    const nextVal = parseFloat(e.target.value);
                                    setLiveSim(false);
                                    setJointAngles((prev) => ({
                                      ...prev,
                                      [j.name]: nextVal
                                    }));
                                  }}
                                  onPointerUp={(e) => e.currentTarget.blur()}
                                  className="w-full accent-[#00e5ff] h-1.5 cursor-pointer"
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </aside>
                )}

                {/* Drawer 3: Bidirectional Interactive CAD Scene Graph */}
                {activeDrawer === 'scenegraph' && (
                  <aside
                    data-testid="hangar-floating-right-hud"
                    onMouseLeave={() => handleHoverSceneGraphPart(null)}
                    className="flex-1 flex flex-col overflow-hidden"
                  >
                    <FloatingSceneGraphSection
                      nodes={meshNodes}
                      isOpen={true}
                      onToggleOpen={() => setActiveDrawer(null)}
                      onClose={() => {
                        handleHoverSceneGraphPart(null);
                        setActiveDrawer(null);
                      }}
                      selectedPart={highlightedPart}
                      hoveredPart={hoveredPart}
                      viewportHoveredPart={viewportHoveredPart}
                      activeDrillLevel={activeDrillLevel}
                      hiddenParts={hiddenParts}
                      onSelectPart={handleSelectSubPart}
                      onFocusPart={(name) => handleSelectSubPart(name)}
                      onToggleHidePart={handleToggleHidePartInGraph}
                      onShowAllHidden={() => setHiddenParts({})}
                      onHoverPart={handleHoverSceneGraphPart}
                      rowTestIdPrefix="hangar-part-row"
                    />
                  </aside>
                )}
              </div>
            )}

            {/* 3D VIEWPORT CONTAINER (100% Unoccluded Center Robot) */}
            <div className="relative flex-1 h-full overflow-hidden">
              <div
                ref={mountRef}
                className="absolute inset-0 w-full h-full cursor-crosshair"
                data-testid="hangar-viewport"
              />

              {/* SpaceX / Isaac Style 3D Spatial Telemetry Callouts (opt-in via Settings) */}
              <SpatialTelemetryOverlay
                items={projectedProbes}
                viewportWidth={viewportSize.w}
                viewportHeight={viewportSize.h}
                visible={!zenMode && showProbes && !isLoadingGlb && !isolatedPart}
                dimmed={
                  visualPopoverOpen ||
                  settingsOpen ||
                  dissectOpen ||
                  Boolean(hoveredPart || viewportHoveredPart)
                }
                sideHudInsetPx={28}
              />

              {/* Bidirectional Hover 3D Spatial Anchor + 45° Bent-Polyline HUD Callout */}
              <HoveredPartCalloutOverlay
                callout={!zenMode && !isolatedPart ? hoveredCallout : null}
                viewportWidth={viewportSize.w}
                viewportHeight={viewportSize.h}
              />

              {/* Surgical Single-Part Precision Capsule & CAD Dimension Callouts */}
              <PartBlueprintCapsule
                metadata={selectedBlueprintMeta}
                anchorScreen={selectedAnchorScreen}
                viewportWidth={viewportSize.w}
                viewportHeight={viewportSize.h}
                isIsolated={Boolean(isolatedPart && isolatedPart === highlightedPart)}
                isPeeled={Boolean(highlightedPart && peeledParts[highlightedPart])}
                peeledCount={Object.keys(peeledParts).length}
                hiddenCount={Object.keys(hiddenParts).length}
                axisLabels={blueprintAxisScreens}
                onToggleIsolate={handleToggleIsolateBlueprint}
                onTogglePeel={handleTogglePeelPart}
                onHidePart={handleHideSelectedPart}
                onResetAllParts={handleResetAllParts}
                onCloseSelection={() => handleSelectSubPart(null)}
              />

              {/* Module 3A: Projected 3D Push-Recovery Impulse Force Badge */}
              {!zenMode && !microFpvActive && pushCalloutHud && (
                <div
                  data-testid="hangar-push-impulse-callout"
                  style={{
                    left: `${Math.max(140, Math.min(viewportSize.w - 180, pushCalloutHud.screenX))}px`,
                    top: `${Math.max(124, Math.min(viewportSize.h - 96, pushCalloutHud.screenY - 26))}px`
                  }}
                  className="pointer-events-none absolute -translate-x-1/2 -translate-y-full z-20 px-2.5 py-1 rounded-lg bg-[#12141a]/[0.92] border border-amber-400/75 shadow-xl"
                >
                  <div className="text-[11px] font-mono font-bold text-amber-300 whitespace-nowrap">
                    IMPULSE: {pushCalloutHud.forceN} N · 全身抗扰恢复
                  </div>
                  <div className="text-[10px] font-mono text-cyan-300 truncate max-w-[210px]">
                    连杆演示: {pushCalloutHud.partName} · 程序化力矩示意 +{pushTorqueSpikeNm}（非实测）
                  </div>
                </div>
              )}

              {/* MPC Floor-Click Walk Hint Pill */}
              {!zenMode && mpcEnabled && !isolatedPart && (
                <div
                  data-testid="hangar-mpc-floor-walk-hint"
                  className="pointer-events-none absolute bottom-16 left-1/2 -translate-x-1/2 z-20 px-3 py-1 rounded-lg bg-[#12141a]/[0.88] border border-[#00e5ff]/55 text-[11px] font-mono text-cyan-200 whitespace-nowrap"
                >
                  地面运动演示：点击机库地面设置目标，查看程序路径与关节动画
                </div>
              )}

              {/* TOP-LEFT COMPACT INSPECTOR BAR (Single thin bar at perimeter edge) */}
              {!zenMode && (
                <div className="pointer-events-none absolute top-4 left-4 z-20 flex flex-col items-start gap-2">
                  <div
                    data-testid="hangar-compact-bar"
                    className="pointer-events-auto flex items-center gap-1 p-1 rounded-xl bg-[#12141a]/[0.88] border border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_12px_28px_rgba(0,0,0,0.45)]"
                  >
                    <button
                      type="button"
                      data-testid="hangar-robot-switcher-btn"
                      aria-expanded={activeDrawer === 'robots'}
                      onClick={() =>
                        setActiveDrawer((d) => (d === 'robots' ? null : 'robots'))
                      }
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap max-w-[200px] ${
                        activeDrawer === 'robots'
                          ? 'bg-cyan-500/[0.16] border border-[#00e5ff]/70 text-cyan-100'
                          : 'border border-transparent text-slate-100 hover:bg-white/[0.05]'
                      }`}
                      title="切换工程参考模型"
                    >
                      <Bot className="w-3.5 h-3.5 text-cyan-300 shrink-0" strokeWidth={1.5} />
                      <span className="truncate">{selectedPack.name.split('(')[0].trim()}</span>
                      <ChevronDown
                        className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${
                          activeDrawer === 'robots' ? 'rotate-180' : ''
                        }`}
                        strokeWidth={1.5}
                      />
                    </button>

                    <div className="h-4 w-px bg-white/[0.08]" />

                    <button
                      type="button"
                      data-testid="drawer-btn-structure"
                      aria-expanded={activeDrawer === 'structure'}
                      onClick={() =>
                        setActiveDrawer((d) => (d === 'structure' ? null : 'structure'))
                      }
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
                        activeDrawer === 'structure'
                          ? 'bg-cyan-500/[0.16] border border-[#00e5ff]/70 text-cyan-100'
                          : 'border border-transparent text-slate-300 hover:text-white hover:bg-white/[0.05]'
                      }`}
                    >
                      <Layers className="w-3.5 h-3.5 text-slate-400 shrink-0" strokeWidth={1.5} />
                      <span>结构</span>
                    </button>

                    <button
                      type="button"
                      data-testid="drawer-btn-kinematics"
                      aria-expanded={activeDrawer === 'kinematics'}
                      onClick={() =>
                        setActiveDrawer((d) => {
                          const next = d === 'kinematics' ? null : 'kinematics';
                          if (next === 'kinematics' && stateRef.current.liveSim) {
                            const bindings = boundJointsRef.current;
                            if (bindings.length > 0) {
                              const synced: Record<string, number> = {};
                              for (let i = 0; i < Math.min(20, bindings.length); i++) {
                                const b = bindings[i];
                                if (b.def.type !== 'fixed') {
                                  synced[b.def.name] = Number(b.currentVal.toFixed(2));
                                }
                              }
                              setJointAngles(synced);
                            }
                          }
                          return next;
                        })
                      }
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
                        activeDrawer === 'kinematics'
                          ? 'bg-cyan-500/[0.16] border border-[#00e5ff]/70 text-cyan-100'
                          : 'border border-transparent text-slate-300 hover:text-white hover:bg-white/[0.05]'
                      }`}
                    >
                      <Sliders className="w-3.5 h-3.5 text-slate-400 shrink-0" strokeWidth={1.5} />
                      <span>关节</span>
                    </button>

                    <button
                      type="button"
                      data-testid="drawer-btn-scenegraph"
                      aria-expanded={activeDrawer === 'scenegraph'}
                      onClick={() =>
                        setActiveDrawer((d) => (d === 'scenegraph' ? null : 'scenegraph'))
                      }
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
                        activeDrawer === 'scenegraph'
                          ? 'bg-cyan-500/[0.16] border border-[#00e5ff]/70 text-cyan-100'
                          : 'border border-transparent text-slate-300 hover:text-white hover:bg-white/[0.05]'
                      }`}
                    >
                      <Box className="w-3.5 h-3.5 text-slate-400 shrink-0" strokeWidth={1.5} />
                      <span>部件</span>
                      {meshNodes.length > 0 && (
                        <span className="text-[10px] font-mono tabular-nums text-slate-400">
                          {meshNodes.length}
                        </span>
                      )}
                    </button>

                    <div className="h-4 w-px bg-white/[0.08]" />

                    <button
                      type="button"
                      data-testid="header-enter-sandbox-btn"
                      onClick={() => handleEnterSandbox()}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-transparent text-cyan-300 hover:text-cyan-100 hover:bg-cyan-500/[0.12] flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap"
                      title="进入陆海空自由动态行动沙盒 [快捷键 G]"
                    >
                      <Gamepad2 className="w-3.5 h-3.5 text-cyan-300 shrink-0" strokeWidth={1.5} />
                      <span>自由沙盒 [G]</span>
                    </button>
                  </div>

                  {isLoadingGlb && (
                    <div className="pointer-events-none px-3 py-1.5 rounded-lg bg-[#12141a]/[0.90] border border-white/[0.08] text-[11px] font-mono text-cyan-300">
                      正在加载参考模型网格...
                    </div>
                  )}

                  {glbLoadError && !isLoadingGlb && (
                    <div className="pointer-events-auto flex flex-wrap items-center gap-2 max-w-xl bg-[#1a1418] border border-amber-500/50 rounded-lg px-3 py-1.5 text-xs text-amber-200" role="alert">
                      <span>{glbLoadError}</span>
                      <button
                        type="button"
                        data-testid="hangar-retry-glb-btn"
                        onClick={() => setGlbReloadNonce((n) => n + 1)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-500 text-white font-semibold cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" strokeWidth={1.5} />
                        重试
                      </button>
                    </div>
                  )}
                </div>
              )}

            {/* TOP-RIGHT SETTINGS MENU (Camera Presets, Director Cam, 3D Probes, Audio, Zen Mode, 4K Export) */}
            <div className="absolute top-4 right-4 z-20 flex flex-col items-end gap-1.5 pointer-events-none">
              {zenMode ? (
                <button
                  type="button"
                  onClick={() => setZenMode(false)}
                  className="pointer-events-auto px-3 py-1.5 rounded-xl bg-[#12141a]/[0.90] border border-[#00e5ff]/70 text-cyan-100 text-xs font-medium flex items-center gap-1.5 shadow-xl cursor-pointer"
                >
                  <Minimize2 className="w-3.5 h-3.5 text-cyan-300" strokeWidth={1.5} />
                  <span>退出纯净全屏 [H]</span>
                </button>
              ) : (
                <ViewportSettingsMenu
                  activePreset={activeCamPreset}
                  onSelectPreset={handleSelectCameraPreset}
                  directorCamMode={directorCamMode}
                  onCycleDirectorCam={handleCycleDirectorCamera}
                  showProbes={showProbes}
                  onToggleProbes={() => setShowProbes((v) => !v)}
                  audioSynthEnabled={audioSynthEnabled}
                  onToggleAudioSynth={handleToggleAudioSynth}
                  audioVolume={audioVolume}
                  onChangeAudioVolume={handleChangeAudioVolume}
                  handheldMicroSway={tactileConfig.handheldMicroSway}
                  onToggleHandheldMicroSway={() =>
                    setTactileConfig((prev) => ({
                      ...prev,
                      handheldMicroSway: !prev.handheldMicroSway
                    }))
                  }
                  zenMode={zenMode}
                  onToggleZenMode={() => setZenMode((z) => !z)}
                  isExporting4K={isExporting4K}
                  onExport4K={handleExport4K}
                  isRecordingWebm={isRecordingWebm}
                  onToggleRecordWebm={handleToggleRecordWebm}
                  onOpenChange={setSettingsOpen}
                />
              )}
            </div>

            {/* Top-Center Signature Ultimate Skill Visual Showcase Banner */}
            {ultimateActiveUI && (
              <div
                data-testid="hangar-ultimate-showcase-banner"
                className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 bg-[#12141a]/[0.92] border border-[#00e5ff]/70 rounded-xl px-3.5 py-1.5 z-30 shadow-2xl text-center max-w-[460px]"
              >
                <div className="text-xs font-semibold text-cyan-100 tracking-wide truncate">
                  {getRobotUltimateMeta(selectedPack.id).skillName}
                </div>
                <div className="text-[11px] text-cyan-300 mt-0.5 truncate">
                  {ultimatePhaseLabelUI} ·{' '}
                  {getRobotUltimateMeta(selectedPack.id).showcaseSystems.join(' / ')}
                </div>
              </div>
            )}

            {/* ULTRA-COMPACT BOTTOM DOCK (Sliders stowed inside 拆解剖切 & 实验设置 popovers) */}
            {!zenMode && (
              <div
                data-testid="hangar-single-bottom-dock"
                className="pointer-events-auto absolute bottom-4 left-1/2 -translate-x-1/2 max-w-[calc(100%-2rem)] bg-[#12141a]/[0.88] border border-white/[0.08] rounded-xl p-1.5 flex items-center gap-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_42px_rgba(0,0,0,0.6)] z-30 whitespace-nowrap"
              >
                <DissectionControlsPopover
                  explosionInputId="hangar-explosion-range"
                  clipInputId="hangar-clip-range"
                  explosion={explosion}
                  onChangeExplosion={(val) => {
                    handleHoverSceneGraphPart(null);
                    setAutoDisassembly(false);
                    if (val <= 0.01 && explosion > 0.04) {
                      proceduralAudioSynth.playMagneticSnapBackThud();
                      stateRef.current.snapShake = triggerAssemblySnapShake(0.85);
                      stateRef.current.camImpulse = triggerCameraMicroImpulse(0.28);
                    } else {
                      proceduralAudioSynth.playExplosionSliderHiss(val - explosion);
                    }
                    setExplosion(val);
                  }}
                  autoDisassembly={autoDisassembly}
                  onToggleAutoDisassembly={() => {
                    handleHoverSceneGraphPart(null);
                    const next = !autoDisassembly;
                    setAutoDisassembly(next);
                    if (next) {
                      setIsolatedPart(null);
                      stateRef.current.autoDisassemblyState = {
                        active: true,
                        progress: explosion,
                        direction: explosion >= 0.95 ? -1 : 1,
                        holdTimer: 0,
                        currentStage: 1,
                        stageLabel: '工序 I · 顶罩与感知舱垂直剥离'
                      };
                    }
                  }}
                  autoDisassemblyBtnTestId="hangar-auto-disassembly-btn"
                  clipRatio={clipRatio}
                  onChangeClipRatio={(val) => {
                    handleHoverSceneGraphPart(null);
                    if (microFpvActive) handleToggleMicroFpv();
                    setAutoSectionScan(false);
                    setClipRatio(val);
                  }}
                  autoSectionScan={autoSectionScan}
                  onToggleAutoSectionScan={() => {
                    if (microFpvActive) handleToggleMicroFpv();
                    setAutoSectionScan((v) => !v);
                  }}
                  onOpenChange={setDissectOpen}
                />

                <button
                  type="button"
                  data-testid="hangar-push-recovery-btn"
                  onClick={() => {
                    setPushTestArmed((prev) => {
                      const next = !prev;
                      if (next || pushTorqueSpikeNm <= 0) {
                        handleTriggerPushImpulse();
                      }
                      return next;
                    });
                  }}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border whitespace-nowrap shrink-0 flex items-center gap-1.5 transition cursor-pointer ${
                    pushTestArmed || pushTorqueSpikeNm > 0
                      ? 'bg-amber-500/[0.16] border-amber-400/75 text-amber-100 font-semibold'
                      : 'bg-[#161922]/90 border-white/[0.08] text-slate-200 hover:border-white/20 hover:text-white'
                  }`}
                  title="抗扰推搡脉冲测试：点击立即施加外力冲量，亦可开启后直接点击机器人任意部位（或按住 Alt+左键）触发全身平衡恢复 [快捷键 P]"
                >
                  <Crosshair className="w-3.5 h-3.5 text-amber-300 shrink-0" strokeWidth={1.5} />
                  <span>{pushTestArmed ? '点选推搡中 [P]' : '抗扰推搡 [P]'}</span>
                </button>

                <button
                  type="button"
                  data-testid="hangar-ultimate-showcase-btn"
                  onClick={handleTriggerUltimateShowcase}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border whitespace-nowrap shrink-0 flex items-center gap-1.5 transition cursor-pointer ${
                    ultimateActiveUI
                      ? 'bg-cyan-500/[0.16] border-[#00e5ff]/80 text-cyan-100 font-semibold'
                      : 'bg-[#161922]/90 border-white/[0.08] text-slate-200 hover:border-white/20 hover:text-white'
                  }`}
                  title="四镜到底联动展演：激光断层内窥 + L1–L3 拆解 + URDF 动作 + 变焦运镜 [快捷键 Q]"
                >
                  <Zap className="w-3.5 h-3.5 text-cyan-300 shrink-0" strokeWidth={1.5} />
                  <span>{ultimateActiveUI ? '展演中' : '联动展演 [Q]'}</span>
                </button>

                <PathTracingHudBar
                  inlineDock
                  pathTracingEnabled={pathTracingEnabled}
                  spp={ptSpp}
                  bvhMeshCount={bvhStats.meshes}
                  emissiveLightCount={bvhStats.emissives}
                  isExporting4K={isExporting4K}
                  onTogglePathTracing={() => setPathTracingEnabled((p) => !p)}
                  onExport4K={handleExport4K}
                />

                <VisualLabPopoverButton
                  thermalMode={thermalMode}
                  onToggleThermal={() => setThermalMode((v) => !v)}
                  flowSensorMode={flowSensorMode}
                  onToggleFlowSensor={() => setFlowSensorMode((v) => !v)}
                  showSkeleton={showSkeleton}
                  onToggleSkeleton={() => {
                    setShowSkeleton((v) => {
                      const next = !v;
                      if (next) {
                        setClipRatio(1.0);
                        setAutoSectionScan(false);
                      }
                      return next;
                    });
                  }}
                  xrayMode={xrayMode}
                  onToggleXray={() => setXrayMode((v) => !v)}
                  autoRotate={autoRotate}
                  onToggleAutoRotate={() => setAutoRotate((v) => !v)}
                  magLensEnabled={magLensEnabled}
                  magLensRadius={magLensRadius}
                  onToggleMagLens={() => setMagLensEnabled((v) => !v)}
                  slsActive={slsActive}
                  onTriggerSlsPrint={handleTriggerSlsPrint}
                  mpcEnabled={mpcEnabled}
                  totalPowerWatts={totalPowerWatts}
                  onToggleMpc={() => {
                    setMpcEnabled((v) => {
                      const next = !v;
                      if (next) {
                        setClipRatio(1.0);
                        setAutoSectionScan(false);
                      }
                      return next;
                    });
                  }}
                  windTunnelConfig={windTunnelConfig}
                  onChangeWindTunnel={setWindTunnelConfig}
                  microFpvActive={microFpvActive}
                  microFpvSegmentLabel={microFpvSegmentLabel}
                  onToggleMicroFpv={handleToggleMicroFpv}
                  shipbreakerEnabled={shipbreakerEnabled}
                  onToggleShipbreaker={() => {
                    setShipbreakerEnabled((v) => {
                      const next = !v;
                      if (next) {
                        setClipRatio(1.0);
                        setAutoSectionScan(false);
                      }
                      return next;
                    });
                  }}
                  floatingPartsCount={floatingPartsCount}
                  onResetGrappledParts={handleResetGrappledParts}
                  focusModeEnabled={focusWeakpointEnabled}
                  onToggleFocusMode={() => setFocusWeakpointEnabled((v) => !v)}
                  weatheringActive={weatheringActive}
                  onCleanWeathering={handleCleanWeathering}
                  faultCount={activeFaults.length}
                  faultInjectMode={faultInjectMode}
                  onToggleFaultInject={() => {
                    if (activeFaults.length === 0) {
                      handleInjectFaultOnPart();
                      setFaultInjectMode(true);
                    } else {
                      setFaultInjectMode((v) => !v);
                    }
                  }}
                  onSelfHealFaults={handleSelfHealAllFaults}
                  ikEnabled={ikEnabled}
                  onToggleIk={() => {
                    const next = !ikEnabled;
                    setIkEnabled(next);
                    if (!next) setPlasmaCutting(false);
                  }}
                  plasmaCutting={plasmaCutting}
                  onTogglePlasma={() => setPlasmaCutting((v) => !v)}
                  isExporting4K={isExporting4K}
                  onExport4K={handleExport4K}
                  pathTracingEnabled={pathTracingEnabled}
                  pathTracingSpp={ptSpp}
                  onTogglePathTracing={() => setPathTracingEnabled((p) => !p)}
                  cinemaOptics={cinemaOptics}
                  onChangeCinemaOptics={setCinemaOptics}
                  scientificConfig={scientificConfig}
                  onChangeScientificConfig={setScientificConfig}
                  peakStressMpa={peakStressMpa}
                  comStabilityStatus={comStabilityStatus}
                  hoverThermalReadout={hoverThermalReadout}
                  scifiConfig={scifiConfig}
                  onChangeScifiConfig={setScifiConfig}
                  onTriggerNaniteDemo={handleTriggerNaniteDemo}
                  onTriggerTacticalPulse={handleTriggerTacticalPulse}
                  tactileConfig={tactileConfig}
                  onChangeTactileConfig={setTactileConfig}
                  ikTensionNewtons={ikTensionNewtons}
                  onTriggerCinemaMacro={handleTriggerCinemaMacro}
                  audioEnabled={audioSynthEnabled}
                  onToggleAudio={handleToggleAudioSynth}
                  audioVolume={audioVolume}
                  onChangeAudioVolume={handleChangeAudioVolume}
                  isRecordingWebm={isRecordingWebm}
                  onToggleRecordWebm={handleToggleRecordWebm}
                  onOpenChange={setVisualPopoverOpen}
                />

                <button
                  type="button"
                  onClick={() => {
                    handleSelectDrillLevel('L0');
                    handleResetAllParts();
                    handleSelectCameraPreset(null);
                    handleSelfHealAllFaults();
                    setPushTestArmed(false);
                    stateRef.current.pushState = createInitialPushRecoveryState();
                    stateRef.current.mpcWalkState = createInitialHangarMpcWalkState();
                    setPushTorqueSpikeNm(0);
                    setPushCalloutHud(null);
                    setIkEnabled(false);
                    setPlasmaCutting(false);
                    setPathTracingEnabled(false);
                    setMagLensEnabled(false);
                    setMpcEnabled(false);
                    setWindTunnelConfig(createDefaultWindTunnelConfig());
                    setCinemaOptics(createDefaultCinemaOpticsConfig());
                    setScientificConfig(createDefaultScientificVizConfig());
                    setScifiConfig(createDefaultSciFiVfxConfig());
                    setTactileConfig(createDefaultTactileDirectorConfig());
                    stateRef.current.tacticalPulse = createInitialTacticalPulseState();
                    if (microFpvActive) handleToggleMicroFpv();
                    setClipRatio(1.0);
                    setAutoSectionScan(false);
                    setXrayMode(false);
                    setThermalMode(false);
                    handleSelectSubPart(null);
                    setLiveSim(true);
                  }}
                  aria-label="复位视图"
                  className="p-1.5 rounded-lg bg-[#161922]/90 hover:border-white/20 border border-white/[0.08] text-slate-300 hover:text-white shrink-0 cursor-pointer"
                  title="复位视图"
                >
                  <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.5} />
                </button>
              </div>
            )}
            </div>
          </div>
        )}

        {/* TAB 2: NASA Mars 2020 Perseverance L0-L3 Digital Twin */}
        {activeTab === 'mars2020' && (
          <WorkstationTwinView
            config={TWIN_WORKSTATIONS.mars2020}
            onEnterSandbox={handleEnterSandbox}
            audioSynthEnabled={audioSynthEnabled}
            onToggleAudioSynth={handleToggleAudioSynth}
            zenMode={zenMode}
            onToggleZenMode={() => setZenMode((z) => !z)}
          />
        )}

        {/* TAB 3: Boeing 737-800 & CFM56-7B Turbofan L0-L3 Digital Twin */}
        {activeTab === 'b737_cfm56' && (
          <WorkstationTwinView
            config={TWIN_WORKSTATIONS.b737_cfm56}
            onEnterSandbox={handleEnterSandbox}
            audioSynthEnabled={audioSynthEnabled}
            onToggleAudioSynth={handleToggleAudioSynth}
            zenMode={zenMode}
            onToggleZenMode={() => setZenMode((z) => !z)}
          />
        )}

        {/* TAB 4: Aerospace Structural Load Master Skeleton */}
        {activeTab === 'b737_bridge' && (
          <WorkstationTwinView
            config={TWIN_WORKSTATIONS.b737_bridge}
            onEnterSandbox={handleEnterSandbox}
            audioSynthEnabled={audioSynthEnabled}
            onToggleAudioSynth={handleToggleAudioSynth}
            zenMode={zenMode}
            onToggleZenMode={() => setZenMode((z) => !z)}
          />
        )}

        {/* TAB 5: 39 Open-Source Robotics Repositories URDF / XML Reality Baseline Explorer */}
        {activeTab === 'urdf_explorer' && (
          <div className="flex h-full w-full flex-col overflow-auto md:flex-row md:overflow-hidden">
            {/* Left Column: 39 Repositories Filterable List */}
            <aside className="w-full max-h-52 shrink-0 bg-slate-950 border-r border-slate-800 flex flex-col md:w-72 md:max-h-none">
              <div className="p-3 border-b border-slate-800">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    aria-label="搜索机器人仓库、型号或归档路径"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="搜索仓库、型号或归档路径…"
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-sky-400"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                {filteredRepos.map((repo) => {
                  const active = selectedRepo?.repository === repo.repository;
                  return (
                    <button
                      key={repo.repository}
                      onClick={() => {
                        setFileSearch('');
                        navigateRobotics({ repository: repo.repository, file: repo.primaryBaselineFile });
                      }}
                      className={`w-full text-left p-2.5 rounded-xl border transition ${
                        active
                          ? 'bg-purple-500/15 border-purple-400/60 text-slate-100'
                          : 'bg-slate-900/50 border-slate-800/80 hover:border-slate-700 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold text-purple-300">{repo.repository}</span>
                        <span className="text-[10px] text-slate-400 font-mono tabular-nums">
                          {repo.availableCounts?.kinematic ?? repo.kinematicFileCount}/{repo.kinematicFileCount} 描述 · {repo.availableCounts?.documents ?? repo.docFileCount}/{repo.docFileCount} 文档
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 line-clamp-2 mt-1">{repo.description}</p>
                    </button>
                  );
                })}
              </div>
            </aside>

            {/* Middle Column: Untouched URDF / XML / XACRO / README File List */}
            <aside className="w-full max-h-64 shrink-0 bg-slate-950/60 border-r border-slate-800 flex flex-col md:w-80 md:max-h-none">
              {selectedRepo && (
                <>
                  <div className="p-3.5 border-b border-slate-800 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-100">{selectedRepo.repository}</span>
                      <a
                        href={selectedRepo.upstreamUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-sky-400 hover:underline flex items-center gap-1"
                      >
                        <span>GitHub</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <p className="text-[11px] text-slate-400">{selectedRepo.description}</p>
                    {selectedRepo.primaryBaselineFile && (
                      <div className="pt-1 text-[10px] text-emerald-300 font-mono">
                        首选基准: {selectedRepo.primaryBaselineFile}
                      </div>
                    )}
                    <input aria-label="筛选完整归档文件" value={fileSearch} onChange={event => setFileSearch(event.target.value)} placeholder="筛选文件名或子目录…" className="mt-2 w-full rounded border border-white/10 bg-slate-900 px-2 py-1.5 text-xs" />
                    <p className="text-[10px] leading-4 text-slate-400">完整历史清单与 PRIMARY 原件均可查找；缺失、合成和适配文件分别标注，文件存在不代表原项目已可运行。</p>
                  </div>

                  <div className="flex-1 overflow-y-auto p-2 space-y-3">
                    <div>
                      <div className="px-2 py-1 text-[11px] font-semibold text-sky-400">
                        归档描述 (.urdf / .xml / .xacro / .sdf) [{visibleKinematicFiles.length}/{selectedRepo.kinematicFiles.length}]
                      </div>
                      <div className="space-y-0.5 mt-1">
                        {visibleKinematicFiles.map((f) => (
                          <button
                            key={f}
                            title={f}
                            onClick={() => setSelectedFileRel(f)}
                            className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] font-mono truncate transition ${
                              selectedFileRel === f
                                ? 'bg-sky-500/20 text-sky-300 border border-sky-400/40'
                                : 'text-slate-300 hover:bg-slate-900'
                            }`}
                          >
                            {selectedRepo.fileIssues?.[f] && <span className="mr-1 text-amber-300">[{BASELINE_STATUS_LABELS[selectedRepo.fileIssues[f].status]}]</span>}{f}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="px-2 py-1 text-[11px] font-semibold text-amber-400">
                        文档、配置与图像 [{visibleDocFiles.length}/{selectedRepo.docFiles.length}]
                      </div>
                      <div className="space-y-0.5 mt-1">
                        {visibleDocFiles.map((f) => (
                          <button
                            key={f}
                            title={f}
                            onClick={() => setSelectedFileRel(f)}
                            className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] font-mono truncate transition ${
                              selectedFileRel === f
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                                : 'text-slate-300 hover:bg-slate-900'
                            }`}
                          >
                            {selectedRepo.fileIssues?.[f] && <span className="mr-1 text-amber-300">[{BASELINE_STATUS_LABELS[selectedRepo.fileIssues[f].status]}]</span>}{f}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </aside>

            {/* Right Column: Raw Untouched File Code Viewer */}
            <div className="min-h-72 min-w-0 flex-1 flex flex-col bg-[#080d18] overflow-hidden md:min-h-0">
              <div className="px-4 py-2.5 border-b border-slate-800 flex flex-wrap gap-2 items-center justify-between bg-slate-950/80">
                <div className="flex items-center gap-2 text-xs font-mono text-sky-300">
                  <FileCode className="w-4 h-4" />
                  <span className="break-all">
                    {selectedRepo?.category} / {selectedRepo?.repository} / {selectedFileRel}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[11px]">
                  {fileKinematicStats.format !== 'DOC' && (
                    <span className="text-sky-300 font-mono tabular-nums">
                      {fileKinematicStats.format} · 源码标签 {fileKinematicStats.linkCount} link/body / {fileKinematicStats.jointCount} joint
                    </span>
                  )}
                  <span className={selectedFileIssue ? 'text-amber-300' : 'text-slate-400'}>{selectedFileIssue ? BASELINE_STATUS_LABELS[selectedFileIssue.status] : '归档文件 · 上游版本未锁定'}</span>
                  {selectedFileIssue?.status !== 'missing' && <a href={selectedFileUrl} target="_blank" rel="noreferrer" className="text-sky-300 hover:underline">{selectedFileIssue?.status === 'synthetic' ? '查看历史示意文件（非原件）' : '打开完整文件'}</a>}
                </div>
              </div>
              {selectedFileIssue && <div role="status" className="border-b border-amber-500/20 bg-amber-500/5 px-4 py-2 text-xs leading-5 text-amber-200">{selectedFileIssue.reason}{selectedFileIssue.preferredPath && <button className="ml-2 underline" onClick={() => setSelectedFileRel(selectedFileIssue.preferredPath!)}>查看已有 PRIMARY 原件</button>}</div>}
              {selectedFileIsImage && selectedFileIssue?.status !== 'missing'
                ? <div className="flex-1 overflow-auto p-4"><img src={selectedFileUrl} alt={selectedFileRel} className="max-w-full h-auto" /></div>
                : <pre className="flex-1 overflow-auto p-4 text-xs font-mono text-slate-200 leading-relaxed whitespace-pre-wrap">{fileContent}</pre>}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
