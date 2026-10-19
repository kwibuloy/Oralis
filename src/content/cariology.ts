/**
 * Cariology: the lesion molar (three lesion types, staged), caries sites on the arch (G.V. Black
 * classes, root and secondary caries) and the caries process (biofilm, pH and mineral). Geometry and
 * pin positions come from scripts/build-cariology.mjs (cariology.generated.json) and
 * extract-bodyparts.mjs (cariology-sites.generated.json); names, notes and codes are here.
 *
 * Codes: ICDAS II (coronal codes 0–6; root codes 0–2), ICCMS stages (sound, initial, moderate,
 * extensive). Visual codes only roughly match how deep a lesion is histologically; the UI says so.
 */
import generated from './cariology.generated.json';
import sites from './cariology-sites.generated.json';

export type LesionKind = 'pit-fissure' | 'smooth-surface' | 'root';
export type CariologyView = 'lesion' | 'sites' | 'process';

export interface Stage {
  name: string;
  /** ICDAS code(s), e.g. "ICDAS 1–2". */
  icdas: string;
  /** ICCMS stage; root lesions give their cavitation instead (ICDAS root codes have no ICCMS stage names). */
  iccms: string;
  /** What the section shows at this stage. */
  summary: string;
  management: string;
}

export interface LesionType {
  id: LesionKind;
  label: string;
  /** Where on the tooth, and why it looks the way it does. */
  summary: string;
  section: string;
  stages: Stage[];
}

const MANAGE_INITIAL = 'Non-operative: plaque control, fluoride (toothpaste, varnish), less frequent sugar, and review. Active lesions can arrest and remineralise.';

