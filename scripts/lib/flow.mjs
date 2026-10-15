// Flow distances for the Physiology model: for every vertex of a vessel, nerve or hollow
// organ, how far it lies along its network from where flow starts. The viewer animates pulses on
// these distances, so flow follows the real meshes, branches and curves included.
//
// Each part is { id, name, pos: Float32Array (xyz), idx: Uint32Array }. Results are per-vertex
// Float32Arrays keyed by part id. The sign carries direction: positive flows away from the root
// (arteries, motor nerves, food), negative flows towards it (veins, sensory nerves).

/** Weld a part's vertices by position (the source splits them at creases) into graph nodes. */
function weld(part) {
  const seen = new Map();
  const nodeOf = new Uint32Array(part.pos.length / 3);
  const xyz = [];
  for (let v = 0; v < nodeOf.length; v++) {
    const k = `${part.pos[3 * v]},${part.pos[3 * v + 1]},${part.pos[3 * v + 2]}`;
    let n = seen.get(k);
    if (n === undefined) { n = xyz.length / 3; seen.set(k, n); xyz.push(part.pos[3 * v], part.pos[3 * v + 1], part.pos[3 * v + 2]); }
    nodeOf[v] = n;
  }
  return { nodeOf, xyz: new Float32Array(xyz) };
}

/** A graph over the welded nodes of several parts, with edges along triangles and between touching parts. */
function buildGraph(parts, eps) {
  const welded = parts.map(weld);
  const offset = [];
  let total = 0;
  for (const w of welded) { offset.push(total); total += w.xyz.length / 3; }
  const xyz = new Float32Array(total * 3);
  const partOf = new Uint32Array(total);
  welded.forEach((w, i) => { xyz.set(w.xyz, offset[i] * 3); partOf.fill(i, offset[i], offset[i] + w.xyz.length / 3); });

  const adj = Array.from({ length: total }, () => []);
  const link = (a, b) => {
    const d = Math.hypot(xyz[3 * a] - xyz[3 * b], xyz[3 * a + 1] - xyz[3 * b + 1], xyz[3 * a + 2] - xyz[3 * b + 2]);
    adj[a].push(b, d); adj[b].push(a, d);
  };
  parts.forEach((p, i) => {
    const { nodeOf } = welded[i];
    const seen = new Set();
    for (let t = 0; t < p.idx.length; t += 3) {
      const [a, b, c] = [nodeOf[p.idx[t]] + offset[i], nodeOf[p.idx[t + 1]] + offset[i], nodeOf[p.idx[t + 2]] + offset[i]];
      for (const [u, v] of [[a, b], [b, c], [c, a]]) {
        const k = u < v ? u * total + v : v * total + u;
        if (u !== v && !seen.has(k)) { seen.add(k); link(u, v); }
      }
    }
  });

  // Touching parts (a branch meeting its parent) are joined where their surfaces come within eps.
  const grid = spatialHash(xyz, Math.max(eps, 0.5));
  if (eps > 0 && parts.length > 1) {
    for (let n = 0; n < total; n++) {
      for (const m of grid.near(n, eps)) if (m > n && partOf[m] !== partOf[n]) link(n, m);
    }
  }
  return { welded, offset, xyz, partOf, adj, total, grid };
}

function spatialHash(xyz, cell) {
  const cells = new Map();
  const key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  for (let n = 0; n < xyz.length / 3; n++) {
    const k = key(xyz[3 * n], xyz[3 * n + 1], xyz[3 * n + 2]);
    let list = cells.get(k);
    if (!list) cells.set(k, (list = []));
    list.push(n);
  }
  return {
    /** Nodes within r of node n (r <= a few cells). */
    near(n, r, from = xyz) {
      const [x, y, z] = [from[3 * n], from[3 * n + 1], from[3 * n + 2]];
      const span = Math.ceil(r / cell);
      const [cx, cy, cz] = [Math.floor(x / cell), Math.floor(y / cell), Math.floor(z / cell)];
      const out = [];
      for (let i = -span; i <= span; i++) for (let j = -span; j <= span; j++) for (let k = -span; k <= span; k++) {
        for (const m of cells.get(`${cx + i},${cy + j},${cz + k}`) ?? []) {
          if (Math.hypot(xyz[3 * m] - x, xyz[3 * m + 1] - y, xyz[3 * m + 2] - z) <= r) out.push(m);
        }
      }
      return out;
    },
  };
}

