import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, draco } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { MeshoptSimplifier } from 'meshoptimizer';

await MeshoptSimplifier.ready;
const dracoDecoder = await draco3d.createDecoderModule();
const dracoEncoder = await draco3d.createEncoderModule();

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'draco3d.decoder': dracoDecoder,
    'draco3d.encoder': dracoEncoder
  });

/**
 * Welds flat STL/CAD triangle soup by spatial position + 42-degree crease normal clustering,
 * generating smooth normals on curved cylinders/fillets while preserving sharp 90-degree CAD edges.
 */
function weldAndCreaseSmoothPrimitive(posArray, idxArray, creaseCos = Math.cos((42 * Math.PI) / 180)) {
  const triCount = idxArray ? Math.floor(idxArray.length / 3) : Math.floor(posArray.length / 9);
  if (triCount === 0) return null;

  const getVertOffset = (cornerIdx) => (idxArray ? idxArray[cornerIdx] * 3 : cornerIdx * 3);

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < posArray.length; i += 3) {
    const x = posArray[i], y = posArray[i + 1], z = posArray[i + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  const diag = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) || 1.0;
  const invEps = 1.0 / Math.max(1e-7, diag * 2e-5);

  // 1. Compute area-weighted face normals and map position grid keys -> unique spatial positions
  const posKeyToId = new Map();
  const posCoords = [];
  const cornerPosIds = new Uint32Array(triCount * 3);
  const faceNormals = new Float32Array(triCount * 3);
  const faceWeightedNormals = new Float32Array(triCount * 3);

  for (let t = 0; t < triCount; t++) {
    for (let k = 0; k < 3; k++) {
      const off = getVertOffset(t * 3 + k);
      const x = posArray[off], y = posArray[off + 1], z = posArray[off + 2];
      const gx = Math.round((x - minX) * invEps);
      const gy = Math.round((y - minY) * invEps);
      const gz = Math.round((z - minZ) * invEps);
      const key = `${gx},${gy},${gz}`;
      let pid = posKeyToId.get(key);
      if (pid === undefined) {
        pid = posCoords.length / 3;
        posKeyToId.set(key, pid);
        posCoords.push(x, y, z);
      }
      cornerPosIds[t * 3 + k] = pid;
    }

    const p0 = cornerPosIds[t * 3] * 3;
    const p1 = cornerPosIds[t * 3 + 1] * 3;
    const p2 = cornerPosIds[t * 3 + 2] * 3;
    const ax = posCoords[p1] - posCoords[p0];
    const ay = posCoords[p1 + 1] - posCoords[p0 + 1];
    const az = posCoords[p1 + 2] - posCoords[p0 + 2];
    const bx = posCoords[p2] - posCoords[p0];
    const by = posCoords[p2 + 1] - posCoords[p0 + 1];
    const bz = posCoords[p2 + 2] - posCoords[p0 + 2];

    const cx = ay * bz - az * by;
    const cy = az * bx - ax * bz;
    const cz = ax * by - ay * bx;
    const doubleArea = Math.hypot(cx, cy, cz);

    faceWeightedNormals[t * 3] = cx;
    faceWeightedNormals[t * 3 + 1] = cy;
    faceWeightedNormals[t * 3 + 2] = cz;
    if (doubleArea > 1e-12) {
      faceNormals[t * 3] = cx / doubleArea;
      faceNormals[t * 3 + 1] = cy / doubleArea;
      faceNormals[t * 3 + 2] = cz / doubleArea;
    } else {
      faceNormals[t * 3 + 1] = 1.0;
    }
  }

  // 2. Cluster normals per unique spatial position by crease angle
  const uniquePosCount = posCoords.length / 3;
  const posGroups = new Array(uniquePosCount);
  const outPositions = [];
  const outNormals = [];
  const outIndices = new Uint32Array(triCount * 3);
  let validTris = 0;

  for (let t = 0; t < triCount; t++) {
    const id0 = cornerPosIds[t * 3];
    const id1 = cornerPosIds[t * 3 + 1];
    const id2 = cornerPosIds[t * 3 + 2];
    if (id0 === id1 || id1 === id2 || id2 === id0) continue; // Skip degenerate slivers

    const fnx = faceNormals[t * 3];
    const fny = faceNormals[t * 3 + 1];
    const fnz = faceNormals[t * 3 + 2];
    const wnx = faceWeightedNormals[t * 3];
    const wny = faceWeightedNormals[t * 3 + 1];
    const wnz = faceWeightedNormals[t * 3 + 2];

    for (let k = 0; k < 3; k++) {
      const pid = cornerPosIds[t * 3 + k];
      let groups = posGroups[pid];
      if (!groups) {
        groups = [];
        posGroups[pid] = groups;
      }

      let matchedGroup = null;
      for (let g = 0; g < groups.length; g++) {
        const grp = groups[g];
        const dot = grp.refNx * fnx + grp.refNy * fny + grp.refNz * fnz;
        if (dot >= creaseCos) {
          matchedGroup = grp;
          break;
        }
      }

      if (!matchedGroup) {
        const outIdx = outPositions.length / 3;
        outPositions.push(posCoords[pid * 3], posCoords[pid * 3 + 1], posCoords[pid * 3 + 2]);
        outNormals.push(0, 0, 0);
        matchedGroup = {
          outIdx,
          refNx: fnx,
          refNy: fny,
          refNz: fnz,
          sumNx: wnx,
          sumNy: wny,
          sumNz: wnz
        };
        groups.push(matchedGroup);
      } else {
        matchedGroup.sumNx += wnx;
        matchedGroup.sumNy += wny;
        matchedGroup.sumNz += wnz;
      }

      outIndices[validTris * 3 + k] = matchedGroup.outIdx;
    }
    validTris++;
  }

  // Normalize accumulated smooth normals per crease group
  for (let p = 0; p < uniquePosCount; p++) {
    const groups = posGroups[p];
    if (!groups) continue;
    for (const grp of groups) {
      const len = Math.hypot(grp.sumNx, grp.sumNy, grp.sumNz);
      const b = grp.outIdx * 3;
      if (len > 1e-12) {
        outNormals[b] = grp.sumNx / len;
        outNormals[b + 1] = grp.sumNy / len;
        outNormals[b + 2] = grp.sumNz / len;
      } else {
        outNormals[b] = grp.refNx;
        outNormals[b + 1] = grp.refNy;
        outNormals[b + 2] = grp.refNz;
      }
    }
  }

  return {
    positions: new Float32Array(outPositions),
    normals: new Float32Array(outNormals),
    indices: outIndices.subarray(0, validTris * 3)
  };
}

