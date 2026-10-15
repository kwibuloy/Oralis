// Build the BodyParts3D-based mode models and src/content/structures.generated.json from the
// BodyParts3D 4.0 geometry packaged by https://github.com/ashemag/human-atlas (CC BY 4.0).
//
//   git clone --depth 1 https://github.com/ashemag/human-atlas ../human-atlas
//   node scripts/extract-bodyparts.mjs ../human-atlas
//
// Writes public/models/general.glb (every BodyParts3D mesh) and public/models/dental.glb (dentition and
// jaws). The histology model is authored in Blender instead: scripts/blender/build_histology.py.
import { Document, NodeIO } from '@gltf-transform/core';
import { KHRDracoMeshCompression } from '@gltf-transform/extensions';
import { weld } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
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
const VESSEL = /arter|\bvein|\bvenous/i;
const VESSEL_GROUPS = new Set(['arteries', 'veins', 'cerebral-arteries']);
/** Anything no pattern claims still goes in, grouped by its source system: the General model has every mesh. */
const BY_SYSTEM = {
  arterial: 'body-arteries', venous: 'body-veins', cardiac: 'heart', digestive: 'digestive', respiratory: 'airways',
  urinary: 'urogenital', reproductive: 'urogenital', endocrine: 'endocrine', lymphatic: 'endocrine',
  integumentary: 'skin', sensory: 'senses', nervous: 'brain', connective: 'ligaments',
};
const groupOf = (p) => GROUPS.find(([g, re, o]) => re.test(unsided(p.name)) && (!o.hn || p.bounds[0][1] > 1.3)
  // Limb vessels share "of hand"/"of foot" names with the small muscles; only the vessel groups take them.
  && (VESSEL_GROUPS.has(g) || !VESSEL.test(p.name)))?.[0] ?? BY_SYSTEM[p.system];

const chunks = atlas.chunks.map((c) => {
  const raw = readFileSync(join(src, 'public', c.gzip));
  return gunzipSync(raw).buffer;
});

const picked = atlas.parts
  .map((p) => ({ ...p, group: groupOf(p) }))
  .filter((p) => p.group);

/** Which groups each mode model contains. */
const MODELS = {
  general: (g) => true,
  dental: (g) => ['teeth', 'gingiva', 'mandible', 'maxilla'].includes(g),
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
  for (const p of parts) {
    const chunk = chunks[p.chunk];
    const pos = new Float32Array(chunk, p.positions, p.vertexCount * 3).slice();
    for (let i = 0; i < pos.length; i++) pos[i] = (pos[i] - centre[i % 3]) * SCALE;
    const nrm = Float32Array.from(new Int16Array(chunk, p.normals, p.vertexCount * 3), (v) => Math.max(v / 32767, -1));
    const idx = new Uint32Array(chunk, p.indices, p.indexCount).slice();
    const prim = doc.createPrimitive()
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(pos).setBuffer(buffer))
      .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(nrm).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(idx).setBuffer(buffer));
    scene.addChild(doc.createNode(p.id).setMesh(doc.createMesh(p.id).addPrimitive(prim)));

    // Some structures are split across several source meshes; they share one key.
    const r = records.get(p.id) ?? { id: p.id, key: keyOf(p.name), name: p.name, group: p.group, fma: p.conceptId, models: [] };
    r.models.push(model);
    records.set(p.id, r);
  }
  await doc.transform(weld());
  doc.createExtension(KHRDracoMeshCompression).setRequired(true).setEncoderOptions({ method: KHRDracoMeshCompression.EncoderMethod.EDGEBREAKER });
  const glb = await io.writeBinary(doc);
  writeFileSync(`public/models/${model}.glb`, glb);
  const tris = doc.getRoot().listMeshes().reduce((t, m) => t + m.listPrimitives()[0].getIndices().getCount() / 3, 0);
  console.log(`${model}.glb: ${parts.length} meshes, ${tris} triangles, ${(glb.byteLength / 1024 / 1024).toFixed(2)} MB`);
}

writeFileSync('src/content/structures.generated.json', JSON.stringify([...records.values()], null, 1) + '\n');
