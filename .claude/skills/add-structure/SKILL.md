---
name: add-structure
description: Add or change anatomical structures and their study notes in Oralis — pull more BodyParts3D meshes into the General or Dental model, regroup them, or write notes for structures. Use when the user asks to add a bone, muscle, gland, nerve or vessel, to change which layers exist, or when a content test says a note is missing.
---

# Adding structures to Oralis

Everything lives at the repo root. The General and Oral anatomy (`dental`) models are generated from BodyParts3D; the notes are hand-written. General already contains every BodyParts3D mesh, so new work there is regrouping and notes, not adding meshes.

## 1. Is it in the source data?

BodyParts3D 4.0 (via human-atlas) has no masseter, temporalis, pterygoids, buccinator, orbicularis oris, trigeminal branches, facial/maxillary arteries, parotid, third molars or primary teeth. Check first:

```bash
git clone --depth 1 https://github.com/ashemag/human-atlas ../human-atlas   # once, outside the repo
node -e "const a=require('../human-atlas/public/models/atlas.json');console.log(a.parts.filter(p=>/NAME/i.test(p.name)).map(p=>p.name+' @'+p.system))"
```

If it is missing, say so to the user. It can be authored in Blender instead (`blender-model` skill), clearly labelled as schematic.

## 2. Pull it into the models

Edit `GROUPS` (first matching regex wins; side prefixes are stripped) and, if needed, `MODELS` (which groups each mode's GLB gets) in `scripts/extract-bodyparts.mjs`, then:

```bash
node scripts/extract-bodyparts.mjs ../human-atlas
```

This rewrites `public/models/general.glb`, `public/models/dental.glb` and `src/content/structures.generated.json`. A hook blocks hand edits to all three.

**Accuracy over file size.** Never simplify, decimate or drop meshes to make a GLB smaller if it costs anatomical accuracy. Ship the source geometry at full detail and accept a larger download (General is ~5 MB). Draco compression is fine because it is lossless enough to preserve shape. If load time becomes a real problem, raise it with the user rather than reducing detail.

## 3. Describe it

- New group → `{ label, blurb }` in `GROUPS` and its body system in `GROUP_SYSTEM` (`src/content/anatomy.ts`), a colour in `GROUP_COLOR` (`src/content/structures.ts`), and its default visibility in `src/content/modes.ts`. In the extractor, unmatched meshes fall back to a group per source system (`BY_SYSTEM`).
- New structure → a note keyed by the source name without "left"/"right" (anywhere in the name), lower-cased: `summary`, plus `supply` and `clinical` where they matter to a dentist. Head and neck notes go in `NOTES` (`anatomy.ts`), skeleton and muscles in `body.ts`, organs, brain and vessels in `systems.ts`. Repeated structures can share a family note (regex; first match wins, so put specific patterns first). Never add a catch-all.
- Teeth get facts from `MORPHOLOGY` in `src/content/teeth.ts`, keyed `upper-6`, `lower-3`, etc.

## 4. Verify

```bash
npm test          # fails if a structure lacks a note/group or a GLB lacks a mesh
npm run typecheck
```

Then the `anatomy-reviewer` agent for the notes and the `visual-check` skill for the result.
