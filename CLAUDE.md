# Oralis

A 3D atlas of the mouth for dental students: General anatomy, Dental anatomy and Histology modes,
each with a clickable model and study notes. React 18 + TypeScript + three.js, built with Vite,
deployed as a static site on Vercel. The app lives in `logibot/` (folder name kept from the old
LogiBot triage project; git history has it).

This file points; it does not document. Read the files it names.

## Commands (run in `logibot/`)

| Task | Command |
| --- | --- |
| Dev server (:5173) | `npm run dev` (or the `logibot` entry in `.claude/launch.json`) |
| Typecheck | `npm run typecheck` |
| Tests | `npm test` |
| Production build | `npm run build` → `dist/` |
| Screenshots | `node scripts/shoot.mjs --widths 1440,390 home dental histology/enamel` |
| Design gate (repo root) | `node .claude/skills/taste-skill/scripts/lint.mjs logibot/src`, then `inspect.mjs http://localhost:5173/` |
| Rebuild head model | `node scripts/extract-head.mjs <human-atlas checkout>` |

## Where things are

| Concern | Start here |
| --- | --- |
| Routes (`#/`, `#/<mode>/<key>`) | `logibot/src/lib/route.ts`, `logibot/src/App.tsx` |
| Mode definitions | `logibot/src/content/modes.ts` |
| Structure index, colours | `logibot/src/content/structures.ts` (reads `structures.generated.json`) |
| Anatomy notes, layer groups | `logibot/src/content/anatomy.ts` |
| Tooth numbering + morphology | `logibot/src/content/teeth.ts` |
| Histology tissues | `logibot/src/content/histology.ts` |
| Product name, credits | `logibot/src/content/site.ts`, `logibot/src/content/plates.ts` |
| Atlas screen (state, panels) | `logibot/src/atlas/Atlas.tsx` and siblings |
| 3D viewer (framework-free) | `logibot/src/viewer/Viewer.ts` |
| Procedural tooth section | `logibot/src/viewer/histologyModel.ts` |
| Landing page | `logibot/src/landing/` |
| Design tokens | `logibot/src/styles/base.css` |
| Content tests | `logibot/src/content/content.test.ts` |
| Deploy config | `logibot/vercel.json` (Vercel root directory: `logibot`) |

## Rules that are not obvious from the code

- **Generated files are off limits:** `logibot/public/models/head.glb` and
  `logibot/src/content/structures.generated.json` come from `scripts/extract-head.mjs`.
  A PreToolUse hook blocks edits. Change the script's `GROUPS` and re-run it.
- **The Viewer never imports React or content.** React owns state; the Viewer takes keys,
  groups and colours. Keep that boundary.
- **Don't invent anatomy.** BodyParts3D lacks the muscles of mastication, trigeminal
  branches, facial/maxillary arteries, parotid, third molars and primary teeth. Name gaps;
  never model them by guesswork.
- **Left/right are the patient's,** as in the source names; FDI quadrants follow from that.
- **Every structure needs a note.** `content.test.ts` fails otherwise.
- **Design direction is fixed:** taste-skill "split stage" (warm black, one gold accent,
  Boska, square corners). Use tokens from `base.css`, never raw colours in components.
  The dealt sheet is in `.taste-skill/direction.json` (git-ignored; reprint with
  `node .claude/skills/taste-skill/scripts/draw.mjs --show`).
- **Every picture is credited** in the landing footer; licences are in `plates.ts` and `site.ts`.
- **Look before claiming a UI or 3D fix:** shoot and read the screenshots (`visual-check` skill).
  In dev, `window.__viewer` exposes the live viewer.
- **Windows + Git Bash:** route arguments starting with `/` or `#/` get mangled, which is why
  `shoot.mjs` takes `dental`, not `#/dental`.

## Claude tooling in this repo

| Kind | Name | Use it for |
| --- | --- | --- |
| Skill | `taste-skill`, `redesign-skill` | Any visual design work (vendored; see `.claude/skills/VENDORED.md`) |
| Skill | `visual-check` | Screenshot and inspect after UI/3D changes |
| Skill | `add-structure` | New meshes, groups or notes |
| Skill | `add-mode` | A new study mode |
| Agent | `anatomy-reviewer` | Accuracy review of anything in `src/content/` |
| Agent | `viewer-engineer` | three.js / Viewer / histology model work |
| Agent | `ui-critic` | Visual critique at 1440/768/390 before committing |
| Hook | `.claude/hooks/guard-generated.mjs` | Blocks edits to generated files |
| Hook | `.claude/hooks/check-after-edit.mjs` | Typecheck (+ content tests) after TS edits in `logibot/` |

## Sources

- 3D geometry: BodyParts3D 4.0 (DBCLS, CC BY 4.0), packaged by
  https://github.com/ashemag/human-atlas, which is also the interaction reference.
- Plates: Wellcome Collection / Internet Archive via Wikimedia Commons (see `plates.ts`).
