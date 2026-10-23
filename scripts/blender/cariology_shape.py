"""Shape of the Blender cariology tooth as signed-distance fields (negative inside, millimetres).

A left mandibular first molar (FDI 36) modelled for Oralis from Wheeler's proportions: crown 11.0 mm
mesiodistally and 10.5 mm buccolingually, 7.5 mm tall from the buccal cervical line; root trunk about
3 mm; mesial root 14 mm, distal root about 13 mm. Five cusps (mesiobuccal, distobuccal, distal,
mesiolingual, distolingual), lingual cusps about 0.5 mm higher; central groove with mesial, central
and distal pits; mesiobuccal, distobuccal and lingual grooves.

Axes (Blender, Z up): +X distal, -X mesial, -Y buccal (towards the default camera), +Y lingual.
z = 0 is the cervical line on the buccal; it rises 1.0 mm on the mesial and 0.5 mm on the distal.

Every function takes coordinate arrays (any broadcastable shape) and returns field values. The
crown without its fissures (`smooth_tooth`) is what the DEJ is offset from, so the DEJ follows the
cusps but not the fissures.
"""
import numpy as np

# ---------- helpers ----------


def smin(a, b, k):
    """Polynomial smooth minimum (smooth union) with blend width k."""
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0.0, 1.0)
    return b + (a - b) * h - k * h * (1.0 - h)


def smax(a, b, k):
    """Smooth maximum (smooth intersection / subtraction)."""
    return -smin(-a, -b, k)


def ellipsoid(x, y, z, c, r):
    """Approximate distance to an axis-aligned ellipsoid (exact on the surface)."""
    X, Y, Z = (x - c[0]) / r[0], (y - c[1]) / r[1], (z - c[2]) / r[2]
    k0 = np.sqrt(X * X + Y * Y + Z * Z)
    k1 = np.sqrt((X / r[0]) ** 2 + (Y / r[1]) ** 2 + (Z / r[2]) ** 2) + 1e-9
    # The approximation is 0 at the centre too; deep inside use the scaled radius instead.
    return np.where(k0 < 0.5, (k0 - 1.0) * min(r), k0 * (k0 - 1.0) / k1)


def round_cone(x, y, z, a, b, ra, rb):
    """Distance to a capsule from a (radius ra) to b (radius rb)."""
    a, b = np.asarray(a, float), np.asarray(b, float)
    ba = b - a
    l2 = ba @ ba
    rr = ra - rb
    a2 = l2 - rr * rr
    il2 = 1.0 / l2
    px, py, pz = x - a[0], y - a[1], z - a[2]
    yv = px * ba[0] + py * ba[1] + pz * ba[2]
    zv = yv - l2
    qx, qy, qz = px * l2 - ba[0] * yv, py * l2 - ba[1] * yv, pz * l2 - ba[2] * yv
    x2 = qx * qx + qy * qy + qz * qz
    y2 = yv * yv * l2
    z2 = zv * zv * l2
    k = np.sign(rr) * rr * rr * x2
    d1 = np.sqrt(x2 + z2) * il2 - rb
    d2 = np.sqrt(x2 + y2) * il2 - ra
    d3 = (np.sqrt(x2 * a2 * il2) + yv * rr) * il2 - ra
    return np.where(np.sign(zv) * a2 * z2 > k, d1, np.where(np.sign(yv) * a2 * y2 < k, d2, d3))


def cone(r, z, tip_z, slope, rho):
    """Distance to a downward-opening cone (radius grows by `slope` per mm down) whose tip is rounded
    with radius rho and reaches height tip_z; r is the distance from the axis."""
    za = tip_z - rho * np.sqrt(1 + slope * slope)  # apex of the unrounded cone
    sb, cb = slope / np.sqrt(1 + slope * slope), 1 / np.sqrt(1 + slope * slope)
    h = za - z
    side = r * cb - h * sb
    apex = np.sqrt(r * r + h * h)
    return np.where(r * sb + h * cb < 0, apex, side) - rho


def chain(x, y, z, pts, radii, k=0.0):
    """Union of round cones through a polyline (pts with matching radii)."""
    d = None
    for i in range(len(pts) - 1):
        s = round_cone(x, y, z, pts[i], pts[i + 1], radii[i], radii[i + 1])
        d = s if d is None else (np.minimum(d, s) if k == 0 else smin(d, s, k))
    return d


