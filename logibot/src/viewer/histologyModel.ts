import * as THREE from 'three';
import { TISSUES } from '../content/histology';

/**
 * A stylised single-rooted tooth in its socket, cut in half along the long axis
 * so every tissue shows in section. Each tissue is a region of the profile plane
 * between an inner and an outer radius, revolved half-way round the Y axis and
 * capped with flat faces on the cut plane (z = 0). Units are millimetres-ish.
 */
type Radius = (y: number) => number;

const CEJ = 0;
const CROWN_TOP = 6.5;
const APEX = -13;
const CREST = -1.6;
const SAMPLES = 64;

/** Outer surface of the tooth: root taper below the CEJ, bulging crown above. */
const outer: Radius = (y) => {
  if (y <= CEJ) {
    const t = (y - APEX) / (CEJ - APEX);
    return 0.35 + 2.55 * Math.pow(Math.max(t, 0), 0.6);
  }
  const contour = 4.4;
  if (y <= contour) return 2.9 + 0.9 * Math.sin((Math.PI / 2) * (y / contour));
  const t = (y - contour) / (CROWN_TOP - contour);
  return 3.8 * Math.sqrt(Math.max(1 - t * t, 0));
};

const enamelThickness = (y: number) => 0.05 + 1.25 * Math.pow(Math.max(y, 0) / CROWN_TOP, 1.2);
const DENTIN_TOP = 5.0;
const dentinOuter: Radius = (y) => {
  if (y <= CEJ) return outer(y) - cementumThickness(y);
  if (y >= DENTIN_TOP) return 0;
  const r = outer(y) - enamelThickness(y);
  const near = (y - (DENTIN_TOP - 0.8)) / 0.8;
  return near > 0 ? r * Math.sqrt(Math.max(1 - near * near, 0)) : r;
};
const cementumThickness = (y: number) => 0.06 + 0.3 * ((CEJ - y) / (CEJ - APEX));

const PULP_TOP = 3.1;
const pulp: Radius = (y) => {
  if (y >= PULP_TOP || y <= APEX + 0.2) return 0;
  if (y > 0.8) {
    const t = (y - 0.8) / (PULP_TOP - 0.8);
    return 1.55 * Math.sqrt(Math.max(1 - t * t, 0));
  }
  const t = (y - APEX) / (0.8 - APEX);
  return 0.12 + 1.43 * Math.pow(t, 1.4);
};

const PDL = 0.32;
const socket: Radius = (y) => (y >= APEX - PDL ? outer(Math.max(y, APEX)) + PDL : 0);
const BONE_R = 7.5;
const GUM_TOP = CEJ + 1.4;
/** Thick over the bone crest, thinning to the free gingival margin above the CEJ. */
const gumOuter: Radius = (y) => {
  const u = Math.min(Math.max((y - CREST) / (GUM_TOP - CREST), 0), 1);
  return outer(Math.min(y, CEJ)) + 0.15 + 2.6 * Math.pow(1 - u, 0.7);
};

interface Layer { key: string; inner: Radius; outer: Radius; y0: number; y1: number }

const LAYERS: Layer[] = [
  { key: 'enamel', inner: (y) => Math.max(dentinOuter(y), 0), outer, y0: CEJ, y1: CROWN_TOP },
  { key: 'dentin', inner: pulp, outer: dentinOuter, y0: APEX + 0.25, y1: DENTIN_TOP },
  { key: 'pulp', inner: () => 0, outer: pulp, y0: APEX + 0.2, y1: PULP_TOP },
  { key: 'cementum', inner: dentinOuter, outer, y0: APEX, y1: CEJ },
  { key: 'pdl', inner: (y) => (y >= APEX ? outer(y) : 0), outer: socket, y0: APEX - PDL, y1: CREST },
  { key: 'bone', inner: socket, outer: () => BONE_R, y0: APEX - 4, y1: CREST },
  { key: 'gingiva', inner: (y) => outer(y) + 0.04, outer: gumOuter, y0: CREST, y1: GUM_TOP },
];

function sample(layer: Layer): { y: number; a: number; b: number }[] {
  const out = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const y = layer.y0 + ((layer.y1 - layer.y0) * i) / SAMPLES;
    const b = Math.max(layer.outer(y), 0);
    const a = Math.min(Math.max(layer.inner(y), 0), b);
    out.push({ y, a, b });
  }
  return out;
}

/** Closed profile (outer up, inner down) revolved through 180°, plus cut faces on z = 0. */
function layerGeometry(layer: Layer): THREE.BufferGeometry {
  const rows = sample(layer);
  const loop = [
    ...rows.map((r) => new THREE.Vector2(r.b, r.y)),
    ...rows.slice().reverse().map((r) => new THREE.Vector2(r.a, r.y)),
  ];
  loop.push(loop[0].clone());
  const shell = new THREE.LatheGeometry(loop, 48, Math.PI / 2, Math.PI);

  // Cut face: one strip per side between inner and outer radius.
  const pos: number[] = [];
  for (const s of [1, -1]) {
    for (let i = 0; i < rows.length - 1; i++) {
      const p = rows[i], q = rows[i + 1];
      const quad = [[s * p.a, p.y], [s * p.b, p.y], [s * q.b, q.y], [s * q.a, q.y]];
      const tri = s > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
      for (const k of tri) pos.push(quad[k][0], quad[k][1], 0);
    }
  }
  const face = new THREE.BufferGeometry();
  face.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  face.computeVertexNormals();

  const merged = mergeNonIndexed([shell.toNonIndexed(), face]);
  merged.computeVertexNormals();
  return merged;
}

function mergeNonIndexed(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const arrays = geos.map((g) => g.getAttribute('position').array as Float32Array);
  const all = new Float32Array(arrays.reduce((n, a) => n + a.length, 0));
  let o = 0;
  for (const a of arrays) { all.set(a, o); o += a.length; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(all, 3));
  return g;
}

/** Build the section. Each mesh carries `userData.key` matching a TISSUES entry. */
export function buildToothSection(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'tooth-section';
  for (const layer of LAYERS) {
    const tissue = TISSUES.find((t) => t.key === layer.key)!;
    const material = new THREE.MeshStandardMaterial({
      color: tissue.color, roughness: layer.key === 'enamel' ? 0.35 : 0.75, metalness: 0, side: THREE.DoubleSide, flatShading: false,
    });
    const mesh = new THREE.Mesh(layerGeometry(layer), material);
    mesh.name = layer.key;
    mesh.userData.key = layer.key;
    group.add(mesh);
  }
  group.position.y = 2.5;
  return group;
}
