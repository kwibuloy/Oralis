import { GROUPS } from '../content/anatomy';
import { PROCESS_PARTS, siteById, ZONES, zoneOfPart } from '../content/cariology';
import { CARVING_TOOTH } from '../content/carving';
import { PARTS as GENETIC_PARTS } from '../content/genetics';
import { tissueByKey } from '../content/histology';
import type { ModeId } from '../content/modes';
import { structureByKey } from '../content/structures';
import { toothNumber, type Arch, type NumberingSystem } from '../content/teeth';

/** Short display label for a picked key, used by the hover tag and the list. */
export function labelFor(mode: ModeId, key: string, system: NumberingSystem): string {
  if (mode === 'histology') return tissueByKey(key)?.name ?? key;
  if (mode === 'genetics') return GENETIC_PARTS[key]?.name ?? key;
  if (key in CARVING_TOOTH.parts) return CARVING_TOOTH.parts[key].name;
  if (mode === 'cariology') {
    if (key.startsWith('cl-')) return ZONES[zoneOfPart(key)]?.name ?? key;
    if (key === 'site-restoration') return 'Restoration';
    if (key.startsWith('site-')) return siteById(key.slice(5))?.label ?? key;
    if (key.startsWith('pr-')) return PROCESS_PARTS[key]?.name ?? key;
  }
  const s = structureByKey(key);
  if (!s) return key;
  return s.tooth ? `${toothNumber(s.tooth, system)} · ${s.name}` : s.name;
}

export const groupLabel = (group: string) => GROUPS[group]?.label ?? group;

/** Which arch a head structure belongs to, for the dental arch filter; null = neither. */
export function archOf(key: string): Arch | null {
  // Cariology's lesions carved into a tooth move with that tooth's arch.
  if (key.startsWith('site-')) return siteById(key.slice(5))?.arch ?? (key === 'site-restoration' ? 'upper' : null);
  const s = structureByKey(key);
  if (!s) return null;
  if (s.tooth) return s.tooth.arch;
  if (/upper jaw|maxilla|palatine/i.test(s.sourceName)) return 'upper';
  if (/lower jaw|mandible/i.test(s.sourceName)) return 'lower';
  return null;
}
