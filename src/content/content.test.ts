import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { baseName, GROUP_SYSTEM, GROUPS, noteFor } from './anatomy';
import { bloodColour, brainArea, DEOXYGENATED, flowFunction, FUNCTION_CONTEXT, FUNCTION_LAYERS, OXYGENATED } from './function';
import { TISSUES } from './histology';
import { LANDMARKS, landmarkHasNote } from './carving';
import { LESION_MODEL, LESION_TYPES, mineralAt, PERIO_ZONES, perioGroup, plaquePH, PROCESS_PARTS, SITE_PINS, SITES, staticGroup, stageGroup, ZONES } from './cariology';
import { CONDITIONS, DNA_LEVELS, DSPP, DSPP_PROTEIN, geneKey, MODEL_GROUP, MODEL_PARTS, nodeKey, PARTS, partner, PEDIGREES, PROCESS_MOTION, PROCESS_PARTS as GENETIC_PROCESS_PARTS, PROCESS_STEPS, TEETH_PARTS, TEETH_STEPS, toothKey, toRna, translate } from './genetics';
import { MODES } from './modes';
import { STRUCTURES, structureByKey } from './structures';
import { fdi, morphology, palmer, parseTooth, universal } from './teeth';
import { parseRoute } from '../lib/route';

const tooth = (name: string) => parseTooth(name)!;

describe('tooth numbering', () => {
  it('parses BodyParts3D names', () => {
    expect(tooth('Left lower first secondary molar tooth')).toMatchObject({ arch: 'lower', side: 'left', position: 6, cls: 'molar' });
    expect(tooth('Right upper secondary canine tooth')).toMatchObject({ arch: 'upper', side: 'right', position: 3 });
    expect(parseTooth('Mandible')).toBeNull();
  });

  it.each([
    ['Right upper central secondary incisor tooth', '11', '8', '1┘'],
    ['Left upper central secondary incisor tooth', '21', '9', '└1'],
    ['Right upper first secondary molar tooth', '16', '3', '6┘'],
    ['Left upper second secondary molar tooth', '27', '15', '└7'],
    ['Left lower first secondary molar tooth', '36', '19', '┌6'],
    ['Left lower central secondary incisor tooth', '31', '24', '┌1'],
    ['Right lower central secondary incisor tooth', '41', '25', '1┐'],
    ['Right lower second secondary molar tooth', '47', '31', '7┐'],
    ['Right lower secondary canine tooth', '43', '27', '3┐'],
  ])('%s → FDI %s, Universal %s, Palmer %s', (name, f, u, p) => {
    const t = tooth(name);
    expect([fdi(t), universal(t), palmer(t)]).toEqual([f, u, p]);
  });
});

describe('content coverage', () => {
  it('has all 28 permanent teeth with unique FDI numbers and morphology', () => {
    const teeth = STRUCTURES.filter((s) => s.tooth);
    expect(teeth).toHaveLength(28);
    expect(new Set(teeth.map((s) => fdi(s.tooth!))).size).toBe(28);
    for (const s of teeth) expect(morphology(s.tooth!), s.name).toBeDefined();
  });

  it('has a study note for every non-tooth structure', () => {
    const missing = STRUCTURES.filter((s) => !s.tooth && !noteFor(s.sourceName)).map((s) => s.sourceName);
    expect(missing).toEqual([]);
  });

  it('puts every General layer in a body system and includes every source mesh', () => {
    const general = STRUCTURES.filter((s) => s.models.includes('general'));
    expect([...new Set(general.map((s) => s.group))].filter((g) => !GROUP_SYSTEM[g])).toEqual([]);
    expect(general.reduce((n, s) => n + s.meshIds.length, 0)).toBe(2234);
  });

  it('gives intervertebral disks the disk note, not their vertebra’s', () => {
    for (const s of STRUCTURES.filter((s) => /intervertebral disk/i.test(s.sourceName))) {
      expect(noteFor(s.sourceName)?.summary, s.sourceName).toMatch(/^Fibrocartilage joint/);
    }
  });

  it('labels every group used by the model and by the modes', () => {
    for (const s of STRUCTURES) expect(GROUPS[s.group], s.group).toBeDefined();
    const tissueKeys = new Set(TISSUES.map((t) => t.key));
    // Cariology's groups are its authored lesion parts (checked in its own tests below); Genetics has one group.
    for (const m of MODES.filter((x) => x.id !== 'cariology')) {
      for (const g of [...m.defaultVisible, ...(m.context ?? [])]) {
        const known = m.id === 'genetics' ? g === MODEL_GROUP : m.source === 'blender' ? tissueKeys.has(g) : g in GROUPS;
        expect(known, `${m.id}: ${g}`).toBe(true);
      }
    }
  });
});

