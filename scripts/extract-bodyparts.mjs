// Build the BodyParts3D-based mode models and src/content/structures.generated.json from the
// BodyParts3D 4.0 geometry packaged by https://github.com/ashemag/human-atlas (CC BY 4.0).
//
//   git clone --depth 1 https://github.com/ashemag/human-atlas ../human-atlas
//   node scripts/extract-bodyparts.mjs ../human-atlas
//
// Run scripts/build-carving-tooth.mjs and scripts/build-cariology.mjs first: the Oral anatomy model
// includes the carving molar, the Cariology model the lesion molar and the process block.
// Writes public/models/general.glb (every BodyParts3D mesh), public/models/physiology.glb (only what the
// Physiology functions show, plus the skeleton for orientation, with per-vertex flow distances),
// public/models/dental.glb (dentition and jaws) and public/models/cariology.glb (the arches with caries
// sites painted on their teeth, plus the authored parts), and src/content/cariology-sites.generated.json.
// The histology model is authored in Blender instead: scripts/blender/build_histology.py.
import { Document, NodeIO } from '@gltf-transform/core';
import { KHRDracoMeshCompression } from '@gltf-transform/extensions';
import { weld } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { chainFlow, networkFlow, radialFlow } from './lib/flow.mjs';
import { join } from 'node:path';

const src = process.argv[2];
if (!src) throw new Error('Usage: node scripts/extract-bodyparts.mjs <path to human-atlas checkout>');
const atlas = JSON.parse(readFileSync(join(src, 'public/models/atlas.json'), 'utf8'));

/**
 * First matching group wins. Order matters: teeth before bones, specific before general.
 * `hn` groups are limited to the head and neck (source y > 1.3 m), as the original General model was.
 * Every mesh keeps the source's full detail: accuracy comes before file size.
 */
