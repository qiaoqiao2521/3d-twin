import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { MeshoptSimplifier } from 'meshoptimizer';

const GLB_MAGIC_LE = 0x46546c67; // ASCII 'glTF' in little-endian
const WASM_MAGIC_LE = 0x6d736100; // '\0asm' in little-endian
const MAX_GLB_BUFFER_CACHE_ENTRIES = 8;
const MAX_TEXT_CACHE_ENTRIES = 48;

const glbArrayBufferCache = new Map<string, ArrayBuffer>();
const inflightGlbPromises = new Map<string, Promise<ArrayBuffer>>();
const textAssetCache = new Map<string, string>();
const inflightTextPromises = new Map<string, Promise<string>>();

let sharedDracoLoader: DRACOLoader | null = null;
let dracoAssetsWarmupPromise: Promise<void> | null = null;
let meshoptReadyPromise: Promise<void> | null = null;

const cachedLodGeometries = new WeakMap<
  THREE.BufferGeometry,
  { lod1: THREE.BufferGeometry; lod2: THREE.BufferGeometry }
>();

/**
 * Validates that an ArrayBuffer starts with the binary glTF v2 header ('glTF', version 2)
 * and has non-truncated length, preventing proxy warmup HTML pages from being parsed or cached.
 */
export function isValidGlbMagicBytes(buffer: ArrayBuffer | null | undefined): boolean {
  if (!buffer || buffer.byteLength < 20) return false;
  const view = new DataView(buffer);
  const magic = view.getUint32(0, true);
  const version = view.getUint32(4, true);
  const declaredLen = view.getUint32(8, true);
  return magic === GLB_MAGIC_LE && version === 2 && declaredLen <= buffer.byteLength && declaredLen >= 20;
}

/**
 * Inspects the JSON header chunk of a binary .glb buffer to check whether
 * KHR_draco_mesh_compression is referenced.
 */
export function bufferContainsDracoExtension(buffer: ArrayBuffer): boolean {
  if (!isValidGlbMagicBytes(buffer)) return false;
  const view = new DataView(buffer);
  const jsonChunkLen = view.getUint32(12, true);
  const jsonChunkType = view.getUint32(16, true);
  // 0x4E4F534A === 'JSON'
  if (jsonChunkType !== 0x4e4f534a || 20 + jsonChunkLen > buffer.byteLength) {
    return false;
  }
  const jsonBytes = new Uint8Array(buffer, 20, jsonChunkLen);
  const decoder = new TextDecoder('utf-8');
  const jsonText = decoder.decode(jsonBytes);
  return jsonText.includes('KHR_draco_mesh_compression');
}

/**
 * Validates WebAssembly binary magic bytes ('\0asm').
 */
export function isValidWasmMagicBytes(buffer: ArrayBuffer | null | undefined): boolean {
  if (!buffer || buffer.byteLength < 8) return false;
  const view = new DataView(buffer);
  return view.getUint32(0, true) === WASM_MAGIC_LE;
}

/**
 * Ensures text assets (.urdf, .xacro, draco_wasm_wrapper.js) are genuine payloads
 * and not an intercepted HTML warmup / error page.
 */
export function isValidTextAssetPayload(text: string, allowEmpty = false): boolean {
  if (!text) return allowEmpty;
  const trimmed = text.trimStart().slice(0, 96).toLowerCase();
  if (trimmed.startsWith('<!doctype html') || trimmed.startsWith('<html')) {
    return false;
  }
  return true;
}

/**
 * Normalizes a public asset URL against BASE_URL and encodes non-ASCII segments safely
 * without double-encoding existing %XX sequences.
 */
export function resolvePublicAssetUrl(rawUrl: string, baseUrl = '/'): string {
  if (!rawUrl) return '/';
  if (/^(https?:|blob:|data:)/i.test(rawUrl)) return rawUrl;

  let decoded = rawUrl;
  try {
    decoded = decodeURI(rawUrl);
  } catch {
    decoded = rawUrl;
  }

  const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const withLeadingSlash = decoded.startsWith('/') ? decoded : `/${decoded}`;
  return encodeURI(`${cleanBase}${withLeadingSlash}`);
}

