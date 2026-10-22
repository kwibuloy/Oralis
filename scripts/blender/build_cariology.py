"""Author the Blender cariology tooth: a left mandibular first molar (FDI 36) with staged caries at
three sites, each in its own copy of the tooth with a quarter cut away through the lesion:

- pit-fissure: in the central pit, cut along the central groove (mesiobuccal quarter removed);
- smooth-surface: on the mesial surface just cervical to the contact area (occlusobuccal quarter removed);
- root: on the buccal root surface above receded gingiva (mesial crown above the lesion removed).

Run headless (Blender 4.5, which bundles OpenVDB and the Manifold boolean solver):
    "/d/Blender/blender.exe" -b --factory-startup -P scripts/blender/build_cariology.py -- models-src/cariology-blender.glb models-src/cariology-blender.blend

How it is built
- The tooth and pulp are signed-distance fields (cariology_shape.py). OpenVDB meshes each field, and
  turns the tooth mesh back into a true distance field from which the DEJ, the cementum, the lesion
  zones and the gingiva/bone collar are offset.
- Every tissue and lesion zone is a closed solid made with Manifold booleans from those surfaces, so
  neighbouring parts share their borders exactly (no slits) and cut faces are exactly flat.
- The tooth outside a box around the lesion ("base") is stored once per site; only the part inside
  the box is stored per stage, so a stage swaps in a small patch rather than a whole tooth.
- Normals come from the fields, not the triangles, so curved surfaces shade smoothly and the seam
  between the base and a stage patch does not show.

Objects are named <site>-base-<part> and <site>-s<stage>-<zone> (e.g. pit-fissure-s3-infected-dentin).
Each has a natural material outside and a study material on its cut faces. A JSON manifest beside
the GLB lists sites, stages, parts and lesion positions (glTF coordinates, Y up).

Environment: CARIO_H (grid step, mm; default 0.05), CARIO_SITES (comma list, to build a subset),
CARIO_CACHE (folder to cache the whole-tooth meshes and distance fields between runs).
"""
import json
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
GLB_OUT = argv[0] if argv else "models-src/cariology-blender.glb"
BLEND_OUT = argv[1] if len(argv) > 1 else None
H = float(os.environ.get("CARIO_H", 0.05))
# OpenVDB adaptive meshing: fewer, larger triangles where a surface is flat. At these settings 99.9%
# of the tooth surface stays within about 0.02 mm (visible) and 0.04 mm (hidden) of the true shape.
VISIBLE, HIDDEN = 0.01, 0.03
ONLY = [s for s in os.environ.get("CARIO_SITES", "").split(",") if s]
CACHE = os.environ.get("CARIO_CACHE")

T0 = time.time()
bpy.ops.wm.read_factory_settings(use_empty=True)


def log(msg):
    print(f"{time.time() - T0:7.1f} s  {msg}", flush=True)


# ---------- lattice ----------
# All grids share one lattice: index i is the point i * H. Dense arrays cover LO..HI.

LO, HI = np.array([-7.6, -7.4, -15.8]), np.array([7.6, 7.4, 9.2])
I0, I1 = np.floor(LO / H).astype(int), np.ceil(HI / H).astype(int)
BAND = 3.0  # voxels kept on each side of a surface when meshing
BOTTOM = -15.4  # bottom of the bone block


def irange(lo, hi):
    lo = np.maximum(np.floor(np.asarray(lo, float) / H).astype(int), I0)
    hi = np.minimum(np.ceil(np.asarray(hi, float) / H).astype(int), I1)
    return lo, hi


def axes(i0, i1):
    return [np.arange(a, b + 1) * H for a, b in zip(i0, i1)]


def grid():
    g = vdb.FloatGrid(BAND * H)
    g.gridClass = vdb.GridClass.LEVEL_SET
    g.transform = vdb.createLinearTransform(H)
    return g


def mesh_slabs(fill, i0, i1, slab=24, adapt=0.0):
    """Mesh the zero level of a field filled slab by slab: fill(xs, ys, zs) -> array (nx, ny, nz)."""
    g = grid()
    xs, ys, zs = axes(i0, i1)
    for k in range(0, len(zs), slab):
        v = np.clip(fill(xs, ys, zs[k:k + slab + 1]), -BAND * H, BAND * H).astype(np.float32)
        g.copyFromArray(v, (int(i0[0]), int(i0[1]), int(i0[2] + k)), 0.0)
    g.prune()
    p, t, q = g.convertToPolygons(0.0, adapt)
    return p, t, q


def analytic_fill(fn, coarse=6, lip=2.5):
    """Evaluate an analytic field only near its surface (decided on a coarse lattice)."""
    thr = coarse * H * 0.87 * lip + BAND * H

    def fill(xs, ys, zs):
        c = [a[::coarse] for a in (xs, ys, zs)]
        C = fn(*np.meshgrid(*c, indexing="ij"))
        idx = [np.minimum(np.rint(np.arange(len(a)) / coarse).astype(int), len(ca) - 1) for a, ca in zip((xs, ys, zs), c)]
        Cn = C[np.ix_(*idx)]
        out = np.where(Cn > 0, BAND * H, -BAND * H).astype(np.float32)
        near = np.abs(Cn) < thr
        X, Y, Z = np.meshgrid(xs, ys, zs, indexing="ij")
        out[near] = fn(X[near], Y[near], Z[near])
        return out
    return fill


def dense_sdf(p, t, q, i0, i1, out_band, in_band):
    """True signed distance to a closed mesh, as a dense array on the lattice range i0..i1."""
    g = vdb.FloatGrid.createLevelSetFromPolygons(
        np.ascontiguousarray(p, np.float32), np.ascontiguousarray(t, np.uint32).reshape(-1, 3),
        np.ascontiguousarray(q, np.uint32).reshape(-1, 4), vdb.createLinearTransform(H), out_band / H, in_band / H)
    arr = np.empty(tuple(np.asarray(i1) - np.asarray(i0) + 1), np.float32)
    g.copyToArray(arr, tuple(int(v) for v in i0))
    return arr