const GROUPS = [
  ['teeth', /secondary .*tooth$/i, { hn: true }],
  ['gingiva', /^gingiva of/i, { hn: true }],
  ['mandible', /^mandible$/i, { hn: true }],
  ['maxilla', /(^|\s)maxilla$|palatine bone/i, { hn: true }],
  ['skull', /(zygomatic|temporal|sphenoid|frontal|parietal|occipital) bone$|^ethmoid$|^vomer$|nasal bone$|lacrimal bone$|inferior nasal concha$/i, { hn: true }],
  ['neck-bones', /^(hyoid bone|atlas|axis)$/i, { hn: true }],
  ['suprahyoid', /(digastric|mylohyoid|geniohyoid|stylohyoid)$|^intermediate tendon$/i, { hn: true }],
  ['infrahyoid', /(omohyoid|sternohyoid|sternothyroid|thyrohyoid|platysma|sternocleidomastoid)$|^scalenus |longus (colli|capitis)|^rectus capitis (anterior|lateralis)$/i, { hn: true }],
  ['tongue', /^tongue$|genioglossus|hyoglossus/i, { hn: true }],
  ['palate-pharynx', /veli palatini|uvular muscle|pharyngeal constrictor|palatopharyngeus|salpingopharyngeus|stylopharyngeus|pterygomandibular raphe|stylohyoid ligament|pharyngeal raphe/i, { hn: true }],
  ['glands', /(sublingual|submandibular) gland$/i, { hn: true }],
  ['lips', /^lip$/i, { hn: true }],
  ['larynx', /^(thyroid|cricoid|arytenoid|corniculate|cuneiform) cartilage$|^epiglottis$|arytenoid$|crico-?arytenoid|aryepiglotticus|cricothyroid$|^vocalis$|^vocal ligament$|^conus elasticus$|thyrohyoid (membrane|ligament)|thyro-epiglottic|hyo-epiglottic/i, { hn: true }],
  ['eye-muscles', /^(superior|inferior|medial|lateral) rectus$|^(superior|inferior) oblique$|levator palpebrae|^check ligament|^trochlea of superior oblique/i, { hn: true }],
  ['nerves', /(ophthalmic|frontal|supra-orbital|supratrochlear|lacrimal|nasociliary|infratrochlear|trochlear|optic|(anterior|posterior) ethmoidal|(long|short) ciliary) nerve$|oculomotor nerve$|^ciliary ganglion$|^optic (chiasm|tract)$|nasociliary nerve with/i, { hn: true }],
  ['arteries', /^(common|internal) carotid artery$|^(vertebral|basilar|ophthalmic|subclavian|inferior thyroid|transverse cervical|superficial cervical|suprascapular|deep cervical|superior intercostal|brachiocephalic) artery$|^(thyrocervical|costocervical) trunk$|^arch of aorta$|^anterior (cerebral|communicating|choroidal) artery$|^posterior communicating artery$|(pre|post)communicating part of posterior cerebral artery$|^sphenoid part of middle cerebral artery$|^(superior cerebellar|anterior inferior cerebellar|posterior inferior cerebellar|anterior spinal) artery$/i, { hn: true }],
  ['veins', /^(internal jugular|subclavian|brachiocephalic) vein$|^superior vena cava$/i, { hn: false }],
  ['spine', /(cervical|thoracic|lumbar) vertebra$|^sacrum$|^intervertebral disk/i, {}],
  ['thorax-bones', /\brib$|costal cartilage$|^manubrium$|^body of sternum$|^xiphoid process$/i, {}],
  ['upper-limb-bones', /^(clavicle|scapula|humerus|radius|ulna|scaphoid|lunate|triquetral|pisiform|trapezium|trapezoid|capitate|hamate)$|metacarpal bone$|phalanx of (thumb|index finger|middle finger|ring finger|little finger)$/i, {}],
  ['lower-limb-bones', /^(hip bone|femur|patella|tibia|fibula|talus|calcaneus|cuboid bone)$|navicular bone of foot|cuneiform bone$|metatarsal bone$|phalanx of (big|second|third|fourth|little) toe$|sesamoid bone of foot/i, {}],
  ['back-muscles', /trapezius$|^rhomboid (major|minor)$|^levator scapulae$|^serratus posterior|^iliocostalis|^longissimus|^spinalis|^semispinalis|rotator$|^splenius|interspinal|intertransversari|levatores costarum|^rectus capitis posterior|^obliquus capitis/i, {}],
  ['trunk-muscles', /pectoralis (major|minor)$|^subclavius$|^serratus anterior$|intercostal muscle$|^transversus thoracis$|^diaphragm$|^external oblique$|^(coccygeus|iliococcygeus|pubococcygeus|puborectalis)$/i, {}],
  ['upper-limb-muscles', /deltoid$|^(supraspinatus|infraspinatus muscle|subscapularis|teres major|teres minor|coracobrachialis|brachialis|anconeus|brachioradialis|supinator|pronator quadratus|palmaris longus)$|biceps brachii$|triceps brachii$|pronator teres$|flexor carpi|extensor carpi|digitorum (superficialis|profundus)$|^extensor digitorum$|^extensor digiti minimi$|^extensor indicis$|pollicis|of hand$|lumbricals of hand|interossei of hand/i, {}],
  ['lower-limb-muscles', /^gluteus|^(iliacus|psoas major|piriformis|gemellus superior|gemellus inferior|quadratus femoris|obturator internus|obturator externus|pectineus|gracilis|sartorius|rectus femoris|vastus lateralis|vastus medialis|vastus intermedius|adductor longus|adductor brevis|adductor magnus|adductor minimus|semitendinosus|semimembranosus|popliteus|plantaris|soleus|tibialis anterior|tibialis posterior|iliotibial tract|flexor accessorius|flexor digitorum brevis|flexor digitorum longus|flexor hallucis longus|extensor digitorum longus|extensor hallucis longus|extensor hallucis brevis|abductor hallucis)$|biceps femoris$|gastrocnemius$|^fibularis|hallucis brevis$|adductor hallucis$|of foot$/i, {}],
  // Stragglers whose names the patterns above don't cover.
  ['eye-muscles', /^common tendinous ring$/i, {}],
  ['trunk-muscles', /^external anal sphincter$|^superficial perineal muscle$|^tendinous arch of levator ani$|^linea alba$/i, {}],
  ['lower-limb-muscles', /^tensor fasciae latae$|^calcaneal tendon$/i, {}],
  // Whole-body systems.
  ['heart', /papillary muscle|valve$|leaflet of (mitral|tricuspid) valve|^(cavity|wall) of (atrium|ventricle)$/i, {}],
  ['brain', /^(third|fourth|lateral) ventricle$|^interventricular foramen$|^cerebral aqueduct$|^central canal of spinal cord$|choroid plexus|^tentorium cerebelli$/i, {}],
  ['senses', /eyeball|^(choroid|cornea|corona ciliaris|iris|lens|sclera|vitreous body|optic part of retina|external ear)$|suspensory ligament of lens|lacrimal (canaliculus|gland|lake|sac)$|^nasolacrimal duct$|tarsal plate/i, {}],
  ['airways', /^trachea$|bronch(us|ial tree)|nasal cartilage$|^major alar cartilage$/i, {}],
  ['cerebral-arteries', /cerebral|cerebellar|callosomarginal|pericallosal|choroidal|frontobasal|(lateral|medial) occipital artery|parietal artery$|^(anterior|polar) temporal artery$|prefrontal artery|sulcus$|splenial artery|thalamo(geniculate|perforating)|pontine artery|vermian|hypothalamic branch|angular gyrus|precuneal|paracentral|^insular part/i, {}],
  ['digestive', /^hepatovenous segment/i, {}],
  ['ligaments', /interosseous membrane|^long plantar ligament$|^flexor retinaculum of wrist$/i, {}],

];
/** Side words can sit anywhere ("Long head of left biceps brachii"); groups match without them. */
const unsided = (name) => name.replace(/\b(left|right) /gi, '');
// Word-bounded so "hepatovenous segment" (liver tissue) isn't treated as a vessel.
const VESSEL = /arter|\bvein|\bvenous|aorta|vena cava|(costo|thyro)cervical trunk/i;
const VESSEL_GROUPS = new Set(['arteries', 'veins', 'cerebral-arteries']);
/** Anything no pattern claims still goes in, grouped by its source system: the General model has every mesh. */
const BY_SYSTEM = {
  arterial: 'body-arteries', venous: 'body-veins', cardiac: 'heart', digestive: 'digestive', respiratory: 'airways',
  urinary: 'urogenital', reproductive: 'urogenital', endocrine: 'endocrine', lymphatic: 'endocrine',
  integumentary: 'skin', sensory: 'senses', nervous: 'brain', connective: 'ligaments',
};
const groupOf = (p) => GROUPS.find(([g, re, o]) => re.test(unsided(p.name)) && (!o.hn || p.bounds[0][1] > 1.3)
  // Vessel groups take only vessels, and other groups never do: limb vessels share "of hand"/"of foot"
  // names with small muscles, and brain-artery patterns ("cerebral", "angular gyrus") match brain tissue.
  && (VESSEL_GROUPS.has(g) === VESSEL.test(p.name)))?.[0] ?? BY_SYSTEM[p.system];

