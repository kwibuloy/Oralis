// Build the Cariology process block: enamel prisms under the acquired pellicle and a dental biofilm,
// magnified (micrometres). The lesion molar is built in Blender (scripts/blender/build_cariology.py).
//
//   node scripts/build-cariology.mjs
//
// Writes models-src/cariology.glb (merged into public/models/cariology.glb by extract-bodyparts.mjs).
import { Document, NodeIO } from '@gltf-transform/core';
import { mkdirSync, writeFileSync } from 'node:fs';

const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene('cariology');
const t0 = Date.now();
const log = (m) => console.log(`${((Date.now() - t0) / 1000).toFixed(0).padStart(4)} s  ${m}`);

/** Add a mesh node from positions, triangles and normals (and _AO, baked crease shading, if given). */
function addMesh(name, positions, tris, normals, ao) {
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(positions).setBuffer(buffer))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(normals).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(tris).setBuffer(buffer));
  if (ao) prim.setAttribute('_AO', doc.createAccessor().setType('SCALAR').setArray(ao).setBuffer(buffer));
  scene.addChild(doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim)));
}

// ---------- Process block: enamel prisms, pellicle and biofilm (micrometres) ----------
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
function merge(parts) {
  const pos = [], nrm = [], idx = [];
  for (const p of parts) { const o = pos.length / 3; pos.push(...p.pos); nrm.push(...p.nrm); idx.push(...p.idx.map((i) => i + o)); }
  return { positions: new Float32Array(pos), normals: new Float32Array(nrm), tris: new Uint32Array(idx) };
}
/** A vertical hexagonal column (an enamel prism segment), flat-shaded. */
function hexColumn(cx, cz, r, y0, y1) {
  const pos = [], nrm = [], idx = [];
  const ring = Array.from({ length: 6 }, (_, i) => { const a = (i / 6) * Math.PI * 2 + Math.PI / 6; return [cx + r * Math.cos(a), cz + r * Math.sin(a)]; });
  const quad = (a, b, c, d, n) => { const o = pos.length / 3; pos.push(...a, ...b, ...c, ...d); for (let i = 0; i < 4; i++) nrm.push(...n); idx.push(o, o + 1, o + 2, o, o + 2, o + 3); };
  for (let i = 0; i < 6; i++) {
    const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % 6];
    const n = [((ax + bx) / 2 - cx) / r, 0, ((az + bz) / 2 - cz) / r];
    quad([ax, y0, az], [ax, y1, az], [bx, y1, bz], [bx, y0, bz], n);
  }
  for (const [y, up] of [[y1, 1], [y0, -1]]) {
    const o = pos.length / 3;
    pos.push(cx, y, cz); nrm.push(0, up, 0);
    for (const [x, z] of ring) { pos.push(x, y, z); nrm.push(0, up, 0); }
    for (let i = 0; i < 6; i++) up > 0 ? idx.push(o, o + 1 + ((i + 1) % 6), o + 1 + i) : idx.push(o, o + 1 + i, o + 1 + ((i + 1) % 6));
  }
  return { pos, nrm, idx };
}
function sphere(c, r, seg = 14, rings = 9) {
  const pos = [], nrm = [], idx = [];
  for (let j = 0; j <= rings; j++) for (let i = 0; i <= seg; i++) {
    const th = (j / rings) * Math.PI, ph = (i / seg) * Math.PI * 2;
    const n = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
    pos.push(c[0] + n[0] * r, c[1] + n[1] * r, c[2] + n[2] * r); nrm.push(...n);
  }
  for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) { const a = j * (seg + 1) + i, b = a + seg + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  return { pos, nrm, idx };
}
/**
 * One smooth body swept along a path (points), its radius radius(s, L) at arc length s of L, closed at both
 * ends: a chain of cocci that narrows between cells, or a rod with round ends (illustrated-look skill). The
 * crease shading (_AO) is crease(s, L): dark in the narrowings between cells, never at the round ends.
 */
