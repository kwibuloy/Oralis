// Build the BodyParts3D-based mode models and src/content/structures.generated.json from the
// BodyParts3D 4.0 geometry packaged by https://github.com/ashemag/human-atlas (CC BY 4.0).
//
//   git clone --depth 1 https://github.com/ashemag/human-atlas ../human-atlas
//   node scripts/extract-bodyparts.mjs ../human-atlas
//   ONLY=dental node scripts/extract-bodyparts.mjs ../human-atlas   (just those models; structures JSON untouched)
//
// Run scripts/build-carving-tooth.mjs, scripts/build-cariology.mjs and scripts/blender/build_cariology.py
// first: the Oral anatomy model includes the carving molar, the Cariology model the Blender lesion molar
// and the process block.
// Writes public/models/general.glb (every BodyParts3D mesh), public/models/physiology.glb (only what the
// Physiology functions show, plus the skeleton for orientation, with per-vertex flow distances),
// public/models/dental.glb (dentition and jaws) and public/models/cariology.glb (the arches with caries
// sites carved into their teeth, plus the authored parts), src/content/cariology-sites.generated.json and
// src/content/cariology-lesions.generated.json.
// The histology model is authored in Blender instead: scripts/blender/build_histology.py.
import { Document, NodeIO } from '@gltf-transform/core';
import { KHRDracoMeshCompression } from '@gltf-transform/extensions';
import { weld } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { chainFlow, networkFlow, radialFlow } from './lib/flow.mjs';
import { smoothMesh, snapVertices } from './lib/mesh-tools.mjs';
import { surfaceNets } from './lib/molar.mjs';
import { fbm } from './lib/noise.mjs';
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

const only = process.env.ONLY?.split(',');
for (const [model, includes] of Object.entries(MODELS)) {
  if (only && !only.includes(model)) continue;
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
  const bites = model === 'dental' ? computeBiteWeights(geometry) : new Map();
  // Cariology: carve the caries sites into their teeth (adds the lesion parts, recolours those teeth).
  const sites = model === 'cariology' ? carveSites(geometry) : [];
  for (const [i, p] of parts.entries()) {
    const { pos, nrm, idx } = geometry[i];
    const prim = doc.createPrimitive()
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(pos).setBuffer(buffer))
      .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(nrm).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(idx).setBuffer(buffer));
    // Signed distance along the part's network, read by the viewer as the `_flow` attribute.
    if (flows.has(p.id)) prim.setAttribute('_FLOW', doc.createAccessor().setType('SCALAR').setArray(flows.get(p.id)).setBuffer(buffer));
    // How far each vertex follows the lower jaw when the bite opens, read by the viewer as `_bite`.
    if (bites.has(p.id)) prim.setAttribute('_BITE', doc.createAccessor().setType('SCALAR').setArray(bites.get(p.id)).setBuffer(buffer));
    if (geometry[i].col) prim.setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(geometry[i].col).setBuffer(buffer));
    scene.addChild(doc.createNode(p.id).setMesh(doc.createMesh(p.id).addPrimitive(prim)));

    // Some structures are split across several source meshes; they share one key.
    const r = records.get(p.id) ?? { id: p.id, key: keyOf(p.name), name: p.name, group: p.group, fma: p.conceptId, models: [] };
    r.models.push(model);
    records.set(p.id, r);
  }
  if (model === 'dental') await addCarvingTooth(doc, buffer, scene, (max[0] - centre[0]) * SCALE);
  if (model === 'cariology') {
    for (const x of sites) {
      const prim = doc.createPrimitive()
        .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(x.pos).setBuffer(buffer))
        .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(x.nrm).setBuffer(buffer))
        .setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(x.col).setBuffer(buffer))
        .setIndices(doc.createAccessor().setType('SCALAR').setArray(x.idx).setBuffer(buffer));
      scene.addChild(doc.createNode(x.name).setMesh(doc.createMesh(x.name).addPrimitive(prim)));
    }
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
 * Caries sites carved into the real teeth. Each tooth that carries a site is rebuilt from a fine signed
 * distance field of its scanned mesh (0.08 mm), the lesion is cut out of that field as a cavity with an
 * irregular outline, and the result is meshed with surface nets, every vertex snapped back onto the
 * field: even, well-shaped triangles, the scanned shape kept outside the lesion. Vertices are coloured
 * in the site's typical clinical look (stained cavity walls, chalky halo of an active lesion; a grey
 * filling with a stained, ditched margin for secondary caries), and the lesion's faces become their own
 * part (site-<id>) so they can be tapped. Mutates the site teeth in `geometry`, returns the extra parts
 * and writes each site's pin.
 */
