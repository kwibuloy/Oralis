/**
 * Genetics: one sideways DNA ladder that students travel along in three views. DNA packs from the
 * double helix to a chromosome; Processes copies DNA, reads the DSPP gene into RNA and makes the
 * protein; Teeth stops at four tooth genes, each beside the tooth its faults cause. Names, notes,
 * steps and family trees are here; the model is built in Blender (scripts/blender/GENETICS_PLAN.md).
 *
 * The sequence is a real stretch of human DSPP, fetched from NCBI by scripts/fetch-dspp.mjs
 * (genetics-sequence.generated.json); everything else about it (partner strand, RNA, protein) is
 * derived here, never typed.
 */
import dspp from './genetics-sequence.generated.json';

export type GeneticsView = 'dna' | 'process' | 'teeth';
export const VIEW_OPTIONS: [GeneticsView, string][] = [['dna', 'DNA'], ['process', 'Processes'], ['teeth', 'Teeth']];

export interface Part {
  name: string;
  color: string;
  note: string;
}

// ---------- sequence ----------

export type Base = 'A' | 'T' | 'G' | 'C';
const PAIR: Record<string, string> = { A: 'T', T: 'A', G: 'C', C: 'G' };
/** Partner strand, read 3′→5′ under the given strand (so position i pairs with position i). */
export const partner = (seq: string) => seq.replace(/[ATGC]/g, (b) => PAIR[b]);
/** RNA copy of the coding strand: the same letters with U for T. */
export const toRna = (seq: string) => seq.replace(/T/g, 'U');
// Standard genetic code, codons ordered U, C, A, G at each position; '*' is a stop.
const CODE = 'FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG';
const ORDER = 'UCAG';
export const codonAmino = (codon: string) => CODE[ORDER.indexOf(codon[0]) * 16 + ORDER.indexOf(codon[1]) * 4 + ORDER.indexOf(codon[2])];
export const translate = (rna: string) => Array.from({ length: Math.floor(rna.length / 3) }, (_, i) => codonAmino(rna.slice(i * 3, i * 3 + 3))).join('');

export const DSPP = {
  ...dspp,
  /** What the DNA ladder shows: exon 2 from the start codon, then the start of intron 2. */
  ladder: dspp.exon2Coding + dspp.intronStart,
  /** Spliced coding RNA drawn on the processes path: exon 2 from the start codon joined to exon 3. */
  mrna: toRna(dspp.exon2Coding + dspp.exon3Start),
};
export const DSPP_PROTEIN = translate(DSPP.mrna);

/** A, T, G, C colours (with U for RNA). Letters always go with them in the legend, so colour is not the only cue. */
export const BASE_COLOR: Record<Base | 'U', string> = { A: '#2f9e44', T: '#e03131', U: '#e03131', G: '#f59f00', C: '#1c7ed6' };

// ---------- parts ----------

