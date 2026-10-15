/**
 * The carving tooth in Oral anatomy: an idealised left mandibular first molar (FDI 36), built by
 * scripts/build-carving-tooth.mjs to Wheeler's proportions. Landmark positions come from
 * carving.generated.json (same script, so they sit on the surface); names and notes are here.
 */
import generated from './carving.generated.json';

export type LandmarkKind = 'cusp' | 'ridge' | 'groove' | 'fossa' | 'pit' | 'contour' | 'cervix' | 'root';

export interface Landmark {
  id: string;
  n: number;
  kind: LandmarkKind;
  position: [number, number, number];
  normal: [number, number, number];
  name: string;
  note: string;
}

export const KIND_LABEL: Record<LandmarkKind, string> = {
  cusp: 'Cusps', ridge: 'Ridges', groove: 'Grooves', fossa: 'Fossae', pit: 'Pits', contour: 'Contours and contacts', cervix: 'Cervical line', root: 'Roots',
};

const INFO: Record<string, { name: string; note: string }> = {
  'mesiobuccal-cusp': { name: 'Mesiobuccal cusp', note: 'The widest buccal cusp. With the distobuccal and distal cusps it forms the buccal (functional) cusps that occlude in the central fossae and marginal ridge areas of the maxillary teeth.' },
  'distobuccal-cusp': { name: 'Distobuccal cusp', note: 'The middle buccal cusp, slightly smaller than the mesiobuccal. Separated from it by the mesiobuccal groove and from the distal cusp by the distobuccal groove.' },
  'distal-cusp': { name: 'Distal cusp', note: 'The smallest cusp, at the distobuccal angle of the crown. Its presence is what gives the mandibular first molar five cusps.' },
  'mesiolingual-cusp': { name: 'Mesiolingual cusp', note: 'The highest cusp and the widest of the lingual cusps. Mandibular lingual cusps are higher and more pointed than the buccal cusps, so the lingual cusps show above the buccal ones in buccal view.' },
  'distolingual-cusp': { name: 'Distolingual cusp', note: 'Slightly smaller than the mesiolingual cusp, separated from it by the lingual groove.' },
  'mesial-marginal-ridge': { name: 'Mesial marginal ridge', note: 'Rounded enamel ridge forming the mesial border of the occlusal table, between the mesiobuccal and mesiolingual cusp ridges. It is better developed than the distal marginal ridge.' },
  'distal-marginal-ridge': { name: 'Distal marginal ridge', note: 'Forms the distal border of the occlusal table, between the distal and distolingual cusps. It is shorter and less prominent than the mesial marginal ridge.' },
  'buccal-cervical-ridge': { name: 'Buccal cervical ridge', note: 'Enamel bulge running mesiodistally across the cervical third of the buccal surface. It is traditionally said to protect the gingival margin by deflecting food.' },
  'central-groove': { name: 'Central developmental groove', note: 'Runs mesiodistally across the occlusal table from the mesial pit through the central pit to the distal pit, zig-zagging between the buccal and lingual cusps.' },
  'mesiobuccal-groove': { name: 'Mesiobuccal developmental groove', note: 'Separates the mesiobuccal and distobuccal cusps. It runs from the central pit across the occlusal surface and down the buccal surface, often ending in the buccal pit.' },
  'distobuccal-groove': { name: 'Distobuccal developmental groove', note: 'Separates the distobuccal and distal cusps. It leaves the central groove distal to the central pit and crosses onto the buccal surface near the distobuccal angle.' },
  'lingual-groove': { name: 'Lingual developmental groove', note: 'Separates the mesiolingual and distolingual cusps. It runs from the central pit onto the lingual surface.' },
  'central-fossa': { name: 'Central fossa', note: 'The large, roughly circular depression in the middle of the occlusal table, bounded by the cusp ridges. The mesiolingual cusp of the maxillary first molar occludes here.' },
  'mesial-triangular-fossa': { name: 'Mesial triangular fossa', note: 'Small triangular depression just inside the mesial marginal ridge, with the mesial pit at its deepest point, where the central groove ends.' },
  'distal-triangular-fossa': { name: 'Distal triangular fossa', note: 'Small triangular depression just inside the distal marginal ridge, with the distal pit at its deepest point, where the central groove ends. Smaller than the mesial triangular fossa.' },
  'central-pit': { name: 'Central pit', note: 'Where the central, mesiobuccal and lingual grooves meet at the bottom of the central fossa.', },
  'mesial-pit': { name: 'Mesial pit', note: 'At the mesial end of the central groove, in the mesial triangular fossa.' },
  'distal-pit': { name: 'Distal pit', note: 'At the distal end of the central groove, in the distal triangular fossa.' },
  'buccal-pit': { name: 'Buccal pit', note: 'Where the mesiobuccal groove ends on the buccal surface, roughly halfway down the crown.' },
  'buccal-height-of-contour': { name: 'Buccal height of contour', note: 'The most prominent point of the buccal surface, in the cervical third. Occlusal to it the buccal outline converges sharply towards the occlusal surface. The whole crown is also inclined lingually on its root trunk.' },
  'lingual-height-of-contour': { name: 'Lingual height of contour', note: 'The most prominent point of the lingual surface, in the middle third.' },
  'mesial-contact-area': { name: 'Mesial contact area', note: 'Where the crown touches the mandibular second premolar: near the junction of the occlusal and middle thirds, slightly buccal to the centre.' },
  'distal-contact-area': { name: 'Distal contact area', note: 'Where the crown touches the mandibular second molar: slightly more cervical than the mesial contact, in the middle third.' },
  'cervical-line': { name: 'Cervical line (CEJ)', note: 'Where enamel meets cementum. It is fairly level buccally and lingually (on the buccal it often dips slightly towards the bifurcation) and curves occlusally about 1 mm on the mesial surface, less on the distal.' },
  'root-trunk': { name: 'Root trunk', note: 'The undivided part of the root between the cervical line and the furcation, about 3 mm long buccally.' },
  'furcation': { name: 'Furcation', note: 'Where the root trunk divides into the mesial and distal roots.' },
  'mesial-root': { name: 'Mesial root', note: 'The larger root, broad buccolingually and flattened mesiodistally. It curves mesially below the cervix, then distally to an apex roughly below the mesiobuccal cusp. It usually has two canals.' },
  'distal-root': { name: 'Distal root', note: 'Usually slightly shorter and less curved than the mesial root, with a more pointed apex, inclined distally with its apex below the distal contact area. It usually has one canal, sometimes two.' },
  'mesial-apex': { name: 'Mesial root apex', note: 'Tip of the mesial root, about 14 mm from the cervical line.' },
  'distal-apex': { name: 'Distal root apex', note: 'Tip of the distal root, usually a little shorter than the mesial.' },
};