function carveSites(geometry) {
  const teeth = geometry.filter((g) => g.group === 'teeth');
  const POS = [[/central .*incisor/, 1], [/lateral .*incisor/, 2], [/canine/, 3], [/first .*premolar/, 4], [/second .*premolar/, 5], [/first .*molar/, 6], [/second .*molar/, 7]];
  const all = teeth.map((g) => ({ g, arch: /upper/.test(g.sided) ? 'upper' : 'lower', side: /left/.test(g.sided) ? 'left' : 'right', pos: POS.find(([re]) => re.test(g.sided))?.[1] }));
  const find = (arch, side, pos) => all.find((t) => t.arch === arch && t.side === side && t.pos === pos);
  const centroid = (pos) => { const c = [0, 0, 0]; for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) c[k] += pos[i + k]; return c.map((v) => v / (pos.length / 3)); };
  const sub = (a, b) => a.map((v, i) => v - b[i]), add = (a, b) => a.map((v, i) => v + b[i]), mul = (a, s) => a.map((v) => v * s);
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const unit = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
  const flat = (v) => unit([v[0], 0, v[2]]);
  const CROWN = { upper: [0, 1.05, 0.9, 1.0, 0.85, 0.8, 0.75, 0.7], lower: [0, 0.9, 0.95, 1.1, 0.85, 0.8, 0.75, 0.7] }; // cm, Wheeler
  const frame = (t) => {
    const P = t.g.pos, c = centroid(P);
    const o = t.arch === 'lower' ? [0, 1, 0] : [0, -1, 0];
    const neighbour = t.pos === 1 ? find(t.arch, t.side === 'left' ? 'right' : 'left', 1) : find(t.arch, t.side, t.pos - 1);
    const m = flat(sub(centroid(neighbour.g.pos), c)); // mesial: towards the next tooth along the arch
    const archCentre = centroid(all.filter((a) => a.arch === t.arch).flatMap((a) => centroid(a.g.pos)));
    let b = [m[2], 0, -m[0]]; // buccal/labial
    if (dot(b, sub(c, archCentre)) < 0) b = mul(b, -1);
    let tip = -Infinity;
    for (let i = 0; i < P.length; i += 3) tip = Math.max(tip, dot([P[i], P[i + 1], P[i + 2]], o));
    return { c, o, m, b, tip, crown: CROWN[t.arch][t.pos] };
  };

  // ---------- Signed distance to a closed triangle mesh, on a grid ----------
  const closestOnTriangle = (p, a, b, c) => {
    // Ericson, Real-Time Collision Detection 5.1.5.
    const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
    const d1 = dot(ab, ap), d2 = dot(ac, ap);
    if (d1 <= 0 && d2 <= 0) return a;
    const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
    if (d3 >= 0 && d4 <= d3) return b;
    const vc = d1 * d4 - d3 * d2;
    if (vc <= 0 && d1 >= 0 && d3 <= 0) return add(a, mul(ab, d1 / (d1 - d3)));
    const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
    if (d6 >= 0 && d5 <= d6) return c;
    const vb = d5 * d2 - d1 * d6;
    if (vb <= 0 && d2 >= 0 && d6 <= 0) return add(a, mul(ac, d2 / (d2 - d6)));
    const va = d3 * d6 - d5 * d4;
    if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return add(b, mul(sub(c, b), (d4 - d3) / (d4 - d3 + (d5 - d6))));
    const den = 1 / (va + vb + vc);
    return add(a, add(mul(ab, vb * den), mul(ac, vc * den)));
  };
  function meshSDF(P, N, I, step) {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], P[i + k]); hi[k] = Math.max(hi[k], P[i + k]); }
    const pad = step * 6, min = lo.map((v) => v - pad);
    const n = hi.map((v, k) => Math.ceil((v + pad - min[k]) / step) + 1);
    const idx = (i, j, k) => (k * n[1] + j) * n[0] + i;
    const dist = new Float32Array(n[0] * n[1] * n[2]).fill(1e9), sgn = new Int8Array(dist.length);
    const band = step * 2.5;
    for (let t = 0; t < I.length; t += 3) {
      const [a, b, c] = [I[t], I[t + 1], I[t + 2]].map((v) => [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]]);
      // Outward by the vertex normals (the source's normals point out; its winding is not relied on).
      const fn = unit([0, 1, 2].map((k) => N[I[t] * 3 + k] + N[I[t + 1] * 3 + k] + N[I[t + 2] * 3 + k]));
      const g0 = [0, 1, 2].map((k) => Math.max(0, Math.floor((Math.min(a[k], b[k], c[k]) - band - min[k]) / step)));
      const g1 = [0, 1, 2].map((k) => Math.min(n[k] - 1, Math.ceil((Math.max(a[k], b[k], c[k]) + band - min[k]) / step)));
      for (let k = g0[2]; k <= g1[2]; k++) for (let j = g0[1]; j <= g1[1]; j++) for (let i = g0[0]; i <= g1[0]; i++) {
        const p = [min[0] + i * step, min[1] + j * step, min[2] + k * step];
        const q = closestOnTriangle(p, a, b, c);
        const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
        const id = idx(i, j, k);
        if (d < dist[id]) { dist[id] = d; sgn[id] = dot(sub(p, q), fn) >= 0 ? 1 : -1; }
      }
    }
    // Outside = reachable from the grid's corner without crossing the band.
    const outside = new Uint8Array(dist.length), queue = [0];
    outside[0] = 1;
    while (queue.length) {
      const id = queue.pop();
      const i = id % n[0], j = Math.floor(id / n[0]) % n[1], k = Math.floor(id / (n[0] * n[1]));
      for (const [di, dj, dk] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const a = i + di, b = j + dj, c = k + dk;
        if (a < 0 || b < 0 || c < 0 || a >= n[0] || b >= n[1] || c >= n[2]) continue;
        const nid = idx(a, b, c);
        if (outside[nid] || dist[nid] < band) continue;
        outside[nid] = 1; queue.push(nid);
      }
    }
    const field = new Float32Array(dist.length);
    for (let id = 0; id < field.length; id++) field[id] = dist[id] < band ? sgn[id] * dist[id] : outside[id] ? band : -band;
    const sample = (p) => {
      const f = [0, 1, 2].map((k) => Math.min(n[k] - 1.001, Math.max(0, (p[k] - min[k]) / step)));
      const i0 = f.map(Math.floor), t = f.map((v, k) => v - i0[k]);
      let s = 0;
      for (let dk = 0; dk < 2; dk++) for (let dj = 0; dj < 2; dj++) for (let di = 0; di < 2; di++) {
        s += field[idx(i0[0] + di, i0[1] + dj, i0[2] + dk)] * (di ? t[0] : 1 - t[0]) * (dj ? t[1] : 1 - t[1]) * (dk ? t[2] : 1 - t[2]);
      }
      return s;
    };
    return { min, n, step, field, sample };
  }

  // ---------- Colours (linear, as glTF vertex colours are) ----------
  const lin = (hex) => [1, 3, 5].map((i) => { const c = parseInt(hex.slice(i, i + 2), 16) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  const ENAMEL = lin('#f6f1e7'); // the teeth's colour in the model (GROUP_COLOR.teeth)
  // Carious dentin is a muted yellow-brown (active, soft) to dark brown-black (arrested): no orange.
  const CHALK = lin('#ffffff'), WALL = lin('#7d5a36'), FLOOR = lin('#352214'), STAIN = lin('#22160d'), LEATHER = lin('#a88457'), LEATHER_DEEP = lin('#6a4a2c');
  const SHADOW = lin('#cbbfa9'), SHADOW_DEEP = lin('#86735d'), AMALGAM = lin('#8d9299'), AMALGAM_DARK = lin('#646970');
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const STAINB = lin('#5c3d22');
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * Math.min(1, Math.max(0, t)));

  /**
   * Sites (sizes in cm): centre on the scanned surface, outline radii along u and the other tangent,
   * depth, halo (fraction of the radius), look. `out` lifts the cavity's centre off the surface (a
   * broken incisal angle is centred just outside the corner).
   */
  const near = (P, N, test, score) => { let best = -1, bs = Infinity; for (let i = 0; i < P.length; i += 3) { const v = [P[i], P[i + 1], P[i + 2]], nv = [N[i], N[i + 1], N[i + 2]]; if (!test(v, nv)) continue; const s = score(v); if (s < bs) { bs = s; best = i / 3; } } return best; };
  const SITES = [
    { id: 'class-1', tooth: ['lower', 'right', 6], ru: 0.14, rv: 0.11, depth: 0.13, halo: 0.45, look: 'stained', u: (f) => f.m,
      centre: (f, P, N) => near(P, N, (v, n) => dot(n, f.o) > 0.6 && Math.hypot(v[0] - f.c[0], v[2] - f.c[2]) < 0.12, (v) => dot(v, f.o)) },
    { id: 'class-2', tooth: ['upper', 'right', 4], ru: 0.12, rv: 0.1, depth: 0.1, halo: 0.4, look: 'stained', u: (f) => f.b,
      centre: (f, P, N) => near(P, N, (v, n) => dot(n, f.m) > 0.6, (v) => Math.abs(f.tip - dot(v, f.o) - f.crown * 0.5) + Math.abs(dot(sub(v, f.c), f.b)) * 0.5) },
    { id: 'class-3', tooth: ['upper', 'left', 1], ru: 0.09, rv: 0.11, depth: 0.07, halo: 0.45, look: 'shadow', u: (f) => f.b,
      centre: (f, P, N) => near(P, N, (v, n) => dot(n, f.m) > 0.45, (v) => Math.abs(f.tip - dot(v, f.o) - f.crown * 0.45) - dot(sub(v, f.c), f.b) * 0.3) },
    { id: 'class-4', tooth: ['upper', 'right', 1], ru: 0.19, rv: 0.19, depth: 0.19, halo: 0.25, look: 'leather', out: 0.06, u: (f) => f.b,
      centre: (f, P, N) => near(P, N, () => true, (v) => -(dot(sub(v, f.c), f.m) + dot(v, f.o))) },
    { id: 'class-5', tooth: ['lower', 'right', 3], ru: 0.2, rv: 0.075, depth: 0.065, halo: 0.6, look: 'leather', u: (f) => f.m,
      centre: (f, P, N) => near(P, N, (v, n) => dot(n, f.b) > 0.7, (v) => Math.abs(f.tip - dot(v, f.o) - f.crown * 0.86) + Math.abs(dot(sub(v, f.c), f.m)) * 0.5) },
    { id: 'class-6', tooth: ['upper', 'left', 3], ru: 0.055, rv: 0.055, depth: 0.04, halo: 0.6, look: 'stained', u: (f) => f.m,
      centre: (f, P, N) => near(P, N, () => true, (v) => -dot(v, f.o)) },
    { id: 'root', tooth: ['lower', 'left', 4], ru: 0.19, rv: 0.085, depth: 0.045, halo: 0.25, look: 'leather', u: (f) => f.m,
      centre: (f, P, N) => near(P, N, (v, n) => dot(n, f.b) > 0.6, (v) => Math.abs(f.tip - dot(v, f.o) - (f.crown + 0.12)) + Math.abs(dot(sub(v, f.c), f.m)) * 0.5) },
    { id: 'secondary', tooth: ['upper', 'left', 6], ru: 0.16, rv: 0.13, depth: 0.12, halo: 0.35, look: 'restoration', u: (f) => f.m,
      centre: (f, P, N) => near(P, N, (v, n) => dot(n, f.o) > 0.6 && Math.hypot(v[0] - f.c[0], v[2] - f.c[2]) < 0.12, (v) => dot(v, f.o)) },
  ];
  const STEP = 0.01; // 0.1 mm: finer than the scans themselves, smooth enough for the cavity walls

  // Each site's cavity as a field (negative inside): a half-ellipsoid under the surface, outline and
  // floor made irregular with smooth noise.
  for (const [si, s] of SITES.entries()) {
    const t = find(...s.tooth), f = frame(t), P = t.g.pos, N = t.g.nrm;
    const ci = s.centre(f, P, N);
    const nc = unit([N[ci * 3], N[ci * 3 + 1], N[ci * 3 + 2]]);
    const c = add([P[ci * 3], P[ci * 3 + 1], P[ci * 3 + 2]], mul(nc, s.out ?? 0));
    const u = unit(sub(s.u(f), mul(nc, dot(s.u(f), nc)))), w = cross(nc, u);
    const R = Math.min(s.ru, s.rv, s.depth), seed = si * 13.7;
    Object.assign(s, { t, c, nc, u, w, R, surface: [P[ci * 3], P[ci * 3 + 1], P[ci * 3 + 2]] });
    // A main lobe and two smaller satellites along the long axis, wider at depth than at the opening
    // (undermined enamel), with a rough floor: a real cavity is not a smooth bowl.
    const h = (k) => { const x = Math.sin(k * 127.1 + seed * 311.7) * 43758.5453; return x - Math.floor(x); };
    const under = { stained: 0.32, shadow: 0.2, leather: 0.15, restoration: 0.1 }[s.look];
    s.lobes = [[0, 0, 1, 1], [s.ru * (0.55 + 0.25 * h(1)), s.rv * (h(2) - 0.5) * 0.8, 0.5 + 0.12 * h(3), 0.6 + 0.2 * h(4)], [-s.ru * (0.5 + 0.25 * h(5)), s.rv * (h(6) - 0.5) * 0.8, 0.42 + 0.12 * h(7), 0.5 + 0.25 * h(8)]];
    s.cavity = (p) => {
      const d = sub(p, c), du = dot(d, u), dw = dot(d, w), dn = dot(d, nc);
      const wide = 1 + under * Math.min(1, Math.max(0, -dn / s.depth));
      let best = Infinity;
      for (const [ou, ow, rs, ds] of s.lobes) best = Math.min(best, Math.hypot((du - ou) / (s.ru * rs * wide), (dw - ow) / (s.rv * rs * wide), dn / (s.depth * ds)));
      // Irregular but not ragged: a fine high-frequency term made the margin look torn at close range.
      return (best - 1 - 0.12 * fbm(p, 26, 3, seed) - 0.025 * fbm(p, 75, 3, seed + 2)) * R - 0.003 * fbm(p, 55, 2, seed + 5);
    };
    // Distance outside the cavity's outline along the surface, for the stain and the halo (≈ 0 at the rim).
    s.rim = (p) => {
      const d = sub(p, c), du = dot(d, u), dw = dot(d, w);
      let best = Infinity;
      for (const [ou, ow, rs] of s.lobes) best = Math.min(best, Math.hypot((du - ou) / (s.ru * rs), (dw - ow) / (s.rv * rs)));
      return best * (1 + 0.12 * fbm(p, 26, 3, seed)) - 1;
    };
  }

  const extra = [];
  const byTooth = new Map();
  for (const s of SITES) { if (!byTooth.has(s.t)) byTooth.set(s.t, []); byTooth.get(s.t).push(s); }
  for (const [t, sites] of byTooth) {
    const sdf = meshSDF(t.g.pos, t.g.nrm, t.g.idx, STEP);
    const { min, n, field } = sdf;
    const restoration = sites.find((s) => s.look === 'restoration');
    // The tooth: the scanned shape minus every cavity (and a restoration's ditched margin);
    // the filling: the restoration's cavity within the scanned shape, minus the ditch.
    const ditch = (s, p) => Math.max(Math.abs(s.cavity(p)) - 0.012, -(sdf.sample(p) + 0.05));
    // The cavity meets the scanned surface in a slightly rounded margin (a smooth max, 0.12 mm): at a sharp
    // crease the mesher cannot put vertices on both surfaces and left voxel steps all round the rim.
    const smax = (a, b, k) => { const h = Math.min(1, Math.max(0, 0.5 + (0.5 * (b - a)) / k)); return a + (b - a) * h + k * h * (1 - h); };
    const toothF = (p, base) => {
      let v = base;
      for (const s of sites) v = smax(v, -s.cavity(p), 0.012);
      if (restoration) v = Math.max(v, -ditch(restoration, p));
      return v;
    };
    const fillF = (p, base) => Math.max(base, restoration.cavity(p), -ditch(restoration, p));
    const regions = [['tooth', toothF], ...(restoration ? [['filling', fillF]] : [])];
    const built = {};
    for (const [name, fn] of regions) {
      const grid = new Float32Array(field.length);
      let id = 0;
      for (let k = 0; k < n[2]; k++) for (let j = 0; j < n[1]; j++) for (let i = 0; i < n[0]; i++, id++) {
        const base = field[id];
        if (Math.abs(base) > 0.4) { grid[id] = name === 'tooth' ? base : Math.max(base, 0.1); continue; }
        grid[id] = fn([min[0] + i * STEP, min[1] + j * STEP, min[2] + k * STEP], base);
      }
      const { positions, quads } = surfaceNets(STEP, { grid: { min, n, field: grid }, snap: null });
      // Snap onto the true surface (the scanned field with the cavities cut out), then a light smoothing.
      const f = (p) => fn(p, sdf.sample(p));
      snapVertices(positions, [], f, f, STEP);
      smoothMesh(positions, quads, [], STEP, 6);
      built[name] = { positions, quads };
    }
    // Colour, normals and parts.
    for (const [name, { positions, quads }] of Object.entries(built)) {
      const nv = positions.length / 3;
      // owner: the site a vertex's colour belongs to; weight: how much it belongs to that site's part (the
      // part's outline is the 0.5 contour of this smooth field, not a staircase of whole triangles).
      const col = new Float32Array(positions.length), owner = new Int16Array(nv).fill(-1), weight = new Float32Array(nv);
      const claim = (v, si, w) => { if (w > weight[v]) { weight[v] = w; owner[v] = si; } };
      for (let v = 0; v < nv; v++) {
        const p = [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]];
        let c = ENAMEL;
        if (name === 'filling') { c = mix(AMALGAM, AMALGAM_DARK, (fbm(p, 60, 2, 9) + 1) * 0.3); claim(v, SITES.indexOf(restoration), 1); col.set(c, v * 3); continue; }
        const depth = -sdf.sample(p); // how far inside the scanned surface: > 0 on a cavity wall
        for (const s of sites) {
          const k = (fbm(p, 90, 2, SITES.indexOf(s) * 3.1) + 1) / 2; // mottling
          const rim = s.rim(p);
          if (s.look === 'restoration') {
            if (depth > 0.004 && Math.abs(s.cavity(p)) < 0.03) { c = mix(LEATHER, STAIN, 0.6 + 0.4 * k); claim(v, SITES.indexOf(s), 1); }
            else if (rim > -0.1 && rim < s.halo) { c = mix(mix(CHALK, LEATHER, 0.2), ENAMEL, Math.max(0, rim) / s.halo); claim(v, SITES.indexOf(s), 1 - smooth(0.8 * s.halo, s.halo, rim)); }
            continue;
          }
          const reach = Math.max(s.ru, s.rv);
          const si = SITES.indexOf(s), seed = si * 3.1;
          // Halo first: stain creeping into the enamel in broad soft fingers, then the chalky white-spot edge
          // of an active lesion, then sound enamel. The outline is measured across the lesion's normal, so a
          // point far round the tooth can land inside it: the halo keeps to the surface beside the cavity.
          let halo = null, edge = 1;
          // Faded out, not cut off: hard limits here chopped the halo into a comb along the outline on cusp slopes.
          const gate = (1 - smooth(s.depth + 0.04, s.depth + 0.1, Math.abs(dot(sub(p, s.c), s.nc)))) * (1 - smooth(reach * (1.9 + s.halo), reach * (2.3 + s.halo), Math.hypot(...sub(p, s.c))));
          if (rim < s.halo * 1.5 && gate > 0) {
            edge = Math.max(0, rim) / (s.halo * 1.5);
            const fingers = (fbm(p, 14, 3, seed + 11) + 1) / 2;
            const power = s.look === 'shadow' ? 0.25 : s.look === 'leather' ? 0.55 : 1;
            // A ramp several vertices wide (0.1 mm apart): a narrow one rendered as blocks at close range.
            const stained = smooth(0.05, 0.85, 0.95 - edge * 1.4 + (fingers - 0.5) * 0.4) * power;
            const chalk = smooth(0.2, 0.5, edge) * (1 - smooth(0.75, 1, edge)) * 0.95;
            halo = mix(ENAMEL, s.look === 'shadow' ? SHADOW : s.look === 'leather' ? mix(STAINB, LEATHER, 0.5) : mix(STAINB, STAIN, smooth(0.6, 1, stained) * 0.45), stained);
            halo = mix(ENAMEL, mix(halo, CHALK, chalk * (1 - stained)), gate);
          }
          // How much of a cavity wall this point is: on the cavity's surface and below the scanned one. Depth is
          // sampled from the grid and wobbles by about ±0.03 mm on intact enamel, so the blend starts above that:
          // starting at zero flipped neighbouring rim vertices between wall and enamel, in square blocks.
          const wallness = Math.hypot(...sub(p, s.c)) < reach * 1.8 ? smooth(0.003, 0.012, depth) * (1 - smooth(0.015, 0.035, Math.abs(s.cavity(p)))) : 0;
          if (!halo && wallness <= 0) continue;
          let wall = ENAMEL;
          if (wallness > 0) {
            // How deep into the cavity, measured from the original surface along the lesion's normal.
            const tt = Math.min(1, Math.max(0, dot(sub(s.surface, p), s.nc) / s.depth) * 1.3) ** 0.6;
            const n2 = (fbm(p, 220, 2, seed + 7) + 1) / 2, n3 = (fbm(p, 45, 3, seed + 3) + 1) / 2;
            wall = s.look === 'shadow' ? mix(SHADOW, SHADOW_DEEP, tt * 0.9 + k * 0.2) : s.look === 'leather' ? mix(LEATHER, LEATHER_DEEP, tt * 0.8 + k * 0.25) : mix(WALL, FLOOR, tt * 0.9 + k * 0.25);
            // Broad patches of lighter and darker carious dentin, darker pitting low down, and a stained margin
            // where the cavity breaks through the enamel.
            wall = mix(wall, wall.map((x) => x * 0.6), smooth(0.4, 0.7, n3) * 0.5);
            wall = mix(wall, STAIN, smooth(0.66, 0.88, n2) * (0.15 + 0.5 * tt));
            wall = mix(wall, s.look === 'shadow' ? SHADOW_DEEP : STAINB, smooth(0.25, 0, tt) * 0.5);
          }
          c = mix(halo ?? c, wall, wallness);
          // The part ends where the halo has faded to sound enamel.
          claim(v, si, Math.max(wallness, halo ? (1 - smooth(0.85, 1, edge)) * gate : 0));
        }
        col.set(c, v * 3);
      }
      const nrm = new Float32Array(positions.length), tris = [];
      for (const q of quads) tris.push([q[0], q[1], q[2]], [q[0], q[2], q[3]]);
      for (const [a, b, c] of tris) {
        const e1 = [0, 1, 2].map((k) => positions[b * 3 + k] - positions[a * 3 + k]), e2 = [0, 1, 2].map((k) => positions[c * 3 + k] - positions[a * 3 + k]);
        const fn = cross(e1, e2);
        for (const v of [a, b, c]) for (let k = 0; k < 3; k++) nrm[v * 3 + k] += fn[k];
      }
      for (let v = 0; v < nv; v++) { const l = Math.hypot(nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]) || 1; for (let k = 0; k < 3; k++) nrm[v * 3 + k] /= l; }
      // Split the triangles along the 0.5 contour of the weight, so each site's part has a smooth outline.
      // New vertices on cut edges are shared by both sides (same position, normal and colour: no seam).
      const P0 = Array.from(positions), N0 = Array.from(nrm), C0 = Array.from(col), W0 = Array.from(weight), O0 = Array.from(owner);
      const cuts = new Map();
      const cutAt = (a, b) => {
        const key = a < b ? `${a},${b}` : `${b},${a}`;
        if (cuts.has(key)) return cuts.get(key);
        const f = (0.5 - W0[a]) / (W0[b] - W0[a]), i = P0.length / 3;
        for (const [arr, n] of [[P0, 3], [N0, 3], [C0, 3]]) for (let k = 0; k < n; k++) arr.push(arr[a * n + k] + (arr[b * n + k] - arr[a * n + k]) * f);
        const l = Math.hypot(N0[i * 3], N0[i * 3 + 1], N0[i * 3 + 2]) || 1;
        for (let k = 0; k < 3; k++) N0[i * 3 + k] /= l;
        W0.push(0.5); O0.push(W0[a] >= 0.5 ? O0[a] : O0[b]);
        cuts.set(key, i);
        return i;
      };
      const groups = new Map();
      const put = (part, tri) => { if (!groups.has(part)) groups.set(part, []); groups.get(part).push(...tri); };
      const partOf = (si) => (name === 'filling' ? 'site-restoration' : si >= 0 ? `site-${SITES[si].id}` : t.g.id);
      for (const tri of tris) {
        if (name === 'filling') { put('site-restoration', tri); continue; }
        const inside = tri.map((v) => W0[v] >= 0.5);
        const n = inside.filter(Boolean).length;
        if (n === 0) { put(t.g.id, tri); continue; }
        // Inside vertices of two sites in one triangle: keep it whole with the first.
        const site = O0[tri[inside.indexOf(true)]];
        if (n === 3) { put(partOf(site), tri); continue; }
        // Rotate so the odd vertex out comes first, then cut its two edges.
        const odd = inside.findIndex((x) => (n === 1 ? x : !x));
        const [a, b, c] = [tri[odd], tri[(odd + 1) % 3], tri[(odd + 2) % 3]];
        const ab = cutAt(a, b), ac = cutAt(a, c);
        const lone = [a, ab, ac], pair = [[ab, b, c], [ab, c, ac]];
        if (n === 1) { put(partOf(site), lone); for (const x of pair) put(t.g.id, x); }
        else { put(t.g.id, lone); for (const x of pair) put(partOf(site), x); }
      }
      for (const [part, list] of groups) {
        const map = new Map(), P = [], NN = [], C = [], I = [];
        for (const v of list) {
          if (!map.has(v)) { map.set(v, P.length / 3); P.push(P0[v * 3], P0[v * 3 + 1], P0[v * 3 + 2]); NN.push(N0[v * 3], N0[v * 3 + 1], N0[v * 3 + 2]); C.push(C0[v * 3], C0[v * 3 + 1], C0[v * 3 + 2]); }
          I.push(map.get(v));
        }
        const geo = { pos: new Float32Array(P), nrm: new Float32Array(NN), idx: new Uint32Array(I), col: new Float32Array(C) };
        if (part === t.g.id) Object.assign(t.g, geo); else extra.push({ name: part, ...geo });
      }
    }
    console.log(`  carved ${sites.map((s) => s.id).join(' + ')} into ${t.g.sided} (${t.g.idx.length / 3} triangles)`);
  }
  const pins = SITES.map((s) => ({ id: s.id, key: `site-${s.id}`, position: add(s.surface, mul(s.nc, 0.003)).map((v) => +v.toFixed(4)), normal: s.nc.map((v) => +v.toFixed(3)) }));
  writeFileSync('src/content/cariology-sites.generated.json', JSON.stringify(pins, null, 1) + '\n');
  return extra;
}

