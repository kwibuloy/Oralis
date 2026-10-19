// Build the authored parts of the Cariology model:
//   - the lesion molar: the shared mandibular first molar (lib/molar.mjs) with a quarter cut away, once
//     per stage of each lesion (lib/caries-lesions.mjs), every tissue and lesion zone its own part, with
//     the alveolar bone and gingiva around it; per-vertex rod/tubule directions for the viewer's texture;
//   - the process block: enamel prisms under the acquired pellicle and a dental biofilm, magnified.
//
//   node scripts/build-cariology.mjs            (STEP=0.08 mm grid by default)
//
// Writes models-src/cariology.glb (merged into public/models/cariology.glb by extract-bodyparts.mjs)
// and src/content/cariology.generated.json (stages, parts and pin positions; names and notes live in
// src/content/cariology.ts). Built as a right molar and mirrored to the left (FDI 36), like the carving
// tooth, so both read the same way; the cut faces are flat, the rest is the tooth's own surface.
// Needs a few GB of memory for the full-tooth grids: node --max-old-space-size=8192 if it runs out.
import { Document, NodeIO } from '@gltf-transform/core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { CUTS, enamelThickness, frameOf, LESIONS, onFace, PERIO, PERIO_REGIONS, perioFields, pulp, REGIONS, stageFields, uncarved } from './lib/caries-lesions.mjs';
import { smoothMesh, snapVertices } from './lib/mesh-tools.mjs';
import { sdf, surfaceNets } from './lib/molar.mjs';

const STEP = Number(process.env.STEP ?? 0.08);
const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene('cariology');
const t0 = Date.now();
const log = (m) => console.log(`${((Date.now() - t0) / 1000).toFixed(0).padStart(4)} s  ${m}`);

/**
 * Add a mesh node from positions, triangles and normals, plus optional per-vertex attributes for the
 * viewer's surface texture: _DIR (enamel rod or dentinal tubule direction), _DEPTH (distance from the
 * DEJ or the pulp, for incremental lines) and _CUT (1 on a cut face).
 */
function addMesh(name, positions, tris, normals, extra = {}) {
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(positions).setBuffer(buffer))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(normals).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(tris).setBuffer(buffer));
  for (const [attr, { type, array }] of Object.entries(extra)) prim.setAttribute(attr, doc.createAccessor().setType(type).setArray(array).setBuffer(buffer));
  scene.addChild(doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim)));
}

// ---------- Texture directions ----------
const dentinCore = (p) => uncarved(p) + enamelThickness(p); // negative inside; zero at the DEJ
const grad = (f, p, e = 0.02) => {
  const g = [0, 1, 2].map((i) => { const a = [...p], b = [...p]; a[i] += e; b[i] -= e; return (f(a) - f(b)) / (2 * e); });
  const l = Math.hypot(...g) || 1;
  return g.map((v) => v / l);
};
/** What texture a region gets: enamel (rods), dentin (tubules), pulp, or periodontium. */
const tissueOf = (region) => (region.startsWith('enamel') ? 'enamel' : region === 'pulp' ? 'pulp' : PERIO_REGIONS.includes(region) ? 'perio' : 'dentin');
/**
 * Enamel rods run from the DEJ to the surface (along the gradient of the dentin core); dentinal
 * tubules run from the pulp to the DEJ. _DEPTH is the distance above the DEJ in enamel (for the
 * striae of Retzius) and from the pulp in dentin (for incremental lines).
 */
function textureAt(p, tissue) {
  if (tissue === 'enamel') return { dir: grad(dentinCore, p), depth: Math.max(0, dentinCore(p)) };
  if (tissue === 'dentin') {
    const a = grad(pulp, p), b = grad(dentinCore, p);
    const d = [a[0] + b[0], a[1] + b[1], a[2] + b[2]], l = Math.hypot(...d) || 1;
    return { dir: d.map((v) => v / l), depth: Math.max(0, pulp(p)) };
  }
  return { dir: [0, 0, 0], depth: 0 };
}

/**
 * Turn surface-nets output into a mirrored (left) tooth mesh: drop unused vertices; give faces lying on
 * a cut plane their own vertices with the plane's normal (a crisp section edge) and _CUT = 1; smooth
 * the rest; add the texture attributes.
 */
