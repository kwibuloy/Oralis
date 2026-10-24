"""Author the Genetics mode model: the DNA path (GENETICS_PLAN.md, step 3). One strand lying along
+x that packs as it goes: the real start of the DSPP gene as a double helix, then wound on histone
spools (nucleosomes), coiled into the 30 nm fibre, folded into loops on a protein scaffold, and at
the right end the X-shaped chromosome. The app travels along it (src/atlas/Genetics.tsx).

Run headless (Blender 4.x), from the repo root:
    blender -b --factory-startup -P scripts/blender/build_genetics.py -- public/models/genetics.glb models-src/genetics.blend

Every object name is a part key from src/content/genetics.ts. Geometry is written in the app's axes
(glTF: x along the path, y up, z towards the viewer) and turned into Blender's Z-up on output, so the
camera stops in genetics.ts (DNA_LEVELS) read the same numbers. The double helix is in nanometres;
each later level is squeezed (real sizes differ about 700 times from helix to chromosome), which the
app says on screen. The sequence is read from src/content/genetics-sequence.generated.json (fetched
from NCBI by scripts/fetch-dspp.mjs); strand 0 is the coding strand, read 5'->3' along +x.
"""
import json
import math
import os
import sys

import bpy

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
GLB_OUT = argv[0] if argv else "public/models/genetics.glb"
BLEND_OUT = argv[1] if len(argv) > 1 else None
DRACO = os.environ.get("GENETICS_DRACO", "1") == "1"

with open(os.path.join("src", "content", "genetics-sequence.generated.json"), encoding="utf-8") as f:
    DSPP = json.load(f)
LADDER = DSPP["exon2Coding"] + DSPP["intronStart"]
PAIR = {"A": "T", "T": "A", "G": "C", "C": "G"}

# ---------- level 1: B-DNA (nm) ----------
RISE = 0.34            # per base pair
PITCH = 10.5 * RISE    # about 10.5 base pairs per turn
R = 1.0                # phosphate radius: the helix is about 2 nm across
OFFSET = math.radians(144)  # angle between the two backbones at one base pair: the major and minor grooves
BACKBONE_R, RUNG_R, PHOSPHATE_R, HBOND_R = 0.16, 0.17, 0.27, 0.07
HBOND_GAP = 0.14       # rung halves stop short of the pair's centre; the hydrogen bonds fill the gap
HELIX_END = len(LADDER) * RISE

# ---------- later levels (squeezed) ----------
ROPE_R = 0.95                     # DNA drawn as a rope from here on, as thick as the helix
NUC_X0, NUC_STEP, NUC_COUNT = HELIX_END + 14, 13.0, 6
NUC_R, NUC_HALF, NUC_TURNS = 4.3, 2.8, 1.65   # wrap: about 1.7 turns round the octamer
CORE_R, CORE_H = 3.3, 5.2                      # histone octamer: a squat disc (11 nm x 5.7 nm, squeezed)
SOL_X0, SOL_R, SOL_PER_TURN, SOL_PITCH, SOL_COUNT = 125.0, 10.0, 6, 11.0, 36  # 30 nm fibre: about 6 per turn
SCAFFOLD_X0, SCAFFOLD_X1, SCAFFOLD_R = 212.0, 310.0, 2.4
LOOP_COUNT, LOOP_STEP, LOOP_REACH, LOOP_WIDTH, LOOP_R = 22, 4.4, 42.0, 9.0, 3.4
CX = 420.0                        # chromosome centre; drawn like chromosome 4 (short p arm, long q arm)
COIL_R, COIL_PITCH, COIL_TUBE = 8.0, 4.2, 3.4

COLOURS = {  # a hint for anyone opening the .blend; the app colours parts from genetics.ts
    "dna-sugar": "#8f9bb3", "dna-phosphate": "#f2c14e", "dna-hbond": "#d0d5dd",
    "dna-base-a": "#2f9e44", "dna-base-t": "#e03131", "dna-base-g": "#f59f00", "dna-base-c": "#1c7ed6",
    "dna-histone-octamer": "#a48de0", "dna-wrapped-dna": "#6c7fa8", "dna-linker-dna": "#6c7fa8", "dna-h1": "#e599f7",
    "dna-fibre": "#a48de0", "dna-loops": "#8c86cf", "dna-scaffold": "#f08c4a",
    "dna-p-arm": "#958ad8", "dna-q-arm": "#958ad8", "dna-centromere": "#f03e3e", "dna-kinetochore": "#fab005", "dna-telomere": "#20c997",
}
BASE_KEY = {b: f"dna-base-{b.lower()}" for b in "ATGC"}


# ---------- vector helpers (app axes) ----------
def sub(a, b): return (a[0] - b[0], a[1] - b[1], a[2] - b[2])
def add(a, b): return (a[0] + b[0], a[1] + b[1], a[2] + b[2])
def mul(a, s): return (a[0] * s, a[1] * s, a[2] * s)
def dot(a, b): return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
def cross(a, b): return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])
def length(a): return math.sqrt(dot(a, a))
def norm(a):
    n = length(a) or 1.0
    return mul(a, 1 / n)


def frames(path):
    """Rotation-minimising frames (tangent, normal, binormal) along a polyline."""
    t0 = norm(sub(path[1], path[0]))
    n = norm(cross(t0, (0, 1, 0) if abs(t0[1]) < 0.9 else (1, 0, 0)))
    out = []
    for i, _ in enumerate(path):
        t = norm(sub(path[min(i + 1, len(path) - 1)], path[max(i - 1, 0)]))
        n = norm(sub(n, mul(t, dot(n, t))))
        out.append((t, n, cross(t, n)))
    return out