/**
 * Merge the authored Cariology parts, scaled to the model's centimetres and set beside the arches (each
 * view shows only its own parts):
 *   - the lesion molar (mm) from models-src/cariology-blender.glb and its manifest (scripts/blender/
 *     build_cariology.py). Each part's two primitives (natural surface, "(cut)" study faces) become one,
 *     with _CUT (1 on a cut face) and _ZONE (the part's index in `regions`, for the zone palette) per
 *     vertex; its custom normals are kept. Writes src/content/cariology-lesions.generated.json: per
 *     lesion, the parts of each stage and a pin on the cut face of each lesion zone and the pulp;
 *   - the process block (µm) from models-src/cariology.glb (scripts/build-cariology.mjs), whose old
 *     lesion molar (cl-*) is no longer used.
 */
async function addCariologyParts(doc, buffer, scene, archRightEdge) {
  const copy = (a) => doc.createAccessor().setType(a.getType()).setArray(a.getArray().slice()).setBuffer(buffer);
  const place = (node, scale, x) => scene.addChild(node.setScale([scale, scale, scale]).setTranslation([archRightEdge + x, 0, 0]));

  const block = await io.read('models-src/cariology.glb');
  let n = 0;
  for (const node of block.getRoot().listNodes()) {
    const name = node.getName();
    if (!name.startsWith('pr-')) continue;
    const p = node.getMesh().listPrimitives()[0];
    const prim = doc.createPrimitive().setIndices(copy(p.getIndices()));
    for (const semantic of p.listSemantics()) prim.setAttribute(semantic, copy(p.getAttribute(semantic)));
    place(doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim)), 0.05, 10);
    n++;
  }

  const manifest = JSON.parse(readFileSync('models-src/cariology-blender.json', 'utf8'));
  const tooth = await io.read('models-src/cariology-blender.glb');
  const zoneOf = (name) => name.replace(/^cl-(pit-fissure|smooth-surface|root)-(\d+|static|perio)-/, '');
  const nodes = new Map(tooth.getRoot().listNodes().filter((x) => x.getMesh()).map((x) => [x.getName(), x]));
  const regions = [...new Set([...nodes.keys()].map(zoneOf))].sort();
  if (regions.length > 16) throw new Error(`${regions.length} lesion-molar regions: the viewer's zone palette holds 16`);
  const cutFaces = new Map(); // part → its cut-face triangles [a, b, c, normal], for the pins
  for (const [name, node] of nodes) {
    const pos = [], nrm = [], cut = [], idx = [], tris = [];
    for (const p of node.getMesh().listPrimitives()) {
      const isCut = / \(cut\)$/.test(p.getMaterial()?.getName() ?? '');
      const P = p.getAttribute('POSITION').getArray(), N = p.getAttribute('NORMAL').getArray(), I = p.getIndices().getArray();
      const base = pos.length / 3;
      for (let i = 0; i < P.length; i++) { pos.push(P[i]); nrm.push(N[i]); }
      for (let i = 0; i < P.length / 3; i++) cut.push(isCut ? 1 : 0);
      for (let i = 0; i < I.length; i++) idx.push(base + I[i]);
      const v = (i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
      if (isCut) for (let t = 0; t < I.length; t += 3) tris.push([v(I[t]), v(I[t + 1]), v(I[t + 2]), [N[I[t] * 3], N[I[t] * 3 + 1], N[I[t] * 3 + 2]]]);
    }
    cutFaces.set(name, tris);
    const zone = regions.indexOf(zoneOf(name));
    const prim = doc.createPrimitive()
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(pos)).setBuffer(buffer))
      .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(nrm)).setBuffer(buffer))
      .setAttribute('_CUT', doc.createAccessor().setType('SCALAR').setArray(new Float32Array(cut)).setBuffer(buffer))
      .setAttribute('_ZONE', doc.createAccessor().setType('SCALAR').setArray(new Float32Array(cut.length).fill(zone)).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(idx)).setBuffer(buffer));
    place(doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim)), 0.1, 4);
  }

  const lesions = {};
  for (const [kind, site] of Object.entries(manifest.sites)) {
    const zones = (group) => site.base.filter((x) => x.startsWith(`cl-${kind}-${group}-`)).map(zoneOf);
    lesions[kind] = {
      static: `cl-${kind}-static`, staticParts: zones('static'),
      perio: `cl-${kind}-perio`, perioParts: zones('perio'),
      lesion: site.lesion,
      stages: site.stages.map((names, i) => {
        const parts = names.map(zoneOf);
        // Pins on the lesion zones and the pulp; sound enamel, dentin and cementum have none.
        const pins = parts.filter((z) => !['enamel', 'dentin', 'cementum'].includes(z))
          .map((z) => ({ region: z, ...pinOnCut(cutFaces.get(`cl-${kind}-${i}-${z}`)) }))
          .filter((p) => p.position);
        return { parts, pins };
      }),
    };
  }
  writeFileSync('src/content/cariology-lesions.generated.json', JSON.stringify({ units: 'mm', tooth: manifest.tooth, regions, lesions }, null, 1) + '\n');
  console.log(`  merged ${n} process-block parts and ${nodes.size} lesion-molar parts`);
}

