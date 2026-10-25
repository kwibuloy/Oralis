"""The Genetics Teeth path's molars: four inherited conditions built on a healthy lower first molar
(the Cariology molar's shape, from cariology_shape.py), each cut in half along the mesiodistal plane
through both roots, so enamel, dentin, cementum and pulp show on the cut face (GENETICS_PLAN.md, step 5).

Run headless (Blender 4.x), from the repo root; build_genetics.py then places the teeth on the path:
    blender -b --factory-startup -P scripts/blender/build_genetics_teeth.py -- models-src/genetics-teeth.blend

Objects are named `gt-<condition>-<tissue>` (keys in src/content/genetics.ts), all at the origin:
millimetres, Z up, +X distal, -Y buccal, z = 0 at the buccal cervical line (as cariology_shape.py).
The lingual half is kept (y >= 0), so the cut face looks at the default camera.

How each condition changes the healthy tooth (see CONDITIONS in genetics.ts for the notes):
- ai-hypoplastic: enamel only 0.3 mm thick (the DEJ is unchanged), with pits;
- ai-hypomaturation: normal thickness, the cusp tips chipped away;
- ai-hypocalcified: normal thickness at eruption, worn flat to the dentin;
- di: bulb-shaped crown with a narrow neck, short thin roots, only a thin remnant of the pulp chamber,
  enamel lost from the biting surface.

Surfaces are meshed from fields with OpenVDB, as in build_cariology.py: exact signed distances to
the tooth and to its crown without fissures are rebuilt from the first meshes, and every tissue is
a field of those, so neighbours share their borders. The cut is a Manifold boolean with a box, so cut
faces are exactly flat.
"""
import math
import os
import sys
import time

import bmesh
import bpy
import numpy as np
import openvdb as vdb

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cariology_shape as S  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
BLEND_OUT = argv[0] if argv else "models-src/genetics-teeth.blend"
H = float(os.environ.get("TEETH_H", 0.05))
ONLY = [s for s in os.environ.get("TEETH_ONLY", "").split(",") if s]
T0 = time.time()
bpy.ops.wm.read_factory_settings(use_empty=True)


def log(msg):
    print(f"{time.time() - T0:7.1f} s  {msg}", flush=True)


# ---------- lattice (only the kept half, plus a margin past the cut) ----------
LO, HI = np.array([-7.4, -0.6, -15.4]), np.array([7.4, 7.2, 9.4])
I0, I1 = np.floor(LO / H).astype(int), np.ceil(HI / H).astype(int)
BAND = 3.0


def axes(i0, i1):
    return [np.arange(a, b + 1) * H for a, b in zip(i0, i1)]


XS, YS, ZS = axes(I0, I1)


def to_grid(arr):
    g = vdb.FloatGrid(BAND * H)
    g.gridClass = vdb.GridClass.LEVEL_SET
    g.transform = vdb.createLinearTransform(H)
    g.copyFromArray(np.clip(arr, -BAND * H, BAND * H).astype(np.float32), tuple(int(v) for v in I0), 0.0)
    g.prune()
    return g


def field_by_slabs(fn, slab=40):
    """A field fn(X, Y, Z) evaluated on the whole lattice, slab by slab in z."""
    out = np.empty((len(XS), len(YS), len(ZS)), np.float32)
    X, Y = np.meshgrid(XS, YS, indexing="ij")
    for k in range(0, len(ZS), slab):
        zs = ZS[k:k + slab]
        Z = np.broadcast_to(zs, (len(XS), len(YS), len(zs)))
        out[:, :, k:k + slab] = fn(X[..., None], Y[..., None], Z)
    return out


def exact(arr):
    """Re-level an approximate field into a true signed distance (mesh it, then measure)."""
    p, t, q = to_grid(arr).convertToPolygons(0.0, 0.0)
    g = vdb.FloatGrid.createLevelSetFromPolygons(
        np.ascontiguousarray(p, np.float32), np.ascontiguousarray(t, np.uint32).reshape(-1, 3),
        np.ascontiguousarray(q, np.uint32).reshape(-1, 4), vdb.createLinearTransform(H), 3.0 / H, 3.0 / H)
    out = np.empty_like(arr)
    g.copyToArray(out, tuple(int(v) for v in I0))
    return out


# ---------- Blender meshes ----------