def rounded_rect(px, py, hx, hy, rc):
    """2D distance to a rectangle with half sizes hx, hy and corner radius rc."""
    qx, qy = np.abs(px) - (hx - rc), np.abs(py) - (hy - rc)
    out = np.sqrt(np.maximum(qx, 0) ** 2 + np.maximum(qy, 0) ** 2)
    return out + np.minimum(np.maximum(qx, qy), 0) - rc


def ellipse2(px, py, ax, by):
    """2D approximate distance to an ellipse with semi-axes ax, by."""
    k0 = np.sqrt((px / ax) ** 2 + (py / by) ** 2)
    k1 = np.sqrt((px / ax ** 2) ** 2 + (py / by ** 2) ** 2) + 1e-9
    return np.where(k0 < 0.5, (k0 - 1.0) * np.minimum(ax, by), k0 * (k0 - 1.0) / k1)


def smooth_table(table, n=400):
    """Resample a table (first column the key) with Catmull-Rom splines, so lofts have no creases."""
    t = np.asarray(table, float)
    k = t[:, 0]
    out = [np.linspace(k[0], k[-1], n)]
    for col in range(1, t.shape[1]):
        v = t[:, col]
        res = np.empty(n)
        for j, s in enumerate(out[0]):
            i = min(max(np.searchsorted(k, s) - 1, 0), len(k) - 2)
            u = (s - k[i]) / (k[i + 1] - k[i])
            p0 = v[i - 1] if i > 0 else 2 * v[i] - v[i + 1]
            p3 = v[i + 2] if i + 2 < len(k) else 2 * v[i + 1] - v[i]
            p1, p2 = v[i], v[i + 1]
            res[j] = 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u
                            + (-p0 + 3 * p1 - 3 * p2 + p3) * u ** 3)
        out.append(res)
    return np.stack(out, axis=1)


# ---------- cervical line ----------


def cej(x, y):
    """Height of the cervical line: 0 on the buccal and lingual, +1.0 mesially, +0.5 distally."""
    rho = np.sqrt(x * x + y * y) + 1e-9
    u = x / rho  # +1 distal, -1 mesial
    return np.where(u < 0, 1.0, 0.5) * np.abs(u) ** 3


# ---------- crown and root trunk ----------

# Outline of the crown and trunk by height: z, mesial x, distal x, buccal y, lingual y, corner radius.
# Mesial contact at the junction of the occlusal and middle thirds, distal contact in the middle
# third; buccal height of contour in the cervical third, lingual in the middle third. Above the
# contours the buccal surface leans strongly lingually (the crown sits lingually on the root), so the
# buccal cusp tips lie well inside the buccal outline.
OUTLINE = smooth_table([
    [-3.9, -4.05, 4.05, -3.95, 3.95, 1.9],
    [-1.5, -4.30, 4.30, -4.25, 4.25, 2.4],
    [0.0, -4.55, 4.50, -4.45, 4.40, 2.7],
    [1.5, -5.15, 5.00, -5.00, 4.85, 3.0],
    [3.0, -5.45, 5.30, -4.90, 5.20, 3.2],
    [4.5, -5.50, 5.30, -4.45, 5.15, 3.1],
    [5.8, -5.20, 4.95, -3.95, 4.70, 2.9],
    [7.0, -5.00, 4.75, -3.80, 4.45, 2.7],
    [8.6, -4.60, 4.30, -3.35, 4.05, 2.6],
])
TRUNK_BOTTOM = -3.9


def outline(x, y, z):
    """Distance to the crown and trunk outline, extruded (no top or bottom)."""
    c = lambda i: np.interp(z, OUTLINE[:, 0], OUTLINE[:, i])
    xm, xd, yb, yl, rc = c(1), c(2), c(3), c(4), c(5)
    cx, cy = (xm + xd) / 2, (yb + yl) / 2
    px, py = x - cx, y - cy
    # The crown converges lingually (narrower mesiodistally on the lingual) and distally.
    px = px / (1.0 - 0.025 * np.clip(py, -6, 6))
    py = py / (1.0 - 0.02 * np.clip(px, -6, 6))
    return rounded_rect(px, py, (xd - xm) / 2, (yl - yb) / 2, rc)