export const LESION_TYPES: LesionType[] = [
  {
    id: 'pit-fissure', label: 'Pit & fissure',
    summary: 'Starts on the walls of an occlusal fissure, where biofilm stagnates out of reach of the toothbrush. The enamel lesion is a cone with its base towards the DEJ, because it follows the enamel prisms, which fan out towards the DEJ. It then spreads along the DEJ and undermines the enamel, so a small opening can hide a large dentin lesion.',
    section: 'The mesiobuccal quarter of the crown is cut away along the central groove, so the fissure lesion shows from mesial and from buccal.',
    stages: [
      { name: 'Sound', icdas: 'ICDAS 0', iccms: 'Sound', summary: 'Intact enamel lining the fissure.', management: 'Prevention: fluoride toothpaste, diet advice; a fissure sealant for deep fissures in a patient at risk.' },
      { name: 'Initial enamel lesion', icdas: 'ICDAS 1–2', iccms: 'Initial', summary: 'Subsurface demineralisation on both walls of the fissure, in the outer part of the enamel. Clinically a white or brown change seen only after drying or confined to the fissure (code 1), or visible when wet and wider than the fissure (code 2).', management: `${MANAGE_INITIAL} A sealant arrests it in the fissure.` },
      { name: 'Localised enamel breakdown', icdas: 'ICDAS 3', iccms: 'Moderate', summary: 'The lesion reaches the DEJ and the fissure opens into a microcavity. The dentin beneath reacts with a sclerotic zone before bacteria arrive.', management: 'Depends on activity, caries risk and radiographic depth: a sealant if the lesion is non-cavitated or a microcavity and shallow on the radiograph, otherwise a minimally invasive restoration.' },
      { name: 'Underlying dentin shadow', icdas: 'ICDAS 4', iccms: 'Moderate', summary: 'Demineralisation spreads along the DEJ and into dentin as a cone towards the pulp: infected, affected and sclerotic dentin, and the first tertiary dentin on the pulp wall. The enamel above is undermined and shows a grey shadow.', management: 'Usually tooth-preserving operative care: access through the fissure, selective removal of carious dentin, and an adhesive restoration.' },
      { name: 'Distinct cavity with visible dentin', icdas: 'ICDAS 5', iccms: 'Extensive', summary: 'Undermined enamel has broken away: a cavity into dentin, lined by soft infected dentin over firmer affected dentin. Tertiary dentin thickens beneath.', management: 'Operative care with selective removal: hard dentin at the margins, firm or leathery dentin left over the pulp in a moderately deep lesion; then restore. Keep up prevention so new lesions do not form.' },
      { name: 'Extensive cavity', icdas: 'ICDAS 6', iccms: 'Extensive', summary: 'A large cavity over more than half the surface, reaching deep into dentin close to the pulp horns, with a thick layer of tertiary dentin between.', management: 'Assess the pulp first. Selective removal: hard dentin at the cavity margins for a seal; over the pulp, soft dentin is left in a deep lesion (or a stepwise approach is used) to avoid exposing it, then the cavity is restored.' },
    ],
  },
  {
    id: 'smooth-surface', label: 'Smooth surface',
    summary: 'A proximal lesion, just cervical to the contact area, where biofilm sits below the contact. On a smooth surface the enamel lesion is a cone with its base at the surface and its apex towards the DEJ; in dentin it becomes a cone with its base at the DEJ. It cannot be seen directly, so it is found on bitewing radiographs (E1–D3) or after separating the teeth.',
    section: 'The occlusobuccal quarter is cut away through the contact areas and through the lesion, so the mesial lesion shows from buccal and from above.',
    stages: [
      { name: 'Sound', icdas: 'ICDAS 0', iccms: 'Sound', summary: 'Intact enamel below the contact area.', management: 'Prevention: fluoride toothpaste, interdental cleaning, diet advice.' },
      { name: 'Initial enamel lesion (white spot)', icdas: 'ICDAS 1–2', iccms: 'Initial', summary: 'A subsurface lesion in the outer half of the enamel under a well-mineralised surface zone. Seen as a white spot when the surface is visible.', management: `${MANAGE_INITIAL} Interdental cleaning reaches it.` },
      { name: 'Lesion to the DEJ', icdas: 'ICDAS 3', iccms: 'Moderate', summary: 'The enamel lesion reaches the inner half of the enamel and the DEJ; the surface may break down into a microcavity. Dentin beneath shows a sclerotic reaction.', management: 'If not cavitated: resin infiltration or sealing plus fluoride, and review with bitewings. If cavitated: a minimally invasive restoration.' },
      { name: 'Outer dentin involved', icdas: 'ICDAS 4', iccms: 'Moderate', summary: 'The lesion spreads along the DEJ and forms a cone in dentin: infected, affected and sclerotic dentin; tertiary dentin begins on the pulp wall.', management: 'Operative if cavitated or into the middle third of dentin: a conservative proximal (box or slot) preparation with selective removal and an adhesive restoration. A non-cavitated lesion in the outer dentin can still be infiltrated or sealed.' },
      { name: 'Cavitated into dentin', icdas: 'ICDAS 5', iccms: 'Extensive', summary: 'The surface has broken down into a cavity that undermines the marginal ridge; the dentin lesion reaches the middle third.', management: 'Operative care: Class II restoration after selective removal of carious dentin.' },
      { name: 'Deep dentin lesion', icdas: 'ICDAS 6', iccms: 'Extensive', summary: 'A large cavity with the dentin lesion in the inner third, close to the pulp, behind a layer of tertiary dentin.', management: 'Assess the pulp first. Selective removal: hard dentin at the margins, soft dentin left over the pulp in a deep lesion (or stepwise), then a restoration.' },
    ],
  },
  {
    id: 'root', label: 'Root',
    summary: 'On root surfaces exposed by gingival recession, mostly in older adults and with a dry mouth. There is no enamel: cementum and dentin hold less mineral and dissolve at a higher pH (roughly 6.2–6.7 instead of about 5.5), so root lesions start sooner and spread around the root more than they deepen.',
    section: 'The mesial crown is cut away down to the lesion, so the buccal root lesion shows lengthwise and in a cross-section of the root, above the receded gingiva.',
    stages: [
      { name: 'Sound exposed root', icdas: 'ICDAS root 0', iccms: 'Sound', summary: 'Exposed cementum and dentin, no discolouration.', management: 'Prevention: fluoride toothpaste (high-fluoride, 5000 ppm, if at risk), plaque control, diet and saliva advice.' },
      { name: 'Initial root lesion', icdas: 'ICDAS root 1', iccms: 'Non-cavitated', summary: 'A clearly demarcated discoloured area of cementum and dentin without a cavity (loss of contour under 0.5 mm); soft if active, hard if arrested. Bacteria enter the dentin early.', management: 'Non-operative: high-fluoride toothpaste, fluoride varnish or silver diamine fluoride, plaque control. Active lesions (soft, yellow-brown) can harden and darken as they arrest.' },
      { name: 'Cavitated root lesion', icdas: 'ICDAS root 2', iccms: 'Cavitated', summary: 'A cavity of 0.5 mm or more, spreading around the root; infected and affected dentin and tertiary dentin on the canal wall.', management: 'Arrest with fluoride or silver diamine fluoride if cleansable; otherwise a restoration, often glass ionomer.' },
      { name: 'Deep root lesion', icdas: 'ICDAS root 2', iccms: 'Cavitated (deep)', summary: 'A wide, deep cavity approaching the root canal, which is protected by tertiary dentin.', management: 'Restoration after selective removal; assess the pulp.' },
    ],
  },
];