const chunks = atlas.chunks.map((c) => {
  const raw = readFileSync(join(src, 'public', c.gzip));
  return gunzipSync(raw).buffer;
});

const picked = atlas.parts
  .map((p) => ({ ...p, group: groupOf(p) }))
  .filter((p) => p.group);

const PHYSIOLOGY_GROUPS = [
  'heart', 'arteries', 'cerebral-arteries', 'body-arteries', 'veins', 'body-veins', 'nerves', 'brain', 'airways', 'larynx', 'digestive', 'urogenital',
  'suprahyoid', 'infrahyoid', 'tongue', 'palate-pharynx', 'eye-muscles', 'back-muscles', 'trunk-muscles', 'upper-limb-muscles', 'lower-limb-muscles',
  'skull', 'mandible', 'maxilla', 'teeth', 'neck-bones', 'spine', 'thorax-bones', 'upper-limb-bones', 'lower-limb-bones',
];

/** Which groups each mode model contains. */
const MODELS = {
  general: (g) => true,
  // Keep in step with FUNCTION_LAYERS groups + FUNCTION_CONTEXT in src/content/function.ts (tested).
  physiology: (g) => PHYSIOLOGY_GROUPS.includes(g),
  // Oral anatomy: the dentition, the whole skull and the oral cavity (the carving tooth is merged in below).
  dental: (g) => ['teeth', 'gingiva', 'mandible', 'maxilla', 'skull', 'neck-bones', 'tongue', 'palate-pharynx', 'suprahyoid', 'glands', 'lips'].includes(g),
  // Cariology: the arches for the caries sites (the lesion molar and process block are merged in below).
  cariology: (g) => ['teeth', 'gingiva', 'mandible', 'maxilla'].includes(g),
};
const SCALE = 100; // metres → centimetres so camera numbers stay readable


