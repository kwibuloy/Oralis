# Oralis

A white-theme 3D atlas for dental students. Eleven subjects are listed in a grouped picker; the
ones with a model so far — General anatomy, Physiology, Oral anatomy, General & oral histology —
each load
their own GLB, and the rest show a "model in progress" card. Every part is clickable, with study
notes, layer toggles, views and an explode/inventory slider. React 18 + TypeScript + three.js,
Vite, static deploy on Vercel. The app lives at the repo root (it moved out of `logibot/`).

This file points; it does not document. Read the files it names.

## Commands (run at the repo root)

| Task | Command |
| --- | --- |
| Dev server (:5173) | `npm run dev` (or the `oralis` entry in `.claude/launch.json`) |
| Typecheck / tests | `npm run typecheck` · `npm test` |
| Production build | `npm run build` → `dist/` |
| Screenshots | `node scripts/shoot.mjs --widths 1440,390 general dental histology/enamel` |
| Carving tooth (run before extract) | `node scripts/build-carving-tooth.mjs` → `models-src/carving-molar.glb`, `src/content/carving.generated.json` |
| General, Physiology + Oral anatomy models | `node scripts/extract-bodyparts.mjs <human-atlas checkout>` |
| Histology model | `"/d/Blender/blender.exe" -b --factory-startup -P scripts/blender/build_histology.py -- public/models/histology.glb models-src/histology.blend` |

## Where things are

| Concern | Start here |
| --- | --- |
| Routes (`#/<subject>/<key>`, default General) | `src/lib/route.ts`, `src/App.tsx` |
| Subject list and picker groups | `src/content/subjects.ts`, `src/atlas/SubjectPicker.tsx`, `src/atlas/ComingSoon.tsx` |
| Modes with a model: URL, layers, presets/system chips | `src/content/modes.ts` |
| Structure index, colours | `src/content/structures.ts` (reads `structures.generated.json`) |
| Layer groups, body systems, head and neck notes | `src/content/anatomy.ts` |
| Whole-body notes (skeleton, muscles) / (organs, brain, vessels) | `src/content/body.ts`, `src/content/systems.ts` |
| Physiology functions: layers, descriptions, oxygenation, brain areas | `src/content/function.ts`, `src/atlas/FunctionCard.tsx`, `src/atlas/Timeline.tsx` |
| Flow distances baked into `physiology.glb` (`_FLOW` attribute) | `scripts/lib/flow.mjs`, `computeFlows` in `scripts/extract-bodyparts.mjs` |
| Tooth numbering + morphology | `src/content/teeth.ts` |
| Carving tooth (Oral anatomy): landmarks, notes, Wheeler measurements | `src/content/carving.ts`, `src/atlas/CarvingCards.tsx`; geometry from `scripts/build-carving-tooth.mjs` |
| Histology tissues | `src/content/histology.ts` |
| Atlas screen (state, cards) | `src/atlas/Atlas.tsx`, `DetailCard.tsx`, `Search.tsx`, `controls.tsx` |
| 3D viewer (framework-free) | `src/viewer/Viewer.ts` |
| Models and their sources | `public/models/*.glb`, `models-src/*.blend`, `scripts/` |
| Design tokens | `src/styles/base.css`, layout in `src/atlas/atlas.css` |
| Tests (numbering, content, GLB contents, routes) | `src/content/content.test.ts` |
| Deploy | `vercel.json` (Vercel root directory: the repo root) |

## Rules that are not obvious from the code

- **Generated files are off limits:** `public/models/*.glb`, `src/content/structures.generated.json`
  and `models-src/*.blend` come from scripts. A PreToolUse hook blocks edits; change the script.
- **One GLB per mode.** A mode never loads another mode's model. General includes every
  BodyParts3D mesh at full detail: **never simplify or drop meshes to save size** — accuracy wins. Node names in the GLB are the
  content keys (BodyParts3D mesh ids, or tissue keys for Blender models); tests enforce the match.
- **Flow animation is schematic.** Pulses run along real meshes in the right direction (arteries
  from the heart, veins to it, sensory nerves inwards), but speed is not physiological; the UI says so.
- **The Viewer never imports React or content.** React owns state; the Viewer takes keys,
  groups and colours. Part positions are `base + bite + explode`, computed only in `place()`.
- **Don't invent anatomy.** BodyParts3D lacks the muscles of mastication, trigeminal
  branches, facial/maxillary arteries, parotid, third molars and primary teeth. If something must
  exist anyway, author it in Blender and label it schematic.
- **Left/right are the patient's,** as in the source names; FDI quadrants follow from that.
- **Every structure needs a note.** `content.test.ts` fails otherwise. Repeated structures may
  share a family note (regex, first match wins — order matters), but never a catch-all.
- **Design reference is the Human Atlas UI** (white canvas, rounded white cards, soft shadows,
  toggles, F/S/B/T rail, explode card). The user chose it over the vendored taste-skill house
  rules, which now apply only to any future marketing page. Use tokens from `base.css`.
- **Look before claiming a UI or 3D fix:** shoot and read the screenshots (`visual-check` skill).
  In dev, `window.__viewer` exposes the live viewer for probes.
- **Windows + Git Bash:** route arguments starting with `/` or `#/` get mangled, which is why
  `shoot.mjs` takes `dental`, not `#/dental`. Blender lives at `D:\Blender\blender.exe`.

## Claude tooling in this repo

| Kind | Name | Use it for |
| --- | --- | --- |
| Skill | `visual-check` | Screenshot and inspect after UI/3D changes |
| Skill | `blender-model` | Author or fix a model in headless Blender |
| Skill | `add-structure` | New BodyParts3D meshes, groups or notes |
| Skill | `add-mode` | A new study mode with its own model |
| Skill | `taste-skill`, `redesign-skill` | Marketing-page design only (vendored; `.claude/skills/VENDORED.md`) |
| Agent | `anatomy-reviewer` | Accuracy review of `src/content/` and the histology model |
| Agent | `viewer-engineer` | three.js / Viewer work and 3D bugs |
| Agent | `ui-critic` | Visual critique at 1440/768/390 before committing |
| Hook | `.claude/hooks/guard-generated.mjs` | Blocks edits to generated models and data |
| Hook | `.claude/hooks/check-after-edit.mjs` | Typecheck (+ tests) after TS edits in `src/` or `scripts/` |

## Sources

- General and Dental geometry: BodyParts3D 4.0 (DBCLS, CC BY 4.0), packaged by
  https://github.com/ashemag/human-atlas, which is also the UI and interaction reference.
- Histology model: authored for Oralis in Blender (`scripts/blender/build_histology.py`).
