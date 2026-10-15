/**
 * The Physiology subject: which structures carry each animated function, the
 * one-line "how it works" overview shown with each, blood oxygenation colours and brain areas by
 * function. The flow distances themselves are baked into physiology.glb by scripts/lib/flow.mjs; the
 * animation is schematic (pulses show direction, not real speed).
 */

export type FunctionId = 'blood' | 'nerves' | 'air' | 'food' | 'urine' | 'muscles' | 'brain';

export interface FunctionLayer {
  id: FunctionId;
  label: string;
  /** The system overview shown under the switch. */
  overview: string;
  /** Layer groups shown while this function is on. */
  groups: string[];
  /** Whether structures in it carry animated flow (others are coloured or annotated instead). */
  animated: boolean;
}

export const FUNCTION_LAYERS: FunctionLayer[] = [
  {
    id: 'blood', label: 'Blood flow', animated: true,
    overview: 'The left ventricle pumps oxygenated blood (red) out through the aorta; systemic veins return deoxygenated blood (blue) to the right atrium. Blood from the gut first passes through the hepatic portal vein to the liver. The pulmonary circulation is the exception: the pulmonary arteries carry deoxygenated blood from the right ventricle to the lungs, and the pulmonary veins bring it back oxygenated to the left atrium.',
    groups: ['heart', 'arteries', 'cerebral-arteries', 'body-arteries', 'veins', 'body-veins'],
  },
  {
    id: 'nerves', label: 'Nerve signals', animated: true,
    overview: 'Sensory fibres carry impulses towards the brain (the ophthalmic nerve and its branches from the forehead, nose and eye; the optic nerve from the retina); motor fibres carry them away (III and IV to the eye muscles, and parasympathetic fibres from the ciliary ganglion through the short ciliary nerves to the pupil and ciliary muscle). Some branches are mixed (the long ciliary nerves also carry sympathetic fibres, the lacrimal nerve secretomotor fibres to the gland); each is animated in its main direction. Only these orbital and optic nerves are in the source data.',
    groups: ['nerves', 'brain'],
  },
  {
    id: 'air', label: 'Breathing', animated: true,
    overview: 'On inspiration air passes the larynx, runs down the trachea and divides through the bronchi into each bronchopulmonary segment. Gas exchange happens in the alveoli beyond (lung tissue is not in the source data). Only inspiration is animated; on expiration air takes the same path in reverse.',
    groups: ['airways', 'larynx'],
  },
  {
    id: 'food', label: 'Digestion', animated: true,
    overview: 'Peristalsis moves food from the oesophagus through the stomach and small intestine, where most absorption happens, into the colon, which reabsorbs water, and on to the rectum. (The caecum and sigmoid colon are not in the source data; the flow bridges them.)',
    groups: ['digestive'],
  },
  {
    id: 'urine', label: 'Urine', animated: true,
    overview: 'The kidneys filter the blood; urine runs down each ureter by peristalsis, is stored in the bladder and leaves through the urethra.',
    groups: ['urogenital'],
  },
  {
    id: 'muscles', label: 'Muscle pull', animated: false,
    overview: 'A muscle can only pull: when it contracts and shortens it draws its attachments together (it can also pull while holding its length or while being lengthened under load). Tap a muscle to see its line of pull and read its action.',
    groups: ['suprahyoid', 'infrahyoid', 'tongue', 'palate-pharynx', 'eye-muscles', 'back-muscles', 'trunk-muscles', 'upper-limb-muscles', 'lower-limb-muscles'],
  },
  {
    id: 'brain', label: 'Brain areas', animated: false,
    overview: 'Brain regions coloured by their main role: movement, sensation, vision, hearing, language, memory and emotion, coordination (cerebellum), movement control (basal ganglia), and the brainstem with its vital centres and pathways. Language areas are shown on the left only: in most people they are in the left hemisphere.',
    groups: ['brain'],
  },
];

/** Shown faded behind the function layers for orientation. */
export const FUNCTION_CONTEXT = ['skull', 'mandible', 'maxilla', 'teeth', 'neck-bones', 'spine', 'thorax-bones', 'upper-limb-bones', 'lower-limb-bones'];

