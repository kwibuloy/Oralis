# Oralis: portfolio bullets (XYZ format)

**Format:** *Accomplished [X] as measured by [Y], by doing [Z].* Each bullet leads with a verb, puts the
measurable result (Y) in bold, and ends with the how (Z). Pick 4 to 6 for a resume and keep the rest for
your portfolio page or interviews.

**Upkeep:** after every fix or feature, add or revise a bullet here, but only with measured, impressive
numbers (record the source in the table at the bottom).

**Project one-liner:** Oralis is a mobile-first 3D atlas for dental students: five study subjects
(General anatomy, Physiology, Oral anatomy, Histology, Cariology) in React, TypeScript and three.js,
deployed statically on Vercel.

---

## Performance and 3D engineering

- **Cut GPU draw calls by 99.96% in a 2,234-part anatomy model (4,460 → 2 per frame), and by 99.8% in
  Physiology (2,656 → 6)**, by batching parts with the same material into three.js `BatchedMesh` while
  keeping per-part visibility, colour, position, picking and selection glow, with separate see-through
  batches for faded context layers. The old build drew every see-through, double-sided part twice, which
  is why 2,234 parts cost 4,460 calls.
- **Took the main-thread cost of rendering a frame from about 233 ms to 0.85 ms in General anatomy (about
  270× less) and from about 303 ms to 0.68 ms in Physiology (about 445× less)**, by removing per-part draw
  submission; layer toggles on the CPU went from 155 ms to 5 ms (31×).
- **Halved the triangles processed per frame in General anatomy (4.46M → 2.23M) and cut them by a third in
  Physiology (1.92M → 1.27M)**, so a fully rendered frame, including software rasterisation, is **38% and
  29% faster** (1,418 → 873 ms and 628 → 448 ms), by drawing each part once as opaque instead of in
  two transparent passes.
- **Removed the post-load freeze: the longest main-thread block after a model opens fell from 8.2 s to 0.7 s
  in General anatomy (-92%) and from 9.0 s to 0.55 s in Physiology (-94%), and from 1.7 s to 0.8 s in
  Cariology (-52%)** (emulated 390 px phone at 3x pixel ratio, 4x CPU slowdown), by profiling the startup,
  finding that every part's position was rewritten into the batches on each of many layout calls, writing
  only the parts that moved, and compiling shaders in parallel before the first frame.
- **Made Cariology open without a stall: the worst frame after the model appears fell from 243–330 ms to
  28 ms, and every later lesion stage switches in 14 ms** (headed Chrome, laptop GPU), by uploading only
  the ~1.5M of 9.7M triangles a view shows, preparing the rest in idle time away from user input, and
  replacing one camera-bite tween per part (parts² position writes per frame) with a single tween.
- **Made tapping a part in Cariology smooth: the worst frame of the camera's fly-to fell from 118–542 ms
  to 7–21 ms (35–90 ms at 4x CPU throttle, from 350–1,132 ms), and the opening fly-in under throttle from
  ~550 ms to 21–28 ms**, by linking the selection shaders while loading and indexing every part with a BVH
  built in a Web Worker, so a tap tests a handful of triangles instead of hundreds of thousands.
- **Removed see-through holes when zooming into a tooth section** by letting the near clip plane follow
  the camera (it sat at 0.73 mm of tooth) and stopping wheel zoom short of the surface under the cursor,
  checked by a scripted zoom into 4 zone pins on every lesion type at two stages.
- **Cut hover and tap hit-testing time by 72% in General anatomy (5.3 → 1.5 ms) and by 80% in Cariology
  (50 → 10 ms) with identical results on 400 sample points in the two large subjects**, by testing the ray
  against each part's bounding box first and then only the nearest parts' triangles; hover picks are now
  limited to one per frame.
- **Kept a 2.29M-triangle whole-body model at full detail in 10.4 MB**: **all 2,234 source meshes retained,
  none decimated**, by scripting the whole pipeline (extraction, grouping by body system, Draco
  compression) so the model rebuilds identically from one command.
- **Animated blood, nerve, air and food flow on 1,200+ anatomical structures** with no per-frame CPU
  cost, by baking a per-vertex flow distance into the model (Dijkstra over each vessel and nerve
  network, bridging disconnected pieces) and driving travelling pulses from a single shared-clock vertex
  shader, in 7 switchable functions with play, pause, scrub and speed.
