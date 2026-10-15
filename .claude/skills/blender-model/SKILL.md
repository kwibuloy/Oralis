---
name: blender-model
description: Author or change an Oralis 3D model in Blender with a reproducible headless Python script — for anything BodyParts3D does not have (histology sections, schematic structures, a new mode's model). Use when the user asks for a new or improved GLB model, or to fix geometry problems in the histology model.
---

# Authoring models in Blender

Blender is installed at `D:\Blender\blender.exe` (4.5 LTS). Models are built by scripts, never by hand-editing GLBs, so they can be regenerated and reviewed.

## Run

```bash
cd logibot
"/d/Blender/blender.exe" -b --factory-startup -P scripts/blender/build_histology.py -- public/models/histology.glb models-src/histology.blend
```

The second argument saves a compressed `.blend` in `models-src/` so the user can open and tweak it. Delete any `*.blend1` backup (git-ignored).

## Conventions the app relies on

- **Object name = content key.** The Viewer matches GLB node names to `src/content/<mode>.ts` keys (e.g. `enamel`, `lamina-dura`). Any other object is dropped. `content.test.ts` reads the GLB and fails if a key has no node.
- **One object per selectable structure.** Join pieces that should select together.
- **Millimetres, Z up.** The glTF exporter converts to Y up. For a section, put the cut on the plane y = 0 with tissue at y >= 0, so cut faces look at the default camera (+Z in glTF).
- **Export:** GLB, `export_apply=True`, Draco on (`export_draco_mesh_compression_enable=True`). Keep each model under ~1 MB.
- **Materials are a hint only.** The app colours meshes from the content colours; keep Blender colours in sync for anyone opening the `.blend`.

## Geometry pitfalls (all hit before)

- **Boolean cutters must be manifold.** A full 360° revolve must spin only the profile outline, not a face (see `revolve()` in `build_histology.py`); spinning a face leaves duplicate seam caps and EXACT booleans silently fail, leaving slabs inside other tissues.
- Use `bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph))` to bake modifiers in background mode; `bpy.ops.object.modifier_apply` needs a UI context.
- Nested tissues share surfaces. That's fine inside the solid, but cut faces must not overlap: give each tissue its own radial band.
- After `bmesh.ops.spin`, run `remove_doubles` and `recalc_face_normals`; axis vertices collapse.

## Verify

1. `npm test` (GLB node names vs content).
2. Look at it: `node scripts/shoot.mjs --widths 1440 histology`, then isolate layers through `window.__viewer.setVisibleGroups([...])` in a puppeteer probe if something looks wrong (this is how the gingiva slab was found).
3. Ask the `anatomy-reviewer` agent whether the proportions and layering are defensible for teaching.