function finishTooth(positions, quads, planes, tissue, step, { dropCut = false } = {}) {
  const onPlane = (v, i) => {
    const p = [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]];
    return onFace(planes, i, p, step * 0.6);
  };
  const tris = [];
  for (const [a, b, c, d] of quads) tris.push([a, b, c], [a, c, d]);
  const maps = [new Map(), ...planes.map(() => new Map())]; // smooth vertices, then one set per cut plane
  const out = [], outN = [], cut = [], index = [];
  const vertex = (v, plane) => {
    const map = maps[plane + 1];
    if (!map.has(v)) {
      map.set(v, out.length / 3);
      out.push(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]);
      if (plane < 0) outN.push(0, 0, 0); else { const n = [0, 0, 0]; n[planes[plane].axis] = planes[plane].side; outN.push(...n); }
      cut.push(plane < 0 ? 0 : 1);
    }
    return map.get(v);
  };
  for (const t of tris) {
    const plane = planes.findIndex((_, i) => t.every((v) => onPlane(v, i)));
    if (dropCut && plane >= 0) continue; // replaced by a contoured cut face (cutFaces)
    for (const v of t) index.push(vertex(v, plane));
  }
  // Smooth normals for the vertices not on a cut face (area-weighted face normals).
  const smooth = new Set(maps[0].values());
  for (let f = 0; f < index.length; f += 3) {
    const [a, b, c] = [index[f] * 3, index[f + 1] * 3, index[f + 2] * 3];
    const e1 = [0, 1, 2].map((k) => out[b + k] - out[a + k]), e2 = [0, 1, 2].map((k) => out[c + k] - out[a + k]);
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    for (const v of [index[f], index[f + 1], index[f + 2]]) if (smooth.has(v)) for (let k = 0; k < 3; k++) outN[v * 3 + k] += n[k];
  }
  for (const v of smooth) { const l = Math.hypot(outN[v * 3], outN[v * 3 + 1], outN[v * 3 + 2]) || 1; for (let k = 0; k < 3; k++) outN[v * 3 + k] /= l; }
  // Texture attributes, in the build's (right tooth) space.
  const n = out.length / 3, dir = new Float32Array(n * 3), depth = new Float32Array(n);
  for (let v = 0; v < n; v++) {
    const t = textureAt([out[v * 3], out[v * 3 + 1], out[v * 3 + 2]], tissue);
    dir.set(t.dir, v * 3); depth[v] = t.depth;
  }
  // Mirror to the left tooth: negate x (positions, normals, directions) and flip the winding.
  for (let v = 0; v < out.length; v += 3) { out[v] = -out[v]; outN[v] = -outN[v]; dir[v] = -dir[v]; }
  for (let f = 0; f < index.length; f += 3) [index[f + 1], index[f + 2]] = [index[f + 2], index[f + 1]];
  return {
    positions: new Float32Array(out), normals: new Float32Array(outN), tris: new Uint32Array(index),
    extra: { _DIR: { type: 'VEC3', array: dir }, _DEPTH: { type: 'SCALAR', array: depth }, _CUT: { type: 'SCALAR', array: new Float32Array(cut) } },
  };
}

// ---------- Lesion molar ----------
// Only the part of the tooth around a lesion changes from stage to stage. Each lesion type has a box
// that holds every stage of it: outside the box the cut tooth is built once ("static"), and each stage
// carries only what is inside the box.
const TOOTH = { min: [-6.8, -15.2, -6.8], max: [6.8, 9.2, 6.8] };
const LESION_BOX = {
  'pit-fissure': { min: [-1.8, 0.3, -4.8], max: [6.8, 9.2, 4.8] },
  'smooth-surface': { min: [1.4, -0.2, -6.8], max: [6.8, 7.6, 6.8] },
  root: { min: [-2.6, -4.2, 0.2], max: [6.8, 1.6, 6.8] },
};
/** Negative inside the lesion box. */
const boxField = (b) => (p) => Math.max(b.min[0] - p[0], p[0] - b.max[0], b.min[1] - p[1], p[1] - b.max[1], b.min[2] - p[2], p[2] - b.max[2]);