export const PARTS: Record<string, Part> = {
  // DNA, level 1: double helix
  'dna-sugar': { name: 'Sugar–phosphate backbone', color: '#8f9bb3', note: 'Each strand’s backbone alternates deoxyribose sugars and phosphate groups, joined by phosphodiester bonds. The two strands run in opposite directions (antiparallel): one 5′→3′, the other 3′→5′.' },
  'dna-phosphate': { name: 'Phosphate group', color: '#f2c14e', note: 'Phosphates carry a negative charge. That makes DNA an acid and lets it grip the positively charged histones.' },
  'dna-base-a': { name: 'Adenine (A)', color: BASE_COLOR.A, note: 'A purine (two rings). Pairs with thymine (T) by two hydrogen bonds; in RNA it pairs with uracil (U).' },
  'dna-base-t': { name: 'Thymine (T)', color: BASE_COLOR.T, note: 'A pyrimidine (one ring). Pairs with adenine (A) by two hydrogen bonds. RNA has uracil (U) in its place.' },
  'dna-base-g': { name: 'Guanine (G)', color: BASE_COLOR.G, note: 'A purine (two rings). Pairs with cytosine (C) by three hydrogen bonds, so G–C rich stretches hold together more strongly.' },
  'dna-base-c': { name: 'Cytosine (C)', color: BASE_COLOR.C, note: 'A pyrimidine (one ring). Pairs with guanine (G) by three hydrogen bonds.' },
  'dna-hbond': { name: 'Hydrogen bonds', color: '#d0d5dd', note: 'Weak bonds that hold the two bases of a pair together: two between A and T, three between G and C. Weak enough for helicase to unzip them, strong enough together to keep the helix closed.' },
  'dna-major-groove': { name: 'Major groove', color: '#d0d5dd', note: 'The wider of the two grooves between the backbones. Proteins that switch genes on and off read the base sequence mostly through it, without opening the helix.' },
  'dna-minor-groove': { name: 'Minor groove', color: '#d0d5dd', note: 'The narrower groove. The two grooves alternate because the sugars of a base pair sit on one side of the pair, not opposite each other.' },
  // level 2: nucleosomes
  'dna-histone-octamer': { name: 'Histone octamer', color: '#a48de0', note: 'Eight histone proteins, two each of H2A, H2B, H3 and H4. About 147 base pairs of DNA wrap round it about 1.7 times, making a nucleosome.' },
  'dna-wrapped-dna': { name: 'Nucleosome DNA', color: '#6c7fa8', note: 'The 147 base pairs wrapped round the histone octamer. Wrapped DNA is harder to read; chemical tags on the histone tails loosen or tighten it (epigenetics).' },
  'dna-linker-dna': { name: 'Linker DNA', color: '#6c7fa8', note: 'The stretch between two nucleosomes, usually 20–80 base pairs, giving the “beads on a string” look: a fibre about 11 nm wide.' },
  'dna-h1': { name: 'Histone H1', color: '#e599f7', note: 'The linker histone. It sits where DNA enters and leaves the nucleosome and helps fold nucleosomes into a thicker fibre.' },
  // level 3: fibre
  'dna-fibre': { name: 'Chromatin fibre (30 nm)', color: '#a48de0', note: 'The textbook model: nucleosomes coiled into a fibre about 30 nm across, about six per turn. In living cells the packing may be less regular, but this is the model exams use.' },
  // level 4: loops
  'dna-loops': { name: 'Chromatin loops', color: '#8c86cf', note: 'The fibre folds into loops, roughly 300 nm across, anchored at their bases to a protein scaffold. Genes in open loops can be read; tightly packed regions are mostly silent.' },
  'dna-scaffold': { name: 'Protein scaffold', color: '#f08c4a', note: 'A core of non-histone proteins, including condensin and topoisomerase II, that holds the bases of the loops.' },
  // level 5: chromosome
  'dna-p-arm': { name: 'Short arm (p)', color: '#958ad8', note: 'The shorter arm, above the centromere. Each arm is there twice, once in each sister chromatid: identical copies made when the DNA was copied.' },
  'dna-q-arm': { name: 'Long arm (q)', color: '#958ad8', note: `The longer arm, below the centromere. On chromosome 4 it carries two tooth genes: ENAM (4q13.3) and DSPP (${dspp.map}).` },
  'dna-centromere': { name: 'Centromere', color: '#f03e3e', note: 'The waist where the two sister chromatids are held together until the cell divides. It splits the chromosome into p and q arms.' },
  'dna-kinetochore': { name: 'Kinetochore', color: '#fab005', note: 'A protein disc on each side of the centromere. Spindle fibres attach here and pull the sister chromatids to opposite poles.' },
  'dna-telomere': { name: 'Telomere', color: '#20c997', note: 'Repeats of TTAGGG that cap the chromosome ends and protect them. They shorten a little each time most body cells divide; cells with telomerase, such as stem and germ cells, rebuild them.' },

  // Processes: copying DNA (replication)
  'rep-helicase': { name: 'Helicase', color: '#e64980', note: 'Unzips the double helix by breaking the hydrogen bonds between base pairs, opening the replication fork. It uses energy from ATP.' },
  'rep-topoisomerase': { name: 'Topoisomerase', color: '#15aabf', note: 'Works ahead of the fork, cutting and rejoining DNA to relieve the over-twisting that unzipping causes.' },
  'rep-ssb': { name: 'Single-strand binding proteins', color: '#94d82d', note: 'Coat the separated strands so they don’t zip back together or fold on themselves.' },
  'rep-primase': { name: 'Primase', color: '#fd7e14', note: 'Lays down short RNA primers. DNA polymerase cannot start a strand from nothing; it only adds to an existing end. In human cells primase works together with polymerase α.' },
  'rep-rna-primer': { name: 'RNA primer', color: '#ff6b6b', note: 'About 10 nucleotides of RNA that give DNA polymerase a starting point. Later removed and replaced with DNA.' },
  'rep-dna-polymerase': { name: 'DNA polymerase', color: '#7950f2', note: 'Adds nucleotides that pair with the template, only in the 5′→3′ direction, and proofreads as it goes. In human cells polymerase ε mostly builds the leading strand and polymerase δ the lagging strand.' },
  'rep-new-strand': { name: 'Leading strand', color: '#4dabf7', note: 'The new strand built continuously towards the fork, from a single primer.' },
  'rep-okazaki': { name: 'Okazaki fragments', color: '#74c0fc', note: 'On the lagging strand DNA is built in short pieces (about 100–200 nucleotides in human cells) away from the fork, each from its own primer.' },
  'rep-ligase': { name: 'DNA ligase', color: '#f59f00', note: 'Seals the gaps between fragments once the primers are replaced, joining them into one continuous strand.' },
  // reading DNA (transcription)
  'tx-promoter': { name: 'Promoter', color: '#51cf66', note: 'A DNA sequence just before a gene, often with a TATA box, where transcription factors and RNA polymerase bind.' },
  'tx-transcription-factors': { name: 'Transcription factors', color: '#63e6be', note: 'Proteins that recognise the promoter and bring RNA polymerase II. Which factors a cell has decides which genes it reads: odontoblasts read DSPP, most cells don’t.' },
  'tx-rna-polymerase': { name: 'RNA polymerase II', color: '#e8590c', note: 'Opens a small bubble of DNA and builds an RNA copy of one strand, 5′→3′. Unlike DNA polymerase, it needs no primer.' },
  'tx-template-strand': { name: 'Template strand', color: '#3b4252', note: 'The strand that is read. The RNA is complementary to it.' },
  'tx-coding-strand': { name: 'Coding strand', color: '#adb5bd', note: 'Has the same sequence as the RNA, with T where the RNA has U.' },
  'tx-mrna': { name: 'Messenger RNA (mRNA)', color: '#f783ac', note: 'A single-stranded copy of the gene, with uracil (U) in place of thymine. It carries the message from the nucleus to the ribosomes.' },
  'tx-intron': { name: 'Intron', color: '#adb5bd', note: `A stretch of the gene that is copied but spliced out before the mRNA leaves the nucleus; the remaining parts, exons, are joined. Almost all introns start with GT and end with AG. This one, DSPP intron 2, is ${dspp.intronLength.toLocaleString('en')} bases long; only its two ends are drawn.` },
  'tx-cap': { name: '5′ cap', color: '#5f3dc4', note: 'A modified guanine (7-methylguanosine) on the front end of the mRNA. It protects the mRNA and helps the ribosome find it.' },
  'tx-poly-a': { name: 'Poly-A tail', color: '#ffa94d', note: 'A string of about 200 adenines on the back end. It protects the mRNA and helps it leave the nucleus.' },
  // making a protein (translation)
  'tl-small-subunit': { name: 'Small ribosomal subunit', color: '#ffd43b', note: 'Already carrying the first tRNA (with methionine), it binds near the mRNA’s 5′ cap and scans along until it finds the start codon, AUG.' },
  'tl-large-subunit': { name: 'Large ribosomal subunit', color: '#fab005', note: 'Joins once the start codon is found. It has three tRNA sites: A (arriving), P (holding the chain) and E (exit). Its RNA, not a protein, forms the peptide bonds.' },
  'tl-trna': { name: 'Transfer RNA (tRNA)', color: '#da77f2', note: 'Brings one amino acid. Its anticodon pairs with a codon on the mRNA, so the right amino acid is added. The first tRNA carries methionine.' },
  'tl-start-codon': { name: 'Start codon (AUG)', color: '#2f9e44', note: 'Where translation begins; it codes for methionine. In DSPP it lies in exon 2, after a short stretch that is never translated.' },
  'tl-stop-codon': { name: 'Stop codon', color: '#e03131', note: 'UAA, UAG or UGA. No tRNA matches it; a release factor binds instead. (DSPP’s real stop codon is near the end of its long last exon; the path shortens the way to it.)' },
  'tl-release-factor': { name: 'Release factor', color: '#ff8787', note: 'Binds the stop codon in the A site and frees the finished chain from the ribosome.' },
  'tl-polypeptide': { name: 'Polypeptide', color: '#4dabf7', note: `The chain of amino acids joined by peptide bonds. DSPP begins ${DSPP_PROTEIN.slice(0, 8)}…; its first ${dspp.signalPeptide} amino acids are a signal peptide that sends it out of the cell and is then cut off. The rest is cut into dentin sialoprotein and dentin phosphoprotein, which guide how dentin mineralises.` },
};

