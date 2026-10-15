"""Author the Histology mode model: a premolar-like tooth in its socket, cut along its long axis.

Run headless (Blender 4.x):
    blender -b --factory-startup -P scripts/blender/build_histology.py -- public/models/histology.glb models-src/histology.blend

Every object name is a tissue key from src/content/histology.ts. Units are millimetres, Z up
(the glTF exporter converts to Y up). The section lies on the plane y = 0; tissue occupies y >= 0,
so the cut faces look towards -Y (towards +Z in the exported glTF).
"""
import math
import sys

import bmesh
import bpy

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
GLB_OUT = argv[0] if argv else "public/models/histology.glb"
BLEND_OUT = argv[1] if len(argv) > 1 else None

# ---------- profile (radius as a function of height) ----------
CEJ, CROWN_TOP, APEX, CREST = 0.0, 6.5, -13.0, -1.6
DENTIN_TOP, PULP_TOP, PDL, LAMINA = 5.0, 3.1, 0.32, 0.45
GUM_TOP = CEJ + 1.4
BLOCK_X, BLOCK_Y, BLOCK_BOTTOM = 7.5, 6.0, APEX - 4.5
STEPS = 72


def outer(z):
    """Outer surface of the tooth: tapering root below the CEJ, bulging crown above."""
    if z <= CEJ:
        t = max((z - APEX) / (CEJ - APEX), 0.0)
        return 0.35 + 2.55 * t ** 0.6
    contour = 4.4
    if z <= contour:
        return 2.9 + 0.9 * math.sin(math.pi / 2 * z / contour)
    t = (z - contour) / (CROWN_TOP - contour)
    return 3.8 * math.sqrt(max(1 - t * t, 0.0))


def cementum_thickness(z):
    return 0.06 + 0.3 * ((CEJ - z) / (CEJ - APEX))


def enamel_thickness(z):
    return 0.05 + 1.25 * (max(z, 0.0) / CROWN_TOP) ** 1.2


def dentin_outer(z):
    if z <= CEJ:
        return outer(z) - cementum_thickness(z)
    if z >= DENTIN_TOP:
        return 0.0
    r = outer(z) - enamel_thickness(z)
    near = (z - (DENTIN_TOP - 0.8)) / 0.8
    return r * math.sqrt(max(1 - near * near, 0.0)) if near > 0 else r


def pulp(z):
    if z >= PULP_TOP or z <= APEX + 0.2:
        return 0.0
    if z > 0.8:
        t = (z - 0.8) / (PULP_TOP - 0.8)
        return 1.55 * math.sqrt(max(1 - t * t, 0.0))
    t = (z - APEX) / (0.8 - APEX)
    return 0.12 + 1.43 * t ** 1.4


def socket(z):
    return outer(max(z, APEX)) + PDL


def zero(_z):
    return 0.0


# ---------- geometry helpers ----------
def heights(z0, z1, n=96):
    return [z0 + (z1 - z0) * i / n for i in range(n + 1)]


def revolve(name, inner, outer_fn, z0, z1, angle=math.pi):
    """Revolve the region inner(z) <= r <= outer_fn(z) about Z; angle=pi gives the cut half."""
    zs = heights(z0, z1)
    pts = [(max(outer_fn(z), 0.0), z) for z in zs]
    pts += [(min(max(inner(z), 0.0), max(outer_fn(z), 0.0)), z) for z in reversed(zs)]
    bm = bmesh.new()
    verts = []
    for x, z in pts:
        if verts and abs(verts[-1].co.x - x) < 1e-6 and abs(verts[-1].co.z - z) < 1e-6:
            continue
        verts.append(bm.verts.new((x, 0.0, z)))
    face = bm.faces.new(verts)
    full = abs(angle - 2 * math.pi) < 1e-6
    if full:
        # A closed revolution needs no caps: spin only the outline, or the start and end caps
        # end up as duplicate internal faces and boolean cutters stop being manifold.
        edges = list(face.edges)
        bm.faces.remove(face)
        geom = [*edges, *verts]
    else:
        geom = [face, *face.edges, *verts]
    bmesh.ops.spin(bm, geom=geom, cent=(0, 0, 0), axis=(0, 0, 1),
                   angle=angle, steps=STEPS * (2 if full else 1), use_duplicate=False)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def box(name, x0, x1, y0, y1, z0, z1):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x = x0 if v.co.x < 0 else x1
        v.co.y = y0 if v.co.y < 0 else y1
        v.co.z = z0 if v.co.z < 0 else z1
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def boolean(target, cutter, operation):
    mod = target.modifiers.new("bool", "BOOLEAN")
    mod.object = cutter
    mod.operation = operation
    mod.solver = "EXACT"
    deps = bpy.context.evaluated_depsgraph_get()
    baked = bpy.data.meshes.new_from_object(target.evaluated_get(deps))
    target.modifiers.clear()
    old = target.data
    target.data = baked
    bpy.data.meshes.remove(old)


