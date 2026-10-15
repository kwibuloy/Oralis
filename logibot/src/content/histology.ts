/** Tissues of the tooth and periodontium, in the order they appear from outside in. */
export interface Tissue {
  key: string;
  name: string;
  color: string;
  composition: string;
  cells: string;
  features: string[];
  clinical: string;
}

export const TISSUES: Tissue[] = [
  {
    key: 'enamel', name: 'Enamel', color: '#f4efe4',
    composition: 'About 96% mineral (hydroxyapatite) by weight; the hardest tissue in the body.',
    cells: 'Formed by ameloblasts, which are lost when the tooth erupts, so enamel cannot regenerate.',
    features: [
      'Built from enamel rods (prisms) with a keyhole profile in cross-section, held together by interrod enamel.',
      'Incremental growth lines, the striae of Retzius, reach the surface as perikymata.',
      'Hunter–Schreger bands come from changes in rod direction; the neonatal line marks birth in primary teeth.',
    ],
    clinical: 'Acid etching dissolves rod cores or peripheries preferentially, giving the micro-retention that resin bonding relies on.',
  },
  {
    key: 'dentin', name: 'Dentin', color: '#e7cf9a',
    composition: 'About 70% mineral, 20% organic (mostly type I collagen) and 10% water. Elastic enough to support the brittle enamel.',
    cells: 'Odontoblasts line the pulp; each extends a process into a dentinal tubule.',
    features: [
      'Tubules run S-shaped in the crown (primary curvature) and straighter in the root.',
      'Peritubular dentin lines each tubule and is more mineralised than the intertubular dentin between them.',
      'Primary dentin forms before root completion, secondary dentin slowly throughout life, and tertiary (reactionary or reparative) dentin in response to injury.',
      'The dentinoenamel junction is scalloped, which helps lock the two tissues together.',
    ],
    clinical: 'Dentin hypersensitivity is explained by the hydrodynamic theory: fluid movement in open tubules stimulates pulpal nerves.',
  },
  {
    key: 'pulp', name: 'Pulp', color: '#c8594f',
    composition: 'Loose connective tissue with blood vessels, lymphatics and nerves, entering through the apical foramen.',
    cells: 'Odontoblasts at the periphery, then fibroblasts (the main cell), undifferentiated mesenchymal cells, and immune cells.',
    features: [
      'Zones from outside in: odontoblastic layer, cell-free zone of Weil, cell-rich zone, pulp core.',
      'The subodontoblastic nerve plexus of Raschkow sends free endings among the odontoblasts.',
      'The chamber shrinks with age as secondary dentin forms; pulp stones become more common.',
    ],
    clinical: 'Enclosed in rigid dentin, inflamed pulp cannot swell, so pressure builds: one reason pulpitis is so painful.',
  },
  {
    key: 'cementum', name: 'Cementum', color: '#d9b67a',
    composition: 'About 45–50% mineral; avascular and not innervated.',
    cells: 'Cementoblasts on the surface; cementocytes trapped in lacunae within cellular cementum.',
    features: [
      'Acellular extrinsic fibre cementum covers the cervical and middle root and anchors the tooth.',
      'Cellular cementum is found in the apical third and furcations, and adds thickness through life.',
      'At the cementoenamel junction cementum overlaps enamel in about 60% of teeth, meets it edge to edge in 30%, and leaves a gap in 10%.',
    ],
    clinical: 'Sharpey’s fibres of the periodontal ligament are embedded in cementum; root planing aims to leave it smooth and clean.',
  },
  {
    key: 'pdl', name: 'Periodontal ligament', color: '#9a6b8a',
    composition: 'Dense connective tissue, mostly type I collagen, 0.15–0.38 mm wide; narrowest around the middle of the root.',
    cells: 'Fibroblasts are the main cells; also osteoblasts, cementoblasts, osteoclasts and the epithelial rests of Malassez.',
    features: [
      'Principal fibre groups: alveolar crest, horizontal, oblique (the most numerous, resisting biting forces), apical and interradicular.',
      'Rich nerve supply gives fine proprioception and the jaw-opening reflex.',
      'Rests of Malassez, left over from Hertwig’s root sheath, can give rise to radicular cysts.',
    ],
    clinical: 'On a radiograph the ligament shows as a thin dark line around the root; widening can indicate trauma from occlusion or apical pathology.',
  },
  {
    key: 'bone', name: 'Alveolar bone', color: '#b9ab92',
    composition: 'The part of the jaw that exists to hold teeth; it resorbs once teeth are lost.',
    cells: 'Osteoblasts, osteocytes and osteoclasts, constantly remodelling.',
    features: [
      'Alveolar bone proper lines the socket: bundle bone holding Sharpey’s fibres, seen radiographically as the lamina dura.',
      'Supporting bone consists of the buccal and lingual cortical plates with cancellous (trabecular) bone between.',
      'The alveolar crest normally lies 1.5–2 mm below the cementoenamel junction.',
    ],
    clinical: 'Orthodontic movement works by resorption on the pressure side and deposition on the tension side of the socket.',
  },
  {
    key: 'gingiva', name: 'Gingiva', color: '#d88a8a',
    composition: 'Stratified squamous epithelium over dense connective tissue with gingival fibre groups.',
    cells: 'Keratinocytes; fibroblasts in the lamina propria; immune cells increase with inflammation.',
    features: [
      'Oral gingival epithelium is keratinised or parakeratinised; sulcular epithelium is not.',
      'Junctional epithelium attaches to the enamel by hemidesmosomes and an internal basal lamina.',
      'Free gingiva surrounds the tooth above the sulcus; attached gingiva is bound to bone down to the mucogingival junction.',
    ],
    clinical: 'Junctional epithelium turns over in days, which lets it re-attach after careful scaling.',
  },
];

export const tissueByKey = (key: string) => TISSUES.find((t) => t.key === key);