describe('mode models', () => {
  const glbNodeNames = (file: string) => {
    const buf = readFileSync(resolve(__dirname, '../../public/models', file));
    const len = buf.readUInt32LE(12);
    const json = JSON.parse(buf.subarray(20, 20 + len).toString('utf8'));
    return new Set<string>(json.nodes.map((n: { name: string }) => n.name));
  };

  it.each(MODES.map((m) => [m.id, m] as const))('%s model contains everything its content expects', (_, m) => {
    const names = glbNodeNames(m.model.replace('/models/', ''));
    const expected = m.id === 'genetics' ? MODEL_PARTS : m.source === 'blender'
      ? TISSUES.map((t) => t.key)
      : STRUCTURES.filter((s) => s.models.includes(m.id)).flatMap((s) => s.meshIds);
    expect(expected.length).toBeGreaterThan(0);
    expect(expected.filter((n) => !names.has(n))).toEqual([]);
  });

  it('keeps the oral anatomy model to the skull, dentition and oral cavity', () => {
    const groups = new Set(STRUCTURES.filter((s) => s.models.includes('dental')).map((s) => s.group));
    expect([...groups].sort()).toEqual(['gingiva', 'glands', 'lips', 'mandible', 'maxilla', 'neck-bones', 'palate-pharynx', 'skull', 'suprahyoid', 'teeth', 'tongue']);
  });

  it('bakes open-bite stretch weights into the soft parts and the hyoid, and nothing else', () => {
    const buf = readFileSync(resolve(__dirname, '../../public/models/dental.glb'));
    const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'));
    const withBite = new Set<string>(json.nodes
      .filter((n: { mesh?: number }) => n.mesh !== undefined && '_BITE' in json.meshes[n.mesh].primitives[0].attributes)
      .map((n: { name: string }) => n.name));
    const dental = STRUCTURES.filter((s) => s.models.includes('dental'));
    const follows = (s: (typeof dental)[number]) => ['tongue', 'glands', 'suprahyoid', 'palate-pharynx', 'lips'].includes(s.group) || s.key === 'hyoid-bone';
    expect(dental.filter((s) => follows(s) && !s.meshIds.every((id) => withBite.has(id))).map((s) => s.sourceName)).toEqual([]);
    expect(dental.filter((s) => !follows(s) && s.meshIds.some((id) => withBite.has(id))).map((s) => s.sourceName)).toEqual([]);
  });

  it('uses the Blender upper and lower lips in place of the BodyParts3D lip', () => {
    const lips = STRUCTURES.filter((s) => s.models.includes('dental') && s.group === 'lips').map((s) => s.key);
    expect(lips.sort()).toEqual(['lower-lip', 'upper-lip']);
    expect(structureByKey('lip')?.models).toEqual(['general']);
  });
});

