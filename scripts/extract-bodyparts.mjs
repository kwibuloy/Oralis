// Build the BodyParts3D-based mode models and src/content/structures.generated.json from the
// BodyParts3D 4.0 geometry packaged by https://github.com/ashemag/human-atlas (CC BY 4.0).
//
//   git clone --depth 1 https://github.com/ashemag/human-atlas ../human-atlas
//   node scripts/extract-bodyparts.mjs ../human-atlas
//
// Run scripts/build-carving-tooth.mjs first: the Oral anatomy model includes its carving molar.
// Writes public/models/general.glb (every BodyParts3D mesh), public/models/physiology.glb (only what the
// Physiology functions show, plus the skeleton for orientation, with per-vertex flow distances) and public/models/dental.glb (dentition and
// jaws). The histology model is authored in Blender instead: scripts/blender/build_histology.py.
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
    return { id: p.id, name: unsided(p.name).toLowerCase(), group: p.group, system: p.system, pos, nrm, idx };
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
