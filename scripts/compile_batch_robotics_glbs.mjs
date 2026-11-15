import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';

const ASSETS_ROOT = '/home/muqiao/Videos/Studio/Embodied-Robotics-3D-Assets-20261109/github_repos';
const GLB_DIR = path.resolve('public/robotics_glb');
fs.mkdirSync(GLB_DIR, { recursive: true });

function parseStl(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf.length < 84) return { positions: new Float32Array(0), normals: new Float32Array(0), numTris: 0 };
  const headerStr = buf.subarray(0, Math.min(80, buf.length)).toString('ascii');
  const numTrisBin = buf.readUInt32LE(80);
  const expectedBinSize = 84 + numTrisBin * 50;

  // Binary STL check
  if (buf.length === expectedBinSize || (!headerStr.trimStart().startsWith('solid') && buf.length >= expectedBinSize)) {
    const positions = new Float32Array(numTrisBin * 9);
    const normals = new Float32Array(numTrisBin * 9);
    let offset = 84;
    for (let i = 0; i < numTrisBin; i++) {
      let nx = buf.readFloatLE(offset);
      let ny = buf.readFloatLE(offset + 4);
      let nz = buf.readFloatLE(offset + 8);
      const v1x = buf.readFloatLE(offset + 12), v1y = buf.readFloatLE(offset + 16), v1z = buf.readFloatLE(offset + 20);
      const v2x = buf.readFloatLE(offset + 24), v2y = buf.readFloatLE(offset + 28), v2z = buf.readFloatLE(offset + 32);
      const v3x = buf.readFloatLE(offset + 36), v3y = buf.readFloatLE(offset + 40), v3z = buf.readFloatLE(offset + 44);
      offset += 50;
      if (nx === 0 && ny === 0 && nz === 0) {
        const ax = v2x - v1x, ay = v2y - v1y, az = v2z - v1z;
        const bx = v3x - v1x, by = v3y - v1y, bz = v3z - v1z;
        nx = ay * bz - az * by;
        ny = az * bx - ax * bz;
        nz = ax * by - ay * bx;
        const len = Math.hypot(nx, ny, nz) || 1;
        nx /= len; ny /= len; nz /= len;
      }
      const b = i * 9;
      positions[b] = v1x; positions[b + 1] = v1y; positions[b + 2] = v1z;
      positions[b + 3] = v2x; positions[b + 4] = v2y; positions[b + 5] = v2z;
      positions[b + 6] = v3x; positions[b + 7] = v3y; positions[b + 8] = v3z;
      normals[b] = nx; normals[b + 1] = ny; normals[b + 2] = nz;
      normals[b + 3] = nx; normals[b + 4] = ny; normals[b + 5] = nz;
      normals[b + 6] = nx; normals[b + 7] = ny; normals[b + 8] = nz;
    }
    return { positions, normals, numTris: numTrisBin };
  }

  // ASCII STL fallback
  const text = buf.toString('utf8');
  const posList = [];
  const normList = [];
  const facetRe = /facet\s+normal\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)[\s\S]*?outer\s+loop\s+vertex\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+vertex\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+vertex\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)[\s\S]*?endfacet/g;
  let fm;
  while ((fm = facetRe.exec(text)) !== null) {
    let nx = Number(fm[1]), ny = Number(fm[2]), nz = Number(fm[3]);
    const v1x = Number(fm[4]), v1y = Number(fm[5]), v1z = Number(fm[6]);
    const v2x = Number(fm[7]), v2y = Number(fm[8]), v2z = Number(fm[9]);
    const v3x = Number(fm[10]), v3y = Number(fm[11]), v3z = Number(fm[12]);
    if (nx === 0 && ny === 0 && nz === 0) {
      const ax = v2x - v1x, ay = v2y - v1y, az = v2z - v1z;
      const bx = v3x - v1x, by = v3y - v1y, bz = v3z - v1z;
      nx = ay * bz - az * by;
      ny = az * bx - ax * bz;
      nz = ax * by - ay * bx;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
    }
    posList.push(v1x, v1y, v1z, v2x, v2y, v2z, v3x, v3y, v3z);
    normList.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
  }
  return {
    positions: new Float32Array(posList),
    normals: new Float32Array(normList),
    numTris: posList.length / 9
  };
}

