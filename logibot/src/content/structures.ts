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
  tooth?: Tooth;
}

const byKey = new Map<string, Structure>();
for (const r of records) {
  const existing = byKey.get(r.key);
  if (existing) { existing.meshIds.push(r.id); continue; }
  const tooth = r.group === 'teeth' ? parseTooth(r.name) ?? undefined : undefined;
  byKey.set(r.key, {
    key: r.key, sourceName: r.name, group: r.group, meshIds: [r.id], fma: r.fma, tooth,
    name: tooth?.name ?? r.name.charAt(0).toUpperCase() + r.name.slice(1),
  });
}

export const STRUCTURES: Structure[] = [...byKey.values()];
export const structureByKey = (key: string) => byKey.get(key);
export const MESH_TO_KEY = new Map(STRUCTURES.flatMap((s) => s.meshIds.map((id) => [id, s.key] as const)));
export const GROUP_ORDER = Object.keys(GROUPS);

/** Display colours per group, tuned to read against the warm-black stage. */
export const GROUP_COLOR: Record<string, string> = {
  teeth: '#f7f2e8', gingiva: '#d98c8a', mandible: '#e4d8bf', maxilla: '#e4d8bf', skull: '#d9ccb0', 'neck-bones': '#d9ccb0',
  suprahyoid: '#b8665a', infrahyoid: '#a85b52', tongue: '#cf7f78', 'palate-pharynx': '#ad6b62', glands: '#d6b26a', lips: '#c98a7a',
};