/**
 * Computes bounded exponential retry backoff delay in milliseconds.
 */
export function computeRetryDelayMs(attemptIndex: number, baseMs = 300, maxMs = 2600): number {
  const safeAttempt = Math.max(0, Math.min(8, Math.floor(attemptIndex)));
  return Math.min(maxMs, baseMs * Math.pow(2, safeAttempt));
}

function sleepMs(ms: Promise<void> extends never ? number : number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function putBoundedMap<K, V>(map: Map<K, V>, key: K, value: V, maxEntries: number): void {
  if (map.has(key)) {
    map.delete(key);
  } else if (map.size >= maxEntries) {
    const oldestKey = map.keys().next().value;
    if (oldestKey !== undefined) {
      map.delete(oldestKey);
    }
  }
  map.set(key, value);
}

function xhrFetchArrayBuffer(url: string, timeoutMs = 45000): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    if (typeof XMLHttpRequest === 'undefined') {
      reject(new Error('XMLHttpRequest unavailable in current environment'));
      return;
    }
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.withCredentials = true;
    xhr.timeout = timeoutMs;
    xhr.onload = () => {
      if ((xhr.status >= 200 && xhr.status < 300) || xhr.status === 0) {
        if (xhr.response instanceof ArrayBuffer && xhr.response.byteLength > 0) {
          resolve(xhr.response);
        } else {
          reject(new Error(`Empty XHR ArrayBuffer response for ${url}`));
        }
      } else {
        reject(new Error(`XHR HTTP ${xhr.status} for ${url}`));
      }
    };
    xhr.onerror = () => reject(new Error(`XHR network error for ${url}`));
    xhr.ontimeout = () => reject(new Error(`XHR timeout (${timeoutMs}ms) for ${url}`));
    xhr.onabort = () => reject(new Error(`XHR aborted for ${url}`));
    xhr.send();
  });
}

function xhrFetchText(url: string, timeoutMs = 25000): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof XMLHttpRequest === 'undefined') {
      reject(new Error('XMLHttpRequest unavailable in current environment'));
      return;
    }
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'text';
    xhr.withCredentials = true;
    xhr.timeout = timeoutMs;
    xhr.onload = () => {
      if ((xhr.status >= 200 && xhr.status < 300) || xhr.status === 0) {
        resolve(typeof xhr.responseText === 'string' ? xhr.responseText : '');
      } else {
        reject(new Error(`XHR HTTP ${xhr.status} for ${url}`));
      }
    };
    xhr.onerror = () => reject(new Error(`XHR network error for ${url}`));
    xhr.ontimeout = () => reject(new Error(`XHR timeout (${timeoutMs}ms) for ${url}`));
    xhr.onabort = () => reject(new Error(`XHR aborted for ${url}`));
    xhr.send();
  });
}

async function downloadValidatedBinary(
  resolvedUrl: string,
  validateFn: (buf: ArrayBuffer) => boolean,
  label: string,
  maxAttempts = 5
): Promise<ArrayBuffer> {
  let lastErr: unknown = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const preferXhr = attempt % 2 === 1;
    try {
      let buffer: ArrayBuffer;
      if (!preferXhr && typeof fetch === 'function') {
        try {
          const resp = await fetch(resolvedUrl, {
            method: 'GET',
            credentials: 'include',
            cache: attempt === 0 ? 'default' : 'no-store'
          });
          if (!resp.ok) {
            throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
          }
          buffer = await resp.arrayBuffer();
        } catch {
          buffer = await xhrFetchArrayBuffer(resolvedUrl);
        }
      } else {
        buffer = await xhrFetchArrayBuffer(resolvedUrl);
      }

      if (!validateFn(buffer)) {
        throw new Error(`Invalid binary header received for ${label} (${buffer.byteLength} bytes)`);
      }

      return buffer;
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts - 1) {
        await sleepMs(computeRetryDelayMs(attempt));
      }
    }
  }

  throw lastErr instanceof Error
    ? lastErr
    : new Error(`Failed to load binary asset ${label} (${resolvedUrl})`);
}