function parseColladaDae(filePath, externalScale = 1.0) {
  const xml = fs.readFileSync(filePath, 'utf8');
  const unitMatch = xml.match(/<unit[^>]*meter="([^"]+)"/);
  const unitMeter = unitMatch ? parseFloat(unitMatch[1]) : 1.0;
  const totalScale = unitMeter * externalScale;

  const upAxisM = xml.match(/<up_axis>([^<]+)<\/up_axis>/);
  const upAxis = upAxisM ? upAxisM[1].trim() : 'Z_UP';

  const effectColors = new Map();
  const effectRe = /<effect\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/effect>/g;
  let em;
  while ((em = effectRe.exec(xml)) !== null) {
    const diffM = em[2].match(/<diffuse>[\s\S]*?<color[^>]*>([\s\S]*?)<\/color>[\s\S]*?<\/diffuse>/);
    if (diffM) {
      const nums = diffM[1].trim().split(/\s+/).map(Number);
      effectColors.set(em[1], [nums[0] ?? 0.75, nums[1] ?? 0.78, nums[2] ?? 0.82, 1.0]);
    }
  }
  const materialColors = new Map();
  const matRe = /<material\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/material>/g;
  let mm;
  while ((mm = matRe.exec(xml)) !== null) {
    const instM = mm[2].match(/<instance_effect\s+url="#([^"]+)"/);
    if (instM && effectColors.has(instM[1])) {
      materialColors.set(mm[1], effectColors.get(instM[1]));
    }
  }

  const geomMap = new Map();
  const geomRe = /<geometry\s+id="([^"]+)"(?:\s+name="([^"]*)")?[^>]*>([\s\S]*?)<\/geometry>/g;
  let gm;
  while ((gm = geomRe.exec(xml)) !== null) {
    const gid = gm[1];
    const gname = gm[2] || gid;
    const gbody = gm[3];

    const floatArrays = new Map();
    const faRe = /<float_array\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/float_array>/g;
    let fam;
    while ((fam = faRe.exec(gbody)) !== null) {
      const arr = fam[2].trim().split(/\s+/).map(Number);
      floatArrays.set(fam[1], arr);
    }

    const sources = new Map();
    const srcRe = /<source\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/source>/g;
    let sm;
    while ((sm = srcRe.exec(gbody)) !== null) {
      const accM = sm[2].match(/<accessor\s+source="#([^"]+)"[^>]*stride="(\d+)"/);
      if (accM) sources.set(sm[1], { arrayId: accM[1], stride: parseInt(accM[2], 10) });
    }

    const verticesPosSource = new Map();
    const vertRe = /<vertices\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/vertices>/g;
    let vm;
    while ((vm = vertRe.exec(gbody)) !== null) {
      const inpM = vm[2].match(/semantic="POSITION"\s+source="#([^"]+)"/);
      if (inpM) verticesPosSource.set(vm[1], inpM[1]);
    }

    const subMeshes = [];
    const primRe = /<(triangles|polylist)\b([^>]*)>([\s\S]*?)<\/\1>/g;
    let pm;
    while ((pm = primRe.exec(gbody)) !== null) {
      const tag = pm[1];
      const attrs = pm[2];
      const pbody = pm[3];
      const matM = attrs.match(/material="([^"]+)"/);
      const matName = matM ? matM[1] : null;
      const color = matName && materialColors.has(matName) ? materialColors.get(matName) : null;

      let posSourceId = null;
      let normSourceId = null;
      let posOffset = 0;
      let normOffset = -1;
      let maxOffset = 0;

      const inpRe = /<input\s+([^>]+)\/>/g;
      let im;
      while ((im = inpRe.exec(pbody)) !== null) {
        const iAttrs = im[1];
        const semM = iAttrs.match(/semantic="([^"]+)"/);
        const srcM = iAttrs.match(/source="#([^"]+)"/);
        const offM = iAttrs.match(/offset="(\d+)"/);
        if (!semM || !srcM || !offM) continue;
        const sem = semM[1];
        const src = srcM[1];
        const off = parseInt(offM[1], 10);
        if (off > maxOffset) maxOffset = off;
        if (sem === 'VERTEX') {
          posSourceId = verticesPosSource.get(src) || src;
          posOffset = off;
        } else if (sem === 'POSITION') {
          posSourceId = src;
          posOffset = off;
        } else if (sem === 'NORMAL') {
          normSourceId = src;
          normOffset = off;
        }
      }

      const posSrc = sources.get(posSourceId);
      const posArr = posSrc ? floatArrays.get(posSrc.arrayId) : null;
      if (!posArr) continue;
      const normSrc = normSourceId ? sources.get(normSourceId) : null;
      const normArr = normSrc ? floatArrays.get(normSrc.arrayId) : null;

      const pMatch = pbody.match(/<p>([\s\S]*?)<\/p>/);
      if (!pMatch) continue;
      const idxList = pMatch[1].trim().split(/\s+/).map(Number);
      const stride = maxOffset + 1;

      let vcountList = null;
      if (tag === 'polylist') {
        const vcMatch = pbody.match(/<vcount>([\s\S]*?)<\/vcount>/);
        if (vcMatch) vcountList = vcMatch[1].trim().split(/\s+/).map(Number);
      }

      const triPos = [];
      const triNorm = [];

      const pushVertex = (vIdx, nIdx) => {
        const pBase = vIdx * 3;
        triPos.push(posArr[pBase], posArr[pBase + 1], posArr[pBase + 2]);
        if (normArr && nIdx >= 0) {
          const nBase = nIdx * 3;
          triNorm.push(normArr[nBase], normArr[nBase + 1], normArr[nBase + 2]);
        } else {
          triNorm.push(0, 0, 1);
        }
      };

      if (tag === 'triangles') {
        for (let i = 0; i + 3 * stride <= idxList.length; i += 3 * stride) {
          for (let k = 0; k < 3; k++) {
            const vIdx = idxList[i + k * stride + posOffset];
            const nIdx = normOffset >= 0 ? idxList[i + k * stride + normOffset] : -1;
            pushVertex(vIdx, nIdx);
          }
        }
      } else if (vcountList) {
        let cursor = 0;
        for (const vc of vcountList) {
          if (vc < 3) { cursor += vc * stride; continue; }
          const v0 = idxList[cursor + posOffset];
          const n0 = normOffset >= 0 ? idxList[cursor + normOffset] : -1;
          for (let k = 1; k < vc - 1; k++) {
            const v1 = idxList[cursor + k * stride + posOffset];
            const n1 = normOffset >= 0 ? idxList[cursor + k * stride + normOffset] : -1;
            const v2 = idxList[cursor + (k + 1) * stride + posOffset];
            const n2 = normOffset >= 0 ? idxList[cursor + (k + 1) * stride + normOffset] : -1;
            pushVertex(v0, n0);
            pushVertex(v1, n1);
            pushVertex(v2, n2);
          }
          cursor += vc * stride;
        }
      }

      if (triPos.length >= 9) {
        const positions = new Float32Array(triPos);
        const normals = new Float32Array(triNorm);
        // Recompute face normals if missing
        if (!normArr) {
          for (let i = 0; i < positions.length; i += 9) {
            const ax = positions[i + 3] - positions[i], ay = positions[i + 4] - positions[i + 1], az = positions[i + 5] - positions[i + 2];
            const bx = positions[i + 6] - positions[i], by = positions[i + 7] - positions[i + 1], bz = positions[i + 8] - positions[i + 2];
            let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
            const len = Math.hypot(nx, ny, nz) || 1;
            nx /= len; ny /= len; nz /= len;
            for (let k = 0; k < 9; k += 3) {
              normals[i + k] = nx; normals[i + k + 1] = ny; normals[i + k + 2] = nz;
            }
          }
        }
        subMeshes.push({ positions, normals, numTris: positions.length / 9, color, name: gname });
      }
    }
    if (subMeshes.length > 0) geomMap.set(gid, subMeshes);
  }

  const instances = [];
  const vsRe = /<visual_scene\b[^>]*>([\s\S]*?)<\/visual_scene>/g;
  let vsm;
  while ((vsm = vsRe.exec(xml)) !== null) {
    const vsBody = vsm[1];
    const stack = [new THREE.Matrix4()];
    const tokRe = /<\/node\s*>|<node\b[^>]*>|<(matrix|translate|rotate|scale)\b[^>]*>([\s\S]*?)<\/\1>|<instance_geometry\b([^>]*)(?:\/>|>[\s\S]*?<\/instance_geometry>)/g;
    let tm;
    while ((tm = tokRe.exec(vsBody)) !== null) {
      const full = tm[0];
      if (full.startsWith('</node')) {
        if (stack.length > 1) stack.pop();
      } else if (full.startsWith('<node')) {
        stack.push(stack[stack.length - 1].clone());
      } else if (tm[1]) {
        const tag = tm[1];
        const nums = tm[2].trim().split(/\s+/).map(Number);
        const cur = stack[stack.length - 1];
        if (tag === 'matrix' && nums.length >= 16) {
          const m4 = new THREE.Matrix4().set(
            nums[0], nums[1], nums[2], nums[3],
            nums[4], nums[5], nums[6], nums[7],
            nums[8], nums[9], nums[10], nums[11],
            nums[12], nums[13], nums[14], nums[15]
          );
          cur.multiply(m4);
        } else if (tag === 'translate' && nums.length >= 3) {
          cur.multiply(new THREE.Matrix4().makeTranslation(nums[0], nums[1], nums[2]));
        } else if (tag === 'rotate' && nums.length >= 4) {
          const axis = new THREE.Vector3(nums[0], nums[1], nums[2]).normalize();
          cur.multiply(new THREE.Matrix4().makeRotationAxis(axis, (nums[3] * Math.PI) / 180));
        } else if (tag === 'scale' && nums.length >= 3) {
          cur.multiply(new THREE.Matrix4().makeScale(nums[0], nums[1], nums[2]));
        }
      } else if (tm[3]) {
        const urlM = tm[3].match(/url="#([^"]+)"/);
        if (urlM) {
          instances.push({ geomId: urlM[1], mat: stack[stack.length - 1].clone() });
        }
      }
    }
  }

  const allParts = [];
  const baseScaleMat = new THREE.Matrix4().makeScale(totalScale, totalScale, totalScale);
  const upRotMat = upAxis === 'Y_UP' ? new THREE.Matrix4().makeRotationX(Math.PI / 2) : null;
  const entries = instances.length > 0
    ? instances
    : Array.from(geomMap.keys()).map((geomId) => ({ geomId, mat: new THREE.Matrix4() }));

  for (const inst of entries) {
    const parts = geomMap.get(inst.geomId);
    if (!parts) continue;
    const finalMat = new THREE.Matrix4().copy(baseScaleMat).multiply(inst.mat);
    if (upRotMat) finalMat.premultiply(upRotMat);
    for (const p of parts) {
      allParts.push({ ...applyMatrix4ToGeometry(p, finalMat), color: p.color, name: p.name });
    }
  }
  return allParts;
}