/** Which animated function a structure's flow belongs to, by group and side-free lower-case name. */
export function flowFunction(group: string, name: string): FunctionId | null {
  if (/arteries$|veins$/.test(group) || group === 'arteries' || group === 'veins') return 'blood';
  if (group === 'nerves') return 'nerves';
  if (group === 'airways' && !/cartilage$/.test(name)) return 'air';
  if (group === 'digestive') return 'food';
  if (/^(ureter|urinary bladder|urethra)$/.test(name)) return 'urine';
  return null;
}

export const OXYGENATED = '#d2463f';
export const DEOXYGENATED = '#4f72b8';

const PULMONARY_ARTERY = /^pulmonary (trunk|artery)$|(?<!hepatic )segmental artery$|lingular artery$|upper lobar artery$|branch of .*segmental artery$|part of .*segmental artery$|subsuperior branch/;
const PULMONARY_VEIN = /pulmonary vein$|segmental vein$|lingular vein$|part of .*segmental vein$|^trunk of apical segmental vein$/;

/**
 * Oxygenation colour for a vessel: arteries red and veins blue, except the pulmonary circulation,
 * which is the other way round. Hepatic and renal segmental arteries are systemic (red).
 */
export function bloodColour(group: string, name: string): string | null {
  const artery = /arteries$/.test(group);
  const vein = /veins$/.test(group);
  if (!artery && !vein) return null;
  const systemicSegment = /hepatic|renal/.test(name);
  if (artery) return PULMONARY_ARTERY.test(name) && !systemicSegment ? DEOXYGENATED : OXYGENATED;
  return PULMONARY_VEIN.test(name) ? OXYGENATED : DEOXYGENATED;
}

export interface BrainArea { label: string; colour: string; match: RegExp }

/** Main role of each brain structure in the source, for the Brain areas function. */
export const BRAIN_AREAS: BrainArea[] = [
  { label: 'Movement', colour: '#e0614f', match: /^precentral gyrus$/ },
  { label: 'Body sensation', colour: '#f0a04b', match: /^postcentral gyrus$|^superior parietal lobule$/ },
  { label: 'Vision', colour: '#4f8fd6', match: /^occipital lobe$|^lateral geniculate body$|^superior colliculus$|^brachium of superior colliculus$|^fusiform gyrus$/ },
  { label: 'Hearing', colour: '#47b3a8', match: /^anterior part of superior temporal gyrus$|^medial geniculate body$|^inferior colliculus$|^brachium of inferior colliculus$/ },
  // Language is matched on the sided name: Broca's and Wernicke's areas are usually left-hemisphere only.
  { label: 'Language', colour: '#9b6fd1', match: /^left (inferior frontal gyrus|posterior part of superior temporal gyrus|angular gyrus|supramarginal gyrus)$/ },
  { label: 'Memory and emotion', colour: '#d672a8', match: /^hippocampus$|^parahippocampal gyrus$|^amygdala$|^cingulate gyrus$|fornix|^mammillary body$|^septum of telencephalon$|^stria terminalis$/ },
  { label: 'Planning and behaviour', colour: '#e6c34a', match: /^(superior|middle) frontal gyrus$|^orbital gyrus$/ },
  { label: 'Coordination', colour: '#6cbf62', match: /^cerebellum$/ },
  { label: 'Movement control', colour: '#3f9a8c', match: /^caudate nucleus$|^putamen$|^globus pallidus$/ },
  { label: 'Relay and homeostasis', colour: '#8aa0b4', match: /^thalamus$|^hypothalamus$|^tuber cinereum$|^habenula$|^stria medullaris of thalamus$/ },
  { label: 'Brainstem: vital centres and pathways', colour: '#b0805a', match: /^medulla oblongata$|^pons$|^midbrain$|^peduncle of midbrain$/ },
];

/** Brain area for a structure: `name` is side-free, `sidedName` the source name (for language). */
export const brainArea = (name: string, sidedName = name) =>
  BRAIN_AREAS.find((a) => a.match.test(a.label === 'Language' ? sidedName.toLowerCase() : name));
