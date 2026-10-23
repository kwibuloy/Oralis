"""Render one site and stage of the cariology .blend with Workbench, for checking the model.

    "/d/Blender/blender.exe" -b models-src/cariology-blender.blend -P scripts/blender/render_cariology.py -- <outdir> <site> <stage> <views> [ortho scale mm] [target x,y,z] [hide substrings]

Set COLOR=RANDOM (one colour per part) or COLOR=SINGLE (shading only) to debug.
Views: buccal, lingual, mesial, distal, top, obl, obl2, obl3, below (comma list). Writes <site>_s<stage>_<view>.png.
"""
import sys, os, math
import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
OUT, SITE, STAGE, VIEWS = argv[0], argv[1], argv[2], argv[3].split(",")
SCALE = float(argv[4]) if len(argv) > 4 else 16
TARGET = Vector([float(v) for v in argv[5].split(",")]) if len(argv) > 5 else Vector((0, 0, 3))
HIDE = argv[6].split(",") if len(argv) > 6 and argv[6] else []

sc = bpy.context.scene
for c in bpy.data.collections:
    if c.name.startswith(SITE + " "):
        c.hide_render = c.hide_viewport = not (c.name in (f"{SITE} base", f"{SITE} stage {STAGE}"))
    elif " " in c.name and not c.name.startswith(SITE):
        c.hide_render = c.hide_viewport = True
for o in bpy.data.objects:
    o.hide_render = any(h in o.name for h in HIDE)
sc.render.engine = "BLENDER_WORKBENCH"
sh = sc.display.shading
sh.light = "STUDIO"; sh.color_type = os.environ.get("COLOR", "MATERIAL"); sh.show_specular_highlight = True  # COLOR=RANDOM or SINGLE to debug
sh.show_cavity = False
sc.render.resolution_x = sc.render.resolution_y = 900
world = bpy.data.worlds.new("w"); sc.world = world; world.color = (1, 1, 1)
sc.view_settings.view_transform = "Standard"
cam = bpy.data.cameras.new("c"); cam.type = "ORTHO"; camo = bpy.data.objects.new("c", cam)
sc.collection.objects.link(camo); sc.camera = camo
D = {"buccal": (0, -1, 0), "lingual": (0, 1, 0), "mesial": (-1, 0, 0), "distal": (1, 0, 0), "top": (0, -0.001, 1),
     "obl": (-0.6, -1, 0.6), "obl2": (-1, -0.6, 0.6), "obl3": (-0.4, -1, 0.9), "below": (0, -1, -0.4)}
for v in VIEWS:
    d = Vector(D[v]).normalized()
    camo.location = TARGET + d * 60
    camo.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    cam.ortho_scale = SCALE
    sc.render.filepath = os.path.join(OUT, f"{SITE}_s{STAGE}_{v}.png")
    bpy.ops.render.render(write_still=True)