- **Authored a 16-stage, cut-away caries model, about 2.7M triangles across 161 parts, entirely in code**,
  by meshing signed-distance fields with surface nets at **0.08 mm resolution**, snapping every vertex onto
  its true boundary, Taubin smoothing, and sharing tooth geometry with an idealised carving molar built
  to Wheeler's proportions (192,864 triangles, 30 labelled landmarks).
- **Cut the Cariology download by 61% (28.7 → 11.1 MB; 11.7 → 4.8 s at 20 Mbit/s) with no coarser
  geometry**, by rebuilding the 16-stage lesion molar in headless Blender (OpenVDB meshing, Manifold
  booleans, 156 parts) so each lesion stage stores only a small patch around the lesion while the healthy
  tooth is shared, and by colouring cut faces from a per-vertex zone index in one shader, so the study and
  natural colour sets switch with a uniform update instead of new materials.
- **Removed three classes of rendering artefact** (stair-stepped zone edges, hairline seams, folded
  slivers) and the see-through holes that appeared as stages played, by moving to closed solid regions,
  boundary snapping, smoothing and draw-priority offsets, verified in zoomed phone screenshots.

## Mobile-first product design

- **Built a phone and tablet interface that was checked with real touch on 20 viewport/subject
  combinations (5 subjects at 390, 768, 1024 and 1440 px), with 0 failures in the final run**, by writing a
  puppeteer touch-check script that taps parts and lists, swipes and verifies camera framing, then making it
  part of the team's skills and review agent.
- **Redesigned description cards as swipeable bottom sheets that open as a title strip**, so a tapped
  structure stays visible, with the camera flying *in* to the part and centring it in the free space
  between the cards (no zoom-out, no hidden selection), using a viewer inset API and a shared `Sheet`
  component across 8 card types.
- **Made loading transparent for large models**: a percentage progress bar that works even when servers
  send no content length (sizes injected at build time), and timelines that wait for the model, after
  user testing showed playback starting over an empty stage.

## Content depth and accuracy

- **Wrote 630+ study notes and clinical links covering all 2,234 structures**, grouped by body system, with
  tests that fail if any structure lacks a note, so coverage cannot silently regress.
- **Modelled the caries process end to end**: 3 lesion types over 16 stages with their ICDAS and ICCMS
  codes, 8 G.V. Black sites carved into scanned teeth, and a plaque pH (Stephan curve) simulation driving
  enamel mineral loss and biofilm colour on a timeline.
- **Raised clinical accuracy through repeated expert-style review**: ran a dedicated anatomy-review agent
  across **5 passes (10 findings in Cariology alone, all fixed)**, correcting items such as selective
  caries removal guidance, ICCMS radiographic staging and ICDAS root codes.

## Engineering process and tooling

- **Shipped 5 subjects on one shared, framework-free 3D viewer** (about 7,100 lines across 46 source and
  script files), by keeping the viewer free of React and content, with one GLB per subject and an
  `add-mode` skill that makes the next subject a data-and-config task.
- **Protected 37 automated tests and every generated asset**, by building 2 Claude Code hooks (block hand
  edits to generated models; typecheck after every TypeScript edit) alongside **4 skills and 3 specialist
  agents** (anatomy review, UI critique, viewer engineering).

---

## Short versions for a resume (pick 4 to 6)

- Cut GPU draw calls **99.96% (4,460 → 2 per frame)** in a 2,234-part 3D anatomy atlas by batching meshes
  into a three.js `BatchedMesh` while preserving per-part picking, colour and visibility.
- Reduced main-thread frame cost **about 270× (233 ms → 0.85 ms)** and processed **50% fewer triangles
  per frame** (4.46M → 2.23M), making full frames **38% faster**.
- Kept **2,234 meshes (2.29M triangles) at full fidelity in 10.4 MB** with a scripted extract-and-Draco
  pipeline; no decimation.
- Animated flow on **1,200+ vessels and nerves** using baked Dijkstra distances and a single shared-clock
  shader.
- Built a **16-stage cut-away caries model (about 2.7M triangles) in code** with SDF meshing at 0.08 mm.
- Verified a mobile-first UI with **20 touch-based viewport/subject checks, 0 failures**, and swipeable
  bottom-sheet cards.
- Wrote **630+ clinical study notes** with tests that enforce full coverage, and fixed **10 accuracy
  findings** from an automated review.
- Shipped **5 subjects, 37 tests, 4 skills, 3 agents and 2 hooks** on one reusable 3D engine.

---

## Before and after (measured on the same machine, same benchmark)

Before = commit `33f8405`, the last build before batching. After = commit `d3c7929`. Each cell is a
measured value; the "before" build was run twice and its larger numbers agreed within 3%.

