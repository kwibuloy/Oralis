export type ModeId = 'general' | 'physiology' | 'dental' | 'histology';

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
  /** Function-only subject: function switches and descriptions instead of layers (content/function.ts). */
  functionView?: boolean;
}

// Everything except skin, which would hide the rest. Students narrow it down with the system chips.
const ALL_BUT_SKIN = [
  'teeth', 'mandible', 'maxilla', 'skull', 'neck-bones', 'spine', 'thorax-bones', 'upper-limb-bones', 'lower-limb-bones', 'ligaments',
  'suprahyoid', 'infrahyoid', 'tongue', 'palate-pharynx', 'eye-muscles', 'back-muscles', 'trunk-muscles', 'upper-limb-muscles', 'lower-limb-muscles',
  'brain', 'nerves', 'arteries', 'cerebral-arteries', 'body-arteries', 'veins', 'body-veins',
  'heart', 'airways', 'larynx', 'digestive', 'urogenital', 'endocrine', 'senses', 'glands', 'gingiva', 'lips',
];

export const MODES: Mode[] = [
  {
    id: 'general', name: 'General anatomy', short: 'Gen ana', model: '/models/general.glb', source: 'bodyparts3d',
    lead: 'Every structure in BodyParts3D: skeleton, muscles, brain and nerves, vessels and organs, filterable by body system.',
    defaultVisible: ALL_BUT_SKIN,
    systems: true,
    presets: [],
  },
  {
    id: 'physiology', name: 'Physiology', short: 'Physio', model: '/models/physiology.glb', source: 'bodyparts3d',
    lead: 'How the body works, animated on the real anatomy: blood flow, nerve signals, breathing, digestion, urine, muscle pull and brain areas.',
    // Function-only: the visible groups follow the function switches (content/function.ts); blood flow is on at first.
    defaultVisible: ['heart', 'arteries', 'cerebral-arteries', 'body-arteries', 'veins', 'body-veins'],
    functionView: true,
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
