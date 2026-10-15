// Build public/models/head.glb and src/content/structures.generated.json from the
// BodyParts3D 4.0 geometry packaged by https://github.com/ashemag/human-atlas (CC BY 4.0).
//
//   git clone --depth 1 https://github.com/ashemag/human-atlas /tmp/human-atlas
//   node scripts/extract-head.mjs /tmp/human-atlas
//
// Only the head-and-neck structures a dental curriculum uses are kept (see GROUPS).
import { Document, NodeIO } from '@gltf-transform/core';
import { KHRDracoMeshCompression } from '@gltf-transform/extensions';
import { weld } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';

const src = process.argv[2];
if (!src) throw new Error('Usage: node scripts/extract-head.mjs <path to human-atlas checkout>');
const atlas = JSON.parse(readFileSync(join(src, 'public/models/atlas.json'), 'utf8'));

/** First matching group wins. Order matters: teeth before bones. */
const GROUPS = [
  ['teeth', /secondary .*tooth$/i],
  ['gingiva', /^gingiva of/i],
  ['mandible', /^mandible$/i],
  ['maxilla', /(^|\s)maxilla$|palatine bone/i],
  ['skull', /(zygomatic|temporal|sphenoid|frontal|parietal|occipital) bone$|^ethmoid$|^vomer$|nasal bone$|lacrimal bone$|inferior nasal concha$/i],
  ['neck-bones', /^(hyoid bone|atlas|axis)$/i],
  ['suprahyoid', /(digastric|mylohyoid|geniohyoid|stylohyoid)$/i],
  ['infrahyoid', /(omohyoid|sternohyoid|thyrohyoid|platysma|sternocleidomastoid)$/i],
  ['tongue', /^tongue$|genioglossus|hyoglossus/i],
  ['palate-pharynx', /veli palatini|uvular muscle|pharyngeal constrictor|palatopharyngeus|salpingopharyngeus|stylopharyngeus|pterygomandibular raphe|stylohyoid ligament|^epiglottis$/i],
  ['glands', /(sublingual|submandibular) gland$/i],
  ['lips', /^lip$/i],
];
const groupOf = (name) => GROUPS.find(([, re]) => re.test(name.replace(/^(left|right) /i, '')))?.[0];

const chunks = atlas.chunks.map((c) => {
  const raw = readFileSync(join(src, 'public', c.gzip));
  return gunzipSync(raw).buffer;
});

const picked = atlas.parts
  .map((p) => ({ ...p, group: groupOf(p.name) }))
  .filter((p) => p.group && p.bounds[0][1] > 1.3);

// Centre the subset on the origin, in centimetres so camera numbers stay readable.
const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
for (const p of picked) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p.bounds[0][k]); max[k] = Math.max(max[k], p.bounds[1][k]); }
const centre = min.map((v, k) => (v + max[k]) / 2);
const SCALE = 100;

const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene('head');
const records = [];
const seen = new Map();

for (const p of picked) {
  const chunk = chunks[p.chunk];
  const pos = new Float32Array(chunk, p.positions, p.vertexCount * 3).slice();
  for (let i = 0; i < pos.length; i++) pos[i] = (pos[i] - centre[i % 3]) * SCALE;
  const n16 = new Int16Array(chunk, p.normals, p.vertexCount * 3);
  const nrm = Float32Array.from(n16, (v) => Math.max(v / 32767, -1));
  const idx = new Uint32Array(chunk, p.indices, p.indexCount).slice();

  const prim = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(pos).setBuffer(buffer))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(nrm).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(idx).setBuffer(buffer));
  const mesh = doc.createMesh(p.id).addPrimitive(prim);
  scene.addChild(doc.createNode(p.id).setMesh(mesh));

  // Some structures are split across several source meshes; give each a stable key.
  const key = p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const n = (seen.get(key) ?? 0) + 1;
  seen.set(key, n);
  records.push({ id: p.id, key, name: p.name, group: p.group, fma: p.conceptId, part: n });
}

await doc.transform(weld());
doc.createExtension(KHRDracoMeshCompression).setRequired(true).setEncoderOptions({ method: KHRDracoMeshCompression.EncoderMethod.EDGEBREAKER });
const io = new NodeIO().registerExtensions([KHRDracoMeshCompression]).registerDependencies({
  'draco3d.encoder': await draco3d.createEncoderModule(),
  'draco3d.decoder': await draco3d.createDecoderModule(),
});
const glb = await io.writeBinary(doc);
writeFileSync('public/models/head.glb', glb);
writeFileSync('src/content/structures.generated.json', JSON.stringify(records, null, 1) + '\n');

const tris = picked.reduce((t, p) => t + p.indexCount / 3, 0);
const counts = Object.fromEntries(GROUPS.map(([g]) => [g, records.filter((r) => r.group === g).length]));
console.log(`head.glb: ${picked.length} meshes, ${tris} triangles, ${(glb.byteLength / 1024 / 1024).toFixed(2)} MB`);
console.log(counts);