function gridFor(box, step) {
  const min = box.min.map((v, i) => Math.max(v - 3 * step, TOOTH.min[i])), max = box.max.map((v, i) => Math.min(v + 3 * step, TOOTH.max[i]));
  const n = min.map((m, i) => Math.ceil((max[i] - m) / step) + 1);
  return { min, n, step, count: n[0] * n[1] * n[2] };
}
/** The tooth fields (outer surface, uncarved surface, pulp) on a grid, computed once per grid. */
const baseCache = new Map();
function baseFields(box) {
  const g = gridFor(box, STEP);
  const key = `${g.min.join()}:${g.n.join()}`;
  if (baseCache.has(key)) return baseCache.get(key);
  const T = new Float32Array(g.count), T0 = new Float32Array(g.count), P = new Float32Array(g.count);
  let i = 0;
  for (let k = 0; k < g.n[2]; k++) for (let j = 0; j < g.n[1]; j++) for (let x = 0; x < g.n[0]; x++, i++) {
    const p = [g.min[0] + x * STEP, g.min[1] + j * STEP, g.min[2] + k * STEP];
    T[i] = sdf(p);
    // Far outside the tooth the other fields don't matter.
    if (T[i] > 0.5) { T0[i] = T[i]; P[i] = 5; continue; }
    T0[i] = uncarved(p); P[i] = pulp(p);
  }
  const base = { g, T, T0, P };
  baseCache.set(key, base);
  log(`tooth fields ${g.n.join('×')}`);
  return base;
}

/**
 * Each region grows a little into its neighbours (never into open air, which `S` bounds): regions that meet
 * exactly leave hairline cracks where their snapped, smoothed walls drift apart, and through a crack the
 * background shows. Overlapping, the neighbour's wall fills the crack.
 */
const GROW = STEP * 0.6;
/** How far from open air and from the lesion box the static part keeps its inner walls (mm). */
const EDGE = 0.8;

/**
 * Cut faces drawn from each zone's own field, for the lesions whose zones meet on the section (pit and
 * fissure, smooth surface). Surface nets put a zone's edge on the grid, so on the flat section the
 * boundaries stair-stepped, and zones grown into each other (GROW) overlapped in one plane and flickered
 * as dots. Here every zone's face on a cut plane is the same grid of triangles clipped at its field's
 * zero, so neighbours share one smooth edge with no overlap and no gap, at the old triangle count.
 * Each vertex also carries its nearest other zone (_NBR, an index into REGIONS) and how far towards it
 * the colour blends (_BLEND, 0.5 on the boundary): the viewer fades zone colours into each other there.
 */
