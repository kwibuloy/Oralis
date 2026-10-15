import { GROUPS } from '../content/anatomy';
import { tissueByKey } from '../content/histology';
import type { ModeId } from '../content/modes';
import { structureByKey } from '../content/structures';
import { toothNumber, type Arch, type NumberingSystem } from '../content/teeth';

/** Short display label for a picked key, used by the hover tag and the list. */
export function labelFor(mode: ModeId, key: string, system: NumberingSystem): string {
  if (mode === 'histology') return tissueByKey(key)?.name ?? key;
  const s = structureByKey(key);
  if (!s) return key;
  return s.tooth ? `${toothNumber(s.tooth, system)} · ${s.name}` : s.name;
}

export const groupLabel = (group: string) => GROUPS[group]?.label ?? group;

/** Which arch a head structure belongs to, for the dental arch filter; null = neither. */
export function archOf(key: string): Arch | null {
  const s = structureByKey(key);
  if (!s) return null;
  if (s.tooth) return s.tooth.arch;
  if (/upper jaw|maxilla|palatine/i.test(s.sourceName)) return 'upper';
  if (/lower jaw|mandible/i.test(s.sourceName)) return 'lower';
  return null;
}