def catmull(points, per_segment=8):
    """Smooth curve through points (centripetal-free uniform Catmull-Rom)."""
    pts = [points[0], *points, points[-1]]
    out = []
    for i in range(1, len(pts) - 2):
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[i + 1], pts[i + 2]
        for k in range(per_segment):
            t = k / per_segment
            t2, t3 = t * t, t * t * t
            out.append(tuple(0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3) for j in range(3)))
    out.append(points[-1])
    return out


def bezier(a, ta, b, tb, k, n=30):
    """Cubic from a (leaving along ta) to b (arriving along tb), handles k long."""
    c1, c2 = add(a, mul(norm(ta), k)), sub(b, mul(norm(tb), k))
    out = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        out.append(tuple(u * u * u * a[j] + 3 * u * u * t * c1[j] + 3 * u * t * t * c2[j] + t * t * t * b[j] for j in range(3)))
    return out


def wind(centre, axis, radius, half, turns, th0, n=70):
    """DNA wound round a spool: a helix of `turns` turns along `axis`, `half` either side of the centre."""
    t = norm(axis)
    nn = norm(cross(t, (0, 1, 0) if abs(t[1]) < 0.9 else (1, 0, 0)))
    b = cross(t, nn)
    out = []
    for k in range(n + 1):
        f = k / n
        th = th0 + f * turns * 2 * math.pi
        out.append(add(add(centre, mul(t, -half + 2 * half * f)), add(mul(nn, radius * math.cos(th)), mul(b, radius * math.sin(th)))))
    return out


class Part:
    """One selectable part's mesh, in app axes. Each vertex remembers its piece (a tube, a sphere...)
    and, on a tube, its ring along the tube's path: shape keys grow and shrink pieces by these."""

    def __init__(self):
        self.verts, self.faces = [], []
        self.ring, self.piece = [], []
        self.paths = {}  # piece -> its tube's path

    def _new_piece(self):
        return max(self.piece, default=-1) + 1

    def tube(self, path, radius, sides=10, caps=True):
        piece, start = self._new_piece(), len(self.verts)
        self.paths[piece] = path
        for i, (p, (_, n, b)) in enumerate(zip(path, frames(path))):
            for k in range(sides):
                a = 2 * math.pi * k / sides
                self.verts.append(add(p, add(mul(n, radius * math.cos(a)), mul(b, radius * math.sin(a)))))
                self.ring.append(i)
                self.piece.append(piece)
        rings = len(path)
        for i in range(rings - 1):
            for k in range(sides):
                a, b = start + i * sides + k, start + i * sides + (k + 1) % sides
                self.faces.append((a, b, b + sides, a + sides))
        if caps:
            for i, flip in ((0, True), (rings - 1, False)):
                c = len(self.verts)
                self.verts.append(path[i])
                self.ring.append(i)
                self.piece.append(piece)
                for k in range(sides):
                    a, b = start + i * sides + k, start + i * sides + (k + 1) % sides
                    self.faces.append((c, b, a) if flip else (c, a, b))

    def disc(self, centre, axis, radius, height, sides=32):
        """A closed cylinder of the given height along `axis`."""
        h = mul(norm(axis), height / 2)
        self.tube([sub(centre, h), add(centre, h)], radius, sides)

    def sphere(self, centre, radius, scale=(1, 1, 1), rings=12, segments=18):
        piece, start = self._new_piece(), len(self.verts)
        for i in range(rings + 1):
            phi = math.pi * i / rings
            for k in range(segments):
                th = 2 * math.pi * k / segments
                d = (math.sin(phi) * math.cos(th), math.cos(phi), math.sin(phi) * math.sin(th))
                self.verts.append(add(centre, (radius * scale[0] * d[0], radius * scale[1] * d[1], radius * scale[2] * d[2])))
                self.ring.append(0)
                self.piece.append(piece)
        for i in range(rings):
            for k in range(segments):
                a, b = start + i * segments + k, start + i * segments + (k + 1) % segments
                self.faces.append((a, b, b + segments, a + segments))

    def torus(self, centre, axis, major, minor, segments=40, sides=14, stretch=1.0, gap=0.0):
        """A ring around `axis` (a clamp round DNA); `stretch` lengthens it along the axis, and `gap`
        (radians) leaves it open on the side facing the viewer (+z), capped, so what it holds shows."""
        piece, start = self._new_piece(), len(self.verts)
        t = norm(axis)
        n = norm(cross(t, (0, 1, 0) if abs(t[1]) < 0.9 else (1, 0, 0)))
        b = cross(t, n)
        closed = gap <= 0
        rings = segments if closed else segments + 1
        for i in range(rings):
            u = 2 * math.pi * i / segments if closed else gap + (2 * math.pi - 2 * gap) * i / segments
            radial = add(mul(n, math.cos(u)), mul(b, math.sin(u)))
            for k in range(sides):
                v = 2 * math.pi * k / sides
                self.verts.append(add(centre, add(mul(radial, major + minor * math.cos(v)), mul(t, stretch * minor * math.sin(v)))))
                self.ring.append(0)
                self.piece.append(piece)
        for i in range(segments):
            for k in range(sides):
                a = start + i * sides + k
                b2 = start + i * sides + (k + 1) % sides
                c = start + ((i + 1) % rings) * sides + (k + 1) % sides
                d = start + ((i + 1) % rings) * sides + k
                self.faces.append((a, d, c, b2))  # outward-facing
        if not closed:
            for i, flip in ((0, False), (rings - 1, True)):
                u = gap if i == 0 else 2 * math.pi - gap
                c = len(self.verts)
                self.verts.append(add(centre, mul(add(mul(n, math.cos(u)), mul(b, math.sin(u))), major)))
                self.ring.append(0)
                self.piece.append(piece)
                for k in range(sides):
                    a, b2 = start + i * sides + k, start + i * sides + (k + 1) % sides
                    self.faces.append((c, b2, a) if flip else (c, a, b2))