function applyMatrix4ToGeometry(geom, mat4) {
  const { positions, normals, numTris } = geom;
  const outPos = new Float32Array(positions.length);
  const outNorm = new Float32Array(normals.length);
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(mat4);
  for (let i = 0; i < positions.length; i += 3) {
    v.set(positions[i], positions[i + 1], positions[i + 2]).applyMatrix4(mat4);
    outPos[i] = v.x; outPos[i + 1] = v.y; outPos[i + 2] = v.z;
    n.set(normals[i], normals[i + 1], normals[i + 2]).applyMatrix3(normalMatrix).normalize();
    outNorm[i] = n.x; outNorm[i + 1] = n.y; outNorm[i + 2] = n.z;
  }
  if (mat4.determinant() < 0) {
    for (let i = 0; i < outPos.length; i += 9) {
      for (let k = 0; k < 3; k++) {
        const tp = outPos[i + 3 + k]; outPos[i + 3 + k] = outPos[i + 6 + k]; outPos[i + 6 + k] = tp;
        const tn = outNorm[i + 3 + k]; outNorm[i + 3 + k] = outNorm[i + 6 + k]; outNorm[i + 6 + k] = tn;
      }
    }
  }
  return { positions: outPos, normals: outNorm, numTris };
}

function mergeGeometriesList(geoms) {
  const totalTris = geoms.reduce((s, g) => s + g.numTris, 0);
  const positions = new Float32Array(totalTris * 9);
  const normals = new Float32Array(totalTris * 9);
  let offset = 0;
  for (const g of geoms) {
    positions.set(g.positions, offset);
    normals.set(g.normals, offset);
    offset += g.positions.length;
  }
  return { positions, normals, numTris: totalTris };
}

