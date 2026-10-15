# Oralis

A 3D atlas of the mouth for dental students. Pick a mode, turn its model, click any part to read
what it is, what supplies it and why it matters in the clinic.

| Mode | Model (`public/models/`) | What you can do |
| --- | --- | --- |
| **General anatomy** | `general.glb`: head and neck from BodyParts3D (109 meshes, 0.8 MB) | Toggle 12 layers, use Skeleton/Soft-tissue presets, isolate a structure, read nerve supply and clinical links |
| **Dental anatomy** | `dental.glb`: 28 permanent teeth, gingiva, maxillae and mandible (35 meshes, 0.2 MB) | Switch FDI / Universal / Palmer numbering, show one arch, open the bite, read roots, crown form and eruption age |
| **Histology** | `histology.glb`: a tooth in its socket cut along its long axis, modelled in Blender (9 tissues, 0.25 MB) | Enamel, dentin, pulp, neurovascular bundle, cementum, PDL, lamina dura, alveolar bone and gingiva, each with composition, cells, features and a clinical link |

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

Import the repository, set **Root Directory** to `logibot`, and keep the detected Vite preset
(`vercel.json` pins the build command, output directory and model caching). There is no backend.

## Rebuilding the models

```bash
# General and Dental, from BodyParts3D as packaged by human-atlas
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

BodyParts3D has no muscles of mastication, trigeminal nerve branches, facial or maxillary arteries,
parotid gland, third molars or primary teeth. The histology model is schematic; proportions are
stylised for teaching.

## Credits and licences

- Code: MIT.
- General and Dental anatomy: [BodyParts3D 4.0](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/),
  Database Center for Life Science, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), via
  [ashemag/human-atlas](https://github.com/ashemag/human-atlas), which also inspired the interface.
- Histology model: authored for Oralis in Blender.

For education only. Not for diagnosis or treatment planning.
