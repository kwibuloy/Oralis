---
name: add-structure
description: Add or change anatomical structures and their study notes in Oralis — pull more BodyParts3D meshes into the head model, regroup them, or write notes for structures. Use when the user asks to add a bone, muscle, gland, nerve or vessel, to change which layers exist, or when a content test says a note is missing.
---

# Adding structures to Oralis

Everything lives in `logibot/`. The 3D head is generated; the notes are hand-written.

## 1. Is it in the source data?

BodyParts3D 4.0 (via human-atlas) has no masseter, temporalis, pterygoids, buccinator, orbicularis oris, trigeminal branches, facial/maxillary arteries, parotid, third molars or primary teeth. Check first:

```bash
git clone --depth 1 https://github.com/ashemag/human-atlas ../human-atlas   # once, outside the repo
node -e "const a=require('../human-atlas/public/models/atlas.json');console.log(a.parts.filter(p=>/NAME/i.test(p.name)).map(p=>p.name+' @'+p.system))"
```

If it is missing, say so to the user. Do not model anatomy by hand to fill the gap; a supplied GLB can be added as a separate model later.

## 2. Pull it into the model

Edit `GROUPS` in `scripts/extract-head.mjs` (first matching regex wins; side prefixes are stripped before matching), then run:

```bash
node scripts/extract-head.mjs ../human-atlas
```

This rewrites `public/models/head.glb` and `src/content/structures.generated.json`. A hook blocks hand edits to both. Keep the GLB under ~1.5 MB.

## 3. Describe it

- New group → add `{ label, blurb }` to `GROUPS` in `src/content/anatomy.ts` and a colour to `GROUP_COLOR` in `src/content/structures.ts`. Decide whether it is on by default in `src/content/modes.ts`.
- New structure → add a note to `NOTES` in `anatomy.ts`, keyed by the source name without "Left/Right", lower-cased. Write `summary`, plus `supply` and `clinical` where they matter to a dentist.
- Teeth get their facts from `MORPHOLOGY` in `src/content/teeth.ts`, keyed `upper-6`, `lower-3`, etc.

## 4. Verify

```bash
npm test          # content.test.ts fails if any structure lacks a note or group
npm run typecheck
```

Then have the `anatomy-reviewer` agent check the new notes, and look at the result with the `visual-check` skill.
