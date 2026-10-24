"""Author the Genetics mode model. For now the path prototype (GENETICS_PLAN.md, step 2): the real
start of the DSPP gene as a double helix lying along +X, with an `unzip` shape key that opens the
two strands from a fork, so the app's swipe-along-the-ladder timeline has a shape to scrub.

Run headless (Blender 4.x), from the repo root:
    blender -b --factory-startup -P scripts/blender/build_genetics.py -- public/models/genetics.glb models-src/genetics.blend

Every object name is a part key from src/content/genetics.ts. Units are nanometres, Z up (the glTF
exporter converts to Y up). The sequence is read from src/content/genetics-sequence.generated.json
(fetched from NCBI by scripts/fetch-dspp.mjs); strand 0 is the coding strand, read 5'->3' along +X.
"""
import json
import math
import os
import sys

import bpy

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
GLB_OUT = argv[0] if argv else "public/models/genetics.glb"
BLEND_OUT = argv[1] if len(argv) > 1 else None

with open(os.path.join("src", "content", "genetics-sequence.generated.json"), encoding="utf-8") as f:
    DSPP = json.load(f)
LADDER = DSPP["exon2Coding"] + DSPP["intronStart"]
PAIR = {"A": "T", "T": "A", "G": "C", "C": "G"}

# ---------- B-DNA proportions (nm) ----------
RISE = 0.34            # per base pair
PITCH = 10.5 * RISE    # about 10.5 base pairs per turn
R = 1.0                # phosphate radius: the helix is about 2 nm across
OFFSET = math.radians(144)  # angle between the two backbones at one base pair: makes the major and minor grooves
BACKBONE_R, RUNG_R, PHOSPHATE_R, HBOND_R = 0.16, 0.17, 0.27, 0.07
HBOND_GAP = 0.14       # rung halves stop short of the pair's centre; the hydrogen bonds fill the gap

# ---------- test morph: unzip from a fork ----------
FORK, OPEN_OVER, SEPARATION = 15.0, 5.0, 2.6  # strands start parting at x = FORK, fully apart OPEN_OVER later

COLOURS = {  # a hint for anyone opening the .blend; the app colours parts from genetics.ts
    "dna-sugar": "#8f9bb3", "dna-phosphate": "#f2c14e", "dna-hbond": "#d0d5dd",
    "dna-base-a": "#2f9e44", "dna-base-t": "#e03131", "dna-base-g": "#f59f00", "dna-base-c": "#1c7ed6",
}
BASE_KEY = {b: f"dna-base-{b.lower()}" for b in "ATGC"}


def smoothstep(t):
    t = min(max(t, 0.0), 1.0)
    return t * t * (3 - 2 * t)


def opening(x):
    return SEPARATION * smoothstep((x - FORK) / OPEN_OVER)


def strand_shift(x, strand):
    """Unzip offset of a point of strand 0 (moves up, +Z) or strand 1 (down) at position x."""
    d = opening(x) / 2
    return (0.0, 0.0, d if strand == 0 else -d)


def backbone(x, strand):
    th = 2 * math.pi * x / PITCH + (OFFSET if strand else 0.0)
    return (x, R * math.cos(th), R * math.sin(th))


def sub(a, b): return (a[0] - b[0], a[1] - b[1], a[2] - b[2])
def add(a, b): return (a[0] + b[0], a[1] + b[1], a[2] + b[2])
def mul(a, s): return (a[0] * s, a[1] * s, a[2] * s)
def dot(a, b): return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
def cross(a, b): return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])
def norm(a):
    n = math.sqrt(dot(a, a)) or 1.0
    return mul(a, 1 / n)


class Part:
    """One selectable part: vertices, faces and each vertex's unzip offset."""

    def __init__(self):
        self.verts, self.faces, self.deltas = [], [], []

    def tube(self, path, radius, delta, sides=10, caps=True):
        """A tube along `path` (rotation-minimising frames); delta(i) is the unzip offset of ring i."""
        start = len(self.verts)
        t0 = norm(sub(path[1], path[0]))
        n = norm(cross(t0, (0, 0, 1) if abs(t0[2]) < 0.9 else (1, 0, 0)))
        for i, p in enumerate(path):
            t = norm(sub(path[min(i + 1, len(path) - 1)], path[max(i - 1, 0)]))
            n = norm(sub(n, mul(t, dot(n, t))))  # parallel transport
            b = cross(t, n)
            d = delta(i)
            for k in range(sides):
                a = 2 * math.pi * k / sides
                self.verts.append(add(p, add(mul(n, radius * math.cos(a)), mul(b, radius * math.sin(a)))))
                self.deltas.append(d)
        rings = len(path)
        for i in range(rings - 1):
            for k in range(sides):
                a, b = start + i * sides + k, start + i * sides + (k + 1) % sides
                self.faces.append((a, b, b + sides, a + sides))
        if caps:
            for i, flip in ((0, True), (rings - 1, False)):
                ring = [start + i * sides + k for k in range(sides)]
                c = len(self.verts)
                self.verts.append(path[i])
                self.deltas.append(delta(i))
                for k in range(sides):
                    a, b = ring[k], ring[(k + 1) % sides]
                    self.faces.append((c, b, a) if flip else (c, a, b))

    def sphere(self, centre, radius, delta, rings=8, segments=12):
        start = len(self.verts)
        for i in range(rings + 1):
            phi = math.pi * i / rings
            for k in range(segments):
                th = 2 * math.pi * k / segments
                self.verts.append(add(centre, (radius * math.sin(phi) * math.cos(th), radius * math.sin(phi) * math.sin(th), radius * math.cos(phi))))
                self.deltas.append(delta)
        for i in range(rings):
            for k in range(segments):
                a, b = start + i * segments + k, start + i * segments + (k + 1) % segments
                self.faces.append((a, b, b + segments, a + segments))


