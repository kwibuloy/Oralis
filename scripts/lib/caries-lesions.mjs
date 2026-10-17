// Tissues and caries lesions of the cariology molar, as signed fields (negative inside, millimetres) on
// the shared mandibular first molar (lib/molar.mjs; right tooth: mesial +x, buccal +z, occlusal +y).
//
// Every point of the sectioned tooth belongs to exactly one region: sound enamel, dentin, cementum and
// pulp, or one of the lesion zones. Regions are built from the same few fields with max() and their
// complements, so they tile the tooth without gaps. Lesion shapes follow the textbook descriptions
// (Kidd & Fejerskov; Sturdevant): a pit-and-fissure enamel lesion is a cone with its base towards the
// DEJ, a smooth-surface enamel lesion a cone with its base at the surface; both then spread along the
// DEJ and form a cone in dentin with its base at the DEJ and its apex towards the pulp. Sizes are
// schematic but kept within the tooth's real tissue thicknesses. Lesion fronts and cavity walls carry
// a little smooth noise, so they are irregular like real lesions while keeping the textbook shapes.
//
// Each lesion is shown with a quarter of the tooth removed: two cut faces meet at a corner that runs
// through the lesion, so the lesion is seen from two sides and the cavity is a real hole. Gingiva and
// alveolar bone surround the root (receded for root caries).
import { body, cast, cejY, clamp, CUSPS, cusp, down, lerp, ridge, RIDGES, root, ROOTS, sdf, segDist, smin } from './molar.mjs';
import { fbm } from './noise.mjs';

const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** The tooth before the grooves and pits are carved: the DEJ follows this smoother form. */
export function uncarved(p) {
  let d = body(p);
  for (const c of Object.values(CUSPS)) d = smin(d, cusp(p, c), 1.1);
  d = smin(d, ridge(p, RIDGES.mesialMarginal, 0.7), 0.6);
  d = smin(d, ridge(p, RIDGES.distalMarginal, 0.6), 0.6);
  d = smin(d, root(p, ROOTS.mesial), 1.2);
  return smin(d, root(p, ROOTS.distal), 1.2);
}

/**
 * Enamel thickness: about 2.3 mm over the cusps and occlusal table, about 1.3 mm on the axial surfaces,
 * thinning to nothing at the cementoenamel junction.
 */
export function enamelThickness(p) {
  const h = p[1] - cejY(p[0], p[2]);
  if (h <= 0) return 0;
  return lerp(1.3, 2.3, smoothstep(3.0, 6.5, p[1])) * smoothstep(0, 2.2, h);
}

/** Cementum over the root: a thin layer (schematic 0.15 mm), below the CEJ. */
export const CEMENTUM = 0.15;

// ---------- Pulp: chamber with horns under the cusps, and the root canals ----------
const roundBox = (p, c, h, r) => {
  const q = [0, 1, 2].map((i) => Math.abs(p[i] - c[i]) - h[i] + r);
  return Math.hypot(Math.max(q[0], 0), Math.max(q[1], 0), Math.max(q[2], 0)) + Math.min(Math.max(q[0], q[1], q[2]), 0) - r;
};
// Horn tips sit under the cusps (the mesial horns highest), about 2 mm of dentin below the DEJ; the
// two mesial horns lie in one buccolingual plane, so the section through the mesial cusps shows both.
const HORNS = [
  [CUSPS.mesiobuccal, 3.4, 2.5], [CUSPS.mesiolingual, 3.5, 2.5], [CUSPS.distobuccal, 3.1], [CUSPS.distolingual, 3.2], [CUSPS.distal, 2.7],
];
const capsule = (p, a, b, r) => segDist(p, a, b) - r;
/** A canal following a root's centre line, offset buccolingually by `zFrac` of the root's half-width. */
function canal(p, R, zFrac, r0, r1) {
  let d = Infinity;
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const t = (i / 12) * 0.96;
    pts.push([R.x(t), lerp(R.top, R.apex, t), R.z(t) + zFrac * R.hz(t) * 0.5]);
  }
  for (let i = 1; i < pts.length; i++) d = Math.min(d, capsule(p, pts[i - 1], pts[i], lerp(r0, r1, i / 12)));
  return d;
}
export function pulp(p) {
  let d = roundBox(p, [0.1, 0.35, 0], [2.9, 1.35, 1.95], 1.2);
  for (const [c, tip, hx] of HORNS) {
    const x = hx ?? c.c[0] * 0.85, z = c.c[2] * 0.72;
    d = smin(d, capsule(p, [x, 1.2, z * 0.85], [x, tip - 0.4, z], 0.42), 0.5);
  }
  // Two canals in the mesial root (mesiobuccal, mesiolingual), one ribbon-shaped canal in the distal root.
  d = smin(d, canal(p, ROOTS.mesial, 0.85, 0.42, 0.12), 0.4);
  d = smin(d, canal(p, ROOTS.mesial, -0.85, 0.42, 0.12), 0.4);
  const distal = canal(p, ROOTS.distal, 0, 0.45, 0.14);
  d = smin(d, Math.min(distal, canal(p, ROOTS.distal, 0.55, 0.38, 0.12), canal(p, ROOTS.distal, -0.55, 0.38, 0.12)), 0.4);
  return d;
}