def remove(obj):
    mesh = obj.data
    bpy.data.objects.remove(obj)
    bpy.data.meshes.remove(mesh)


def finish(obj, color, roughness=0.6):
    mat = bpy.data.materials.new(obj.name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    bpy.context.view_layer.objects.active = obj
    for o in bpy.context.selected_objects:
        o.select_set(False)
    obj.select_set(True)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(38))


def srgb(hex_):
    def lin(c):
        c /= 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return tuple(lin(int(hex_[i:i + 2], 16)) for i in (1, 3, 5))


# ---------- build ----------
bpy.ops.wm.read_factory_settings(use_empty=True)

enamel = revolve("enamel", dentin_outer, outer, CEJ, CROWN_TOP)
dentin = revolve("dentin", pulp, dentin_outer, APEX + 0.25, DENTIN_TOP)
pulp_obj = revolve("pulp", zero, pulp, APEX + 0.2, PULP_TOP)
cementum = revolve("cementum", dentin_outer, outer, APEX, CEJ)
pdl = revolve("pdl", lambda z: outer(z) if z >= APEX else 0.0, socket, APEX - PDL, CREST)
lamina = revolve("lamina-dura", socket, lambda z: socket(z) + LAMINA, APEX - PDL - LAMINA, CREST)

# Alveolar bone: a half block of jaw with the socket (lamina dura included) cut out.
bone = box("bone", -BLOCK_X, BLOCK_X, 0.0, BLOCK_Y, BLOCK_BOTTOM, CREST)
cutter = revolve("_socket", zero, lambda z: socket(z) + LAMINA, APEX - PDL - LAMINA - 0.01, CREST + 0.5, 2 * math.pi)
boolean(bone, cutter, "DIFFERENCE")
remove(cutter)


# Gingiva: drapes over the bone crest and tapers to the free margin above the CEJ.
def gum_envelope(z):
    u = min(max((z - CREST) / (GUM_TOP - CREST), 0.0), 1.0)
    return outer(min(z, CEJ)) + 0.15 + 9.0 * (1 - u) ** 2.2


gingiva = box("gingiva", -BLOCK_X, BLOCK_X, 0.0, BLOCK_Y, CREST, GUM_TOP)
envelope = revolve("_gum", zero, gum_envelope, CREST - 0.01, GUM_TOP, 2 * math.pi)
boolean(gingiva, envelope, "INTERSECT")
remove(envelope)
tooth = revolve("_tooth", zero, lambda z: outer(z) + 0.04, CREST - 0.5, CROWN_TOP + 0.1, 2 * math.pi)
boolean(gingiva, tooth, "DIFFERENCE")
remove(tooth)

# Neurovascular bundle: drawn on the section surface, entering at the apical foramen.
curve = bpy.data.curves.new("neurovascular", "CURVE")
curve.dimensions = "3D"
curve.bevel_depth = 0.14
curve.bevel_resolution = 4
for dx, top in ((-0.25, PULP_TOP - 0.5), (0.0, PULP_TOP - 0.2), (0.25, PULP_TOP - 0.6)):
    spline = curve.splines.new("BEZIER")
    path = [(dx * 0.4, BLOCK_BOTTOM + 0.5), (dx * 0.5, APEX - 1.5), (dx * 0.3, APEX + 1.0),
            (dx * 1.6, -6.0), (dx * 3.0, 0.0), (dx * 3.4, top)]
    spline.bezier_points.add(len(path) - 1)
    for bp, (x, z) in zip(spline.bezier_points, path):
        bp.co = (x, -0.12, z)
        bp.handle_left_type = bp.handle_right_type = "AUTO"
nv_curve = bpy.data.objects.new("neurovascular_curve", curve)
bpy.context.collection.objects.link(nv_curve)
deps = bpy.context.evaluated_depsgraph_get()
nv_mesh = bpy.data.meshes.new_from_object(nv_curve.evaluated_get(deps))
nv_mesh.name = "neurovascular"
bpy.data.objects.remove(nv_curve)
bpy.data.curves.remove(curve)
neuro = bpy.data.objects.new("neurovascular", nv_mesh)
bpy.context.collection.objects.link(neuro)

COLORS = {
    "enamel": ("#f4efe4", 0.25), "dentin": ("#e7cf9a", 0.55), "pulp": ("#c8594f", 0.7),
    "neurovascular": ("#e8c547", 0.5), "cementum": ("#d9b67a", 0.6), "pdl": ("#9a6b8a", 0.7),
    "lamina-dura": ("#efe7d6", 0.5), "bone": ("#c9b99a", 0.85), "gingiva": ("#d88a8a", 0.6),
}
for obj in list(bpy.data.objects):
    hex_, rough = COLORS[obj.name]
    finish(obj, srgb(hex_), rough)

if BLEND_OUT:
    bpy.ops.wm.save_as_mainfile(filepath=BLEND_OUT, compress=True)
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT, export_format="GLB", export_yup=True, export_apply=True,
    export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7,
)
print("histology:", [(o.name, len(o.data.polygons)) for o in bpy.data.objects])