const io = new NodeIO().registerExtensions([KHRDracoMeshCompression]).registerDependencies({
  'draco3d.encoder': await draco3d.createEncoderModule(),
  'draco3d.decoder': await draco3d.createDecoderModule(),
});

mkdirSync('public/models', { recursive: true });
const keyOf = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const records = new Map();

for (const [model, includes] of Object.entries(MODELS)) {
  const parts = picked.filter((p) => includes(p.group));
  // Centre each model on its own bounding box.
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p.bounds[0][k]); max[k] = Math.max(max[k], p.bounds[1][k]); }
  const centre = min.map((v, k) => (v + max[k]) / 2);

  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene(model);
  const geometry = parts.map((p) => {
    const chunk = chunks[p.chunk];
    const pos = new Float32Array(chunk, p.positions, p.vertexCount * 3).slice();
    for (let i = 0; i < pos.length; i++) pos[i] = (pos[i] - centre[i % 3]) * SCALE;
    const nrm = Float32Array.from(new Int16Array(chunk, p.normals, p.vertexCount * 3), (v) => Math.max(v / 32767, -1));
    const idx = new Uint32Array(chunk, p.indices, p.indexCount).slice();
    return { id: p.id, name: unsided(p.name).toLowerCase(), sided: p.name.toLowerCase(), group: p.group, system: p.system, pos, nrm, idx };
  });
  const flows = model === 'physiology' ? computeFlows(geometry) : new Map();
  for (const [i, p] of parts.entries()) {
    const { pos, nrm, idx } = geometry[i];
    const prim = doc.createPrimitive()
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(pos).setBuffer(buffer))
      .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(nrm).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(idx).setBuffer(buffer));
    // Signed distance along the part's network, read by the viewer as the `_flow` attribute.
    if (flows.has(p.id)) prim.setAttribute('_FLOW', doc.createAccessor().setType('SCALAR').setArray(flows.get(p.id)).setBuffer(buffer));
    scene.addChild(doc.createNode(p.id).setMesh(doc.createMesh(p.id).addPrimitive(prim)));

    // Some structures are split across several source meshes; they share one key.
    const r = records.get(p.id) ?? { id: p.id, key: keyOf(p.name), name: p.name, group: p.group, fma: p.conceptId, models: [] };
    r.models.push(model);
    records.set(p.id, r);
  }
  if (model === 'dental') await addCarvingTooth(doc, buffer, scene, (max[0] - centre[0]) * SCALE);
  if (model === 'cariology') {
    addCariesSites(doc, buffer, scene, geometry.filter((g) => g.group === 'teeth'));
    await addCariologyParts(doc, buffer, scene, (max[0] - centre[0]) * SCALE);
  }
  await doc.transform(weld());
  doc.createExtension(KHRDracoMeshCompression).setRequired(true).setEncoderOptions({ method: KHRDracoMeshCompression.EncoderMethod.EDGEBREAKER });
  const glb = await io.writeBinary(doc);
  writeFileSync(`public/models/${model}.glb`, glb);
  const tris = doc.getRoot().listMeshes().reduce((t, m) => t + m.listPrimitives()[0].getIndices().getCount() / 3, 0);
  console.log(`${model}.glb: ${parts.length} meshes, ${tris} triangles, ${(glb.byteLength / 1024 / 1024).toFixed(2)} MB`);
}

