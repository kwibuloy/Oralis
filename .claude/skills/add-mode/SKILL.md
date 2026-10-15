---
name: add-mode
description: Add a new study mode to Oralis (for example embryology, oral pathology, primary dentition or radiographic anatomy), with its own 3D model, layers, notes and route. Use when the user wants another subject next to General anatomy, Dental anatomy and Histology.
---

# Adding a mode

A mode is data plus, at most, one new model. Follow the existing three before inventing structure.

1. **Decide the model.**
   - Reuse `head` (BodyParts3D) when the subject is a different view of the same anatomy; set `defaultVisible` and `context` groups.
   - Build a procedural `THREE.Group` like `src/viewer/histologyModel.ts` when no dataset exists. Every pickable mesh needs `userData.key`.
   - A supplied GLB goes in `public/models/` (Draco-compressed, see the `draco` command of `@gltf-transform/cli`), loaded with `Viewer.loadGLB`.
2. **Register it** in `src/content/modes.ts`: `id`, `name`, `short` (phone tab label), `lead`, `model`, `defaultVisible`, optional `context`, a `plate` from `src/content/plates.ts`, and a `covers` list. Add a new `model` value to the union and handle it in the load effect in `src/atlas/Atlas.tsx`.
3. **Content.** Put notes in a new `src/content/<mode>.ts` with the same shape as `histology.ts`, and teach `InfoCard.tsx`, `StructureList.tsx` and `describe.ts` to read it.
4. **Mode-specific controls** belong in the `atlas__controls` block in `Atlas.tsx`, gated on `mode.id`.
5. **Tests.** Extend `src/content/content.test.ts` so every pickable key has content, and add the route to the route test.
6. **Landing.** The slip in `src/landing/Landing.tsx` and `ModeShowcase.tsx` read `MODES`; add a slip block with real counts.
7. Verify with `npm test`, `npm run typecheck`, the `visual-check` skill and the `anatomy-reviewer` agent.