// ---------- Cut-aways ----------
/**
 * The quarter removed for each lesion: the points beyond both planes (p[axis] − at has the sign of
 * `side` for both). The two planes meet in a line through the lesion.
 */
export const CUTS = {
  // A buccolingual cut through the mesial cusps and a mesiodistal cut along the central groove: the
  // mesiobuccal quarter of the crown is removed and the fissure lesion is seen from mesial and buccal.
  'pit-fissure': [{ axis: 0, at: 2.6, side: 1 }, { axis: 2, at: 0.3, side: 1 }],
  // A mesiodistal cut through the contact areas and a horizontal cut through the lesion: the
  // occlusobuccal quarter is removed, showing the lesion from buccal and from above.
  'smooth-surface': [{ axis: 2, at: 0.15, side: 1 }, { axis: 1, at: 3.2, side: 1 }],
  // A buccolingual cut through the mesial root and a horizontal cut through the lesion: the mesial
  // crown above the lesion is removed, showing the lesion lengthwise and in a cross-section of the root.
  root: [{ axis: 0, at: 2.6, side: 1 }, { axis: 1, at: -1.3, side: 1 }],
};
/** Negative on the kept part of the tooth (positive in the removed quarter). */
export const cutField = (planes) => (p) => Math.min(...planes.map((c) => c.side * (p[c.axis] - c.at)));
/** Is p on the exposed part of cut plane i (beyond every other plane)? */
export const onFace = (planes, i, p, tol = 0.05) =>
  Math.abs(p[planes[i].axis] - planes[i].at) < tol && planes.every((c, j) => j === i || c.side * (p[c.axis] - c.at) > -tol);

// ---------- Lesion geometry ----------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(...a); return a.map((v) => v / l); };

/** Horizontal distance from p to a polyline in the occlusal (xz) plane. */
const polyDistXZ = (p, pts) => {
  let d = Infinity;
  for (let i = 1; i < pts.length; i++) d = Math.min(d, segDist([p[0], 0, p[2]], [pts[i - 1][0], 0, pts[i - 1][1]], [pts[i][0], 0, pts[i][1]]));
  return d;
};

/**
 * Each lesion kind gives, for a point, its lateral distance from the lesion's axis and the
 * stage-independent frame; stages give the sizes. All lengths are millimetres.
 */
/**
 * The point of the pulp nearest the lesion: tertiary dentin forms on the pulp wall around it, where the
 * odontoblasts beneath the lesion are stimulated.
 */
const pulpTip = (origin, kind) => {
  const planes = CUTS[kind];
  let best = null, bestD = Infinity;
  for (let x = -6; x <= 6; x += 0.1) for (let y = -6; y <= 6; y += 0.1) for (let z = -5; z <= 5; z += 0.1) {
    const q = [x, y, z];
    // On a cut face, so the tertiary dentin shows in the section.
    if (!planes.some((_, i) => onFace(planes, i, q, 0.06)) || Math.abs(pulp(q)) > 0.06) continue;
    const d = Math.hypot(x - origin[0], y - origin[1], z - origin[2]);
    if (d < bestD) { bestD = d; best = q; }
  }
  return best;
};
const FAR = 1e3;
function fissureFrame() {
  // The central groove where the plane crosses it, between the mesial pit and the central fossa.
  const line = [[3.75, 0.05], [2.2, 0.35]];
  const at = CUTS['pit-fissure'][0].at;
  const origin = down(at, lerp(0.05, 0.35, (3.75 - at) / 1.55));
  return { origin, tip: pulpTip(origin, 'pit-fissure'), lateral: (p) => (p[1] < 0 ? FAR : polyDistXZ(p, line)) };
}
function proximalFrame() {
  const origin = cast([14, CUTS['smooth-surface'][1].at, CUTS['smooth-surface'][0].at], [-1, 0, 0]);
  const axis = norm([-1, -0.15, 0]);
  return {
    origin, tip: pulpTip(origin, 'smooth-surface'),
    // Elliptical (wider buccolingually than tall), and only on this side of the tooth.
    lateral: (p) => {
      const v = sub(p, origin), a = dot(v, axis);
      if (a < -0.5 || a > 3.8) return FAR;
      const l = sub(v, axis.map((c) => c * a));
      return Math.hypot(l[1], l[2] / 1.4);
    },
  };
}
function rootFrame() {
  const origin = cast([CUTS.root[0].at, CUTS.root[1].at, 14], [0, 0, -1]);
  return {
    origin, tip: pulpTip(origin, 'root'),
    // Root lesions spread around the root (here along x) more than they deepen; buccal side only.
    lateral: (p) => (p[2] < origin[2] - 3.2 ? FAR : Math.hypot((p[0] - origin[0]) / 1.9, (p[1] - origin[1]) / 1.0)),
  };
}