/**
 * Merge the carving tooth (models-src/carving-molar.glb, from scripts/build-carving-tooth.mjs, in mm)
 * into the Oral anatomy model: scaled to the model's centimetres and placed beside the skull, so one
 * GLB still serves the whole subject. The Carving tooth view shows only these two nodes.
 */
async function addCarvingTooth(doc, buffer, scene, skullRightEdge) {
  const tooth = await io.read('models-src/carving-molar.glb');
  for (const node of tooth.getRoot().listNodes()) {
    const src = node.getMesh().listPrimitives()[0];
    const copy = (a) => doc.createAccessor().setType(a.getType()).setArray(a.getArray().slice()).setBuffer(buffer);
    const prim = doc.createPrimitive()
      .setAttribute('POSITION', copy(src.getAttribute('POSITION')))
      .setAttribute('NORMAL', copy(src.getAttribute('NORMAL')))
      .setIndices(copy(src.getIndices()));
    scene.addChild(doc.createNode(node.getName()).setMesh(doc.createMesh(node.getName()).addPrimitive(prim))
      .setScale([0.1, 0.1, 0.1]).setTranslation([skullRightEdge + 6, 0, 0]));
  }
  console.log('  merged carving tooth into dental.glb');
}

/**
 * Caries sites painted on the real teeth: for each site, the triangles of one tooth that lie in the
 * site's region (from the tooth's own frame: occlusal, mesial and buccal directions and its crown
 * length), copied as a thin overlay just off the surface. Writes each site's pin.
 */
