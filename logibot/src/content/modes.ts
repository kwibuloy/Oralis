export type ModeId = 'general' | 'dental' | 'histology';

export interface Preset {
  label: string;
  groups: string[];
}

export interface Mode {
  id: ModeId;
  name: string;
  short: string;
  lead: string;
  /** GLB in public/models/. Each mode loads only the model it needs. */
  model: string;
  /** How the model was made, for the credits line. */
  source: 'bodyparts3d' | 'blender';
  /** Groups (or tissues) visible when the mode opens. */
  defaultVisible: string[];
  /** Groups drawn faded as context rather than hidden. */
  context?: string[];
  /** Quick layer presets shown above the toggles. */
  presets: Preset[];
}

export const MODES: Mode[] = [
  {
    id: 'general', name: 'General anatomy', short: 'Gen ana', model: '/models/general.glb', source: 'bodyparts3d',
    lead: 'The skull, jaws, floor of the mouth, tongue, palate and salivary glands as separate structures.',
    defaultVisible: ['teeth', 'gingiva', 'mandible', 'maxilla', 'skull', 'neck-bones', 'suprahyoid', 'tongue', 'palate-pharynx', 'glands'],
    presets: [
      { label: 'All', groups: ['teeth', 'gingiva', 'mandible', 'maxilla', 'skull', 'neck-bones', 'suprahyoid', 'infrahyoid', 'tongue', 'palate-pharynx', 'glands', 'lips'] },
      { label: 'Skeleton', groups: ['teeth', 'mandible', 'maxilla', 'skull', 'neck-bones'] },
      { label: 'Soft tissue', groups: ['gingiva', 'suprahyoid', 'infrahyoid', 'tongue', 'palate-pharynx', 'glands', 'lips'] },
    ],
  },
  {
    id: 'dental', name: 'Dental anatomy', short: 'Dental', model: '/models/dental.glb', source: 'bodyparts3d',
    lead: 'The 28 permanent teeth in their arches, with FDI, Universal and Palmer numbering.',
    defaultVisible: ['teeth', 'gingiva'],
    context: ['mandible', 'maxilla'],
    presets: [
      { label: 'Teeth', groups: ['teeth'] },
      { label: 'With gingiva', groups: ['teeth', 'gingiva'] },
      { label: 'With jaws', groups: ['teeth', 'gingiva', 'mandible', 'maxilla'] },
    ],
  },
  {
    id: 'histology', name: 'Histology', short: 'Histo', model: '/models/histology.glb', source: 'blender',
    lead: 'A tooth cut along its long axis in its socket, with the dental and periodontal tissues.',
    defaultVisible: ['enamel', 'dentin', 'pulp', 'neurovascular', 'cementum', 'pdl', 'lamina-dura', 'bone', 'gingiva'],
    presets: [
      { label: 'All', groups: ['enamel', 'dentin', 'pulp', 'neurovascular', 'cementum', 'pdl', 'lamina-dura', 'bone', 'gingiva'] },
      { label: 'Tooth', groups: ['enamel', 'dentin', 'pulp', 'neurovascular', 'cementum'] },
      { label: 'Periodontium', groups: ['cementum', 'pdl', 'lamina-dura', 'bone', 'gingiva'] },
    ],
  },
];

export const modeById = (id: string) => MODES.find((m) => m.id === id);