SHRINK = 1e-3  # a hidden piece is its shape shrunk this much (not a point: the exporter would merge its vertices)


class Obj(Part):
    """A part on the processes path, with shape keys. Every key is an offset from the full shape that adds
    to the others (see PROCESS_MOTION in genetics.ts): show/grow keys bring a piece from shrunk to full,
    hide keys take it from full to shrunk, move keys slide it. The basis is what is seen before any key."""

    def __init__(self, node, key):
        super().__init__()
        self.node, self.key = node, key
        self.keys = {}
        self.basis = None

    def _basis(self):
        if self.basis is None:
            self.basis = list(self.verts)
        return self.basis

    def centres(self):
        sums = {}
        for v, pc in zip(self.verts, self.piece):
            s0 = sums.setdefault(pc, [0.0, 0.0, 0.0, 0])
            s0[0] += v[0]; s0[1] += v[1]; s0[2] += v[2]; s0[3] += 1
        return {pc: (s0[0] / s0[3], s0[1] / s0[3], s0[2] / s0[3]) for pc, s0 in sums.items()}

    def _shrunk(self, i, centres):
        c = centres[self.piece[i]]
        return add(c, mul(sub(self.verts[i], c), SHRINK))

    def show(self, name, pieces=None):
        """Grow each piece (or the listed ones) from its own centre."""
        basis, c = self._basis(), self.centres()
        delta = [(0.0, 0.0, 0.0)] * len(self.verts)
        for i in range(len(self.verts)):
            if pieces is None or self.piece[i] in pieces:
                basis[i] = self._shrunk(i, c)
                delta[i] = sub(self.verts[i], basis[i])
        self.keys[name] = delta

    def sequence(self, prefix, order):
        """Show the pieces one after another: key `${prefix}-k` brings in piece order[k-1]."""
        for k, pc in enumerate(order, start=1):
            self.show(f"{prefix}-{k}", [pc])

    def hide(self, name):
        c = self.centres()
        self.keys[name] = [sub(self._shrunk(i, c), self.verts[i]) for i in range(len(self.verts))]

    def move(self, name, offset):
        self.keys[name] = [offset] * len(self.verts)

    def toward(self, name, target):
        """Offsets that take each vertex of the full shape to `target`."""
        self.keys[name] = [sub(t, v) for v, t in zip(self.verts, target)]

    def grow(self, prefix, stages, piece=0):
        """A tube that grows from its start in `stages` steps: key `${prefix}-k` adds the k-th stretch."""
        path = self.paths[piece]
        last = len(path) - 1

        def shape(k):
            limit = round(last * k / stages) if k else -1
            out = []
            for i, v in enumerate(self.verts):
                if self.ring[i] <= limit:
                    out.append(v)
                else:  # piled up, shrunk, at the tip
                    tip = path[max(limit, 0)]
                    out.append(add(tip, mul(sub(v, path[self.ring[i]]), SHRINK)))
            return out

        shapes = [shape(k) for k in range(stages + 1)]
        self.basis = shapes[0]
        for k in range(1, stages + 1):
            self.keys[f"{prefix}-{k}"] = [sub(b, a) for a, b in zip(shapes[k - 1], shapes[k])]


parts = {key: Part() for key in COLOURS}


# ---------- level 1: double helix ----------
def backbone(x, strand):
    th = 2 * math.pi * x / PITCH + (OFFSET if strand else 0.0)
    return (x, R * math.cos(th), R * math.sin(th))


for s in (0, 1):
    parts["dna-sugar"].tube([backbone(i * 0.08, s) for i in range(int(HELIX_END / 0.08) + 1)], BACKBONE_R)
for i, base in enumerate(LADDER):
    x = (i + 0.5) * RISE
    p0, p1 = backbone(x, 0), backbone(x, 1)
    mid = mul(add(p0, p1), 0.5)
    for p, b in ((p0, base), (p1, PAIR[base])):
        inward = norm(sub(mid, p))
        parts[BASE_KEY[b]].tube([p, sub(mid, mul(inward, HBOND_GAP / 2))], RUNG_R, sides=8)
        parts["dna-phosphate"].sphere(p, PHOSPHATE_R, rings=8, segments=12)
    inward0 = norm(sub(mid, p0))
    parts["dna-hbond"].tube([sub(mid, mul(inward0, HBOND_GAP / 2 + 0.02)), add(mid, mul(inward0, HBOND_GAP / 2 + 0.02))], HBOND_R, sides=6)