# Cusp tips (x, y, z) and which way the cusp faces out (x, y). The occlusal surface is a height map:
# each cusp is a rounded peak that falls away gently towards the centre of the occlusal table (the
# triangular ridges) and more steeply on its outer face; neighbouring cusps meet in valleys where the
# grooves run, and the marginal ridges close the table mesially and distally.
CUSPS = {
    'mesiobuccal': ((-3.15, -2.6, 7.5), (-1, -1)),
    'distobuccal': ((0.75, -2.85, 7.3), (0, -1)),
    'distal': ((3.65, -2.0, 6.85), (1, -1)),
    'mesiolingual': ((-2.6, 2.85, 8.0), (-1, 1)),
    'distolingual': ((1.75, 2.95, 7.8), (1, 1)),
}
CUSP_FALL, CUSP_POWER = 0.33, 1.55  # height lost at distance r from the tip: CUSP_FALL * r ** CUSP_POWER
OUTER_X, OUTER_Y = 1.3, 1.7  # how much steeper the outer faces are
MARGINAL_RIDGES = [((-4.45, -2.0), (-4.45, 2.4), 6.2), ((4.2, -1.5), (4.2, 2.3), 5.95)]


def occlusal_height(x, y):
    hs = []
    for tip, (ox, oy) in CUSPS.values():
        dx, dy = x - tip[0], y - tip[1]
        sx = 1 + (OUTER_X - 1) * abs(ox) * 0.5 * (1 + np.tanh(ox * dx / 0.5))
        sy = 1 + (OUTER_Y - 1) * abs(oy) * 0.5 * (1 + np.tanh(oy * dy / 0.5))
        hs.append(tip[2] - CUSP_FALL * np.hypot(dx * sx, dy * sy) ** CUSP_POWER)
    for (ax, ay), (bx, by), hz in MARGINAL_RIDGES:
        t = np.clip(((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2), 0, 1)
        hs.append(hz - 0.5 * np.hypot(x - ax - t * (bx - ax), y - ay - t * (by - ay)) ** 1.5)
    h = hs[0]
    for v in hs[1:]:
        h = smax(h, v, 0.35)
    return h


def crown(x, y, z):
    """Crown and root trunk: the outline loft, topped by the occlusal height map with rounded shoulders."""
    top = (z - occlusal_height(x, y)) * 0.8
    return smax(smax(outline(x, y, z), top, 0.9), TRUNK_BOTTOM - z, 0.8)


# ---------- roots ----------

# z, centre x, MD half-width, BL half-width. The mesial root is broad buccolingually and curves
# distally in its apical third; the distal root is straighter and slopes distally. The tables run
# up into the trunk, where the union hides them.
MESIAL_ROOT = smooth_table([
    [-13.6, -2.85, 0.95, 1.45],
    [-11.0, -3.35, 1.40, 2.40],
    [-8.0, -3.50, 1.70, 3.15],
    [-5.0, -3.10, 1.90, 3.75],
    [-2.0, -2.30, 2.00, 4.05],
    [0.5, -2.2, 2.0, 4.1],
])
DISTAL_ROOT = smooth_table([
    [-12.8, 3.75, 0.90, 1.30],
    [-11.0, 3.60, 1.30, 2.10],
    [-8.0, 3.30, 1.60, 2.90],
    [-5.0, 2.90, 1.80, 3.45],
    [-2.0, 2.40, 1.95, 3.80],
    [0.5, 2.1, 2.0, 3.85],
])


def root(x, y, z, table, cap):
    c = lambda i: np.interp(z, table[:, 0], table[:, i])
    cx, ax = c(1), c(2)
    d = ellipse2(x - cx, y, ax, c(3))
    zb = table[0, 0]
    d = np.maximum(d, np.maximum(zb - z, z - table[-1, 0]))
    d = smin(d, ellipsoid(x, y, z, (table[0, 1], 0.0, zb), (table[0, 2], table[0, 3], cap)), 0.25)
    # Shallow developmental depressions along the mesial and distal faces of the root.
    for side in (-1, 1):
        fade = 0.35 * (np.maximum(zb + 3.5 - z, 0) + np.maximum(z - (TRUNK_BOTTOM - 1.0), 0))
        groove = np.hypot(x - (cx + side * (ax + 1.0)), y) - 1.25 + fade
        d = smax(d, -groove, 0.8)
    return d


def roots(x, y, z):
    return np.minimum(root(x, y, z, MESIAL_ROOT, 0.8), root(x, y, z, DISTAL_ROOT, 0.7))

# ---------- fissures ----------

# Groove polylines on the occlusal table: (x, y, height of the groove floor). Pits are the low points.
CENTRAL_PIT = (-0.3, 0.1)
GROOVES = [
    # Central groove with its pits. It runs straight through the central pit (y = 0.1) so the
    # pit & fissure section, cut along it, follows its floor.
    [(-4.0, 0.25, 5.75), (-3.4, 0.15, 5.2), (-1.4, 0.1, 5.4), (-0.3, 0.1, 5.05), (1.0, 0.1, 5.35),
     (2.4, 0.2, 5.4), (3.5, 0.4, 5.15), (4.1, 0.45, 5.65)],
    [(-1.4, 0.1, 5.4), (-1.5, -1.8, 5.75), (-1.4, -3.3, 6.15)],              # mesiobuccal
    [(2.4, 0.2, 5.4), (2.6, -1.6, 5.75), (2.7, -2.9, 6.05)],                 # distobuccal
    [(-0.3, 0.1, 5.05), (-0.3, 1.9, 5.6), (-0.25, 3.5, 6.35)],               # lingual
]
FISSURE_SLOPE = 5.5  # wall steepness of the V: the fissure is 2 * depth / slope wide at its rim


def fissures(x, y, z):
    """V-shaped trench field along the grooves (negative inside the trench)."""
    d = None
    for line in GROOVES:
        for (ax, ay, az), (bx, by, bz) in zip(line, line[1:]):
            dx, dy = bx - ax, by - ay
            t = np.clip(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy), 0, 1)
            dist = np.hypot(x - ax - t * dx, y - ay - t * dy)
            g = (az + t * (bz - az) - z) + FISSURE_SLOPE * dist
            d = g if d is None else np.minimum(d, g)
    return d / np.sqrt(1 + FISSURE_SLOPE ** 2)