const CAP_KINDS = ['pit-fissure', 'smooth-surface'];
const BLEND_W = 0.22; // mm each side of a boundary
function cutFaces(kind, stage, part) {
  const planes = CUTS[kind];
  const f = stageFields(kind, stage, { cut: false });
  const inBox = boxField(LESION_BOX[kind]);
  const clip = (p) => (part === 'stage' ? inBox(p) : -inBox(p)); // no overlap between the two parts here
  const out = Object.fromEntries(REGIONS.map((r) => [r, { pos: [], tris: [], nbr: [], blend: [], plane: [] }]));
  const evalAt = (p) => f(p, { T: sdf(p), T0: uncarved(p), P: pulp(p) });
  planes.forEach((plane, pi) => {
    const [ua, va] = [0, 1, 2].filter((a) => a !== plane.axis);
    const u0 = TOOTH.min[ua], v0 = TOOTH.min[va];
    const nu = Math.ceil((TOOTH.max[ua] - u0) / STEP) + 1, nv = Math.ceil((TOOTH.max[va] - v0) / STEP) + 1;
    const at = (i, j) => { const p = [0, 0, 0]; p[plane.axis] = plane.at; p[ua] = u0 + i * STEP; p[va] = v0 + j * STEP; return p; };
    // Beyond every other plane (on the exposed face), within this part's side of the lesion box.
    const mask = (p) => Math.max(clip(p), ...planes.filter((_, j) => j !== pi).map((c) => -c.side * (p[c.axis] - c.at)));
    // Field of every region at every node (positive outside); +1 off the face or far outside the tooth.
    const F = REGIONS.map(() => new Float32Array(nu * nv).fill(1));
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const p = at(i, j), m = mask(p);
      if (m > STEP * 1.5 || sdf(p) > 0.3) continue;
      const res = evalAt(p);
      REGIONS.forEach((r, ri) => { F[ri][j * nu + i] = Math.max(res.regions[r], res.S, m); });
    }
    const n = [0, 0, 0]; n[plane.axis] = plane.side;
    REGIONS.forEach((r, ri) => {
      const Fr = F[ri];
      if (!Fr.some((x) => x < 0)) return;
      const o = out[r], map = new Map();
      const first = o.pos.length / 3;
      const vert = (a, b) => {
        // A grid node (b < 0) or the zero crossing on the edge between two nodes.
        const key = b < 0 ? `n${a}` : a < b ? `${a},${b}` : `${b},${a}`;
        if (map.has(key)) return map.get(key);
        const pa = at(a % nu, Math.floor(a / nu));
        let p = pa;
        if (b >= 0) { const pb = at(b % nu, Math.floor(b / nu)), t = Fr[a] / (Fr[a] - Fr[b]); p = pa.map((x, k) => x + (pb[k] - x) * t); }
        const id = o.pos.length / 3;
        o.pos.push(...p);
        map.set(key, id);
        return id;
      };
      const clipTri = (t) => {
        const inside = t.map((x) => Fr[x] < 0), k = inside.filter(Boolean).length;
        if (!k) return [];
        if (k === 3) return [t.map((x) => vert(x, -1))];
        const odd = inside.findIndex((x) => (k === 1 ? x : !x));
        const [a, b, c] = [t[odd], t[(odd + 1) % 3], t[(odd + 2) % 3]];
        if (k === 1) return [[vert(a, -1), vert(a, b), vert(a, c)]];
        return [[vert(a, b), vert(b, -1), vert(c, -1)], [vert(a, b), vert(c, -1), vert(a, c)]];
      };
      for (let j = 0; j < nv - 1; j++) for (let i = 0; i < nu - 1; i++) {
        const a = j * nu + i, b = a + 1, c = a + nu + 1, d = a + nu;
        for (const tri of [...clipTri([a, b, c]), ...clipTri([a, c, d])]) {
          // Face the removed quarter (the plane's normal).
          const P = tri.map((v) => o.pos.slice(v * 3, v * 3 + 3));
          const e1 = P[1].map((x, k) => x - P[0][k]), e2 = P[2].map((x, k) => x - P[0][k]);
          const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
          if (Math.hypot(...cr) < 1e-12) continue;
          if (cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] < 0) [tri[1], tri[2]] = [tri[2], tri[1]];
          o.tris.push(...tri);
        }
      }
      // Plane, nearest other zone and blend for each new vertex.
      for (let v = first; v < o.pos.length / 3; v++) {
        o.plane.push(pi);
        const res = evalAt(o.pos.slice(v * 3, v * 3 + 3));
        let best = Infinity, nbr = ri;
        REGIONS.forEach((q, qi) => { if (qi === ri) return; const d = Math.max(res.regions[q], res.S); if (d < best) { best = d; nbr = qi; } });
        const t = Math.min(1, Math.max(0, best / BLEND_W));
        o.nbr.push(nbr); o.blend.push(0.5 * (1 - t * t * (3 - 2 * t)));
      }
    });
  });
  return out;
}

/** The zone's mesh (cut faces dropped) plus its contoured cut faces, mirrored to the left tooth like the rest. */
function withCap(m, cap, r, planes) {
  const ri = REGIONS.indexOf(r), tissue = tissueOf(r);
  const nOld = m.positions.length / 3, nCap = cap.pos.length / 3, n = nOld + nCap;
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), dir = new Float32Array(n * 3), depth = new Float32Array(n), cut = new Float32Array(n);
  const nbr = new Float32Array(n).fill(ri), blend = new Float32Array(n);
  pos.set(m.positions); nrm.set(m.normals); dir.set(m.extra._DIR.array); depth.set(m.extra._DEPTH.array); cut.set(m.extra._CUT.array);
  for (let v = 0; v < nCap; v++) {
    const p = cap.pos.slice(v * 3, v * 3 + 3), pl = planes[cap.plane[v]], w = nOld + v;
    const t = textureAt(p, tissue);
    pos.set([-p[0], p[1], p[2]], w * 3);
    const nn = [0, 0, 0]; nn[pl.axis] = pl.side; nrm.set([-nn[0], nn[1], nn[2]], w * 3);
    dir.set([-t.dir[0], t.dir[1], t.dir[2]], w * 3); depth[w] = t.depth; cut[w] = 1;
    nbr[w] = cap.nbr[v]; blend[w] = cap.blend[v];
  }
  const tris = new Uint32Array(m.tris.length + cap.tris.length);
  tris.set(m.tris);
  // Mirroring flips the winding, as finishTooth does for its own faces.
  for (let k = 0; k < cap.tris.length; k += 3) tris.set([cap.tris[k] + nOld, cap.tris[k + 2] + nOld, cap.tris[k + 1] + nOld], m.tris.length + k);
  return [pos, tris, nrm, { _DIR: { type: 'VEC3', array: dir }, _DEPTH: { type: 'SCALAR', array: depth }, _CUT: { type: 'SCALAR', array: cut }, _NBR: { type: 'SCALAR', array: nbr }, _BLEND: { type: 'SCALAR', array: blend } }];
}