# ---------- level 2: nucleosomes ----------
prev_end, prev_tan = (HELIX_END - 0.4, 0.0, 0.0), (1.0, 0.0, 0.0)
for i in range(NUC_COUNT):
    cx, th0 = NUC_X0 + i * NUC_STEP, i * 1.3
    wrap = []
    for k in range(91):
        t = k / 90
        th = th0 + t * NUC_TURNS * 2 * math.pi
        wrap.append((cx - NUC_HALF + 2 * NUC_HALF * t, NUC_R * math.cos(th), NUC_R * math.sin(th)))
    parts["dna-linker-dna"].tube(bezier(prev_end, prev_tan, wrap[0], sub(wrap[1], wrap[0]), 3), ROPE_R)
    parts["dna-wrapped-dna"].tube(wrap, ROPE_R)
    parts["dna-histone-octamer"].disc((cx, 0, 0), (1, 0, 0), CORE_R, CORE_H)
    # H1 sits where the DNA enters and leaves the spool.
    mid = mul(add(wrap[0], wrap[-1]), 0.5)
    radial = norm((0, mid[1], mid[2]))
    parts["dna-h1"].sphere((cx, radial[1] * (NUC_R + 1.5), radial[2] * (NUC_R + 1.5)), 1.1)
    prev_end, prev_tan = wrap[-1], sub(wrap[-1], wrap[-2])

# ---------- level 3: 30 nm fibre (solenoid) ----------
# Each spool of the fibre has its DNA wound round it, as at the nucleosome stop, slightly smaller.
sol = []
for j in range(SOL_COUNT):
    phi = j * 2 * math.pi / SOL_PER_TURN
    c = (SOL_X0 + j * SOL_PITCH / SOL_PER_TURN, SOL_R * math.cos(phi), SOL_R * math.sin(phi))
    sol.append(c)
    axis = (0.17, -math.sin(phi), math.cos(phi))
    parts["dna-fibre"].disc(c, axis, 3.0, 3.6, sides=24)
    w = wind(c, axis, 3.75, 1.9, NUC_TURNS, j * 1.1)
    parts["dna-linker-dna"].tube(bezier(prev_end, prev_tan, w[0], sub(w[1], w[0]), 2 if j else 6), 0.75)
    parts["dna-wrapped-dna"].tube(w, 0.75)
    prev_end, prev_tan = w[-1], sub(w[-1], w[-2])

# ---------- level 4: loops on a scaffold ----------
parts["dna-scaffold"].disc(((SCAFFOLD_X0 + SCAFFOLD_X1) / 2, 0, 0), (1, 0, 0), SCAFFOLD_R, SCAFFOLD_X1 - SCAFFOLD_X0)
loop = [sol[-1], (SOL_X0 + SOL_COUNT * SOL_PITCH / SOL_PER_TURN + 6, 2, 4), (SCAFFOLD_X0 - 1, 0, 0)]
for k in range(LOOP_COUNT):
    x0, psi = SCAFFOLD_X0 + 2 + k * LOOP_STEP, k * 2.4  # each loop turned by about the golden angle
    u, w = (0, math.cos(psi), math.sin(psi)), (0, -math.sin(psi), math.cos(psi))
    for n in range(25):
        t = n / 24
        loop.append(add(add((x0 + 4 * t, 0, 0), mul(u, LOOP_REACH * math.sin(math.pi * t))), mul(w, LOOP_WIDTH * math.sin(2 * math.pi * t))))
parts["dna-loops"].tube(catmull(loop, 3), LOOP_R, sides=12)

# ---------- level 5: chromosome ----------
def coil(axis_points, key):
    """A tightly coiled fibre around a smooth axis: one arm of one chromatid."""
    axis = catmull(axis_points, 40)
    lengths = [0.0]
    for a, b in zip(axis, axis[1:]):
        lengths.append(lengths[-1] + length(sub(b, a)))
    path = []
    for p, (_, n, b), s in zip(axis, frames(axis), lengths):
        th = s / COIL_PITCH * 2 * math.pi
        path.append(add(p, add(mul(n, COIL_R * math.cos(th)), mul(b, COIL_R * math.sin(th)))))
    # Resample densely so the coil is smooth: about 12 points per turn.
    dense = catmull(path[::2], 6)
    parts[key].tube(dense, COIL_TUBE, sides=12)


ends = []
for sx in (-1, 1):
    p_axis = [(CX + sx * 6, 0, 0), (CX + sx * 9, 13, 0), (CX + sx * 14, 34, 0)]
    q_axis = [(CX + sx * 6, 0, 0), (CX + sx * 8, -24, 0), (CX + sx * 12, -58, 0), (CX + sx * 16, -88, 0)]
    coil(p_axis, "dna-p-arm")
    coil(q_axis, "dna-q-arm")
    ends += [p_axis[-1], q_axis[-1]]
for e in ends:
    parts["dna-telomere"].sphere(e, 10, (1, 0.75, 1))
parts["dna-centromere"].sphere((CX, 0, 0), 9, (2.2, 0.75, 1.35))
for sx in (-1, 1):
    parts["dna-kinetochore"].disc((CX + sx * 21, 0, 0), (1, 0, 0), 5.5, 1.6)
# The loops lead into the bottom of the left chromatid's long arm.
parts["dna-loops"].tube(bezier((SCAFFOLD_X1 + 2, 0, 0), (1, 0, 0), add(ends[1], (0, -9, 0)), (0, 1, 0), 30, 80), LOOP_R, sides=12)

# =====================================================================================
# The processes path (stops in genetics.ts: PROCESS_STEPS, motion: PROCESS_MOTION). It lies
# PROCESS_Y below the DNA path: the replication fork at x = 0, the gene read around x = 90, the
# ribosome on the mRNA from x = 150. Nodes are `key~piece`, so a part can appear more than once.
# =====================================================================================
PROCESS_Y = -300.0
GENOMIC = DSPP["genomicFromStart"]
objs = {}


def obj(key, tag):
    node = f"{key}~{tag}"
    if node not in objs:
        objs[node] = Obj(node, key)
    return objs[node]


def frange(a, b, step):
    return [a + i * step for i in range(int(round((b - a) / step)) + 1)]