/** Multi-source Dijkstra. `dist` holds seeds (finite) and is filled in place. */
function dijkstra(adj, dist) {
  const heap = [];
  const push = (n, d) => {
    heap.push([d, n]);
    let i = heap.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
      }
    }
    return top;
  };
  for (let n = 0; n < dist.length; n++) if (Number.isFinite(dist[n])) push(n, dist[n]);
  while (heap.length) {
    const [d, n] = pop();
    if (d > dist[n]) continue;
    const e = adj[n];
    for (let k = 0; k < e.length; k += 2) {
      const m = e[k], nd = d + e[k + 1];
      if (nd < dist[m]) { dist[m] = nd; push(m, nd); }
    }
  }
}

/**
 * Distances through a connected network (arteries, veins, airways, urinary tract) from root nodes.
 * Parts the network doesn't reach (gaps in the source) are bridged to the nearest reached node,
 * so their flow still runs the right way. Returns { flows, unreached } with flows keyed by part id.
 */
export function networkFlow(parts, { isRoot, sign = 1, eps = 0.15, bridge = 8 }) {
  const g = buildGraph(parts, eps);
  const dist = new Float64Array(g.total).fill(Infinity);
  for (let n = 0; n < g.total; n++) if (isRoot(parts[g.partOf[n]], [g.xyz[3 * n], g.xyz[3 * n + 1], g.xyz[3 * n + 2]])) dist[n] = 0;
  dijkstra(g.adj, dist);

  // Bridge unreached pieces across small gaps, until nothing more can be reached. A piece is a
  // connected component, not a part: some source meshes bundle many separate vessels.
  const reachedCell = 1.0;
  for (let round = 0; round < 50; round++) {
    const reached = [];
    for (let n = 0; n < g.total; n++) if (Number.isFinite(dist[n])) reached.push(n);
    const sub = new Float32Array(reached.length * 3);
    reached.forEach((n, i) => sub.set(g.xyz.subarray(3 * n, 3 * n + 3), 3 * i));
    const hash = spatialHash(sub, reachedCell);
    let progressed = false;
    for (const piece of unreachedPieces(g, dist)) {
      // Closest connection between this piece and the reached set, searched in growing shells.
      let best = null;
      const step = Math.max(1, Math.floor(piece.length / 400));
      for (let r = reachedCell; r <= bridge && !best; r *= 2) {
        for (let s = 0; s < piece.length; s += step) {
          const n = piece[s];
          for (const j of hash.near(0, r, g.xyz.subarray(3 * n, 3 * n + 3))) {
            const m = reached[j];
            const d = Math.hypot(g.xyz[3 * m] - g.xyz[3 * n], g.xyz[3 * m + 1] - g.xyz[3 * n + 1], g.xyz[3 * m + 2] - g.xyz[3 * n + 2]);
            if (!best || dist[m] + d < best[1]) best = [n, dist[m] + d];
          }
        }
      }
      if (best) { dist[best[0]] = best[1]; progressed = true; }
    }
    if (!progressed) break;
    dijkstra(g.adj, dist);
  }
  return collect(parts, g, dist, sign);
}

/**
 * Distances along a chain of hollow organs in order (oesophagus → stomach → … → rectum). Each organ
 * starts where it meets the previous one, so coiled loops touching each other don't short-circuit.
 * `entry` picks the first organ's starting nodes.
 */