/**
 * A pin on a part's cut faces: on the cut plane with the most area, the triangle centre farthest from
 * that plane's outline, so the pin sits well inside the zone even when the zone is thin or curved.
 */
function pinOnCut(tris) {
  if (!tris?.length) return {};
  const planes = new Map();
  for (const t of tris) {
    const k = t[3].map((v) => Math.round(v * 10)).join();
    const [a, b, c] = t;
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const area = Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2;
    if (!planes.has(k)) planes.set(k, { area: 0, tris: [] });
    const p = planes.get(k); p.area += area; p.tris.push(t);
  }
  const plane = [...planes.values()].sort((a, b) => b.area - a.area)[0];
  // The outline: edges used by only one triangle of the plane (vertices matched to 1 µm).
  const vk = (p) => p.map((v) => Math.round(v * 1000)).join();
  const edges = new Map();
  for (const t of plane.tris) for (let k = 0; k < 3; k++) {
    const e = [vk(t[k]), vk(t[(k + 1) % 3])].sort().join('|');
    edges.set(e, edges.has(e) ? null : [t[k], t[(k + 1) % 3]]);
  }
  const outline = [...edges.values()].filter(Boolean);
  const toSegment = (p, [a, b]) => {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
    const s = Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1)));
    return Math.hypot(ap[0] - s * ab[0], ap[1] - s * ab[1], ap[2] - s * ab[2]);
  };
  let best = null, far = -1;
  for (const [a, b, c] of plane.tris) {
    const m = [0, 1, 2].map((i) => (a[i] + b[i] + c[i]) / 3);
    let d = Infinity;
    for (const e of outline) { d = Math.min(d, toSegment(m, e)); if (d <= far) break; }
    if (d > far) { far = d; best = m; }
  }
  const nrm = plane.tris[0][3], l = Math.hypot(...nrm) || 1;
  return { position: best.map((v) => +v.toFixed(3)), normal: nrm.map((v) => +(v / l).toFixed(3)) };
}