export function fetchGlbArrayBufferResilient(rawUrl: string): Promise<ArrayBuffer> {
  const baseUrl =
    (typeof import.meta !== 'undefined' &&
      (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL) ||
    '/';
  const resolvedUrl = resolvePublicAssetUrl(rawUrl, baseUrl);

  const cached = glbArrayBufferCache.get(resolvedUrl);
  if (cached && isValidGlbMagicBytes(cached)) {
    return Promise.resolve(cached);
  }

  const inflight = inflightGlbPromises.get(resolvedUrl);
  if (inflight) {
    return inflight;
  }

  const task = downloadValidatedBinary(resolvedUrl, isValidGlbMagicBytes, rawUrl, 5)
    .then((buffer) => {
      putBoundedMap(glbArrayBufferCache, resolvedUrl, buffer, MAX_GLB_BUFFER_CACHE_ENTRIES);
      inflightGlbPromises.delete(resolvedUrl);
      return buffer;
    })
    .catch((err) => {
      inflightGlbPromises.delete(resolvedUrl);
      throw err;
    });

  inflightGlbPromises.set(resolvedUrl, task);
  return task;
}

export function fetchTextAssetResilient(rawUrl: string): Promise<string> {
  const baseUrl =
    (typeof import.meta !== 'undefined' &&
      (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL) ||
    '/';
  const resolvedUrl = resolvePublicAssetUrl(rawUrl, baseUrl);

  const cached = textAssetCache.get(resolvedUrl);
  if (cached !== undefined) {
    return Promise.resolve(cached);
  }

  const inflight = inflightTextPromises.get(resolvedUrl);
  if (inflight) {
    return inflight;
  }

  const task = (async () => {
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        let text = '';
        if (attempt % 2 === 0 && typeof fetch === 'function') {
          try {
            const resp = await fetch(resolvedUrl, {
              method: 'GET',
              credentials: 'include',
              cache: attempt === 0 ? 'default' : 'no-store'
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            text = await resp.text();
          } catch {
            text = await xhrFetchText(resolvedUrl);
          }
        } else {
          text = await xhrFetchText(resolvedUrl);
        }

        if (!isValidTextAssetPayload(text, false)) {
          throw new Error(`Received warmup HTML instead of text asset for ${resolvedUrl}`);
        }

        putBoundedMap(textAssetCache, resolvedUrl, text, MAX_TEXT_CACHE_ENTRIES);
        inflightTextPromises.delete(resolvedUrl);
        return text;
      } catch (err) {
        lastErr = err;
        if (attempt < 3) {
          await sleepMs(computeRetryDelayMs(attempt, 250, 1800));
        }
      }
    }
    inflightTextPromises.delete(resolvedUrl);
    throw lastErr instanceof Error ? lastErr : new Error(`Failed to fetch text ${resolvedUrl}`);
  })();

  inflightTextPromises.set(resolvedUrl, task);
  return task;
}

function getSharedDracoLoader(): DRACOLoader {
  const baseUrl =
    (typeof import.meta !== 'undefined' &&
      (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL) ||
    '/';
  const decoderBase = resolvePublicAssetUrl('/draco/', baseUrl);

  if (!sharedDracoLoader) {
    sharedDracoLoader = new DRACOLoader();
    sharedDracoLoader.setDecoderPath(decoderBase);
    sharedDracoLoader.setWorkerLimit(2);
  }
  return sharedDracoLoader;
}

async function ensureDracoDecoderCached(): Promise<void> {
  if (dracoAssetsWarmupPromise) {
    return dracoAssetsWarmupPromise;
  }

  const baseUrl =
    (typeof import.meta !== 'undefined' &&
      (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL) ||
    '/';
  const wrapperUrl = resolvePublicAssetUrl('/draco/draco_wasm_wrapper.js', baseUrl);
  const wasmUrl = resolvePublicAssetUrl('/draco/draco_decoder.wasm', baseUrl);

  THREE.Cache.enabled = true;
  dracoAssetsWarmupPromise = Promise.all([
    fetchTextAssetResilient('/draco/draco_wasm_wrapper.js'),
    downloadValidatedBinary(wasmUrl, isValidWasmMagicBytes, 'draco_decoder.wasm', 4)
  ])
    .then(([wrapperJs, wasmBin]) => {
      THREE.Cache.add(wrapperUrl, wrapperJs);
      THREE.Cache.add(wasmUrl, wasmBin);
    })
    .catch((err) => {
      dracoAssetsWarmupPromise = null;
      if (sharedDracoLoader) {
        (sharedDracoLoader as unknown as { decoderPending?: Promise<void> | null }).decoderPending =
          null;
      }
      throw err;
    });

  return dracoAssetsWarmupPromise;
}

export async function loadGltfResilient(rawUrl: string): Promise<GLTF> {
  const baseUrl =
    (typeof import.meta !== 'undefined' &&
      (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL) ||
    '/';
  const resolvedUrl = resolvePublicAssetUrl(rawUrl, baseUrl);
  const resourcePath = THREE.LoaderUtils.extractUrlBase(resolvedUrl);

  const buffer = await fetchGlbArrayBufferResilient(rawUrl);
  const hasDraco = bufferContainsDracoExtension(buffer);

  if (hasDraco) {
    await ensureDracoDecoderCached();
  }

  const gltfLoader = new GLTFLoader();
  gltfLoader.setDRACOLoader(getSharedDracoLoader());
  gltfLoader.setWithCredentials(true);

  // Only slice when Draco worker might transfer sub-views; non-Draco parses in-place zero-copy.
  const parseInput = hasDraco ? buffer.slice(0) : buffer;

  return new Promise<GLTF>((resolve, reject) => {
    gltfLoader.parse(
      parseInput,
      resourcePath,
      (gltf) => resolve(gltf),
      (err) => {
        if (sharedDracoLoader) {
          (sharedDracoLoader as unknown as { decoderPending?: Promise<void> | null }).decoderPending =
            null;
        }
        dracoAssetsWarmupPromise = null;
        reject(err);
      }
    );
  });
}

export async function loadGlbSceneResilient(rawUrl: string): Promise<THREE.Group> {
  const gltf = await loadGltfResilient(rawUrl);
  return gltf.scene;
}

/**
 * Clones a Three.js hierarchy safely, preserving SkinnedMesh skeleton bone bindings
 * (critical for rigged assemblies such as Mars 2020 Perseverance Armature).
 */
export function cloneSceneWithSkeletonSupport<T extends THREE.Object3D>(source: T): T {
  let hasSkinnedMesh = false;
  source.traverse((node) => {
    if ((node as THREE.SkinnedMesh).isSkinnedMesh) {
      hasSkinnedMesh = true;
    }
  });
  if (hasSkinnedMesh) {
    return SkeletonUtils.clone(source) as T;
  }
  return source.clone(true) as T;
}

/**
 * Builds simplified LOD1 (~42% tris) and LOD2 (~16% tris) BufferGeometries via MeshoptSimplifier,
 * cached per source BufferGeometry so multiple cloned enemies share zero-overhead GPU index buffers.
 */
export async function ensureMeshoptLodReady(): Promise<void> {
  if (!meshoptReadyPromise) {
    meshoptReadyPromise = MeshoptSimplifier.ready.catch(() => {});
  }
  return meshoptReadyPromise;
}

export function getOrBuildDecimatedLodGeometries(
  geom: THREE.BufferGeometry
): { lod1: THREE.BufferGeometry; lod2: THREE.BufferGeometry } | null {
  const existing = cachedLodGeometries.get(geom);
  if (existing) return existing;

  const posAttr = geom.getAttribute('position');
  const idxAttr = geom.getIndex();
  if (!posAttr || !idxAttr || idxAttr.count < 900 || !(posAttr.array instanceof Float32Array)) {
    return null;
  }

  try {
    const srcIndices =
      idxAttr.array instanceof Uint32Array
        ? idxAttr.array
        : new Uint32Array(idxAttr.array as ArrayLike<number>);

    const target1 = Math.max(180, Math.floor((srcIndices.length * 0.42) / 3) * 3);
    const [lod1Indices] = MeshoptSimplifier.simplify(
      srcIndices,
      posAttr.array,
      3,
      target1,
      0.015
    );

    const target2 = Math.max(90, Math.floor((srcIndices.length * 0.16) / 3) * 3);
    const [lod2Indices] = MeshoptSimplifier.simplify(
      srcIndices,
      posAttr.array,
      3,
      target2,
      0.045
    );

    const makeSubLod = (indices: Uint32Array): THREE.BufferGeometry => {
      const sub = new THREE.BufferGeometry();
      for (const name of Object.keys(geom.attributes)) {
        sub.setAttribute(name, geom.attributes[name]);
      }
      sub.setIndex(
        posAttr.count <= 65535
          ? new THREE.BufferAttribute(new Uint16Array(indices), 1)
          : new THREE.BufferAttribute(indices, 1)
      );
      if (geom.boundingBox) sub.boundingBox = geom.boundingBox.clone();
      if (geom.boundingSphere) sub.boundingSphere = geom.boundingSphere.clone();
      return sub;
    };

    const pair = {
      lod1: makeSubLod(lod1Indices),
      lod2: makeSubLod(lod2Indices)
    };
    cachedLodGeometries.set(geom, pair);
    return pair;
  } catch {
    return null;
  }
}

/**
 * Disposes GPU geometries (including MeshBVH boundsTree), materials, and owned textures
 * inside an Object3D subtree without touching shared template assets.
 */
export function disposeSceneHierarchy(
  root: THREE.Object3D | null | undefined,
  options?: {
    disposeGeometries?: boolean;
    disposeMaterials?: boolean;
    disposeTextures?: boolean;
    sharedGeometries?: Set<THREE.BufferGeometry>;
    sharedMaterials?: Set<THREE.Material>;
    sharedTextures?: ReadonlySet<THREE.Texture>;
  }
): void {
  if (!root) return;
  const disposeGeos = options?.disposeGeometries ?? true;
  const disposeMats = options?.disposeMaterials ?? true;
  const disposeTexs = options?.disposeTextures ?? false;
  const sharedGeos = options?.sharedGeometries;
  const sharedMats = options?.sharedMaterials;

  const seenGeo = new Set<THREE.BufferGeometry>();
  const seenMat = new Set<THREE.Material>();
  const seenTex = new Set<THREE.Texture>();

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (disposeGeos && mesh.geometry && !seenGeo.has(mesh.geometry)) {
      seenGeo.add(mesh.geometry);
      if (!sharedGeos || !sharedGeos.has(mesh.geometry)) {
        const anyGeo = mesh.geometry as THREE.BufferGeometry & {
          disposeBoundsTree?: () => void;
        };
        if (typeof anyGeo.disposeBoundsTree === 'function') {
          anyGeo.disposeBoundsTree();
        }
        const lods = cachedLodGeometries.get(mesh.geometry);
        if (lods) {
          lods.lod1.dispose();
          lods.lod2.dispose();
          cachedLodGeometries.delete(mesh.geometry);
        }
        mesh.geometry.dispose();
      }
    }

    if (disposeMats && mesh.material) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (!m || seenMat.has(m)) continue;
        seenMat.add(m);
        if (sharedMats && sharedMats.has(m)) continue;
        if (disposeTexs) {
          for (const val of Object.values(m)) {
            const texture = val as THREE.Texture | undefined;
            if (texture?.isTexture && !seenTex.has(texture) && !options?.sharedTextures?.has(texture)) {
              seenTex.add(texture);
              texture.dispose();
            }
          }
        }
        m.dispose();
      }
    }
  });
}