/**
 * Stage sizes. enamel: r0/r1 (pit & fissure: half-width at the surface and at the DEJ) or R/k
 * (smooth surface: radius at the surface, fraction left at the DEJ), reach (fraction of the enamel
 * thickness); dentin fronts: [lateral half-width at the DEJ, depth towards the pulp] for the infected,
 * affected and sclerotic zones; cavity; tertiary dentin [thickness, half-width].
 */
export const LESIONS = {
  'pit-fissure': {
    frame: fissureFrame,
    stages: [
      {},
      { enamel: { r0: 0.5, r1: 1.15, reach: 0.55 } },
      { enamel: { r0: 0.5, r1: 1.5, reach: 1 }, micro: 0.4, dentin: { sclerotic: [1.2, 0.35] } },
      { enamel: { r0: 0.6, r1: 1.8, reach: 1 }, micro: 0.45, dentin: { infected: [1.1, 0.45], affected: [2.0, 1.0], sclerotic: [2.5, 1.3] }, tertiary: [0.2, 1.4] },
      { enamel: { r0: 1.1, r1: 2.2, reach: 1 }, cavity: { open: 0.8, wide: 1.6, deep: 0.6 }, dentin: { infected: [2.1, 1.0], affected: [2.6, 1.3], sclerotic: [3.0, 1.5] }, tertiary: [0.3, 1.6] },
      { enamel: { r0: 1.9, r1: 2.8, reach: 1 }, cavity: { open: 1.6, wide: 2.4, deep: 1.0 }, dentin: { infected: [2.9, 1.35], affected: [3.3, 1.55], sclerotic: [3.6, 1.7] }, tertiary: [0.45, 2.0] },
    ],
  },
  'smooth-surface': {
    frame: proximalFrame,
    stages: [
      {},
      { enamel: { R: 0.95, k: 0.3, reach: 0.5 } },
      { enamel: { R: 1.2, k: 0.3, reach: 1 }, micro: [0.45, 0.25], dentin: { sclerotic: [1.0, 0.35] } },
      { enamel: { R: 1.35, k: 0.35, reach: 1 }, micro: [0.5, 0.3], dentin: { infected: [0.9, 0.45], affected: [1.6, 0.95], sclerotic: [2.0, 1.2] }, tertiary: [0.2, 1.2] },
      { enamel: { R: 1.65, k: 0.45, reach: 1 }, cavity: { open: 0.9, wide: 1.6, deep: 0.8 }, dentin: { infected: [2.0, 1.05], affected: [2.4, 1.3], sclerotic: [2.8, 1.5] }, tertiary: [0.3, 1.3] },
      { enamel: { R: 2.2, k: 0.6, reach: 1 }, cavity: { open: 1.4, wide: 2.0, deep: 1.15 }, dentin: { infected: [2.6, 1.35], affected: [3.0, 1.5], sclerotic: [3.3, 1.65] }, tertiary: [0.45, 1.7] },
    ],
  },
  root: {
    frame: rootFrame,
    stages: [
      {},
      { root: { infected: [0.9, 0.12], affected: [1.25, 0.32], sclerotic: [1.45, 0.48] } },
      { root: { infected: [1.5, 0.75], affected: [1.8, 1.0], sclerotic: [2.0, 1.2] }, cavity: { wide: 1.05, deep: 0.55 }, tertiary: [0.15, 1.2] },
      { root: { infected: [2.0, 1.05], affected: [2.3, 1.25], sclerotic: [2.5, 1.4] }, cavity: { wide: 1.6, deep: 0.85 }, tertiary: [0.25, 1.6] },
    ],
  },
};

