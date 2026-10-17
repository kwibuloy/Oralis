// Deterministic smooth 3D value noise for the authored models (the same seed always gives the same
// shapes, so rebuilt models do not change unless the script does). Range about −1..1.
const hash = (x, y, z) => {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(z, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
};
const fade = (t) => t * t * (3 - 2 * t);

export function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const u = fade(x - xi), v = fade(y - yi), w = fade(z - zi);
  const l = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash(xi + dx, yi + dy, zi + dz);
  return 2 * l(
    l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v),
    l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v),
    w) - 1;
}

/** Fractal noise: `octaves` layers, each twice the frequency and half the amplitude. */
export function fbm(p, frequency = 1, octaves = 3, offset = 0) {
  let sum = 0, amp = 0.5, f = frequency, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise3(p[0] * f + offset, p[1] * f + offset * 1.7, p[2] * f - offset * 0.6);
    norm += amp; amp *= 0.5; f *= 2;
  }
  return sum / norm;
}