def letter(x, x_ref):
    """The chromosome base (coding strand) at x, counting base pairs from x_ref."""
    return GENOMIC[int((x - x_ref) / RISE) % len(GENOMIC)]


def helix_stretch(tag, x0, x1, x_ref):
    for s in (0, 1):
        obj("dna-sugar", tag).tube([backbone(x, s) for x in frange(x0, x1, 0.08)], BACKBONE_R)
    x = x0 + RISE / 2
    while x < x1:
        b = letter(x, x_ref)
        p0, p1 = backbone(x, 0), backbone(x, 1)
        mid = mul(add(p0, p1), 0.5)
        for p, bb in ((p0, b), (p1, PAIR[b])):
            obj(BASE_KEY[bb], tag).tube([p, sub(mid, mul(norm(sub(mid, p)), HBOND_GAP / 2))], RUNG_R, sides=8)
            obj("dna-phosphate", tag).sphere(p, PHOSPHATE_R, rings=8, segments=12)
        inward = norm(sub(mid, p0))
        obj("dna-hbond", tag).tube([sub(mid, mul(inward, HBOND_GAP / 2 + 0.02)), add(mid, mul(inward, HBOND_GAP / 2 + 0.02))], HBOND_R, sides=6)
        x += RISE


def single_point(x, strand, centre_y):
    th = 2 * math.pi * x / PITCH + (OFFSET if strand else 0.0)
    return (x, centre_y, 0.45 * math.sin(th))


# ---------- copying DNA (replication): fork at x = 0, unwound to the right ----------
REP_REF = -40.0


def ysep(x):
    return 1 + min(max(x, 0), 9) * 0.5


def inner(x, sign):
    """Where a new strand pairs with a parent strand: just inside it."""
    return sign * (ysep(x) - 0.95)


helix_stretch("rep", -40.0, 0.0, REP_REF)
for s, sign in ((0, 1), (1, -1)):
    obj("dna-sugar", "rep").tube([single_point(x, s, sign * ysep(x)) for x in frange(0, 40, 0.08)], BACKBONE_R)
    x = RISE / 2
    while x < 40:
        b = letter(x, REP_REF) if s == 0 else PAIR[letter(x, REP_REF)]
        p = single_point(x, s, sign * ysep(x))
        obj(BASE_KEY[b], "rep").tube([p, add(p, (0, -sign * 0.85, 0))], RUNG_R, sides=8)
        obj("dna-phosphate", "rep").sphere(p, PHOSPHATE_R, rings=8, segments=12)
        x += RISE
# Proteins are drawn at about their real size next to the 2 nm helix (10-15 nm for the big ones).
# The helicase (CMG) is a ring of six around the leading-strand template, just past the fork.
HEL_X = 3.5
hel_axis = norm((1, 0.5, 0))
hel_c = (HEL_X, ysep(HEL_X), 0)
hn = norm(cross(hel_axis, (0, 0, 1)))
hb = cross(hel_axis, hn)
for k in range(6):
    a = 2 * math.pi * k / 6
    obj("rep-helicase", "rep").sphere(add(hel_c, add(mul(hn, 2.8 * math.cos(a)), mul(hb, 2.8 * math.sin(a)))), 1.7)
obj("rep-topoisomerase", "rep").sphere((-12, 0.6, -1.6), 2.6, (1.3, 1, 1))
for x in frange(7.0, 16.6, 2.4):
    for sign in (1, -1):
        obj("rep-ssb", "rep").sphere((x, sign * (ysep(x) + 0.9), 0.6), 0.9)
o = obj("rep-primase", "rep")
o.sphere((8.5, -ysep(8.5) - 2.2, 1), 2.2)
o.show("primase-show")
o = obj("rep-rna-primer", "rep")
for a, b, sign in ((34, 37, 1), (3, 5.2, -1), (13, 15.2, -1), (23, 25.2, -1), (33, 35.2, -1)):
    o.tube([(x, inner(x, sign), 0) for x in frange(a, b, 0.25)], 0.32)
o.show("primers-show")
o = obj("rep-new-strand", "lead")
o.tube([(x, inner(x, 1), 0) for x in frange(36.5, 6.5, -0.25)], 0.26)
o.grow("lead", 6)
for k, (a, b) in enumerate(((3, 12.75), (13, 22.75), (23, 32.75), (33, 39.6))):
    o = obj("rep-okazaki", f"f{k}")
    o.tube([(x, inner(x, -1), 0) for x in frange(a, b, 0.25)], 0.26)
    o.grow(f"frag{k}", 3)
o = obj("rep-dna-polymerase", "lead")
# A polymerase sits on the template and the strand it builds (about 10 nm).
o.sphere((36.5, inner(36.5, 1) - 0.4, 1.0), 2.6, (1.3, 1, 1))
o.show("lpol-show")
o.move("lpol-move1", (12 - 36.5, 0, 0))
o.move("lpol-move2", (9 - 12, 0, 0))  # ends just behind the helicase
o = obj("rep-dna-polymerase", "lag")
o.sphere((39, inner(39, -1) + 0.4, 1.0), 2.6, (1.3, 1, 1))
o.show("gpol-show")
o.move("gpol-move", (6 - 39, inner(6, -1) - inner(39, -1), 0))
o = obj("rep-ligase", "rep")
for x in (12.9, 22.9, 32.9):
    o.sphere((x, inner(x, -1) - 1.6, 0.6), 1.6)
o.show("ligase-show")