export const lesionType = (id: LesionKind) => LESION_TYPES.find((l) => l.id === id)!;
/** "ICCMS initial" for a coronal stage; root lesions are described by cavitation instead. */
export const stageCodeLabel = (st: Stage) => (/^(Sound|Initial|Moderate|Extensive)$/.test(st.iccms) ? `ICCMS ${st.iccms.toLowerCase()}` : st.iccms);

export const ICDAS_NOTE = 'ICDAS codes describe what is seen clinically; they correspond only roughly to how deep the lesion reaches in the section. On radiographs ICCMS stages are separate: E1, E2 and D1 are initial, D2 moderate, D3 extensive.';

/** Tissues and lesion zones: `real` is the natural colour, `colour` the study colour shown with Show zones. */
export const ZONES: Record<string, { name: string; note: string; colour: string; real: string }> = {
  enamel: { name: 'Enamel', note: 'Sound enamel: about 96% mineral by weight (hydroxyapatite) in prisms running from the DEJ to the surface.', colour: '#ece6d6', real: '#e9e4d7' },
  dentin: { name: 'Dentin', note: 'Sound dentin: about 70% mineral, with tubules from the pulp to the DEJ that carry odontoblast processes.', colour: '#e4c99a', real: '#e3c891' },
  cementum: { name: 'Cementum', note: 'Thin layer covering the root, here exposed by gingival recession. It holds less mineral than enamel and dissolves at a higher pH.', colour: '#cfae7a', real: '#d4b984' },
  pulp: { name: 'Pulp', note: 'Soft connective tissue with odontoblasts lining its wall, nerves and vessels. It reacts to an approaching lesion by laying down tertiary dentin, and becomes inflamed if bacteria come close.', colour: '#d9727c', real: '#c25f69' },
  'enamel-surface-zone': { name: 'Surface zone', note: 'A relatively intact surface layer (about 20–50 µm) over the subsurface lesion. It stays mineralised because mineral from saliva and plaque fluid, helped by fluoride, redeposits at the surface. It breaks down when the lesion cavitates.', colour: '#ffffff', real: '#f3efe4' },
  'enamel-lesion-body': { name: 'Body of the lesion', note: 'The largest zone, where most mineral has been lost (pore volume about 5–25%). It scatters light, which is why an early lesion looks chalky white.', colour: '#f8f6f0', real: '#f8f5ec' },
  'enamel-dark-zone': { name: 'Dark zone', note: 'Just superficial to the translucent zone, behind the advancing front: small pores (2–4% pore volume) where some remineralisation happens. It looks dark under polarised light in a quinoline-mounted section.', colour: '#8f8a99', real: '#ddd5c6' },
  'enamel-translucent-zone': { name: 'Translucent zone', note: 'The advancing front of the enamel lesion, slightly more porous (about 1%) than sound enamel. It looks structureless when the section is mounted in quinoline and is not always present.', colour: '#bcd3e6', real: '#e4e0d4' },
  'infected-dentin': { name: 'Infected dentin', note: 'Outer carious dentin: soft and wet, with bacteria in the tubules and denatured collagen. It cannot remineralise; it is removed at the cavity margins, but in a deep lesion soft dentin may be left over the pulp under a sealed restoration (selective removal). Clinically, dentists judge by hardness (soft, leathery, firm, hard).', colour: '#7a4b2a', real: '#5a381c' },
  'affected-dentin': { name: 'Affected dentin', note: 'Inner carious dentin: demineralised but with intact collagen and few bacteria; leathery to firm. It can remineralise, so over the pulp it is left in place (selective removal).', colour: '#b98a4f', real: '#a5773d' },
  'sclerotic-dentin': { name: 'Sclerotic (transparent) dentin', note: 'At the advancing front the tubules fill with mineral, which makes the dentin transparent and less permeable: a defence that slows the lesion.', colour: '#f2e2b8', real: '#d4b373' },
  'alveolar-bone': { name: 'Alveolar bone', note: 'The bone of the tooth socket: a thin cortical lining (lamina dura) around the periodontal ligament space, and cancellous bone between. Its crest normally lies about 1.5–2 mm apical to the CEJ, and follows the gingiva when it recedes.', colour: '#d9cfc0', real: '#e2d6bf' },
  pdl: { name: 'Periodontal ligament', note: 'The ligament in the narrow space (about 0.15–0.38 mm) between the root and the socket wall: collagen fibres anchored in cementum and bone (Sharpey’s fibres), with fibroblasts, vessels and nerves. It holds the tooth, cushions biting forces and senses pressure.', colour: '#e6b8b8', real: '#d99a96' },
  gingiva: { name: 'Gingiva', note: 'Healthy gingiva sits about 1 mm coronal to the CEJ and covers the root. With recession (from periodontal disease or toothbrushing trauma) the root surface is exposed, which is where root caries starts.', colour: '#e8a0a0', real: '#e49a9b' },
  'tertiary-dentin': { name: 'Tertiary dentin', note: 'Laid down on the pulp wall beneath the lesion: reactionary dentin from surviving odontoblasts, or reparative dentin from new odontoblast-like cells. It moves the pulp away from the lesion.', colour: '#d8bb86', real: '#dbbf86' },
};