describe('physiology functions', () => {
  const buf = readFileSync(resolve(__dirname, '../../public/models/physiology.glb'));
  const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'));
  const withFlow = new Set<string>(json.nodes
    .filter((n: { mesh?: number }) => n.mesh !== undefined && '_FLOW' in json.meshes[n.mesh].primitives[0].attributes)
    .map((n: { name: string }) => n.name));
  const phys = STRUCTURES.filter((s) => s.models.includes('physiology'));
  const fn = (s: (typeof phys)[number]) => flowFunction(s.group, baseName(s.sourceName));

  it('bakes flow into every vessel and nerve, and only into structures a function animates', () => {
    const missing = phys.filter((s) => ['blood', 'nerves'].includes(fn(s) ?? '') && s.group !== 'digestive' && !s.meshIds.every((id) => withFlow.has(id)));
    expect(missing.map((s) => s.sourceName)).toEqual([]);
    const stray = phys.filter((s) => s.meshIds.some((id) => withFlow.has(id)) && !fn(s));
    expect(stray.map((s) => s.sourceName)).toEqual([]);
    expect(withFlow.size).toBeGreaterThan(1200);
  });

  it('shows the groups of every function layer in the model', () => {
    for (const f of FUNCTION_LAYERS) for (const g of f.groups) expect(phys.some((s) => s.group === g), `${f.id}: ${g}`).toBe(true);
  });

  it('contains only the function groups and the skeleton', () => {
    const want = new Set([...FUNCTION_LAYERS.flatMap((f) => f.groups), ...FUNCTION_CONTEXT]);
    expect([...new Set(phys.map((s) => s.group))].filter((g) => !want.has(g))).toEqual([]);
    expect([...want].filter((g) => !phys.some((s) => s.group === g))).toEqual([]);
  });

  it('colours the pulmonary circulation the other way round', () => {
    expect(bloodColour('body-arteries', 'pulmonary trunk')).toBe(DEOXYGENATED);
    expect(bloodColour('body-arteries', 'apical segmental artery')).toBe(DEOXYGENATED);
    expect(bloodColour('body-arteries', 'anterior superior segmental hepatic artery')).toBe(OXYGENATED);
    expect(bloodColour('body-arteries', 'ascending aorta')).toBe(OXYGENATED);
    expect(bloodColour('body-veins', 'superior pulmonary vein')).toBe(OXYGENATED);
    expect(bloodColour('body-veins', 'hepatic portal vein')).toBe(DEOXYGENATED);
    expect(bloodColour('heart', 'wall of ventricle')).toBeNull();
  });

  it('maps the main brain regions to a function', () => {
    for (const n of ['precentral gyrus', 'postcentral gyrus', 'occipital lobe', 'cerebellum', 'hippocampus', 'medulla oblongata', 'putamen']) {
      expect(brainArea(n), n).toBeDefined();
    }
    // Language areas only on the (usually dominant) left.
    expect(brainArea('inferior frontal gyrus', 'Left inferior frontal gyrus')?.label).toBe('Language');
    expect(brainArea('inferior frontal gyrus', 'Right inferior frontal gyrus')).toBeUndefined();
  });
});

describe('carving tooth', () => {
  it('has a name and note for every landmark, numbered 1…n', () => {
    expect(LANDMARKS.filter((l) => !landmarkHasNote(l.id)).map((l) => l.id)).toEqual([]);
    expect(LANDMARKS.map((l) => l.n)).toEqual(LANDMARKS.map((_, i) => i + 1));
  });

  it('is merged into the oral anatomy model', () => {
    const buf = readFileSync(resolve(__dirname, '../../public/models/dental.glb'));
    const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'));
    const names = json.nodes.map((n: { name: string }) => n.name);
    expect(names).toContain('carving-crown');
    expect(names).toContain('carving-root');
  });

  it('matches Wheeler: lingual cusps higher than buccal, roots about 14 mm, contacts in the right thirds', () => {
    const y = (id: string) => LANDMARKS.find((l) => l.id === id)!.position[1];
    expect(y('mesiolingual-cusp')).toBeGreaterThan(y('mesiobuccal-cusp'));
    expect(y('distolingual-cusp')).toBeGreaterThan(y('distobuccal-cusp'));
    expect(y('distal-cusp')).toBeLessThan(y('distobuccal-cusp'));
    expect(-y('mesial-apex')).toBeGreaterThan(13);
    expect(-y('mesial-apex')).toBeLessThan(15.5);
    expect(y('mesial-contact-area')).toBeGreaterThan(y('distal-contact-area'));
    // Built as a left tooth: mesial is −x, buccal +z.
    expect(LANDMARKS.find((l) => l.id === 'mesial-marginal-ridge')!.position[0]).toBeLessThan(0);
    expect(LANDMARKS.find((l) => l.id === 'buccal-pit')!.position[2]).toBeGreaterThan(0);
  });
});