/**
 * Remasters untextured CAD robotics/turbofan GLBs:
 * 1) Crease-aware vertex welding (eliminating 3x duplicate vertices & planar subdivision bloat)
 * 2) Proportionate MeshoptSimplifier quadric decimation (preserving boundaries/seams with LockBorder)
 * 3) KHR_draco_mesh_compression encoding
 */
async function remasterCadGlb(filePath, maxTotalTris = 115000, maxPrimTris = 12000) {
  const beforeBytes = fs.statSync(filePath).size;
  const doc = await io.read(filePath);
  const root = doc.getRoot();

  // First pass: weld & inspect total triangle count across all meshes
  const primRecords = [];
  let rawTrisTotal = 0;
  let weldedTrisTotal = 0;

  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== 4) continue; // TRIANGLES only
      const posAcc = prim.getAttribute('POSITION');
      const uvAcc = prim.getAttribute('TEXCOORD_0');
      if (!posAcc || uvAcc) continue; // Do not alter textured UV primitives

      const posArr = posAcc.getArray();
      const idxAcc = prim.getIndices();
      const idxArr = idxAcc ? idxAcc.getArray() : null;
      const beforeTris = idxArr ? idxArr.length / 3 : posArr.length / 9;
      rawTrisTotal += beforeTris;

      const welded = weldAndCreaseSmoothPrimitive(posArr, idxArr);
      if (!welded || welded.indices.length < 3) continue;
      const wTris = welded.indices.length / 3;
      weldedTrisTotal += wTris;
      primRecords.push({ prim, welded, wTris });
    }
  }

  // Compute global decimation ratio if robot exceeds AAA hero budget
  const globalRatio = weldedTrisTotal > maxTotalTris ? maxTotalTris / weldedTrisTotal : 1.0;
  let finalTrisTotal = 0;

  const buffer = root.listBuffers()[0] || doc.createBuffer();

  for (const rec of primRecords) {
    const { prim, welded, wTris } = rec;
    let indices = new Uint32Array(welded.indices);

    const targetTris = Math.min(maxPrimTris, Math.max(240, Math.floor(wTris * globalRatio)));
    if (wTris > 450 && targetTris < wTris * 0.94) {
      const targetIndexCount = Math.floor(targetTris) * 3;
      const [simplifiedIdx] = MeshoptSimplifier.simplify(
        indices,
        welded.positions,
        3,
        targetIndexCount,
        0.008,
        ['LockBorder']
      );
      if (simplifiedIdx.length >= 12) {
        indices = simplifiedIdx;
      }
    }

    // Compact vertex buffers to only vertices still referenced after simplification
    const remap = new Int32Array(welded.positions.length / 3).fill(-1);
    const compactPos = [];
    const compactNorm = [];
    const compactIdx = new Uint32Array(indices.length);
    let nextV = 0;
    for (let i = 0; i < indices.length; i++) {
      const oldV = indices[i];
      let nv = remap[oldV];
      if (nv === -1) {
        nv = nextV++;
        remap[oldV] = nv;
        compactPos.push(
          welded.positions[oldV * 3],
          welded.positions[oldV * 3 + 1],
          welded.positions[oldV * 3 + 2]
        );
        compactNorm.push(
          welded.normals[oldV * 3],
          welded.normals[oldV * 3 + 1],
          welded.normals[oldV * 3 + 2]
        );
      }
      compactIdx[i] = nv;
    }

    const oldPos = prim.getAttribute('POSITION');
    const oldNorm = prim.getAttribute('NORMAL');
    const oldIdx = prim.getIndices();

    const newPosAcc = doc
      .createAccessor()
      .setType('VEC3')
      .setArray(new Float32Array(compactPos))
      .setBuffer(buffer);
    const newNormAcc = doc
      .createAccessor()
      .setType('VEC3')
      .setArray(new Float32Array(compactNorm))
      .setBuffer(buffer);
    const newIdxAcc = doc
      .createAccessor()
      .setType('SCALAR')
      .setArray(nextV <= 65535 ? new Uint16Array(compactIdx) : compactIdx)
      .setBuffer(buffer);

    prim.setAttribute('POSITION', newPosAcc);
    prim.setAttribute('NORMAL', newNormAcc);
    prim.setIndices(newIdxAcc);

    if (oldPos) oldPos.dispose();
    if (oldNorm) oldNorm.dispose();
    if (oldIdx) oldIdx.dispose();

    finalTrisTotal += compactIdx.length / 3;
  }

  await doc.transform(
    prune({ keepAttributes: true, keepIndices: true, keepLeaves: true }),
    dedup(),
    draco({
      method: 'edgebreaker',
      quantizePosition: 14,
      quantizeNormal: 10
    })
  );

  await io.write(filePath, doc);
  const afterBytes = fs.statSync(filePath).size;
  console.log(
    `[CAD Remaster] ${path.basename(filePath)}: ${(beforeBytes / 1048576).toFixed(2)}MB -> ${(afterBytes / 1048576).toFixed(2)}MB | tris ${rawTrisTotal.toLocaleString()} -> ${finalTrisTotal.toLocaleString()}`
  );
}