/**
 * Lesion-molar parts are named cl-<kind>-<stage>-<zone>, cl-<kind>-static-<zone> for the unchanging
 * rest of the cut tooth, and cl-<kind>-perio-<zone> for the bone and gingiva around it.
 */
export const zoneOfPart = (key: string) => key.replace(/^cl-(pit-fissure|smooth-surface|root)-(\d+|static|perio)-/, '');
export const isLesionPart = (key: string) => key.startsWith('cl-');

export interface LesionStageModel { parts: string[]; pins: { region: string; position: [number, number, number]; normal: [number, number, number] }[] }
export const LESION_MODEL = generated.lesions as unknown as Record<LesionKind, {
  cuts: { axis: number; at: number; side: number }[]; static: string; staticParts: string[]; perio: string; view: [number, number, number]; origin: [number, number, number]; stages: LesionStageModel[];
}>;
/** Group (for visibility) of one stage of a lesion, and of the unchanging part of its section. */
export const stageGroup = (kind: LesionKind, stage: number) => `cl-${kind}-${stage}`;
/** The lesion molar's regions in the model's order: cut faces name the zone they blend into by this index. */
export const LESION_REGIONS = (generated as unknown as { regions: string[] }).regions;
export const staticGroup = (kind: LesionKind) => LESION_MODEL[kind].static;
export const perioGroup = (kind: LesionKind) => LESION_MODEL[kind].perio;
export const PERIO_ZONES = ['alveolar-bone', 'pdl', 'gingiva'];

