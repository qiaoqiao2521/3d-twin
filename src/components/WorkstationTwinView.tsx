import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { loadGlbSceneResilient } from '../utils/resilientGlbLoader';
import {
  Layers,
  Sliders,
  RotateCcw,
  CheckCircle2,
  Activity,
  Zap,
  Box,
  Minimize2,
  X,
  Grid3x3,
  ChevronDown,
  Gamepad2
} from 'lucide-react';
import {
  DrillLevel,
  TwinWorkstationConfig,
  classifyMeshLayer,
  computeClipPlaneConstant,
  computeGhostMaterialState
} from '../utils/manifestUtils';
import {
  AeroRegime,
  MarsRegime,
  AERO_REGIMES,
  MARS_REGIMES,
  computeAeroFadecTargets,
  computeMarsLiveTargets,
  computeThermalIrColor,
  estimatePartThermalNormalized,
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
import { HangarCameraPresetId, getHangarCameraPreset } from '../utils/ccdIkSolver';
import {
  DirectorCameraMode,
  UltimateSkillState,
  createInitialUltimateSkillState,
  triggerUltimateSkill,
  stepUltimateSkill,
  getRobotUltimateMeta,
  cycleDirectorCameraMode,
  computeDirectorCameraPose
} from '../utils/signatureShowcaseEngine';
import { createSignatureShowcaseSceneFXController } from '../utils/signatureShowcaseSceneFX';
import {
  EmissiveAreaLightSource,
  DualGearRayTracingController,
  detectSoftwareWebGL,
  createStudioLightboxPmrem,
  upgradeGlbPbrAndBuildStaticBvh,
  createSaltlineReflectorDeck,
  createDualGearRayTracingPipeline
} from '../utils/hybridRayTracing';
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
import { VisualLabPopoverButton } from './VisualLabPopoverButton';
import {
  SpringDamperVec3State,
  SurfaceWeatheringState,
  classifyShipbreakerPartRole,
  stepSpringDamperVec3,
  stepDynamicWeathering,
  computeHorizonFocusMode
} from '../utils/aaaGameVfxEngine';
import { createShipbreakerSalvageController } from '../utils/aaaGameSceneFX';
import { FloatingSceneGraphSection } from './FloatingSceneGraphSection';
import { HoveredPartCalloutOverlay, HoveredPartCalloutInfo } from './HoveredPartCalloutOverlay';
import {
  AssemblySnapShakeState,
  MICRO_FPV_SAFE_EXPLOSION_RATIO,
  triggerAssemblySnapShake,
  stepAssemblySnapShake,
  reconcileHangarStateTransition,
  shouldAutoRevealInternalSkeleton,
  buildSafeWorldBBoxFpvWaypoints
} from '../utils/hangarLivingPhysicsEngine';

interface WorkstationTwinViewProps {
  config: TwinWorkstationConfig;
  onEnterSandbox?: (actorId: string) => void;
  audioSynthEnabled?: boolean;
  onToggleAudioSynth?: () => void;
  zenMode?: boolean;
  onToggleZenMode?: () => void;
}

interface LoadedTwinPart {
  mesh: THREE.Mesh;
  partName: string;
  layer: 'L1' | 'L2' | 'L3';
  tris: number;
  vertices: number;
  basePos: THREE.Vector3;
  baseQuat: THREE.Quaternion;
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

const _tmpVec3 = new THREE.Vector3();
const _tmpVec3B = new THREE.Vector3();
const _tmpBox3 = new THREE.Box3();
const _tmpQuat = new THREE.Quaternion();
const _raycaster = new THREE.Raycaster();
const _pointerNdc = new THREE.Vector2();
const _axisX = new THREE.Vector3(1, 0, 0);
const _axisY = new THREE.Vector3(0, 1, 0);

export const WorkstationTwinView: React.FC<WorkstationTwinViewProps> = ({
  config,
  onEnterSandbox,
  audioSynthEnabled = false,
  onToggleAudioSynth,
  zenMode = false,
  onToggleZenMode
}) => {
  const isMars = config.id === 'mars2020';

  const [activeLevel, setActiveLevel] = useState<DrillLevel>('L0');
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
  const [aeroRegime, setAeroRegime] = useState<AeroRegime>('cruise_78');
  const [plaThrottle, setPlaThrottle] = useState<number>(78);
  const [marsRegime, setMarsRegime] = useState<MarsRegime>('traverse');

  const [meshNodes, setMeshNodes] = useState<{ name: string; tris: number; layer: 'L1' | 'L2' | 'L3' }[]>([]);
  const meshNodesRef = useRef<{ name: string; tris: number; layer: 'L1' | 'L2' | 'L3' }[]>([]);
  const [highlightedPart, setHighlightedPart] = useState<string | null>(null);
  const [hoveredPart, setHoveredPart] = useState<string | null>(null);
  const [viewportHoveredPart, setViewportHoveredPart] = useState<string | null>(null);
  const [hoveredCallout, setHoveredCallout] = useState<HoveredPartCalloutInfo | null>(null);
  const [leftAcc, setLeftAcc] = useState<{ levels: boolean; subs: boolean; bus: boolean }>({
    levels: true,
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

  // Real-time FK / Subsystem Articulation Sliders (synced with Live Sim or Manual Override)
  const [fkJoint1, setFkJoint1] = useState<number>(0);
  const [fkJoint2, setFkJoint2] = useState<number>(0);
  const [fkJoint3, setFkJoint3] = useState<number>(0);

  // Projected 3D Spatial Telemetry Callouts
  const [projectedProbes, setProjectedProbes] = useState<ProjectedTelemetryItem[]>([]);
  const [viewportSize, setViewportSize] = useState<{ w: number; h: number }>({ w: 960, h: 640 });

  // Camera Presets & Dual-Gear Hybrid Ray-Tracing State
  const [activeCamPreset, setActiveCamPreset] = useState<HangarCameraPresetId | null>(null);
  const [pathTracingEnabled, setPathTracingEnabled] = useState<boolean>(false);
  const [ptSpp, setPtSpp] = useState<number>(0);
  const [bvhStats, setBvhStats] = useState<{ meshes: number; emissives: number }>({ meshes: 0, emissives: 0 });
  const [isExporting4K, setIsExporting4K] = useState<boolean>(false);

  // 5 Hardcore Sci-Tech & Audiovisual Modules State
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

  // AAA Workstation Systems: Shipbreaker Magnetic Grapple, Horizon Focus Weakpoint & Dynamic Weathering
  const [shipbreakerEnabled, setShipbreakerEnabled] = useState<boolean>(false);
  const [floatingPartsCount, setFloatingPartsCount] = useState<number>(0);
  const [focusWeakpointEnabled, setFocusWeakpointEnabled] = useState<boolean>(false);
  const [weatheringActive, setWeatheringActive] = useState<boolean>(false);
  const resetGrappledPartsRef = useRef<(() => void) | null>(null);
  const [visualPopoverOpen, setVisualPopoverOpen] = useState<boolean>(false);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [dissectOpen, setDissectOpen] = useState<boolean>(false);
  const [activeDrawer, setActiveDrawer] = useState<'structure' | 'kinematics' | 'scenegraph' | null>(null);
  const [directorCamMode, setDirectorCamMode] = useState<DirectorCameraMode>('off');
  const [ultimateActiveUI, setUltimateActiveUI] = useState<boolean>(false);
  const [ultimatePhaseLabelUI, setUltimatePhaseLabelUI] = useState<string>('');

  const mountRef = useRef<HTMLDivElement | null>(null);
  const rayTracerRef = useRef<DualGearRayTracingController | null>(null);
  const renderOnceRef = useRef<(() => void) | null>(null);
  const partsRef = useRef<LoadedTwinPart[]>([]);
  const subAssembliesRef = useRef<SubAssemblyDef[]>([]);
  const assemblyNormMaxDimRef = useRef<number>(2.15);
  const layerGroupsRef = useRef<Record<'L1' | 'L2' | 'L3', THREE.Group | null>>({
    L1: null,
    L2: null,
    L3: null
  });
  const skeletonGroupRef = useRef<THREE.Group | null>(null);
  const clipPlaneRef = useRef<THREE.Plane>(new THREE.Plane(new THREE.Vector3(0, -1, 0), 10));
  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const bboxMaxYRef = useRef<number>(2.0);
  const bboxMinYRef = useRef<number>(-2.0);
  const bboxMinVecRef = useRef<[number, number, number]>([-1.1, -0.85, -1.1]);
  const bboxMaxVecRef = useRef<[number, number, number]>([1.1, 0.85, 1.1]);

  // Mutable simulation refs for zero-re-render 60fps animation loop
  const stateRef = useRef({
    activeLevel: 'L0' as DrillLevel,
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
    aeroRegime: 'cruise_78' as AeroRegime,
    plaThrottle: 78,
    marsRegime: 'traverse' as MarsRegime,
    fk1: 0,
    fk2: 0,
    fk3: 0,
    n1AccumAngle: 0,
    n2AccumAngle: 0,
    wheelAccumAngle: 0,
    reverserDamped: 0,
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
    camTargetPos: new THREE.Vector3(2.4, 1.65, 2.75),
    camTargetLook: new THREE.Vector3(0, 0, 0),
    activeCamPreset: null as HangarCameraPresetId | null,
    pathTracingEnabled: false,
    audioSynthEnabled: false,
    magLensEnabled: false,
    magLensHoverValid: false,
    magLensCenter: new THREE.Vector3(),
    magLensRadius: 0.44,
    slsState: createInitialSlsState(1.8) as SlsMaterializationState,
    mpcEnabled: false,
    windTunnelConfig: createDefaultWindTunnelConfig(),
    microFpvActive: false,
    microFpvPhase: 0,
    shipbreakerEnabled: false,
    focusWeakpointEnabled: false,
    weathering: {
      marsDust: config.id === 'mars2020' ? 0.36 : 0.02,
      intakeFrost: config.id === 'mars2020' ? 0.05 : 0.28,
      titaniumHeatBluing: config.id === 'mars2020' ? 0.14 : 0.38
    } as SurfaceWeatheringState,
    directorCamMode: 'off' as DirectorCameraMode,
    ultimateSkill: createInitialUltimateSkillState() as UltimateSkillState,
    snapShake: { timer: 0, amplitude: 0 } as AssemblySnapShakeState
  });

  useEffect(() => {
    const s = stateRef.current;
    s.activeLevel = activeLevel;
    if (!autoDisassembly) {
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
    s.aeroRegime = aeroRegime;
    s.plaThrottle = plaThrottle;
    s.marsRegime = marsRegime;
    s.activeSubAssembly = activeSubAssembly;
    s.isolatedPart = isolatedPart;
    s.peeledParts = peeledParts;
    s.hiddenParts = hiddenParts;
    s.autoDisassemblyState.active = autoDisassembly;
    s.activeCamPreset = activeCamPreset;
    s.pathTracingEnabled = pathTracingEnabled;
    s.audioSynthEnabled = audioSynthEnabled;
    s.magLensEnabled = magLensEnabled;
    s.magLensRadius = magLensRadius;
    s.mpcEnabled = mpcEnabled;
    s.windTunnelConfig = windTunnelConfig;
    s.microFpvActive = microFpvActive;
    s.shipbreakerEnabled = shipbreakerEnabled;
    s.focusWeakpointEnabled = focusWeakpointEnabled;
    s.directorCamMode = directorCamMode;
    if (!liveSim) {
      s.fk1 = fkJoint1;
      s.fk2 = fkJoint2;
      s.fk3 = fkJoint3;
    }
  }, [
    activeLevel,
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
    aeroRegime,
    plaThrottle,
    marsRegime,
    activeSubAssembly,
    isolatedPart,
    peeledParts,
    hiddenParts,
    autoDisassembly,
    activeCamPreset,
    pathTracingEnabled,
    audioSynthEnabled,
    magLensEnabled,
    magLensRadius,
    mpcEnabled,
    windTunnelConfig,
    microFpvActive,
    shipbreakerEnabled,
    focusWeakpointEnabled,
    directorCamMode,
    fkJoint1,
    fkJoint2,
    fkJoint3
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
    setFloatingPartsCount(0);
    if (stateRef.current.audioSynthEnabled) {
      proceduralAudioSynth.playMechanicalLatchClick(880);
    }
  };

  const handleCleanWeathering = () => {
    stateRef.current.weathering = { marsDust: 0, intakeFrost: 0, titaniumHeatBluing: 0 };
    setWeatheringActive(false);
    if (stateRef.current.audioSynthEnabled) {
      proceduralAudioSynth.playMechanicalLatchClick(960);
    }
  };

  const handleTriggerSlsPrint = () => {
    setClipRatio(1.0);
    setAutoSectionScan(false);
    stateRef.current.targetClipRatio = 1.0;
    stateRef.current.autoSectionScan = false;
    stateRef.current.slsState = triggerSlsMaterialization(bboxMinYRef.current, 1.8);
    setSlsActive(true);
    if (stateRef.current.audioSynthEnabled) {
      proceduralAudioSynth.playSubBassImpact('sls_print');
    }
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
      if (next) {
        setPathTracingEnabled(false);
        setActiveCamPreset(null);
        stateRef.current.activeCamPreset = null;
        if (ctrl) ctrl.enabled = false;
        if (cam) {
          cam.near = 0.002;
          cam.fov = 64;
          cam.updateProjectionMatrix();
        }
      } else {
        if (cam) {
          cam.near = 0.01;
          cam.fov = 42;
          cam.up.set(0, 1, 0);
          cam.position.set(2.4, 1.65, 2.75);
          cam.updateProjectionMatrix();
        }
        if (ctrl) {
          ctrl.target.set(0, 0, 0);
          ctrl.enabled = true;
          ctrl.update();
        }
      }
      return next;
    });
  };

  // Keyboard shortcuts [R] Path Tracing & [C] Micro-FPV Cavity Fly-Through in Workstation
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Escape') {
        setActiveDrawer(null);
      } else if (e.code === 'KeyR' && !e.repeat) {
        setPathTracingEnabled((prev) => !prev);
      } else if (e.code === 'KeyQ' && !e.repeat) {
        handleTriggerUltimateShowcase();
      } else if (e.code === 'KeyK' && !e.repeat) {
        handleCycleDirectorCamera();
      } else if (e.code === 'KeyC' && !e.repeat) {
        handleToggleMicroFpv();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleSelectCameraPreset = (presetId: HangarCameraPresetId | null) => {
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
    // Bypass OrbitControls temporarily while locked to fixed engineering camera preset
    ctrl.enabled = false;
    stateRef.current.camGlideActive = false;
    cam.up.set(spec.up[0], spec.up[1], spec.up[2]);
    ctrl.target.set(0, 0, 0);
    cam.position.set(spec.offset[0], spec.offset[1], spec.offset[2]);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();
  };

  const handleExport4K = async () => {
    if (!rayTracerRef.current || !renderOnceRef.current || isExporting4K) return;
    setIsExporting4K(true);
    try {
      await rayTracerRef.current.export4KFrame(
        `${config.id}_raytraced_4k_${Date.now()}.png`,
        renderOnceRef.current
      );
    } finally {
      setIsExporting4K(false);
    }
  };

  const currentLevelSpec =
    config.levels.find((l) => l.level === activeLevel) || config.levels[0];

  const activeLoadFactor = isMars
    ? MARS_REGIMES.find((m) => m.id === marsRegime)?.loadFactor ?? 0.65
    : Math.max(0.2, plaThrottle / 100);

  useEffect(() => {
    setActiveDrawer(null);
    setActiveLevel('L0');
    setExplosion(0);
    setClipRatio(1.0);
    setAutoSectionScan(false);
    setXrayMode(false);
    setHighlightedPart(null);
    setHoveredPart(null);
    setViewportHoveredPart(null);
    setHoveredCallout(null);
    setActiveSubAssembly(null);
    setIsolatedPart(null);
    setPeeledParts({});
    setHiddenParts({});
    setAutoDisassembly(false);
    setAutoStageLabel('');
    setSelectedBlueprintMeta(null);
    setSelectedAnchorScreen(null);
    setLiveSim(true);
    setAeroRegime('cruise_78');
    setPlaThrottle(78);
    setMarsRegime('traverse');
    setFkJoint1(0);
    setFkJoint2(0);
    setFkJoint3(0);
    stateRef.current.highlightedPart = null;
    stateRef.current.hoveredPart = null;
    stateRef.current.activeSubAssembly = null;
    stateRef.current.isolatedPart = null;
    stateRef.current.peeledParts = {};
    stateRef.current.hiddenParts = {};
    stateRef.current.autoDisassemblyState.active = false;
    stateRef.current.autoDisassemblyState.progress = 0;
    stateRef.current.camGlideActive = false;
    setMicroFpvActive(false);
    stateRef.current.microFpvActive = false;
    setWindTunnelConfig(createDefaultWindTunnelConfig());
    stateRef.current.windTunnelConfig = createDefaultWindTunnelConfig();
  }, [config.id]);

  const triggerSmoothCameraFocus = (targetLook: THREE.Vector3, offset: THREE.Vector3) => {
    stateRef.current.camTargetLook.copy(targetLook);
    stateRef.current.camTargetPos.copy(targetLook).add(offset);
    stateRef.current.camGlideActive = true;
  };

  const handleSelectLevel = (lvl: DrillLevel) => {
    setActiveLevel(lvl);
    setActiveSubAssembly(null);
    setIsolatedPart(null);
    const spec = config.levels.find((l) => l.level === lvl);
    if (spec) {
      setAutoDisassembly(false);
      setExplosion(spec.explosionDefault);
      setClipRatio(spec.clipDefault);
    }
    if (lvl === 'L0') {
      triggerSmoothCameraFocus(new THREE.Vector3(0, 0, 0), new THREE.Vector3(2.4, 1.65, 2.75));
    } else {
      const grp = layerGroupsRef.current[lvl];
      if (grp) {
        const box = new THREE.Box3().setFromObject(grp);
        if (!box.isEmpty()) {
          const center = box.getCenter(new THREE.Vector3());
          triggerSmoothCameraFocus(center, new THREE.Vector3(1.85, 1.2, 2.05));
        }
      }
    }
  };

  const handleSelectSubAssembly = (subId: string) => {
    setIsolatedPart(null);
    const nextId = activeSubAssembly === subId ? null : subId;
    setActiveSubAssembly(nextId);
    if (!nextId) {
      triggerSmoothCameraFocus(new THREE.Vector3(0, 0, 0), new THREE.Vector3(2.4, 1.65, 2.75));
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
        triggerSmoothCameraFocus(center, new THREE.Vector3(1.55, 0.98, 1.78));
      }
    }
  };

  const handleSelectSubPart = (partName: string | null) => {
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
        config.id,
        found.partName,
        found.layer,
        matchedSub?.label || `${found.layer} 精密子总成`,
        found.normSize,
        assemblyNormMaxDimRef.current,
        found.tris,
        found.vertices,
        []
      );
      setSelectedBlueprintMeta(meta);

      const box = new THREE.Box3().setFromObject(found.mesh);
      if (!box.isEmpty()) {
        const center = box.getCenter(new THREE.Vector3());
        triggerSmoothCameraFocus(center, new THREE.Vector3(1.38, 0.88, 1.56));
      }
    }
  };

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
        const d = Math.max(0.75, Math.max(size.x, size.y, size.z) * 2.1);
        triggerSmoothCameraFocus(
          center,
          nextIso ? new THREE.Vector3(d * 0.95, d * 0.65, d * 1.1) : new THREE.Vector3(2.4, 1.65, 2.75)
        );
      }
    }
  };

  const handleTogglePeelPart = () => {
    if (!highlightedPart) return;
    if (peeledParts[highlightedPart]) {
      stateRef.current.snapShake = triggerAssemblySnapShake(0.95);
    }
    if (stateRef.current.audioSynthEnabled) {
      proceduralAudioSynth.playMechanicalLatchClick(820);
    }
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

  const handleToggleHidePartInGraph = (partName: string) => {
    setHiddenParts((prev) => {
      const next = { ...prev };
      if (next[partName]) {
        delete next[partName];
      } else {
        next[partName] = true;
      }
      return next;
    });
    if (highlightedPart === partName) {
      setIsolatedPart(null);
      setHighlightedPart(null);
      stateRef.current.highlightedPart = null;
      setSelectedBlueprintMeta(null);
      setSelectedAnchorScreen(null);
    }
  };

  const handleHoverSceneGraphPart = (partName: string | null) => {
    setHoveredPart(partName);
    stateRef.current.hoveredPart = partName;
    if (!partName) {
      setHoveredCallout(null);
      return;
    }
    stateRef.current.highlightSelectTime = performance.now() / 1000;
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
  };

  const handleResetAllParts = () => {
    setIsolatedPart(null);
    setPeeledParts({});
    setHiddenParts({});
    setActiveSubAssembly(null);
    setAutoDisassembly(false);
    setAutoStageLabel('');
    setExplosion(0);
    stateRef.current.autoDisassemblyState.active = false;
    stateRef.current.autoDisassemblyState.progress = 0;
    stateRef.current.targetExplosion = 0;
    triggerSmoothCameraFocus(new THREE.Vector3(0, 0, 0), new THREE.Vector3(2.4, 1.65, 2.75));
  };

  useEffect(() => {
    if (!mountRef.current) return;
    let disposed = false;
    const container = mountRef.current;
    const width = container.clientWidth || 960;
    const height = container.clientHeight || 640;
    setViewportSize({ w: width, h: height });

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d1017);
    scene.fog = new THREE.FogExp2(0x0d1017, 0.036);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.01, 200);
    camera.position.set(2.4, 1.65, 2.75);
    cameraRef.current = camera;

    const isSoftwareGl = detectSoftwareWebGL();

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance'
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.localClippingEnabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Procedural HDR Industrial Studio Lightbox PMREM Environment
    const envTex = createStudioLightboxPmrem(renderer);
    scene.environment = envTex;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controlsRef.current = controls;

    // Cancel scripted camera glide immediately when user interacts with OrbitControls
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

    // Calibrated CAD Studio 3-Point Lighting Rig (zero white-shell clipping)
    const hemi = new THREE.HemisphereLight(0xd8e4f4, 0x11151d, 0.62);
    scene.add(hemi);
    const keyLight = new THREE.DirectionalLight(0xfff5e8, 1.28);
    keyLight.position.set(5, 8, 6);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 1.0;
    keyLight.shadow.camera.far = 22.0;
    keyLight.shadow.camera.left = -2.8;
    keyLight.shadow.camera.right = 2.8;
    keyLight.shadow.camera.top = 2.8;
    keyLight.shadow.camera.bottom = -2.8;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x58b4ec, 0.78);
    rimLight.position.set(-6, 4, -5);
    scene.add(rimLight);
    const bottomFill = new THREE.DirectionalLight(0x64748b, 0.24);
    bottomFill.position.set(0, -4, 2);
    scene.add(bottomFill);

    // Infinite Matte Space-Gray Industrial Floor + Near-Ground Soft Contact Shadow + Subtle Diffuse Reflection
    const saltlineDeck = createSaltlineReflectorDeck(isSoftwareGl, -0.86);
    scene.add(saltlineDeck.mesh);

    // Dual-Gear Hybrid Ray-Tracing & Progressive Monte Carlo Path-Tracing Pipeline
    const rayTracer = createDualGearRayTracingPipeline(renderer, width, height, isSoftwareGl);
    rayTracerRef.current = rayTracer;
    let emissiveSources: EmissiveAreaLightSource[] = [];

    const assemblyRoot = new THREE.Group();
    assemblyRoot.name = `${config.id}_glb_assembly`;
    scene.add(assemblyRoot);

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

    // 5 Hardcore Sci-Tech Scene FX Controllers
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
    let lastRenderedPtSpp = 0;
    const _ultEuler = new THREE.Euler();
    let fpvWaypoints = buildSafeWorldBBoxFpvWaypoints(
      config.id,
      bboxMinVecRef.current,
      bboxMaxVecRef.current
    );
    void buildMicroFpvCavityWaypoints;

    const grappleSprings = new Map<string, SpringDamperVec3State>();
    let draggingGrapplePart: string | null = null;
    let lastGrappledPart: string | null = null;
    let grappleGrabStartTarget: [number, number, number] = [0, 0, 0];
    const grappleGrabPointWorld = new THREE.Vector3();
    const grappleDragPlane = new THREE.Plane();
    const grappleDragHit = new THREE.Vector3();
    const _grappleOriginW = new THREE.Vector3();
    const _grappleTargetW = new THREE.Vector3();
    const _camRight = new THREE.Vector3();
    const _camUp = new THREE.Vector3();
    const _camFwd = new THREE.Vector3();
    const _emitterW = new THREE.Vector3();

    resetGrappledPartsRef.current = () => {
      grappleSprings.forEach((sp) => {
        sp.target = [0, 0, 0];
      });
      draggingGrapplePart = null;
      lastGrappledPart = null;
    };
    setFloatingPartsCount(0);

    // 3D Viewport Mouse Click, Shipbreaker Grapple & Mag-Lens Hover Raycasting
    let pointerDownPos: [number, number] | null = null;
    const onPointerDown = (ev: PointerEvent) => {
      if (ev.button !== 0) return;
      pointerDownPos = [ev.clientX, ev.clientY];

      if (stateRef.current.shipbreakerEnabled && !stateRef.current.isolatedPart) {
        const rect = renderer.domElement.getBoundingClientRect();
        if (rect.width > 10 && rect.height > 10) {
          _pointerNdc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
          _pointerNdc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
          _raycaster.setFromCamera(_pointerNdc, camera);
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
              if (stateRef.current.audioSynthEnabled) {
                proceduralAudioSynth.playMechanicalLatchClick(540);
              }
            }
          }
        }
      }
    };
    let lastMagRaycastAt = 0;
    let lastHoverRaycastAt = 0;
    let lastViewportHoverName: string | null = null;

    const onPointerMove = (ev: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) return;

      if (draggingGrapplePart) {
        _pointerNdc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
        _pointerNdc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
        _raycaster.setFromCamera(_pointerNdc, camera);
        if (_raycaster.ray.intersectPlane(grappleDragPlane, grappleDragHit)) {
          const dx = grappleDragHit.x - grappleGrabPointWorld.x;
          const dy = grappleDragHit.y - grappleGrabPointWorld.y;
          const dz = grappleDragHit.z - grappleGrabPointWorld.z;
          const sp = grappleSprings.get(draggingGrapplePart);
          if (sp) {
            sp.target = [
              Math.max(-1.85, Math.min(1.85, grappleGrabStartTarget[0] + dx)),
              Math.max(-1.25, Math.min(1.85, grappleGrabStartTarget[1] + dy)),
              Math.max(-1.85, Math.min(1.85, grappleGrabStartTarget[2] + dz))
            ];
          }
        }
        return;
      }

      if (stateRef.current.magLensEnabled) {
        const nowMs = performance.now();
        if (nowMs - lastMagRaycastAt < 28) return;
        lastMagRaycastAt = nowMs;
        _pointerNdc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
        _pointerNdc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
        _raycaster.setFromCamera(_pointerNdc, camera);
        const pickables = partsRef.current
          .filter((p) => p.mesh.visible && !stateRef.current.hiddenParts[p.partName])
          .map((p) => p.mesh);
        const hits = _raycaster.intersectObjects(pickables, false);
        if (hits.length > 0) {
          stateRef.current.magLensCenter.copy(hits[0].point);
          stateRef.current.magLensHoverValid = true;
        } else {
          stateRef.current.magLensHoverValid = false;
        }
        return;
      }

      stateRef.current.magLensHoverValid = false;
      if (ev.buttons === 0 && !stateRef.current.isolatedPart) {
        const nowMs = performance.now();
        if (nowMs - lastHoverRaycastAt >= 55) {
          lastHoverRaycastAt = nowMs;
          _pointerNdc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
          _pointerNdc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
          _raycaster.setFromCamera(_pointerNdc, camera);
          const pickables = partsRef.current
            .filter((p) => p.mesh.visible && !stateRef.current.hiddenParts[p.partName])
            .map((p) => p.mesh);
          const hits = _raycaster.intersectObjects(pickables, false);
          const hitName =
            hits.length > 0
              ? partsRef.current.find((p) => p.mesh === (hits[0].object as THREE.Mesh))?.partName || null
              : null;
          if (hitName !== lastViewportHoverName) {
            lastViewportHoverName = hitName;
            setViewportHoveredPart(hitName);
          }
        }
      }
    };
    const onPointerLeave = () => {
      stateRef.current.magLensHoverValid = false;
      if (lastViewportHoverName !== null) {
        lastViewportHoverName = null;
        setViewportHoveredPart(null);
      }
    };
    const onWheel = (ev: WheelEvent) => {
      if (!stateRef.current.magLensEnabled) return;
      ev.preventDefault();
      ev.stopPropagation();
      const nextR = clampMagLensRadius(stateRef.current.magLensRadius, ev.deltaY);
      stateRef.current.magLensRadius = nextR;
      setMagLensRadius(nextR);
    };
    const onPointerUp = (ev: PointerEvent) => {
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
          const curMag = Math.hypot(sp.target[0], sp.target[1], sp.target[2]);
          if (curMag < 0.06) {
            const pv = hitPart.orthoPlan.peelVector;
            sp.target = [pv[0] * 1.45, Math.max(0.18, pv[1] * 1.45 + 0.14), pv[2] * 1.45];
          } else {
            sp.target = [0, 0, 0];
            stateRef.current.snapShake = triggerAssemblySnapShake(1.05);
            if (stateRef.current.audioSynthEnabled) {
              proceduralAudioSynth.playMechanicalLatchClick(920);
            }
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

      const pickables = partsRef.current
        .filter((p) => p.mesh.visible && !stateRef.current.hiddenParts[p.partName])
        .map((p) => p.mesh);
      const hits = _raycaster.intersectObjects(pickables, false);
      if (hits.length > 0) {
        const hitMesh = hits[0].object as THREE.Mesh;
        const hitPart = partsRef.current.find((p) => p.mesh === hitMesh);
        if (hitPart) {
          handleSelectSubPart(hitPart.partName);
        }
      } else if (!stateRef.current.isolatedPart) {
        handleSelectSubPart(null);
      }
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerleave', onPointerLeave);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

    let flowController: FlowAndSensorFieldController | null = null;

    // Load all 3 real GLB subsystem files (L1, L2, L3) via resilient GLTFLoader + DRACOLoader
    setIsLoadingGlb(true);
    setGlbLoadError(null);
    const loadLayerGlb = (layerKey: 'L1' | 'L2' | 'L3', url: string) =>
      loadGlbSceneResilient(url).then((group) => ({ layerKey, group }));

    Promise.all([
      loadLayerGlb('L1', config.glbLayers.L1),
      loadLayerGlb('L2', config.glbLayers.L2),
      loadLayerGlb('L3', config.glbLayers.L3)
    ])
      .then((loadedLayers) => {
        if (disposed) return;

        const centeredModelGroup = new THREE.Group();
        centeredModelGroup.name = `${config.id}_centered_cad_group`;
        assemblyRoot.add(centeredModelGroup);

        for (const { layerKey, group } of loadedLayers) {
          group.name = `${config.id}_${layerKey}`;
          layerGroupsRef.current[layerKey] = group;
          centeredModelGroup.add(group);
        }

        centeredModelGroup.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(centeredModelGroup);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z, 0.001);
        const scale = 2.15 / maxDim;

        centeredModelGroup.scale.setScalar(scale);
        centeredModelGroup.position.sub(center.multiplyScalar(scale));
        assemblyRoot.updateMatrixWorld(true);

        const normBox = new THREE.Box3().setFromObject(assemblyRoot);
        const normAssemblySize = normBox.getSize(new THREE.Vector3());
        assemblyNormMaxDimRef.current = Math.max(
          normAssemblySize.x,
          normAssemblySize.y,
          normAssemblySize.z,
          0.2
        );
        bboxMinYRef.current = normBox.min.y;
        bboxMaxYRef.current = normBox.max.y;
        bboxMinVecRef.current = [normBox.min.x, normBox.min.y, normBox.min.z];
        bboxMaxVecRef.current = [normBox.max.x, normBox.max.y, normBox.max.z];
        fpvWaypoints = buildSafeWorldBBoxFpvWaypoints(
          config.id,
          bboxMinVecRef.current,
          bboxMaxVecRef.current
        );
        const minX = normBox.min.x;
        const spanX = Math.max(0.01, normBox.max.x - normBox.min.x);
        saltlineDeck.setFloorY(normBox.min.y - 0.022);
        saltlineDeck.setContactFootprint(
          (normBox.min.x + normBox.max.x) * 0.5,
          (normBox.min.z + normBox.max.z) * 0.5,
          Math.max(0.45, (normBox.max.x - normBox.min.x) * 0.54),
          Math.max(0.45, (normBox.max.z - normBox.min.z) * 0.54)
        );

        // Module 3: 3D Flow Streamlines & Sensor Perception Cones
        flowController = createFlowAndSensorField(config.id, normBox.min.y - 0.03);
        scene.add(flowController.group);

        interface TempCollectedMesh {
          mesh: THREE.Mesh;
          partName: string;
          layerKey: 'L1' | 'L2' | 'L3';
          tris: number;
          vertices: number;
          worldCenter: THREE.Vector3;
          normSize: [number, number, number];
          geomLocalCenter: THREE.Vector3;
          socketInParentLocal: THREE.Vector3;
          stdMat: THREE.MeshStandardMaterial;
          twinUniforms: TwinMaterialUniforms;
        }
        const tempMeshes: TempCollectedMesh[] = [];
        const nodeList: { name: string; tris: number; layer: 'L1' | 'L2' | 'L3' }[] = [];
        const jointPositions: THREE.Vector3[] = [];
        const usedNames = new Set<string>();

        for (const { layerKey, group } of loadedLayers) {
          group.traverse((obj) => {
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

              const partBox = new THREE.Box3().setFromObject(m);
              const worldCenter = partBox.isEmpty()
                ? m.getWorldPosition(new THREE.Vector3())
                : partBox.getCenter(new THREE.Vector3());
              const partSizeVec = partBox.isEmpty()
                ? new THREE.Vector3(0.05, 0.05, 0.05)
                : partBox.getSize(new THREE.Vector3());
              jointPositions.push(worldCenter.clone());

              const socketInParentLocal = m.parent
                ? m.parent.worldToLocal(worldCenter.clone())
                : worldCenter.clone();

              const baseMat = Array.isArray(m.material) ? m.material[0] : m.material;
              const stdMat = (
                baseMat ? baseMat.clone() : new THREE.MeshStandardMaterial({ color: 0x94a3b8 })
              ) as THREE.MeshStandardMaterial;
              stdMat.clippingPlanes = [clipPlaneRef.current];
              stdMat.clipShadows = true;
              const twinUniforms = attachTwinShaderEffects(stdMat, layerKey === 'L1', layerKey);
              m.material = stdMat;
              m.castShadow = !isSoftwareGl;
              m.receiveShadow = !isSoftwareGl;

              let partName = m.name || `${layerKey}_mesh_${tempMeshes.length}`;
              if (usedNames.has(partName)) {
                partName = `${partName}_${tempMeshes.length}`;
              }
              usedNames.add(partName);
              m.name = partName;

              if (tris >= 150) {
                nodeList.push({ name: partName, tris, layer: layerKey });
              }

              tempMeshes.push({
                mesh: m,
                partName,
                layerKey,
                tris,
                vertices: verts,
                worldCenter,
                normSize: [partSizeVec.x, partSizeVec.y, partSizeVec.z],
                geomLocalCenter,
                socketInParentLocal,
                stdMat,
                twinUniforms
              });
            }
          });
        }

        // Build 8-12 Fine-Grained Sub-Assembly Matrix from actual loaded GLB parts
        const computedSubs = buildSubAssemblyMatrix(
          config.id,
          tempMeshes.map((tm) => ({
            name: tm.partName,
            tris: tm.tris,
            layer: tm.layerKey,
            center: [tm.worldCenter.x, tm.worldCenter.y, tm.worldCenter.z]
          }))
        );
        subAssembliesRef.current = computedSubs;
        setSubAssemblies(computedSubs);

        const loadedParts: LoadedTwinPart[] = tempMeshes.map((tm) => {
          const m = tm.mesh;
          const orthoPlan = computePartOrthogonalExplosionPlan(
            config.id,
            tm.partName,
            tm.layerKey,
            [tm.worldCenter.x, tm.worldCenter.y, tm.worldCenter.z],
            computedSubs
          );

          // Convert world-normalized orthogonal & peel vectors into m.parent local delta so any CAD unit scale or Z-up parent transform stays 100% world-orthogonal
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

          return {
            mesh: m,
            partName: tm.partName,
            layer: tm.layerKey,
            tris: tm.tris,
            vertices: tm.vertices,
            basePos: m.position.clone(),
            baseQuat: m.quaternion.clone(),
            geomLocalCenter: tm.geomLocalCenter,
            socketInParentLocal: tm.socketInParentLocal,
            localOrthoVec,
            localPeelVec,
            normSize: tm.normSize,
            orthoPlan,
            mountOriginWorld: tm.worldCenter.clone(),
            currentCenterWorld: tm.worldCenter.clone(),
            peelAmount: 0,
            normAxialX,
            origMat: tm.stdMat,
            origSide: tm.stdMat.side,
            origColor: tm.stdMat.color ? tm.stdMat.color.clone() : new THREE.Color(0x94a3b8),
            twinUniforms: tm.twinUniforms
          };
        });

        nodeList.sort((a, b) => b.tris - a.tris);
        partsRef.current = loadedParts;
        meshNodesRef.current = nodeList;
        setMeshNodes(nodeList);

        // Build Static per-mesh BLAS (MeshBVH) once & upgrade PBR microfacet / Emissive Area Light tags!
        const bvhInfo = upgradeGlbPbrAndBuildStaticBvh(assemblyRoot, config.id, classifyMeshLayer);
        emissiveSources = bvhInfo.emissiveSources;
        setBvhStats({ meshes: bvhInfo.bvhMeshCount, emissives: bvhInfo.emissiveSources.length });
        rayTracer.resetAccumulation();

        // Bind real GLB geometries to MPC Future Wireframe Ghosts & Faraday Lightning Skin Sampler, and trigger 1.8s Dual-Laser SLS Print!
        mpcPowerCtrl.bindFutureGhostModel(assemblyRoot);
        disasterFx.bindRealGlbSurfaceVertices(assemblyRoot);
        stateRef.current.slsState = {
          ...createInitialSlsState(1.8),
          active: false,
          laserY: normBox.max.y + 0.5,
          progress: 1
        };
        setSlsActive(false);
        setIsLoadingGlb(false);

        // Build L0 Coordinate Skeleton Overlay (unclipped so Optical Sectioning exposes the full internal skeleton inside sliced regions!)
        skelGroup.clear();
        const rootAxes = new THREE.AxesHelper(1.25);
        skelGroup.add(rootAxes);

        const ringPts: THREE.Vector3[] = [];
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * Math.PI * 2;
          ringPts.push(new THREE.Vector3(Math.cos(a) * 0.06, Math.sin(a) * 0.06, 0));
        }
        const ringGeo = new THREE.BufferGeometry().setFromPoints(ringPts);
        const ringMat = new THREE.LineBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.85
        });

        const linePts: THREE.Vector3[] = [];
        jointPositions.slice(0, 36).forEach((jp, idx) => {
          const jointRing = new THREE.LineLoop(ringGeo, ringMat);
          jointRing.position.copy(jp);
          skelGroup.add(jointRing);
          const localAxes = new THREE.AxesHelper(0.11);
          localAxes.position.copy(jp);
          skelGroup.add(localAxes);
          if (idx > 0) {
            linePts.push(jointPositions[idx - 1], jp);
          }
        });

        if (linePts.length >= 2) {
          const lineGeo = new THREE.BufferGeometry().setFromPoints(linePts);
          const lineMat = new THREE.LineBasicMaterial({
            color: 0xf59e0b,
            transparent: true,
            opacity: 0.78
          });
          skelGroup.add(new THREE.LineSegments(lineGeo, lineMat));
        }
      })
      .catch((err) => {
        if (disposed) return;
        console.warn('[Workstation] L1/L2/L3 真机 GLB 资产网络重试已耗尽:', err);
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
      // Pause continuous time advance during stationary Gear-2 DSLR Path-Tracing exposure so SPP converges to 256!
      if (s.liveSim && !s.pathTracingEnabled) {
        simElapsed += dt;
      }

      if (s.shipbreakerEnabled || s.focusWeakpointEnabled || s.windTunnelConfig.schlierenMode) {
        s.slsState.active = false;
      }

      // Module 1B: Advance 1.8s Dual-Laser SLS 3D Printing Materialization Sweep
      if (s.slsState.active && !s.pathTracingEnabled) {
        s.slsState = stepSlsMaterializationState(
          s.slsState,
          wallDt,
          bboxMinYRef.current,
          bboxMaxYRef.current
        );
      }

      // System 1: Step 4-Stage Auto Disassembly Demo if active
      if (s.autoDisassemblyState.active && !s.pathTracingEnabled) {
        s.autoDisassemblyState = stepAutoDisassemblyDemo(s.autoDisassemblyState, dt);
        s.targetExplosion = s.autoDisassemblyState.progress;
      }

      const twinActorId = config.id === 'b737_bridge' ? 'b737_cfm56' : config.id;
      if (s.ultimateSkill.active && !s.pathTracingEnabled) {
        s.ultimateSkill = stepUltimateSkill(s.ultimateSkill, wallDt, twinActorId);
        if (s.ultimateSkill.justFinished) {
          assemblyRoot.position.set(0, 0, 0);
          assemblyRoot.rotation.set(0, 0, 0);
          if (s.directorCamMode === 'off') {
            camera.fov = 42;
            camera.up.set(0, 1, 0);
            camera.updateProjectionMatrix();
          }
        }
      }
      const snapVib = stepAssemblySnapShake(s.snapShake, dt);
      s.snapShake = snapVib.next;

      if (s.ultimateSkill.active) {
        assemblyRoot.position.set(0, s.ultimateSkill.altitudeOffset * 0.35 + snapVib.offsetY, 0);
        _ultEuler.set(
          s.ultimateSkill.rollOffset + snapVib.pitchRad,
          s.ultimateSkill.yawSpinOffset,
          s.ultimateSkill.pitchOffset * 0.45 + snapVib.rollRad,
          'YXZ'
        );
        assemblyRoot.quaternion.setFromEuler(_ultEuler);
      } else if (snapVib.next.timer > 0) {
        assemblyRoot.position.set(0, snapVib.offsetY, 0);
        assemblyRoot.rotation.set(snapVib.pitchRad, 0, snapVib.rollRad);
      } else if (
        Math.abs(assemblyRoot.position.y) > 1e-4 ||
        Math.abs(assemblyRoot.rotation.x) > 1e-4 ||
        Math.abs(assemblyRoot.rotation.y) > 1e-4 ||
        Math.abs(assemblyRoot.rotation.z) > 1e-4
      ) {
        assemblyRoot.position.set(0, 0, 0);
        assemblyRoot.rotation.set(0, 0, 0);
      }

      // Smooth exponential damping for Explosion & Section Clipping ([C] Micro-FPV clamped to safe 18% micro-gap!)
      const effectiveTargetExplosion = s.ultimateSkill.active
        ? Math.max(s.targetExplosion, s.ultimateSkill.armorExplosionRatio)
        : s.microFpvActive
          ? MICRO_FPV_SAFE_EXPLOSION_RATIO
          : s.targetExplosion;
      const uiStepDt = Math.min(0.28, rawDt);
      s.curExplosion = dampValue(s.curExplosion, effectiveTargetExplosion, 10.5, uiStepDt);
      if (s.ultimateSkill.active && s.ultimateSkill.showcaseClipRatio < 0.995 && !s.pathTracingEnabled) {
        s.curClipRatio = dampValue(
          s.curClipRatio,
          Math.min(s.targetClipRatio, s.ultimateSkill.showcaseClipRatio),
          11.0,
          uiStepDt
        );
      } else if (s.autoSectionScan && !s.pathTracingEnabled) {
        const sweepTarget = 0.54 + 0.38 * Math.sin(now * 0.95);
        s.curClipRatio = dampValue(s.curClipRatio, sweepTarget, 6.0, dt);
      } else {
        s.curClipRatio = dampValue(s.curClipRatio, s.targetClipRatio, 10.5, uiStepDt);
      }

      // Module 4: Millimeter-Scale Micro-FPV Cavity Fly-Through vs Signature Director Camera [K] vs OrbitControls
      let activeFpvSegLabel = '';
      if (s.microFpvActive && !s.pathTracingEnabled) {
        s.microFpvPhase = (s.microFpvPhase + dt * 0.088) % 1.0;
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
          anchorY: (bboxMinYRef.current + bboxMaxYRef.current) * 0.45 + assemblyRoot.position.y * 0.5,
          anchorZ: 0,
          actorYaw: 0,
          modelRadius: Math.max(1.2, assemblyNormMaxDimRef.current * 0.62),
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

      if (skeletonGroupRef.current) {
        skeletonGroupRef.current.visible = shouldAutoRevealInternalSkeleton(
          s.showSkeleton,
          s.curClipRatio,
          s.autoSectionScan,
          s.isolatedPart,
          s.windTunnelConfig.schlierenMode
        );
      }

      // Compute Operating Regime Kinematics
      const fadec = computeAeroFadecTargets(s.aeroRegime, s.plaThrottle);
      const loadFactor = isMars
        ? MARS_REGIMES.find((m) => m.id === s.marsRegime)?.loadFactor ?? 0.65
        : Math.max(0.2, s.plaThrottle / 100);

      let marsOmegaSum = 0;
      if (s.liveSim && !s.pathTracingEnabled) {
        if (isMars) {
          const prevFk1 = s.fk1;
          const prevFk2 = s.fk2;
          const prevFk3 = s.fk3;
          const marsTargets = computeMarsLiveTargets(s.marsRegime, simElapsed);
          s.fk1 = dampValue(s.fk1, marsTargets.rockerPitch, 6.0, dt);
          s.fk2 = dampValue(s.fk2, marsTargets.armPitch, 5.0, dt);
          s.fk3 = dampValue(s.fk3, marsTargets.mastYaw, 5.0, dt);
          s.wheelAccumAngle = (s.wheelAccumAngle + marsTargets.wheelSpinRadS * dt) % (Math.PI * 2);
          marsOmegaSum =
            (Math.abs(s.fk1 - prevFk1) + Math.abs(s.fk2 - prevFk2) + Math.abs(s.fk3 - prevFk3)) /
              Math.max(0.004, dt) +
            Math.abs(marsTargets.wheelSpinRadS) * 1.4;
        } else {
          s.reverserDamped = dampValue(s.reverserDamped, fadec.reverserStroke, 4.2, dt);
          s.n1AccumAngle = (s.n1AccumAngle + fadec.n1SpinRadS * dt) % (Math.PI * 2);
          s.n2AccumAngle = (s.n2AccumAngle + fadec.n2SpinRadS * dt) % (Math.PI * 2);
          s.fk1 = s.reverserDamped;
          s.fk2 = s.n1AccumAngle > Math.PI ? s.n1AccumAngle - Math.PI * 2 : s.n1AccumAngle;
          s.fk3 = s.n2AccumAngle > Math.PI ? s.n2AccumAngle - Math.PI * 2 : s.n2AccumAngle;
        }
      }

      // Module 5: Procedural Physical WebAudio Telemetry (CFM56 N1/N2 BPF Roar vs Perseverance FOC Servo Whine)
      if (s.audioSynthEnabled) {
        if (isMars) {
          proceduralAudioSynth.updateFocServoTelemetry(marsOmegaSum, false, simElapsed);
        } else {
          proceduralAudioSynth.updateAeroTurbofanTelemetry(
            fadec.n1Rpm,
            fadec.n2Rpm,
            fadec.reverserStroke > 0.3
          );
        }
      }

      // Update Optical Laser Clipping Plane
      const clipY = computeClipPlaneConstant(bboxMinYRef.current, bboxMaxYRef.current, s.curClipRatio);
      clipPlaneRef.current.constant = clipY;
      const isSectionCutVisible = (s.curClipRatio < 0.985 || s.autoSectionScan) && !s.isolatedPart;
      opticalSection.updateSection(clipY, isSectionCutVisible, now);

      // Update 3D Flow Streamlines & Sensor Cones (pause cones during active CAD section cut & 4-shot showcase so sliced interior stays crystal clear)
      if (flowController) {
        flowController.group.visible =
          s.flowSensorMode &&
          !isSectionCutVisible &&
          !s.ultimateSkill.active &&
          !s.isolatedPart &&
          !s.windTunnelConfig.schlierenMode;
        flowController.update(simElapsed, loadFactor, !isMars && fadec.reverserStroke > 0.35);
      }

      // Apply 4-Stage Orthogonal CAD Explosion, Peel, Isolate Blueprint, Ghost Context, Thermal IR & Fresnel Pulse
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

      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        const m = p.mesh;

        // Visibility from Isolate Blueprint or Hide Outer Casing
        if (s.isolatedPart) {
          m.visible = p.partName === s.isolatedPart;
        } else {
          m.visible = !s.hiddenParts[p.partName];
        }
        if (!m.visible) continue;

        const targetPeel = s.peeledParts[p.partName] ? 1 : 0;
        p.peelAmount = dampValue(p.peelAmount, targetPeel, 9.0, dt);
        if (p.peelAmount > 0.012) anyPartDisplaced = true;

        // Evaluate 4-stage smoothstep progress + peel ease
        const [wx, wy, wz] = evaluateStagedExplosionOffset(p.orthoPlan, s.curExplosion, p.peelAmount);
        // Project world displacement ratio onto precomputed parent-local orthogonal & peel vectors
        const windows: Record<1 | 2 | 3 | 4, [number, number]> = {
          1: [0.0, 0.3],
          2: [0.22, 0.56],
          3: [0.48, 0.82],
          4: [0.72, 1.0]
        };
        const [w0, w1] = windows[p.orthoPlan.stage];
        const rawU = s.curExplosion <= w0 ? 0 : s.curExplosion >= w1 ? 1 : (s.curExplosion - w0) / (w1 - w0);
        const stageU = rawU * rawU * (3 - 2 * rawU);
        const peelEase = p.peelAmount * p.peelAmount * (3 - 2 * p.peelAmount);

        m.position
          .copy(p.basePos)
          .addScaledVector(p.localOrthoVec, stageU)
          .addScaledVector(p.localPeelVec, peelEase);
        m.quaternion.copy(p.baseQuat);
        // Keep wx/wy/wz referenced cleanly
        void wx; void wy; void wz;

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
            const gwx = stepped.pos[0];
            const gwy = stepped.pos[1] + hoverBob;
            const gwz = stepped.pos[2];
            if (m.parent) {
              _grappleOriginW.set(0, 0, 0);
              m.parent.localToWorld(_grappleOriginW);
              _grappleTargetW.set(
                _grappleOriginW.x + gwx,
                _grappleOriginW.y + gwy,
                _grappleOriginW.z + gwz
              );
              m.parent.worldToLocal(_grappleTargetW);
              m.position.add(_grappleTargetW);
            } else {
              m.position.x += gwx;
              m.position.y += gwy;
              m.position.z += gwz;
            }
          }
        }

        const n = p.partName.toLowerCase();
        if (isMars) {
          if (p.layer === 'L1' && n.includes('suspension')) {
            _tmpQuat.setFromAxisAngle(_axisX, s.fk1 * 0.35);
            m.quaternion.multiply(_tmpQuat);
          } else if (p.layer === 'L1' && n.includes('wheel')) {
            _tmpQuat.setFromAxisAngle(_axisX, s.fk1 * 0.25 + (s.liveSim ? s.wheelAccumAngle * 0.2 : 0));
            m.quaternion.multiply(_tmpQuat);
          } else if (p.layer === 'L2' && (n.includes('arm') || n.includes('turret'))) {
            _tmpQuat.setFromAxisAngle(_axisX, s.fk2 * 0.6);
            m.quaternion.multiply(_tmpQuat);
          } else if (p.layer === 'L2' && (n.includes('head') || n.includes('navcam') || n.includes('mastcam') || n.includes('top') || n.includes('cylinder015'))) {
            _tmpQuat.setFromAxisAngle(_axisY, s.fk3);
            m.quaternion.multiply(_tmpQuat);
          }
        } else {
          if (p.layer === 'L1' && n.includes('thrust_reverser')) {
            m.position.x += s.fk1 * 0.44;
          } else if (p.layer === 'L2' && (n.includes('n1_wide_chord') || n.includes('lpc'))) {
            _tmpQuat.setFromAxisAngle(_axisX, s.fk2);
            m.quaternion.multiply(_tmpQuat);
          } else if (
            (p.layer === 'L2' && n.includes('hpc')) ||
            (p.layer === 'L3' && (n.includes('hpt') || n.includes('lpt') || n.includes('shaft')))
          ) {
            _tmpQuat.setFromAxisAngle(_axisX, s.fk3);
            m.quaternion.multiply(_tmpQuat);
          }
        }

        const isHighlighted = Boolean(activeFocusPart && p.partName === activeFocusPart);
        let ghostState = computeGhostMaterialState(
          p.layer,
          s.isolatedPart ? 'L0' : s.activeLevel,
          isHighlighted,
          anyHighlighted,
          s.xrayMode && !s.isolatedPart
        );

        // Apply 8-12 Sub-Assembly Ghost Context when a specific sub-assembly chip is focused
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
          mat.transparent = false;
          mat.opacity = 1.0;
          mat.depthWrite = true;
        } else {
          mat.transparent = ghostState.transparent;
          mat.opacity = ghostState.opacity;
          mat.depthWrite = ghostState.depthWrite;
        }

        if (s.thermalMode) {
          const normT = estimatePartThermalNormalized(config.id, p.partName, p.layer, loadFactor, p.normAxialX);
          const [tr, tg, tb] = computeThermalIrColor(normT);
          mat.color.setRGB(tr, tg, tb);
          if (mat.emissive) {
            mat.emissive.setRGB(tr * 0.42 * normT, tg * 0.35 * normT, tb * 0.25 * normT);
          }
        } else {
          mat.color.copy(p.origColor);
          if (mat.emissive) {
            mat.emissive.setHex(ghostState.emissiveHex);
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
      }

      if (s.liveSim && !s.pathTracingEnabled) {
        s.weathering = stepDynamicWeathering(s.weathering, {
          dt: dt * 0.25,
          domain: isMars ? 'land' : 'air',
          speedMetersPerSec: isMars ? 1.5 + loadFactor * 2.2 : 12.0 + loadFactor * 18.0,
          throttlePct: isMars ? 55 : s.plaThrottle
        });
      }

      assemblyRoot.updateMatrixWorld(true);

      // Update Exploded Assembly Dashed Trace Lines
      if (anyPartDisplaced && !s.isolatedPart && parts.length > 0) {
        const traceAnchors = parts.map((p) => {
          if (p.mesh.visible) {
            if (p.mesh.parent) {
              p.mountOriginWorld.copy(p.socketInParentLocal);
              p.mesh.parent.localToWorld(p.mountOriginWorld);
            }
            p.currentCenterWorld.copy(p.geomLocalCenter);
            p.mesh.localToWorld(p.currentCenterWorld);
          }
          return {
            originWorld: p.mountOriginWorld,
            currentWorld: p.currentCenterWorld,
            visible: p.mesh.visible
          };
        });
        traceController.updateTraces(traceAnchors, true);
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

      const ultMeta = getRobotUltimateMeta(twinActorId);
      signatureFx.updateHangarShowcase({
        skill: s.ultimateSkill,
        anchorWorld: _tmpVec3,
        floorY: -0.84,
        modelRadius: Math.max(0.95, assemblyNormMaxDimRef.current * 0.55),
        accentHex: ultMeta.accentHex,
        simTime: now
      });

      let mpcPowerWatts = 0;
      if ((s.mpcEnabled || s.ultimateSkill.active || isSectionCutVisible) && !s.isolatedPart) {
        const floorY = bboxMinYRef.current;
        const mpcFan =
          s.mpcEnabled || s.ultimateSkill.active
            ? computeMpcRolloutFan(
                0,
                floorY,
                0,
                Math.sin(simElapsed * 0.65) * 0.25,
                1.7 + loadFactor * 1.6,
                Math.cos(simElapsed * 1.05) * 0.4,
                () => floorY,
                simElapsed,
                2.0,
                16
              )
            : null;
        const jointArteryInputs = parts.slice(0, 18).map((pt, idx) => ({
          def: { name: pt.partName, type: 'revolute' },
          node: pt.mesh,
          omegaRadS: s.liveSim ? 0.9 + loadFactor * (1.4 + (idx % 3) * 0.7) : 0.12,
          torqueNm: isMars ? 18.0 : 28.0
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

      if (s.shipbreakerEnabled && !s.isolatedPart) {
        const jointWorldAnchors = parts.slice(0, 20).map((pt) => {
          const pPos = pt.geomLocalCenter.clone();
          pt.mesh.localToWorld(pPos);
          return { pos: pPos, axisWorld: isMars ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0) };
        });

        camera.matrixWorld.extractBasis(_camRight, _camUp, _camFwd);
        _emitterW
          .copy(camera.position)
          .addScaledVector(_camRight, 0.52)
          .addScaledVector(_camUp, -0.38)
          .addScaledVector(_camFwd, -0.62);

        const activeBeamPartName = draggingGrapplePart || lastGrappledPart;
        let grappledCenter: THREE.Vector3 | null = null;
        let grappledRadius = 0.22;
        if (activeBeamPartName) {
          const gp = parts.find((pt) => pt.partName === activeBeamPartName);
          if (gp && gp.mesh.visible) {
            grappledCenter = gp.geomLocalCenter.clone();
            gp.mesh.localToWorld(grappledCenter);
            grappledRadius = Math.max(gp.normSize[0], gp.normSize[1], gp.normSize[2]) * 0.58;
          }
        }

        salvageFx.updateSalvageFX({
          enabled: true,
          simTime: now,
          jointWorldAnchors,
          grappleActive: Boolean(grappledCenter),
          emitterWorld: _emitterW,
          grappledPartCenterWorld: grappledCenter,
          grappledPartRadius: grappledRadius
        });
      } else {
        salvageFx.updateSalvageFX({
          enabled: false,
          simTime: now,
          jointWorldAnchors: [],
          grappleActive: false,
          emitterWorld: _emitterW,
          grappledPartCenterWorld: null,
          grappledPartRadius: 0.2
        });
      }

      const showDeck = !s.isolatedPart && !s.windTunnelConfig.schlierenMode;
      saltlineDeck.mesh.visible = showDeck;
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
            s.fk1 * 1.1 +
            s.fk2 * 1.7 +
            s.fk3 * 2.3 +
            (s.thermalMode ? 7 : 0) +
            (s.xrayMode ? 13 : 0) +
            (s.isolatedPart ? 29 : 0) +
            (s.hoveredPart ? 41 : 0),
          emissiveSources,
          schlierenMode: s.windTunnelConfig.schlierenMode,
          simTime: now
        });

      renderOnceRef.current = () => {
        executePipelineRender();
      };
      const ptRes = executePipelineRender();

      // Throttled ~10Hz HUD sync for FK slider positions, SPP counter, SciTech status, Auto-Disassembly, Blueprint Capsule & 3D Telemetry Callouts
      if (now - lastUiSync > 0.1) {
        lastUiSync = now;
        const w = container.clientWidth || 960;
        const h = container.clientHeight || 640;
        setPtSpp(ptRes.spp);
        setSlsActive(s.slsState.active);
        setUltimateActiveUI(s.ultimateSkill.active);
        if (s.ultimateSkill.active) {
          setUltimatePhaseLabelUI(s.ultimateSkill.phaseLabel);
        }
        setTotalPowerWatts(mpcPowerWatts);
        setWeatheringActive(
          s.weathering.marsDust > 0.05 ||
            s.weathering.intakeFrost > 0.05 ||
            s.weathering.titaniumHeatBluing > 0.05
        );
        if (s.microFpvActive) {
          setMicroFpvSegmentLabel(activeFpvSegLabel);
        }

        if (s.liveSim) {
          setFkJoint1(Number(s.fk1.toFixed(2)));
          setFkJoint2(Number(s.fk2.toFixed(2)));
          setFkJoint3(Number(s.fk3.toFixed(2)));
        }
        if (s.autoSectionScan) {
          setClipRatio(Number(s.curClipRatio.toFixed(2)));
        }
        if (s.autoDisassemblyState.active) {
          setExplosion(Number(s.autoDisassemblyState.progress.toFixed(2)));
          setAutoStageLabel(s.autoDisassemblyState.stageLabel);
        }

        // Project selected part anchor & bidirectional hovered 3D CAD callout
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
            _tmpVec3B.copy(_tmpVec3).project(camera);
            if (_tmpVec3B.z >= -1 && _tmpVec3B.z <= 1) {
              setHoveredCallout({
                partName: hovP.partName,
                index: graphIdx >= 0 ? graphIdx : hovIdx,
                layer: hovP.layer,
                tris: hovP.tris,
                screenX: (_tmpVec3B.x * 0.5 + 0.5) * w,
                screenY: (-_tmpVec3B.y * 0.5 + 0.5) * h,
                worldMm: [wxMm, wyMm, wzMm]
              });
            } else {
              setHoveredCallout(null);
            }
          } else {
            setHoveredCallout(null);
          }
        } else {
          setHoveredCallout(null);
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
          const rawProbes = buildSpatialTelemetryProbes(config.id, now, loadFactor, fadec);
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
      renderer.setSize(w, h);
      rayTracer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);
    const resizeObs =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(handleResize) : null;
    resizeObs?.observe(container);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      controls.removeEventListener('start', onControlStart);
      window.removeEventListener('resize', handleResize);
      resizeObs?.disconnect();
      magSlsRig.dispose();
      mpcPowerCtrl.dispose();
      disasterFx.dispose();
      salvageFx.dispose();
      signatureFx.dispose();
      traceController.dispose();
      saltlineDeck.dispose();
      rayTracer.dispose();
      rayTracerRef.current = null;
      envTex.dispose();
      renderer.dispose();
    };
  }, [config.id, config.glbLayers.L1, config.glbLayers.L2, config.glbLayers.L3, isMars, glbReloadNonce]);

  const fkLabels = isMars
    ? [
        { label: 'Rocker-Bogie 摇臂俯仰', val: fkJoint1, set: setFkJoint1, min: -0.8, max: 0.8, unit: 'rad' },
        { label: '5-DOF 采样臂/转塔俯仰', val: fkJoint2, set: setFkJoint2, min: -1.2, max: 1.2, unit: 'rad' },
        { label: 'Mastcam-Z 遥感桅杆偏航', val: fkJoint3, set: setFkJoint3, min: -1.57, max: 1.57, unit: 'rad' }
      ]
    : [
        { label: 'C-Duct 叶栅反推罩行程', val: fkJoint1, set: setFkJoint1, min: 0, max: 1.0, unit: 'stroke' },
        { label: 'N1 低压风扇/LPC 相位', val: fkJoint2, set: setFkJoint2, min: -3.14, max: 3.14, unit: 'rad' },
        { label: 'N2 高压涡轮 HPT/LPT 相位', val: fkJoint3, set: setFkJoint3, min: -3.14, max: 3.14, unit: 'rad' }
      ];

  const sparklineLabels: [string, string, string] = isMars
    ? ['MMRTG 电功率', '悬架振动包络', '采样臂峰值力矩']
    : ['燃油流量 FF', '双转子振动 FFT', '排气温度 EGT'];

  return (
    <div
      className="flex h-full w-full bg-[#0d1017] overflow-hidden"
      data-testid={`workstation-${config.id}`}
    >
      {/* ZERO-OCCLUSION FLEX-DOCKED LEFT INSPECTOR PANEL (shrinks & re-centers 3D viewport instead of covering the model) */}
      {!zenMode && activeDrawer && (
        <div className="w-[296px] shrink-0 h-full bg-[#10131a] border-r border-white/[0.08] flex flex-col overflow-hidden z-20">
          {/* Drawer 1: Structure (Drill-Down L0-L3 + Sub-Assemblies + Telemetry Bus) */}
          {activeDrawer === 'structure' && (
            <aside
              data-testid={`workstation-floating-left-hud-${config.id}`}
              className="flex-1 flex flex-col overflow-hidden"
            >
              <div className="px-3 py-2 border-b border-white/[0.06] flex items-center justify-between gap-2 shrink-0">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-100 truncate">
                    结构层级与遥测总线
                  </div>
                  <div className="text-[11px] text-slate-400 truncate">{config.badge}</div>
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

              <div className="flex-1 overflow-y-auto divide-y divide-white/[0.06]">
                <div>
                  <button
                    type="button"
                    onClick={() => setLeftAcc((p) => ({ ...p, levels: !p.levels }))}
                    aria-expanded={leftAcc.levels}
                    className="w-full px-3 py-2 flex items-center justify-between text-left cursor-pointer hover:bg-white/[0.03] transition"
                  >
                    <span className="flex items-center gap-1.5 text-xs font-medium text-slate-200">
                      <Layers className="w-3.5 h-3.5 text-slate-400" strokeWidth={1.5} />
                      <span>四级工程下钻 (L0–L3)</span>
                    </span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-slate-500 transition-transform ${
                        leftAcc.levels ? 'rotate-0' : '-rotate-90'
                      }`}
                      strokeWidth={1.5}
                    />
                  </button>
                  {leftAcc.levels && (
                    <div className="px-3 pb-2.5 grid grid-cols-2 gap-1">
                      {config.levels.map((lvl) => {
                        const active = activeLevel === lvl.level && !activeSubAssembly;
                        return (
                          <button
                            key={lvl.level}
                            type="button"
                            onClick={() => handleSelectLevel(lvl.level)}
                            className={`text-left px-2 py-1.5 rounded-md border transition cursor-pointer ${
                              active
                                ? 'bg-cyan-500/[0.14] border-[#00e5ff]/70'
                                : 'bg-[#161922]/80 border-white/[0.06] hover:border-white/20'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-mono font-semibold text-slate-100 truncate">
                                {lvl.title}
                              </span>
                              {active && (
                                <CheckCircle2
                                  className="w-3 h-3 text-cyan-300 shrink-0"
                                  strokeWidth={1.5}
                                />
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                              {lvl.subtitle}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div data-testid="sub-assembly-matrix">
                  <div className="px-3 py-2 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setLeftAcc((p) => ({ ...p, subs: !p.subs }))}
                      aria-expanded={leftAcc.subs}
                      className="flex items-center gap-1.5 text-left cursor-pointer min-w-0"
                    >
                      <Grid3x3 className="w-3.5 h-3.5 text-slate-400 shrink-0" strokeWidth={1.5} />
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
                            data-testid={`sub-assembly-chip-${sa.id}`}
                            onClick={() => handleSelectSubAssembly(sa.id)}
                            className={`text-left px-2 py-1 rounded-md border transition cursor-pointer ${
                              isAct
                                ? 'bg-cyan-500/[0.14] border-[#00e5ff]/70 text-cyan-100'
                                : 'bg-[#161922]/80 border-white/[0.06] hover:border-white/20 text-slate-200'
                            }`}
                            title={`${sa.label} (${sa.partNames.length} 件 · ${sa.totalTris.toLocaleString()} tris)`}
                          >
                            <div className="flex items-center justify-between text-[10px] font-mono tabular-nums">
                              <span className="text-cyan-300 font-semibold">{sa.shortCode}</span>
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
                      <span>实时遥测波形总线</span>
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
                      contextId={config.id}
                      loadFactor={activeLoadFactor}
                      liveSim={liveSim}
                      channelLabels={sparklineLabels}
                    >
                      <div className="space-y-1 pt-1.5 border-t border-white/[0.06]">
                        {currentLevelSpec.keyMetrics.map((m) => (
                          <div key={m.label} className="flex justify-between text-[11px] gap-2">
                            <span className="text-slate-400 shrink-0">{m.label}</span>
                            <span className="text-slate-200 font-mono tabular-nums truncate">
                              {m.value}
                            </span>
                          </div>
                        ))}
                        {config.engineeringSpecs.slice(0, 2).map((s) => (
                          <div key={s.label} className="flex justify-between text-[11px] gap-2">
                            <span className="text-slate-400 shrink-0">{s.label}</span>
                            <span className="text-cyan-300 font-mono tabular-nums truncate">
                              {s.value}
                            </span>
                          </div>
                        ))}
                      </div>
                    </LiveBusSparklines>
                  )}
                </div>
              </div>
            </aside>
          )}

          {/* Drawer 2: Kinematics & Operating Regimes */}
          {activeDrawer === 'kinematics' && (
            <aside
              data-testid={`workstation-kinematics-drawer-${config.id}`}
              className="flex-1 flex flex-col overflow-hidden"
            >
              <div className="px-3 py-2 border-b border-white/[0.06] flex items-center justify-between gap-2 shrink-0">
                <span className="text-xs font-semibold text-slate-100">仿真工况与机构驱动</span>
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
                    {liveSim ? '实时运行' : '手动驱动'}
                  </button>
                  <button
                    type="button"
                    aria-label="关闭机构面板"
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
                    <span>预设仿真工况</span>
                  </div>
                  {isMars ? (
                    <div className="grid grid-cols-3 gap-1">
                      {MARS_REGIMES.map((r) => {
                        const active = liveSim && marsRegime === r.id;
                        return (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => {
                              setMarsRegime(r.id);
                              setLiveSim(true);
                            }}
                            className={`py-1.5 px-1.5 rounded-md text-[11px] border transition truncate cursor-pointer ${
                              active
                                ? 'bg-cyan-500/[0.14] border-[#00e5ff]/70 text-cyan-100 font-semibold'
                                : 'bg-[#161922]/85 border-white/[0.07] text-slate-300 hover:border-white/20'
                            }`}
                            title={r.label}
                          >
                            {r.label}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-1">
                        {AERO_REGIMES.map((r) => {
                          const active = liveSim && aeroRegime === r.id;
                          return (
                            <button
                              key={r.id}
                              type="button"
                              onClick={() => {
                                setAeroRegime(r.id);
                                setPlaThrottle(r.plaPercent);
                                setLiveSim(true);
                              }}
                              className={`py-1.5 px-2 rounded-md text-[11px] border transition truncate cursor-pointer ${
                                active
                                  ? r.isReverse
                                    ? 'bg-amber-500/[0.14] border-amber-400/70 text-amber-100 font-semibold'
                                    : 'bg-cyan-500/[0.14] border-[#00e5ff]/70 text-cyan-100 font-semibold'
                                  : 'bg-[#161922]/85 border-white/[0.07] text-slate-300 hover:border-white/20'
                              }`}
                            >
                              {r.label}
                            </button>
                          );
                        })}
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] font-mono tabular-nums">
                          <span className="text-slate-300">FADEC 油门推力杆</span>
                          <span className="text-cyan-300 font-semibold">
                            {plaThrottle}% {aeroRegime === 'reverse' ? '(反推)' : ''}
                          </span>
                        </div>
                        <input
                          type="range"
                          aria-label="FADEC PLA 油门推力杆"
                          min={18}
                          max={100}
                          step={1}
                          value={plaThrottle}
                          onChange={(e) => {
                            setPlaThrottle(parseFloat(e.target.value));
                            setLiveSim(true);
                          }}
                          className="w-full accent-[#00e5ff] h-1.5 cursor-pointer"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-2.5 border-t border-white/[0.06] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-200">机构运动学驱动 (FK)</span>
                    <button
                      type="button"
                      onClick={() => {
                        setLiveSim(false);
                        setFkJoint1(0);
                        setFkJoint2(0);
                        setFkJoint3(0);
                      }}
                      className="text-[11px] text-slate-400 hover:text-cyan-300 border border-white/[0.08] rounded px-2 py-0.5 cursor-pointer"
                    >
                      归零
                    </button>
                  </div>
                  {fkLabels.map((s) => (
                    <div key={s.label} className="space-y-1">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-slate-300 truncate">{s.label}</span>
                        <span className="text-cyan-300 font-mono tabular-nums text-[10px] shrink-0">
                          {s.val >= 0 ? `+${s.val.toFixed(2)}` : s.val.toFixed(2)} {s.unit}
                        </span>
                      </div>
                      <input
                        type="range"
                        aria-label={s.label}
                        min={s.min}
                        max={s.max}
                        step={0.02}
                        value={s.val}
                        onChange={(e) => {
                          setLiveSim(false);
                          s.set(parseFloat(e.target.value));
                        }}
                        className="w-full accent-[#00e5ff] h-1.5 cursor-pointer"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          )}

          {/* Drawer 3: Bidirectional Interactive CAD Scene Graph */}
          {activeDrawer === 'scenegraph' && (
            <aside
              data-testid={`workstation-floating-right-hud-${config.id}`}
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
                activeDrillLevel={activeLevel}
                hiddenParts={hiddenParts}
                onSelectPart={handleSelectSubPart}
                onFocusPart={(name) => handleSelectSubPart(name)}
                onToggleHidePart={handleToggleHidePartInGraph}
                onShowAllHidden={() => setHiddenParts({})}
                onHoverPart={handleHoverSceneGraphPart}
                rowTestIdPrefix={`ws-part-row-${config.id}`}
              />
            </aside>
          )}
        </div>
      )}

      {/* 3D VIEWPORT CONTAINER (100% Unoccluded Center Subject) */}
      <div className="relative flex-1 h-full overflow-hidden">
        <div ref={mountRef} className="absolute inset-0 w-full h-full cursor-crosshair" />

        {/* Bidirectional 3D Spatial Reticle + 45° Bent-Polyline CAD Callout on Hover */}
        <HoveredPartCalloutOverlay
          callout={!zenMode && !isLoadingGlb && !isolatedPart ? hoveredCallout : null}
          viewportWidth={viewportSize.w}
          viewportHeight={viewportSize.h}
        />

        {/* Module 2: SpaceX / Isaac Style 3D Spatial Telemetry Callouts */}
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

        {/* System 1: Surgical Single-Part Precision Capsule & CAD Dimension Callouts */}
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

        {/* TOP-LEFT COMPACT INSPECTOR BAR (Single thin bar at perimeter edge) */}
        {!zenMode && (
          <div className="pointer-events-none absolute top-4 left-4 z-20 flex flex-col items-start gap-2">
            <div
              data-testid={`workstation-compact-bar-${config.id}`}
              className="pointer-events-auto flex items-center gap-1 p-1 rounded-xl bg-[#12141a]/[0.88] border border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_12px_28px_rgba(0,0,0,0.45)]"
            >
              <div className="px-2.5 py-1 flex items-center gap-2 min-w-0 max-w-[190px] border-r border-white/[0.08]">
                <span className="text-xs font-medium text-slate-100 truncate">{config.title}</span>
                <span className="text-[10px] font-mono tabular-nums text-cyan-300 shrink-0">
                  {activeLevel}
                </span>
              </div>

              <button
                type="button"
                data-testid={`ws-drawer-btn-structure-${config.id}`}
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
                data-testid={`ws-drawer-btn-kinematics-${config.id}`}
                aria-expanded={activeDrawer === 'kinematics'}
                onClick={() =>
                  setActiveDrawer((d) => (d === 'kinematics' ? null : 'kinematics'))
                }
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
                  activeDrawer === 'kinematics'
                    ? 'bg-cyan-500/[0.16] border border-[#00e5ff]/70 text-cyan-100'
                    : 'border border-transparent text-slate-300 hover:text-white hover:bg-white/[0.05]'
                }`}
              >
                <Sliders className="w-3.5 h-3.5 text-slate-400 shrink-0" strokeWidth={1.5} />
                <span>机构</span>
              </button>

              <button
                type="button"
                data-testid={`ws-drawer-btn-scenegraph-${config.id}`}
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

              {onEnterSandbox && (
                <>
                  <div className="h-4 w-px bg-white/[0.08]" />
                  <button
                    type="button"
                    data-testid={`ws-enter-sandbox-btn-${config.id}`}
                    onClick={() =>
                      onEnterSandbox(config.id === 'b737_bridge' ? 'b737_cfm56' : config.id)
                    }
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-transparent text-cyan-300 hover:text-cyan-100 hover:bg-cyan-500/[0.12] flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap"
                    title="进入自由动态行动沙盒 [快捷键 G]"
                  >
                    <Gamepad2 className="w-3.5 h-3.5 text-cyan-300 shrink-0" strokeWidth={1.5} />
                    <span>自由沙盒 [G]</span>
                  </button>
                </>
              )}
            </div>

            {isLoadingGlb && (
              <div className="pointer-events-none px-3 py-1.5 rounded-lg bg-[#12141a]/[0.90] border border-white/[0.08] text-[11px] font-mono text-cyan-300">
                正在加载高精度三维网格资产...
              </div>
            )}

            {glbLoadError && !isLoadingGlb && (
              <div className="pointer-events-auto flex items-center gap-2 bg-[#1a1418] border border-amber-500/50 rounded-lg px-3 py-1.5 text-xs text-amber-200">
                <span>网格资产加载中断</span>
                <button
                  type="button"
                  data-testid="workstation-retry-glb-btn"
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

      {/* TOP-RIGHT SETTINGS BUTTON (Camera Presets, Director Cam, 3D Probes, Audio, Zen Mode, 4K Export) */}
      <div className="absolute top-4 right-4 z-20 flex flex-col items-end gap-1.5 pointer-events-none">
        {zenMode ? (
          onToggleZenMode && (
            <button
              type="button"
              onClick={onToggleZenMode}
              className="pointer-events-auto px-3 py-1.5 rounded-xl bg-[#12141a]/[0.90] border border-[#00e5ff]/70 text-cyan-100 text-xs font-medium flex items-center gap-1.5 shadow-xl cursor-pointer"
            >
              <Minimize2 className="w-3.5 h-3.5 text-cyan-300" strokeWidth={1.5} />
              <span>退出纯净全屏 [H]</span>
            </button>
          )
        ) : (
          <ViewportSettingsMenu
            activePreset={activeCamPreset}
            onSelectPreset={handleSelectCameraPreset}
            directorCamMode={directorCamMode}
            onCycleDirectorCam={handleCycleDirectorCamera}
            showProbes={showProbes}
            onToggleProbes={() => setShowProbes((v) => !v)}
            audioSynthEnabled={audioSynthEnabled}
            onToggleAudioSynth={onToggleAudioSynth}
            zenMode={zenMode}
            onToggleZenMode={onToggleZenMode}
            isExporting4K={isExporting4K}
            onExport4K={handleExport4K}
            onOpenChange={setSettingsOpen}
          />
        )}

        {!zenMode && thermalMode && (
          <div className="bg-[#12141a]/[0.88] border border-amber-500/40 rounded-lg px-3 py-1.5 pointer-events-none">
            <div className="text-[10px] font-mono tabular-nums text-amber-300 flex items-center justify-between gap-4">
              <span>红外热力场</span>
              <span>{isMars ? '-60 °C → +215 °C' : '+15 °C → +1,380 °C'}</span>
            </div>
            <div className="h-1.5 w-40 rounded-sm mt-1 bg-gradient-to-r from-blue-900 via-cyan-500 to-amber-300" />
          </div>
        )}
      </div>

      {/* Top-Center Signature Ultimate Skill Visual Showcase Banner */}
      {ultimateActiveUI && (
        <div
          data-testid={`workstation-ultimate-banner-${config.id}`}
          className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 bg-[#12141a]/[0.92] border border-[#00e5ff]/70 rounded-xl px-3.5 py-1.5 z-30 shadow-2xl text-center max-w-[460px]"
        >
          <div className="text-xs font-semibold text-cyan-100 tracking-wide truncate">
            {getRobotUltimateMeta(config.id === 'b737_bridge' ? 'b737_cfm56' : config.id).skillName}
          </div>
          <div className="text-[11px] text-cyan-300 mt-0.5 truncate">
            {ultimatePhaseLabelUI} ·{' '}
            {getRobotUltimateMeta(
              config.id === 'b737_bridge' ? 'b737_cfm56' : config.id
            ).showcaseSystems.join(' / ')}
          </div>
        </div>
      )}

      {/* ULTRA-COMPACT BOTTOM DOCK (Sliders stowed inside 拆解剖切 & 实验设置 popovers) */}
      {!zenMode && (
        <div
          data-testid={`workstation-single-bottom-dock-${config.id}`}
          className="pointer-events-auto absolute bottom-4 left-1/2 -translate-x-1/2 max-w-[calc(100%-2rem)] bg-[#12141a]/[0.88] border border-white/[0.08] rounded-xl p-1.5 flex items-center gap-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_42px_rgba(0,0,0,0.6)] z-30 whitespace-nowrap"
        >
          <DissectionControlsPopover
            explosionInputId={`explode-${config.id}`}
            clipInputId={`clip-${config.id}`}
            explosion={explosion}
            onChangeExplosion={(val) => {
              handleHoverSceneGraphPart(null);
              setAutoDisassembly(false);
              setExplosion(val);
            }}
            autoDisassembly={autoDisassembly}
            onToggleAutoDisassembly={() => {
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
            autoDisassemblyBtnTestId={`auto-disassembly-btn-${config.id}`}
            clipRatio={clipRatio}
            onChangeClipRatio={(val) => {
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
            data-testid={`workstation-ultimate-btn-${config.id}`}
            onClick={handleTriggerUltimateShowcase}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border whitespace-nowrap shrink-0 flex items-center gap-1.5 transition cursor-pointer ${
              ultimateActiveUI
                ? 'bg-cyan-500/[0.16] border-[#00e5ff]/80 text-cyan-100 font-semibold'
                : 'bg-[#161922]/90 border-white/[0.08] text-slate-200 hover:border-white/20 hover:text-white'
            }`}
            title="四镜到底联动展演：激光断层内窥 + L1–L3 拆解 + 机构动作 + 变焦运镜 [快捷键 Q]"
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
            isExporting4K={isExporting4K}
            onExport4K={handleExport4K}
            onOpenChange={setVisualPopoverOpen}
          />

          <button
            type="button"
            onClick={() => {
              handleSelectLevel('L0');
              handleResetAllParts();
              handleSelectCameraPreset(null);
              setPathTracingEnabled(false);
              setMagLensEnabled(false);
              setMpcEnabled(false);
              setWindTunnelConfig(createDefaultWindTunnelConfig());
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
  );
};