# ---------- reading DNA (transcription): the gene from x = 60, a bubble at 86-90.4 ----------
TX_REF, BUB0, BUB1 = 60.0, 86.0, 90.4  # a bubble of about 13 base pairs
helix_stretch("tx", 60.0, BUB0, TX_REF)
helix_stretch("tx", BUB1, 124.0, TX_REF)


def bubble(opened):
    """The stretch that opens: the same pieces, closed (a helix) or open (two strands apart)."""
    out = {}

    def part(key):
        return out.setdefault(key, Part())

    def at(x, s):
        if not opened:
            return backbone(x, s)
        return single_point(x, s, (1 if s == 0 else -1) * (1 + 1.4 * math.sin(math.pi * (x - BUB0) / (BUB1 - BUB0))))

    for s, key in ((0, "tx-coding-strand"), (1, "tx-template-strand")):
        part(key).tube([at(x, s) for x in frange(BUB0, BUB1, 0.08)], BACKBONE_R)
    x = BUB0 + RISE / 2
    while x < BUB1:
        b = letter(x, TX_REF)
        c0, c1 = backbone(x, 0), backbone(x, 1)
        mid = mul(add(c0, c1), 0.5)
        for s, bb in ((0, b), (1, PAIR[b])):
            p = at(x, s)
            if opened:
                end = add(p, (0, -0.85 if s == 0 else 0.85, 0))
            else:
                end = sub(mid, mul(norm(sub(mid, c0 if s == 0 else c1)), HBOND_GAP / 2))
            part(BASE_KEY[bb]).tube([p, end], RUNG_R, sides=8)
            part("dna-phosphate").sphere(p, PHOSPHATE_R, rings=8, segments=12)
        inward = norm(sub(mid, c0))
        part("dna-hbond").tube([sub(mid, mul(inward, HBOND_GAP / 2 + 0.02)), add(mid, mul(inward, HBOND_GAP / 2 + 0.02))],
                               HBOND_R * (SHRINK if opened else 1), sides=6)
        x += RISE
    return out


closed, opened = bubble(False), bubble(True)
for key, part in closed.items():
    o = obj(key, "bubble")
    o.verts, o.faces, o.ring, o.piece = part.verts, part.faces, part.ring, part.piece
    o.keys["bubble-open"] = [sub(b, a) for a, b in zip(part.verts, opened[key].verts)]
for x in (77.0, 79.5, 82.0):
    obj("tx-promoter", "tx").torus((x, 0, 0), (1, 0, 0), 1.6, 0.28)
obj("tx-transcription-factors", "tx").sphere((76.5, -2.7, 1.2), 1.8)
obj("tx-transcription-factors", "tx").sphere((80.5, -2.9, -1.0), 1.8)
# RNA polymerase II, about 15 nm: a thick clamp round the DNA that holds the bubble.
o = obj("tx-rna-polymerase", "tx")
o.torus((80, 0, 0), (1, 0, 0), 4.6, 2.0, stretch=1.8, gap=math.radians(55))  # cut away at the front
o.move("rnap-move", ((BUB0 + BUB1) / 2 - 80, 0, 0))
o.hide("rnap-hide")
o = obj("tx-mrna", "ex1")
o.tube(catmull([(88.6, 2.4, 0.6), (90, 6, 1), (94, 9, 1), (99, 10, 0)], 12), 0.42)
o.grow("ex1", 3)
o = obj("tx-intron", "tx")
o.tube(catmull([(99, 10, 0), (100.5, 13.5, 0), (103, 15, 0), (105, 13.5, 0), (104, 10, 0)], 12), 0.42)
o.grow("intron", 3)
o.hide("intron-hide")
o = obj("tx-mrna", "ex2")
o.tube(catmull([(104, 10, 0), (110, 10.6, 0), (116, 11, 0)], 12), 0.42)
o.grow("ex2", 3)
o.move("ex2-join", (-5, 0, 0))
o = obj("tx-cap", "tx")
o.sphere((88.6, 2.4, 0.6), 0.95)
o.show("cap-show")
o = obj("tx-poly-a", "tx")
for i in range(8):
    o.sphere((111.6 + i * 0.85, 11.05, 0), 0.45)
o.show("tail-show")

# ---------- making a protein (translation): the mRNA from x = 150 ----------
NT, M0, STOP_X0 = 0.85, 150.0, 252.0  # one base every 0.85, a codon every 2.55
RNA = DSPP["exon2Coding"] + DSPP["exon3Start"]
XR0 = M0 + 1.5 * NT                    # ribosome P site over the start codon
MOVE1 = 12 * 3 * NT                    # twelve codons along
XR2 = STOP_X0 + 1.5 * NT - 3 * NT      # A site over the stop codon
MOVE2 = XR2 - (XR0 + MOVE1)


def rna_base(b):
    return "rna-base-u" if b == "T" else BASE_KEY[b]


obj("tx-mrna", "tl").tube([(M0 - 1.5, 0, 0), (STOP_X0 + 6, 0, 0)], 0.45)
for i, b in enumerate(RNA):
    x = M0 + (i + 0.5) * NT
    obj(rna_base(b), "tl").tube([(x, 0.4, 0), (x, 1.25, 0)], RUNG_R, sides=8)
for j, b in enumerate(DSPP["stopCodon"]):
    x = STOP_X0 + (j + 0.5) * NT
    obj(rna_base(b), "tl").tube([(x, 0.4, 0), (x, 1.25, 0)], RUNG_R, sides=8)
obj("tl-start-codon", "tl").disc((M0 + 1.5 * NT, 0, 0), (1, 0, 0), 0.68, 3 * NT)
obj("tl-stop-codon", "tl").disc((STOP_X0 + 1.5 * NT, 0, 0), (1, 0, 0), 0.68, 3 * NT)


