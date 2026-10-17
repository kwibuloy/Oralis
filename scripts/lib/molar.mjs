// The idealised mandibular first molar (right tooth: mesial +x, buccal +z, occlusal +y, millimetres)
// as a signed distance field, plus the surface-nets mesher. Shared by the carving tooth
// (build-carving-tooth.mjs) and the cariology lesion molar (build-cariology.mjs), so both are the same tooth.

// ---------- Wheeler, mandibular first molar (mm) ----------
export const WHEELER = {
  crownLength: 7.5, rootLength: 14.0, crownMD: 11.0, cervixMD: 9.0, crownBL: 10.5, cervixBL: 9.0,
  cervicalCurveMesial: 1.0, cervicalCurveDistal: 0.0,
};

// ---------- SDF helpers ----------
export const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smin = (a, b, k) => { const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1); return lerp(b, a, h) - k * h * (1 - h); };
export const smax = (a, b, k) => -smin(-a, -b, k);
/** Piecewise-linear profile through [y, value] stops. */
const profile = (stops) => (y) => {
  if (y <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) if (y <= stops[i][0]) return lerp(stops[i - 1][1], stops[i][1], (y - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]));
  return stops[stops.length - 1][1];
};
const ellipsoid = (p, c, r) => {
  const k0 = Math.hypot((p[0] - c[0]) / r[0], (p[1] - c[1]) / r[1], (p[2] - c[2]) / r[2]);
  const k1 = Math.hypot((p[0] - c[0]) / (r[0] * r[0]), (p[1] - c[1]) / (r[1] * r[1]), (p[2] - c[2]) / (r[2] * r[2]));
  return (k0 * (k0 - 1)) / (k1 || 1e-9);
};
export const segDist = (p, a, b) => {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const t = clamp((ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2), 0, 1);
  return Math.hypot(ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t);
};
const polyDist2 = (x, z, pts) => {
  let d = Infinity;
  for (let i = 1; i < pts.length; i++) d = Math.min(d, segDist([x, 0, z], [pts[i - 1][0], 0, pts[i - 1][1]], [pts[i][0], 0, pts[i][1]]));
  return d;
};

// ---------- Crown body: a rounded outline whose half-widths change with height ----------
// Mesial and distal half-widths: 4.5 at the cervix (MD 9.0), widest near the contact areas (MD 11.0).
const halfMesial = profile([[-3, 3.9], [0, 4.5], [4.5, 5.6], [5.9, 4.5]]);
const halfDistal = profile([[-3, 3.9], [0, 4.5], [3.8, 5.4], [5.9, 4.2]]);
// Buccal: height of contour in the cervical third, then strong convergence to a narrow occlusal table.
const halfBuccal = profile([[-3, 3.9], [0, 4.5], [1.4, 5.3], [3.5, 4.75], [5.9, 3.1]]);
// Lingual: height of contour in the middle third, less convergence.
const halfLingual = profile([[-3, 3.8], [0, 4.5], [3.5, 5.2], [5.9, 3.7]]);
export const BODY_TOP = 6.1; // occlusal table: the central fossa sits about 2–2.5 mm below the cusp tips
const BODY_BOTTOM = -3.0; // root trunk: the roots separate (furcation) about 3 mm below the CEJ

export function body(p) {
  const [x, y, z] = p;
  const a = x >= 0 ? halfMesial(y) : halfDistal(y);
  const b = z >= 0 ? halfBuccal(y) : halfLingual(y);
  const n = 3.2; // superellipse exponent: rounded-rectangular outline
  const r = ((Math.abs(x) / a) ** n + (Math.abs(z) / b) ** n) ** (1 / n);
  const side = (r - 1) * Math.min(a, b);
  return smax(smax(side, y - BODY_TOP, 1.2), BODY_BOTTOM - y, 1.6);
}

// ---------- Cusps (tip heights above the buccal CEJ; lingual cusps are the higher ones) ----------
export const CUSPS = {
  mesiobuccal: { c: [3.0, 7.5, 2.3], r: [2.6, 3.0, 2.4] },
  distobuccal: { c: [-0.75, 7.25, 2.55], r: [2.3, 2.9, 2.3] },
  distal: { c: [-3.85, 6.7, 1.5], r: [1.8, 2.5, 1.9] },
  mesiolingual: { c: [2.65, 8.0, -2.3], r: [2.6, 3.3, 2.4] },
  distolingual: { c: [-2.2, 7.75, -2.4], r: [2.4, 3.2, 2.3] },
};
export const cusp = (p, { c, r }) => ellipsoid(p, [c[0], c[1] - r[1], c[2]], r);