parts = {key: Part() for key in COLOURS}
length = len(LADDER) * RISE

# Backbones: one tube per strand, each point following its strand when it unzips.
for s in (0, 1):
    xs = [i * 0.08 for i in range(int(length / 0.08) + 1)]
    parts["dna-sugar"].tube([backbone(x, s) for x in xs], BACKBONE_R, lambda i, s=s, xs=xs: strand_shift(xs[i], s))

# Base pairs: a half rung from each backbone towards the pair's centre, a phosphate on each backbone,
# and the hydrogen bonds between the halves, which shrink to nothing as the pair opens.
for i, base in enumerate(LADDER):
    x = (i + 0.5) * RISE
    p0, p1 = backbone(x, 0), backbone(x, 1)
    mid = mul(add(p0, p1), 0.5)
    inward0, inward1 = norm(sub(mid, p0)), norm(sub(mid, p1))
    for s, p, inward, b in ((0, p0, inward0, base), (1, p1, inward1, PAIR[base])):
        end = sub(mid, mul(inward, HBOND_GAP / 2))
        shift = strand_shift(x, s)
        parts[BASE_KEY[b]].tube([p, end], RUNG_R, lambda _i, d=shift: d, sides=8)
        parts["dna-phosphate"].sphere(p, PHOSPHATE_R, shift)
    a, b = sub(mid, mul(inward0, HBOND_GAP / 2 + 0.02)), add(mid, mul(inward0, HBOND_GAP / 2 + 0.02))
    hb = parts["dna-hbond"]
    first = len(hb.verts)
    hb.tube([a, b], HBOND_R, lambda _i: (0.0, 0.0, 0.0), sides=6)
    # Collapse onto the pair's centre (which itself moves with neither strand) as the strands part.
    shut = smoothstep((x - FORK) / OPEN_OVER)
    for v in range(first, len(hb.verts)):
        hb.deltas[v] = mul(sub(mid, hb.verts[v]), shut)

# ---------- write Blender objects ----------
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def material(key, hex_colour):
    m = bpy.data.materials.new(key)
    c = tuple(int(hex_colour[i:i + 2], 16) / 255 for i in (1, 3, 5))
    m.diffuse_color = (*[x ** 2.2 for x in c], 1.0)
    m.use_nodes = True
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = m.diffuse_color
    return m


for key, part in parts.items():
    me = bpy.data.meshes.new(key)
    me.from_pydata(part.verts, [], part.faces)
    me.validate()
    me.shade_smooth()
    me.materials.append(material(key, COLOURS[key]))
    ob = bpy.data.objects.new(key, me)
    scene.collection.objects.link(ob)
    ob.shape_key_add(name="Basis")
    sk = ob.shape_key_add(name="unzip")
    for v, d in zip(sk.data, part.deltas):
        v.co = (v.co[0] + d[0], v.co[1] + d[1], v.co[2] + d[2])
    print(f"{key}: {len(part.verts)} vertices, {len(part.faces)} faces")

os.makedirs(os.path.dirname(GLB_OUT) or ".", exist_ok=True)
# No Draco here: it reorders vertices, and the morph targets (shape keys) must keep the base order.
# The model is small without it.
bpy.ops.export_scene.gltf(filepath=GLB_OUT, export_format="GLB", export_morph=True, export_morph_normal=True,
                          export_apply=False, export_draco_mesh_compression_enable=False, export_yup=True)
if BLEND_OUT:
    os.makedirs(os.path.dirname(BLEND_OUT) or ".", exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(BLEND_OUT), compress=True)
print(f"Wrote {GLB_OUT}: {len(LADDER)} base pairs, {length:.1f} nm")
