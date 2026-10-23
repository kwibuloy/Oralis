# Oralis — handoff (2026-10-18)

## What it is
A white-theme, phones-first 3D atlas for dental students (React 18 + TypeScript + three.js, Vite,
static deploy on Vercel from the repo root). See `CLAUDE.md` for commands, file map and rules.

## Current state
- **11 subjects** in a grouped picker (`src/content/subjects.ts`). Five have models and open the atlas:
  - **General anatomy** — full BodyParts3D body (~2,234 parts) with system filters.
  - **Physiology** — functions (blood flow, nerves, breathing, digestion…) with schematic flow pulses baked as `_FLOW`.
  - **Oral anatomy** — skull, oral cavity, teeth and a generated carving molar with Wheeler measurements.
  - **General & oral histology** — Blender-authored tissue blocks.
  - **Cariology** (newest) — sectioned molar with staged lesions (pit & fissure, smooth surface, root),
    ICDAS/ICCMS codes, caries sites on the arch by G.V. Black class, and a biofilm/pH process timeline.
- The other six (Occlusion, Biochem, Organic chem, Genetics, Microbiology, Pathology) show the "model in progress" card.
- **Performance work landed:** BatchedMesh batching (draw calls 4,460 → 2 in General), async shader compile,
  `place()` only touches moved parts, faster picking; post-load freeze 8.2 s → 0.7 s. Numbers are in `portfolio-bullets.md`.
- **Mobile UX:** tap flies the camera to the part; detail cards open as a peek at ≤860px (`scripts/touch-check.mjs`).

## Where we left off
Last commits (2026-10-17) were Cariology polish:
1. `8d61ac3` — solid closed enamel regions again, lobed/undercut site cavities with stain and chalky edges,
   switching sugar pattern resets the timeline, no per-frame redraw on timelines without flow.
2. `076fba5` — lesion zones grow slightly into neighbours to close hairline slits; layered depth offsets
   (150 steps each) stop white flicker on overlapping cut faces at grazing angles.

`cariology.glb` grew 18 MB → 30.6 MB over these two commits. That's accepted (accuracy over size), but watch load time on phones.

## Uncommitted in the working tree
- `CLAUDE.md` shows as modified (likely only line endings — `git diff` shows no content change).
- `OralisVault/` — an untracked Obsidian vault (`Untitled.base`, `Untitled.canvas`). Decide whether to commit it or add it to `.gitignore`.
- Loose logs at the root (`build-cario.log`, `extract.log`) — not tracked; safe to delete or ignore.

## Suggested next steps
- Check Cariology zoomed in on a phone (390/768) for any leftover slits, flicker or grain, using the `visual-check` skill.
- Measure Cariology load time and memory on a mid-range phone now that the GLB is ~30 MB.
- Next subject to model: **Oral physiology & occlusion** (arches opening and closing, contacts, TMJ) via the `add-mode` skill.
- Run `anatomy-reviewer` over `src/content/cariology.ts` if it hasn't had an accuracy review yet.
- Keep `portfolio-bullets.md` updated with measured numbers after each fix.

## Reminders
- Generated files (`public/models/*.glb`, `structures.generated.json`, `models-src/*.blend`) come from scripts; a hook blocks hand edits.
- Order for Cariology: `node scripts/build-cariology.mjs`, then `node scripts/extract-bodyparts.mjs <human-atlas checkout>`.
- Run `npm run typecheck` and `npm test` before committing. Look at screenshots before claiming any UI or 3D fix is done.
