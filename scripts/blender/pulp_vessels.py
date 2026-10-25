"""Schematic pulp vessels and nerve drawn on a cut face (illustrated-look skill): an arteriole (red) and a venule
(blue) either side of the nerve (yellow), traced along the middle of the pulp row by row from the root tip up each
canal and into the horns, half proud of the cut so they read on it. Used by build_cariology.py
(build_genetics_teeth.py has the same tracing inline, written first).
"""
import math

import numpy as np

COLOURS = {"artery": (0.78, 0.13, 0.12), "vein": (0.16, 0.27, 0.72), "nerve": (0.95, 0.78, 0.25)}
# (kind, offset across the pulp as a share of its half width, tube radius in mm): the venule is the widest.
# The offset is capped (BUNDLE), so in a wide chamber they stay together as one bundle up the middle.
TUBES = (("artery", -0.38, 0.07), ("vein", 0.38, 0.085), ("nerve", 0.0, 0.06))
BUNDLE = 0.2


def trace(inside, us, zs, min_cells=4):
    """Tracks [(u, z, half width)] up the pulp: `inside` is a (len(us), len(zs)) mask of the pulp on the cut.
    A track follows the run of pulp it overlaps from row to row; where two canals meet, one ends; where the
    chamber splits towards a horn, a branch starts."""
    tracks, done = [], []
    for k in range(inside.shape[1]):
        idx = np.flatnonzero(inside[:, k])
        runs = []
        if len(idx):
            cut = np.flatnonzero(np.diff(idx) > 1)
            for a, b in zip(np.concatenate([[idx[0]], idx[cut + 1]]), np.concatenate([idx[cut], [idx[-1]]])):
                if b - a >= min_cells:
                    runs.append((us[a], us[b]))
        z = zs[k]
        claimed, nxt = set(), []
        for t in tracks:
            hits = [i for i, (u0, u1) in enumerate(runs) if u0 <= t["run"][1] and u1 >= t["run"][0]]
            if not hits:
                done.append(t)
                continue
            for n, i in enumerate(hits):
                u0, u1 = runs[i]
                p = ((u0 + u1) / 2, z, (u1 - u0) / 2)
                if i in claimed:
                    t["pts"].append(p)
                    done.append(t)
                    break
                claimed.add(i)
                if n == 0:
                    t["pts"].append(p)
                    t["run"] = runs[i]
                    nxt.append(t)
                else:
                    nxt.append({"pts": [t["pts"][-2] if len(t["pts"]) > 1 else t["pts"][-1], p], "run": runs[i]})
        for i, (u0, u1) in enumerate(runs):
            if i not in claimed:
                nxt.append({"pts": [((u0 + u1) / 2, z, (u1 - u0) / 2)], "run": (u0, u1)})
        tracks = nxt
    return [t["pts"] for t in done + tracks]


def tubes(tracks, to3d, every=4, sides=10):
    """Vertices, faces and vertex colours of the three tubes along each track; to3d(u, z) places a point."""
    verts, faces, cols = [], [], []

    def tube(path, r, colour):
        start = len(verts)
        for i, p in enumerate(path):
            t = np.array(path[min(i + 1, len(path) - 1)]) - np.array(path[max(i - 1, 0)])
            t /= np.linalg.norm(t) or 1.0
            n = np.cross(t, (0.0, 0.0, 1.0)) if abs(t[2]) < 0.9 else np.cross(t, (1.0, 0.0, 0.0))
            n /= np.linalg.norm(n) or 1.0
            b = np.cross(t, n)
            for s in range(sides):
                a = 2 * math.pi * s / sides
                verts.append(tuple(np.array(p) + r * (math.cos(a) * n + math.sin(a) * b)))
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

    for pts in tracks:
        pts = pts[::every] + ([pts[-1]] if (len(pts) - 1) % every else [])
        if len(pts) < 2:
            continue
        # Smoothed, so the vessels curve gently instead of following every grid step.
        sm = [pts[0]] + [tuple((np.array(pts[i - 1]) + 2 * np.array(pts[i]) + np.array(pts[i + 1])) / 4) for i in range(1, len(pts) - 1)] + [pts[-1]]
        for kind, side, r in TUBES:
            tube([to3d(u + side * min(max(hw - 0.12, 0.0), BUNDLE / 0.38), z) for u, z, hw in sm], r, COLOURS[kind])
    return verts, faces, cols