function addCariesSites(doc, buffer, scene, teeth) {
  const POS = [[/central .*incisor/, 1], [/lateral .*incisor/, 2], [/canine/, 3], [/first .*premolar/, 4], [/second .*premolar/, 5], [/first .*molar/, 6], [/second .*molar/, 7]];
  const all = teeth.map((g) => ({ g, arch: /upper/.test(g.sided) ? 'upper' : 'lower', side: /left/.test(g.sided) ? 'left' : 'right', pos: POS.find(([re]) => re.test(g.sided))?.[1] }));
  const find = (arch, side, pos) => all.find((t) => t.arch === arch && t.side === side && t.pos === pos);
  const centroid = (pos) => { const c = [0, 0, 0]; for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) c[k] += pos[i + k]; return c.map((v) => v / (pos.length / 3)); };
  const sub = (a, b) => a.map((v, i) => v - b[i]), dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const flat = (v) => { const l = Math.hypot(v[0], v[2]) || 1; return [v[0] / l, 0, v[2] / l]; };
  // Typical crown lengths (cm), from Wheeler.
  const CROWN = { upper: [0, 1.05, 0.9, 1.0, 0.85, 0.8, 0.75, 0.7], lower: [0, 0.9, 0.95, 1.1, 0.85, 0.8, 0.75, 0.7] };
  const frame = (t) => {
    const c = centroid(t.g.pos);
    const o = t.arch === 'lower' ? [0, 1, 0] : [0, -1, 0];
    const neighbour = t.pos === 1 ? find(t.arch, t.side === 'left' ? 'right' : 'left', 1) : find(t.arch, t.side, t.pos - 1);
    const m = flat(sub(centroid(neighbour.g.pos), c)); // mesial: towards the next tooth along the arch
    const archCentre = centroid(all.filter((a) => a.arch === t.arch).flatMap((a) => centroid(a.g.pos)));
    let b = [m[2], 0, -m[0]]; // buccal/labial: across the arch, away from its middle
    if (dot(b, sub(c, archCentre)) < 0) b = b.map((v) => -v);
    let tip = -Infinity, corner = null, cornerScore = -Infinity;
    for (let i = 0; i < t.g.pos.length; i += 3) {
      const v = [t.g.pos[i], t.g.pos[i + 1], t.g.pos[i + 2]];
      tip = Math.max(tip, dot(v, o));
      const score = dot(sub(v, c), m) + dot(v, o);
      if (score > cornerScore) { cornerScore = score; corner = v; }
    }
    return { c, o, m, b, tip, corner, crown: CROWN[t.arch][t.pos] };
  };
  // [site, tooth (arch, side, position), test on a triangle: q its centre, n its normal, f the tooth's frame,
  //  h depth below the cusp tip or incisal edge, r distance from the tooth's long axis]
  const SITES = [
    ['class-1', ['lower', 'right', 6], (q, n, f, h, r) => dot(n, f.o) > 0.3 && h > 0.05 && h < 0.3 && r < 0.3],
    ['class-2', ['upper', 'right', 4], (q, n, f, h) => dot(n, f.m) > 0.4 && h > f.crown * 0.3 && h < f.crown * 0.75 && Math.abs(dot(sub(q, f.c), f.b)) < 0.22],
    ['class-3', ['upper', 'left', 1], (q, n, f, h) => dot(n, f.m) > 0.3 && h > f.crown * 0.3 && h < f.crown * 0.7 && dot(sub(q, f.c), f.b) > -0.1],
    ['class-4', ['upper', 'right', 1], (q, n, f, h) => Math.hypot(...sub(q, f.corner)) < 0.25 && h < f.crown * 0.5],
    ['class-5', ['lower', 'right', 3], (q, n, f, h) => dot(n, f.b) > 0.45 && h > f.crown * 0.68 && h < f.crown * 0.97],
    ['class-6', ['upper', 'left', 3], (q, n, f, h) => h < 0.07],
    ['root', ['lower', 'left', 4], (q, n, f, h) => dot(n, f.b) > 0.35 && h > f.crown + 0.02 && h < f.crown + 0.25],
    ['secondary', ['upper', 'left', 6], (q, n, f, h, r) => dot(n, f.o) > 0.25 && h > 0.04 && r >= 0.2 && r < 0.27],
    ['restoration', ['upper', 'left', 6], (q, n, f, h, r) => dot(n, f.o) > 0.25 && h > 0.06 && r < 0.2],
  ];
  const OFFSET = 0.004; // 0.04 mm off the tooth surface
  const pins = [];
  for (const [id, [arch, side, pos], test] of SITES) {
    const t = find(arch, side, pos);
    const f = frame(t);
    const { pos: P, nrm: N, idx } = t.g;
    const map = new Map(), outP = [], outN = [], outI = [];
    for (let i = 0; i < idx.length; i += 3) {
      const tri = [idx[i], idx[i + 1], idx[i + 2]];
      const q = [0, 1, 2].map((k) => (P[tri[0] * 3 + k] + P[tri[1] * 3 + k] + P[tri[2] * 3 + k]) / 3);
      const n = [0, 1, 2].map((k) => N[tri[0] * 3 + k] + N[tri[1] * 3 + k] + N[tri[2] * 3 + k]);
      const nl = Math.hypot(...n) || 1;
      const h = f.tip - dot(q, f.o), r = Math.hypot(q[0] - f.c[0], q[2] - f.c[2]);
      if (!test(q, n.map((v) => v / nl), f, h, r)) continue;
      for (const v of tri) {
        if (!map.has(v)) { map.set(v, outP.length / 3); for (let k = 0; k < 3; k++) { outP.push(P[v * 3 + k] + N[v * 3 + k] * OFFSET); outN.push(N[v * 3 + k]); } }
        outI.push(map.get(v));
      }
    }
    if (!outI.length) throw new Error(`site ${id}: no triangles matched`);
    const key = `site-${id}`;
    const prim = doc.createPrimitive()
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(outP)).setBuffer(buffer))
      .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(outN)).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(outI)).setBuffer(buffer));
    scene.addChild(doc.createNode(key).setMesh(doc.createMesh(key).addPrimitive(prim)));
    console.log(`  site ${id}: ${outI.length / 3} triangles on ${t.g.sided}`);
    if (id === 'restoration') continue;
    // Pin on the patch vertex nearest its middle, facing out.
    const mid = centroid(outP);
    let best = 0, bestD = Infinity;
    for (let v = 0; v < outP.length; v += 3) { const d = Math.hypot(outP[v] - mid[0], outP[v + 1] - mid[1], outP[v + 2] - mid[2]); if (d < bestD) { bestD = d; best = v; } }
    const n = centroid(outN), nl = Math.hypot(...n) || 1;
    pins.push({ id, key, position: [outP[best], outP[best + 1], outP[best + 2]].map((v) => +v.toFixed(4)), normal: n.map((v) => +(v / nl).toFixed(3)) });
  }
  writeFileSync('src/content/cariology-sites.generated.json', JSON.stringify(pins, null, 1) + '\n');
}