// ---------- DNA view: packing levels ----------

export interface Step {
  title: string;
  text: string;
  /** Parts first shown or most important at this step (labels and the step card). */
  parts: string[];
}
export interface DnaLevel extends Step { size: string }

export const DNA_LEVELS: DnaLevel[] = [
  { title: 'Double helix', size: 'About 2 nm across · about 3.5 nm per turn', parts: ['dna-sugar', 'dna-phosphate', 'dna-base-a', 'dna-base-t', 'dna-base-g', 'dna-base-c', 'dna-hbond', 'dna-major-groove', 'dna-minor-groove'],
    text: 'Two strands twist into a right-handed helix, about 10.5 base pairs per turn. Each rung is a base pair: A with T, G with C. The letters are real: the start of the coding part of DSPP, a tooth gene.' },
  { title: 'Nucleosomes', size: 'About 11 nm across', parts: ['dna-histone-octamer', 'dna-wrapped-dna', 'dna-linker-dna', 'dna-h1'],
    text: 'DNA winds about 1.7 times round a spool of eight histone proteins, a nucleosome. Linker DNA joins one to the next, like beads on a string.' },
  { title: 'Chromatin fibre', size: 'About 30 nm across (textbook model)', parts: ['dna-fibre'],
    text: 'Nucleosomes coil into a thicker fibre, about six per turn. This is the classic textbook model; in living cells the packing may be less regular.' },
  { title: 'Loops', size: 'About 300 nm across', parts: ['dna-loops', 'dna-scaffold'],
    text: 'The fibre folds into loops held at their bases by a protein scaffold. Further folding packs them into condensed chromatin, about 700 nm across.' },
  { title: 'Chromosome', size: 'About 1.4 µm across', parts: ['dna-p-arm', 'dna-q-arm', 'dna-centromere', 'dna-kinetochore', 'dna-telomere'],
    text: 'Just before a cell divides, the packed DNA shows as an X: two identical sister chromatids, copies made when the DNA was copied, joined at the centromere. Drawn like chromosome 4, which carries the DSPP and ENAM tooth genes.' },
];
export const DNA_NOTE = 'Schematic. Each level really is thicker than the last (about 700 times from the double helix to the chromosome); the sizes are squeezed so all five fit on one path.';

