---
name: add-mode
description: Add a new study mode to Oralis (for example embryology, oral pathology, primary dentition or radiographic anatomy) with its own GLB model, layers, notes and route. Use when the user wants another subject next to the existing ones, or to give one of the planned subjects in `src/content/subjects.ts` its model.
---

# Adding a mode

Each mode loads exactly one GLB that holds what that subject needs. Follow the existing three (General anatomy, Oral anatomy = `dental`, General & oral histology = `histology`). Every subject is already listed in `src/content/subjects.ts`; until a subject has a mode in `modes.ts` it shows the coming-soon card.

1. **Make the model** (`public/models/<mode>.glb`):
   - A BodyParts3D subset → add an entry to `MODELS` in `scripts/extract-bodyparts.mjs` (see `add-structure`).
   - Anything else → a Blender script in `scripts/blender/` (see `blender-model`). Object names are the content keys.
   - A model the user supplies → Draco-compress it (`npx @gltf-transform/cli draco in.glb out.glb`), and rename nodes to stable keys.
2. **Register it** in `src/content/modes.ts` with the subject's id from `subjects.ts`: `id`, `name`, `short` (phone label), `lead`, `model` (URL), `source`, `defaultVisible`, optional `context` (faded groups), and `presets` or `systems: true` (system chips), and `functionView: true` for a function-only subject (function switches, description card and the shared `Timeline`, as in Physiology). Add its `STAGE_LABEL` in `Atlas.tsx`; the `ModeId` union in `modes.ts` gains the id.
3. **Content.** BodyParts3D structures use `anatomy.ts`. A Blender model gets its own `src/content/<mode>.ts` shaped like `histology.ts` (key, name, color, fields); teach `layersFor` and the GLB `describe` callback in `src/atlas/Atlas.tsx`, `DetailCard.tsx` and `describe.ts` to read it.
4. **Mode-only controls** go in the layers card in `Atlas.tsx`, gated on `modeId` (see the dental numbering and arch block). Any new description card wraps its content in `Sheet` (`src/atlas/Sheet.tsx`) so it follows the selection and card rules in the `visual-check` skill: a peek first on phones and portrait tablets, swipe up and down, and the part kept in view.
5. **Tests.** `content.test.ts` already checks every mode's GLB against its content; extend it for the new content file.
6. Verify with `npm test`, `npm run typecheck`, the `visual-check` skill, `node scripts/touch-check.mjs <mode> --key <a part>` (and `--tap` for any list that opens a card), and the `anatomy-reviewer` agent.
