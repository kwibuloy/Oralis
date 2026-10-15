import { describe, expect, it } from 'vitest';
import { CONDITIONS, EDGES, SYMPTOMS, diagnose, extract, parseRequest, symptomsFor, type DiagnoseInput } from './index.js';

const ids = (r: ReturnType<typeof diagnose>) =>
  r.reply.kind === 'assessment' ? r.reply.matches.map((m) => m.condition.id) : [];
const referralIds = (r: ReturnType<typeof diagnose>) =>
  r.reply.kind === 'assessment' ? r.reply.referrals.map((m) => m.condition.id) : [];
const run = (i: DiagnoseInput) => diagnose(i);

describe('knowledge base integrity', () => {
  const known = new Set(SYMPTOMS.map((s) => s.id));

  it('has unique ids', () => {
    expect(new Set(SYMPTOMS.map((s) => s.id)).size).toBe(SYMPTOMS.length);
    expect(new Set(CONDITIONS.map((c) => c.id)).size).toBe(CONDITIONS.length);
  });

  it('only references symptoms that are local to the condition region', () => {
    for (const c of CONDITIONS) {
      const local = new Set(symptomsFor(c.region, c.sex ?? 'female').map((s) => s.id));
      for (const s of [...c.mandatory, ...c.optional]) expect(local.has(s), `${c.id} → ${s}`).toBe(true);
      expect(c.optionalMinimum).toBeLessThanOrEqual(c.optional.length);
    }
  });

  it('has edges between existing nodes', () => {
    for (const e of EDGES) {
      expect(CONDITIONS.some((c) => c.id === e.from), e.from).toBe(true);
      for (const m of e.manifests) expect(known.has(m), m).toBe(true);
      expect(e.manifests.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('symptom extraction', () => {
  const head = symptomsFor('Head', 'male');
  it('matches whole words only', () => {
    expect(extract('I feel bored', symptomsFor('Legs', 'male')).has('redness')).toBe(false);
  });
  it('respects negation', () => {
    const torso = symptomsFor('Torso', 'male');
    expect([...extract('I have a cough but no fever', torso)]).toEqual(['cough']);
    expect(extract("I don't feel dizzy", head).has('dizziness')).toBe(false);
  });
  it('handles curly apostrophes', () => {
    expect(extract('I can’t see clearly', head).has('blurred_vision')).toBe(true);
  });
});

describe('original scenarios (from the v1 benchmark)', () => {
  it('migraine on the head', () => {
    expect(ids(run({ message: 'I have a severe headache with throbbing pain and nausea', bodyPart: 'Head', sex: 'male' }))).toEqual(['Migraine']);
  });
  it('cardiac event ranks above anxiety and refers DVT', () => {
    const r = run({ message: 'chest pain shortness of breath sweating rapid heartbeat', bodyPart: 'Torso', sex: 'male' });
    expect(ids(r)).toEqual(['CardiacEvent', 'AnxietyAttack']);
    expect(referralIds(r)).toContain('DVT');
    expect(r.reply.kind === 'assessment' && r.reply.urgent).toBe(true);
  });
  it('DVT in the legs', () => {
    expect(ids(run({ message: 'swelling in my leg with leg pain and warmth', bodyPart: 'Legs', sex: 'female' }))).toEqual(['DVT']);
  });
  it('nerve compression with stroke and cardiac referrals', () => {
    const r = run({ message: 'numbness and weakness in my arm with sharp pain', bodyPart: 'LeftArm', sex: 'male' });
    expect(ids(r)).toEqual(['NerveCompression']);
    expect(referralIds(r).sort()).toEqual(['CardiacEvent', 'Stroke']);
  });
  it('menstrual cramps only for the female model', () => {
    const msg = 'menstrual cramps pelvic pain back pain';
    expect(ids(run({ message: msg, bodyPart: 'Torso', sex: 'female' }))).toEqual(['MenstrualCramps']);
    expect(ids(run({ message: msg, bodyPart: 'Torso', sex: 'male' }))).not.toContain('MenstrualCramps');
  });
  it('redirects symptoms that belong elsewhere', () => {
    const r = run({ message: 'chest pain and shortness of breath', bodyPart: 'Head', sex: 'male' });
    expect(r.reply.kind).toBe('redirect');
    expect(r.reply.kind === 'redirect' && r.reply.suggested).toEqual(['Torso']);
  });
  it('asks again when nothing is recognised', () => {
    expect(run({ message: 'I feel a bit off today', bodyPart: 'Head', sex: 'male' }).reply.kind).toBe('unrecognized');
  });
});

describe('expanded graph and stateless sessions', () => {
  it('accumulates symptoms across turns via the client-held set', () => {
    const t1 = run({ message: 'severe headache', bodyPart: 'Head', sex: 'male' });
    expect(t1.reply.kind).toBe('need_more');
    const t2 = run({ message: 'it is throbbing and I feel nauseous', bodyPart: 'Head', sex: 'male', symptoms: t1.symptoms });
    expect(ids(t2)).toEqual(['Migraine']);
  });
  it('drops carried symptoms that are not local to the new part', () => {
    const r = run({ message: 'numb', bodyPart: 'Head', sex: 'male', symptoms: ['numbness', 'severe_headache'] });
    expect(r.symptoms).toEqual(['severe_headache']);
  });
  it('traces sciatica from the legs back to the spine', () => {
    const r = run({ message: 'pain shooting down my leg and back pain', bodyPart: 'Legs', sex: 'male' });
    expect(referralIds(r)).toEqual(['Sciatica']);
    expect(r.reply.kind === 'assessment' && r.reply.referrals[0].origin).toBe('Torso');
  });
  it('flags meningitis as urgent', () => {
    const r = run({ message: 'worst headache of my life with a fever and light hurts', bodyPart: 'Head', sex: 'female' });
    expect(ids(r)[0]).toBe('Meningitis');
  });
  it('separates reflux from a cardiac event', () => {
    expect(ids(run({ message: 'heartburn and a sour taste after eating', bodyPart: 'Torso', sex: 'male' }))).toEqual(['GERD']);
  });
  it('emits a Boolean trace row per candidate condition', () => {
    const r = run({ message: 'big toe is red, swollen and hot', bodyPart: 'Legs', sex: 'male' });
    expect(ids(r)).toContain('Gout');
    expect(r.trace.rows.find((x) => x.conditionId === 'Gout')?.passed).toBe(true);
  });
});

describe('request validation', () => {
  it('rejects bad input', () => {
    expect(parseRequest(null).ok).toBe(false);
    expect(parseRequest({ message: 'x', bodyPart: 'Tail', sex: 'male' }).ok).toBe(false);
    expect(parseRequest({ message: 'x'.repeat(501), bodyPart: 'Head', sex: 'male' }).ok).toBe(false);
  });
  it('filters unknown symptom ids', () => {
    const p = parseRequest({ message: 'hi', bodyPart: 'Head', sex: 'male', symptoms: ['nausea', 'bogus', 3] });
    expect(p.ok && p.input.symptoms).toEqual(['nausea']);
  });
});