// ---------- Marginal ridges ----------
export const RIDGES = {
  mesialMarginal: [[4.55, 6.05, 1.9], [4.75, 5.95, 0], [4.55, 6.25, -1.9]],
  distalMarginal: [[-4.65, 5.75, 0.6], [-4.35, 5.95, -1.1], [-3.6, 6.2, -2.4]],
};
export const ridge = (p, pts, r) => { let d = Infinity; for (let i = 1; i < pts.length; i++) d = Math.min(d, segDist(p, pts[i - 1], pts[i])); return d - r; };

// ---------- Grooves (xz paths over the occlusal table, with floor heights) ----------
export const PITS = { central: [0.55, 0.15], mesial: [3.75, 0.05], distal: [-3.15, -0.15] };
export const PIT_Y = 5.15;
const GROOVES = [
  // Central developmental groove: mesial pit → central pit → distal pit (zig-zags between the cusps).
  { pts: [PITS.mesial, [2.2, 0.35], PITS.central, [-1.4, -0.2], PITS.distal], depth: 0.75, width: 0.55 },
  // Mesiobuccal developmental groove: central pit → between the MB and DB cusps, over the buccal margin.
  { pts: [PITS.central, [0.95, 2.4], [1.05, 4.6]], depth: 0.6, width: 0.45 },
  // Distobuccal developmental groove: from the central groove between the DB and distal cusps.
  { pts: [[-2.05, -0.05], [-2.55, 2.0], [-2.85, 3.9]], depth: 0.5, width: 0.4 },
  // Lingual developmental groove: central pit → between the ML and DL cusps, over the lingual margin.
  { pts: [PITS.central, [0.25, -2.4], [0.2, -4.6]], depth: 0.55, width: 0.42 },
];
/**
 * A V-shaped cut measured from the uncarved surface: `width` across at the surface, narrowing to
 * nothing `depth` below it. `inside` is how far p lies inside the uncarved tooth.
 */
const groove = (p, g, inside) => {
  if (p[1] < 3.6) return 1e3; // occlusal grooves stay on the occlusal table (finite: Infinity makes smax NaN)
  const d = polyDist2(p[0], p[2], g.pts);
  return d - g.width * clamp(1 - inside / g.depth, 0, 1) + (inside > g.depth ? inside - g.depth : 0);
};
// Developmental grooves continuing onto the buccal and lingual surfaces, ending in pits.
const SURFACE_GROOVES = [
  { a: [1.05, 5.6, 3.75], b: [1.0, 3.2, 4.85], r: 0.32 }, // mesiobuccal groove → buccal pit
  { a: [-2.85, 5.4, 3.2], b: [-2.95, 4.2, 3.95], r: 0.26 }, // distobuccal groove (short)
  { a: [0.2, 5.8, -4.35], b: [0.15, 4.4, -4.95], r: 0.28 }, // lingual groove
];
export const BUCCAL_PIT = [1.0, 3.2, 4.85];

// ---------- Roots: two, flattened mesiodistally, spreading apart (Wheeler, buccal aspect) ----------
// The mesial root bows mesially in its cervical half, then curves distally to an apex below the
// mesiobuccal cusp; the distal root is straighter, inclined distally, its apex below the distal contact.
export const ROOTS = {
  mesial: { top: -1.0, apex: -(WHEELER.rootLength - 0.55), x: (t) => 2.35 + 0.65 * t + 0.8 * Math.sin(Math.PI * t), z: (t) => 0.15 * t, hx: (t) => lerp(1.75, 0.55, t), hz: (t) => lerp(4.2, 1.0, t ** 0.9) },
  distal: { top: -1.0, apex: -(WHEELER.rootLength - 1.0), x: (t) => -2.5 - 2.0 * t, z: (t) => -0.1 * t, hx: (t) => lerp(1.7, 0.6, t), hz: (t) => lerp(3.9, 0.95, t ** 0.9) },
};
export function root(p, R) {
  const t = clamp((R.top - p[1]) / (R.top - R.apex), 0, 1);
  const cx = R.x(t), cz = R.z(t), hx = R.hx(t), hz = R.hz(t);
  const r = Math.hypot((p[0] - cx) / hx, (p[2] - cz) / hz);
  let d = (r - 1) * Math.min(hx, hz);
  // Rounded apex.
  if (p[1] < R.apex) d = Math.hypot(p[0] - R.x(1), p[1] - R.apex, p[2] - R.z(1)) - Math.min(R.hx(1), R.hz(1));
  return smax(d, p[1] - R.top - 1.5, 0.5);
}

