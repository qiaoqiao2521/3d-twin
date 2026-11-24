import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import type { ManifestRepo, UrdfJointDef } from './manifestUtils.ts';
import { filterMovableJoints, parseKinematicStats } from './manifestUtils.ts';
import { readRoboticsLocation, normalizeRoboticsLocation, roboticsLocationSearch, roboticsAssetUrl } from './roboticsRoute.ts';

const repos = JSON.parse(fs.readFileSync(new URL('../robotics_manifest.json', import.meta.url), 'utf8')) as ManifestRepo[];
test('robot and full archive deep links survive refresh and back/forward without changing parent workspace', () => {
  const initial = readRoboticsLocation('?mode=hangar&robot=anymal_c', repos);
  assert.equal(initial.robot, 'anymal_c');
  const repo = repos.find(repo => repo.repository === 'mujoco_menagerie')!;
  const file = repo.kinematicFiles.find(file => file.includes('franka_fr3') && file.endsWith('.xml'))!;
  const next = normalizeRoboticsLocation({ ...initial, tab: 'urdf_explorer', repository: repo.repository, file }, repos);
  const url = roboticsLocationSearch(next, '?mode=hangar&keep=1');
  assert.equal(new URLSearchParams(url).get('mode'), 'hangar');
  assert.equal(new URLSearchParams(url).get('keep'), '1');
  assert.deepEqual(readRoboticsLocation(url, repos), next);
  assert.deepEqual(readRoboticsLocation(roboticsLocationSearch(initial), repos), initial);
  assert.deepEqual(readRoboticsLocation(url, repos), next);
});
test('unknown robots and arbitrary file paths never become fetch targets', () => {
  const result = readRoboticsLocation('?robot=unknown&engineeringTab=bad&baselineRepo=unknown&baselineFile=../../secret', repos);
  assert.equal(result.robot, 'sar'); assert.equal(result.tab, 'hangar_3d');
  assert.equal(result.file, repos[0].primaryBaselineFile);
  assert.ok(!result.file.includes('..'));
});
test('the complete movable joint list remains discoverable beyond the old 16 item limit', () => {
  const joints = Array.from({ length: 45 }, (_, index) => ({ name: `joint_${index}`, type: 'revolute', child: `hand_${index}`, parent: 'root', xyz: [0,0,0], rpy: [0,0,0], axis: [0,0,1], lower: -1, upper: 1 } as UrdfJointDef));
  assert.equal(filterMovableJoints(joints).length, 45);
  assert.equal(filterMovableJoints(joints, 'hand_44')[0].name, 'joint_44');
});
test('XML launch files are not advertised as runnable MJCF robots', () => {
  assert.equal(parseKinematicStats('<launch><node /></launch>', 'view.launch.xml').format, 'XML');
  assert.equal(parseKinematicStats('<mujoco><worldbody /></mujoco>', 'robot.xml').format, 'MJCF_XML');
});

test('literal plus signs in original filenames survive query round trips and public asset URLs', () => {
  const repo = repos.find(repo => repo.repository === 'unitree_mujoco')!;
  const file = 'unitree_robots/r1/R1_C++.xml';
  const route = normalizeRoboticsLocation({ tab: 'urdf_explorer', repository: repo.repository, file }, repos);
  assert.equal(readRoboticsLocation(roboticsLocationSearch(route), repos).file, file);
  const url = roboticsAssetUrl(`baselines/${repo.category}/${repo.repository}/${file}`);
  assert.ok(url.endsWith('/R1_C++.xml'));
  assert.ok(!url.includes(' '));
});
