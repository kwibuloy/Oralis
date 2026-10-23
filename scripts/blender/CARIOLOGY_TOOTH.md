# Cariology tooth in Blender — status, method and bug log

The Cariology lesion molar, built in Blender (started 2026-10-22; **live on the website since
2026-10-22**, replacing the old `build-cariology.mjs` tooth). Read this before touching
`cariology_shape.py` or `build_cariology.py`; the bug log at the end lists every problem already hit
and its fix.

## Files

| File | What it is |
| --- | --- |
| `scripts/blender/cariology_shape.py` | The tooth as signed-distance fields (crown, cusps, fissures, roots, pulp, enamel thickness, cervical line) |
| `scripts/blender/build_cariology.py` | Meshing, distance fields, tissues, lesion stages, collar, materials, normals, export |
| `scripts/blender/render_cariology.py` | Workbench renders of one site/stage, for checking |
| `models-src/cariology-blender.glb` / `.blend` / `.json` | Outputs: GLB 8.3 MB, `.blend` 61 MB compressed (not committed), JSON manifest |
| `scripts/extract-bodyparts.mjs` (`addCariologyParts`, `pinOnCut`) | Merges the GLB into `public/models/cariology.glb` and writes `src/content/cariology-lesions.generated.json` |

## On the website

- **Names** are the content keys (`src/content/cariology.ts`): `cl-<site>-static-<tissue>` (the cut
  tooth outside the patch box), `cl-<site>-perio-<part>` (bone, PDL, gingiva) and
  `cl-<site>-<stage>-<zone>` (the patch at one stage). The Lesion view shows static + perio + one stage,
  so a stage change swaps only the patch. On screen every piece of one tissue or zone shares the key
  `cl-<site>-<zone>` (`lesionKey`; the node name stays the group), so the fixed dentin and the stage's
  dentin patch are tapped, highlighted and described as one part (user's choice). The viewer shows a
  selected key's hidden meshes only when none of them is in view, so other stages' patches stay hidden.
- **Merge** (`extract-bodyparts.mjs`): each part's two primitives (natural, `(cut)`) become one, with
  per-vertex `_CUT` (1 on cut faces) and `_ZONE` (index into `regions` of the generated JSON). Custom
  normals are copied as they are. Scale 0.1 (mm → model cm), beside the arches. From the old
  `models-src/cariology.glb` only the process block (`pr-*`) is taken.
- **Colours**: the outside of every part takes `ZONES[zone].real`; cut faces take the viewer's zone
  palette (`cutZone` in `src/viewer/surface.ts`), set to the study colours (`ZONES[zone].colour`) when
  Show zones is on (the default) and to the natural ones when off. Both match the palette below.
  The old growth lines (`_DIR`, `_DEPTH`) and blurred zone borders (`_nbr`, `_blend`) were dropped
  (user's choice): cut faces are flat colours with sharp borders.
- **Pins**: one per lesion zone and the pulp, on the cut plane where the part has most area, at the
  triangle centre farthest from that plane's outline (`pinOnCut`). Smooth-surface stages have no pulp
  pin (its patch pulp never reaches a cut face). On screen, pins that would overlap are pushed apart
  (`spreadPins` in `Viewer.ts`), each with a thin line to a dot at its point; zoomed in, they sit on
  their points again (user's choice).
- **Camera**: `LESION_VIEW` in `cariology.ts` (glTF axes: +x distal, +y occlusal, +z buccal). The
  screen opens from the front and turns to it once loaded (~0.9 s). Tapping the tooth frames the whole
  part as in every subject; tapping a pin uses the same distance but centres on the pin's point
  (`Viewer.setPinFocus`). The tooth opens with nothing selected, even when the address names a part.
- **Highlight**: cut faces take the colour from the palette, not the material, so the selection tint
  is applied in the shader too (`uCutTint`); the outside of these parts gets the same amount
  (`SELECT_CUT_MIX` 0.55 in `Viewer.ts`), so a part reads as one selection.
- **Surface zone**: after cavitation a ring of it stays around the cavity (removed only within 0.3 mm of
  the rim); `content.test.ts` checks that every enamel zone still lines a cavitated lesion (user's choice).

### Measured (2026-10-22)

`public/models/cariology.glb` 28.7 MB → 11.1 MB (whole Cariology model: arches, sites, process block,
lesion molar; 4.56 M triangles). Download at 20 Mbit/s, 40 ms (Chrome throttling): 11.7 s → 4.8 s.
Ready (first pin shown) on a local dev server at 390 px: 1.6–2.0 s.

## Commands

```bash
# Full build (~2.5 min): GLB, blend and JSON manifest
"/d/Blender/blender.exe" -b --factory-startup -P scripts/blender/build_cariology.py -- models-src/cariology-blender.glb models-src/cariology-blender.blend

# Fast iteration: one site, cached whole-tooth meshes and distance fields, coarse grid
CARIO_SITES=pit-fissure CARIO_CACHE=<scratch>/cache CARIO_H=0.1 "/d/Blender/blender.exe" -b --factory-startup -P scripts/blender/build_cariology.py -- <scratch>/test.glb <scratch>/test.blend

# Look at it (zoomed: scale 3–8 mm, target near the lesion)
"/d/Blender/blender.exe" -b <scratch>/test.blend -P scripts/blender/render_cariology.py -- <outdir> pit-fissure 4 obl3 3 -0.3,0.6,5.6
```

Clear the cache folder after changing `cariology_shape.py` (the cache key is only the grid step).
Lesion positions are printed at the start of a build; good zoom targets are near them.

## Decisions the user made (ask before changing any of these)

The user is not a dental student: ask in plain words, never assume.

- Replacement for the current tooth; lower jaw, patient's left first molar (FDI 36); **new shape** modelled from textbook (Wheeler) proportions.
- Look: realistic outside, study colours on the cut faces (the palette below was approved).
- Corner cut away, **one tooth copy per decay spot**: top grooves (pit & fissure), side touching the next tooth (smooth surface, mesial), near the root (buccal, with receded gum).
- Same steps as the old model: 6 / 6 / 4, with full zone detail (four enamel zones, three dentin zones, tertiary dentin).
- A **small** collar of gum, ligament and bone. No biofilm/process block (that stays from the old script).
- File as small as possible **without coarser shapes**: share the healthy part, store only the decayed patch per step.
- Save as separate draft files in `models-src/`; don't touch the website.

### Palette (natural outside / study on cut faces)

| Part | Natural | Study |
| --- | --- | --- |
| Enamel | `#ede6d3` | `#cfdcea` |
| Dentin | `#e3c891` | `#f1d79e` |
| Cementum | `#dcc69a` | `#c4ab73` |
| Pulp | `#c25f69` | `#e05a6a` |
| Tertiary dentin | `#dbbf86` | `#f4a77a` |
| Enamel surface zone / body / dark / translucent | all `#f5f2ea` (chalky white) | `#ffffff` / `#c9b8e4` / `#76689a` / `#98cde9` |
| Infected / affected / sclerotic dentin | `#6e4a2c` / `#a5773d` / `#d8bd84` | `#5e3518` / `#c9893a` / `#c8e6d4` |
| PDL / bone / gum | `#e8b4b0` / `#e2d8c4` / `#e3949a` | same |

## What is done

- **Tooth shape** (`cariology_shape.py`): crown outline loft (Catmull-Rom smoothed table), occlusal
  height map with 5 cusps (steeper outer faces), marginal ridges, V-fissures with mesial/central/distal
  pits, buccal and lingual furrows; root trunk, mesial and distal roots (curved, with root
  depressions); pulp chamber with five horns, two mesial canals and a ribbon distal canal. Axes:
  +X distal, −Y buccal (faces the default camera), Z up, z = 0 at the buccal CEJ.
- **Tissues**: enamel = tooth − DEJ; cementum = 0.15 mm under the root surface; dentin; pulp.
- **Collar**: PDL 0.2, bone 1.0, gum 0.35 over bone ending 2.2 mm below the crest; the root site has
  buccal recession (gum 3.8, bone 3.5).
- **Lesions**, all three sites and all stages: enamel zones (surface, body, dark, translucent),
  dentin zones (infected, affected, sclerotic), tertiary dentin lens on the pulp wall, undermining
  cavities (narrow opening, wider bowl in dentin) lined by every zone, microcavities (a local
  widening of the fissure; a shallow dish on the smooth surface), rounded cavity rims.
- **Base + patch**: per site, the cut tooth outside a patch box is stored once (`cl-<site>-static-<part>`, `cl-<site>-perio-<part>`);
  each stage stores only the patch (`cl-<site>-<n>-<zone>`). A JSON manifest lists parts per stage,
  lesion position (glTF coordinates), cut box and patch box.
- **Size**: 8.3 MB GLB (Draco), ~3.0 M triangles, 156 objects, against 28.7 MB for the old model.
- **Draft files written** (2026-10-22) and checked by re-importing the GLB: all 156 manifest names
  present, custom normals on every part. 22 parts have one material, not two: the cut never reaches
  them, and the exporter drops an unused material.
- **Close-up checks** done at 2–4 mm for all three sites; contact sheets of every stage shown to the user.
- Normals from the fields (smooth shading, invisible base/patch seam); two materials per part
  (natural outside, study on cut faces).

## Left to do

1. The user reviewed the contact sheets (2026-10-22) and chose to keep the gum as it is.
2. Known leftovers, visible only at 2–3 mm zoom: a few 0.02 mm steps where the rounded cavity rim
   meets the fissure (pit-fissure stage 4); faint shading smudges on the smooth-surface cavity floor;
   a toothed edge between the translucent zone and sound enamel on the outer surface (shows only in
   debug colours, since the natural colours are almost equal); a 0.08 mm block where the two cut
   planes meet the widened fissure (real geometry, not debris).
3. The 61 MB `.blend` is **not committed** (user's choice; it is in `.gitignore`). Rebuild it with the
   full-build command to open the model in Blender.
4. Website integration done (2026-10-22, see "On the website"); the guard hook covers the new
   generated files. Not done: an `anatomy-reviewer` pass over the new zones (notably the surface-zone
   ring after cavitation); pins can crowd on the small early lesions.

## How it is built (pipeline)

1. **Fields** — `cariology_shape.py` defines `tooth`, `smooth_tooth` (no fissures) and `pulp` as
   numpy functions of x, y, z arrays. One shared lattice with step `H` (0.05 mm) is used for every grid.
2. **Meshing** — OpenVDB (bundled with Blender 4.5: `import openvdb`). `analytic_fill` evaluates an
   analytic field only near its surface (decided on a coarse lattice); `mesh_slabs` fills a level-set
   grid slab by slab and calls `convertToPolygons(0, adaptivity)`.
3. **True distance fields** — `createLevelSetFromPolygons` turns the tooth mesh back into an exact SDF
   (`TS`, dense array); the smooth crown gives `TSS`; `DS = TS/TSS + enamel_thickness` is the DEJ.
   All offsets (cementum, surface zone, PDL, bone, gum, lesion fronts, cavities) are fields of
   `(x, y, z, T, D)` built from these arrays.
4. **Solids** — every tissue and zone is a closed mesh from Manifold booleans (`m.solver = "MANIFOLD"`),
   using one persistent pair of temp objects. Neighbours are cut from the same surfaces, so their
   borders match exactly and cut faces are exactly flat (box booleans).
5. **Patch** — tissues minus corner box, then split by the patch box into base and patch; stage
   zones are booleans on the small patch pieces only.
6. **Finish** — custom split normals: faces on a plane get the plane normal (study material if it is a
   cut plane); faces on the tooth / gum / bone / cavity surface get that field's gradient; others keep
   mesh normals. Then materials, collections, Draco GLB export, compressed `.blend`.

## Bug log — symptom → cause → fix

| Symptom | Cause | Fix (where) |
| --- | --- | --- |
| Horizontal banding stripes on crown and roots | Loft tables interpolated linearly: creases at each row | `smooth_table` (Catmull-Rom resample) for `OUTLINE` and root tables |
| Notch/step where roots meet the trunk | Root loft ended at z = −2 with a hard cap | Root tables run up to z = 0.5 inside the trunk; union k 1.3 |
| Root grooves looked like slots, ring near apex | Short capsule grooves with sharp ends | Groove depth fades smoothly at both ends (`fade` in `root()`) |
| Crown looked like a box with balls on top | Body + ellipsoid cusps | Occlusal **height map** (`occlusal_height`) on the outline loft, rounded with `smax` |
| Ledge/rim around the occlusal table | Wide cusp cones trimmed by the outline walls | Height map with steeper outer faces (`OUTER_X/Y`) instead of cones |
| Flat-topped crown | `round_cone` breaks when radius difference > length (wide, low cones) | Don't use `round_cone` for wide cones (a `cone()` helper exists; the height map replaced both) |
| Phantom surface inside the roots; huge "error" at (3.6, 0, −11) | `ellipsoid`/`ellipse2` approximation is 0 at the exact centre | Use `(k0 − 1) · min radius` when `k0 < 0.5` |
| Default cube/camera/light exported | `--factory-startup` keeps the default scene | `bpy.ops.wm.read_factory_settings(use_empty=True)` at start |
| 1.8 M triangles for one site at H = 0.1 | Uniform voxel meshing everywhere, every surface stored twice | OpenVDB adaptivity: `VISIBLE = 0.01`, `HIDDEN = 0.03`. Measured: tooth 831 k → 85 k triangles, 99.9% within 0.023 mm (full detail 0.012). Recheck error if you change these |
| Cut faces showed outside colours | `me.materials.clear()` after setting `material_index` resets it | Append materials first, then `finish()` |
| Vertical shaft above the fissure (stage 2–3) | Microcavity was an infinite cylinder `lat < m` | Local pocket (ellipsoid, longer along the groove), staying in enamel |
| Jagged top edge of the pit-fissure section | Cut plane weaving in and out of a zig-zag groove | Central groove straight at y = 0.1 through the pit; fissure wider (`FISSURE_SLOPE` 5.5, rounding 0.15) |
| Spiky slivers on the cavity rim | Thin surface-zone shell cut by the cavity | Surface zone removed within 0.3 mm of the cavity (`rim` mesh) |
| Lesion zones far from the lesion (occlusal DEJ, mesial root face) | Fronts used distance from an infinite axis line | Cap along the axis: enamel fronts `t ≤ t_dej + 0.3`, cavity `t ≤ t_dej + deep + 0.3`, root fronts `t ≤ 1.1 b` |
| Dentin zones ended in a flat wall / hugged the occlusal DEJ | Depth measured to the *nearest* DEJ | Depth along the axis from where it crosses the DEJ (`Site.depth`); root keeps depth from the root surface |
| Torn-paper cavity rims | Sharp rim edge + different outside colours per enamel zone | Rounded rim fillet (`RIM`); one chalky outside colour for all enamel zones |
| All surface zones vanished (155 → 147 objects) | `rim` was built from the *rounded* cavity field, whose fillet term is near zero all over the surface | Build `rim` from `site.cavity(st, rounded=False)` |
| Saw-teeth where the rim fillet meets the tooth | Fillet tangent to the tooth surface | Round against `T − 0.05` so the fillet meets the tooth at an angle |
| Gum a thick boxy ring with saw-tooth edges | Thick offsets; gum tapering to zero thickness | Thinner collar; gum ends in rounded edges of finite thickness (`GUM`, `GUM_BELOW_CREST`) |
| Darker, faceted patches inside cavities | Adaptive triangles on tight curves sit ~0.03 mm off the surface, beyond the old 0.35·H tolerance, so they fell back to flat mesh normals | Each face goes to the **nearest** surface (argmin, not first match), within one grid step H |
| Ragged blobs on cavity walls (pit-fissure stage 4) | An enamel front (0.73 × r0/r1) lay almost exactly on the cavity wall (open/wide): two near-identical surfaces criss-cross | `around()`: with a cavity, every front reaches at least `ENAMEL_LINING` / `DENTIN_LINING` past the cavity wall. Fronts never run along it, and a cavity is always lined by its lesion |
| Ragged rim where the fillet meets the fissure | The tooth distance folds along a narrow fissure's mid-plane; the rim rounding inherited the fold | Round against the crown without fissures: `D − enamel_thickness` |
| Hundreds of tiny islands in some zones | Booleans between near-touching surfaces leave 2–18-face slivers (~1e-5 mm³) | `drop_specks()` removes islands under 5e-4 mm³ and logs them |
| Ring-shaped ridge on cavity walls near the DEJ | The enamel part of the cavity (a cylinder past the DEJ) poked out of the dentin bowl, which only reached the same width at the DEJ | `BOWL_LIFT`: the bowl is centred 0.3 mm into the enamel and is 15% wider at the DEJ, so the enamel part ends inside it |
| Saw-tooth line on a cavity wall at the DEJ | Cavity floor built parallel to the DEJ (`−D − 0.08`) | Close the enamel part across the axis (`along − (t_dej + 0.1)`) |
| Smooth-surface microcavity floor ragged | Flat floor parallel to the tooth surface layers | A dish (ellipse in lateral distance and depth) |
| Toothed band outlines around cavities | The crease of `min(front, cavity − margin)` ran along the tooth surface; OpenVDB meshes creases as steps | Smooth min (`S.smin`, k 0.12) in `around()` |
| (Website) Opening turn sat still, then snapped to the end | The explode-slider refit ran on load, 0.2 s into the turn; two camera tweens set the camera every frame | Refit only when the slider moved (`Atlas.tsx`); a new framing kills unfinished ones (`frameBox`) |
| (Website) Unselected cut faces black | `new THREE.Vector4()` is (0, 0, 0, **1**): a full tint to black | `cutTint` starts at (0, 0, 0, 0) |
| (Website) Enamel already selected when the screen opened | The last tap is kept in the address (`#/cariology/<key>`) and restored on reload | Cariology ignores a `cl-` selection from the address |
| (Website) Enamel's outside lighter blue than its cut face | Outside tinted 0.22, cut faces 0.55 | Parts with `cutZone` use 0.55 outside too |
| (Website) 47 of 82 pins overlapping at 1440 (68 on a phone), e.g. tertiary dentin under pulp | Zone points a fraction of a millimetre apart on a small lesion | `spreadPins`: push apart on screen, line to the point |
| (Website) Selected sclerotic dentin showed as concentric rings | Every stage's patch shares the key, and a selected key was shown in hidden groups too | `shown()`: hidden meshes of a selected key only when none is in view |

## Checks that caught these

- `COLOR=SINGLE` render (shading only) vs `COLOR=RANDOM` (one colour per part): a ragged line in
  SINGLE is geometry or normals; one that only shows in RANDOM or MATERIAL is a border between parts.
- Re-import the GLB in a fresh Blender and compare object names with the JSON manifest.
- Near-parallel surfaces are the usual cause of ragged edges: when two surfaces that meet run almost
  along each other, change one so they cross at an angle (or keep them apart).

- Render at three scales: whole tooth (scale 28), lesion (7–8), close-up (3). Problems at 3 mm still matter: the user zooms deep on phones.
- After a build, list parts per stage from the JSON manifest. A missing zone means a boolean went empty.
- Per-object triangle counts (`calc_loop_triangles`) show what dominates the file size.
- When changing adaptivity or grid step, measure the error: distance of face centres to the field
  (`|f| / |∇f|`), as percentiles. Ignore points where the gradient is near zero.
