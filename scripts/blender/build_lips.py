"""Author the Oral anatomy lips: the upper and lower vermilion as two smooth, closed solids that replace the
thin, crumpled BodyParts3D lip shell (FJ2814, content key `lip`). Not wired into the app yet.

Run headless (Blender 4.5):
    "/d/Blender/blender.exe" -b --factory-startup -P scripts/blender/build_lips.py -- models-src/lips.glb models-src/lips.blend

Shape
- The outline follows the BodyParts3D lip, measured in dental.glb (centimetres, Blender axes: x = patient's
  left, -y = anterior, z = up): the lips meet on a flat stomion at z = -5.30 and join at the commissures,
  x = +-2.53. The upper vermilion is 0.73 cm tall at its peaks with a shallow dip at the midline; the lower
  is 0.90 cm. Both are made 8% taller and solid (about 0.95 cm deep at the midline) for a fuller, natural
  adult lip. No landmarks are added beyond what the source shows.
- Each lip is a swept profile: a closed cubic B-spline (UPPER / LOWER) in the plane normal to the arch,
  its back face CLEAR cm in front of the labial surface of the teeth and gingiva (fitted from dental.glb),
  so the fuller lip grows outwards and never cuts into them.
- Closed, the lips just touch along a contact band on the stomion: the upper profile lies on or above
  z = STOMION, the lower on or below it. At each commissure both lips taper to the same point.

Opening
The app's Open bite toggle moves the lower jaw by BITE_OPEN (Atlas.tsx: glTF (0, -1.6, 0.3) cm, i.e. down
1.6 and forward 0.3). Each vertex carries `_BITE`, the share of that offset it follows (the viewer's
stretch mechanism, as for the BodyParts3D lip): 0 mid upper lip, 1 mid lower lip, both 0.5 at the
commissures, by x only, so the corners stay joined and the lips curve into a rounded open mouth.

Objects are named `upper-lip` and `lower-lip` (proposed content keys).
"""
import math
import os
import sys

import bmesh
import bpy

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
GLB_OUT = argv[0] if argv else "models-src/lips.glb"
BLEND_OUT = argv[1] if len(argv) > 1 else None

HALF = 2.53         # commissure, |x| (cm)
STOMION = -5.30     # z where the lips meet
FULLER = 1.08       # height over the source lip
CLEAR = 0.08        # gap between the back of the lip and the teeth/gingiva (cm)
N_U, N_V = 240, 128  # samples along the arch, around the profile
COLOR = (0xd6 / 255, 0x8f / 255, 0x80 / 255)  # the `lips` token in src/content/structures.ts


def teeth_front(x):
    """Labial surface of the teeth and gingiva (y) behind the lips, fitted from dental.glb."""
    return -9.62 + 0.218 * x * x - 0.0083 * x ** 4


def upper_height(s):
    """Upper vermilion height above the stomion; s = |x| / HALF. A gentle midline dip (the source's
    Cupid's bow, smoothed)."""
    bow = 1 - 0.14 * math.exp(-(s / 0.13) ** 2)
    return 0.73 * FULLER * max(1 - s ** 3, 0) ** 0.6 * (1 - 0.9 * s ** 6) * bow


# Both heights follow the source to within about 0.07 cm along the lip, but fall to zero at the commissure
# like a square root, not linearly, so the corner is a small rounded end rather than a cone seen from the side.
def lower_height(s):
    return 0.90 * FULLER * max(1 - s ** 2.5, 0) ** 0.65 * (1 - 0.9 * s ** 3.5)


CORNER_R, CORNER_LEN = 0.12, 0.20  # commissure end: half-height/depth and length of the rounded cap (cm)


def rounded(v, x):
    """A height or depth with a rounded commissure: a soft floor of CORNER_R, closed by a quarter ellipse over
    the last CORNER_LEN of the lip (zero slope where it starts, so no crease). Without it each lip ended in a
    needle point that showed when zoomed in."""
    v = math.sqrt(v * v + CORNER_R * CORNER_R)
    u = (abs(x) - (HALF - CORNER_LEN)) / CORNER_LEN
    return v * math.sqrt(max(1 - u * u, 0)) if u > 0 else v


def depth(height, peak, front):
    """Front-to-back depth: `front` at the midline, thinning faster than the height towards the corners, so
    the sides hug the arch. (Depth in step with height made a straight-edged cone seen from the side.)"""
    return front * (height / peak) ** 1.4 if height > 0 else 0.0


# Cross-sections as closed, uniform cubic B-spline control polygons in (d, h), normalised: d from the back
# (mucosal) face, 0, to the front of the vermilion, 1; h from the stomion, 0, to the vermilion border, 1
# (upper) or -1 (lower). Read off the source lip at the midline: the lips touch along a band reaching about
# a third of the way forward, the upper vermilion flares forwards to an everted border, and the lower bulges
# just below the stomion and rolls back towards its border.
UPPER = [(0.0, 0.10), (0.12, -0.03), (0.42, -0.03), (0.72, 0.06), (0.97, 0.38), (1.03, 0.80),
         (0.86, 1.04), (0.55, 1.02), (0.22, 0.86), (-0.02, 0.50)]
LOWER = [(0.0, -0.10), (0.12, 0.03), (0.42, 0.03), (0.76, -0.06), (1.02, -0.38), (0.98, -0.80),
         (0.74, -1.04), (0.42, -1.00), (0.12, -0.84), (-0.02, -0.48)]