| Subject | Draw calls per frame | Triangles per frame | Main-thread render time | Full frame (incl. software GPU) | Layer toggle, CPU / full |
| --- | --- | --- | --- | --- | --- |
| General anatomy (2,234 parts) | 4,460 → **2** | 4.46M → **2.23M** | ~233 → **0.85 ms** | 1,418 → **873 ms** (−38%) | 155 → **5 ms** / 1,289 → **811 ms** |
| Physiology (2,170 parts) | 2,656 → **6** | 1.92M → **1.27M** | ~303 → **0.68 ms** | 628 → **448 ms** (−29%) | 185 → **7 ms** / 1,199 → **767 ms** |
| Oral anatomy (102 parts) | 104 → **4** | 176k → **144k** | ~3.1 → **0.63 ms** | not measured | 9 → **0.9 ms** (CPU) |
| Histology (9 parts) | 18 → **3** | 362k → **181k** | 0.45 → **0.13 ms** | not measured | ~0.7 → **0.55 ms** (CPU) |

**Not improved (say so if asked):** hover and tap picking (ray test) stayed about the same (about 5.5 ms
in General anatomy); a spatial index would be the next step. Cariology is left out of the table because
its model changed in the same period (7.7 → 17.2 MB), so before and after are not comparable.

## Where the other numbers come from (so you can defend them)

| Claim | Source |
| --- | --- |
| Post-load freeze and hit-testing times | `phone.mjs`/`prof.mjs`: headless Chrome, 390x844 at 3x, 4x CPU throttle, real GPU (laptop), long-task observer and CPU profile over the first 5 s; `pickcheck.mjs` compares the new hit test with the old on 400 points (identical in General and Physiology; ties between coincident walls in Cariology differ in 7%, one tooth/gum overlap in Oral anatomy) |
| Draw calls, triangles, render times above | `renderer.info.render` and timed renders in headless Chrome 1024×768 with software WebGL, same script (`bench.mjs`) on both builds; "full frame" waits for the GPU with a pixel readback, "main-thread" does not |
| 2,234 meshes, 2.29M triangles, 10.4 MB | `scripts/extract-bodyparts.mjs` output; `content.test.ts` asserts the 2,234 |
| 1,200+ flow structures | `content.test.ts` (flow attribute present on more than 1,200 meshes) |
| 16 stages, 161 authored parts, about 2.7M triangles, 0.08 mm | `scripts/build-cariology.mjs` output and `STEP` default (the old lesion molar, replaced 2026-10-22) |
| Cariology 28.7 → 11.1 MB, 11.7 → 4.8 s, 156 parts | `ls` of `public/models/cariology.glb` before (commit `adc844e`) and after; download of both files in headless Chrome with network throttling at 20 Mbit/s and 40 ms (`fetch`, cache off, two runs each, equal); 156 parts from `models-src/cariology-blender.json`. The whole GLB includes the arches, sites and process block, which did not change |
| 192,864 triangles, 30 landmarks | `scripts/build-carving-tooth.mjs` output |
| 20 viewport/subject touch checks, 0 failures | `scripts/touch-check.mjs` run on 5 subjects × 4 widths |
| 630+ notes | Count of `summary:` entries in `body.ts`, `systems.ts` and `anatomy.ts`; some are shared family notes |
| 37 tests, 4 skills, 3 agents, 2 hooks, 46 files, about 7,100 lines | `npm test` and the repo tree (source and script files, generated data excluded) |
| 10 accuracy findings, 5 review passes | Anatomy-reviewer agent reports (Cariology review: 4 moderate, 6 minor, all fixed) |

**Caveats to keep in mind**

- **These are not phone frame rates.** The headless browser rasterises in software, so absolute times are
  far slower than a phone's GPU. The draw-call and triangle counts are exact; the main-thread times are the
  relevant signal for phones (draw-call overhead is what makes mid-range phones stutter); the "full frame"
  times are a relative comparison only. Measure on a real phone (Chrome remote debugging) before quoting
  an fps figure.
- **Phrase draw calls honestly:** the batching result is "4,460 → 2 draw calls per frame". Half of that
  drop comes from drawing each part once instead of twice (opaque instead of two transparent passes).
- **No user or traffic numbers exist yet.** Add real ones (visitors, classes using it, feedback scores)
  as soon as you have them; they will outweigh any engineering metric.
- Cariology's model is currently 17 MB (up from 7.7 MB) after carving the site cavities at fine detail;
  worth mentioning as a known trade-off, with the planned fix of re-meshing only the area around each
  lesion.