function weldGeometryToIndexed(positions, normals) {
  const vertCount = positions.length / 3;
  const vertexMap = new Map();
  const uniquePos = [];
  const uniqueNorm = [];
  const indices = new Uint32Array(vertCount);
  let nextIdx = 0;
  for (let i = 0; i < vertCount; i++) {
    const b = i * 3;
    const x = positions[b], y = positions[b + 1], z = positions[b + 2];
    const nx = normals[b], ny = normals[b + 1], nz = normals[b + 2];
    const key = `${Math.round(x * 1e5)},${Math.round(y * 1e5)},${Math.round(z * 1e5)},${Math.round(nx * 1e3)},${Math.round(ny * 1e3)},${Math.round(nz * 1e3)}`;
    let idx = vertexMap.get(key);
    if (idx === undefined) {
      idx = nextIdx++;
      vertexMap.set(key, idx);
      uniquePos.push(x, y, z);
      uniqueNorm.push(nx, ny, nz);
    }
    indices[i] = idx;
  }
  const useU16 = nextIdx <= 65535;
  return {
    positions: new Float32Array(uniquePos),
    normals: new Float32Array(uniqueNorm),
    indices: useU16 ? new Uint16Array(indices) : indices,
    componentType: useU16 ? 5123 : 5125
  };
}