function sweep(path, radius, crease = () => 0, seg = 14, step = 0.07) {
  const len = [0];
  for (let i = 1; i < path.length; i++) len.push(len[i - 1] + Math.hypot(...path[i].map((v, k) => v - path[i - 1][k])));
  const L = len[len.length - 1], rings = Math.max(2, Math.ceil(L / step));
  const at = (s) => { let i = 1; while (i < len.length - 1 && len[i] < s) i++; const t = (s - len[i - 1]) / (len[i] - len[i - 1] || 1); return path[i - 1].map((v, k) => v + (path[i][k] - v) * t); };
  const pos = [], nrm = [], idx = [], ao = [];
  let n = null;
  for (let j = 0; j <= rings; j++) {
    const s = (L * j) / rings, c = at(s), ahead = at(Math.min(L, s + 0.02)), behind = at(Math.max(0, s - 0.02));
    let t = ahead.map((v, k) => v - behind[k]); const tl = Math.hypot(...t) || 1; t = t.map((v) => v / tl);
    if (!n) n = Math.abs(t[1]) < 0.9 ? [t[2], 0, -t[0]] : [0, -t[2], t[1]];
    const d = n[0] * t[0] + n[1] * t[1] + n[2] * t[2]; n = n.map((v, k) => v - d * t[k]); const nl = Math.hypot(...n); n = n.map((v) => v / nl);
    const b = [t[1] * n[2] - t[2] * n[1], t[2] * n[0] - t[0] * n[2], t[0] * n[1] - t[1] * n[0]];
    const r = Math.max(radius(s, L), 1e-3);
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2, dir = [0, 1, 2].map((k) => Math.cos(a) * n[k] + Math.sin(a) * b[k]);
      pos.push(...c.map((v, k) => v + dir[k] * r)); nrm.push(...dir); ao.push(crease(s, L));
    }
  }
  // Wound outward (around the ring, then along the path): the viewer draws back faces as cut faces.
  for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) { const a = j * (seg + 1) + i, b2 = a + seg + 1; idx.push(a, a + 1, b2, a + 1, b2 + 1, b2); }
  // Shade from the faces: the narrowings and round ends tilt the surface away from the ring directions.
  const fn = new Float32Array(pos.length);
  for (let t = 0; t < idx.length; t += 3) {
    const [p, q, w] = [idx[t] * 3, idx[t + 1] * 3, idx[t + 2] * 3];
    const e1 = [0, 1, 2].map((k) => pos[q + k] - pos[p + k]), e2 = [0, 1, 2].map((k) => pos[w + k] - pos[p + k]);
    const c = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    for (const v of [p, q, w]) for (let k = 0; k < 3; k++) fn[v + k] += c[k];
  }
  for (let v = 0; v < fn.length; v += 3) { const l = Math.hypot(fn[v], fn[v + 1], fn[v + 2]); if (l > 1e-12) for (let k = 0; k < 3; k++) nrm[v + k] = fn[v + k] / l; }
  return { pos, nrm, idx, ao };
}
/** A gently wandering path from p along dir: n points, each `step` apart. */
function wander(p, dir, n, step, wobble) {
  const out = [p];
  let d = dir;
  for (let i = 1; i < n; i++) {
    d = d.map((v) => v + (rand() - 0.5) * wobble); const l = Math.hypot(...d); d = d.map((v) => v / l);
    out.push(out[i - 1].map((v, k) => v + d[k] * step));
  }
  return out;
}

