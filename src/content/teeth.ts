/**
 * Permanent dentition: parses BodyParts3D tooth names and derives the three
 * numbering systems. "Left"/"right" are the patient's, as in the source data.
 */
export type Arch = 'upper' | 'lower';
export type Side = 'left' | 'right';
export type ToothClass = 'incisor' | 'canine' | 'premolar' | 'molar';
export type NumberingSystem = 'fdi' | 'universal' | 'palmer';

export interface Tooth {
  arch: Arch;
  side: Side;
  /** 1 = central incisor … 8 = third molar, counted from the midline. */
  position: number;
  cls: ToothClass;
  name: string;
}

const POSITIONS: [RegExp, number][] = [
  [/central .*incisor/, 1], [/lateral .*incisor/, 2], [/canine/, 3],
  [/first .*premolar/, 4], [/second .*premolar/, 5],
  [/first .*molar/, 6], [/second .*molar/, 7], [/third .*molar/, 8],
];

const CLASS: ToothClass[] = ['incisor', 'incisor', 'canine', 'premolar', 'premolar', 'molar', 'molar', 'molar'];
const NAMES = ['central incisor', 'lateral incisor', 'canine', 'first premolar', 'second premolar', 'first molar', 'second molar', 'third molar'];

/** "Left lower first secondary molar tooth" → tooth, or null for anything else. */
export function parseTooth(sourceName: string): Tooth | null {
  const s = sourceName.toLowerCase();
  const m = s.match(/^(left|right) (upper|lower) (.+?) secondary (.+) tooth$/) ?? s.match(/^(left|right) (upper|lower) (.*)tooth$/);
  if (!m) return null;
  const position = POSITIONS.find(([re]) => re.test(s.replace(/secondary /, '')))?.[1];
  if (!position) return null;
  const arch = m[2] as Arch;
  const side = m[1] as Side;
  return { arch, side, position, cls: CLASS[position - 1], name: `${arch === 'upper' ? 'Maxillary' : 'Mandibular'} ${side} ${NAMES[position - 1]}` };
}

/** FDI quadrants: 1 upper right, 2 upper left, 3 lower left, 4 lower right. */
export function quadrant(t: Pick<Tooth, 'arch' | 'side'>): 1 | 2 | 3 | 4 {
  if (t.arch === 'upper') return t.side === 'right' ? 1 : 2;
  return t.side === 'left' ? 3 : 4;
}

export function fdi(t: Tooth): string {
  return `${quadrant(t)}${t.position}`;
}

/** Universal (ADA): 1 = upper right third molar, clockwise from the dentist's view to 32. */
export function universal(t: Tooth): string {
  const p = t.position;
  switch (quadrant(t)) {
    case 1: return String(9 - p);
    case 2: return String(8 + p);
    case 3: return String(25 - p);
    case 4: return String(24 + p);
  }
}

/** Palmer (Zsigmondy–Palmer) as text: the bracket opens towards the midline. */
export function palmer(t: Tooth): string {
  return { 1: `${t.position}┘`, 2: `└${t.position}`, 3: `┌${t.position}`, 4: `${t.position}┐` }[quadrant(t)];
}

export function toothNumber(t: Tooth, system: NumberingSystem): string {
  return system === 'fdi' ? fdi(t) : system === 'universal' ? universal(t) : palmer(t);
}

export const SYSTEM_LABEL: Record<NumberingSystem, string> = { fdi: 'FDI', universal: 'Universal', palmer: 'Palmer' };

/** Morphology for each tooth type, keyed `${arch}-${position}`. Typical forms; variation is common. */
export const MORPHOLOGY: Record<string, { roots: string; crown: string; erupts: string; notes: string }> = {
  'upper-1': { roots: 'One, conical', crown: 'Widest anterior crown mesiodistally; shovel-shaped lingual fossa bounded by marginal ridges and a cingulum', erupts: '7–8 years', notes: 'Newly erupted incisal edges show three mamelons that wear away with function.' },
  'upper-2': { roots: 'One, often curving distally at the apex', crown: 'A smaller, rounder version of the central incisor', erupts: '8–9 years', notes: 'The most variable tooth after third molars: peg-shaped or congenitally missing laterals are common, and a deep lingual pit is a caries risk.' },
  'upper-3': { roots: 'One, the longest root in the dentition', crown: 'One pointed cusp with mesial and distal cusp ridges; prominent labial ridge', erupts: '11–12 years', notes: 'The cornerstone of the arch; its long root raises the canine eminence on the maxilla.' },
  'upper-4': { roots: 'Usually two: buccal and palatal', crown: 'Two cusps, the buccal about 1 mm longer than the palatal; mesial crown concavity', erupts: '10–11 years', notes: 'The mesial concavity at the cervical third makes matrix adaptation and cleaning harder.' },
  'upper-5': { roots: 'One', crown: 'Two cusps of nearly equal height; more rounded and symmetrical than the first premolar', erupts: '10–12 years', notes: 'Shorter central groove with more supplemental grooves than the first premolar.' },
  'upper-6': { roots: 'Three: mesiobuccal, distobuccal and the longest, palatal', crown: 'Four main cusps, the mesiopalatal largest; oblique ridge; often a cusp of Carabelli', erupts: '6 years', notes: 'The mesiobuccal root often holds a second canal (MB2), frequently missed in endodontics.' },
  'upper-7': { roots: 'Three, closer together and sometimes fused', crown: 'Smaller distopalatal cusp than the first molar; Carabelli cusp rare', erupts: '12–13 years', notes: 'The parotid duct opens on the buccal mucosa opposite this tooth.' },
  'lower-1': { roots: 'One, flattened mesiodistally', crown: 'The smallest permanent tooth; bilaterally symmetrical', erupts: '6–7 years', notes: 'Often erupts alongside the first molars, among the first permanent teeth.' },
  'lower-2': { roots: 'One, flattened mesiodistally', crown: 'Slightly wider than the central; incisal edge twisted distolingually', erupts: '7–8 years', notes: 'The twist follows the curve of the arch towards the canine.' },
  'lower-3': { roots: 'One, occasionally bifurcated labiolingually', crown: 'Narrower cusp than the upper canine; mesial outline nearly straight with the root', erupts: '9–10 years', notes: 'Of all mandibular teeth the most likely to have two roots.' },
  'lower-4': { roots: 'One', crown: 'A large buccal cusp and a small, often non-functional lingual cusp', erupts: '10–12 years', notes: 'Looks canine-like from the buccal. The mental foramen usually lies near the apices of the premolars.' },
  'lower-5': { roots: 'One', crown: 'Two or three cusps; the three-cusp form has a Y-shaped groove pattern', erupts: '11–12 years', notes: 'Commonly the last premolar to erupt and occasionally congenitally missing.' },
  'lower-6': { roots: 'Two: mesial and distal, well separated', crown: 'Five cusps: three buccal and two lingual', erupts: '6 years', notes: 'The first permanent tooth to erupt and the most frequently restored.' },
  'lower-7': { roots: 'Two, closer together than the first molar’s', crown: 'Four cusps with a cross-shaped (+) groove pattern', erupts: '11–13 years', notes: 'The lingual cortical plate is thin here, so infections may drain into the submandibular space.' },
};

export function morphology(t: Tooth) {
  return MORPHOLOGY[`${t.arch}-${t.position}`];
}
