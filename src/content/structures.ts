import records from './structures.generated.json';
import { GROUPS } from './anatomy';
import { parseTooth, type Tooth } from './teeth';

export interface Structure {
  /** Stable key shared by all source meshes of one structure (e.g. "left-maxilla"). */
  key: string;
  name: string;
  sourceName: string;
  group: string;
  /** BodyParts3D mesh ids (node names in head.glb). */
  meshIds: string[];
  fma: string;
  /** Mode models that contain this structure. */
  models: string[];
  tooth?: Tooth;
}

const byKey = new Map<string, Structure>();
for (const r of records) {
  const existing = byKey.get(r.key);
  if (existing) { existing.meshIds.push(r.id); continue; }
  const tooth = r.group === 'teeth' ? parseTooth(r.name) ?? undefined : undefined;
  byKey.set(r.key, {
    key: r.key, sourceName: r.name, group: r.group, meshIds: [r.id], fma: r.fma, models: r.models, tooth,
    name: tooth?.name ?? r.name.charAt(0).toUpperCase() + r.name.slice(1),
  });
}

export const STRUCTURES: Structure[] = [...byKey.values()];
export const structureByKey = (key: string) => byKey.get(key);
export const MESH_TO_KEY = new Map(STRUCTURES.flatMap((s) => s.meshIds.map((id) => [id, s.key] as const)));
export const GROUP_ORDER = Object.keys(GROUPS);

/** Structures present in a mode's model. */
export const structuresIn = (model: string) => STRUCTURES.filter((s) => s.models.includes(model));

/** Display colours per group, tuned for the light atlas canvas. */
export const GROUP_COLOR: Record<string, string> = {
  teeth: '#f6f1e7', gingiva: '#e08f8c', mandible: '#e9e0cc', maxilla: '#e9e0cc', skull: '#e3d9c3', 'neck-bones': '#e3d9c3',
  suprahyoid: '#c9655a', infrahyoid: '#bb5c52', tongue: '#d9847c', 'palate-pharynx': '#c06e64', glands: '#e0b65c', lips: '#d68f80',
  larynx: '#b9c7cf', 'eye-muscles': '#c4675d', nerves: '#e6c34a', arteries: '#d2463f', veins: '#4f72b8',
  spine: '#e6dcc6', 'thorax-bones': '#e6dcc6', 'upper-limb-bones': '#e9e0cc', 'lower-limb-bones': '#e9e0cc',
  ligaments: '#d9d2bf', brain: '#e8c9c0', 'cerebral-arteries': '#d2463f', 'body-arteries': '#d2463f', 'body-veins': '#4f72b8',
  heart: '#b8443f', airways: '#c9d6dd', digestive: '#d9a27f', urogenital: '#d6a08f', endocrine: '#c99bc4', senses: '#e9edf0', skin: '#e8c4a8',
  'back-muscles': '#b85a50', 'trunk-muscles': '#c4675d', 'upper-limb-muscles': '#bf6156', 'lower-limb-muscles': '#b3554b',
};