/**
 * Merge the authored Cariology parts (models-src/cariology.glb, from scripts/build-cariology.mjs): the
 * lesion molar (mm) and the process block (µm), scaled to the model's centimetres and set beside the
 * arches. Each view shows only its own parts.
 */
async function addCariologyParts(doc, buffer, scene, archRightEdge) {
  const src = await io.read('models-src/cariology.glb');
  for (const node of src.getRoot().listNodes()) {
    const name = node.getName();
    const p = node.getMesh().listPrimitives()[0];
    const copy = (a) => doc.createAccessor().setType(a.getType()).setArray(a.getArray().slice()).setBuffer(buffer);
    // Every attribute, including the texture ones (_DIR, _DEPTH, _CUT) the viewer reads.
    const prim = doc.createPrimitive().setIndices(copy(p.getIndices()));
    for (const semantic of p.listSemantics()) prim.setAttribute(semantic, copy(p.getAttribute(semantic)));
    const lesion = name.startsWith('cl-');
    scene.addChild(doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim))
      .setScale(lesion ? [0.1, 0.1, 0.1] : [0.05, 0.05, 0.05]).setTranslation([archRightEdge + (lesion ? 4 : 10), 0, 0]));
  }
  console.log(`  merged ${src.getRoot().listNodes().length} cariology parts`);
}