// ---------- Sites on the arch ----------
export interface Site {
  id: string;
  label: string;
  /** The class or name shown on the pin. */
  short: string;
  /** The arch of the tooth it is shown on (the lesion moves with it when the bite opens). */
  arch: 'upper' | 'lower';
  where: string;
  note: string;
  management: string;
}
export const SITES: Site[] = [
  { id: 'class-1', label: 'Class I', short: 'I', arch: 'lower', where: 'Pits and fissures: occlusal surfaces of premolars and molars, buccal and lingual pits of molars, lingual pits of maxillary incisors. Shown on 46.', note: 'The commonest site in children and adolescents. Fissures trap biofilm, and the lesion starts on the fissure walls (see the pit & fissure lesion).', management: 'Sealants prevent and arrest early lesions; cavitated lesions need a conservative occlusal restoration.' },
  { id: 'class-2', label: 'Class II', short: 'II', arch: 'upper', where: 'Proximal surfaces of premolars and molars, just cervical to the contact area. Shown on 14.', note: 'Hidden below the contact: detected with bitewing radiographs (see the smooth-surface lesion).', management: 'Early lesions: interdental cleaning, fluoride, resin infiltration. Cavitated: a Class II (box, slot or tunnel) restoration.' },
  { id: 'class-3', label: 'Class III', short: 'III', arch: 'upper', where: 'Proximal surfaces of incisors and canines, not involving the incisal angle. Shown on 21.', note: 'Often seen by transillumination as a shadow from the labial or palatal side.', management: 'Usually restored with composite from the palatal or lingual side to save the labial enamel.' },
  { id: 'class-4', label: 'Class IV', short: 'IV', arch: 'upper', where: 'Proximal surfaces of incisors and canines involving the incisal angle. Shown on 11.', note: 'A Class III lesion that has undermined the incisal angle, or a fracture.', management: 'Composite restoration rebuilding the incisal angle.' },
  { id: 'class-5', label: 'Class V', short: 'V', arch: 'lower', where: 'Gingival third of the facial or lingual surface of any tooth. Shown on 43.', note: 'Plaque collects along the gingival margin. Cervical lesions may extend onto the root.', management: 'Plaque control and fluoride for early lesions; glass ionomer or composite when cavitated.' },
  { id: 'class-6', label: 'Class VI', short: 'VI', arch: 'upper', where: 'Incisal edges of anterior teeth and cusp tips of posterior teeth (added to Black’s classes by Simon, 1956). Shown on 23.', note: 'Rare as caries; cusp tips are self-cleansing. Defects here are often wear or developmental.', management: 'Small composite restoration if needed.' },
  { id: 'root', label: 'Root caries', short: 'R', arch: 'lower', where: 'Root surfaces exposed by gingival recession, at or below the CEJ. Shown on 34.', note: 'Common in older adults, with recession and a dry mouth (see the root lesion).', management: 'High-fluoride toothpaste, fluoride varnish or silver diamine fluoride; glass ionomer when it must be restored.' },
  { id: 'secondary', label: 'Secondary caries', short: 'S', arch: 'upper', where: 'At the margin of an existing restoration. Shown around an occlusal restoration on 26.', note: 'A new (recurrent) lesion at the restoration margin, where biofilm collects in a gap or ledge. The commonest reason restorations are replaced; most often at the gingival margin of Class II and V restorations.', management: 'Small, accessible lesions can be repaired or sealed; otherwise the restoration is replaced.' },
];
export const siteById = (id: string) => SITES.find((s) => s.id === id);
/** Site patches on the arch are named site-<id>; a secondary-caries site also has its restoration. */
export const SITE_PINS = sites as { id: string; key: string; position: [number, number, number]; normal: [number, number, number] }[];
export const SITE_COLOUR: Record<string, string> = { site: '#8a5a2b', restoration: '#9aa1a9' };

// ---------- The caries process ----------
/** Critical pH for enamel (hydroxyapatite) in typical plaque fluid; root dentin is higher. */
export const CRITICAL_PH = 5.5;
export const RESTING_PH = 6.8;
export type Scenario = 'single' | 'frequent';
export const SCENARIOS: [Scenario, string, string][] = [
  ['single', 'One sugary snack', 'One sugar intake at the start: the plaque pH falls below 5.5 within minutes and recovers in about 30–60 minutes. The rest of the time saliva and fluoride put mineral back.'],
  ['frequent', 'Frequent snacks', 'Sugar every 20 minutes: the pH never recovers, enamel spends most of the time below the critical pH, and mineral is lost overall.'],
];
/** The period shown by the Process view's timeline, in minutes. */
export const PROCESS_MINUTES = 120;
const INTAKES: Record<Scenario, number[]> = { single: [0], frequent: [0, 20, 40, 60, 80, 100] };
/** One Stephan curve: the drop after sugar (minimum near 5 at about 7 minutes) and the slow return. */
const dip = (t: number) => (t < 0 ? 0 : (t / 7) * Math.exp(1 - t / 7));
/** Plaque pH at minute t for a scenario (overlapping intakes add, floored at 4.5). */
export function plaquePH(t: number, scenario: Scenario) {
  const drop = INTAKES[scenario].reduce((d, at) => d + 1.8 * dip(t - at), 0);
  return Math.max(4.5, RESTING_PH - Math.min(drop, 2.3));
}
/**
 * Relative mineral content of the enamel at minute t (1 = sound): lost while the pH is below the
 * critical pH, regained more slowly above it. Schematic, to show the balance, not real rates.
 */