export const LANDMARKS: Landmark[] = generated.landmarks.map((l) => ({
  id: l.id,
  n: l.n,
  kind: l.kind as LandmarkKind,
  position: l.position as [number, number, number],
  normal: l.normal as [number, number, number],
  name: INFO[l.id]?.name ?? l.id,
  note: INFO[l.id]?.note ?? '',
}));
export const landmarkById = (id: string) => LANDMARKS.find((l) => l.id === id);
export const landmarkHasNote = (id: string) => id in INFO;

/** Wheeler's measurements for the mandibular first molar (mm), as carving guides. */
export const MEASUREMENTS: [string, number][] = [
  ['Crown length (cervico-occlusal)', generated.wheeler.crownLength],
  ['Root length', generated.wheeler.rootLength],
  ['Mesiodistal diameter of crown', generated.wheeler.crownMD],
  ['Mesiodistal diameter at the cervix', generated.wheeler.cervixMD],
  ['Buccolingual diameter of crown', generated.wheeler.crownBL],
  ['Buccolingual diameter at the cervix', generated.wheeler.cervixBL],
  ['Curvature of the cervical line, mesial', generated.wheeler.cervicalCurveMesial],
  ['Curvature of the cervical line, distal', generated.wheeler.cervicalCurveDistal],
];

export const CARVING_TOOTH = {
  name: 'Left mandibular first molar',
  numbers: { fdi: '36', universal: '19', palmer: '┌6' },
  summary: 'The largest mandibular tooth and usually the first permanent tooth to erupt (6–7 years). Five cusps (three buccal, two lingual), two well-separated roots. This model is an idealised textbook form built to Wheeler’s proportions for carving practice, not a scan.',
  parts: {
    'carving-crown': { name: 'Crown (enamel)', note: 'The anatomical crown, covered by enamel, from the cervical line to the cusp tips.' },
    'carving-root': { name: 'Roots (cementum)', note: 'The root trunk and the mesial and distal roots, covered by cementum.' },
  } as Record<string, { name: string; note: string }>,
};