/** Mesh every region of one lesion stage (or the static part around a lesion type). Returns the parts made. */
function buildRegions(kind, stage, part, prefix) {
  const planes = CUTS[kind];
  const { g, T, T0, P } = baseFields(part === 'stage' ? LESION_BOX[kind] : TOOTH);
  const f = stageFields(kind, stage);
  const S = new Float32Array(g.count);
  const fields = Object.fromEntries(REGIONS.map((r) => [r, new Float32Array(g.count)]));
  const owner = new Int8Array(g.count).fill(-1); // the region each grid point belongs to (before GROW)
  const inBox = boxField(LESION_BOX[kind]);
  let i = 0;
  for (let k = 0; k < g.n[2]; k++) for (let j = 0; j < g.n[1]; j++) for (let x = 0; x < g.n[0]; x++, i++) {
    const p = [g.min[0] + x * STEP, g.min[1] + j * STEP, g.min[2] + k * STEP];
    if (T[i] > 0.5) { S[i] = T[i]; for (const r of REGIONS) fields[r][i] = T[i]; continue; }
    const res = f(p, { T: T[i], T0: T0[i], P: P[i] });
    S[i] = res.S;
    // This part's side of the box, overlapping the other part by half a cell so the cut face has no seam.
    const clip = part === 'stage' ? inBox(p) - STEP / 2 : -inBox(p) - STEP / 2;
    for (const r of REGIONS) fields[r][i] = Math.max(res.regions[r] - GROW, res.S, clip);
    owner[i] = REGIONS.findIndex((r) => res.regions[r] < 0);
  }
  const made = [];
  const fCut = stageFields(kind, stage, { cut: false });
  const region = (fn, r) => (p) => {
    const res = fn(p, { T: sdf(p), T0: uncarved(p), P: pulp(p) });
    return Math.max(res.regions[r] - GROW, res.S, part === 'stage' ? inBox(p) - STEP / 2 : -inBox(p) - STEP / 2);
  };
  const caps = CAP_KINDS.includes(kind) ? cutFaces(kind, stage, part) : null;
  for (const r of REGIONS) {
    const field = fields[r];
    if (!field.some((v) => v < 0)) continue;
    // Stage parts (where each lesion's timeline plays) are closed solids. The static part around them is
    // solid within EDGE of open air (outer surface, cut faces) and of the lesion box, so every edge and
    // every zone near the timeline has its walls; only walls buried deep between two sound tissues, far
    // from both, are left out, which no camera reaches through the opaque tooth.
    // On a surface facing air (the cavity walls, the outer surface) a zone keeps only the faces of points it
    // owns, not of the margin it grew into its neighbours: both drew a face there, on the same surface, and
    // the two flickered through each other in rows ("potholes" on the cavity walls). GROW still closes the
    // walls between zones inside the tooth.
    const ri = REGIONS.indexOf(r), own = CAP_KINDS.includes(kind);
    const exposed = (idx, inner) => {
      if (own && S[idx] >= 0 && owner[inner] !== ri) return false;
      if (part === 'stage') return true;
      if (S[idx] >= -EDGE) return true;
      const x = idx % g.n[0], j = Math.floor(idx / g.n[0]) % g.n[1], k = Math.floor(idx / (g.n[0] * g.n[1]));
      return inBox([g.min[0] + x * STEP, g.min[1] + j * STEP, g.min[2] + k * STEP]) < EDGE;
    };
    const { positions, quads } = surfaceNets(STEP, { grid: { min: g.min, n: g.n, field }, snap: null, exposed });
    if (!quads.length) continue;
    snapVertices(positions, planes, region(f, r), region(fCut, r), STEP);
    smoothMesh(positions, quads, planes, STEP);
    const m = finishTooth(positions, quads, planes, tissueOf(r), STEP, { dropCut: !!caps });
    if (caps) addMesh(`${prefix}-${r}`, ...withCap(m, caps[r], r, planes));
    else addMesh(`${prefix}-${r}`, m.positions, m.tris, m.normals, m.extra);
    made.push(r);
  }
  return made;
}

