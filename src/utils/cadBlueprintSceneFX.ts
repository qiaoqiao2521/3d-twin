import * as THREE from 'three';

export interface ExplodedTraceController {
  group: THREE.Group;
  /**
   * Updates dashed trace lines between each displaced real GLB part and its original mounting bore.
   * Zero per-frame GC allocations.
   */
  updateTraces: (
    anchors: { originWorld: THREE.Vector3; currentWorld: THREE.Vector3; visible: boolean }[],
    visible: boolean
  ) => void;
  dispose: () => void;
}

/**
 * Builds industrial dashed assembly guide lines + mounting bore reticle ticks using pure custom BufferGeometry.
 * Zero primitive geometries.
 */
export function createExplodedTraceLinesController(maxParts: number = 220): ExplodedTraceController {
  const group = new THREE.Group();
  group.name = 'cad_exploded_trace_dashed_lines';

  const safeMax = Math.max(16, maxParts);
  const posArr = new Float32Array(safeMax * 6);
  const distArr = new Float32Array(safeMax * 2);

  const traceGeo = new THREE.BufferGeometry();
  traceGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  traceGeo.setAttribute('lineDistance', new THREE.BufferAttribute(distArr, 1));
  traceGeo.setDrawRange(0, 0);

  const traceMat = new THREE.LineDashedMaterial({
    color: 0x38bdf8,
    dashSize: 0.036,
    gapSize: 0.022,
    transparent: true,
    opacity: 0.82,
    depthWrite: false
  });
  const traceLines = new THREE.LineSegments(traceGeo, traceMat);
  traceLines.frustumCulled = false;
  group.add(traceLines);

  // Mounting bore cross-tick markers at origin & displaced part center
  const tickPosArr = new Float32Array(safeMax * 12); // 2 small cross segments per active trace
  const tickGeo = new THREE.BufferGeometry();
  tickGeo.setAttribute('position', new THREE.BufferAttribute(tickPosArr, 3));
  tickGeo.setDrawRange(0, 0);
  const tickMat = new THREE.LineBasicMaterial({
    color: 0xf59e0b,
    transparent: true,
    opacity: 0.85,
    depthWrite: false
  });
  const tickSegments = new THREE.LineSegments(tickGeo, tickMat);
  tickSegments.frustumCulled = false;
  group.add(tickSegments);

  const updateTraces = (
    anchors: { originWorld: THREE.Vector3; currentWorld: THREE.Vector3; visible: boolean }[],
    visible: boolean
  ) => {
    if (!visible) {
      group.visible = false;
      return;
    }

    let activeCount = 0;
    const limit = Math.min(safeMax, anchors.length);
    for (let i = 0; i < limit; i++) {
      const a = anchors[i];
      if (!a.visible) continue;
      const dx = a.currentWorld.x - a.originWorld.x;
      const dy = a.currentWorld.y - a.originWorld.y;
      const dz = a.currentWorld.z - a.originWorld.z;
      const len = Math.hypot(dx, dy, dz);
      if (len < 0.025) continue;

      const b6 = activeCount * 6;
      posArr[b6] = a.originWorld.x;
      posArr[b6 + 1] = a.originWorld.y;
      posArr[b6 + 2] = a.originWorld.z;
      posArr[b6 + 3] = a.currentWorld.x;
      posArr[b6 + 4] = a.currentWorld.y;
      posArr[b6 + 5] = a.currentWorld.z;

      const b2 = activeCount * 2;
      distArr[b2] = 0;
      distArr[b2 + 1] = len;

      // Bore cross-tick at original mounting socket
      const b12 = activeCount * 12;
      const s = 0.018;
      tickPosArr[b12] = a.originWorld.x - s;
      tickPosArr[b12 + 1] = a.originWorld.y;
      tickPosArr[b12 + 2] = a.originWorld.z;
      tickPosArr[b12 + 3] = a.originWorld.x + s;
      tickPosArr[b12 + 4] = a.originWorld.y;
      tickPosArr[b12 + 5] = a.originWorld.z;

      tickPosArr[b12 + 6] = a.originWorld.x;
      tickPosArr[b12 + 7] = a.originWorld.y;
      tickPosArr[b12 + 8] = a.originWorld.z - s;
      tickPosArr[b12 + 9] = a.originWorld.x;
      tickPosArr[b12 + 10] = a.originWorld.y;
      tickPosArr[b12 + 11] = a.originWorld.z + s;

      activeCount++;
    }

    group.visible = activeCount > 0;
    if (activeCount > 0) {
      traceGeo.setDrawRange(0, activeCount * 2);
      traceGeo.attributes.position.needsUpdate = true;
      traceGeo.attributes.lineDistance.needsUpdate = true;

      tickGeo.setDrawRange(0, activeCount * 4);
      tickGeo.attributes.position.needsUpdate = true;
    }
  };

  const dispose = () => {
    traceGeo.dispose();
    traceMat.dispose();
    tickGeo.dispose();
    tickMat.dispose();
  };

  return { group, updateTraces, dispose };
}