def bl_mesh(name, arr, adapt=0.005):
    p, t, q = to_grid(arr).convertToPolygons(0.0, adapt)
    me = bpy.data.meshes.new(name)
    t = np.asarray(t, np.int32).reshape(-1, 3)
    q = np.asarray(q, np.int32).reshape(-1, 4)
    loops = np.concatenate([t.ravel(), q.ravel()]).astype(np.int32)
    me.vertices.add(len(p))
    me.vertices.foreach_set("co", np.asarray(p, np.float32).ravel())
    me.loops.add(len(loops))
    me.loops.foreach_set("vertex_index", loops)
    me.polygons.add(len(t) + len(q))
    me.polygons.foreach_set("loop_start", np.concatenate([np.arange(len(t)) * 3, len(t) * 3 + np.arange(len(q)) * 4]).astype(np.int32))
    me.update(calc_edges=True)
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    return me


_bool = {}


def cut_half(me):
    """Keep y >= 0: a Manifold intersection with a box, so the cut face is exactly flat."""
    if not _bool:
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        lo, hi = (-20, 0.0, -30), (20, 20, 30)
        for v in bm.verts:
            v.co = [l + (c + 0.5) * (h - l) for l, h, c in zip(lo, hi, v.co)]
        box = bpy.data.meshes.new("_box")
        bm.to_mesh(box)
        bm.free()
        oa = bpy.data.objects.new("_cut", me)
        ob = bpy.data.objects.new("_box", box)
        for o in (oa, ob):
            bpy.context.scene.collection.objects.link(o)
        m = oa.modifiers.new("cut", "BOOLEAN")
        m.solver, m.object, m.operation = "MANIFOLD", ob, "INTERSECT"
        ob.hide_viewport = ob.hide_render = True
        _bool.update(a=oa, m=m)
    _bool["a"].data = me
    dg = bpy.context.evaluated_depsgraph_get()
    dg.update()
    return bpy.data.meshes.new_from_object(_bool["a"].evaluated_get(dg))


# ---------- the healthy tooth's distance fields ----------
log("healthy tooth fields")
TS = exact(field_by_slabs(S.tooth))
TSS = exact(field_by_slabs(S.smooth_tooth))
X3 = np.broadcast_to(XS[:, None, None], TS.shape)
Y3 = np.broadcast_to(YS[None, :, None], TS.shape)
Z3 = np.broadcast_to(ZS[None, None, :], TS.shape)
CEJ = S.cej(X3, Y3)
E = S.enamel_thickness(X3, Y3, Z3)
DS = TSS + E  # the DEJ: negative inside dentin
PULP = field_by_slabs(S.pulp)
log("fields ready")


def tissues(T, D, P, cej, Z, enamel_cap=None, damage=None):
    """Enamel, dentin, cementum and pulp from the tooth (T), DEJ (D) and pulp (P) fields.
    The dentin's outer surface is the DEJ on the crown and 0.15 mm under the root surface below it.
    `damage` (True where the condition took tooth away) becomes the app's halo (bake_defect)."""
    D = D + scallop()  # the DEJ is faintly scalloped, not smooth
    w = np.clip((Z - cej + 0.05) / 0.2, 0, 1)
    inner = w * D + (1 - w) * (T + 0.15)
    enamel = np.maximum.reduce([T, -inner, cej - Z])
    if enamel_cap is not None:
        enamel = np.maximum(enamel, enamel_cap)
    out = {
        "enamel": enamel,
        "cementum": np.maximum.reduce([T, -inner, Z - cej]),
        # Within the tooth's surface too: wear and chipping reach the dentin.
        "dentin": np.maximum(inner, T) if P is None else np.maximum.reduce([inner, T, -P]),
    }
    if P is not None:
        out["pulp"] = np.maximum.reduce([P, inner + 0.05, T])
    # What each tissue's cut-face pattern follows (see bake_patterns): enamel rods run out from the DEJ,
    # dentinal tubules out from the pulp, cementum lamellae along the root surface.
    out["_fields"] = {"enamel": D, "dentin": P if P is not None else inner, "cementum": -T}
    out["_damage"] = damage
    return out


def blur(a, r):
    """Box blur over 2r + 1 voxels along each axis, twice (close to a Gaussian about r voxels wide)."""
    for _ in range(2):
        for ax in range(3):
            c = np.cumsum(np.pad(a, [(r + 1, r) if i == ax else (0, 0) for i in range(3)], mode="edge"), axis=ax, dtype=np.float32)
            n = c.shape[ax]
            a = (np.take(c, np.arange(2 * r + 1, n), axis=ax) - np.take(c, np.arange(0, n - 2 * r - 1), axis=ax)) / (2 * r + 1)
    return a


