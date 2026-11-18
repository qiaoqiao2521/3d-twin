// Split the source's three tire materials at the empty gaps between its six wheels.
// Run from the repository root. The original digital-twin GLB stays editable separately.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { compactPrimitive, draco, prune, transformPrimitive } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { Box3, Matrix4, Vector3 } from 'three';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule()
});
const doc = await io.read('public/twins/models/L1_mobility_rocker_bogie.glb');
const assembly = doc.getRoot().listNodes().find((node) => node.getName() === 'Wheels_objs');
const grouped = new Map();
for (const primitive of assembly.getMesh().listPrimitives()) {
  const positions = primitive.getAttribute('POSITION');
  const faces = primitive.getIndices().getArray();
  const buckets = new Map();
  const p = [];
  for (let i = 0; i < faces.length; i += 3) {
    positions.getElement(faces[i], p);
    const side = p[0] > 0 ? 'left' : 'right';
    const row = p[2] > 0.6 ? 'front' : p[2] < -0.6 ? 'rear' : 'middle';
    const wheel = row + '_' + side;
    if (!buckets.has(wheel)) buckets.set(wheel, []);
    buckets.get(wheel).push(faces[i], faces[i + 1], faces[i + 2]);
  }
  for (const [wheel, indices] of buckets) {
    if (!grouped.has(wheel)) grouped.set(wheel, doc.createMesh(wheel + '_tire'));
    const part = primitive.clone();
    part.setIndices(doc.createAccessor().setArray(Uint32Array.from(indices)));
    grouped.get(wheel).addPrimitive(compactPrimitive(part));
  }
}

assembly.setMesh(null);
for (const [name, tire] of grouped) {
  const bounds = new Box3();
  for (const part of tire.listPrimitives()) {
    const positions = part.getAttribute('POSITION');
    bounds.expandByPoint(new Vector3(...positions.getMin([])));
    bounds.expandByPoint(new Vector3(...positions.getMax([])));
  }
  const center = bounds.getCenter(new Vector3());
  const shift = new Matrix4().makeTranslation(-center.x, -center.y, -center.z).elements;
  for (const part of tire.listPrimitives()) transformPrimitive(part, shift);
  assembly.addChild(doc.createNode('drive_wheel_' + name).setTranslation(center.toArray()).setMesh(tire));
}

for (const clip of doc.getRoot().listAnimations()) clip.dispose();
await doc.transform(prune(), draco({ quantizePosition: 16 }));
await io.write('public/robotics_glb/mars2020_mobility_drive.glb', doc);