def bspline_loop(ctrl, n):
    """n points on the closed uniform cubic B-spline of `ctrl`, rescaled so d spans exactly 0..1 and h
    exactly 0..+-1: the stomion contact then lies exactly on h = 0 for both lips (they touch, never cross)."""
    m, pts = len(ctrl), []
    for i in range(n):
        u = i * m / n
        k, t = int(u), u - int(u)
        b = ((1 - t) ** 3 / 6, (3 * t ** 3 - 6 * t ** 2 + 4) / 6, (-3 * t ** 3 + 3 * t ** 2 + 3 * t + 1) / 6, t ** 3 / 6)
        p = [ctrl[(k + j - 1) % m] for j in range(4)]
        pts.append((sum(b[j] * p[j][0] for j in range(4)), sum(b[j] * p[j][1] for j in range(4))))
    d0, d1 = min(p[0] for p in pts), max(p[0] for p in pts)
    hs = [p[1] for p in pts]
    up = max(hs) > -min(hs)
    h0 = min(hs) if up else max(hs)
    hspan = max(abs(h - h0) for h in hs)
    return [((d - d0) / (d1 - d0), (h - h0) / hspan) for d, h in pts]


def smoothstep(a, b, x):
    t = min(max((x - a) / (b - a), 0.0), 1.0)
    return t * t * (3 - 2 * t)


def bite_weight(x, lower):
    """Share of the lower jaw's offset a vertex follows: 0 at the middle of the upper lip, 1 at the middle of
    the lower, both reaching 0.5 at the commissures. It depends on x only, so every cross-section moves
    whole: the lips curve into a rounded open mouth instead of thinning to strings at the corners."""
    side = 0.5 * smoothstep(0.25, 1.0, abs(x) / HALF)
    return 1 - side if lower else side


def build_lip(name, lower):
    peak_h = lower_height(0) if lower else max(upper_height(i / 100) for i in range(100))
    # Back face to front of the vermilion at the midline (cm): 0.15-0.2 in front of the source's sheet.
    depth_mid = 0.75 if lower else 0.95
    loop = bspline_loop(LOWER if lower else UPPER, N_V)
    verts, weights, rings = [], [], []
    for i in range(N_U + 1):
        # Denser towards the commissures, where the lip narrows to a point.
        x = HALF * math.sin(math.pi / 2 * (2 * i / N_U - 1))
        s = abs(x) / HALF
        if i in (0, N_U):
            p = (x, teeth_front(x) - CLEAR, STOMION)
            verts.append(p); weights.append(0.5); rings.append(None)
            continue
        raw = lower_height(s) if lower else upper_height(s)
        h = rounded(raw, x)
        # Both lips share the contact band, so they share its depth: the thinner lip's.
        own = rounded(depth(raw, peak_h, depth_mid), x)
        dep = min(rounded(depth(min(upper_height(s), lower_height(s)), upper_height(0.3), 0.75), x), own)
        # Arch frame: the back line follows the teeth; outwards is the horizontal normal to it.
        dy = 0.436 * x - 0.0332 * x ** 3  # d(teeth_front)/dx
        ln = math.hypot(dy, 1.0)
        nx, ny = dy / ln, -1.0 / ln
        base = (x + nx * CLEAR, teeth_front(x) + ny * CLEAR)
        ring = []
        for dn, hn in loop:
            # The contact band (front third at h ~ 0) scales with the shared depth, the rest with the lip's own.
            d = dn * (dep + (own - dep) * smoothstep(0.25, 0.6, dn))
            p = (base[0] + nx * d, base[1] + ny * d, STOMION + hn * h)
            ring.append(len(verts)); verts.append(p); weights.append(bite_weight(x, lower))
        rings.append(ring)

    faces = []
    for i in range(N_U):
        a, b = rings[i], rings[i + 1]
        for j in range(N_V):
            k = (j + 1) % N_V
            if a is None:  # commissure tips: a fan to the single point
                faces.append((0, b[k], b[j]))
            elif b is None:
                faces.append((a[j], a[k], len(verts) - 1))
            else:
                faces.append((a[j], a[k], b[k], b[j]))
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.validate()
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    me.shade_smooth()
    attr = me.attributes.new("_BITE", "FLOAT", "POINT")
    attr.data.foreach_set("value", weights)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*COLOR, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*COLOR, 1)
    bsdf.inputs["Roughness"].default_value = 0.6
    me.materials.append(mat)
    return ob


bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.unit_settings.scale_length = 0.01  # the model is in centimetres, like dental.glb
upper = build_lip("upper-lip", lower=False)
lower = build_lip("lower-lip", lower=True)
for ob in (upper, lower):
    print(f"{ob.name}: {len(ob.data.vertices)} vertices, {len(ob.data.polygons)} faces")

os.makedirs(os.path.dirname(os.path.abspath(GLB_OUT)), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=GLB_OUT, export_format="GLB", export_apply=True, export_attributes=True,
                          export_draco_mesh_compression_enable=True, export_materials="EXPORT")
if BLEND_OUT:
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(BLEND_OUT), compress=True)
    backup = os.path.abspath(BLEND_OUT) + "1"
    if os.path.exists(backup):
        os.remove(backup)