/** Region names, in the order a point is tested (zones before the sound tissue they sit in). */
export const REGIONS = [
  'enamel-surface-zone', 'enamel-lesion-body', 'enamel-dark-zone', 'enamel-translucent-zone',
  'infected-dentin', 'affected-dentin', 'sclerotic-dentin', 'tertiary-dentin',
  'enamel', 'dentin', 'cementum', 'pulp',
];

const SURFACE_ZONE = 0.12; // the well-mineralised surface layer of an uncavitated enamel lesion (schematic)
const DARK = [0.12, 0.27]; // translucent zone = outermost 0.12 of the front, dark zone the next 0.15

/**
 * The region fields of one lesion stage: a function of p and the tooth fields there ({ T: the tooth,
 * T0: the tooth before carving, P: the pulp }) that returns S (the kept solid) and every region's field,
 * all negative inside.
 */
const frames = new Map();
/** A lesion's frame (origin, pulp tip, lateral distance); computed once per lesion kind. */
export const frameOf = (kind) => {
  if (!frames.has(kind)) frames.set(kind, LESIONS[kind].frame());
  return frames.get(kind);
};

/** `cut: false` leaves the quarter in place: used to find zone edges within a cut face. */
export function stageFields(kind, stageIndex, { cut: withCut = true } = {}) {
  const L = LESIONS[kind];
  const st = L.stages[stageIndex];
  const frame = frameOf(kind);
  const cut = withCut ? cutField(CUTS[kind]) : () => -1e3;
  const isFissure = kind === 'pit-fissure', isRoot = kind === 'root';

  return (p, { T, T0, P }) => {
    const e = enamelThickness(p);
    const D = T0 + e; // dentin core (negative inside): the DEJ is its surface
    const lat = frame.lateral(p);
    const dpt = -T; // depth below the outer surface
    const s = -D; // depth below the DEJ (in dentin)
    // Irregular fronts and rough cavity walls (millimetres of offset).
    const rough = st.enamel || st.dentin || st.root ? fbm(p, 2.2, 3) : 0;
    const wall = st.cavity || st.micro !== undefined ? 0.17 * fbm(p, 2.6, 2, 7.3) + 0.05 * fbm(p, 8, 2, 3.1) : 0;

    // Cavity (negative inside = removed).
    let cav = 1e3;
    if (st.micro !== undefined) {
      cav = isFissure
        ? Math.max(lat - st.micro, frame.origin[1] - 0.35 - p[1], -D) // the fissure base widens and deepens a little
        : Math.max(lat - st.micro[0], dpt - st.micro[1]);
      cav += wall * 0.5;
    }
    if (st.cavity) {
      const c = st.cavity;
      if (isRoot) cav = Math.hypot(lat / c.wide, dpt / c.deep) - 1;
      else if (D > 0) cav = lat - c.open; // straight through the enamel ...
      else cav = Math.max(lat - c.wide * Math.sqrt(Math.max(0, 1 - (s / c.deep) ** 2)), s - c.deep); // ... and wider in dentin, undermining it
      cav += wall; // broken enamel edges, ragged dentin walls
    }
    const S = Math.max(T, cut(p), -cav);

    // Tissues.
    const below = p[1] - cejY(p[0], p[2]); // > 0 above the CEJ
    const cementumShell = Math.max(-(T + CEMENTUM), below); // negative within the outer layer below the CEJ
    const enamelAll = Math.max(S, -D);
    const hardAll = Math.max(S, D, -P); // dentin + cementum

    // Enamel lesion front (negative inside the lesion).
    let ge = 1e3;
    if (st.enamel && D > 0) {
      const thick = Math.max(D - T, 1e-3);
      const f = clamp(dpt / thick, 0, 1);
      const en = st.enamel;
      const radius = isFissure ? en.r0 + (en.r1 - en.r0) * f : en.R * (1 - (1 - en.k) * f);
      ge = Math.max(lat - radius, (f - en.reach) * thick) + 0.1 * rough;
    }
    // Dentin (or root) lesion fronts.
    const fronts = st.dentin ?? st.root;
    const front = (z) => {
      if (!fronts?.[z]) return 1e3;
      const [w, depth] = fronts[z];
      if (isRoot) return Math.max(lat - w, dpt - depth) + 0.12 * rough;
      return lat - w * Math.max(0, 1 - s / depth) + 0.12 * rough;
    };
    const gi = front('infected'), ga = Math.min(front('affected'), gi), gs = Math.min(front('sclerotic'), ga);

    // Tertiary dentin: laid down on the pulp wall beneath the lesion.
    let tert = 1e3;
    if (st.tertiary) {
      const [tt, wt] = st.tertiary;
      tert = Math.max(P, -(P + tt), Math.hypot(p[0] - frame.tip[0], p[1] - frame.tip[1], p[2] - frame.tip[2]) - wt);
    }

    const r = {};
    // Once cavitated, the surface zone has broken down and the lesion body reaches the surface.
    r['enamel-surface-zone'] = st.cavity ? 1e3 : Math.max(enamelAll, ge, dpt - SURFACE_ZONE);
    const deeper = SURFACE_ZONE - dpt;
    r['enamel-lesion-body'] = Math.max(enamelAll, ge + DARK[1], deeper);
    r['enamel-dark-zone'] = Math.max(enamelAll, ge + DARK[0], -(ge + DARK[1]), deeper);
    r['enamel-translucent-zone'] = Math.max(enamelAll, ge, -(ge + DARK[0]), deeper);
    if (st.cavity) {
      r['enamel-lesion-body'] = Math.max(enamelAll, ge + DARK[1]);
      r['enamel-dark-zone'] = Math.max(enamelAll, ge + DARK[0], -(ge + DARK[1]));
      r['enamel-translucent-zone'] = Math.max(enamelAll, ge, -(ge + DARK[0]));
    }
    r['enamel'] = Math.max(enamelAll, -ge);
    r['infected-dentin'] = Math.max(hardAll, gi);
    r['affected-dentin'] = Math.max(hardAll, ga, -gi);
    r['sclerotic-dentin'] = Math.max(hardAll, gs, -ga);
    // Sound tissue outside the lesion.
    r['cementum'] = Math.max(hardAll, cementumShell, -gs);
    r['dentin'] = Math.max(hardAll, -cementumShell, -gs);
    r['tertiary-dentin'] = Math.max(S, tert);
    r['pulp'] = Math.max(S, P, -tert);
    return { S, regions: r };
  };
}