/**
 * Oral anatomy's open bite: the fraction of the lower jaw's offset each vertex follows (the `_BITE`
 * attribute). The mandible, lower teeth and lower gingiva move whole (the viewer does that by key); the
 * hyoid drops about half as far. Parts tied between them and the fixed skull (tongue, floor-of-mouth
 * muscles, glands, lips, pharyngeal wall) stretch: each vertex blends the anchors its part is tied to by
 * inverse distance, so it moves with the bone it lies on and stretches in between. The blend is softened
 * by SOFT: a sharper one let neighbouring triangles move so differently that they folded inside out (dark
 * patches on the digastric and tongue muscles); 0.3 cm leaves 0.9 mm average lag where parts meet the jaw.
 */
function computeBiteWeights(geometry) {
  const SOFT = 0.3; // cm
  const lowerJaw = (g) => g.group === 'mandible' || (/lower/.test(g.sided) && (g.group === 'teeth' || g.group === 'gingiva'));
  const upperJaw = (g) => g.group === 'maxilla' || (/upper/.test(g.sided) && (g.group === 'teeth' || g.group === 'gingiva'));
  const fixed = (g) => g.group === 'skull' || upperJaw(g) || /^(atlas|axis)$/.test(g.name);
  const anchor = (test, value) => ({ value, nearest: pointIndex(geometry.filter(test).map((g) => g.pos)) });
  const JAW = anchor(lowerJaw, 1), HYOID = anchor((g) => g.name === 'hyoid bone', 0.5), FIXED = anchor(fixed, 0);
  // The tongue and the glands hang between the jaw and the hyoid; the floor-of-mouth muscles and the
  // pharyngeal wall also reach the skull (digastric and stylohyoid behind the ear).
  const TIED = { tongue: [JAW, HYOID], glands: [JAW, HYOID], suprahyoid: [JAW, HYOID, FIXED], 'palate-pharynx': [JAW, HYOID, FIXED] };
  const out = new Map();
  for (const g of geometry) {
    if (g.name === 'hyoid bone') { out.set(g.id, new Float32Array(g.pos.length / 3).fill(HYOID.value)); continue; }
    if (g.group === 'lips') { out.set(g.id, lipWeights(g)); continue; }
    const anchors = TIED[g.group];
    if (!anchors) continue;
    const w = new Float32Array(g.pos.length / 3);
    for (let v = 0; v < w.length; v++) {
      let sum = 0, total = 0;
      for (const a of anchors) {
        const d = a.nearest(g.pos[v * 3], g.pos[v * 3 + 1], g.pos[v * 3 + 2]);
        const k = 1 / (d ** 2 + SOFT ** 2);
        sum += a.value * k; total += k;
      }
      w[v] = sum / total;
    }
    out.set(g.id, w);
  }
  const range = (w) => { let lo = 1, hi = 0; for (const x of w) { lo = Math.min(lo, x); hi = Math.max(hi, x); } return `${lo.toFixed(2)}–${hi.toFixed(2)}`; };
  console.log(`  bite weights: ${out.size} meshes`);
  for (const [id, w] of out) console.log(`    ${geometry.find((g) => g.id === id).sided}: ${range(w)}`);
  return out;
}