export function mineralAt(t: number, scenario: Scenario) {
  let m = 1;
  for (let s = 0; s < t; s += 0.5) {
    const ph = plaquePH(s, scenario);
    m += ph < CRITICAL_PH ? -0.004 * (CRITICAL_PH - ph) : 0.0012 * (ph - CRITICAL_PH) * (1 - m) * 6;
    m = Math.min(1, m);
  }
  return m;
}
/** Depth bands of the process block, surface first: the surface layer keeps more mineral than the body. */
export const BAND_LOSS = [0.35, 1, 0.9, 0.6, 0.25];
export const PROCESS_PARTS: Record<string, { name: string; note: string; colour: string }> = {
  'pr-band-0': { name: 'Enamel prisms: surface layer', note: 'The outermost enamel. During an attack it loses less mineral than the enamel below, because mineral redeposits here from plaque fluid and saliva, especially with fluoride: the surface zone of an early lesion.', colour: '#d6dde6' },
  'pr-band-1': { name: 'Enamel prisms: subsurface', note: 'Just below the surface, where acid that diffuses in dissolves the most mineral: the body of an early lesion.', colour: '#d6dde6' },
  'pr-band-2': { name: 'Enamel prisms: subsurface', note: 'Below the surface, where acid that diffuses in dissolves the most mineral: the body of an early lesion.', colour: '#d6dde6' },
  'pr-band-3': { name: 'Enamel prisms: deeper', note: 'Deeper enamel, reached by less acid; the lesion front advances here.', colour: '#d6dde6' },
  'pr-band-4': { name: 'Enamel prisms: deep', note: 'Sound enamel ahead of the lesion front.', colour: '#d6dde6' },
  'pr-pellicle': { name: 'Acquired pellicle', note: 'A thin film of salivary proteins that forms on enamel within minutes of cleaning. Bacteria attach to it first.', colour: '#c9b8e6' },
  'pr-biofilm-matrix': { name: 'Biofilm matrix', note: 'Extracellular polysaccharides made from sucrose by the bacteria. The matrix holds the biofilm together and keeps acid against the tooth.', colour: '#9fd3b0' },
  'pr-cocci': { name: 'Mutans streptococci', note: 'Chains of cocci (e.g. Streptococcus mutans): they ferment sugar to acid quickly, tolerate acid, and make the sticky matrix from sucrose.', colour: '#4f8a5c' },
  'pr-rods': { name: 'Lactobacilli and other rods', note: 'Rod-shaped acid-producers that thrive once the pH stays low; associated with lesion progression, especially in dentin.', colour: '#3f6f8f' },
};
/** Mineral loss shown as a colour from sound (blue-grey) to demineralised (chalky white). */
export function bandColour(band: number, mineral: number) {
  const loss = Math.min(1, (1 - mineral) * BAND_LOSS[band] * 9);
  const sound = [214, 221, 230], chalk = [253, 251, 244];
  return `rgb(${sound.map((c, i) => Math.round(c + (chalk[i] - c) * loss)).join(',')})`;
}
/** Biofilm colour by pH: neutral green to acidic orange. */
export function biofilmColour(ph: number) {
  const a = Math.min(1, Math.max(0, (RESTING_PH - ph) / (RESTING_PH - 4.8)));
  const neutral = [159, 211, 176], acid = [244, 162, 97];
  return `rgb(${neutral.map((c, i) => Math.round(c + (acid[i] - c) * a)).join(',')})`;
}