function writeIndexedBinaryGlb(outputPath, nodesDef, rootNodeIndices) {
  const accessors = [];
  const bufferViews = [];
  const meshes = [];
  const materials = [];
  const materialCache = new Map();
  const binChunks = [];
  let byteOffset = 0;

  function align4() {
    const rem = byteOffset % 4;
    if (rem > 0) {
      const pad = Buffer.alloc(4 - rem, 0);
      binChunks.push(pad);
      byteOffset += pad.byteLength;
    }
  }

  function addFloat32Attr(floatArr) {
    align4();
    const vertCount = floatArr.length / 3;
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < floatArr.length; i += 3) {
      const x = floatArr[i], y = floatArr[i + 1], z = floatArr[i + 2];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    const b = Buffer.from(floatArr.buffer, floatArr.byteOffset, floatArr.byteLength);
    binChunks.push(b);
    const bvIdx = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: b.byteLength, target: 34962 });
    byteOffset += b.byteLength;
    const accIdx = accessors.length;
    accessors.push({ bufferView: bvIdx, byteOffset: 0, componentType: 5126, count: vertCount, type: 'VEC3', min: [minX, minY, minZ], max: [maxX, maxY, maxZ] });
    return accIdx;
  }

  function addIdxAttr(idxArr, componentType) {
    align4();
    const b = Buffer.from(idxArr.buffer, idxArr.byteOffset, idxArr.byteLength);
    binChunks.push(b);
    const bvIdx = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: b.byteLength, target: 34963 });
    byteOffset += b.byteLength;
    const accIdx = accessors.length;
    accessors.push({ bufferView: bvIdx, byteOffset: 0, componentType, count: idxArr.length, type: 'SCALAR' });
    return accIdx;
  }

  function getMat(color, metallic, roughness) {
    const key = `${color.join(',')}_${metallic}_${roughness}`;
    if (materialCache.has(key)) return materialCache.get(key);
    const idx = materials.length;
    materials.push({ pbrMetallicRoughness: { baseColorFactor: color, metallicFactor: metallic, roughnessFactor: roughness }, doubleSided: true });
    materialCache.set(key, idx);
    return idx;
  }

  const nodes = nodesDef.map((nd) => {
    const nodeObj = { name: nd.name };
    if (nd.translation) nodeObj.translation = nd.translation;
    if (nd.rotation) nodeObj.rotation = nd.rotation;
    if (nd.scale) nodeObj.scale = nd.scale;
    if (nd.children && nd.children.length > 0) nodeObj.children = nd.children;
    if (nd.geometry && nd.geometry.numTris > 0) {
      const welded = weldGeometryToIndexed(nd.geometry.positions, nd.geometry.normals);
      const posAcc = addFloat32Attr(welded.positions);
      const normAcc = addFloat32Attr(welded.normals);
      const idxAcc = addIdxAttr(welded.indices, welded.componentType);
      const matIdx = getMat(nd.color || [0.78, 0.82, 0.88, 1.0], nd.metallic ?? 0.5, nd.roughness ?? 0.35);
      const meshIdx = meshes.length;
      meshes.push({ name: nd.name, primitives: [{ attributes: { POSITION: posAcc, NORMAL: normAcc }, indices: idxAcc, material: matIdx }] });
      nodeObj.mesh = meshIdx;
    }
    return nodeObj;
  });

  align4();
  const gltf = {
    asset: { version: '2.0', generator: 'MegaHangar-Batch-Robotics-Compiler' },
    scene: 0,
    scenes: [{ nodes: rootNodeIndices }],
    nodes, meshes, materials, accessors, bufferViews,
    buffers: [{ byteLength: byteOffset }]
  };

  const jsonBuffer = Buffer.from(JSON.stringify(gltf), 'utf8');
  const jsonPad = (4 - (jsonBuffer.length % 4)) % 4;
  const jsonPadded = jsonPad > 0 ? Buffer.concat([jsonBuffer, Buffer.alloc(jsonPad, 0x20)]) : jsonBuffer;
  const binBuffer = Buffer.concat(binChunks);

  const totalLength = 12 + 8 + jsonPadded.length + 8 + binBuffer.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546C67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);
  const jsonChunkHeader = Buffer.alloc(8);
  jsonChunkHeader.writeUInt32LE(jsonPadded.length, 0);
  jsonChunkHeader.writeUInt32LE(0x4E4F534A, 4);
  const binChunkHeader = Buffer.alloc(8);
  binChunkHeader.writeUInt32LE(binBuffer.length, 0);
  binChunkHeader.writeUInt32LE(0x004E4942, 4);

  fs.writeFileSync(outputPath, Buffer.concat([header, jsonChunkHeader, jsonPadded, binChunkHeader, binBuffer]));
}