function computeFlows(geometry) {
  const by = (re) => geometry.filter((g) => re.test(g.name));
  const centroid = (list) => {
    const c = [0, 0, 0]; let n = 0;
    for (const g of list) for (let i = 0; i < g.pos.length; i += 3) { c[0] += g.pos[i]; c[1] += g.pos[i + 1]; c[2] += g.pos[i + 2]; n++; }
    return c.map((v) => v / n);
  };
  const topY = new Map(geometry.map((g) => { let m = -Infinity; for (let i = 1; i < g.pos.length; i += 3) m = Math.max(m, g.pos[i]); return [g.id, m]; }));
  // Points of the heart chambers, to find where the great vessels leave or enter the heart.
  const near = (list, r) => {
    const pts = [];
    for (const g of list) for (let i = 0; i < g.pos.length; i += 9) pts.push([g.pos[i], g.pos[i + 1], g.pos[i + 2]]);
    return (x) => pts.some((q) => Math.abs(q[0] - x[0]) < r && Math.abs(q[1] - x[1]) < r && Math.abs(q[2] - x[2]) < r && Math.hypot(q[0] - x[0], q[1] - x[1], q[2] - x[2]) < r);
  };
  const nearVentricle = near(by(/^(cavity|wall) of ventricle$/), 1.0);
  const nearAtrium = near(by(/^(cavity|wall) of atrium$/), 1.0);

  const out = new Map();
  const report = (label, { flows, unreached }) => {
    for (const [id, f] of flows) out.set(id, f);
    console.log(`  flow ${label}: ${flows.size} meshes${unreached.length ? `, ${unreached.length} unreached: ${[...new Set(unreached)].join('; ')}` : ''}`);
  };

  // Blood leaves the ventricles through the aorta and pulmonary trunk ...
  report('arteries', networkFlow(geometry.filter((g) => g.system === 'arterial'), {
    isRoot: (p, x) => /^(ascending aorta|pulmonary trunk)$/.test(p.name) && nearVentricle(x),
  }));
  // ... and returns to the atria through the venae cavae, coronary sinus and pulmonary veins.
  // The hepatic portal system is its own network: it reaches the venae cavae only through the liver
  // sinusoids. Gut tributaries flow towards the portal trunk; its branches inside the liver flow away.
  const PORTAL_TRUNK = /^(hepatic portal vein|pre-hepatic portal vein|trunk of portal vein)$/;
  const INTRAHEPATIC = /^portal vein$|branch of portal vein$/;
  const TRIBUTARY = /^(splenic|superior mesenteric|inferior mesenteric|gastric|gastroepiploic|colic|middle colic|ileal|ileocolic|sigmoid|superior rectal|pancreaticoduodenal) vein$/;
  const portal = geometry.filter((g) => PORTAL_TRUNK.test(g.name) || INTRAHEPATIC.test(g.name) || TRIBUTARY.test(g.name));
  const portalFlow = networkFlow(portal, { isRoot: (p) => PORTAL_TRUNK.test(p.name) });
  for (const p of portal) if (TRIBUTARY.test(p.name)) portalFlow.flows.set(p.id, portalFlow.flows.get(p.id).map((d) => -d));
  report('portal', portalFlow);
  // (The liver's hepatovenous segments are filed under venous in the source but are liver tissue.)
  report('veins', networkFlow(geometry.filter((g) => g.system === 'venous' && g.group !== 'digestive' && !portal.includes(g)), {
    isRoot: (p, x) => /^((superior|inferior) vena cava|coronary sinus|(superior|inferior) pulmonary vein)$/.test(p.name) && nearAtrium(x),
    sign: -1,
  }));
  // Inspired air runs down the trachea into the bronchial tree.
  report('airways', networkFlow(geometry.filter((g) => g.group === 'airways' && !/cartilage$/.test(g.name)), {
    isRoot: (p, x) => p.name === 'trachea' && x[1] > topY.get(p.id) - 0.5,
  }));
  // Urine runs from each ureter into the bladder and out through the urethra.
  report('urine', networkFlow(by(/^(ureter|urinary bladder|urethra)$/), {
    isRoot: (p, x) => p.name === 'ureter' && x[1] > topY.get(p.id) - 0.5,
  }));
  // Food follows the gut in order (the source has no caecum or sigmoid colon).
  const GUT = ['esophagus', 'stomach', 'duodenum', 'proximal part of jejunum', 'middle part of jejunum', 'distal part of jejunum',
    'proximal part of ileum', 'middle part of ileum', 'distal part of ileum', 'ileocecal junction', 'ascending colon', 'transverse colon',
    'descending colon', 'rectum'];
  report('food', chainFlow(GUT.flatMap((n) => by(new RegExp(`^${n}$`))), {
    entry: (p, x) => x[1] > topY.get(p.id) - 0.5,
  }));
  // Nerve impulses: sensory fibres conduct towards the brainstem, motor fibres away from it.
  // Anchored: "supratrochlear", "infratrochlear" and the sensory root of the ciliary ganglion are sensory.
  const MOTOR = /\b(oculomotor|trochlear) nerve$|^short ciliary nerve$|^ciliary ganglion$/;
  report('nerves', radialFlow(geometry.filter((g) => g.group === 'nerves'), {
    origin: centroid(by(/^midbrain$/)),
    signOf: (p) => (MOTOR.test(p.name) ? 1 : -1),
  }));
  return out;
}

writeFileSync('src/content/structures.generated.json', JSON.stringify([...records.values()], null, 1) + '\n');