export function chainFlow(parts, { entry, sign = 1 }) {
  const flows = new Map();
  let prevExit = null, offset = 0;
  for (const p of parts) {
    const g = buildGraph([p], 0);
    const dist = new Float64Array(g.total).fill(Infinity);
    if (!prevExit) {
      for (let n = 0; n < g.total; n++) if (entry(p, [g.xyz[3 * n], g.xyz[3 * n + 1], g.xyz[3 * n + 2]])) dist[n] = 0;
    } else {
      let best = 0, bd = Infinity;
      for (let n = 0; n < g.total; n++) {
        const d = Math.hypot(g.xyz[3 * n] - prevExit[0], g.xyz[3 * n + 1] - prevExit[1], g.xyz[3 * n + 2] - prevExit[2]);
        if (d < bd) { bd = d; best = n; }
      }
      // Seed the whole ring where the organ starts, not one vertex.
      for (const m of g.grid.near(best, 1.0)) dist[m] = 0;
      offset += bd;
    }
    dijkstra(g.adj, dist);
    let exit = 0;
    for (let n = 0; n < g.total; n++) if (Number.isFinite(dist[n]) && dist[n] > dist[exit]) exit = n;
    for (let n = 0; n < g.total; n++) dist[n] = Number.isFinite(dist[n]) ? dist[n] + offset : offset;
    offset = dist[exit];
    prevExit = [g.xyz[3 * exit], g.xyz[3 * exit + 1], g.xyz[3 * exit + 2]];
    for (const [id, f] of collect([p], g, dist, sign).flows) flows.set(id, f);
  }
  return { flows, unreached: [] };
}

/**
 * Distances within each part on its own from its node nearest `origin` (nerves: the brainstem),
 * plus the straight-line gap, so neighbouring branches stay roughly in step.
 */
export function radialFlow(parts, { origin, signOf }) {
  const flows = new Map();
  for (const p of parts) {
    const g = buildGraph([p], 0);
    const dist = new Float64Array(g.total).fill(Infinity);
    let best = 0, bd = Infinity;
    for (let n = 0; n < g.total; n++) {
      const d = Math.hypot(g.xyz[3 * n] - origin[0], g.xyz[3 * n + 1] - origin[1], g.xyz[3 * n + 2] - origin[2]);
      if (d < bd) { bd = d; best = n; }
    }
    dist[best] = bd;
    dijkstra(g.adj, dist);
    for (const [id, f] of collect([p], g, dist, signOf(p)).flows) flows.set(id, f);
  }
  return { flows, unreached: [] };
}

/** Connected components (over the graph's edges) of the nodes not reached yet. */
function unreachedPieces(g, dist) {
  const seen = new Uint8Array(g.total);
  const pieces = [];
  for (let s = 0; s < g.total; s++) {
    if (seen[s] || Number.isFinite(dist[s])) continue;
    const piece = [s];
    seen[s] = 1;
    for (let k = 0; k < piece.length; k++) {
      const e = g.adj[piece[k]];
      for (let j = 0; j < e.length; j += 2) {
        const m = e[j];
        if (!seen[m] && !Number.isFinite(dist[m])) { seen[m] = 1; piece.push(m); }
      }
    }
    pieces.push(piece);
  }
  return pieces;
}

function collect(parts, g, dist, sign) {
  const flows = new Map();
  const unreached = [];
  parts.forEach((p, i) => {
    const { nodeOf } = g.welded[i];
    const out = new Float32Array(nodeOf.length);
    let missing = false;
    for (let v = 0; v < nodeOf.length; v++) {
      const d = dist[nodeOf[v] + g.offset[i]];
      if (!Number.isFinite(d)) missing = true;
      out[v] = Number.isFinite(d) ? d * sign : 0;
    }
    if (missing) unreached.push(p.name);
    flows.set(p.id, out);
  });
  return { flows, unreached };
}