// ---------- Processes view: one path, three sections ----------

export const SECTIONS = ['Copying DNA (replication)', 'Reading DNA (transcription)', 'Making a protein (translation)'] as const;
export interface ProcessStep extends Step { section: 0 | 1 | 2 }

export const PROCESS_STEPS: ProcessStep[] = [
  { section: 0, title: 'Unzipping', parts: ['rep-helicase', 'rep-topoisomerase', 'rep-ssb'],
    text: 'Helicase unzips the double helix at the replication fork. Topoisomerase, ahead of it, relieves the twisting; single-strand binding proteins keep the strands apart.' },
  { section: 0, title: 'Primers', parts: ['rep-primase', 'rep-rna-primer'],
    text: 'Primase lays short RNA primers. DNA polymerase cannot start a strand on its own; it can only add to an existing end.' },
  { section: 0, title: 'Leading strand', parts: ['rep-dna-polymerase', 'rep-new-strand'],
    text: 'DNA polymerase builds the new leading strand continuously towards the fork, always 5′→3′.' },
  { section: 0, title: 'Lagging strand', parts: ['rep-dna-polymerase', 'rep-okazaki'],
    text: 'On the other strand, building 5′→3′ means working away from the fork, so DNA is made in short Okazaki fragments, each from its own primer.' },
  { section: 0, title: 'Joining', parts: ['rep-ligase'],
    text: 'Primers are replaced with DNA and ligase seals the gaps. Each new molecule has one old and one new strand (semiconservative).' },
  { section: 1, title: 'Binding', parts: ['tx-promoter', 'tx-transcription-factors', 'tx-rna-polymerase'],
    text: 'Transcription factors find the promoter of the DSPP gene and bring RNA polymerase II. Tooth-forming cells (odontoblasts) read DSPP; most other cells keep it switched off.' },
  { section: 1, title: 'Opening', parts: ['tx-template-strand', 'tx-coding-strand'],
    text: 'The polymerase opens a small bubble of DNA. Only one strand, the template strand, is read.' },
  { section: 1, title: 'Building RNA', parts: ['tx-mrna', 'tx-cap'],
    text: 'The polymerase builds RNA 5′→3′, pairing U (not T) with A; it needs no primer. When the RNA is only about 25 bases long, a 5′ cap is added to its front end.' },
  { section: 1, title: 'Splicing', parts: ['tx-intron', 'tx-mrna'],
    text: 'Introns are copied too, but most are spliced out while the RNA is still being made, and the exons are joined.' },
  { section: 1, title: 'Cut free', parts: ['tx-poly-a', 'tx-mrna'],
    text: 'The polymerase runs past the end of the gene; the RNA is cut there and a poly-A tail is added. The DNA zips up again, and the finished mRNA leaves the nucleus.' },
  { section: 2, title: 'Start', parts: ['tl-small-subunit', 'tl-start-codon', 'tl-trna'],
    text: 'The small subunit, already carrying the first tRNA with methionine, binds near the 5′ cap and scans to the start codon, AUG.' },
  { section: 2, title: 'Ribosome assembles', parts: ['tl-large-subunit'],
    text: 'The large subunit joins. It has three tRNA sites: A (arriving), P (holding the chain) and E (exit).' },
  { section: 2, title: 'Elongation', parts: ['tl-trna', 'tl-polypeptide'],
    text: 'Each tRNA whose anticodon matches the next codon brings its amino acid; the ribosome joins it to the chain and moves one codon along.' },
  { section: 2, title: 'Stop', parts: ['tl-stop-codon', 'tl-release-factor'],
    text: 'A stop codon (UAA, UAG or UGA) has no matching tRNA; a release factor binds instead.' },
  { section: 2, title: 'Protein', parts: ['tl-polypeptide'],
    text: 'The chain is released and folds. From DSPP come dentin sialoprotein and dentin phosphoprotein, which guide how dentin mineralises. A fault in DSPP gives dentinogenesis imperfecta, in the Teeth view.' },
];
export const PROCESS_NOTE = 'Schematic shapes; spacing and speed are not to scale.';

