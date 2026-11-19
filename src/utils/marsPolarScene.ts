import * as THREE from 'three';
import { POLAR_RELAY, POLAR_HOLD, POLAR_GATE, POLAR_BRIDGE, POLAR_HIGH_PASS, POLAR_JAMMER, type PolarMissionState } from './marsPolarMission';

/** Geometry and wayfinding for the polar graybox. The mission module owns gameplay coordinates. */
export function createMarsPolarScene(sampleGround: (x: number, z: number) => number) {
  const root = new THREE.Group();
  root.name = 'Polar Relay Graybox';
  const base = new THREE.MeshStandardMaterial({color: 0x334453, roughness: .84});
  const deck = new THREE.MeshStandardMaterial({color: 0x84919d, roughness: .89});
  const amber = new THREE.MeshStandardMaterial({color: 0xf6b45e, emissive: 0xa95a18, emissiveIntensity: .8});
  const cyan = new THREE.MeshStandardMaterial({color: 0x6ee7ee, emissive: 0x259cae, emissiveIntensity: .85});
  const beacon = amber.clone();
  const jammerLight = cyan.clone();
  const holdMaterial = new THREE.MeshBasicMaterial({color: 0x84e9ee, side: THREE.DoubleSide, transparent: true, opacity: .74, depthWrite: false});
  const geos: THREE.BufferGeometry[] = [];
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material, parent: THREE.Object3D = root) => {
    const g = new THREE.BoxGeometry(w, h, d); geos.push(g);
    const m = new THREE.Mesh(g, mat); m.position.set(x,y,z); m.receiveShadow = true; parent.add(m); return m;
  };
  // The amber beacon and terminal frame are visible from the spawn, not six identical decorative towers.
  const ry = sampleGround(POLAR_RELAY.x, POLAR_RELAY.z);
  const terminal = new THREE.Group();
  terminal.position.set(POLAR_RELAY.x,ry,POLAR_RELAY.z); root.add(terminal);
  box(2.6,.42,2.6,0,.19,0,base,terminal);
  box(.82,5.25,.72,0,2.68,0,base,terminal);
  box(1.9,.40,1.30,0,5.52,0,beacon,terminal);
  box(1.05,1.35,.62,-.62,.92,-.55,deck,terminal);
  box(.76,.15,.46,-.62,1.63,-.55,beacon,terminal);

  // Off the center of the trail: the antenna reads as a destination from below
  // without asking a ground vehicle to drive through the prop.
  const jammer = new THREE.Group();
  const jz = POLAR_JAMMER.z - 1.6;
  jammer.name = 'Ridge jammer';
  jammer.position.set(POLAR_JAMMER.x,sampleGround(POLAR_JAMMER.x,jz),jz);
  root.add(jammer);
  box(1.28,.28,1.12,0,.10,0,base,jammer);
  box(.24,2.45,.23,0,1.32,0,base,jammer);
  for (const s of [-1,1]) {
    const vane=box(.19,1.02,.28,s*.48,2.56,0,deck,jammer);
    vane.rotation.z=-s*.47;
    box(.19,.25,.3,s*.64,2.95,0,jammerLight,jammer);
  }
  const panel=box(.82,.52,.36,0,.82,.47,jammerLight,jammer);
  panel.rotation.x=-.26;

  const gy = sampleGround(POLAR_GATE.x,POLAR_GATE.z);
  const span = new THREE.Group();span.position.set(POLAR_BRIDGE.x, POLAR_BRIDGE.floorY, POLAR_BRIDGE.z);root.add(span);
  const plank = new THREE.Group();span.add(plank);
  const spanWidth = POLAR_BRIDGE.width;
  box(POLAR_BRIDGE.length,.22,spanWidth,0,-.11,0,deck,plank);
  for(const s of [-1,1]){
    box(POLAR_BRIDGE.length,.09,.15,0,.025,s*(spanWidth*.5-.14),amber,plank);
    box(.78,4.2,.70,-POLAR_BRIDGE.length*.41,gy-POLAR_BRIDGE.floorY+2.1,s*(spanWidth*.5+.26),base,span);
  }
  const gate = box(.75,POLAR_GATE.height,spanWidth,0,gy-POLAR_BRIDGE.floorY+POLAR_GATE.height*.5,0,amber,span);
  // Small, physically grounded route markers. Amber means interact / closed; cyan marks the upper route.
  for(const [x,z,m] of [[3,3,amber],[11,8,amber],[17,7,amber],[6,-7,cyan],[13,-10,cyan],[POLAR_HIGH_PASS.x,POLAR_HIGH_PASS.z,cyan],[29,-10,cyan]] as const) {
    box(.38,.26,.38,x,sampleGround(x,z)+.06,z,m);
  }
  const p: number[] = [];
  const n = 48;
  for(let i=0;i<n;i++){
    const a=i/n*2*Math.PI,b=(i+1)/n*2*Math.PI;
    const point=(angle:number,r:number) => {
      const x=POLAR_HOLD.x+Math.cos(angle)*r,z=POLAR_HOLD.z+Math.sin(angle)*r;
      return [x,sampleGround(x,z)+.11,z];
    };
    const o=POLAR_HOLD.radius,k=o-.36;
    p.push(...point(a,k),...point(a,o),...point(b,o),...point(a,k),...point(b,o),...point(b,k));
  }
  const ringGeo = new THREE.BufferGeometry();
  ringGeo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geos.push(ringGeo);
  const hold = new THREE.Mesh(ringGeo,holdMaterial);root.add(hold);
  hold.visible = false;

  function update(mission: PolarMissionState | null, elapsed: number) {
    const open = mission?.gateOpen ?? false;
    const active = mission?.jammerActive ?? false;
    const spent = !active && (mission?.bridgeWaveSent ?? false);
    jammerLight.color.setHex(active ? 0xa4fab9 : spent ? 0x606977 : 0x6ee7ee);
    jammerLight.emissive.setHex(active ? 0x40af64 : spent ? 0x202633 : 0x259cae);
    jammerLight.emissiveIntensity = active ? 1.1 : spent ? .3 : .76 + .24 * Math.sin(elapsed * 3.6);
    hold.visible = !!mission && mission.phase === 'hold';
    gate.visible = !open;
    plank.rotation.z = open ? 0 : .90;
    plank.position.x = open ? 0 : -POLAR_BRIDGE.length * .18;
    plank.position.y = open ? 0 : 1.85;
    beacon.color.setHex(open ? 0x7cebef : 0xf6b45e);
    beacon.emissive.setHex(open ? 0x219ea1 : 0xa95a18);
    beacon.emissiveIntensity = .76 + .14 * Math.sin(elapsed * 2.4);
  }
  update(null,0);
  return { root, update, pickables: () => [terminal, ...(gate.visible ? [gate] : [])],
    dispose: () => { geos.forEach(g => g.dispose()); [base,deck,amber,cyan,beacon,jammerLight,holdMaterial].forEach(m => m.dispose()); } };
}