/** The tooth's signed distance (negative inside), in millimetres. */
export function sdf(p) {
  let d = body(p);
  for (const c of Object.values(CUSPS)) d = smin(d, cusp(p, c), 1.1);
  d = smin(d, ridge(p, RIDGES.mesialMarginal, 0.7), 0.6);
  d = smin(d, ridge(p, RIDGES.distalMarginal, 0.6), 0.6);
  d = smin(d, root(p, ROOTS.mesial), 1.2);
  d = smin(d, root(p, ROOTS.distal), 1.2);
  const inside = -d;
  for (const g of GROOVES) d = smax(d, -groove(p, g, inside), 0.12);
  for (const s of SURFACE_GROOVES) d = smax(d, -(segDist(p, s.a, s.b) - s.r), 0.2);
  d = smax(d, -(Math.hypot(p[0] - BUCCAL_PIT[0], p[1] - BUCCAL_PIT[1], p[2] - BUCCAL_PIT[2]) - 0.38), 0.15);
  // Pits: pinpoint depressions where grooves meet, just below the fossa floor.
  for (const [x, z] of Object.values(PITS)) d = smax(d, -(Math.hypot(p[0] - x, (p[1] - PIT_Y) * 0.7, p[2] - z) - 0.24), 0.12);
  return d;
}

/** Cementoenamel junction height: level buccally and lingually, curving 1 mm occlusally on the mesial. */
export const cejY = (x, z) => WHEELER.cervicalCurveMesial * clamp(x / 4.5, 0, 1) ** 2 * clamp(1 - (z / 4.5) ** 2, 0, 1);

export const gradient = (p, e = 0.01, f = sdf) => {
  const g = [0, 1, 2].map((i) => { const a = [...p], b = [...p]; a[i] += e; b[i] -= e; return (f(a) - f(b)) / (2 * e); });
  const l = Math.hypot(...g) || 1;
  return g.map((v) => v / l);
};
/**
 * Move a point onto the surface along the gradient. Each step is capped and only kept if it gets
 * closer: near the carved grooves the field is not a true distance, and an uncapped step can throw a
 * vertex onto another part of the tooth.
 */
export const project = (p, maxMove = Infinity, f = sdf) => {
  let q = [...p], d = f(q);
  for (let i = 0; i < 6 && Math.abs(d) > 1e-4; i++) {
    const g = gradient(q, 0.01, f);
    const step = clamp(d, -0.5, 0.5);
    const next = q.map((v, k) => v - step * g[k]);
    const moved = Math.hypot(next[0] - p[0], next[1] - p[1], next[2] - p[2]);
    const nd = f(next);
    if (Math.abs(nd) >= Math.abs(d) || moved > maxMove) break;
    q = next; d = nd;
  }
  return q;
};
/** First surface hit from `from` along `dir`. */
export function cast(from, dir, f = sdf) {
  let t = 0;
  for (let i = 0; i < 400; i++) {
    const p = from.map((v, k) => v + dir[k] * t);
    const d = f(p);
    if (d < 0.002) return project(p, Infinity, f);
    t += Math.max(d * 0.8, 0.005);
    if (t > 60) break;
  }
  throw new Error(`No surface from ${from} along ${dir}`);
}
export const down = (x, z, f = sdf) => cast([x, 14, z], [0, -1, 0], f);

