import type { Symptom } from './types.js';

const NEGATORS = new Set(['no', 'not', 'without', "don't", 'dont', "didn't", "doesn't", 'never', 'denies', "haven't", "isn't"]);
/** Tokens that end a negation's scope ("no fever but a cough"). */
const SCOPE_BREAKS = new Set(['but', 'and', 'although', 'though', 'yet']);
const NEGATION_WINDOW = 3;

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9'\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function isNegated(tokens: string[], start: number): boolean {
  for (let i = start - 1; i >= Math.max(0, start - NEGATION_WINDOW); i--) {
    if (SCOPE_BREAKS.has(tokens[i])) return false;
    if (NEGATORS.has(tokens[i])) return true;
  }
  return false;
}

/** True when `phrase` occurs in `tokens` as a whole-word sequence that is not negated. */
function occurs(tokens: string[], phrase: string[]): boolean {
  outer: for (let i = 0; i + phrase.length <= tokens.length; i++) {
    for (let j = 0; j < phrase.length; j++) if (tokens[i + j] !== phrase[j]) continue outer;
    if (!isNegated(tokens, i)) return true;
  }
  return false;
}

/** Map free text to the set of symptom ids among `catalogue` it mentions. */
export function extract(message: string, catalogue: Symptom[]): Set<string> {
  const tokens = tokenize(message);
  const found = new Set<string>();
  for (const symptom of catalogue) {
    if (symptom.keywords.some((k) => occurs(tokens, tokenize(k)))) found.add(symptom.id);
  }
  return found;
}