def rides(o):
    o.move("ribo-move1", (MOVE1, 0, 0))
    o.move("ribo-move2", (MOVE2, 0, 0))


# The ribosome is about 25 nm across and covers about ten codons. The mRNA runs between its halves;
# both sit behind it (-z) so the tRNAs on the codons stay in view.
o = obj("tl-small-subunit", "tl")
o.sphere((XR0 + 1, -4.6, -4), 1, (11, 4, 6))   # body
o.sphere((XR0 - 6.5, -2.4, -4), 3.6)           # head
rides(o)
o.move("small-leave", (18, -8, -8))
o = obj("tl-large-subunit", "tl")
o.sphere((XR0, 8.5, -6), 1, (12.5, 7.5, 7))    # body
o.sphere((XR0 + 1, 15.5, -6), 3.5)             # central protuberance
o.torus((XR0 - 6, 14.8, -1.0), (0, 1, 0), 1.2, 0.35)  # mouth of the exit tunnel
o.show("large-show")
rides(o)
o.move("large-leave", (18, 6, -14))  # up and away, clear of the folding protein


def l_shape(o, x):
    """A tRNA-like L, about 7 nm: anticodon arm up from the codon, then the acceptor arm across."""
    elbow = (x - 0.6, 6.3, 2.2)
    o.tube([(x, 1.35, 2.2), elbow], 0.5)
    tip = (x + 3.0, 7.4, 2.2)
    o.tube([elbow, tip], 0.5)
    return tip


def trna(x, tag):
    o = obj("tl-trna", tag)
    o.sphere(add(l_shape(o, x), (0.6, 0.3, 0)), 0.7)  # its amino acid, on the acceptor end
    return o


o = trna(XR0, "t1")
rides(o)
o.hide("trna1-hide")
o = trna(XR0 + 3 * NT, "t2")
o.show("trna2-show")
rides(o)
o.hide("trna2-hide")
o = obj("tl-polypeptide", "chain")
EXIT = (XR0 - 6, 15.4, -1.0)
beads = [add(EXIT, (-0.7 * i, 0.9 * i + 0.5 * math.sin(i * 1.3), 0.4 * math.cos(i))) for i in range(12)]
for c in beads:
    o.sphere(c, 0.55)
o.sequence("chain", list(range(12)))
rides(o)
folded = []
for i in range(12):  # a compact ball beside where the ribosome was
    ph, th = math.acos(1 - 2 * (i + 0.5) / 12), math.pi * (1 + math.sqrt(5)) * i
    folded.append((XR0 - 12 + 1.9 * math.sin(ph) * math.cos(th), 19 + 1.9 * math.cos(ph), 1.0 + 1.9 * math.sin(ph) * math.sin(th)))
o.toward("fold", [add(v, sub(folded[o.piece[i]], beads[o.piece[i]])) for i, v in enumerate(o.verts)])
# The release factor is shaped like a tRNA and binds the A site at the stop codon.
o = obj("tl-release-factor", "tl")
o.sphere(add(l_shape(o, XR2 + 3 * NT), (0.4, 0.2, 0)), 0.6)
o.show("rf-show")
o.hide("rf-hide")

# The whole processes path sits below the DNA path.
for o in objs.values():
    o.verts = [(v[0], v[1] + PROCESS_Y, v[2]) for v in o.verts]
    if o.basis is not None:
        o.basis = [(v[0], v[1] + PROCESS_Y, v[2]) for v in o.basis]

# =====================================================================================
# The Teeth path (stops in genetics.ts: TEETH_STEPS), PROCESS_Y further down again. A ladder with a
# stop at each tooth gene: the gene's real first 60 coding bases, its backbone in the gene's colour,
# grey ladder between (the genes really lie on different chromosomes). The teeth come from
# models-src/genetics-teeth.glb (build_genetics_teeth.py) and are placed when the file is written:
# the affected tooth to the left of its gene, a healthy one to the right.
# =====================================================================================
TEETH_Y = 2 * PROCESS_Y
GENE_X = {"ENAM": 0.0, "MMP20": 90.0, "FAM83H": 180.0, "DSPP": 270.0}
GENE_CONDITION = {"ENAM": "ai-hypoplastic", "MMP20": "ai-hypomaturation", "FAM83H": "ai-hypocalcified", "DSPP": "di"}
TOOTH_SIDE, TOOTH_CEJ_Y = 8.5, 17.0
TEETH_GLB = os.path.join("models-src", "genetics-teeth.glb")
teeth = {}


def tobj(key):
    node = f"{key}~teeth"
    if node not in teeth:
        teeth[node] = Obj(node, key)
    return teeth[node]


def ladder(x0, x1, seq=None, backbone_key="gt-between"):
    """A stretch of ladder: real letters when `seq` is given, plain grey otherwise."""
    for s in (0, 1):
        tobj(backbone_key).tube([backbone(x, s) for x in frange(x0, x1, 0.08)], BACKBONE_R)
    i = 0
    x = x0 + RISE / 2
    while x < x1:
        p0, p1 = backbone(x, 0), backbone(x, 1)
        mid = mul(add(p0, p1), 0.5)
        b = seq[i] if seq else None
        for p, bb in ((p0, b), (p1, PAIR[b] if b else None)):
            tobj(BASE_KEY[bb] if bb else "gt-between").tube([p, sub(mid, mul(norm(sub(mid, p)), HBOND_GAP / 2))], RUNG_R, sides=8)
            tobj("dna-phosphate" if seq else "gt-between").sphere(p, PHOSPHATE_R, rings=8, segments=12)
        if seq:
            inward = norm(sub(mid, p0))
            tobj("dna-hbond").tube([sub(mid, mul(inward, HBOND_GAP / 2 + 0.02)), add(mid, mul(inward, HBOND_GAP / 2 + 0.02))], HBOND_R, sides=6)
        x += RISE
        i += 1


