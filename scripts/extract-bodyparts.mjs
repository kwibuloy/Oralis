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
// sites carved into their teeth, plus the authored parts), and src/content/cariology-sites.generated.json.
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
  const CHALK = lin('#fdfbf3'), WALL = lin('#8e5f2b'), FLOOR = lin('#4a2c14'), STAIN = lin('#2b1a0d'), LEATHER = lin('#b98b4d'), LEATHER_DEEP = lin('#7a5128');
  const SHADOW = lin('#cbbfa9'), SHADOW_DEEP = lin('#86735d'), AMALGAM = lin('#8d9299'), AMALGAM_DARK = lin('#646970');
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const GLINT = lin('#c99a55'), STAINB = lin('#6a4220');
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
      return (best - 1 - 0.22 * fbm(p, 26, 3, seed) - 0.07 * fbm(p, 75, 3, seed + 2)) * R - 0.005 * fbm(p, 55, 2, seed + 5);
    };
    // Distance outside the cavity's outline along the surface, for the stain and the halo (≈ 0 at the rim).
    s.rim = (p) => {
      const d = sub(p, c), du = dot(d, u), dw = dot(d, w);
      let best = Infinity;
      for (const [ou, ow, rs] of s.lobes) best = Math.min(best, Math.hypot((du - ou) / (s.ru * rs), (dw - ow) / (s.rv * rs)));
      return best * (1 + 0.22 * fbm(p, 26, 3, seed)) - 1;
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
    const toothF = (p, base) => {
      let v = base;
      for (const s of sites) v = Math.max(v, -s.cavity(p));
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
      const col = new Float32Array(positions.length), owner = new Int16Array(nv).fill(-1);
      for (let v = 0; v < nv; v++) {
        const p = [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]];
        let c = ENAMEL;
        if (name === 'filling') { c = mix(AMALGAM, AMALGAM_DARK, (fbm(p, 60, 2, 9) + 1) * 0.3); owner[v] = SITES.indexOf(restoration); col.set(c, v * 3); continue; }
        const depth = -sdf.sample(p); // how far inside the scanned surface: > 0 on a cavity wall
        for (const s of sites) {
          const k = (fbm(p, 90, 2, SITES.indexOf(s) * 3.1) + 1) / 2; // mottling
          const rim = s.rim(p);
          if (s.look === 'restoration') {
            if (depth > 0.004 && Math.abs(s.cavity(p)) < 0.03) { c = mix(LEATHER, STAIN, 0.6 + 0.4 * k); owner[v] = SITES.indexOf(s); }
            else if (rim > -0.1 && rim < s.halo) { c = mix(mix(CHALK, LEATHER, 0.2), ENAMEL, Math.max(0, rim) / s.halo); owner[v] = SITES.indexOf(s); }
            continue;
          }
          const reach = Math.max(s.ru, s.rv);
          // A cavity wall lies on the cavity's own surface; intact enamel only grazes depth 0 and must not match.
          if (depth > 0.004 && Math.abs(s.cavity(p)) < 0.03 && Math.hypot(...sub(p, s.c)) < reach * 1.6) {
            // How deep into the cavity, measured from the original surface along the lesion's normal.
            const tt = Math.min(1, Math.max(0, dot(sub(s.surface, p), s.nc) / s.depth) * 1.3) ** 0.6;
            const seed = SITES.indexOf(s) * 3.1;
            const n2 = (fbm(p, 220, 2, seed + 7) + 1) / 2, n3 = (fbm(p, 45, 3, seed + 3) + 1) / 2;
            c = s.look === 'shadow' ? mix(SHADOW, SHADOW_DEEP, tt * 0.9 + k * 0.2) : s.look === 'leather' ? mix(LEATHER, LEATHER_DEEP, tt * 0.8 + k * 0.25) : mix(WALL, FLOOR, tt * 0.9 + k * 0.25);
            // Patches of lighter and darker carious dentin, glossy amber glints near the rim, black pitting low down.
            c = mix(c, c.map((x) => x * 0.55), smooth(0.4, 0.7, n3) * 0.6);
            c = mix(c, GLINT, smooth(0.7, 0.9, n2) * 0.55 * (1 - tt));
            c = mix(c, STAIN, smooth(0.62, 0.85, n2) * (0.25 + 0.6 * tt));
            owner[v] = SITES.indexOf(s);
          } else if (rim > -0.15 && rim < s.halo * 1.5 && Math.hypot(...sub(p, s.c)) < reach * (2.2 + s.halo)
            // The outline is measured in the plane across the lesion's normal, so a point far along the normal
            // (round the tooth) can land inside it: keep the stain to the surface beside the cavity.
            && Math.abs(dot(sub(p, s.c), s.nc)) < s.depth + 0.08) {
            // Stain creeping into the enamel in irregular fingers, then the chalky edge of the lesion, then sound enamel.
            const seed = SITES.indexOf(s) * 3.1;
            const edge = Math.max(0, rim) / (s.halo * 1.5);
            const fingers = (fbm(p, 40, 3, seed + 11) + 1) / 2;
            const power = s.look === 'shadow' ? 0.25 : s.look === 'leather' ? 0.55 : 1;
            const stained = smooth(0.3, 0.8, 1.05 - edge * 1.15 + (fingers - 0.55) * 0.9) * power;
            const chalk = smooth(0.45, 0.8, edge) * (1 - smooth(0.85, 1, edge)) * 0.9;
            c = mix(ENAMEL, s.look === 'shadow' ? SHADOW : s.look === 'leather' ? mix(STAINB, LEATHER, 0.5) : mix(STAINB, STAIN, smooth(0.6, 1, stained) * 0.45), stained);
            c = mix(c, CHALK, chalk * (1 - stained));
            owner[v] = SITES.indexOf(s);
          }
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
      const groups = new Map();
      for (const tri of tris) {
        const o = tri.map((v) => owner[v]);
        const s = o.every((x) => x === o[0]) && o[0] >= 0 ? SITES[o[0]] : null;
        const part = name === 'filling' ? 'site-restoration' : s ? `site-${s.id}` : t.g.id;
        if (!groups.has(part)) groups.set(part, []);
        groups.get(part).push(...tri);
      }
      for (const [part, list] of groups) {
        const map = new Map(), P = [], NN = [], C = [], I = [];
        for (const v of list) {
          if (!map.has(v)) { map.set(v, P.length / 3); P.push(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]); NN.push(nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]); C.push(col[v * 3], col[v * 3 + 1], col[v * 3 + 2]); }
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