/** Alveolar bone and gingiva around the root, cut the same way as the tooth. */
const PERIO_STEP = 0.1;
function buildPerio(kind) {
  const box = { min: [-7.6, -17.2, -6.4], max: [7.6, PERIO[kind].margin + 1.8, 6.6] };
  const n = box.min.map((m, i) => Math.ceil((box.max[i] - m) / PERIO_STEP) + 1);
  const count = n[0] * n[1] * n[2];
  const fields = Object.fromEntries(PERIO_REGIONS.map((r) => [r, new Float32Array(count)]));
  const f = perioFields(kind);
  let i = 0;
  for (let k = 0; k < n[2]; k++) for (let j = 0; j < n[1]; j++) for (let x = 0; x < n[0]; x++, i++) {
    const p = [box.min[0] + x * PERIO_STEP, box.min[1] + j * PERIO_STEP, box.min[2] + k * PERIO_STEP];
    const T = sdf(p);
    const r = f(p, T);
    for (const name of PERIO_REGIONS) fields[name][i] = r[name];
  }
  const fCut = perioFields(kind, { cut: false });
  for (const r of PERIO_REGIONS) {
    const { positions, quads } = surfaceNets(PERIO_STEP, { grid: { min: box.min, n, field: fields[r] }, snap: null });
    snapVertices(positions, CUTS[kind], (p) => f(p, sdf(p))[r], (p) => fCut(p, sdf(p))[r], PERIO_STEP);
    smoothMesh(positions, quads, CUTS[kind], PERIO_STEP);
    const m = finishTooth(positions, quads, CUTS[kind], 'perio', PERIO_STEP);
    addMesh(`cl-${kind}-perio-${r}`, m.positions, m.tris, m.normals, m.extra);
  }
  log(`${kind} periodontium`);
}

// ---------- Pins: a point inside each lesion zone, on either cut face ----------
function zonePins(kind, stage) {
  const planes = CUTS[kind];
  const f = stageFields(kind, stage);
  const PX = 0.04;
  const best = new Map(); // region → { d, p, plane }
  planes.forEach((plane, pi) => {
    const [ua, va] = [0, 1, 2].filter((a) => a !== plane.axis);
    const u0 = TOOTH.min[ua], v0 = TOOTH.min[va];
    const w = Math.round((TOOTH.max[ua] - u0) / PX), h = Math.round((TOOTH.max[va] - v0) / PX);
    const label = new Int16Array(w * h).fill(-1);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const p = [0, 0, 0];
      p[plane.axis] = plane.at; p[ua] = u0 + i * PX; p[va] = v0 + j * PX;
      if (!onFace(planes, pi, p, 0.01)) continue;
      p[plane.axis] -= plane.side * 0.01; // just inside the kept part
      const T = sdf(p);
      if (T > 0.2) continue;
      const { S, regions } = f(p, { T, T0: uncarved(p), P: pulp(p) });
      if (S >= 0) continue;
      label[j * w + i] = REGIONS.findIndex((r) => regions[r] < 0);
    }
    // Distance (in pixels) to the nearest pixel of another label, by two chamfer passes.
    const dist = new Float32Array(w * h).fill(1e9);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const l = label[j * w + i];
      const edge = i === 0 || j === 0 || i === w - 1 || j === h - 1 || label[j * w + i - 1] !== l || label[j * w + i + 1] !== l || label[(j - 1) * w + i] !== l || label[(j + 1) * w + i] !== l;
      if (edge) dist[j * w + i] = 0;
    }
    const relax = (i, j, di, dj, c) => { const a = (j + dj) * w + i + di; if (label[a] === label[j * w + i]) dist[j * w + i] = Math.min(dist[j * w + i], dist[a] + c); };
    for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) { relax(i, j, -1, 0, 1); relax(i, j, 0, -1, 1); relax(i, j, -1, -1, 1.414); relax(i, j, 1, -1, 1.414); }
    for (let j = h - 2; j > 0; j--) for (let i = w - 2; i > 0; i--) { relax(i, j, 1, 0, 1); relax(i, j, 0, 1, 1); relax(i, j, 1, 1, 1.414); relax(i, j, -1, 1, 1.414); }
    for (let a = 0; a < w * h; a++) {
      if (label[a] < 0) continue;
      const r = REGIONS[label[a]];
      if ((best.get(r)?.d ?? 0) >= dist[a]) continue;
      const p = [0, 0, 0];
      p[plane.axis] = plane.at; p[ua] = u0 + (a % w) * PX; p[va] = v0 + Math.floor(a / w) * PX;
      best.set(r, { d: dist[a], p, plane: pi });
    }
  });
  return REGIONS.filter((r) => best.has(r)).map((r) => {
    const { p, plane } = best.get(r);
    const normal = [0, 0, 0]; normal[planes[plane].axis] = planes[plane].side;
    return { region: r, position: [-p[0], p[1], p[2]].map((v) => +v.toFixed(3)), normal: [-normal[0], normal[1], normal[2]] };
  });
}