/**
 * The source lip is crumpled where the lips meet at each corner: tiny when closed, stretched large when the
 * bite opens. Taubin-smooth the outer quarter of the lip on each side (fading in, so the middle of the
 * lips keeps the source shape exactly) and recompute the normals there. Mutates g.pos and g.nrm.
 */
function smoothLipCorners(g, half) {
  const P = g.pos, N = g.nrm, I = g.idx, n = P.length / 3;
  // One id per point (copies of a point in loose triangles share it).
  const key = (v) => `${Math.round(P[v * 3] * 1e4)},${Math.round(P[v * 3 + 1] * 1e4)},${Math.round(P[v * 3 + 2] * 1e4)}`;
  const ids = new Map(), at = Int32Array.from({ length: n }, (_, v) => { const k = key(v); if (!ids.has(k)) ids.set(k, ids.size); return ids.get(k); });
  const m = ids.size, xyz = new Float64Array(m * 3), nb = Array.from({ length: m }, () => new Set());
  for (let v = 0; v < n; v++) for (let c = 0; c < 3; c++) xyz[at[v] * 3 + c] = P[v * 3 + c];
  // Neighbours by nearness, not by shared edges: the crumple is a cluster of tiny triangles joined to nothing.
  const R = 0.15, cell = (i) => [0, 1, 2].map((c) => Math.floor(xyz[i * 3 + c] / R)), grid = new Map();
  for (let i = 0; i < m; i++) { const k = cell(i).join(); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); }
  for (let i = 0; i < m; i++) {
    const [a, b, c] = cell(i);
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) for (const j of grid.get(`${a + x},${b + y},${c + z}`) ?? []) {
      if (j !== i && Math.hypot(xyz[i * 3] - xyz[j * 3], xyz[i * 3 + 1] - xyz[j * 3 + 1], xyz[i * 3 + 2] - xyz[j * 3 + 2]) < R) nb[i].add(j);
    }
  }
  const strength = Float64Array.from({ length: m }, (_, i) => Math.min(Math.max((Math.abs(xyz[i * 3]) / half - 0.75) / 0.15, 0), 1));
  const step = (factor) => {
    const next = xyz.slice();
    for (let i = 0; i < m; i++) {
      if (!strength[i] || !nb[i].size) continue;
      for (let c = 0; c < 3; c++) {
        let avg = 0;
        for (const j of nb[i]) avg += xyz[j * 3 + c];
        next[i * 3 + c] += factor * strength[i] * (avg / nb[i].size - xyz[i * 3 + c]);
      }
    }
    xyz.set(next);
  };
  for (let pass = 0; pass < 20; pass++) { step(0.5); step(-0.53); }
  // Normals in the smoothed area from the new faces, kept on the same side as the source normals.
  const face = new Float64Array(m * 3);
  for (let t = 0; t < I.length; t += 3) {
    const [a, b, c] = [at[I[t]], at[I[t + 1]], at[I[t + 2]]];
    const u = [0, 1, 2].map((k) => xyz[b * 3 + k] - xyz[a * 3 + k]), v = [0, 1, 2].map((k) => xyz[c * 3 + k] - xyz[a * 3 + k]);
    const f = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    // Loose triangles may be wound either way: orient each face by its first vertex's source normal.
    const s = f[0] * N[I[t] * 3] + f[1] * N[I[t] * 3 + 1] + f[2] * N[I[t] * 3 + 2] < 0 ? -1 : 1;
    for (const p of [a, b, c]) for (let k = 0; k < 3; k++) face[p * 3 + k] += s * f[k];
  }
  for (let v = 0; v < n; v++) {
    const i = at[v], s = strength[i];
    for (let c = 0; c < 3; c++) P[v * 3 + c] = xyz[i * 3 + c];
    if (!s) continue;
    const l = Math.hypot(face[i * 3], face[i * 3 + 1], face[i * 3 + 2]) || 1;
    const mix = [0, 1, 2].map((c) => (1 - s) * N[v * 3 + c] + s * face[i * 3 + c] / l);
    const ml = Math.hypot(...mix) || 1;
    for (let c = 0; c < 3; c++) N[v * 3 + c] = mix[c] / ml;
  }
}