// Prisms about 5 µm across, in a hexagonal pattern, running from the surface (y = 0) 40 µm deep.
// Depth bands: the surface layer, then the subsurface body of the lesion, then the deeper front.
const BANDS = [[-6, 0], [-14, -6], [-22, -14], [-30, -22], [-40, -30]];
const PRISM_R = 2.45, PITCH = 5.2;
const prisms = [];
for (let row = -3; row <= 3; row++) for (let col = -3; col <= 3; col++) {
  const cx = col * PITCH + (row % 2 ? PITCH / 2 : 0), cz = row * PITCH * 0.866;
  if (Math.abs(cx) > 17 || Math.abs(cz) > 15) continue;
  prisms.push([cx, cz]);
}
BANDS.forEach(([y0, y1], b) => {
  const m = merge(prisms.map(([x, z]) => hexColumn(x, z, PRISM_R, y0 + 0.15, y1 - 0.15)));
  addMesh(`pr-band-${b}`, m.positions, m.tris, m.normals);
});
// Acquired pellicle: a thin protein film on the enamel.
{ const m = merge([hexSlab(-18, 18, -16, 16, 0, 0.8)]); addMesh('pr-pellicle', m.positions, m.tris, m.normals); }
// Biofilm matrix: extracellular polysaccharide over the pellicle, with an uneven top.
{
  const pos = [], nrm = [], idx = [];
  const N = 36, x0 = -18, x1 = 18, z0 = -16, z1 = 16;
  const top = (x, z) => 13 + 2.2 * Math.sin(x * 0.35) * Math.cos(z * 0.3) + 1.2 * Math.sin(x * 0.9 + z * 0.7);
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const x = x0 + ((x1 - x0) * i) / N, z = z0 + ((z1 - z0) * j) / N;
    pos.push(x, top(x, z), z);
    const e = 0.01, nx = -(top(x + e, z) - top(x - e, z)) / (2 * e), nz = -(top(x, z + e) - top(x, z - e)) / (2 * e), l = Math.hypot(nx, 1, nz);
    nrm.push(nx / l, 1 / l, nz / l);
  }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = j * (N + 1) + i, b = a + N + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const top_ = { pos, nrm, idx };
  // Sides down to the pellicle.
  const sides = [];
  for (const [ax, az, bx, bz, n] of [[x0, z0, x1, z0, [0, 0, -1]], [x1, z0, x1, z1, [1, 0, 0]], [x1, z1, x0, z1, [0, 0, 1]], [x0, z1, x0, z0, [-1, 0, 0]]]) {
    const p = [], nn = [], ii = [];
    for (let s = 0; s <= N; s++) {
      const x = ax + ((bx - ax) * s) / N, z = az + ((bz - az) * s) / N;
      p.push(x, 0.8, z, x, top(x, z), z); nn.push(...n, ...n);
      if (s) { const o = (s - 1) * 2; ii.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); }
    }
    sides.push({ pos: p, nrm: nn, idx: ii });
  }
  const m = merge([top_, ...sides]);
  addMesh('pr-biofilm-matrix', m.positions, m.tris, m.normals);
}
// Bacteria in the biofilm: chains of cocci (mutans streptococci) and rods (lactobacilli, actinomyces).
{
  // Cocci about 0.65 um across (S. mutans 0.5-0.75 um), in chains that narrow where the cells divide (as in
  // micrographs of streptococci); rods 0.76 um thick with round ends. One smooth body per chain or rod.
  const CELL = 0.64, R = 0.33, NECK = 0.62, ROD = 0.38;
  const cocci = [], rods = [];
  for (let n = 0; n < 34; n++) {
    const p = [-15 + rand() * 30, 2.2 + rand() * 9, -13 + rand() * 26];
    const dir = [rand() - 0.5, (rand() - 0.5) * 0.4, rand() - 0.5], l = Math.hypot(...dir);
    const cells = 3 + Math.floor(rand() * 5);
    const path = wander(p, dir.map((v) => v / l), cells * 4 + 1, CELL / 4, 0.25);
    const round = (s) => Math.sqrt(Math.max(0, 1 - (2 * ((s / CELL) % 1) - 1) ** 2));
    const end = (s, L) => s < CELL / 2 || s > L - CELL / 2;
    cocci.push(sweep(path, (s, L) => R * (end(s, L) ? round(s) : Math.max(round(s), NECK)),
      (s, L) => (end(s, L) ? 0 : 0.7 * (1 - Math.max(round(s), NECK)) ** 1.5)));
  }
  for (let n = 0; n < 22; n++) {
    const a = [-15 + rand() * 30, 2.2 + rand() * 9, -13 + rand() * 26];
    const dir = [rand() - 0.5, (rand() - 0.5) * 0.5, rand() - 0.5], l = Math.hypot(...dir), len = 2 + rand() * 2.5;
    rods.push(sweep(wander(a, dir.map((v) => v / l), 9, len / 8, 0.12), (s, L) => {
      const e = Math.min(s, L - s);
      return e < ROD ? Math.sqrt(Math.max(0, ROD * ROD - (ROD - e) ** 2)) : ROD;
    }));
  }
  for (const [name, parts] of [['pr-cocci', cocci], ['pr-rods', rods]]) {
    const m = merge(parts);
    addMesh(name, m.positions, m.tris, m.normals, new Float32Array(parts.flatMap((x) => x.ao)));
  }
}
function hexSlab(x0, x1, z0, z1, y0, y1) {
  const pos = [], nrm = [], idx = [];
  const quad = (a, b, c, d, n) => { const o = pos.length / 3; pos.push(...a, ...b, ...c, ...d); for (let i = 0; i < 4; i++) nrm.push(...n); idx.push(o, o + 1, o + 2, o, o + 2, o + 3); };
  quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0]);
  quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]);
  quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]);
  quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]);
  quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]);
  quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]);
  return { pos, nrm, idx };
}
log('process block');

mkdirSync('models-src', { recursive: true });
writeFileSync('models-src/cariology.glb', await new NodeIO().writeBinary(doc));
const tris = doc.getRoot().listMeshes().reduce((t, m) => t + m.listPrimitives()[0].getIndices().getCount() / 3, 0);
log(`cariology.glb: ${doc.getRoot().listNodes().length} parts, ${tris} triangles`);
