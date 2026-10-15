import { PLATES, type Plate } from './plates';

export type ModeId = 'general' | 'dental' | 'histology';

export interface Mode {
  id: ModeId;
  name: string;
  short: string;
  lead: string;
  model: 'head' | 'tooth-section';
  /** Groups (general/dental) or tissues (histology) shown when the mode opens. */
  defaultVisible: string[];
  /** Groups drawn faded as context rather than hidden. */
  context?: string[];
  plate: Plate;
  covers: string[];
}

export const MODES: Mode[] = [
  {
    id: 'general', name: 'General anatomy', short: 'Gen ana', model: 'head',
    lead: 'The skull, jaws, floor of the mouth, tongue, palate and salivary glands, as separate structures you can turn, hide and isolate.',
    defaultVisible: ['teeth', 'gingiva', 'mandible', 'maxilla', 'skull', 'neck-bones', 'suprahyoid', 'tongue', 'palate-pharynx', 'glands'],
    plate: PLATES.skullBones,
    covers: ['25 bones of the skull and upper neck', 'Suprahyoid and infrahyoid muscles', 'Tongue, soft palate and pharyngeal wall', 'Submandibular and sublingual glands'],
  },
  {
    id: 'dental', name: 'Dental anatomy', short: 'Dental', model: 'head',
    lead: 'All 28 permanent teeth in their arches. Switch between FDI, Universal and Palmer numbering, open the bite, and read each tooth’s roots, cusps and eruption age.',
    defaultVisible: ['teeth', 'gingiva'],
    context: ['mandible', 'maxilla'],
    plate: PLATES.jaws,
    covers: ['28 permanent teeth, each selectable', 'FDI, Universal and Palmer numbering', 'Roots, cusps, eruption and clinical notes', 'Upper, lower or both arches; open bite'],
  },
  {
    id: 'histology', name: 'Histology', short: 'Histo', model: 'tooth-section',
    lead: 'A tooth cut along its long axis in its socket: enamel, dentin, pulp, cementum, periodontal ligament, alveolar bone and gingiva, each with its cells and structure.',
    defaultVisible: ['enamel', 'dentin', 'pulp', 'cementum', 'pdl', 'bone', 'gingiva'],
    plate: PLATES.cosmos,
    covers: ['Seven tissues in one longitudinal section', 'Composition and cells of each', 'Key microscopic features', 'A clinical link for every tissue'],
  },
];

export const modeById = (id: string) => MODES.find((m) => m.id === id);
