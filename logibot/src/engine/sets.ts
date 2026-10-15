/** A ∪ B */
export function union<T>(a: Iterable<T>, b: Iterable<T>): Set<T> {
  const out = new Set(a);
  for (const x of b) out.add(x);
  return out;
}

/** A ∩ B */
export function intersection<T>(a: Iterable<T>, b: ReadonlySet<T>): Set<T> {
  const out = new Set<T>();
  for (const x of a) if (b.has(x)) out.add(x);
  return out;
}

/** A \ B */
export function difference<T>(a: Iterable<T>, b: ReadonlySet<T>): Set<T> {
  const out = new Set<T>();
  for (const x of a) if (!b.has(x)) out.add(x);
  return out;
}

/** A ⊆ B */
export function isSubset<T>(a: Iterable<T>, b: ReadonlySet<T>): boolean {
  for (const x of a) if (!b.has(x)) return false;
  return true;
}