export interface BlueprintDimensionRigController {
  group: THREE.Group;
  updateForBox: (box: THREE.Box3, visible: boolean, simTime: number) => {
    xLabelWorld: THREE.Vector3;
    yLabelWorld: THREE.Vector3;
    zLabelWorld: THREE.Vector3;
  };
  dispose: () => void;
}

/**
 * Builds a precision 3D CAD Engineering Blueprint Wireframe Rig (12 bounding box edges + X/Y/Z caliper extension ticks
 * + circular turntable blueprint reticle) using pure custom BufferGeometry LineSegments & LineLoops.
 */
export function createBlueprintDimensionRig(): BlueprintDimensionRigController {
  const group = new THREE.Group();
  group.name = 'cad_isolate_blueprint_rig';
  group.visible = false;

  // 12 bounding box edges + 6 caliper extension & dimension lines (18 segments = 36 vertices = 108 floats)
  const wirePos = new Float32Array(30 * 6);
  const wireGeo = new THREE.BufferGeometry();
  wireGeo.setAttribute('position', new THREE.BufferAttribute(wirePos, 3));
  wireGeo.setDrawRange(0, 0);

  const wireMat = new THREE.LineBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.9,
    depthWrite: false
  });
  const wireSegments = new THREE.LineSegments(wireGeo, wireMat);
  wireSegments.frustumCulled = false;
  group.add(wireSegments);

  // Caliper leader lines in amber gold for X / Y / Z principal dimensions
  const dimPos = new Float32Array(18 * 6);
  const dimGeo = new THREE.BufferGeometry();
  dimGeo.setAttribute('position', new THREE.BufferAttribute(dimPos, 3));
  dimGeo.setDrawRange(0, 0);
  const dimMat = new THREE.LineBasicMaterial({
    color: 0xfbbf24,
    transparent: true,
    opacity: 0.95,
    depthWrite: false
  });
  const dimSegments = new THREE.LineSegments(dimGeo, dimMat);
  dimSegments.frustumCulled = false;
  group.add(dimSegments);

  // Blueprint turntable degree ring beneath the isolated part
  const ringPts: THREE.Vector3[] = [];
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    ringPts.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
  }
  const baseRingGeo = new THREE.BufferGeometry().setFromPoints(ringPts);
  const baseRingMat = new THREE.LineBasicMaterial({
    color: 0x0ea5e9,
    transparent: true,
    opacity: 0.55,
    depthWrite: false
  });
  const baseRing = new THREE.LineLoop(baseRingGeo, baseRingMat);
  group.add(baseRing);

  const xLabelWorld = new THREE.Vector3();
  const yLabelWorld = new THREE.Vector3();
  const zLabelWorld = new THREE.Vector3();

  const pushSeg = (arr: Float32Array, segIdx: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number) => {
    const o = segIdx * 6;
    arr[o] = ax; arr[o + 1] = ay; arr[o + 2] = az;
    arr[o + 3] = bx; arr[o + 4] = by; arr[o + 5] = bz;
  };

  const updateForBox = (box: THREE.Box3, visible: boolean, simTime: number) => {
    group.visible = visible;
    if (!visible || box.isEmpty()) {
      return { xLabelWorld, yLabelWorld, zLabelWorld };
    }

    const pad = 0.015;
    const x0 = box.min.x - pad;
    const y0 = box.min.y - pad;
    const z0 = box.min.z - pad;
    const x1 = box.max.x + pad;
    const y1 = box.max.y + pad;
    const z1 = box.max.z + pad;

    // 12 edges of CAD bounding box
    let w = 0;
    pushSeg(wirePos, w++, x0, y0, z0, x1, y0, z0);
    pushSeg(wirePos, w++, x1, y0, z0, x1, y0, z1);
    pushSeg(wirePos, w++, x1, y0, z1, x0, y0, z1);
    pushSeg(wirePos, w++, x0, y0, z1, x0, y0, z0);

    pushSeg(wirePos, w++, x0, y1, z0, x1, y1, z0);
    pushSeg(wirePos, w++, x1, y1, z0, x1, y1, z1);
    pushSeg(wirePos, w++, x1, y1, z1, x0, y1, z1);
    pushSeg(wirePos, w++, x0, y1, z1, x0, y1, z0);

    pushSeg(wirePos, w++, x0, y0, z0, x0, y1, z0);
    pushSeg(wirePos, w++, x1, y0, z0, x1, y1, z0);
    pushSeg(wirePos, w++, x1, y0, z1, x1, y1, z1);
    pushSeg(wirePos, w++, x0, y0, z1, x0, y1, z1);
    wireGeo.setDrawRange(0, w * 2);
    wireGeo.attributes.position.needsUpdate = true;

    // 3 Principal Caliper Dimension Bars (X length, Y height, Z width) + witness extension lines
    const ext = Math.max(0.06, Math.max(x1 - x0, y1 - y0, z1 - z0) * 0.14);
    let d = 0;
    // X Dimension along front-bottom edge
    pushSeg(dimPos, d++, x0, y0, z1, x0, y0, z1 + ext);
    pushSeg(dimPos, d++, x1, y0, z1, x1, y0, z1 + ext);
    pushSeg(dimPos, d++, x0, y0, z1 + ext * 0.82, x1, y0, z1 + ext * 0.82);

    // Y Dimension along right-front vertical edge
    pushSeg(dimPos, d++, x1, y0, z1, x1 + ext, y0, z1);
    pushSeg(dimPos, d++, x1, y1, z1, x1 + ext, y1, z1);
    pushSeg(dimPos, d++, x1 + ext * 0.82, y0, z1, x1 + ext * 0.82, y1, z1);

    // Z Dimension along right-bottom lateral edge
    pushSeg(dimPos, d++, x1, y0, z0, x1 + ext * 0.75, y0 - ext * 0.35, z0);
    pushSeg(dimPos, d++, x1, y0, z1, x1 + ext * 0.75, y0 - ext * 0.35, z1);
    pushSeg(dimPos, d++, x1 + ext * 0.62, y0 - ext * 0.28, z0, x1 + ext * 0.62, y0 - ext * 0.28, z1);

    dimGeo.setDrawRange(0, d * 2);
    dimGeo.attributes.position.needsUpdate = true;

    const cx = 0.5 * (x0 + x1);
    const cz = 0.5 * (z0 + z1);
    const ringRad = Math.max(0.28, Math.hypot(x1 - x0, z1 - z0) * 0.68);
    baseRing.position.set(cx, y0 - 0.03, cz);
    baseRing.scale.set(ringRad, 1, ringRad);
    baseRing.rotation.y = simTime * 0.25;

    xLabelWorld.set(cx, y0, z1 + ext * 1.05);
    yLabelWorld.set(x1 + ext * 1.05, 0.5 * (y0 + y1), z1);
    zLabelWorld.set(x1 + ext * 0.82, y0 - ext * 0.32, cz);

    return { xLabelWorld, yLabelWorld, zLabelWorld };
  };

  const dispose = () => {
    wireGeo.dispose();
    wireMat.dispose();
    dimGeo.dispose();
    dimMat.dispose();
    baseRingGeo.dispose();
    baseRingMat.dispose();
  };

  return { group, updateForBox, dispose };
}