x_prev = -30.0
for gene, gx in GENE_X.items():
    seq = DSPP["teethGenes"][gene]["codingStart"]
    half = len(seq) * RISE / 2
    ladder(x_prev, gx - half)
    ladder(gx - half, gx + half, seq, f"gt-gene-{gene.lower()}")
    x_prev = gx + half
ladder(x_prev, 300.0)
for o in teeth.values():
    o.verts = [(v[0], v[1] + TEETH_Y, v[2]) for v in o.verts]

# ---------- write Blender objects ----------
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def to_blender(p):
    return (p[0], -p[2], p[1])  # app (glTF, y up) -> Blender (z up); the exporter turns it back


def material(key, hex_colour):
    m = bpy.data.materials.new(key)
    c = tuple((int(hex_colour[i:i + 2], 16) / 255) ** 2.2 for i in (1, 3, 5))
    m.diffuse_color = (*c, 1.0)
    m.use_nodes = True
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = m.diffuse_color
    return m


PROCESS_COLOURS = {
    "rep-helicase": "#e64980", "rep-topoisomerase": "#15aabf", "rep-ssb": "#94d82d", "rep-primase": "#fd7e14", "rep-rna-primer": "#ff6b6b",
    "rep-dna-polymerase": "#7950f2", "rep-new-strand": "#4dabf7", "rep-okazaki": "#74c0fc", "rep-ligase": "#f59f00",
    "tx-promoter": "#51cf66", "tx-transcription-factors": "#63e6be", "tx-rna-polymerase": "#e8590c", "tx-template-strand": "#3b4252",
    "tx-coding-strand": "#adb5bd", "tx-mrna": "#f783ac", "tx-intron": "#adb5bd", "tx-cap": "#5f3dc4", "tx-poly-a": "#ffa94d",
    "tl-small-subunit": "#ffd43b", "tl-large-subunit": "#fab005", "tl-trna": "#da77f2", "tl-start-codon": "#2f9e44",
    "tl-stop-codon": "#e03131", "tl-release-factor": "#ff8787", "tl-polypeptide": "#4dabf7", "rna-base-u": "#e03131",
    "gt-between": "#c3c9d4", "gt-gene-enam": "#4dabf7", "gt-gene-mmp20": "#9775fa", "gt-gene-fam83h": "#20c997", "gt-gene-dspp": "#f76707",
}


def write(node, key, verts, faces, keys=None, basis=None):
    """One object; with shape keys, its mesh is the basis and each key is basis + offset."""
    base = basis or verts
    me = bpy.data.meshes.new(node)
    me.from_pydata([to_blender(v) for v in base], [], faces)
    me.shade_smooth()
    me.materials.append(material(key, COLOURS.get(key) or PROCESS_COLOURS[key]))
    ob = bpy.data.objects.new(node, me)
    scene.collection.objects.link(ob)
    if keys:
        ob.shape_key_add(name="Basis")
        for name, delta in keys.items():
            sk = ob.shape_key_add(name=name)
            for v, b, d in zip(sk.data, base, delta):
                v.co = to_blender(add(b, d))
    return len(faces)


total = 0
for key, part in parts.items():
    total += write(key, key, part.verts, part.faces)
for node, o in objs.items():
    total += write(node, o.key, o.verts, o.faces, o.keys, o.basis)
    print(f"{node}: {len(o.verts)} vertices, keys: {', '.join(o.keys) or '-'}")
for node, o in teeth.items():
    total += write(node, o.key, o.verts, o.faces)

# The molars: each condition beside its gene, and a copy of the healthy molar (sharing its mesh) beside each.
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=os.path.abspath(TEETH_GLB))
molars = [o for o in bpy.data.objects if o not in before and o.type == "MESH"]
for gene, gx in GENE_X.items():
    for o in molars:
        if o.name.startswith(f"gt-{GENE_CONDITION[gene]}-"):
            o.location = (gx - TOOTH_SIDE, 0, TEETH_Y + TOOTH_CEJ_Y)
        elif o.name.startswith("gt-healthy-"):
            copy = o.copy()  # linked: the same mesh
            copy.name = f"{o.name}~{gene.lower()}"
            copy.location = (gx + TOOTH_SIDE, 0, TEETH_Y + TOOTH_CEJ_Y)
            scene.collection.objects.link(copy)
for o in molars:
    if o.name.startswith("gt-healthy-"):
        bpy.data.objects.remove(o)
    else:
        total += len(o.data.polygons)

os.makedirs(os.path.dirname(GLB_OUT) or ".", exist_ok=True)
# Shape keys go out as morph targets; the app recomputes their normals.
bpy.ops.export_scene.gltf(filepath=GLB_OUT, export_format="GLB", export_apply=False, export_yup=True, export_morph=True,
                          export_morph_normal=False, export_vertex_color="ACTIVE", export_draco_mesh_compression_enable=DRACO)
if BLEND_OUT:
    os.makedirs(os.path.dirname(BLEND_OUT) or ".", exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(BLEND_OUT), compress=True)
print(f"Wrote {GLB_OUT}: {len(LADDER)} base pairs, {total} faces")