// ---------- Mesh: surface nets over a grid ----------
export const TOOTH_BOX = { min: [-6.8, -15.2, -6.8], max: [6.8, 9.2, 6.8] };
/** Sample a field on a grid: { min, n, step, field } with field[(k * n1 + j) * n0 + i]. */
export function sampleGrid(f, step, { min, max } = TOOTH_BOX) {
  const n = min.map((m, i) => Math.ceil((max[i] - m) / step) + 1);
  const field = new Float32Array(n[0] * n[1] * n[2]);
  const idx = (i, j, k) => (k * n[1] + j) * n[0] + i;
  for (let k = 0; k < n[2]; k++) for (let j = 0; j < n[1]; j++) for (let i = 0; i < n[0]; i++) field[idx(i, j, k)] = f([min[0] + i * step, min[1] + j * step, min[2] + k * step]);
  return { min, n, step, field };
}
/**
 * Surface nets over a sampled grid (negative inside). `snap` moves each vertex onto the true surface
 * of a field function (null keeps the grid-interpolated positions). `exposed(gridIndex)` can drop faces
 * whose outer side is not open air, e.g. where one region of a solid meets the next.
 */
export function surfaceNets(step, { grid = sampleGrid(sdf, step), snap = sdf, exposed = null } = {}) {
  const { min, n, field } = grid;
  const idx = (i, j, k) => (k * n[1] + j) * n[0] + i;

  const vert = new Int32Array((n[0] - 1) * (n[1] - 1) * (n[2] - 1)).fill(-1);
  const cidx = (i, j, k) => (k * (n[1] - 1) + j) * (n[0] - 1) + i;
  const positions = [];
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  for (let k = 0; k < n[2] - 1; k++) for (let j = 0; j < n[1] - 1; j++) for (let i = 0; i < n[0] - 1; i++) {
    const v = corners.map(([a, b, c]) => field[idx(i + a, j + b, k + c)]);
    if (v.every((x) => x < 0) || v.every((x) => x >= 0)) continue;
    let sx = 0, sy = 0, sz = 0, m = 0;
    for (const [a, b] of edges) {
      if ((v[a] < 0) === (v[b] < 0)) continue;
      const t = v[a] / (v[a] - v[b]);
      sx += corners[a][0] + (corners[b][0] - corners[a][0]) * t;
      sy += corners[a][1] + (corners[b][1] - corners[a][1]) * t;
      sz += corners[a][2] + (corners[b][2] - corners[a][2]) * t;
      m++;
    }
    vert[cidx(i, j, k)] = positions.length / 3;
    positions.push(min[0] + (i + sx / m) * step, min[1] + (j + sy / m) * step, min[2] + (k + sz / m) * step);
  }
  // A quad for every grid edge the surface crosses, joining the four cells around it.
  const quads = [];
  for (let k = 1; k < n[2] - 1; k++) for (let j = 1; j < n[1] - 1; j++) for (let i = 1; i < n[0] - 1; i++) {
    const inside = field[idx(i, j, k)] < 0;
    for (const axis of [0, 1, 2]) {
      const o = [0, 0, 0]; o[axis] = 1;
      const nextIndex = idx(i + o[0], j + o[1], k + o[2]);
      const next = field[nextIndex] < 0;
      if (inside === next) continue;
      if (exposed && !exposed(inside ? nextIndex : idx(i, j, k))) continue;
      const [u, w] = [[1, 2], [0, 2], [0, 1]][axis];
      const cell = (du, dw) => { const c = [i, j, k]; c[u] -= du; c[w] -= dw; return vert[cidx(c[0], c[1], c[2])]; };
      const q = [cell(0, 0), cell(1, 0), cell(1, 1), cell(0, 1)];
      if (q.some((x) => x < 0)) continue;
      // q winds counter-clockwise in (u, w), so its normal is u × w: +x for axis 0, −y for axis 1, +z for
      // axis 2. The outward normal is +axis when this grid point is inside and the next one outside.
      const alongAxis = axis !== 1;
      quads.push(inside === alongAxis ? q : q.reverse());
    }
  }
  // Snap each vertex onto the true surface (capped, see project()).
  if (snap) for (let v = 0; v < positions.length; v += 3) {
    const p = project([positions[v], positions[v + 1], positions[v + 2]], step * 0.75, snap);
    positions[v] = p[0]; positions[v + 1] = p[1]; positions[v + 2] = p[2];
  }
  return { positions: new Float32Array(positions), quads };
}