# The buccal and lingual grooves run on down the crown as shallow furrows, ending in the buccal pit.
FURROWS = [((-1.45, -4.6, 6.4), (-1.3, -5.55, 4.0), 0.75), ((2.7, -4.2, 6.2), (2.72, -5.1, 4.6), 0.65),
           ((-0.25, 4.85, 6.6), (-0.25, 5.75, 4.9), 0.75)]


def furrows(x, y, z):
    d = None
    for a, b, r in FURROWS:
        e = round_cone(x, y, z, a, b, r, r * 0.85)
        d = e if d is None else np.minimum(d, e)
    return d


# ---------- the tooth ----------


def smooth_tooth(x, y, z):
    """Crown, trunk and roots before the fissures are cut (what the DEJ is offset from)."""
    return smin(crown(x, y, z), roots(x, y, z), 1.3)


def tooth(x, y, z):
    d = smax(smooth_tooth(x, y, z), -furrows(x, y, z), 0.45)
    return smax(d, -fissures(x, y, z), 0.15)


def enamel_thickness(x, y, z):
    """Enamel thickness by height above the cervical line; negative below it (no enamel on the root)."""
    h = z - cej(x, y)
    return np.interp(h, [-1.0, 0.0, 1.5, 4.0, 6.0, 8.5], [-0.35, 0.0, 1.0, 1.4, 2.0, 2.3])


# ---------- pulp ----------

HORNS = [((-2.05, -1.25, 3.05), (0.6, 0.6, 1.0)), ((-1.85, 1.3, 3.25), (0.6, 0.6, 1.0)),
         ((0.95, -1.35, 2.85), (0.55, 0.55, 0.9)), ((1.15, 1.3, 2.95), (0.55, 0.55, 0.9)),
         ((2.45, -0.95, 2.4), (0.45, 0.45, 0.7))]


def pulp(x, y, z):
    """Pulp chamber with five horns under the cusps, two mesial canals and a ribbon-shaped distal canal."""
    cx, cy, cz = -0.1, 0.0, 0.5
    q = np.sqrt(np.maximum(np.abs(x - cx) - 1.6, 0) ** 2 + np.maximum(np.abs(y - cy) - 0.9, 0) ** 2
                + np.maximum(np.abs(z - cz) - 0.55, 0) ** 2) - 0.75
    d = q
    for c, r in HORNS:
        d = smin(d, ellipsoid(x, y, z, (c[0], c[1], c[2] - r[2] * 0.6), r), 0.5)
    radii = [0.55, 0.45, 0.35, 0.25, 0.12]
    for s in (-1, 1):
        pts = [(-2.35, s * 1.25, -0.4), (-3.1, s * 1.1, -5.0), (-3.45, s * 0.9, -8.0),
               (-3.3, s * 0.6, -11.0), (-2.9, s * 0.3, -13.75)]
        d = smin(d, chain(x, y, z, pts, radii), 0.9)
        pts = [(2.2, s * 0.45, -0.4), (2.85, s * 0.45, -5.0), (3.25, s * 0.4, -8.0),
               (3.55, s * 0.3, -11.0), (3.75, s * 0.12, -13.0)]
        d = smin(d, chain(x, y, z, pts, radii), 0.9)
    return d
