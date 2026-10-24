// Fetch the real DSPP stretch the Genetics subject draws (DNA ladder, copying, reading, translation)
// from NCBI and write src/content/genetics-sequence.generated.json. Run once, or to re-check:
//   node scripts/fetch-dspp.mjs
// Sources (versions pinned so the stretch never changes silently): RefSeq mRNA NM_014208.3 (MANE
// Select) and the GRCh38 chromosome 4 record NC_000004.12, gene region 87608529–87616872.
import { writeFileSync } from 'node:fs';

const MRNA = 'NM_014208.3';
const CHROM = { acc: 'NC_000004.12', start: 87608529, stop: 87616872 };
const EXON3_TAKE = 60; // coding bases of exon 3 shown after the splice
const GENOMIC_TAKE = 240; // chromosome bases from the start codon on: the ladder copied and read on the processes path

const eutils = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=nuccore&retmode=text';
const get = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} ${url}`); return r.text(); };

const gb = await get(`${eutils}&id=${MRNA}&rettype=gb`);
const version = gb.match(/^VERSION\s+(\S+)/m)[1];
if (version !== MRNA) throw new Error(`Expected ${MRNA}, NCBI returned ${version}`);
const mrna = gb.slice(gb.indexOf('\nORIGIN')).replace(/[^acgt]/g, '').toUpperCase();
const exons = [...gb.matchAll(/^ {5}exon {12}(\d+)\.\.(\d+)/gm)].map((m) => [Number(m[1]), Number(m[2])]);
const [cdsStart, cdsEnd] = gb.match(/^ {5}CDS {13}(\d+)\.\.(\d+)/m).slice(1).map(Number);
const protein = gb.match(/\/translation="([^"]+)"/)[1].replace(/\s/g, '');
const map = gb.match(/\/map="([^"]+)"/)[1];
const sigEnd = Number(gb.match(/^ {5}sig_peptide {5}\d+\.\.(\d+)/m)[1]);

// The coding sequence starts in exon 2; the stretch is exon 2 from the start codon, intron 2, exon 3.
const ex2 = exons.find(([a, b]) => a <= cdsStart && cdsStart <= b);
const ex3 = exons[exons.indexOf(ex2) + 1];
const exon2Coding = mrna.slice(cdsStart - 1, ex2[1]);
const exon3Start = mrna.slice(ex3[0] - 1, ex3[0] - 1 + EXON3_TAKE);

const fa = await get(`${eutils}&id=${CHROM.acc}&seq_start=${CHROM.start}&seq_stop=${CHROM.stop}&strand=1&rettype=fasta`);
const genomic = fa.split('\n').filter((l) => !l.startsWith('>')).join('').toUpperCase();
const i2 = genomic.indexOf(mrna.slice(ex2[0] - 1, ex2[1]));
const i3 = genomic.indexOf(mrna.slice(ex3[0] - 1, ex3[1]));
if (i2 < 0 || i3 < 0) throw new Error('Exons 2 and 3 not found in the genomic region');
const intron = genomic.slice(i2 + (ex2[1] - ex2[0] + 1), i3);
const startInGenomic = i2 + (cdsStart - ex2[0]);

// The Teeth path's gene stops: the first coding bases of each tooth gene (MANE Select RefSeq mRNAs).
const TEETH_GENES = { ENAM: 'NM_031889.3', MMP20: 'NM_004771.4', FAM83H: 'NM_198488.5', DSPP: MRNA };
const CODING_TAKE = 60;
const teethGenes = {};
for (const [gene, acc] of Object.entries(TEETH_GENES)) {
  const rec = await get(`${eutils}&id=${acc}&rettype=gb`);
  const v = rec.match(/^VERSION\s+(\S+)/m)[1];
  if (v !== acc) throw new Error(`Expected ${acc}, NCBI returned ${v}`);
  const seq = rec.slice(rec.indexOf('\nORIGIN')).replace(/[^acgt]/g, '').toUpperCase();
  const [start] = rec.match(/^ {5}CDS {13}(\d+)\.\.(\d+)/m).slice(1).map(Number);
  const prot = rec.match(/\/translation="([^"]+)"/)[1].replace(/\s/g, '');
  teethGenes[gene] = { mrna: acc, codingStart: seq.slice(start - 1, start - 1 + CODING_TAKE), proteinStart: prot.slice(0, CODING_TAKE / 3) };
}

const out = {
  source: `NCBI RefSeq ${MRNA} (DSPP mRNA, MANE Select) and ${CHROM.acc}:${CHROM.start}-${CHROM.stop} (GRCh38), fetched by scripts/fetch-dspp.mjs`,
  gene: 'DSPP', map, mrna: MRNA, chromosome: CHROM.acc,
  // Coding strand, 5′→3′.
  exon2Coding, intronStart: intron.slice(0, 30), intronEnd: intron.slice(-30), intronLength: intron.length, exon3Start,
  genomicFromStart: genomic.slice(startInGenomic, startInGenomic + GENOMIC_TAKE),
  // The real stop codon at the end of the coding sequence (mRNA letters as DNA, T for U).
  stopCodon: mrna.slice(cdsEnd - 3, cdsEnd),
  // First amino acids of the protein (NP_055023), for the translation check; signal peptide length in amino acids.
  proteinStart: protein.slice(0, (exon2Coding.length + exon3Start.length) / 3),
  signalPeptide: (sigEnd - cdsStart + 1) / 3,
  teethGenes,
};
writeFileSync(new URL('../src/content/genetics-sequence.generated.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
console.log(out);
