// Mesh clean-up for surface-nets output, for the caries sites carved into the arch's teeth
// (extract-bodyparts.mjs).

/** True if p lies on cut plane i (within tol) and not beyond any of the other planes. */
const onFace = (planes, i, p, tol = 0.05) =>
  Math.abs(p[planes[i].axis] - planes[i].at) < tol && planes.every((c, j) => j === i || c.side * (p[c.axis] - c.at) > -tol);

/**
 * Surface nets leave each vertex where grid edges cross the boundary, which shows as a staircase when
 * zoomed in, and neighbouring regions end slightly apart on a cut face. Move each vertex onto its
 * region's true boundary, as the outer surface of the carving tooth is: on a cut face it stays on the
 * plane and slides within it onto the zone's edge (both neighbours land on the same curve, so the
 * hairline gaps close); elsewhere it moves in 3D. Steps are capped and only kept when they get closer.
 */
export function snapVertices(positions, planes, field3D, fieldInPlane, step) {
  const e = 0.004, maxMove = step * 0.75;
  const newton = (p, f, axes, onlyNear) => {
    const start = [...p];
    let d = f(p);
    for (let it = 0; it < 6 && Math.abs(d) > 1e-5; it++) {
      const g = [0, 0, 0];
      for (const a of axes) { const q = [...p], r = [...p]; q[a] += e; r[a] -= e; g[a] = (f(q) - f(r)) / (2 * e); }
      const gl = Math.hypot(...g);
      if (gl < 1e-6) return;
      // A vertex well inside a cut face (not on a zone edge) stays where it is.
      if (it === 0 && onlyNear && Math.abs(d) / gl > step) return;
      const move = Math.max(-maxMove, Math.min(maxMove, d / gl));
      const next = p.map((v, k) => v - (g[k] / gl) * move);
      const nd = f(next);
      if (Math.abs(nd) >= Math.abs(d) || Math.hypot(next[0] - start[0], next[1] - start[1], next[2] - start[2]) > maxMove) return;
      p.splice(0, 3, ...next); d = nd;
    }
  };
  for (let v = 0; v < positions.length; v += 3) {
    const p = [positions[v], positions[v + 1], positions[v + 2]];
    const i = planes.findIndex((_, k) => onFace(planes, k, p, step * 0.6));
    if (i >= 0) {
      p[planes[i].axis] = planes[i].at;
      newton(p, fieldInPlane, [0, 1, 2].filter((a) => a !== planes[i].axis), true);
    } else newton(p, field3D, [0, 1, 2], false);
    positions[v] = p[0]; positions[v + 1] = p[1]; positions[v + 2] = p[2];
  }
}

/**
 * Smooth what snapping leaves behind: a vertex that settled on the wrong side of a corner (where a
 * zone meets the cavity or two other zones) folds its triangles into a flake. Taubin smoothing (a
 * shrink step then an inflate step) removes such spikes without shrinking the shape. Vertices on the
 * open edge of a mesh (a zone's edge on a cut face) are smoothed along that edge only, so the edge line
 * straightens and its neighbour, smoothed the same way, still meets it; vertices on a cut face stay on it.
 */
export function smoothMesh(positions, quads, planes, step, iterations = 6) {
  const n = positions.length / 3;
  const edgeCount = new Map();
  const key = (a, b) => (a < b ? a * n + b : b * n + a);
  for (const q of quads) for (let i = 0; i < 4; i++) { const k = key(q[i], q[(i + 1) % 4]); edgeCount.set(k, (edgeCount.get(k) ?? 0) + 1); }
  const nbr = Array.from({ length: n }, () => new Set());
  const open = new Uint8Array(n);
  for (const [k, c] of edgeCount) {
    const a = Math.floor(k / n), b = k % n;
    if (c === 1) { open[a] = 1; open[b] = 1; }
  }
  for (const [k, c] of edgeCount) {
    const a = Math.floor(k / n), b = k % n;
    // Along the open edge only for vertices on it; across the surface for the rest.
    if (open[a] && open[b] && c !== 1) continue;
    if (!open[a] || c === 1) nbr[a].add(b);
    if (!open[b] || c === 1) nbr[b].add(a);
  }
  const plane = new Int8Array(n).fill(-1);
  for (let v = 0; v < n; v++) plane[v] = planes.findIndex((_, i) => onFace(planes, i, [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]], step * 0.05));
  const next = new Float32Array(positions.length);
  const pass = (lambda) => {
    for (let v = 0; v < n; v++) {
      const ns = nbr[v];
      for (let k = 0; k < 3; k++) next[v * 3 + k] = positions[v * 3 + k];
      if (ns.size < 2) continue;
      const c = [0, 0, 0];
      for (const u of ns) for (let k = 0; k < 3; k++) c[k] += positions[u * 3 + k];
      for (let k = 0; k < 3; k++) next[v * 3 + k] += lambda * (c[k] / ns.size - positions[v * 3 + k]);
      if (plane[v] >= 0) next[v * 3 + planes[plane[v]].axis] = planes[plane[v]].at;
    }
    positions.set(next);
  };
  for (let i = 0; i < iterations; i++) { pass(0.5); pass(-0.53); }
}
