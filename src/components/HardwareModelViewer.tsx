import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MeshoptDecoder } from 'meshoptimizer';
import URDFLoader, { type URDFRobot } from 'urdf-loader';
import { hardwareUrl, type HardwareId, type HardwareModel } from '../utils/hardware';
import { disposeHardwareDraco } from '../utils/hardwareDraco';

type Part = { id: number; name: string; depth: number; mesh: boolean };
type Joint = { name: string; type: string; lower: number; upper: number; value: number; mimic: boolean };
type Commands = { fit: (id?: number) => void; select: (id: number) => void; isolate: (id: number) => void; hide: (id: number) => void; reset: () => void; joint: (name: string, value: number) => void; explode: (amount: number) => void; clip: (value: number) => void };
const base = (import.meta as unknown as { env: { BASE_URL: string } }).env.BASE_URL;

function disposeObject(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse(node => {
    const mesh = node as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (mesh.material) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  for (const texture of textures) { texture.dispose(); if (typeof texture.source?.data?.close === 'function') texture.source.data.close(); }
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}

export default function HardwareModelViewer({ assetId, model }: { assetId: HardwareId; model: HardwareModel }) {
  const host = useRef<HTMLDivElement>(null);
  const commands = useRef<Commands | null>(null);
  const [status, setStatus] = useState('正在读取原始模型…');
  const [error, setError] = useState('');
  const [parts, setParts] = useState<Part[]>([]);
  const [joints, setJoints] = useState<Joint[]>([]);
  const [selected, setSelected] = useState<number | undefined>();
  const [query, setQuery] = useState('');
  const [panel, setPanel] = useState<'parts' | 'joints'>('parts');
  const [mobilePane, setMobilePane] = useState<'scene' | 'inspect'>('scene');
  const [explosion, setExplosion] = useState(0);
  const [clip, setClip] = useState(100);
  const [page, setPage] = useState(0);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    setError(''); setParts([]); setJoints([]); setSelected(undefined); setExplosion(0); setClip(100); setPage(0); setStatus('正在读取原始模型…');
    let disposed = false;
    const abort = new AbortController();
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' }); }
    catch { setError('当前浏览器无法创建 WebGL 画面。原始文件仍可在“原始文件”页查看与下载。'); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    renderer.localClippingEnabled = true;
    renderer.domElement.setAttribute('aria-label', `${model.label} 三维结构，拖动旋转、双指缩放`);
    renderer.domElement.setAttribute('role', 'img');
    element.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#141c26');
    scene.add(new THREE.HemisphereLight(0xf2f7ff, 0x596576, 2.5));
    for (const [x, y, z, power] of [[4, 8, 6, 3], [-5, 3, -4, 1.6]]) {
      const light = new THREE.DirectionalLight(0xffffff, power); light.position.set(x, y, z); scene.add(light);
    }
    const camera = new THREE.PerspectiveCamera(40, 1, 0.001, 1000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.screenSpacePanning = true;
    const placement = new THREE.Group();
    const coordinateFrame = new THREE.Group();
    if (model.up === 'Z') coordinateFrame.rotation.x = -Math.PI / 2;
    if (model.unit === 'mm') coordinateFrame.scale.setScalar(0.001);
    placement.add(coordinateFrame); scene.add(placement);
    let loaded: THREE.Object3D | null = null;
    let robot: URDFRobot | null = null;
    let bounds = new THREE.Box3();
    let highlight: THREE.BoxHelper | null = null;
    let frame = 0;
    let visible = !document.hidden;
    const nodes = new Map<number, THREE.Object3D>();
    const originalLabels = new Map<number, string>();
    const originalVisibility = new Map<THREE.Object3D, boolean>();
    const explodeParts: { node: THREE.Object3D; position: THREE.Vector3; delta: THREE.Vector3 }[] = [];
    const clipping = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 1e9);
    function draw() {
      if (disposed || !visible || frame || !element.clientWidth || !element.clientHeight) return;
      frame = requestAnimationFrame(() => { frame = 0; if (!disposed && visible) { highlight?.update(); renderer.render(scene, camera); } });
    }
    const resize = new ResizeObserver(() => {
      if (disposed) return;
      const width = element.clientWidth, height = element.clientHeight;
      // Mobile inspection hides the canvas. Retain its last valid aspect so
      // focusing a part in the inspector cannot fit it to a fake 1x1 viewport.
      if (!width || !height) return;
      renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); draw();
    });
    resize.observe(element);
    controls.addEventListener('change', draw);
    function onVisibility() { visible = !document.hidden; if (!visible) { cancelAnimationFrame(frame); frame = 0; } else draw(); }
    document.addEventListener('visibilitychange', onVisibility);
    const manager = new THREE.LoadingManager();
    const assetRoot = new URL(hardwareUrl(assetId, 'asset.json', base), location.href).href.replace(/asset\.json$/, '');
    const decoderRoot = new URL(`${base}draco/`, location.href).href;
    manager.setURLModifier(url => {
      if (/^(blob:|data:)/.test(url)) return url;
      const resolved = new URL(url, location.href);
      if (!resolved.href.startsWith(assetRoot) && !resolved.href.startsWith(decoderRoot)) throw new Error(`模型引用了当前原件目录以外的资源：${url}`);
      return resolved.href;
    });
    manager.onError = url => { if (!disposed) setError(`模型资源未能完整加载：${decodeURI(url.split('/').pop() || url)}`); };
    const draco = new DRACOLoader(manager).setDecoderPath(`${base}draco/`);
    const gltf = new GLTFLoader(manager).setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder);
    async function fetchBytes(url: string) {
      const response = await fetch(url, { signal: abort.signal });
      if (!response.ok || response.headers.get('content-type')?.includes('text/html')) throw new Error(`原件资源不存在或被错误的页面替代：${url.split('/').pop()}`);
      const bytes = await response.arrayBuffer();
      if (disposed) throw new DOMException('模型已退出', 'AbortError');
      return bytes;
    }
    async function parseGltf(bytes: ArrayBuffer, resourcePath: string) {
      if (disposed) throw new DOMException('模型已退出', 'AbortError');
      try {
        const result = await gltf.parseAsync(bytes, resourcePath);
        if (!disposed) result.scene.traverse(node => {
          const reference = result.parser.associations.get(node);
          const originalNode = reference?.nodes == null ? undefined : result.parser.json.nodes?.[reference.nodes];
          const meshIndex = reference?.meshes ?? originalNode?.mesh;
          const instanceName = originalNode?.name || node.name;
          const productName = meshIndex == null ? '' : result.parser.json.meshes?.[meshIndex]?.name;
          if (instanceName || productName) originalLabels.set(node.id, instanceName && productName && instanceName !== productName ? `${instanceName} · ${productName}` : instanceName || productName);
        });
        return result;
      }
      finally { if (disposed) disposeHardwareDraco(draco); }
    }
    function clearHighlight() {
      if (highlight) { scene.remove(highlight); highlight.geometry.dispose(); (highlight.material as THREE.Material).dispose(); highlight = null; }
    }
    function fit(id?: number) {
      const target = id == null ? placement : nodes.get(id);
      if (!target) return;
      const box = new THREE.Box3().setFromObject(target);
      if (box.isEmpty()) return;
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      const radius = Math.max(sphere.radius, 0.001);
      const distance = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.max(1, 1 / camera.aspect) * 1.15;
      controls.target.copy(sphere.center);
      camera.position.copy(sphere.center).add(new THREE.Vector3(1.1, 0.75, 1.3).normalize().multiplyScalar(distance));
      camera.near = Math.max(radius / 2000, 0.00001); camera.far = Math.max(radius * 200, 10); camera.updateProjectionMatrix();
      controls.minDistance = radius * 0.01; controls.maxDistance = radius * 100; controls.update(); draw();
    }
    function select(id: number) {
      const node = nodes.get(id); if (!node) return;
      clearHighlight(); highlight = new THREE.BoxHelper(node, 0x58e4df); scene.add(highlight); setSelected(id); draw();
    }
    function resetVisibility() { for (const [node, wasVisible] of originalVisibility) node.visible = wasVisible; }
    function jointValues() {
      if (!robot) return [];
      return Object.entries(robot.joints).filter(([, j]) => j.jointType !== 'fixed').map(([name, joint]) => ({ name, type: joint.jointType,
        lower: joint.jointType === 'continuous' ? -Math.PI : joint.limit.lower, upper: joint.jointType === 'continuous' ? Math.PI : joint.limit.upper,
        value: joint.jointValue[0] || 0, mimic: Boolean((joint as unknown as { mimicJoint?: string }).mimicJoint) }));
    }
    commands.current = {
      fit, select,
      isolate(id) {
        const selectedNode = nodes.get(id); if (!selectedNode) return;
        resetVisibility();
        const descendants = new Set<THREE.Object3D>(); selectedNode.traverse(node => descendants.add(node));
        const ancestors = new Set<THREE.Object3D>(); let node: THREE.Object3D | null = selectedNode; while (node) { ancestors.add(node); node = node.parent; }
        for (const object of nodes.values()) if (!descendants.has(object) && !ancestors.has(object)) object.visible = false;
        fit(id);
      },
      hide(id) { const node = nodes.get(id); if (node) node.visible = false; clearHighlight(); draw(); },
      reset() {
        resetVisibility();
        for (const part of explodeParts) part.node.position.copy(part.position);
        if (robot) for (const [name, joint] of Object.entries(robot.joints)) {
          if (!(joint as unknown as { mimicJoint?: string }).mimicJoint) robot.setJointValue(name, model.initialJoints?.[name] || 0);
        }
        renderer.clippingPlanes = []; clearHighlight(); setSelected(undefined); setExplosion(0); setClip(100); setJoints(jointValues()); fit();
      },
      joint(name, value) { robot?.setJointValue(name, value); setJoints(jointValues()); draw(); },
      explode(amount) { for (const part of explodeParts) part.node.position.copy(part.position).addScaledVector(part.delta, amount); draw(); },
      clip(value) { clipping.constant = THREE.MathUtils.lerp(bounds.min.x, bounds.max.x, value / 100); renderer.clippingPlanes = value < 100 ? [clipping] : []; draw(); },
    };
    let down: { x: number; y: number } | null = null;
    const pointerDown = (event: PointerEvent) => { down = { x: event.clientX, y: event.clientY }; };
    const pointerUp = (event: PointerEvent) => {
      if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5 || !loaded) { down = null; return; }
      down = null;
      const rect = renderer.domElement.getBoundingClientRect();
      const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), camera);
      const hit = ray.intersectObject(loaded, true).find(item => { let node: THREE.Object3D | null = item.object; while (node) { if (!node.visible) return false; node = node.parent; } return true; });
      if (hit) select(hit.object.id);
    };
    renderer.domElement.addEventListener('pointerdown', pointerDown);
    renderer.domElement.addEventListener('pointerup', pointerUp);
    const contextLost = (event: Event) => { event.preventDefault(); if (!disposed) setError('WebGL 上下文已丢失，请用上方“刷新展示”重新打开。'); };
    renderer.domElement.addEventListener('webglcontextlost', contextLost);

    (async () => {
      const url = hardwareUrl(assetId, model.path, base);
      if (model.format === 'urdf') {
        const documentBytes = await fetchBytes(url);
        const loader = new URDFLoader(manager);
        loader.workingPath = new URL('.', new URL(url, location.href)).href;
        loader.packages = Object.fromEntries(Object.entries(model.packages || {}).map(([key, value]) => [key, new URL(hardwareUrl(assetId, value, base), location.href).href]));
        const tasks: Promise<void>[] = [];
        loader.loadMeshCb = (meshUrl, _manager, material, complete) => {
          const safeUrl = manager.resolveURL(meshUrl);
          const task = (async () => {
            const bytes = await fetchBytes(safeUrl);
            const extension = new URL(safeUrl).pathname.split('.').pop()?.toLowerCase();
            let object: THREE.Object3D;
            if (extension === 'stl') object = new THREE.Mesh(new STLLoader().parse(bytes), material);
            else if (extension === 'dae') object = new ColladaLoader(manager).parse(new TextDecoder().decode(bytes), new URL('.', safeUrl).href).scene;
            else if (extension === 'obj') {
              object = new OBJLoader(manager).parse(new TextDecoder().decode(bytes));
              object.traverse(node => { if ((node as THREE.Mesh).isMesh) { const mesh = node as THREE.Mesh; for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) m.dispose(); mesh.material = material; } });
            } else if (extension === 'glb' || extension === 'gltf') object = (await parseGltf(bytes, new URL('.', safeUrl).href)).scene;
            else throw new Error(`尚未支持的原始网格格式：${extension}`);
            if (disposed) { disposeObject(object); return; }
            complete(object);
          })();
          tasks.push(task); void task.catch(() => {});
        };
        robot = loader.parse(new TextDecoder().decode(documentBytes));
        loaded = robot;
        await Promise.all(tasks);
        if (model.initialJoints) robot.setJointValues(model.initialJoints);
      } else {
        const result = await parseGltf(await fetchBytes(url), new URL('.', new URL(url, location.href)).href);
        loaded = result.scene;
      }
      if (disposed) { if (loaded) disposeObject(loaded); return; }
      coordinateFrame.add(loaded!);
      placement.updateMatrixWorld(true);
      bounds = new THREE.Box3().setFromObject(placement);
      if (bounds.isEmpty()) throw new Error('模型没有可显示的原始几何体');
      const center = bounds.getCenter(new THREE.Vector3());
      placement.position.set(-center.x, -bounds.min.y, -center.z);
      placement.updateMatrixWorld(true);
      bounds.setFromObject(placement);
      const size = bounds.getSize(new THREE.Vector3());
      const grid = new THREE.GridHelper(Math.max(size.x, size.z, size.y) * 2, 20, 0x364955, 0x26333f); grid.position.y = -Math.max(size.length() * 0.001, 0.0001); scene.add(grid);
      const list: Part[] = [];
      const worldCenter = bounds.getCenter(new THREE.Vector3());
      function visit(node: THREE.Object3D, depth: number) {
        nodes.set(node.id, node); originalVisibility.set(node, node.visible);
        const mesh = Boolean((node as THREE.Mesh).isMesh);
        list.push({ id: node.id, name: originalLabels.get(node.id) || node.name || (node as unknown as { urdfName?: string }).urdfName || (mesh ? '未命名网格' : '未命名装配节点'), depth, mesh });
        if (mesh) {
          let hasMeshParent = false; for (let parent = node.parent; parent && parent !== coordinateFrame; parent = parent.parent) if ((parent as THREE.Mesh).isMesh) hasMeshParent = true;
          if (!hasMeshParent && node.parent) {
            const nodeCenter = new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3());
            const offset = nodeCenter.clone().sub(worldCenter).multiplyScalar(1.5);
            const localDelta = node.parent.worldToLocal(nodeCenter.clone().add(offset)).sub(node.parent.worldToLocal(nodeCenter.clone()));
            explodeParts.push({ node, position: node.position.clone(), delta: localDelta });
          }
        }
        for (const child of node.children) visit(child, depth + 1);
      }
      visit(loaded!, 0);
      const meshCount = list.filter(part => part.mesh).length;
      if (!meshCount) throw new Error('原始几何体没有完整加载');
      setParts(list); setJoints(jointValues()); setStatus(`${meshCount.toLocaleString()} 个网格 · ${list.length.toLocaleString()} 个原始层级节点`);
      fit();
      // Read-only acceptance evidence, no model or scene objects exposed to the application.
      renderer.domElement.dataset.hardwareLoaded = assetId;
      renderer.domElement.dataset.meshCount = String(meshCount);
      renderer.domElement.dataset.renderer = renderer.getContext().getParameter(renderer.getContext().RENDERER);
      draw();
    })().catch(cause => {
      if (!disposed) { setError(cause instanceof Error ? cause.message : String(cause)); setStatus('模型未完整加载'); }
    });

    return () => {
      disposed = true; abort.abort(); cancelAnimationFrame(frame); resize.disconnect(); document.removeEventListener('visibilitychange', onVisibility);
      renderer.domElement.removeEventListener('pointerdown', pointerDown); renderer.domElement.removeEventListener('pointerup', pointerUp); renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      controls.removeEventListener('change', draw); controls.dispose(); clearHighlight();
      if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
      if (loaded && !loaded.parent) disposeObject(loaded);
      disposeObject(scene); scene.clear(); disposeHardwareDraco(draco); renderer.renderLists.dispose(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); commands.current = null;
    };
  }, [assetId, model]);

  const filtered = parts.filter(part => part.name.toLowerCase().includes(query.toLowerCase()));
  const shown = filtered.slice(page * 120, (page + 1) * 120);
  const selectedPart = parts.find(part => part.id === selected);
  return <div className={`hardware-viewer mobile-${mobilePane}`}>
    <div className="hardware-viewer-mobile-nav" aria-label="三维与检查面板"><button aria-pressed={mobilePane === 'scene'} onClick={() => setMobilePane('scene')}>三维操作</button><button aria-pressed={mobilePane === 'inspect' && panel === 'parts'} onClick={() => { setPanel('parts'); setMobilePane('inspect'); }}>结构层级</button><button aria-pressed={mobilePane === 'inspect' && panel === 'joints'} onClick={() => { setPanel('joints'); setMobilePane('inspect'); }}>关节控制</button></div>
    <div className="hardware-canvas-column">
      <div className="hardware-canvas" ref={host} />
      <div className="hardware-viewer-status" role="status">{status}</div>
      {error && <div className="hardware-viewer-error" role="alert">{error}</div>}
      <div className="hardware-viewer-actions"><button onClick={() => commands.current?.fit()}>适应整机</button><button onClick={() => commands.current?.reset()}>恢复装配与关节</button><span>拖动旋转 · 双指缩放 / 平移 · 点击选部件</span></div>
      <div className="hardware-display-controls">
        <label>展开结构 <input aria-label="展开结构" type="range" min="0" max="1" step="0.01" value={explosion} disabled={model.format === 'urdf'} onChange={e => { const value = Number(e.target.value); setExplosion(value); commands.current?.explode(value); }} /></label>
        <label>剖切查看 <input aria-label="剖切查看" type="range" min="0" max="100" step="1" value={clip} onChange={e => { const value = Number(e.target.value); setClip(value); commands.current?.clip(value); }} /></label>
      </div>
      <p className="hardware-fine">展开和剖切用于查看原有几何体；不计算装拆工艺、碰撞或受力。内部细节以原模型实际公开的内容为准。</p>
    </div>
    <aside className="hardware-model-sidebar">
      <div className="hardware-subtabs"><button aria-pressed={panel === 'parts'} onClick={() => setPanel('parts')}>结构层级 {parts.length}</button><button aria-pressed={panel === 'joints'} onClick={() => setPanel('joints')}>关节 {joints.length}</button></div>
      {panel === 'parts' ? <>
        <input className="hardware-search" aria-label="搜索原始部件名" placeholder="搜索原始部件名" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} />
        {selectedPart && <div className="hardware-selection"><strong>{selectedPart.name}</strong><div><button onClick={() => commands.current?.fit(selected)}>定位</button><button onClick={() => commands.current?.isolate(selected!)}>单独查看</button><button onClick={() => commands.current?.hide(selected!)}>隐藏</button></div></div>}
        <div className="hardware-part-list" aria-label="原始装配层级">
          {shown.map(part => <button key={part.id} aria-pressed={part.id === selected} title={part.name} style={{ paddingLeft: `${10 + Math.min(part.depth, 10) * 12}px` }} onClick={() => commands.current?.select(part.id)}><span className="hardware-node-kind">{part.mesh ? '零件' : '装配'}</span>{part.name}</button>)}
          {!shown.length && <p className="hardware-fine">{parts.length ? '没有匹配的原始节点。' : '模型加载后显示原始层级。'}</p>}
        </div>
        {filtered.length > 120 && <div className="hardware-pages"><button disabled={page === 0} onClick={() => setPage(page - 1)}>上一页</button><span>{page + 1} / {Math.ceil(filtered.length / 120)}</span><button disabled={(page + 1) * 120 >= filtered.length} onClick={() => setPage(page + 1)}>下一页</button></div>}
      </> : <div className="hardware-joints">
        <p className="hardware-fine">{joints.length ? '关节轴、原点、限位与跟随关系来自当前 URDF；这里只计算运动学，不连接设备。' : '当前展示为 CAD 装配或静态网格，原件没有给它提供可驱动的关节。可在上方切换关节模型。'}</p>
        {joints.map(joint => {
          const supported = ['revolute', 'continuous', 'prismatic'].includes(joint.type) && Number.isFinite(joint.lower) && Number.isFinite(joint.upper) && joint.upper > joint.lower;
          const angular = joint.type !== 'prismatic';
          return <label className="hardware-joint" key={joint.name}><strong>{joint.name}</strong><span>{joint.type}{joint.mimic ? ' · 原件跟随关节' : ''} · {angular ? `${THREE.MathUtils.radToDeg(joint.value).toFixed(1)}°` : `${(joint.value * 1000).toFixed(1)} mm`}</span>{joint.type === 'continuous' && <small>连续旋转；滑块仅预览 ±180°，不代表机械限位。</small>}{supported ? <input aria-label={joint.name} type="range" min={joint.lower} max={joint.upper} step={(joint.upper - joint.lower) / 1000} value={joint.value} disabled={joint.mimic || explosion > 0} onChange={e => commands.current?.joint(joint.name, Number(e.target.value))} /> : <small>原件未提供可用于单轴滑块的有效限位。</small>}</label>;
        })}
      </div>}
    </aside>
  </div>;
}
