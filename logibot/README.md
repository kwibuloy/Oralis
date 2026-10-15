# Oralis

A 3D atlas of the mouth for dental students. Pick a mode, turn the model, click any part, and read
what it is, what supplies it and why it matters in the clinic.

| Mode | Model | What you can do |
| --- | --- | --- |
| **General anatomy** | Head and neck from BodyParts3D: 25 bones, supra/infrahyoid muscles, tongue, soft palate and pharynx, salivary glands | Toggle layers, search, isolate a structure, read its nerve supply and clinical link |
| **Dental anatomy** | The 28 permanent teeth in their arches, gingiva, jaws as context | Switch FDI / Universal / Palmer numbering, show one arch, open the bite, read roots, crown form and eruption age |
| **Histology** | A tooth cut along its long axis in its socket, drawn in code | Enamel, dentin, pulp, cementum, PDL, alveolar bone and gingiva, each with composition, cells, features and a clinical link |

Every selection is in the URL (`#/dental/left-lower-first-secondary-molar-tooth`), so you can share or bookmark a structure.

## Run it

Node 20+.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # numbering, content coverage, routes
npm run build      # static site in dist/
```

## Deploy on Vercel

Import the repository, set **Root Directory** to `logibot`, and keep the detected Vite preset
(`vercel.json` pins the build command, output directory and asset caching). There is no backend.

## How it is built

- **React 18 + TypeScript + Vite.** The landing page loads without three.js; the atlas chunk loads on demand.
- **`src/viewer/Viewer.ts`** is a small framework-free three.js layer: picking with tap-vs-drag detection,
  hover, isolation, faded context groups, offsets (open bite) and camera framing. It renders on demand.
- **`scripts/extract-head.mjs`** cuts the dental subset out of BodyParts3D: 109 meshes, about 193k triangles,
  0.78 MB Draco-compressed.
- **`src/viewer/histologyModel.ts`** builds the tooth section by revolving each tissue's profile and capping the cut face.
- **`src/content/`** holds all study text and the tooth-numbering logic, covered by `content.test.ts`.

## Known gaps

The source anatomy has no muscles of mastication, trigeminal nerve branches, facial or maxillary arteries,
parotid gland, third molars or primary teeth. They are named as gaps rather than drawn from guesswork.
The histology section is schematic; proportions are stylised for teaching.

## Credits and licences

- Code: MIT.
- 3D anatomy: [BodyParts3D 4.0](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/), Database Center for Life Science,
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), via the packaging in
  [ashemag/human-atlas](https://github.com/ashemag/human-atlas). Reduced to the head and neck.
- Historical plates: Wellcome Collection and Internet Archive via Wikimedia Commons; each is credited on the page.

For education only. Not for diagnosis or treatment planning.