// ---------- Periodontium: alveolar bone and gingiva ----------
/**
 * Gingival margin and alveolar crest heights (above the buccal CEJ, mm). Healthy: the margin about
 * 1 mm coronal to the CEJ and the crest about 1.5–2 mm apical to it. Root caries: the gingiva has
 * receded about 3 mm, exposing the root, with the crest following.
 */
export const PERIO = {
  'pit-fissure': { margin: 1.0, crest: -1.7 },
  'smooth-surface': { margin: 1.0, crest: -1.7 },
  root: { margin: -3.0, crest: -4.7 },
};
// Periodontal ligament space between root and bone (the root field underestimates distance on its broad
// buccal and lingual sides, so this gives roughly 0.2 mm there).
const PDL = 0.1;
export const PERIO_REGIONS = ['alveolar-bone', 'pdl', 'gingiva'];
// Soft tissue and the ligament reach a little under the tooth's surface (and the ligament under the
// bone's): the viewer draws the tooth in front, so the section shows no gaps where they meet.
const TUCK = 0.04;

/** Bone and gingiva fields for a lesion's model (negative inside), given p and the tooth field T there. */
export function perioFields(kind, { cut: withCut = true } = {}) {
  const cut = withCut ? cutField(CUTS[kind]) : () => -1e3;
  const { margin, crest } = PERIO[kind];
  return (p, T) => {
    // The crest follows the CEJ's curve, a little uneven.
    const crestY = crest + cejY(p[0], p[2]) + 0.15 * fbm(p, 1.3, 2, 2.2);
    const process = roundBox(p, [0, -8.6, 0], [7.2, 8.4, 5.4], 1.6); // the alveolar process around the tooth
    const boneSolid = Math.max(process, p[1] - crestY, PDL - T);
    // Gingiva: a cuff from the margin down to just past the crest, thickening apically, outside the bone.
    const gw = lerp(0.35, 1.5, clamp((margin - p[1]) / (margin - crest + 0.8), 0, 1));
    const cuff = Math.max(T - gw, -TUCK - T, p[1] - margin - cejY(p[0], p[2]), crest - 0.8 - p[1],
      roundBox([p[0], 0, p[2]], [0, 0, 0], [7.2, 1, 5.4], 1.6)); // within the bone block's footprint
    // Periodontal ligament: the space between root and socket wall, below the crest.
    const pdl = Math.max(-TUCK - T, T - PDL - TUCK, p[1] - crestY, process);
    return {
      'alveolar-bone': Math.max(boneSolid, cut(p)),
      pdl: Math.max(pdl, cut(p)),
      gingiva: Math.max(cuff, -boneSolid, cut(p)),
    };
  };
}