function rpyToQuatArray(rpy) {
  const e = new THREE.Euler(rpy[0] || 0, rpy[1] || 0, rpy[2] || 0, 'ZYX');
  const q = new THREE.Quaternion().setFromEuler(e);
  return [q.x, q.y, q.z, q.w];
}

function rpyXyzScaleToMatrix4(xyz, rpy, scale) {
  const pos = new THREE.Vector3(xyz[0] || 0, xyz[1] || 0, xyz[2] || 0);
  const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(rpy[0] || 0, rpy[1] || 0, rpy[2] || 0, 'ZYX'));
  const scl = new THREE.Vector3(scale[0] ?? 1, scale[1] ?? 1, scale[2] ?? 1);
  return new THREE.Matrix4().compose(pos, quat, scl);
}

function parseUrdfXml(xml) {
  const links = new Map();
  const joints = [];
  const linkRe = /<link\s+name="([^"]+)"(?:\s*\/>|>([\s\S]*?)<\/link>)/g;
  let m;
  while ((m = linkRe.exec(xml)) !== null) {
    const name = m[1];
    const body = m[2] || '';
    const visuals = [];
    const visRe = /<visual[^>]*>([\s\S]*?)<\/visual>/g;
    let vm;
    while ((vm = visRe.exec(body)) !== null) {
      const vbody = vm[1];
      const origM = vbody.match(/<origin\s+([^>]+)\/>/);
      let xyz = [0, 0, 0], rpy = [0, 0, 0], scale = [1, 1, 1];
      if (origM) {
        const xm = origM[1].match(/xyz="([^"]+)"/);
        const rm = origM[1].match(/rpy="([^"]+)"/);
        if (xm) xyz = xm[1].trim().split(/\s+/).map(Number);
        if (rm) rpy = rm[1].trim().split(/\s+/).map(Number);
      }
      const meshM = vbody.match(/<mesh\s+([^>]+?)(?:\/>|>)/);
      if (meshM) {
        const fm = meshM[1].match(/filename="([^"]+)"/);
        const sm = meshM[1].match(/scale="([^"]+)"/);
        if (sm) scale = sm[1].trim().split(/\s+/).map(Number);
        const colM = vbody.match(/<color\s+rgba="([^"]+)"/);
        if (fm) {
          visuals.push({
            filename: fm[1],
            xyz,
            rpy,
            scale,
            rgba: colM ? colM[1].trim().split(/\s+/).map(Number) : null
          });
        }
      }
    }
    links.set(name, { name, visuals });
  }

  const jointRe = /<joint\s+name="([^"]+)"\s+type="([^"]+)"[^>]*>([\s\S]*?)<\/joint>/g;
  while ((m = jointRe.exec(xml)) !== null) {
    const name = m[1], type = m[2], body = m[3];
    const pM = body.match(/<parent\s+link="([^"]+)"/);
    const cM = body.match(/<child\s+link="([^"]+)"/);
    const oM = body.match(/<origin\s+([^>]+)\/>/);
    let xyz = [0, 0, 0], rpy = [0, 0, 0];
    if (oM) {
      const xm = oM[1].match(/xyz="([^"]+)"/);
      const rm = oM[1].match(/rpy="([^"]+)"/);
      if (xm) xyz = xm[1].trim().split(/\s+/).map(Number);
      if (rm) rpy = rm[1].trim().split(/\s+/).map(Number);
    }
    if (pM && cM) joints.push({ name, type, parent: pM[1], child: cM[1], xyz, rpy });
  }
  return { links, joints };
}

