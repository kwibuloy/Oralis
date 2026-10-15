import { CONDITIONS, EDGES, REGION_PROMPTS, SYMPTOMS } from './data.js';
import { extract } from './extract.js';
import { difference, intersection, isSubset, union } from './sets.js';
import type {
  BodyPart, Condition, ConditionRef, DiagnoseInput, DiagnoseOutput, Match, Referral, Region, Reply, Sex, Symptom, TraceRow,
} from './types.js';

const LABELS = new Map(SYMPTOMS.map((s) => [s.id, s.label]));
export const label = (id: string): string => LABELS.get(id) ?? id.replace(/_/g, ' ');

export function normalize(part: BodyPart | Region): Region {
  return part === 'LeftArm' || part === 'RightArm' ? 'Arms' : part;
}

const forSex = <T extends { sex?: Sex }>(x: T, sex: Sex) => !x.sex || x.sex === sex;

export function symptomsFor(region: Region | null, sex: Sex): Symptom[] {
  return SYMPTOMS.filter((s) => forSex(s, sex) && (region === null || s.regions.includes(region)));
}

export function conditionsFor(region: Region, sex: Sex): Condition[] {
  return CONDITIONS.filter((c) => c.region === region && forSex(c, sex));
}

function ref(c: Condition): ConditionRef {
  return { id: c.id, name: c.name, region: c.region, urgent: !!c.urgent, summary: c.summary };
}

function list(ids: Iterable<string>): string {
  const words = [...ids].map(label);
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/** Boolean gate per condition: (mandatory ⊆ S) ∧ (|optional ∩ S| ≥ k). */
export function evaluate(conditions: Condition[], s: ReadonlySet<string>): TraceRow[] {
  return conditions.map((c) => {
    const mandatoryHeld = isSubset(c.mandatory, s);
    const optionalHits = [...intersection(c.optional, s)];
    return {
      conditionId: c.id, name: c.name, mandatory: c.mandatory, mandatoryHeld,
      optionalHits, optionalMinimum: c.optionalMinimum,
      passed: mandatoryHeld && optionalHits.length >= c.optionalMinimum,
    };
  });
}

/**
 * Graph step: follow edges *into* the selected region. If at least two of an
 * edge's manifested symptoms are present, the origin condition is a referral.
 */
export function findReferrals(region: Region, s: ReadonlySet<string>, sex: Sex): Referral[] {
  const out: Referral[] = [];
  for (const edge of EDGES) {
    if (edge.to !== region) continue;
    const trigger = edge.manifests.filter((m) => s.has(m));
    if (trigger.length < 2) continue;
    const origin = CONDITIONS.find((c) => c.id === edge.from && forSex(c, sex));
    if (!origin) continue;
    const hasOriginSymptoms = [...origin.mandatory, ...origin.optional].some((x) => s.has(x));
    out.push({
      condition: ref(origin), origin: origin.region, trigger, description: edge.description,
      hasOriginSymptoms, checkFor: origin.mandatory,
      score: (origin.urgent ? 100 : 50) + (trigger.length / edge.manifests.length) * 50,
    });
  }
  return out;
}

/** Urgent first, then by score descending. */
export function rank<T extends { condition: ConditionRef; score: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => Number(b.condition.urgent) - Number(a.condition.urgent) || b.score - a.score);
}

function suggestRegions(remote: ReadonlySet<string>, current: Region, sex: Sex): Region[] {
  const scores = new Map<Region, number>();
  for (const s of symptomsFor(null, sex)) {
    if (!remote.has(s.id)) continue;
    for (const r of s.regions) if (r !== current) scores.set(r, (scores.get(r) ?? 0) + 1);
  }
  return [...scores].sort((a, b) => b[1] - a[1]).map(([r]) => r);
}

const partName = (p: BodyPart) => ({ Head: 'head', Torso: 'torso', LeftArm: 'left arm', RightArm: 'right arm', Legs: 'legs' })[p];

export function diagnose(input: DiagnoseInput): DiagnoseOutput {
  const t0 = performance.now();
  const region = normalize(input.bodyPart);
  const local = symptomsFor(region, input.sex);
  const localIds = new Set(local.map((s) => s.id));

  const previous = (input.symptoms ?? []).filter((id) => localIds.has(id));
  const extracted = extract(input.message, local);
  const accumulated = union(previous, extracted);
  const all = extract(input.message, symptomsFor(null, input.sex));
  const remote = difference(all, localIds);
  const evidence = union(all, accumulated);

  const referrals = rank(findReferrals(region, evidence, input.sex));
  const rows = evaluate(conditionsFor(region, input.sex), accumulated);
  const matches: Match[] = rank(
    rows.filter((r) => r.passed).map((r) => {
      const c = CONDITIONS.find((x) => x.id === r.conditionId)!;
      return {
        condition: ref(c),
        score: union(c.mandatory, r.optionalHits).size,
        mandatory: c.mandatory,
        optionalMatched: r.optionalHits,
        alsoAffects: EDGES.filter((e) => e.from === c.id).map((e) => ({ region: e.to, description: e.description })),
      };
    }),
  );

  let reply: Reply;
  if (accumulated.size === 0 && remote.size > 0 && referrals.length === 0) {
    const suggested = suggestRegions(remote, region, input.sex);
    reply = {
      kind: 'redirect', remote: [...remote], suggested,
      lead: suggested.length
        ? `You mentioned ${list(remote)}, which belong to the ${suggested.map((r) => r.toLowerCase()).join(' or ')}. Select that region on the model to continue.`
        : `I can only assess the ${partName(input.bodyPart)} here. Describe what you feel in that area.`,
    };
  } else if (accumulated.size === 0 && all.size === 0) {
    reply = { kind: 'unrecognized', lead: "I couldn't pick out a specific symptom. Name what you feel, for example pain, numbness, nausea or swelling, and where." };
  } else if (matches.length === 0 && referrals.length === 0) {
    const prompt = REGION_PROMPTS[region];
    reply = {
      kind: 'need_more', known: [...accumulated],
      lead: accumulated.size
        ? `So far I have ${list(accumulated)}. That isn't enough to match a condition yet. ${prompt}`
        : `I need more detail about your ${partName(input.bodyPart)}. ${prompt}`,
    };
  } else {
    const urgent = [...matches, ...referrals].some((m) => m.condition.urgent);
    const lead = urgent
      ? 'Some of what you describe can be serious. If symptoms are severe or came on suddenly, seek emergency care now.'
      : matches.length === 1
        ? `Based on ${list(accumulated)}, the closest match is ${matches[0].condition.name.toLowerCase()}.`
        : matches.length > 1
          ? `Based on ${list(accumulated)}, ${matches.length} conditions fit.`
          : 'Nothing local fits on its own, but your symptoms point to a condition that starts elsewhere in the body.';
    reply = { kind: 'assessment', lead, urgent, referrals, matches };
  }

  return {
    reply,
    symptoms: [...accumulated],
    trace: {
      extracted: [...extracted], accumulated: [...accumulated], remote: [...remote],
      rows, edgesChecked: EDGES.filter((e) => e.to === region).length,
      elapsedMs: Math.round((performance.now() - t0) * 1000) / 1000,
    },
  };
}