// ---------- Teeth view: one stop per gene ----------

export type Pattern = 'AD' | 'AR';
export type ToothTissue = 'enamel' | 'dentin' | 'pulp';

export interface Condition {
  id: 'ai-hypoplastic' | 'ai-hypomaturation' | 'ai-hypocalcified' | 'di';
  name: string;
  short: string;
  gene: string;
  /** Gene notes: full name, chromosome band (NCBI Gene), and any renaming. */
  geneNote: string;
  band: string;
  pattern: Pattern;
  /** How it is passed on, in words, including other genes or patterns that give the same picture. */
  inheritance: string;
  shows: string;
  tissue: Partial<Record<ToothTissue, string>>;
  color: string;
}

export const CONDITIONS: Condition[] = [
  {
    id: 'ai-hypoplastic', name: 'Amelogenesis imperfecta, hypoplastic', short: 'AI hypoplastic', gene: 'ENAM', band: '4q13.3', pattern: 'AD', color: '#4dabf7',
    geneNote: 'Enamelin, a protein of the forming enamel matrix that lets enamel crystals grow long enough to reach full thickness.',
    inheritance: 'Autosomal dominant here (ENAM). Other genes give recessive forms, and AMELX on the X chromosome an X-linked form.',
    shows: 'The enamel is too thin (from pits and grooves to thin all over) but of normal hardness; where it is thin all over, crowns look small with gaps between them. On a radiograph the enamel still shows up brighter than the dentin.',
    tissue: { enamel: 'Thin enamel of normal hardness, sometimes pitted or grooved.', dentin: 'Normal dentin; its yellow colour shows through the thin enamel.', pulp: 'Normal pulp: this form affects only the enamel.' },
  },
  {
    id: 'ai-hypomaturation', name: 'Amelogenesis imperfecta, hypomaturation', short: 'AI hypomaturation', gene: 'MMP20', band: '11q22.2', pattern: 'AR', color: '#9775fa',
    geneNote: 'Matrix metallopeptidase 20 (enamelysin), an enzyme that cuts the enamel matrix proteins while enamel is being laid down; KLK4 later clears them so mineral can replace them.',
    inheritance: 'Autosomal recessive here (MMP20; also KLK4 on chromosome 19). AMELX on the X chromosome gives an X-linked form.',
    shows: 'The enamel is of normal thickness but softer than normal, mottled white to yellow-brown, and chips off the cusps. On a radiograph it is about as bright as the dentin.',
    tissue: { enamel: 'Normal thickness but too little mineral: mottled, soft and chipping. A probe tip can dent it under firm pressure.', dentin: 'Normal dentin: this form affects only the enamel.', pulp: 'Normal pulp: this form affects only the enamel.' },
  },
  {
    id: 'ai-hypocalcified', name: 'Amelogenesis imperfecta, hypocalcified', short: 'AI hypocalcified', gene: 'FAM83H', band: '8q24.3', pattern: 'AD', color: '#20c997',
    geneNote: 'A protein inside the enamel-forming cells, linked to their cytoskeleton; how its faults stop enamel mineralising is not yet known. NCBI and HGNC now name the gene SACK1H; papers and textbooks use FAM83H.',
    inheritance: 'Autosomal dominant (FAM83H, the most common cause of the dominant hypocalcified form).',
    shows: 'The enamel is of normal thickness when the tooth erupts but very soft. It turns yellow-brown and wears away soon after, exposing dentin on the biting surface. It is less bright than dentin on a radiograph, and heavy calculus is common.',
    tissue: { enamel: 'Very soft, poorly mineralised enamel, worn away on the biting surface.', dentin: 'Normal dentin, exposed where the enamel has worn away.', pulp: 'Normal pulp: this form affects only the enamel.' },
  },
  {
    id: 'di', name: 'Dentinogenesis imperfecta', short: 'Dentinogenesis imperfecta', gene: 'DSPP', band: dspp.map, pattern: 'AD', color: '#f76707',
    geneNote: 'Dentin sialophosphoprotein, the gene drawn on the DNA and Processes paths. Its protein is cut into dentin sialoprotein and dentin phosphoprotein, which guide dentin mineralisation.',
    inheritance: 'Autosomal dominant (DSPP; type II, and the rarer type III). Type I is the same tooth picture in osteogenesis imperfecta (brittle bones), from type I collagen genes (COL1A1, COL1A2).',
    shows: 'Amber to grey-blue, see-through (opalescent) teeth. Crowns are bulb-shaped with a narrow neck, roots are short and thin, and the pulp spaces fill in. The enamel is normal but breaks away, thought to be because the junction with the dentin lacks its scalloping. (This is type II; in type III, “shell teeth”, the dentin is thin and the pulps are large.)',
    tissue: { enamel: 'Normal enamel that chips away from the soft dentin, here lost from the biting surface.', dentin: 'Amber, poorly mineralised, opalescent dentin that wears quickly.' },
  },
];
export const HEALTHY_TISSUE: Record<ToothTissue, string> = {
  enamel: 'Healthy enamel: thickest over the cusps (about 2.5 mm on a molar), thinning to nothing at the neck.',
  dentin: 'Healthy dentin with a scalloped junction to the enamel.',
  pulp: 'Healthy pulp: a chamber with horns under the cusps, and a canal in each root.',
};
export const TEETH_NOTE = 'The genes are lined up on one ladder only to study them: ENAM and DSPP lie on chromosome 4, MMP20 on 11, FAM83H on 8. The teeth are lower first molars cut in half lengthwise, beside a healthy one.';

