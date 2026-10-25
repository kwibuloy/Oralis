// Build the Oral anatomy carving tooth: an idealised left mandibular first molar (FDI 36) at real size
// (millimetres), to Wheeler's proportions. The crown and roots are a signed distance field (cusps,
// marginal ridges and roots blended with smooth unions; grooves carved as V-shaped cuts), meshed on a
// 0.1 mm grid with surface nets and split at the cementoenamel junction.
//
//   node scripts/build-carving-tooth.mjs
//
// Writes models-src/carving-molar.glb (merged into public/models/dental.glb by extract-bodyparts.mjs)
// and src/content/carving.generated.json (landmark positions and normals on the surface, in mm).
//
// Built as a right molar (mesial +x, buccal +z, occlusal +y) and mirrored at the end: left and right
// antimeres are mirror images, and mirroring puts mesial on the viewer's left in buccal view, as for 36.
import { Document, NodeIO } from '@gltf-transform/core';
import { mkdirSync, writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { BUCCAL_PIT, cast, cejY, CUSPS, down, gradient, PITS, ROOTS, surfaceNets, WHEELER } from './lib/molar.mjs';

// ---------- Landmarks (defined here so the pins sit on this exact surface) ----------
const along = (x, y, z, dir) => cast([x - dir[0] * 12, y - dir[1] * 12, z - dir[2] * 12], dir);
const rootAt = (R, y) => { const t = (R.top - y) / (R.top - R.apex); return [R.x(t), y, R.z(t)]; };
const LANDMARKS = [
  // Cusps (tips)
  ['mesiobuccal-cusp', 'cusp', () => down(CUSPS.mesiobuccal.c[0], CUSPS.mesiobuccal.c[2])],
  ['distobuccal-cusp', 'cusp', () => down(CUSPS.distobuccal.c[0], CUSPS.distobuccal.c[2])],
  ['distal-cusp', 'cusp', () => down(CUSPS.distal.c[0], CUSPS.distal.c[2])],
  ['mesiolingual-cusp', 'cusp', () => down(CUSPS.mesiolingual.c[0], CUSPS.mesiolingual.c[2])],
  ['distolingual-cusp', 'cusp', () => down(CUSPS.distolingual.c[0], CUSPS.distolingual.c[2])],
  // Ridges
  ['mesial-marginal-ridge', 'ridge', () => down(4.75, 0)],
  ['distal-marginal-ridge', 'ridge', () => down(-4.4, -1.0)],
  ['buccal-cervical-ridge', 'ridge', () => along(1.6, 1.3, 0, [0, 0, -1])],
  // Grooves
  ['central-groove', 'groove', () => down(2.2, 0.35)],
  ['mesiobuccal-groove', 'groove', () => down(0.95, 2.4)],
  ['distobuccal-groove', 'groove', () => down(-2.55, 2.0)],
  ['lingual-groove', 'groove', () => down(0.25, -2.4)],
  // Fossae
  ['central-fossa', 'fossa', () => down(-0.6, 0.0)],
  ['mesial-triangular-fossa', 'fossa', () => down(3.3, 0.6)],
  ['distal-triangular-fossa', 'fossa', () => down(-3.55, -0.7)],
  // Pits
  ['central-pit', 'pit', () => down(...PITS.central)],
  ['mesial-pit', 'pit', () => down(...PITS.mesial)],
  ['distal-pit', 'pit', () => down(...PITS.distal)],
  ['buccal-pit', 'pit', () => along(BUCCAL_PIT[0], BUCCAL_PIT[1], 0, [0, 0, -1])],
  // Contours and contacts
  ['buccal-height-of-contour', 'contour', () => along(-0.5, 1.4, 0, [0, 0, -1])],
  ['lingual-height-of-contour', 'contour', () => along(1.5, 3.5, 0, [0, 0, 1])],
  ['mesial-contact-area', 'contour', () => along(0, 5.0, 0.4, [-1, 0, 0])],
  ['distal-contact-area', 'contour', () => along(0, 4.3, 0.2, [1, 0, 0])],
  ['cervical-line', 'cervix', () => along(3.0, 0.05, 0, [0, 0, -1])],
  // Roots
  ['root-trunk', 'root', () => along(-0.2, -1.6, 0, [0, 0, -1])],
  ['furcation', 'root', () => cast([0.0, -9, 2.5], [0, 1, 0])],
  ['mesial-root', 'root', () => along(...rootAt(ROOTS.mesial, -7.5).map((v, i) => (i === 2 ? 0 : v)), [0, 0, -1])],
  ['distal-root', 'root', () => along(...rootAt(ROOTS.distal, -7.0).map((v, i) => (i === 2 ? 0 : v)), [0, 0, -1])],
  ['mesial-apex', 'root', () => cast([ROOTS.mesial.x(1), -20, ROOTS.mesial.z(1)], [0, 1, 0])],
  ['distal-apex', 'root', () => cast([ROOTS.distal.x(1), -20, ROOTS.distal.z(1)], [0, 1, 0])],
];

// ---------- Build ----------
const STEP = Number(process.env.STEP ?? 0.1);
const t0 = Date.now();
const { positions, quads } = surfaceNets(STEP);
console.log(`surface: ${positions.length / 3} vertices, ${quads.length * 2} triangles (${STEP} mm grid, ${((Date.now() - t0) / 1000).toFixed(1)} s)`);

// Mirror to the left tooth: negate x, which also flips each face's winding.
const mirror = (p) => [-p[0], p[1], p[2]];
for (let v = 0; v < positions.length; v += 3) positions[v] = -positions[v];

// Split at the CEJ: a face goes to the crown when its centre is above the cervical line.
const crown = [], rootFaces = [];
for (const q of quads) {
  const [a, b, c, d] = q;
  for (const tri of [[a, c, b], [a, d, c]]) { // reversed order: mirroring flipped the winding
    const cy = (positions[tri[0] * 3 + 1] + positions[tri[1] * 3 + 1] + positions[tri[2] * 3 + 1]) / 3;
    const cx = -(positions[tri[0] * 3] + positions[tri[1] * 3] + positions[tri[2] * 3]) / 3; // back to build space
    const cz = (positions[tri[0] * 3 + 2] + positions[tri[1] * 3 + 2] + positions[tri[2] * 3 + 2]) / 3;
    (cy >= cejY(cx, cz) ? crown : rootFaces).push(...tri);
  }
}

// Smooth normals from the faces (area-weighted). The field's gradient is unreliable inside the carved
// grooves, where it is not a true distance.
const normals = new Float32Array(positions.length);
for (const f of [crown, rootFaces]) for (let t = 0; t < f.length; t += 3) {
  const [a, b, c] = [f[t] * 3, f[t + 1] * 3, f[t + 2] * 3];
  const e1 = [0, 1, 2].map((k) => positions[b + k] - positions[a + k]), e2 = [0, 1, 2].map((k) => positions[c + k] - positions[a + k]);
  const nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
  for (const v of [a, b, c]) { normals[v] += nx; normals[v + 1] += ny; normals[v + 2] += nz; }
}
for (let v = 0; v < normals.length; v += 3) { const l = Math.hypot(normals[v], normals[v + 1], normals[v + 2]) || 1; normals[v] /= l; normals[v + 1] /= l; normals[v + 2] /= l; }

// Landmark shading (illustrated-look skill): occlusion per vertex from rays against the tooth itself, within
// 1.2 mm, so grooves, pits and fossae darken and the ridges between them read (the app's `ao` look).
const AO_REACH = 1.2, AO_RAYS = 24;
const ao = new Float32Array(positions.length / 3);
{
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex([...crown, ...rootFaces]);
  const bvh = new MeshBVH(geo);
  const ray = new THREE.Ray(), n = new THREE.Vector3(), t = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3();
  for (let v = 0; v < ao.length; v++) {
    n.fromArray(normals, v * 3);
    t.set(n.y, -n.x, 0); if (t.lengthSq() < 1e-6) t.set(1, 0, 0); t.normalize(); b.crossVectors(n, t);
    ray.origin.fromArray(positions, v * 3).addScaledVector(n, 0.01);
    let occ = 0;
    for (let k = 0; k < AO_RAYS; k++) {
      const r = Math.sqrt((k + 0.5) / AO_RAYS), a = k * 2.399963 + v * 2.399963; // each vertex's rays turned: no banding
      d.copy(t).multiplyScalar(r * Math.cos(a)).addScaledVector(b, r * Math.sin(a)).addScaledVector(n, Math.sqrt(1 - r * r));
      ray.direction.copy(d);
      const hit = bvh.raycastFirst(ray, THREE.DoubleSide, 0, AO_REACH);
      if (hit) occ += 1 - hit.distance / AO_REACH;
    }
    ao[v] = occ / AO_RAYS;
  }
}

const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene('carving');
const pos = doc.createAccessor().setType('VEC3').setArray(positions).setBuffer(buffer);
const nrm = doc.createAccessor().setType('VEC3').setArray(normals).setBuffer(buffer);
const occlusion = doc.createAccessor().setType('SCALAR').setArray(ao).setBuffer(buffer);
for (const [name, faces] of [['carving-crown', crown], ['carving-root', rootFaces]]) {
  const prim = doc.createPrimitive().setAttribute('POSITION', pos).setAttribute('NORMAL', nrm).setAttribute('_AO', occlusion)
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(faces)).setBuffer(buffer));
  scene.addChild(doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim)));
}
mkdirSync('models-src', { recursive: true });
writeFileSync('models-src/carving-molar.glb', await new NodeIO().writeBinary(doc));

const landmarks = LANDMARKS.map(([id, kind, at], i) => {
  const p = at();
  return { id, kind, n: i + 1, position: mirror(p).map((v) => +v.toFixed(3)), normal: mirror(gradient(p)).map((v) => +v.toFixed(3)) };
});
writeFileSync('src/content/carving.generated.json', JSON.stringify({ tooth: 'left mandibular first molar (FDI 36)', units: 'mm', wheeler: WHEELER, landmarks }, null, 1) + '\n');
console.log(`carving-molar.glb: crown ${crown.length / 3} + root ${rootFaces.length / 3} triangles; ${landmarks.length} landmarks; ${((Date.now() - t0) / 1000).toFixed(1)} s`);