describe('cariology', () => {
  const buf = readFileSync(resolve(__dirname, '../../public/models/cariology.glb'));
  const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'));
  const nodes = new Set<string>(json.nodes.map((n: { name: string }) => n.name));

  it('has a model stage, with named zones, for every lesion stage in the content', () => {
    for (const L of LESION_TYPES) {
      const model = LESION_MODEL[L.id];
      expect(model.stages.length, L.id).toBe(L.stages.length);
      for (const z of model.staticParts) expect(nodes.has(`${staticGroup(L.id)}-${z}`), z).toBe(true);
      for (const z of PERIO_ZONES) expect(nodes.has(`${perioGroup(L.id)}-${z}`), `${L.id} ${z}`).toBe(true);
      model.stages.forEach((st, i) => {
        for (const z of st.parts) {
          expect(ZONES[z], z).toBeDefined();
          expect(nodes.has(`${stageGroup(L.id, i)}-${z}`), `${L.id} ${i} ${z}`).toBe(true);
        }
        for (const pin of st.pins) expect(st.parts, `${L.id} ${i} pin`).toContain(pin.region);
      });
    }
  });

  it('opens every lesion sound, then adds lesion zones, then cavitates', () => {
    for (const L of LESION_TYPES) {
      const stages = LESION_MODEL[L.id].stages;
      expect(stages[0].parts.filter((z) => !['enamel', 'dentin', 'cementum', 'pulp'].includes(z)), L.id).toEqual([]);
      expect(stages[stages.length - 1].parts, L.id).toContain('infected-dentin');
      // A cavitated enamel lesion is still lined by every enamel zone. Its surface zone breaks down only
      // at the cavity edge (removed within 0.3 mm of it in build_cariology.py), so a ring of it remains.
      if (L.id !== 'root') for (const z of ['enamel-surface-zone', 'enamel-lesion-body', 'enamel-dark-zone', 'enamel-translucent-zone']) expect(stages[stages.length - 1].parts, `${L.id} ${z}`).toContain(z);
    }
  });

  it('gives every tissue and zone a note, a natural colour and a study colour', () => {
    for (const [k, z] of Object.entries(ZONES)) {
      expect(z.note.length, k).toBeGreaterThan(40);
      expect(z.real, k).toMatch(/^#[0-9a-f]{6}$/);
      expect(z.colour, k).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('pairs ICDAS codes with ICCMS stages', () => {
    const iccms = { 'ICDAS 0': 'Sound', 'ICDAS 1–2': 'Initial', 'ICDAS 3': 'Moderate', 'ICDAS 4': 'Moderate', 'ICDAS 5': 'Extensive', 'ICDAS 6': 'Extensive' } as Record<string, string>;
    for (const L of LESION_TYPES.filter((l) => l.id !== 'root')) for (const st of L.stages) expect(st.iccms, `${L.id} ${st.icdas}`).toBe(iccms[st.icdas]);
  });

  it('paints every caries site on the arch, with a pin', () => {
    for (const s of SITES) {
      expect(nodes.has(`site-${s.id}`), s.id).toBe(true);
      expect(SITE_PINS.some((p) => p.id === s.id), s.id).toBe(true);
    }
    expect(nodes.has('site-restoration')).toBe(true);
  });

  it('has the process block parts', () => {
    for (const k of Object.keys(PROCESS_PARTS)) expect(nodes.has(k), k).toBe(true);
  });

  it('follows the Stephan curve: a drop below 5.5 within minutes, recovery within about 40', () => {
    expect(plaquePH(0, 'single')).toBeCloseTo(6.8, 1);
    const min = Math.min(...Array.from({ length: 30 }, (_, t) => plaquePH(t, 'single')));
    expect(min).toBeLessThan(5.5);
    expect(min).toBeGreaterThanOrEqual(4.5);
    expect(plaquePH(40, 'single')).toBeGreaterThan(6.5);
    // Frequent sugar keeps the pH down and costs more mineral than one intake.
    expect(mineralAt(120, 'frequent')).toBeLessThan(mineralAt(120, 'single'));
    expect(mineralAt(120, 'single')).toBeGreaterThan(0.97);
  });
});

describe('genetics', () => {
  it('gives every part a name, a colour and a note, and every step only known parts', () => {
    for (const [k, p] of Object.entries(PARTS)) {
      expect(p.note.length, k).toBeGreaterThan(30);
      expect(p.color, k).toMatch(/^#[0-9a-f]{6}$/);
    }
    for (const s of [...DNA_LEVELS, ...PROCESS_STEPS]) for (const k of s.parts) expect(PARTS[k], `${s.title} ${k}`).toBeDefined();
    expect(DNA_LEVELS).toHaveLength(5);
  });

  it('uses the real DSPP stretch: start codon, whole codons, an intron from GT to AG', () => {
    expect(DSPP.exon2Coding.startsWith('ATG')).toBe(true);
    expect(DSPP.exon2Coding.length % 3).toBe(0);
    expect(DSPP.intronStart.startsWith('GT')).toBe(true);
    expect(DSPP.intronEnd.endsWith('AG')).toBe(true);
    expect(DSPP.ladder).toMatch(/^[ATGC]+$/);
  });

  it('pairs A with T and G with C, and copies DNA into RNA with U', () => {
    expect(partner('ATGC')).toBe('TACG');
    expect(partner(partner(DSPP.ladder))).toBe(DSPP.ladder);
    expect(toRna('ATGT')).toBe('AUGU');
    expect(translate('AUGUAAUAGUGA')).toBe('M***');
  });

  it('translates the spliced RNA into the start of the real DSPP protein (NP_055023)', () => {
    expect(DSPP_PROTEIN).toBe(DSPP.proteinStart);
    expect(DSPP_PROTEIN.startsWith('M')).toBe(true);
    expect(DSPP_PROTEIN).not.toContain('*');
  });

  it('describes every tooth tissue and gene', () => {
    for (const t of ['enamel', 'dentin', 'pulp'] as const) expect(PARTS[toothKey('healthy', t)], t).toBeDefined();
    for (const c of CONDITIONS) {
      expect(PARTS[geneKey(c.gene)], c.gene).toBeDefined();
      for (const t of ['enamel', 'dentin'] as const) expect(PARTS[toothKey(c.id, t)], `${c.id} ${t}`).toBeDefined();
      expect(PARTS[toothKey(c.id, 'pulp')], c.id).toBeDefined();
    }
  });

  it('draws family trees that fit their pattern', () => {
    const ad = PEDIGREES.AD.people;
    for (const p of ad) if (p.status === 'a' && p.parents) expect(p.parents.some((i) => ad[i].status === 'a')).toBe(true);
    expect(ad.some((p) => p.status === 'c')).toBe(false);
    expect(ad.filter((p) => p.status === 'a').map((p) => p.generation)).toEqual(expect.arrayContaining([1, 2, 3]));
    const ar = PEDIGREES.AR.people;
    for (const p of ar) {
      if (!p.parents) continue;
      const [m, f] = p.parents.map((i) => ar[i].status);
      // An affected child needs a changed copy from both parents; a child of an affected parent carries at least one.
      if (p.status === 'a') expect(m !== '' && f !== '').toBe(true);
      if (m === 'a' || f === 'a') expect(p.status).not.toBe('');
      if (m === '' && f === '') expect(p.status).toBe('');
    }
    expect(ar.some((p) => p.status === 'a' && p.parents?.every((i) => ar[i].status === 'c'))).toBe(true);
  });

  it('builds the double helix from the real sequence, and every level of the DNA path', () => {
    const buf = readFileSync(resolve(__dirname, '../../public/models/genetics.glb'));
    const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'));
    for (const k of MODEL_PARTS) expect(PARTS[k], k).toBeDefined();
    // Each base pair is two half rungs, one per letter (18 vertices each): an A–T pair puts one half in
    // each of the A and T parts, so each holds one half per A–T pair of the sequence; likewise G and C.
    const vertices = (k: string) => json.accessors[json.meshes.find((m: { name: string }) => m.name === k).primitives[0].attributes.POSITION].count;
    const count = (bases: string) => [...DSPP.ladder].filter((b) => bases.includes(b)).length;
    for (const k of ['dna-base-a', 'dna-base-t']) expect(vertices(k), k).toBe(count('AT') * 18);
    for (const k of ['dna-base-g', 'dna-base-c']) expect(vertices(k), k).toBe(count('GC') * 18);
    // Every stop frames ground to the right of the last, and its level's parts are in the model.
    DNA_LEVELS.forEach((s, i) => { if (i) expect(s.view.center[0]).toBeGreaterThan(DNA_LEVELS[i - 1].view.center[0]); });
    for (const l of DNA_LEVELS) for (const k of l.parts.filter((p) => !p.endsWith('-groove'))) expect(MODEL_PARTS, k).toContain(k);
  });

  it('places every tooth part and gene stop in the model, each gene stop with its real first coding letters', () => {
    const buf = readFileSync(resolve(__dirname, '../../public/models/genetics.glb'));
    const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'));
    const keys = new Set<string>(json.nodes.map((n: { name: string }) => nodeKey(n.name)));
    for (const k of TEETH_PARTS) expect(keys.has(k), k).toBe(true);
    expect(TEETH_STEPS).toHaveLength(CONDITIONS.length);
    // The fetched letters translate into each gene's real first amino acids (RefSeq, MANE Select).
    for (const [gene, g] of Object.entries(DSPP.teethGenes)) expect(translate(toRna(g.codingStart)), gene).toBe(g.proteinStart);
    for (const s of TEETH_STEPS) expect(s.pattern).toMatch(/^A[DR]$/);
  });

  it('has every processes part in the model, and a shape key for every motion track', () => {
    const buf = readFileSync(resolve(__dirname, '../../public/models/genetics.glb'));
    const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'));
    const keys = new Set<string>(json.nodes.map((n: { name: string }) => nodeKey(n.name)));
    for (const k of keys) expect(PARTS[k], k).toBeDefined();
    for (const k of GENETIC_PROCESS_PARTS) expect(keys.has(k), k).toBe(true);
    const targets = new Set<string>(json.meshes.flatMap((m: { extras?: { targetNames?: string[] } }) => m.extras?.targetNames ?? []));
    for (const name of Object.keys(PROCESS_MOTION)) expect(targets.has(name), name).toBe(true);
    for (const t of targets) expect(PROCESS_MOTION[t], t).toBeDefined();
    // Tracks run forward in time within the path's stops.
    for (const [name, track] of Object.entries(PROCESS_MOTION)) {
      track.forEach(([t], i) => { if (i) expect(t, name).toBeGreaterThan(track[i - 1][0]); });
      expect(track[track.length - 1][0], name).toBeLessThanOrEqual(PROCESS_STEPS.length - 1);
    }
  });
});

describe('routes', () => {
  it('parses mode and selection', () => {
    expect(parseRoute('#/dental/left-maxilla')).toEqual({ mode: 'dental', selected: 'left-maxilla' });
    expect(parseRoute('#/histology')).toEqual({ mode: 'histology', selected: undefined });
    expect(parseRoute('')).toEqual({ mode: 'general' });
    expect(parseRoute('#/cariology')).toEqual({ mode: 'cariology', selected: undefined });
    expect(parseRoute('#/nonsense')).toEqual({ mode: 'general' });
  });
});