const lesions = {};
for (const [kind, L] of Object.entries(LESIONS)) {
  const frame = frameOf(kind);
  const statics = buildRegions(kind, 0, 'static', `cl-${kind}-static`);
  log(`${kind} static: ${statics.join(', ')}`);
  buildPerio(kind);
  const stages = [];
  for (let s = 0; s < L.stages.length; s++) {
    const parts = buildRegions(kind, s, 'stage', `cl-${kind}-${s}`);
    stages.push({ parts, pins: zonePins(kind, s).filter((p) => !['enamel', 'dentin', 'cementum'].includes(p.region)) });
    log(`${kind} stage ${s}: ${parts.join(', ')}`);
  }
  // Look into the removed quarter, a little from above.
  const view = [0, 0.55, 0];
  for (const c of CUTS[kind]) view[c.axis] += c.side;
  if (CUTS[kind].every((c) => c.axis !== 2)) view[2] += 0.9; // a horizontal cut: also from buccal, where the lesion is
  if (CUTS[kind].every((c) => c.axis !== 0)) view[0] += 0.5; // and from mesial
  lesions[kind] = {
    cuts: CUTS[kind], static: `cl-${kind}-static`, staticParts: statics, perio: `cl-${kind}-perio`,
    view: [-view[0], view[1], view[2]].map((v) => +v.toFixed(2)), origin: [-frame.origin[0], frame.origin[1], frame.origin[2]].map((v) => +v.toFixed(3)), stages,
  };
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
/** A rod-shaped bacterium: a capsule from a to b. */
function capsuleMesh(a, b, r) {
  const parts = [];
  const steps = 6;
  for (let s = 0; s <= steps; s++) parts.push(sphere(a.map((v, i) => v + (b[i] - v) * (s / steps)), r, 12, 8));
  return parts;
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
  const cocci = [], rods = [];
  for (let n = 0; n < 34; n++) {
    let p = [-15 + rand() * 30, 2.2 + rand() * 9, -13 + rand() * 26];
    const dir = [rand() - 0.5, (rand() - 0.5) * 0.4, rand() - 0.5];
    const l = Math.hypot(...dir);
    for (let c = 0, len = 3 + Math.floor(rand() * 5); c < len; c++) {
      cocci.push(sphere(p, 0.5));
      p = p.map((v, i) => v + (dir[i] / l) * 0.98 + (rand() - 0.5) * 0.15);
    }
  }
  for (let n = 0; n < 22; n++) {
    const a = [-15 + rand() * 30, 2.2 + rand() * 9, -13 + rand() * 26];
    const dir = [rand() - 0.5, (rand() - 0.5) * 0.5, rand() - 0.5], l = Math.hypot(...dir), len = 2 + rand() * 2.5;
    rods.push(...capsuleMesh(a, a.map((v, i) => v + (dir[i] / l) * len), 0.38));
  }
  for (const [name, parts] of [['pr-cocci', cocci], ['pr-rods', rods]]) { const m = merge(parts); addMesh(name, m.positions, m.tris, m.normals); }
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
writeFileSync('src/content/cariology.generated.json', JSON.stringify({ units: { lesion: 'mm', process: 'µm' }, regions: REGIONS, lesions, bands: BANDS.length }, null, 1) + '\n');
const tris = doc.getRoot().listMeshes().reduce((t, m) => t + m.listPrimitives()[0].getIndices().getCount() / 3, 0);
log(`cariology.glb: ${doc.getRoot().listNodes().length} parts, ${tris} triangles`);
