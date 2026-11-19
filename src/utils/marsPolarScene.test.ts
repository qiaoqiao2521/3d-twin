import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createMarsPolarScene} from './marsPolarScene';
import {createPolarMission,POLAR_BRIDGE,POLAR_JAMMER} from './marsPolarMission';
import {sampleMarsArenaSurfaceHeight,sampleMarsCombatFloor} from './marsCombatEngine';

test('polar hinged bridge aligns its visible deck with the simulated floor and removes the closed gate',()=>{
  const level=createMarsPolarScene((x,z)=>sampleMarsArenaSurfaceHeight(x,z,'polar_ice_canyon'));
  try {
    const b=POLAR_BRIDGE;
    const m=createPolarMission();
    level.update(m,0);
    const gate=level.pickables()[1];
    assert.ok(gate?.visible);
    const floorClosed=sampleMarsCombatFloor(b.x,b.z,'polar_ice_canyon');
    assert.ok(floorClosed < b.floorY-1);
    m.phase='hold';m.gateOpen=true;
    level.update(m,0);
    assert.ok(!gate.visible);
    assert.ok(!level.pickables().includes(gate));
    level.root.updateMatrixWorld(true);
    const ray=new THREE.Raycaster(new THREE.Vector3(b.x,20,b.z),new THREE.Vector3(0,-1,0));
    const hit=ray.intersectObjects(level.root.children,true).find(h=>h.object.visible);
    assert.ok(hit);
    assert.ok(Math.abs(hit.point.y-sampleMarsCombatFloor(b.x,b.z,'polar_ice_canyon',true))<1e-4);
    level.update(createPolarMission(),0);
    assert.ok(gate.visible);
  }finally{level.dispose()}
});

test('side-route antenna is grounded, off the driving line and reflects the jammer state',()=>{
  const ground=(x:number,z:number)=>sampleMarsArenaSurfaceHeight(x,z,'polar_ice_canyon');
  const level=createMarsPolarScene(ground);
  try {
    const antenna=level.root.getObjectByName('Ridge jammer');
    assert.ok(antenna);
    const {x,y,z}=antenna.position;
    assert.equal(y,ground(x,z));
    assert.ok(Math.abs(z-POLAR_JAMMER.z)>1 && Math.abs(z-POLAR_JAMMER.z)<POLAR_JAMMER.radius);
    const panel=antenna.children.at(-1) as THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
    const mission=createPolarMission();
    assert.equal(panel.material.color.getHex(),0x6ee7ee);
    mission.jammerActive=true;
    level.update(mission,1);
    assert.equal(panel.material.color.getHex(),0xa4fab9);
    level.update({...mission,jammerActive:false,bridgeWaveSent:true},2);
    assert.equal(panel.material.color.getHex(),0x606977);
    level.update(createPolarMission(),0);
    assert.equal(panel.material.color.getHex(),0x6ee7ee);
  }finally{level.dispose()}
});
