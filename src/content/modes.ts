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
  /** Show body-system chips (multi-select) instead of presets; layers are listed by system. */
  systems?: boolean;
}

export const MODES: Mode[] = [
  {
    id: 'general', name: 'General anatomy', short: 'Gen ana', model: '/models/general.glb', source: 'bodyparts3d',
    lead: 'Every structure in BodyParts3D: skeleton, muscles, brain and nerves, vessels and organs, filterable by body system.',
    // Everything except skin, which would hide the rest. Students narrow it down with the system chips.
    defaultVisible: [
      'teeth', 'mandible', 'maxilla', 'skull', 'neck-bones', 'spine', 'thorax-bones', 'upper-limb-bones', 'lower-limb-bones', 'ligaments',
      'suprahyoid', 'infrahyoid', 'tongue', 'palate-pharynx', 'eye-muscles', 'back-muscles', 'trunk-muscles', 'upper-limb-muscles', 'lower-limb-muscles',
      'brain', 'nerves', 'arteries', 'cerebral-arteries', 'body-arteries', 'veins', 'body-veins',
      'heart', 'airways', 'larynx', 'digestive', 'urogenital', 'endocrine', 'senses', 'glands', 'gingiva', 'lips',
    ],
    systems: true,
    presets: [],
  },
  {
    id: 'dental', name: 'Oral anatomy', short: 'Oral', model: '/models/dental.glb', source: 'bodyparts3d',
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
    id: 'histology', name: 'General & oral histology', short: 'Histo', model: '/models/histology.glb', source: 'blender',
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