/**
 * The lips go by height, not nearness: the upper incisors overlap the lower lip. The source lip is one
 * thin surface running across the closed mouth, so it is cut along the mouth slit, triangles split exactly
 * on the cut line: below it the lip follows the jaw, above it stays. Towards the corners the cut gives way
 * to a smooth blend by height, so the corners stretch without tearing. Each cut edge gets a rounded rim
 * (a tube tapering to nothing at the corners) so the open lips look solid instead of showing their inside;
 * the rim is schematic, as the source has no inner lip. The corners are smoothed first (smoothLipCorners).
 * Rewrites the lip in `g` and returns the weights.
 */
function lipWeights(g) {
  const P = g.pos, N = g.nrm, I = g.idx;
  let half = 0;
  for (let i = 0; i < P.length; i += 3) half = Math.max(half, Math.abs(P[i]));
  smoothLipCorners(g, half);
  // The slit is the height of the corners (the outer tenth of the lip's width).
  let sum = 0, n = 0;
  for (let i = 0; i < P.length; i += 3) if (Math.abs(P[i]) > half * 0.9) { sum += P[i + 1]; n++; }
  const slit = sum / n;
  const BLEND = 0.35; // cm above and below the slit over which a corner stretches
  const smooth = (y) => { const t = Math.min(Math.max((slit + BLEND - y) / (2 * BLEND), 0), 1); return t * t * (3 - 2 * t); };
  const corner = (x) => Math.min(Math.max((Math.abs(x) / half - 0.7) / 0.25, 0), 1); // 0 mid-lip, 1 at the corners
  const weight = (x, y, lower) => (1 - corner(x)) * (lower ? 1 : 0) + corner(x) * smooth(y);

  const pos = [], nrm = [], w = [], cut = [];
  const emit = (p, nm, lower) => { pos.push(...p); nrm.push(...nm); w.push(weight(p[0], p[1], lower)); };
  const vert = (v) => [[P[v * 3], P[v * 3 + 1], P[v * 3 + 2]], [N[v * 3], N[v * 3 + 1], N[v * 3 + 2]]];
  const lerp = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
  for (let t = 0; t < I.length; t += 3) {
    const vs = [0, 1, 2].map((k) => vert(I[t + k]));
    // Split the triangle where it crosses the slit: each piece is a polygon on one side.
    const sides = [[], []]; // [upper, lower]
    for (let k = 0; k < 3; k++) {
      const [p, nm] = vs[k], [q, qn] = vs[(k + 1) % 3];
      const fp = p[1] - slit, fq = q[1] - slit;
      sides[fp < 0 ? 1 : 0].push([p, nm]);
      if ((fp < 0) !== (fq < 0)) {
        const s = fp / (fp - fq), x = [lerp(p, q, s), lerp(nm, qn, s)];
        x[0][1] = slit;
        sides[0].push(x); sides[1].push(x);
        cut.push(x[0]);
      }
    }
    for (const [lower, poly] of sides.entries()) for (let k = 1; k + 1 < poly.length; k++) {
      for (const [p, nm] of [poly[0], poly[k], poly[k + 1]]) emit(p, nm, lower === 1);
    }
  }

  // The front edge of the cut, smoothed: per slice of width, the front-most cut point.
  const SLICES = 48, edge = [];
  for (let s = 0; s < SLICES; s++) {
    const x0 = -half + (2 * half * s) / SLICES, x1 = x0 + (2 * half) / SLICES;
    const inSlice = cut.filter((p) => p[0] >= x0 && p[0] < x1 && corner(p[0]) < 1);
    if (inSlice.length) edge.push(inSlice.reduce((a, b) => (b[2] > a[2] ? b : a)));
  }
  for (let pass = 0; pass < 2; pass++) for (let k = 1; k + 1 < edge.length; k++) edge[k] = [edge[k][0], slit, (edge[k - 1][2] + 2 * edge[k][2] + edge[k + 1][2]) / 4];

  // A rim along that edge for each lip: a tube just behind the lip's surface, tangent to it at the front.
  const RADIUS = 0.12, RING = 12, skin = pos.length / 3, rim = [];
  for (const lower of [false, true]) {
    const base = pos.length / 3, rings = [];
    for (let k = 0; k < edge.length; k++) {
      const p = edge[k], r = RADIUS * (1 - corner(p[0]));
      const prev = edge[Math.max(k - 1, 0)], next = edge[Math.min(k + 1, edge.length - 1)];
      const tl = Math.hypot(next[0] - prev[0], next[2] - prev[2]) || 1;
      const tx = (next[0] - prev[0]) / tl, tz = (next[2] - prev[2]) / tl; // along the edge (horizontal)
      const bx = -tz, bz = tx; // horizontal, across the edge: towards the front
      const front = bz >= 0 ? 1 : -1;
      const centre = [p[0] - front * bx * r, slit + (lower ? -0.3 : 0.3) * r, p[2] - front * bz * r];
      const ring = [];
      for (let j = 0; j < RING; j++) {
        const a = (2 * Math.PI * j) / RING, ny = Math.cos(a), nh = Math.sin(a);
        const nm = [nh * bx * front, ny, nh * bz * front];
        emit(centre.map((c, i) => c + r * nm[i]), nm, lower);
        ring.push(base + rings.length * RING + j);
      }
      rings.push(ring);
    }
    for (let k = 0; k + 1 < rings.length; k++) for (let j = 0; j < RING; j++) {
      const a = rings[k][j], b = rings[k][(j + 1) % RING], c = rings[k + 1][j], d = rings[k + 1][(j + 1) % RING];
      rim.push(a, c, b, b, c, d);
    }
  }
  g.pos = Float32Array.from(pos); g.nrm = Float32Array.from(nrm);
  g.idx = Uint32Array.from([...Array.from({ length: skin }, (_, i) => i), ...rim]);
  return Float32Array.from(w);
}