def sampler(arr, i0):
    """Trilinear interpolation of a dense lattice array at points (N, 3)."""
    top = np.array(arr.shape) - 1.001

    def f(P):
        u = np.clip(P / H - i0, 0, top)
        b = np.floor(u).astype(int)
        t = u - b
        out = 0.0
        for dx in (0, 1):
            for dy in (0, 1):
                for dz in (0, 1):
                    w = (t[:, 0] if dx else 1 - t[:, 0]) * (t[:, 1] if dy else 1 - t[:, 1]) * (t[:, 2] if dz else 1 - t[:, 2])
                    out = out + w * arr[b[:, 0] + dx, b[:, 1] + dy, b[:, 2] + dz]
        return out
    return f


# ---------- Blender meshes and booleans ----------


def bl_mesh(name, p, t, q):
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
    if volume(me) < 0:
        me.flip_normals()
    return me


def arrays(me):
    co = np.empty(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get("co", co)
    lv = np.empty(len(me.loops), np.int32)
    me.loops.foreach_get("vertex_index", lv)
    ls = np.empty(len(me.polygons), np.int32)
    me.polygons.foreach_get("loop_start", ls)
    lt = np.empty(len(me.polygons), np.int32)
    me.polygons.foreach_get("loop_total", lt)
    return co.reshape(-1, 3).astype(np.float64), lv, ls, lt


def volume(me):
    co, lv, ls, lt = arrays(me)
    v = 0.0
    for n in np.unique(lt):  # fan-triangulate each polygon size
        sel = ls[lt == n]
        a = co[lv[sel]]
        for j in range(1, n - 1):
            b, c = co[lv[sel + j]], co[lv[sel + j + 1]]
            v += np.einsum("ij,ij->i", a, np.cross(b, c)).sum() / 6
    return v


def empty(me):
    return me is None or len(me.polygons) == 0


_bool = {}


def boolean(a, b, op):
    """Manifold boolean of two closed meshes; returns a new mesh (empty if nothing is left)."""
    if empty(a):
        return None
    if empty(b):
        return a if op == "DIFFERENCE" else None
    if not _bool:
        oa, ob = bpy.data.objects.new("_bool_a", a), bpy.data.objects.new("_bool_b", b)
        for o in (oa, ob):
            bpy.context.scene.collection.objects.link(o)
        m = oa.modifiers.new("bool", "BOOLEAN")
        m.solver, m.object = "MANIFOLD", ob
        _bool.update(a=oa, b=ob, m=m)
    _bool["a"].data, _bool["b"].data = a, b
    _bool["m"].operation = op
    dg = bpy.context.evaluated_depsgraph_get()
    dg.update()
    res = bpy.data.meshes.new_from_object(_bool["a"].evaluated_get(dg))
    return None if empty(res) else res


def diff(a, b):
    return boolean(a, b, "DIFFERENCE")


def inter(a, b):
    return boolean(a, b, "INTERSECT")


def join(*ms):
    ms = [m for m in ms if not empty(m)]
    if not ms:
        return None
    bm = bmesh.new()
    for m in ms:
        bm.from_mesh(m)
    out = bpy.data.meshes.new("join")
    bm.to_mesh(out)
    bm.free()
    return out


def box(lo, hi):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = [l + (c + 0.5) * (h - l) for l, h, c in zip(lo, hi, v.co)]
    me = bpy.data.meshes.new("box")
    bm.to_mesh(me)
    bm.free()
    return me


# ---------- whole-tooth surfaces and distance fields ----------

TOOTH_LO, TOOTH_HI = (-6.3, -6.3, -15.0), (6.3, 6.3, 9.0)
CROWN_Z = -1.5  # above this the DEJ is offset from the tooth before its fissures were cut


def cached(name, make):
    path = os.path.join(CACHE, f"{name}-{H:g}.npz") if CACHE else None
    if path and os.path.exists(path):
        d = np.load(path)
        return tuple(d[k] for k in sorted(d.files))
    out = make()
    if path:
        os.makedirs(CACHE, exist_ok=True)
        np.savez(path, **{f"a{i}": a for i, a in enumerate(out)})
    return out


log("meshing the tooth")
TOOTH = cached("tooth", lambda: mesh_slabs(analytic_fill(S.tooth), *irange(TOOTH_LO, TOOTH_HI), adapt=VISIBLE))
SMOOTH = cached("smooth", lambda: mesh_slabs(analytic_fill(S.smooth_tooth), *irange((-6.3, -6.3, CROWN_Z - 0.5), TOOTH_HI)))
PULP = cached("pulp", lambda: mesh_slabs(analytic_fill(S.pulp), *irange((-5, -3.5, -15), (5, 3.5, 5)), adapt=HIDDEN))
log("distance fields")
(TS,) = cached("ts", lambda: (dense_sdf(*TOOTH, I0, I1, 3.0, 2.6),))
CROWN_I0 = irange((0, 0, CROWN_Z), (0, 0, 0))[0]
CROWN_I0 = np.array([I0[0], I0[1], CROWN_I0[2]])
(TSS,) = cached("tss", lambda: (dense_sdf(*SMOOTH, CROWN_I0, I1, 0.5, 2.8),))


def make_ds():
    ds = np.empty_like(TS)
    xs, ys, zs = axes(I0, I1)
    X, Y = np.meshgrid(xs, ys, indexing="ij")
    kc = CROWN_I0[2] - I0[2]
    for k, z in enumerate(zs):
        base = TSS[:, :, k - kc] if k >= kc else TS[:, :, k]
        ds[:, :, k] = base + S.enamel_thickness(X, Y, z)
    return (ds,)


(DS,) = cached("ds", make_ds)
T_AT, D_AT = sampler(TS, I0), sampler(DS, I0)
log("fields ready")


def dense_fill(fn):
    """Fill from a field fn(x, y, z, T, D) of lattice coordinates and the tooth and DEJ distances."""
    def fill(xs, ys, zs):
        i = [int(round(a[0] / H)) - o for a, o in zip((xs, ys, zs), I0)]
        sl = tuple(slice(a, a + len(v)) for a, v in zip(i, (xs, ys, zs)))
        X, Y, Z = np.meshgrid(xs, ys, zs, indexing="ij")
        return fn(X, Y, Z, TS[sl], DS[sl])
    return fill


def at_points(fn):
    """The same field at arbitrary points (N, 3), for normals."""
    return lambda P: fn(P[:, 0], P[:, 1], P[:, 2], T_AT(P), D_AT(P))


def field_mesh(name, fn, lo, hi, adapt=HIDDEN):
    p, t, q = mesh_slabs(dense_fill(fn), *irange(lo, hi), adapt=adapt)
    return bl_mesh(name, p, t, q)


# Tissue boundaries, as fields of (x, y, z, T, D).
def cementum_inner(x, y, z, T, D):
    """Inner surface of the cementum: 0.15 mm under the root surface, outside the tooth on the crown."""
    return T + np.interp(z - S.cej(x, y), [-1.0, -0.05, 0.15], [0.15, 0.15, -0.6])


def tooth_inner(x, y, z, T, D):
    """0.12 mm under the surface: the outer limit of the surface zone of an enamel lesion."""
    return T + 0.12


# ---------- the collar: periodontal ligament, alveolar bone and gingiva ----------

PDL, BONE, GUM, GUM_BELOW_CREST = 0.2, 1.0, 0.35, 2.2


def recession(x, y, amount):
    """Amount of recession, all of it on the buccal (-Y) and none lingually."""
    rho = np.sqrt(x * x + y * y) + 1e-9
    return amount * np.clip(-y / rho, 0, 1) ** 1.5


def collar(rec_gum=0.0, rec_bone=0.0):
    def crest(x, y):
        return S.cej(x, y) - 1.8 - recession(x, y, rec_bone)

    def margin(x, y):
        return S.cej(x, y) + 1.0 - recession(x, y, rec_gum)

    def septum(x, y, z):
        q = np.sqrt(np.maximum(np.abs(x) - 0.6, 0) ** 2 + np.maximum(np.abs(y) - 2.4, 0) ** 2)
        return smax3(q - 0.6, z - (S.TRUNK_BOTTOM - 0.9), BOTTOM - 1 - z)

    def bone(x, y, z, T, D):
        d = S.smin(T - PDL - BONE, septum(x, y, z), 0.8)
        d = S.smax(d, z - crest(x, y), 0.5)
        return S.smax(d, BOTTOM - z, 0.05)

    def gum(x, y, z, T, D):
        # A thin rounded margin hugging the tooth, filling out over the crest, then an even layer
        # over the bone that ends in a rounded edge.
        cr, mg = crest(x, y), margin(x, y)
        w = 0.45 + (PDL + BONE + GUM - 0.45) * np.clip((mg - z) / (mg - cr), 0, 1) ** 1.3
        d = S.smax(T - w, z - mg, 0.3)
        return S.smax(d, (cr - GUM_BELOW_CREST) - z, 0.4)

    def ligament(x, y, z, T, D):
        return T - PDL
    return bone, gum, ligament


def smax3(a, b, c):
    return np.maximum(np.maximum(a, b), c)


# ---------- lesions ----------
# Stage sizes in mm (the stage table of the old script, kept so both models teach the same thing).
# Enamel: pit & fissure r0/r1 (half-width at the surface and at the DEJ), smooth surface R/k (radius at
# the surface, fraction left at the DEJ); reach: fraction of the enamel thickness. Dentin and root
# fronts: [lateral half-width, depth]. Tertiary dentin: [thickness, half-width].
STAGES = {
    "pit-fissure": [
        {},
        {"enamel": dict(r0=0.5, r1=1.15, reach=0.55)},
        {"enamel": dict(r0=0.5, r1=1.5, reach=1), "micro": 0.4, "dentin": {"sclerotic": [1.2, 0.35]}},
        {"enamel": dict(r0=0.6, r1=1.8, reach=1), "micro": 0.45,
         "dentin": {"infected": [1.1, 0.45], "affected": [2.0, 1.0], "sclerotic": [2.5, 1.3]}, "tertiary": [0.2, 1.4]},
        {"enamel": dict(r0=1.1, r1=2.2, reach=1), "cavity": dict(open=0.8, wide=1.6, deep=0.6),
         "dentin": {"infected": [2.1, 1.0], "affected": [2.6, 1.3], "sclerotic": [3.0, 1.5]}, "tertiary": [0.3, 1.6]},
        {"enamel": dict(r0=1.9, r1=2.8, reach=1), "cavity": dict(open=1.6, wide=2.4, deep=1.0),
         "dentin": {"infected": [2.9, 1.35], "affected": [3.3, 1.55], "sclerotic": [3.6, 1.7]}, "tertiary": [0.45, 2.0]},
    ],
    "smooth-surface": [
        {},
        {"enamel": dict(R=0.95, k=0.3, reach=0.5)},
        {"enamel": dict(R=1.2, k=0.3, reach=1), "micro": [0.45, 0.25], "dentin": {"sclerotic": [1.0, 0.35]}},
        {"enamel": dict(R=1.35, k=0.35, reach=1), "micro": [0.5, 0.3],
         "dentin": {"infected": [0.9, 0.45], "affected": [1.6, 0.95], "sclerotic": [2.0, 1.2]}, "tertiary": [0.2, 1.2]},
        {"enamel": dict(R=1.65, k=0.45, reach=1), "cavity": dict(open=0.9, wide=1.6, deep=0.8),
         "dentin": {"infected": [2.0, 1.05], "affected": [2.4, 1.3], "sclerotic": [2.8, 1.5]}, "tertiary": [0.3, 1.3]},
        {"enamel": dict(R=2.2, k=0.6, reach=1), "cavity": dict(open=1.4, wide=2.0, deep=1.15),
         "dentin": {"infected": [2.6, 1.35], "affected": [3.0, 1.5], "sclerotic": [3.3, 1.65]}, "tertiary": [0.45, 1.7]},
    ],
    "root": [
        {},
        {"dentin": {"infected": [0.9, 0.12], "affected": [1.25, 0.32], "sclerotic": [1.45, 0.48]}},
        {"dentin": {"infected": [1.5, 0.75], "affected": [1.8, 1.0], "sclerotic": [2.0, 1.2]},
         "cavity": dict(wide=1.05, deep=0.55), "tertiary": [0.15, 1.2]},
        {"dentin": {"infected": [2.0, 1.05], "affected": [2.3, 1.25], "sclerotic": [2.5, 1.4]},
         "cavity": dict(wide=1.6, deep=0.85), "tertiary": [0.25, 1.6]},
    ],
}
ZONES_IN_ENAMEL = (0.12, 0.27)  # translucent zone: outermost 12% of the front; dark zone: the next 15%
RIM = 0.18  # rounding of a cavity rim, mm
BOWL_LIFT = 0.3  # how far the centre of a cavity bowl sits above the DEJ, mm
FRONT_ORDER = ("infected", "affected", "sclerotic")
# A cavity is always lined by its lesion: each front reaches at least this far (mm) past the cavity wall
# (enamel fronts outermost first, then the dentin fronts). Without it a front can run almost along the
# cavity wall, and two near-parallel surfaces cut each other into a ragged edge.
ENAMEL_LINING = (0.45, 0.35, 0.25)
DENTIN_LINING = {"infected": 0.15, "affected": 0.35, "sclerotic": 0.55}


def around(front, cavity, margin):
    """A lesion front grown to line a cavity (or microcavity) by at least `margin`. Blended, not a
    hard min: the crease of a min runs along the tooth surface, and OpenVDB meshes creases as steps."""
    if cavity is None:
        return front
    return lambda x, y, z, T, D: S.smin(front(x, y, z, T, D), cavity(x, y, z, T, D) - margin, 0.12)


def march(fn, start, step, n=4000):
    """First point along start + i * step where fn (of points (N, 3)) turns negative."""
    pts = np.asarray(start, float) + np.arange(n)[:, None] * np.asarray(step, float)
    v = fn(pts)
    i = int(np.argmax(v < 0))
    if v[i] >= 0:
        raise RuntimeError(f"no surface from {start} along {step}")
    a, b = pts[i - 1], pts[i]
    return a + (b - a) * (v[i - 1] / (v[i - 1] - v[i]))


def tooth_at(P):
    return S.tooth(P[:, 0], P[:, 1], P[:, 2])


def lobes(phi):
    """Gentle irregularity of a cavity outline, so it does not look turned on a lathe."""
    return 1 + 0.08 * np.sin(3 * phi + 0.6) + 0.05 * np.sin(5 * phi + 2.1)


def enamel_frac(T, D):
    """Depth through the enamel: 0 at the surface, 1 at the DEJ; and the local enamel thickness."""
    thk = np.maximum(D - T, 0.25)
    return -T / thk, thk


class Site:
    """A lesion site: its frame, cut, patch box, collar and lesion fields."""

    def __init__(self, name, origin, axis, cut, patch, collar_args=()):
        self.name, self.o, self.axis = name, np.asarray(origin, float), np.asarray(axis, float)
        self.cut, self.patch = cut, patch  # cut: (lo, hi) of the removed box; patch: (lo, hi)
        self.bone, self.gum, self.ligament = collar(*collar_args)

    t_dej = 0.0  # distance along the axis from the lesion origin to the DEJ (set once the DEJ exists)

    def along(self, x, y, z):
        """Distance along the lesion axis from the origin (into the tooth)."""
        o, a = self.o, self.axis
        return (x - o[0]) * a[0] + (y - o[1]) * a[1] + (z - o[2]) * a[2]

    # Lateral distance from the lesion axis, and the angle around it.
    def lat(self, x, y, z):
        o, a = self.o, self.axis
        px, py, pz = x - o[0], y - o[1], z - o[2]
        t = px * a[0] + py * a[1] + pz * a[2]
        return np.sqrt(np.maximum(px * px + py * py + pz * pz - t * t, 0))

    def phi(self, x, y, z):
        if abs(self.axis[2]) > 0.9:
            return np.arctan2(y - self.o[1], x - self.o[0])
        if abs(self.axis[0]) > 0.9:
            return np.arctan2(z - self.o[2], y - self.o[1])
        return np.arctan2(z - self.o[2], x - self.o[0])

    def depth(self, x, y, z, T, D):
        """Depth into dentin along the axis, from where the axis crosses the DEJ. The dentin lesion is
        half an ellipsoid on the DEJ: `a` wide along the DEJ (where it spreads first), `b` deep."""
        return self.along(x, y, z) - self.t_dej

    def enamel_front(self, e, k):
        raise NotImplementedError

    def dentin_front(self, a, b):
        def f(x, y, z, T, D):
            return (np.hypot(self.lat(x, y, z) / a, self.depth(x, y, z, T, D) / b) - 1) * min(a, b)
        return f

    def cavity(self, st, rounded=True):
        """Cavity (and microcavity) field, or None; `rounded` rounds its rim at the surface."""
        c, m = st.get("cavity"), st.get("micro")
        if c is None and m is None:
            return None

        def f(x, y, z, T, D):
            parts = []
            if c is not None:
                parts.append(np.maximum(self.cavity_shape(c, x, y, z, T, D), self.along(x, y, z) - (self.t_dej + c["deep"] + 0.3)))
            if m is not None:
                parts.append(self.micro_shape(m, x, y, z, T, D))
            cav = parts[0] if len(parts) == 1 else S.smin(parts[0], parts[1], 0.1)
            if not rounded:
                return cav
            # Round the rim where the cavity breaks through the surface by also removing the fillet
            # region under the rounded edge. The rounding is taken against the crown without its
            # fissures (D minus the enamel thickness): inside a narrow fissure the tooth distance
            # folds along the fissure mid-plane and the fold shows as a ragged rim. It is taken 0.05 mm
            # outside, so the fillet meets the tooth at an angle (a tangent meeting is ragged too), and
            # the region reaches 0.1 mm outside so it never shares a surface with the tooth.
            smooth = D - S.enamel_thickness(x, y, z)
            fillet = np.maximum(-S.smax(smooth - 0.05, -cav, RIM), T - 0.1)
            return np.minimum(cav, fillet)
        return f

    def cavity_shape(self, c, x, y, z, T, D):
        """Undermining cavity: opening `open` at the surface, `wide` at the DEJ, a bowl `deep` into dentin."""
        lob = lobes(self.phi(x, y, z))
        f, _ = enamel_frac(T, D)
        lat = self.lat(x, y, z)
        rim = (c["open"] + (c["wide"] - c["open"]) * np.clip(f, 0, 1)) * lob
        # Closed across the axis just past the DEJ, not along the DEJ: a floor parallel to the DEJ
        # would cut it at a grazing angle and leave a ragged line on the cavity wall.
        en = np.maximum(lat - rim, self.along(x, y, z) - (self.t_dej + 0.1))
        # The bowl is centred BOWL_LIFT into the enamel and is 15% wider than `wide` at the DEJ, so the
        # enamel part always ends inside it; otherwise its wall pokes out as a ring-shaped ridge.
        lift = BOWL_LIFT
        width = 1.15 * c["wide"] / np.sqrt(1 - (lift / (c["deep"] + lift)) ** 2)
        bowl = (np.hypot(lat / (width * lob), (self.depth(x, y, z, T, D) + lift) / (c["deep"] + lift)) - 1) * min(width, c["deep"] + lift)
        return S.smin(en, bowl, 0.15)


class PitFissure(Site):
    def enamel_front(self, e, k):
        reach = e["reach"] * (1 - k)

        def f(x, y, z, T, D):
            fr, thk = enamel_frac(T, D)
            d = self.lat(x, y, z) - (1 - k) * (e["r0"] + (e["r1"] - e["r0"]) * np.clip(fr, 0, 1))
            d = np.maximum(d, self.along(x, y, z) - (self.t_dej + 0.3))
            return d if reach > 0.98 else np.maximum(d, (fr - reach) * thk)
        return f

    def micro_shape(self, m, x, y, z, T, D):
        """The fissure breaks down a little around the pit: its walls open out into a wider V, a little
        deeper than the fissure floor, longer along the central groove than across it; in enamel only."""
        lob = lobes(self.phi(x, y, z))
        r = np.sqrt(((x - self.o[0]) / 1.8) ** 2 + (y - self.o[1]) ** 2)
        widening = r - m * lob * (0.45 + 0.55 * np.clip((z - self.o[2]) / 1.2, 0, 1.5))
        return smax3(widening, (self.o[2] - 0.25) - z, 0.05 - D)


class SmoothSurface(Site):
    def enamel_front(self, e, k):
        reach = e["reach"] * (1 - k)

        def f(x, y, z, T, D):
            fr, thk = enamel_frac(T, D)
            d = self.lat(x, y, z) - (1 - k) * e["R"] * (1 - (1 - e["k"]) * np.clip(fr, 0, 1))
            d = np.maximum(d, self.along(x, y, z) - (self.t_dej + 0.3))
            return d if reach > 0.98 else np.maximum(d, (fr - reach) * thk)
        return f

    def micro_shape(self, m, x, y, z, T, D):
        """A shallow dish (radius m[0], depth m[1]): a curved floor, so it never runs parallel to the
        surface layers it cuts through."""
        lob = lobes(self.phi(x, y, z))
        return (np.hypot(self.lat(x, y, z) / (m[0] * lob), -T / m[1]) - 1) * min(m[0], m[1])


class Root(Site):
    """Root lesions spread along the root (here mostly mesiodistally) more than they deepen."""

    def lat(self, x, y, z):
        return np.hypot((x - self.o[0]) / 1.9, (z - self.o[2]) / 1.0)

    def depth(self, x, y, z, T, D):
        """Root lesions follow the curve of the root surface, so depth is measured from it."""
        return -T

    def dentin_front(self, a, b):
        # Capped along the axis, so the front cannot reach another stretch of root surface (the
        # mesial face of the root) that lies within reach of the measured depth.
        f0 = super().dentin_front(a, b)
        return lambda x, y, z, T, D: np.maximum(f0(x, y, z, T, D), self.along(x, y, z) - 1.1 * b)

    def cavity_shape(self, c, x, y, z, T, D):
        lob = lobes(self.phi(x, y, z))
        return (np.hypot(self.lat(x, y, z) / (c["wide"] * lob), -T / c["deep"]) - 1) * min(c["wide"], c["deep"])


def make_sites():
    sites = []
    # Pit & fissure: the floor of the central pit; the lesion axis runs straight down.
    o = march(tooth_at, (S.CENTRAL_PIT[0], S.CENTRAL_PIT[1], 9.0), (0, 0, -0.002))
    sites.append(PitFissure("pit-fissure", o, (0, 0, -1),
                            cut=((-20, -20, -30), (o[0], o[1], 30)),
                            patch=((o[0] - 4.0, o[1] - 4.0, 1.0), (o[0] + 4.0, o[1] + 4.0, 9.0))))
    # Smooth surface: mesial surface just cervical to the contact area; the axis runs distally.
    o = march(tooth_at, (-7.0, -0.3, 4.2), (0.002, 0, 0))
    sites.append(SmoothSurface("smooth-surface", o, (1, 0, 0),
                               cut=((-20, -20, o[2]), (20, o[1], 30)),
                               patch=((o[0] - 1.0, o[1] - 4.1, 0.4), (0.3, o[1] + 4.1, 8.9))))
    # Root: buccal root surface over the mesial root, above the receded gingival margin.
    o = march(tooth_at, (-1.9, -8.0, -1.6), (0, 0.002, 0))
    sites.append(Root("root", o, (0, 1, 0),
                      cut=((-20, -20, o[2]), (o[0], 20, 30)),
                      patch=((-7.2, o[1] - 1.0, o[2] - 3.0), (3.4, 0.9, 1.6)),
                      collar_args=(3.8, 3.5)))
    return [s for s in sites if not ONLY or s.name in ONLY]


SITES = make_sites()
for s in SITES:
    log(f"{s.name}: lesion at {np.round(s.o, 2).tolist()}")


# ---------- materials ----------

def srgb(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return [v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c] + [1.0]


# zone: (natural colour outside, study colour on cut faces, roughness)
PALETTE = {
    "enamel": ("#ede6d3", "#cfdcea", 0.35),
    "dentin": ("#e3c891", "#f1d79e", 0.6),
    "cementum": ("#dcc69a", "#c4ab73", 0.7),
    "pulp": ("#c25f69", "#e05a6a", 0.6),
    "tertiary-dentin": ("#dbbf86", "#f4a77a", 0.6),
    # Outside, every enamel lesion zone shows the same chalky white of a white-spot lesion.
    "enamel-surface-zone": ("#f5f2ea", "#ffffff", 0.75),
    "enamel-lesion-body": ("#f5f2ea", "#c9b8e4", 0.75),
    "enamel-dark-zone": ("#f5f2ea", "#76689a", 0.75),
    "enamel-translucent-zone": ("#f5f2ea", "#98cde9", 0.75),
    "infected-dentin": ("#6e4a2c", "#5e3518", 0.8),
    "affected-dentin": ("#a5773d", "#c9893a", 0.7),
    "sclerotic-dentin": ("#d8bd84", "#c8e6d4", 0.6),
    "pdl": ("#e8b4b0", "#e8b4b0", 0.7),
    "alveolar-bone": ("#e2d8c4", "#e2d8c4", 0.8),
    "gingiva": ("#e3949a", "#e3949a", 0.55),
}
MATERIALS = {}


def materials(zone):
    if zone not in MATERIALS:
        natural, study, rough = PALETTE[zone]
        pair = []
        for label, colour in (("", natural), (" (cut)", study)):
            m = bpy.data.materials.new(zone + label)
            m.use_nodes = True
            bsdf = m.node_tree.nodes["Principled BSDF"]
            bsdf.inputs["Base Color"].default_value = srgb(colour)
            bsdf.inputs["Roughness"].default_value = rough
            m.diffuse_color = srgb(colour)
            pair.append(m)
        MATERIALS[zone] = pair
    return MATERIALS[zone]


# ---------- normals ----------


def grad(fn, P, e=0.004):
    g = np.empty_like(P)
    for i in range(3):
        d = np.zeros(3)
        d[i] = e
        g[:, i] = (fn(P + d) - fn(P - d)) / (2 * e)
    return g


def drop_specks(me, min_volume=5e-4):
    """Remove loose pieces smaller than min_volume (mm^3): slivers left where booleans graze."""
    bm = bmesh.new()
    bm.from_mesh(me)
    seen, specks, dropped = set(), [], []
    for f in bm.faces:
        if f.index in seen:
            continue
        island, stack = [], [f]
        seen.add(f.index)
        while stack:
            g = stack.pop()
            island.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h.index not in seen:
                        seen.add(h.index)
                        stack.append(h)
        vol = sum(t[0].vert.co.dot(t[1].vert.co.cross(t[2].vert.co)) for g in island for t in
                  [(g.loops[0], g.loops[i], g.loops[i + 1]) for i in range(1, len(g.loops) - 1)]) / 6
        if abs(vol) < min_volume:
            specks.extend(island)
            dropped.append((len(island), round(vol, 5)))
    if specks:
        bmesh.ops.delete(bm, geom=specks, context="FACES")
        bm.to_mesh(me)
    bm.free()
    return dropped


def finish(me, surfaces, planes, study_planes):
    """Shade from the fields: faces on a plane get the plane's normal (study material if it is a
    cut plane); faces on one of `surfaces` get that field's gradient; the rest keep mesh normals."""
    me.shade_smooth()
    co, lv, ls, lt = arrays(me)
    npoly = len(ls)
    pn = np.empty(npoly * 3, np.float32)
    me.polygons.foreach_get("normal", pn)
    pn = pn.reshape(-1, 3)
    pc = np.empty(npoly * 3, np.float32)
    me.polygons.foreach_get("center", pc)
    pc = pc.reshape(-1, 3).astype(np.float64)
    vn = np.empty(len(me.vertices) * 3, np.float32)
    me.vertex_normals.foreach_get("vector", vn)
    poly = np.repeat(np.arange(npoly), lt)
    ln = vn.reshape(-1, 3)[lv].astype(np.float64)
    done = np.zeros(npoly, bool)
    mat = np.zeros(npoly, np.int32)
    for j, (axis, value) in enumerate(planes):
        on = ~done & (np.abs(pc[:, axis] - value) < 1e-4) & (np.abs(pn[:, axis]) > 0.999)
        done |= on
        if (axis, value) in study_planes:
            mat[on] = 1
        sel = on[poly]
        n = np.zeros(3)
        n[axis] = 1
        ln[sel] = n * np.sign(pn[poly[sel], axis])[:, None]
    # Each remaining face goes to the surface it lies closest to (not the first one within reach:
    # near a rounded cavity rim a face can be close to both the tooth and the cavity).
    todo = np.nonzero(~done)[0]
    dist = np.full((len(surfaces), len(todo)), np.inf)
    for i, fn in enumerate(surfaces):
        if len(todo):
            dist[i] = np.abs(fn(pc[todo])) / (np.linalg.norm(grad(fn, pc[todo]), axis=1) + 1e-9)
    best = np.argmin(dist, axis=0) if len(todo) else np.zeros(0, int)
    # Within one grid step: large adaptive triangles on tight curves sit up to ~0.03 mm off the surface.
    near = dist.min(axis=0) < H if len(todo) else np.zeros(0, bool)
    for i, fn in enumerate(surfaces):
        hit = np.zeros(npoly, bool)
        hit[todo[near & (best == i)]] = True
        if not hit.any():
            continue
        sel = np.nonzero(hit[poly])[0]
        verts = np.unique(lv[sel])
        gv = np.zeros((len(co), 3))
        gv[verts] = grad(fn, co[verts])
        n = gv[lv[sel]]
        n /= np.linalg.norm(n, axis=1)[:, None] + 1e-12
        flip = np.einsum("ij,ij->i", n, pn[poly[sel]]) < 0
        n[flip] *= -1
        ln[sel] = n
    me.polygons.foreach_set("material_index", mat)
    me.normals_split_custom_set(ln.astype(np.float32).reshape(-1, 3).tolist())


def box_planes(lo, hi):
    return [(i, lo[i]) for i in range(3)] + [(i, hi[i]) for i in range(3)]


def cut_planes(site):
    """The two faces of the removed box that cut through the tooth."""
    lo, hi = site.cut
    return [(i, v) for i, v in box_planes(lo, hi) if abs(v) < 19]


def pulp_n(x, y, z, e=0.004):
    """Pulp field divided by its gradient length: close to a true distance near the pulp wall."""
    g = [(S.pulp(x + e * (i == 0), y + e * (i == 1), z + e * (i == 2)) - S.pulp(x - e * (i == 0), y - e * (i == 1), z - e * (i == 2))) / (2 * e)
         for i in range(3)]
    return S.pulp(x, y, z) / (np.sqrt(g[0] ** 2 + g[1] ** 2 + g[2] ** 2) + 1e-9)


# ---------- build ----------

def build():
    log("tissues")
    T = bl_mesh("tooth", *TOOTH)
    P = bl_mesh("pulp", *PULP)
    big = (LO - 1, HI + 1)
    # The DEJ and the inner cementum surface show wherever a cavity cuts through them: mesh finely.
    D = field_mesh("dej", lambda x, y, z, T, D: D, *big, VISIBLE)
    C = field_mesh("cementum-inner", cementum_inner, *big, VISIBLE)
    TIN = field_mesh("tooth-inner", tooth_inner, *big, VISIBLE)
    EN = diff(T, D)
    DC = inter(T, D)
    CE = diff(DC, C)
    DE0 = inter(DC, C)
    PU = inter(P, DE0)
    DE = diff(DE0, P)
    tissues = {"enamel": EN, "cementum": CE, "dentin": DE, "pulp": PU}
    log("tissues done: " + ", ".join(f"{k} {len(v.polygons)}" for k, v in tissues.items()))
    pulp_pts = arrays(PU)[0]

    finals, manifest = [], {"units": "mm", "up": "Y", "tooth": "36", "sites": {}}
    tooth_fn = tooth_at
    for site in SITES:
        log(f"{site.name}: base")
        corner = box(*site.cut)
        patch = box(*site.patch)
        cuts = cut_planes(site)
        pplanes = box_planes(*site.patch)
        bone_f, gum_f, lig_f = site.bone, site.gum, site.ligament
        collar_lo, collar_hi = (-7.5, -7.3, BOTTOM - 0.3), (7.5, 7.3, 3.0)
        B = field_mesh("bone-outer", bone_f, collar_lo, collar_hi, VISIBLE)
        G = field_mesh("gum-outer", gum_f, collar_lo, collar_hi, VISIBLE)
        L = field_mesh("ligament-outer", lig_f, *big)
        parts = {
            "alveolar-bone": diff(B, L),
            "pdl": diff(inter(L, B), T),
            "gingiva": diff(diff(G, B), T),
        }
        parts = {k: diff(v, corner) for k, v in parts.items()}
        pieces = {}
        for k, v in tissues.items():
            kept = diff(v, corner)
            parts[k] = diff(kept, patch)
            pieces[k] = inter(kept, patch)
        planes = cuts + [(2, BOTTOM)] + pplanes
        surfaces = [tooth_fn, at_points(bone_f), at_points(gum_f)]
        names = []
        for k, me in parts.items():
            if empty(me):
                continue
            finals.append((f"{site.name}-base-{k}", k, me, surfaces, planes, cuts, site.name, "base"))
            names.append(f"{site.name}-base-{k}")
        info = {"base": names, "stages": [], "lesion": [round(site.o[0], 3), round(site.o[2], 3), round(-site.o[1], 3)],
                "cut": [list(map(float, site.cut[0])), list(map(float, site.cut[1]))],
                "patch": [list(map(float, site.patch[0])), list(map(float, site.patch[1]))]}

        # Patch-local versions of the shared surfaces, so stage booleans stay small.
        grown = box(np.asarray(site.patch[0]) - 0.5, np.asarray(site.patch[1]) + 0.5)
        tin = inter(TIN, grown)
        plo, phi = np.asarray(site.patch[0]) - 0.4, np.asarray(site.patch[1]) + 0.4
        odej = site.o + site.axis * 0.02
        if not isinstance(site, Root):
            odej = march(at_points(lambda x, y, z, T, D: D), site.o, site.axis * 0.002)
            site.t_dej = float((odej - site.o) @ site.axis)
        q = pulp_pts[np.argmin(np.linalg.norm(pulp_pts - odej, axis=1))]

        for n, st in enumerate(STAGES[site.name]):
            log(f"{site.name}: stage {n}")
            out = {}
            cav_f = site.cavity(st)
            en, ce, de, pu = pieces["enamel"], pieces["cementum"], pieces["dentin"], pieces["pulp"]
            rim, raw = None, None
            if cav_f is not None:
                cav = field_mesh("cavity", cav_f, plo, phi, VISIBLE)
                en, ce, de = diff(en, cav), diff(ce, cav), diff(de, cav)
                # The surface zone breaks down along the edge of a cavity.
                raw = site.cavity(st, rounded=False)
                rim = field_mesh("cavity-rim", lambda x, y, z, T, D: raw(x, y, z, T, D) - 0.3, plo, phi, VISIBLE)
            if "enamel" in st:
                e = st["enamel"]
                # The outer front draws the lesion outline on the tooth surface, so it is meshed finely;
                # the inner ones only show on cut faces.
                f0, f1, f2 = (field_mesh(f"front{k}", around(site.enamel_front(e, k), raw, margin), plo, phi, VISIBLE if k == 0 else HIDDEN)
                              for k, margin in zip((0.0, *ZONES_IN_ENAMEL), ENAMEL_LINING))
                le = inter(en, f0)
                out["enamel"] = diff(en, f0)
                surface = diff(le, tin)
                if rim is not None:
                    surface = diff(surface, rim)
                out["enamel-surface-zone"] = surface
                rest = diff(le, surface) if surface is not None else le
                out["enamel-translucent-zone"] = diff(rest, f1)
                r1 = inter(rest, f1)
                out["enamel-dark-zone"] = diff(r1, f2)
                out["enamel-lesion-body"] = inter(r1, f2)
            else:
                out["enamel"] = en
            for zone in FRONT_ORDER:
                if zone not in st.get("dentin", {}):
                    continue
                fr = field_mesh(zone, around(site.dentin_front(*st["dentin"][zone]), raw, DENTIN_LINING[zone]), plo, phi, VISIBLE)
                out[f"{zone}-dentin"] = join(inter(de, fr), inter(ce, fr))
                de, ce = diff(de, fr), diff(ce, fr)
            out["dentin"], out["cementum"] = de, ce
            if "tertiary" in st:
                t, w = st["tertiary"]
                lens_lo, lens_hi = q - (w + 0.4), q + (w + 0.4)
                p_lens = mesh_slabs(analytic_fill(lambda x, y, z: -pulp_n(x, y, z) - t * (1 - ((x - q[0]) ** 2 + (y - q[1]) ** 2 + (z - q[2]) ** 2) / w ** 2), coarse=4),
                                    *irange(lens_lo, lens_hi), adapt=HIDDEN)
                lens = bl_mesh("lens", *p_lens)
                out["tertiary-dentin"] = inter(pu, lens)
                out["pulp"] = diff(pu, lens)
            else:
                out["pulp"] = pu
            stage_surfaces = [tooth_fn] + ([at_points(cav_f)] if cav_f is not None else [])
            names = []
            for k, me in out.items():
                if empty(me):
                    continue
                name = f"{site.name}-s{n}-{k}"
                finals.append((name, k, me, stage_surfaces, cuts + pplanes, cuts, site.name, f"stage {n}"))
                names.append(name)
            info["stages"].append(names)
        manifest["sites"][site.name] = info

    log("objects")
    keep = set()
    root_coll = bpy.data.collections.new("cariology")
    bpy.context.scene.collection.children.link(root_coll)
    colls = {}
    for name, zone, me, surfaces, planes, study, site, group in finals:
        me.name = name
        me.materials.clear()
        for m in materials(zone):
            me.materials.append(m)
        dropped = drop_specks(me)
        if dropped:
            log(f"{name}: dropped {len(dropped)} specks (faces, volume): {dropped[:6]}")
        finish(me, surfaces, planes, set(study))
        ob = bpy.data.objects.new(name, me)
        key = (site, group)
        if key not in colls:
            if site not in colls:
                colls[site] = bpy.data.collections.new(site)
                root_coll.children.link(colls[site])
            colls[key] = bpy.data.collections.new(f"{site} {group}")
            colls[site].children.link(colls[key])
        colls[key].objects.link(ob)
        keep.add(me.name)
    for o in list(bpy.data.objects):
        if o.name.startswith("_bool"):
            bpy.data.objects.remove(o)
    for m in list(bpy.data.meshes):
        if m.name not in keep:
            bpy.data.meshes.remove(m)
    return manifest, colls


manifest, colls = build()
tris = 0
for o in bpy.data.objects:
    if o.type != "MESH":
        continue
    o.data.calc_loop_triangles()
    tris += len(o.data.loop_triangles)
log(f"{len(bpy.data.objects)} objects, {tris} triangles")

os.makedirs(os.path.dirname(os.path.abspath(GLB_OUT)), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=os.path.abspath(GLB_OUT), export_format="GLB", export_apply=True, export_yup=True,
    export_normals=True, export_materials="EXPORT", export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=10, export_draco_position_quantization=14,
    export_draco_normal_quantization=10, export_draco_texcoord_quantization=12)
with open(os.path.splitext(os.path.abspath(GLB_OUT))[0] + ".json", "w") as fh:
    json.dump(manifest, fh, indent=1)
log(f"wrote {GLB_OUT} ({os.path.getsize(GLB_OUT) / 1e6:.1f} MB)")

if BLEND_OUT:
    # Open on the pit & fissure lesion at stage 3; every other stage is hidden but kept.
    for key, c in colls.items():
        if isinstance(key, tuple):
            c.hide_viewport = c.hide_render = key not in (("pit-fissure", "base"), ("pit-fissure", "stage 3"))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(BLEND_OUT), compress=True)
    for f in (BLEND_OUT + "1",):
        if os.path.exists(f):
            os.remove(f)
    log(f"wrote {BLEND_OUT}")