/**
 * Deduplicates & prunes unreferenced nodes/meshes/textures from split multi-tier GLBs
 * (Mars 2020 Perseverance L1 / L2 / L3) while preserving exact node names, skins, and PBR WebP textures.
 */
async function pruneSplitTwinGlb(filePath) {
  const beforeBytes = fs.statSync(filePath).size;
  const doc = await io.read(filePath);
  const texBefore = doc.getRoot().listTextures().length;

  await doc.transform(
    prune({ keepAttributes: true, keepIndices: true, keepLeaves: true }),
    dedup(),
    draco({
      method: 'edgebreaker',
      quantizePosition: 14,
      quantizeNormal: 10,
      quantizeTexcoord: 12
    })
  );

  const texAfter = doc.getRoot().listTextures().length;
  await io.write(filePath, doc);
  const afterBytes = fs.statSync(filePath).size;
  console.log(
    `[Twin Prune]   ${path.basename(filePath)}: ${(beforeBytes / 1048576).toFixed(2)}MB -> ${(afterBytes / 1048576).toFixed(2)}MB | textures ${texBefore} -> ${texAfter}`
  );
}

async function main() {
  const roboticsDir = path.resolve('public/robotics_glb');
  const roboticsFiles = fs
    .readdirSync(roboticsDir)
    .filter((f) => f.endsWith('.glb'))
    .sort();

  for (const f of roboticsFiles) {
    await remasterCadGlb(path.join(roboticsDir, f), 115000, 12000);
  }

  const cfmFiles = [
    'public/twins/models/L1_nacelle_casings.glb',
    'public/twins/models/L2_turbofan_core.glb',
    'public/twins/models/L3_hpt_combustor.glb'
  ];
  for (const rel of cfmFiles) {
    await remasterCadGlb(path.resolve(rel), 95000, 28000);
  }

  const marsFiles = [
    'public/twins/models/L1_mobility_rocker_bogie.glb',
    'public/twins/models/L2_turret_mast_robotics.glb',
    'public/twins/models/L3_chassis_mmrtg_lab.glb'
  ];
  for (const rel of marsFiles) {
    await pruneSplitTwinGlb(path.resolve(rel));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