/** Distance from a point to the nearest vertex of a set of position arrays, through a uniform grid (cm). */
function pointIndex(arrays, cell = 0.5) {
  const grid = new Map();
  const id = (i, j, k) => ((i + 512) * 1024 + (j + 512)) * 1024 + (k + 512);
  for (const pos of arrays) for (let v = 0; v < pos.length; v += 3) {
    const key = id(Math.floor(pos[v] / cell), Math.floor(pos[v + 1] / cell), Math.floor(pos[v + 2] / cell));
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(pos[v], pos[v + 1], pos[v + 2]);
  }
  return (x, y, z) => {
    const ci = Math.floor(x / cell), cj = Math.floor(y / cell), ck = Math.floor(z / cell);
    let best = Infinity; // squared
    // Search shells of cells outwards; stop once no farther shell can hold a nearer point.
    for (let r = 0; r < 200 && best > ((r - 1) * cell) ** 2; r++) {
      for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) for (let k = ck - r; k <= ck + r; k++) {
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj), Math.abs(k - ck)) !== r) continue;
        const pts = grid.get(id(i, j, k));
        if (pts) for (let p = 0; p < pts.length; p += 3) best = Math.min(best, (pts[p] - x) ** 2 + (pts[p + 1] - y) ** 2 + (pts[p + 2] - z) ** 2);
      }
    }
    return Math.sqrt(best);
  };
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

// The structure index lists every model a mesh is in, so it is written only by a full run.
if (!only) writeFileSync('src/content/structures.generated.json', JSON.stringify([...records.values()], null, 1) + '\n');
