# Oralis

A 3D atlas for dental students. Pick a subject, turn its model, click any part to read what it
is, what supplies it and why it matters in the clinic.

Twelve subjects are planned, grouped in the subject picker: Anatomy (General anatomy, Oral anatomy,
Anatomy & physiology), Physiology (General physiology, Oral physiology & occlusion), Chemistry &
genetics (Biochemistry, Organic chemistry, Genetics), Micro, histo & path (Microbiology, General &
oral histology, Pathology) and Dental (Cariology). These have models today:

| Subject | Model (`public/models/`) | What you can do |
| --- | --- | --- |
| **General anatomy** | `general.glb`: every BodyParts3D mesh at full detail (2,234 meshes, 10.4 MB) | Filter by system (Skeleton, Muscles, Nerves, Vessels, Organs), toggle 37 layers, isolate a structure, read nerve supply and clinical links |
| **Oral anatomy** | `dental.glb`: 28 permanent teeth, gingiva, maxillae and mandible (35 meshes, 0.2 MB) | Switch FDI / Universal / Palmer numbering, show one arch, open the bite, read roots, crown form and eruption age |
| **General & oral histology** | `histology.glb`: a tooth in its socket cut along its long axis, modelled in Blender (9 tissues, 0.25 MB) | Enamel, dentin, pulp, neurovascular bundle, cementum, PDL, lamina dura, alveolar bone and gingiva, each with composition, cells, features and a clinical link |

The other subjects show what their model will contain until it is built.

Every mode has search (press `/`), front/side/back/top views, auto-rotate, isolation, and an
**explode** slider that first spreads the parts and then lays every visible piece out side by side.
Selections live in the URL (`#/dental/left-lower-first-secondary-molar-tooth`), so they can be shared.

## Run it

Node 20+.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # numbering, content coverage, GLB contents, routes
npm run build      # static site in dist/
```

## Deploy on Vercel

Import the repository, leave **Root Directory** at the repo root, and keep the detected Vite preset
(`vercel.json` pins the build command, output directory and model caching). There is no backend.

## Rebuilding the models

```bash
# General and Oral anatomy, from BodyParts3D as packaged by human-atlas
git clone --depth 1 https://github.com/ashemag/human-atlas ../human-atlas
node scripts/extract-bodyparts.mjs ../human-atlas

# Histology, in headless Blender 4.x (also saves models-src/histology.blend for editing)
blender -b --factory-startup -P scripts/blender/build_histology.py -- public/models/histology.glb models-src/histology.blend
```

## How it is built

- **React 18 + TypeScript + Vite.** three.js and gsap load with the atlas chunk.
- **`src/viewer/Viewer.ts`** is a framework-free three.js layer: GLB + Draco loading, tap-vs-drag
  picking, hover, isolation, faded context groups, view presets, the explode/inventory layout and
  on-demand rendering.
- **`src/content/`** holds all study text and the tooth-numbering logic; `content.test.ts` checks it
  against the GLBs.

## Known gaps

BodyParts3D has no muscles of mastication, maxillary or mandibular nerves, facial nerve or lower
cranial nerves, external carotid artery or its branches, parotid gland, lung tissue, third molars or
primary teeth. The histology model is schematic; proportions are
stylised for teaching.

## Credits and licences

- Code: MIT.
- General and Oral anatomy: [BodyParts3D 4.0](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/),
  Database Center for Life Science, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), via
  [ashemag/human-atlas](https://github.com/ashemag/human-atlas), which also inspired the interface.
- Histology model: authored for Oralis in Blender.

For education only. Not for diagnosis or treatment planning.