def bake_defect(me, halo):
    """_defect, 0..1 per vertex: near where the condition took tooth away (pits, grooves, chips, wear, flaked
    enamel), fading over about 0.3 mm. The app tints it faintly so students see where to look."""
    co = np.empty(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get("co", co)
    d = np.clip(sample(halo, co.reshape(-1, 3).astype(np.float64)) * 3.0, 0, 1)
    me.attributes.new("_defect", "FLOAT", "POINT").data.foreach_set("value", d.astype(np.float32))


def bevel_cut(me):
    """Round the cut face's edge a little (0.06 mm, three segments), as on a sectioned teaching model: the
    tooth's outline and the borders between layers read as soft rims instead of hairlines. The cut face is
    first merged into polygons, so the bevel keeps an even width over Manifold's long thin triangles."""
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.normal_update()

    def on_cut(f):
        return f.normal.y < -0.999 and all(abs(v.co.y) < 1e-4 for v in f.verts)
    bmesh.ops.dissolve_faces(bm, faces=[f for f in bm.faces if on_cut(f)])
    bm.normal_update()
    edges = [e for e in bm.edges if len(e.link_faces) == 2 and on_cut(e.link_faces[0]) != on_cut(e.link_faces[1])]
    bmesh.ops.bevel(bm, geom=edges, offset=0.06, segments=3, profile=0.5, affect="EDGES", clamp_overlap=True)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    bm.to_mesh(me)
    bm.free()


VESSEL_COLOURS = {"artery": (0.78, 0.13, 0.12), "vein": (0.16, 0.27, 0.72), "nerve": (0.95, 0.78, 0.25)}


def vessels(pulp, name):
    """The pulp's blood vessels and nerve, schematic (as in histology texts: they enter at the apex and fan
    out under the horns): an artery (red) and a vein (blue) either side of the nerve (yellow), up each canal
    and into the chamber's horns. Traced along the middle of the pulp on the cut face and drawn half proud of
    it, so they read on the cut. Thin pulp (DI's remnant) gets them only where it is wide enough."""
    j = int(np.argmin(np.abs(YS - 0.06)))
    inside = pulp[:, j, :] < 0  # (x, z) on the cut
    tracks, done = [], []  # a track: [(x, z, half width)], plus the run (x0, x1) it ended on
    for k in range(inside.shape[1]):
        idx = np.flatnonzero(inside[:, k])
        runs = []
        if len(idx):
            cut = np.flatnonzero(np.diff(idx) > 1)
            for a, b in zip(np.concatenate([[idx[0]], idx[cut + 1]]), np.concatenate([idx[cut], [idx[-1]]])):
                if b - a >= 4:  # at least 0.2 mm wide
                    runs.append((XS[a], XS[b]))
        z = ZS[k]
        claimed = set()
        nxt = []
        for t in tracks:
            hits = [i for i, (x0, x1) in enumerate(runs) if x0 <= t["run"][1] and x1 >= t["run"][0]]
            if not hits:
                done.append(t)
                continue
            for n, i in enumerate(hits):
                x0, x1 = runs[i]
                p = ((x0 + x1) / 2, z, (x1 - x0) / 2)
                if i in claimed:  # two canals meet in the chamber: this one ends there
                    t["pts"].append(p)
                    done.append(t)
                    break
                claimed.add(i)
                if n == 0:
                    t["pts"].append(p)
                    t["run"] = runs[i]
                    nxt.append(t)
                else:  # the chamber splits towards a horn: a branch from the last point
                    nxt.append({"pts": [t["pts"][-2] if len(t["pts"]) > 1 else t["pts"][-1], p], "run": runs[i]})
        for i, (x0, x1) in enumerate(runs):
            if i not in claimed:
                nxt.append({"pts": [((x0 + x1) / 2, z, (x1 - x0) / 2)], "run": (x0, x1)})
        tracks = nxt
    done += tracks
    verts, faces, cols = [], [], []

    def tube(path, r, colour, sides=10):
        start = len(verts)
        for i, p in enumerate(path):
            a = path[max(i - 1, 0)]
            b = path[min(i + 1, len(path) - 1)]
            t = np.array(b) - np.array(a)
            t /= np.linalg.norm(t) or 1.0
            n = np.cross(t, (0.0, 1.0, 0.0))
            n /= np.linalg.norm(n) or 1.0
            bb = np.cross(t, n)
            for s in range(sides):
                ang = 2 * math.pi * s / sides
                verts.append(tuple(np.array(p) + r * (math.cos(ang) * n + math.sin(ang) * bb)))
                cols.append(colour)
        for i in range(len(path) - 1):
            for s in range(sides):
                a, b = start + i * sides + s, start + i * sides + (s + 1) % sides
                faces.append((a, b, b + sides, a + sides))
        for i, flip in ((0, True), (len(path) - 1, False)):
            c = len(verts)
            verts.append(tuple(path[i]))
            cols.append(colour)
            for s in range(sides):
                a, b = start + i * sides + s, start + i * sides + (s + 1) % sides
                faces.append((c, b, a) if flip else (c, a, b))

    for t in done:
        pts = t["pts"][::4] + ([t["pts"][-1]] if (len(t["pts"]) - 1) % 4 else [])
        if len(pts) < 2:
            continue
        # Smoothed, so the vessels curve gently instead of following every voxel step.
        sm = [pts[0]] + [tuple((np.array(pts[i - 1]) + 2 * np.array(pts[i]) + np.array(pts[i + 1])) / 4) for i in range(1, len(pts) - 1)] + [pts[-1]]
        for kind, side, r in (("artery", -0.38, 0.07), ("vein", 0.38, 0.085), ("nerve", 0.0, 0.06)):
            path = [(x + side * max(hw - 0.12, 0.0), 0.0, z) for x, z, hw in sm]
            tube(path, r, VESSEL_COLOURS[kind])
    if not faces:
        return None
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.shade_smooth()
    ca = me.color_attributes.new("Color", "FLOAT_COLOR", "POINT")
    ca.data.foreach_set("color", np.array([(*c, 1.0) for c in cols], np.float32).ravel())
    return me


_scallop = []


def scallop():
    if not _scallop:
        _scallop.append(0.035 * noise(0.22, 21, 8))
    return _scallop[0]


def sample(arr, pts):
    """Trilinear interpolation of a lattice field at points (N, 3), Blender millimetres."""
    g = pts / H - I0
    top = np.array(arr.shape) - 1.001
    g = np.clip(g, 0, top)
    i = np.floor(g).astype(int)
    f = g - i
    out = np.zeros(len(pts))
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                wgt = (f[:, 0] if dx else 1 - f[:, 0]) * (f[:, 1] if dy else 1 - f[:, 1]) * (f[:, 2] if dz else 1 - f[:, 2])
                out += wgt * arr[i[:, 0] + dx, i[:, 1] + dy, i[:, 2] + dz]
    return out


def bake_patterns(me, field, tissue):
    """Per-vertex _dir (the direction a tissue's structures run, in glTF axes) and _depth (distance used for
    incremental lines), for the app's cut-face streaks and bands (src/viewer/surface.ts)."""
    co = np.empty(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get("co", co)
    pts = co.reshape(-1, 3).astype(np.float64)
    depth = sample(field, pts)
    grad = np.stack([(sample(field, pts + e) - sample(field, pts - e)) / (2 * H) for e in np.eye(3) * H], axis=1)
    if tissue == "dentin":
        grad = -grad if np.mean(depth) < 0 else grad  # away from the pulp
        # Tubules run in a gentle S from the pulp to the DEJ (primary curvature), bending in the cut plane.
        ln = np.linalg.norm(grad, axis=1, keepdims=True)
        d = grad / np.maximum(ln, 1e-9)
        bend = np.cross(d, np.array([0.0, 1.0, 0.0]))
        grad = d + 0.35 * np.sin(np.abs(depth) * 1.3)[:, None] * bend
    ln = np.linalg.norm(grad, axis=1, keepdims=True)
    d = np.where(ln > 1e-6, grad / np.maximum(ln, 1e-9), 0.0)
    d_gltf = np.stack([d[:, 0], d[:, 2], -d[:, 1]], axis=1)  # Blender (x, y, z) -> glTF (x, z, -y)
    a = me.attributes.new("_dir", "FLOAT_VECTOR", "POINT")
    a.data.foreach_set("vector", d_gltf.astype(np.float32).ravel())
    b = me.attributes.new("_depth", "FLOAT", "POINT")
    b.data.foreach_set("value", np.abs(depth).astype(np.float32))


def balls(centres, r):
    """Union of spheres (signed distance)."""
    d = None
    for c in centres:
        e = np.sqrt((X3 - c[0]) ** 2 + (Y3 - c[1]) ** 2 + (Z3 - c[2]) ** 2) - r
        d = e if d is None else np.minimum(d, e)
    return d


def noise(scale, seed, octaves=10):
    """Smooth 3D noise in about -1..1 over the lattice: sums of sines along random directions (no grid artefacts)."""
    rng = np.random.default_rng(seed)
    n = np.zeros(TS.shape, np.float32)
    for _ in range(octaves):
        d = rng.normal(size=3)
        d /= np.linalg.norm(d)
        k = rng.uniform(0.7, 1.6) / scale
        n += np.sin((X3 * d[0] + Y3 * d[1] + Z3 * d[2]) * k + rng.uniform(0, 6.3)).astype(np.float32)
    return n / np.sqrt(octaves / 2)


def near_surface(T, depth):
    """Inside the tooth and within `depth` of its surface."""
    return np.maximum(T, -T - depth)


def healthy():
    return tissues(TS, DS, PULP, CEJ, Z3)


def hypoplastic():
    """Enamel only 0.3 mm thick over an unchanged DEJ, with pits and horizontal grooves where enamel
    formation stopped for a while (as in clinical photographs)."""
    T = np.maximum(TS, DS - 0.3)
    pits = [(x, y, S.occlusal_height(np.array(x), np.array(y)) - 1.9) for x, y in ((-2.0, 1.6), (0.6, 2.4), (2.6, 1.2), (-0.8, 3.4), (1.6, 3.9))]
    pits += [(x, 4.35, z) for x, z in ((-2.4, 4.6), (0.4, 3.6), (2.6, 4.2), (-1.0, 2.4))]
    pits += [(x, 0.15, S.occlusal_height(np.array(x), np.array(0.15)) - 1.75) for x in (-2.3, 1.4)]
    base = T
    T = np.maximum(T, -balls(pits, 0.32))
    # Two grooves round the crown, slightly wavy, 0.2 mm deep in the 0.3 mm enamel.
    for z0, seed in ((2.6, 3), (4.3, 4)):
        level = z0 + CEJ + 0.15 * noise(2.5, seed, 6)
        groove = np.maximum(np.abs(Z3 - level) - 0.22, -T - 0.2)
        T = np.maximum(T, -groove)
    return tissues(T, DS, PULP, CEJ, Z3, damage=(base < 0) & (T > 0))


def hypomaturation():
    """Normal thickness; soft enamel flaked off in ragged chips at the cusp tips and along the outline."""
    chips = [(-2.6, 2.85, 8.55), (1.75, 2.95, 8.35)]
    chips += [(x, 0.1, S.occlusal_height(np.array(x), np.array(0.1)) + 0.45) for x in (-3.3, 2.9)]
    ragged = 0.25 * noise(0.5, 5)
    T = np.maximum(TS, -(balls(chips, 1.05) + ragged))
    return tissues(T, DS, PULP, CEJ, Z3, damage=(TS < 0) & (T > 0))


def hypocalcified():
    """Normal thickness at eruption, then worn down across the cusps into the dentin, with an uneven,
    ragged edge; what is left of the soft enamel on the upper crown is a thin rough rim."""
    worn = Z3 - (4.4 + 0.3 * noise(1.6, 6) + 0.12 * noise(0.5, 7))
    rough = 0.06 * noise(0.35, 8)
    thin = np.where(Z3 > CEJ + 3.0, DS - 0.45 - 0.08 * noise(0.6, 9), -1.0)
    T = np.maximum.reduce([TS + np.where(Z3 > CEJ + 0.5, rough, 0), worn, thin])
    return tissues(T, DS, PULP, CEJ, Z3, damage=(TS < 0) & (T > 0.03))


def di():
    """Bulb-shaped crown with a narrow neck, short thin roots; the pulp nearly filled in; enamel flaked
    away in patches, mostly from the biting surface, baring the amber dentin."""
    def warp(x, y, z):
        bump = lambda c, w: np.exp(-((z - c) / w) ** 2)
        s = 1 + 0.12 * bump(3.4, 2.2) - 0.17 * bump(-0.2, 1.1) - 0.12 * (z < -1.0) * np.clip(-(z + 1.0) / 3.0, 0, 1)
        zr = np.where(z < 0, z * 1.5, z)  # roots about two-thirds as long
        return x / s, (y - 0.4) / s + 0.4, zr, s

    def field(fn):
        def f(x, y, z):
            xw, yw, zw, s = warp(x, y, z)
            return fn(xw, yw, zw) * s
        return f

    T = exact(field_by_slabs(field(S.tooth)))
    TSS_DI = exact(field_by_slabs(field(S.smooth_tooth)))
    xw, yw, zw, _ = warp(X3, Y3, Z3)
    D = TSS_DI + S.enamel_thickness(xw, yw, zw)
    cej = S.cej(xw, yw)
    # The soft dentin wears fast once the enamel goes: cusps flattened by attrition.
    whole = T
    T = np.maximum(T, Z3 - (6.0 + 0.3 * noise(1.5, 13)))
    # Enamel has flaked off the upper crown along a ragged line, and in patches lower down.
    edge = Z3 - (cej + 2.6 + 0.4 * noise(1.2, 10) + 0.12 * noise(0.4, 11))
    flakes = np.where(Z3 > cej + 1.0, noise(0.9, 12) - 0.6, -1.0)  # positive in patches: enamel gone there
    cap = np.maximum(edge, flakes)
    remnant = field_by_slabs(field(S.pulp)) + 0.45  # the pulp narrowed by dentin: chamber thinned, canals gone
    # Damage: the worn cusps, and the enamel layer (between the surface and the DEJ) where it flaked off.
    damage = ((whole < 0) & (T > 0)) | ((cap > 0) & (T < 0) & (D > 0) & (Z3 > cej))
    return tissues(T, D, remnant, cej, Z3, enamel_cap=cap, damage=damage)


# The healthy molar is only the base the conditions are built from; it is not shown.
CONDITIONS = {"ai-hypoplastic": hypoplastic, "ai-hypomaturation": hypomaturation,
              "ai-hypocalcified": hypocalcified, "di": di}
COLOURS = {"enamel": "#f4efe4", "dentin": "#e7cf9a", "cementum": "#dcc69a", "pulp": "#c8594f", "vessels": "#ffffff"}


def mark_cut(me):
    """_cut = 1 on the flat cut face (y = 0, facing -y), 0 elsewhere: the app keeps cut faces flat while it
    gives the tooth's natural surface its gloss, grain and stains (src/viewer/surface.ts)."""
    co = np.empty(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    attr = me.attributes.new("_cut", "FLOAT", "POINT")
    attr.data.foreach_set("value", (np.abs(co[:, 1]) < 1e-4).astype(np.float32))  # on the cut plane


for cond, make in CONDITIONS.items():
    if ONLY and cond not in ONLY:
        continue
    log(cond)
    made = make()
    patterns = made.pop("_fields")
    halo = np.clip(blur(made.pop("_damage").astype(np.float32), 6), 0, 1)
    meshes = {}
    for tissue, arr in made.items():
        name = f"gt-{cond}-{tissue}"
        me = cut_half(bl_mesh(name, arr))
        if not len(me.polygons):
            log(f"  {name}: empty, skipped")
            continue
        bevel_cut(me)
        meshes[tissue] = me
    if "pulp" in made:
        v = vessels(made["pulp"], f"gt-{cond}-vessels")
        if v:
            meshes["vessels"] = v
    for tissue, me in meshes.items():
        name = f"gt-{cond}-{tissue}"
        me.name = name
        if tissue != "vessels":
            me.set_sharp_from_angle(angle=math.radians(35))  # flat cut faces, smooth tooth surfaces and bevels
            mark_cut(me)
            bake_defect(me, halo)
        if tissue in patterns:
            bake_patterns(me, patterns[tissue], tissue)
        m = bpy.data.materials.new(name)
        c = tuple((int(COLOURS[tissue][i:i + 2], 16) / 255) ** 2.2 for i in (1, 3, 5))
        m.diffuse_color = (*c, 1.0)
        me.materials.append(m)
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        log(f"  {name}: {len(me.polygons)} faces")

for o in list(bpy.data.objects):
    if o.name.startswith("_"):
        bpy.data.objects.remove(o)
# Saved as a .blend (not a GLB): build_genetics.py copies the objects from it, custom attributes and all
# (Blender's glTF importer cannot read Draco-compressed custom attributes back).
os.makedirs(os.path.dirname(BLEND_OUT) or ".", exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(BLEND_OUT), compress=True)
log(f"wrote {BLEND_OUT}")