const TISSUE_COLOR: Record<ToothTissue, string> = { enamel: '#f4efe4', dentin: '#e7cf9a', pulp: '#c8594f' };
const CONDITION_COLOR: Partial<Record<string, string>> = { 'ai-hypoplastic-enamel': '#efe4c4', 'ai-hypomaturation-enamel': '#ead9b4', 'ai-hypocalcified-enamel': '#c99a5b', 'di-enamel': '#ddd6c4', 'di-dentin': '#b07a3f' };
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
export const toothKey = (id: string, tissue: ToothTissue) => `gt-${id}-${tissue}`;
export const geneKey = (gene: string) => `gt-gene-${gene.toLowerCase()}`;
for (const t of ['enamel', 'dentin', 'pulp'] as ToothTissue[]) {
  PARTS[toothKey('healthy', t)] = { name: `${cap(t)} · healthy`, color: TISSUE_COLOR[t], note: HEALTHY_TISSUE[t] };
  for (const c of CONDITIONS) {
    const note = c.tissue[t];
    if (note) PARTS[toothKey(c.id, t)] = { name: `${cap(t)} · ${c.short}`, color: CONDITION_COLOR[`${c.id}-${t}`] ?? TISSUE_COLOR[t], note };
  }
}
for (const c of CONDITIONS) PARTS[geneKey(c.gene)] = { name: `${c.gene} gene (${c.band})`, color: c.color, note: `${c.geneNote} Faults in it cause ${c.name.toLowerCase()}. ${c.inheritance}` };