function resolveMeshFile(urdfPath, pkgRoots, filename) {
  let rel = filename;
  if (rel.startsWith('package://')) {
    rel = rel.replace(/^package:\/\/[^/]+\//, '');
    for (const root of pkgRoots) {
      const cand = path.join(root, rel);
      if (fs.existsSync(cand)) return cand;
    }
  } else {
    const cand = path.resolve(path.dirname(urdfPath), rel);
    if (fs.existsSync(cand)) return cand;
  }
  // Fallback: search by basename in pkgRoots
  const base = path.basename(rel);
  for (const root of pkgRoots) {
    const stack = [root];
    while (stack.length > 0) {
      const dir = stack.pop();
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory() && ent.name !== '.git') stack.push(full);
        else if (ent.isFile() && ent.name.toLowerCase() === base.toLowerCase()) return full;
      }
    }
  }
  return null;
}

function compileRobot(spec) {
  const urdfPath = path.join(ASSETS_ROOT, spec.urdfRel);
  const pkgRoots = spec.pkgRoots.map((r) => path.join(ASSETS_ROOT, r));
  const outPath = path.join(GLB_DIR, spec.outFile);

  const urdfXml = fs.readFileSync(urdfPath, 'utf8');
  const { links, joints } = parseUrdfXml(urdfXml);

  const childToJoint = new Map();
  const parentToChildren = new Map();
  for (const j of joints) {
    childToJoint.set(j.child, j);
    if (!parentToChildren.has(j.parent)) parentToChildren.set(j.parent, []);
    parentToChildren.get(j.parent).push(j.child);
  }
  const rootLinks = [...links.keys()].filter((l) => !childToJoint.has(l));

  const nodesDef = [{
    name: 'urdf_yup_root',
    rotation: [-Math.SQRT1_2, 0, 0, Math.SQRT1_2],
    children: []
  }];

  let totalTris = 0;
  let totalParts = 0;

  function buildLinkNode(linkName) {
    const link = links.get(linkName);
    const joint = childToJoint.get(linkName);
    const nodeIdx = nodesDef.length;
    const nodeEntry = {
      name: linkName.replace(/^\//, ''),
      translation: joint ? joint.xyz : [0, 0, 0],
      rotation: joint ? rpyToQuatArray(joint.rpy) : [0, 0, 0, 1],
      children: []
    };
    nodesDef.push(nodeEntry);

    if (link && link.visuals.length > 0) {
      for (let vIdx = 0; vIdx < link.visuals.length; vIdx++) {
        const vis = link.visuals[vIdx];
        const meshFile = resolveMeshFile(urdfPath, pkgRoots, vis.filename);
        if (!meshFile) continue;

        const ext = path.extname(meshFile).toLowerCase();
        let geom = null;
        let daeColor = null;
        if (ext === '.stl') {
          geom = parseStl(meshFile);
        } else if (ext === '.dae') {
          const parts = parseColladaDae(meshFile, 1.0);
          if (parts.length > 0) {
            geom = mergeGeometriesList(parts);
            daeColor = parts.find((p) => p.color)?.color || null;
          }
        }
        if (!geom || geom.numTris === 0) continue;

        const visMat = rpyXyzScaleToMatrix4(vis.xyz, vis.rpy, vis.scale);
        geom = applyMatrix4ToGeometry(geom, visMat);
        totalTris += geom.numTris;
        totalParts++;

        const color = vis.rgba || daeColor || spec.defaultColor || [0.76, 0.80, 0.86, 1.0];
        if (link.visuals.length === 1) {
          nodeEntry.geometry = geom;
          nodeEntry.color = color;
          nodeEntry.metallic = 0.52;
          nodeEntry.roughness = 0.36;
        } else {
          const cIdx = nodesDef.length;
          nodesDef.push({
            name: `${nodeEntry.name}_${vIdx}`,
            geometry: geom,
            color,
            metallic: 0.52,
            roughness: 0.36
          });
          nodeEntry.children.push(cIdx);
        }
      }
    }

    for (const cLink of (parentToChildren.get(linkName) || [])) {
      nodeEntry.children.push(buildLinkNode(cLink));
    }
    if (nodeEntry.children.length === 0) delete nodeEntry.children;
    return nodeIdx;
  }

  for (const r of rootLinks) {
    nodesDef[0].children.push(buildLinkNode(r));
  }

  writeIndexedBinaryGlb(outPath, nodesDef, [0]);
  const sizeMB = (fs.statSync(outPath).size / 1048576).toFixed(2);
  console.log(`OK ${spec.outFile}: ${totalParts} parts, ${totalTris} tris, ${sizeMB} MB`);
}

const TARGETS = [
  {
    outFile: 'unitree_h1_humanoid.glb',
    urdfRel: 'unitree_ros/robots/h1_description/urdf/h1_with_hand.urdf',
    pkgRoots: ['unitree_ros/robots/h1_description'],
    defaultColor: [0.22, 0.25, 0.30, 1.0]
  },
  {
    outFile: 'unitree_b2_quadruped.glb',
    urdfRel: 'unitree_ros/robots/b2_description/urdf/b2_description.urdf',
    pkgRoots: ['unitree_ros/robots/b2_description'],
    defaultColor: [0.24, 0.27, 0.32, 1.0]
  },
  {
    outFile: 'fourier_gr1_humanoid.glb',
    urdfRel: 'Wiki-GRx-Models-FourierN1/GRX/GR1/gr1t2/basic_urdf/gr1t2.urdf',
    pkgRoots: ['Wiki-GRx-Models-FourierN1/GRX/GR1/gr1t2'],
    defaultColor: [0.78, 0.82, 0.87, 1.0]
  },
  {
    outFile: 'talos_full_humanoid.glb',
    urdfRel: 'talos-data/urdf/talos_full_v2.urdf',
    pkgRoots: ['talos-data'],
    defaultColor: [0.74, 0.78, 0.83, 1.0]
  },
  {
    outFile: 'cassie_biped_robot.glb',
    urdfRel: 'cassie_description/urdf/cassie_v4.urdf',
    pkgRoots: ['cassie_description'],
    defaultColor: [0.85, 0.45, 0.16, 1.0]
  },
  {
    outFile: 'anymal_c_quadruped.glb',
    urdfRel: 'anymal_c_simple_description/urdf/anymal.urdf',
    pkgRoots: ['anymal_c_simple_description'],
    defaultColor: [0.90, 0.62, 0.14, 1.0]
  },
  {
    outFile: 'baxter_dual_arm_robot.glb',
    urdfRel: 'baxter_common/baxter_description/urdf/baxter.urdf',
    pkgRoots: ['baxter_common/baxter_description'],
    defaultColor: [0.78, 0.20, 0.20, 1.0]
  },
  {
    outFile: 'hello_stretch_mobile_manipulator.glb',
    urdfRel: 'stretch_description/urdf/stretch.urdf',
    pkgRoots: ['stretch_description'],
    defaultColor: [0.78, 0.82, 0.88, 1.0]
  }
];

for (const t of TARGETS) {
  compileRobot(t);
}