// ---------- family trees ----------

/** One person: sex, and affected (a), carrier (c) or unaffected (''). Parents index into the same list. */
export interface Person { sex: 'M' | 'F'; status: 'a' | 'c' | ''; generation: 1 | 2 | 3; parents?: [number, number] }
export interface Pedigree { note: string; people: Person[] }

export const PEDIGREES: Record<Pattern, Pedigree> = {
  AD: {
    note: 'Autosomal dominant: one changed copy is enough. An affected parent passes it to about half the children, boys and girls alike, usually in every generation.',
    people: [
      { sex: 'M', status: 'a', generation: 1 }, { sex: 'F', status: '', generation: 1 },
      { sex: 'M', status: '', generation: 2 }, // married in
      { sex: 'F', status: 'a', generation: 2, parents: [0, 1] }, { sex: 'M', status: '', generation: 2, parents: [0, 1] },
      { sex: 'M', status: 'a', generation: 2, parents: [0, 1] }, { sex: 'F', status: '', generation: 2, parents: [0, 1] },
      { sex: 'M', status: 'a', generation: 3, parents: [2, 3] }, { sex: 'F', status: '', generation: 3, parents: [2, 3] }, { sex: 'F', status: 'a', generation: 3, parents: [2, 3] },
    ],
  },
  AR: {
    note: 'Autosomal recessive: both copies must be changed. Carrier parents (dot) are unaffected; about a quarter of their children are affected, and it can skip generations.',
    people: [
      { sex: 'M', status: 'c', generation: 1 }, { sex: 'F', status: 'c', generation: 1 },
      { sex: 'M', status: '', generation: 2 }, // married in, not a carrier
      { sex: 'F', status: 'a', generation: 2, parents: [0, 1] }, { sex: 'M', status: 'c', generation: 2, parents: [0, 1] },
      { sex: 'M', status: '', generation: 2, parents: [0, 1] }, { sex: 'F', status: 'c', generation: 2, parents: [0, 1] },
      { sex: 'M', status: 'c', generation: 3, parents: [2, 3] }, { sex: 'F', status: 'c', generation: 3, parents: [2, 3] },
    ],
  },
};

export const partByKey = (key: string) => PARTS[key];

// ---------- the model so far: the path test (GENETICS_PLAN.md, step 2) ----------

/** Parts in public/models/genetics.glb (built by scripts/blender/build_genetics.py), all in one group. */
export const MODEL_PARTS = ['dna-sugar', 'dna-phosphate', 'dna-hbond', 'dna-base-a', 'dna-base-t', 'dna-base-g', 'dna-base-c'];
export const MODEL_GROUP = 'dna';

/** A stop on the path: what the camera frames (model units, glTF axes: the ladder runs along +x) and the shape-key weights. */
export interface PathStep {
  title: string;
  text: string;
  size?: string;
  view: { center: [number, number, number]; width: number; height: number };
  morph: Record<string, number>;
}
const LADDER_NM = DSPP.ladder.length * 0.34;
export const PATH_STEPS: PathStep[] = [
  { title: 'Double helix', size: DNA_LEVELS[0].size, text: DNA_LEVELS[0].text, view: { center: [LADDER_NM / 2, 0, 0], width: LADDER_NM + 4, height: 8 }, morph: { unzip: 0 } },
  { title: 'Base pairs', size: 'One base pair every 0.34 nm', text: 'A pairs with T by two hydrogen bonds, G with C by three, so the two strands carry the same message in mirror form. Tap a rung to read about its base.', view: { center: [5, 0, 0], width: 9, height: 5 }, morph: { unzip: 0 } },
  { title: 'Unzipping', size: 'The first step of copying DNA', text: 'Helicase breaks the hydrogen bonds and the strands part at a fork. Each strand is now a template for a new partner (Processes, coming next).', view: { center: [19, 0, 0], width: 17, height: 10 }, morph: { unzip: 1 } },
];
export const PATH_NOTE = 'Path test: one stretch of ladder with three stops. The full DNA, Processes and Teeth paths come next.';
