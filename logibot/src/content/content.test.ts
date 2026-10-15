import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GROUPS, noteFor } from './anatomy';
import { TISSUES } from './histology';
import { MODES } from './modes';
import { STRUCTURES } from './structures';
import { fdi, morphology, palmer, parseTooth, universal } from './teeth';
import { parseRoute } from '../lib/route';

const tooth = (name: string) => parseTooth(name)!;

describe('tooth numbering', () => {
  it('parses BodyParts3D names', () => {
    expect(tooth('Left lower first secondary molar tooth')).toMatchObject({ arch: 'lower', side: 'left', position: 6, cls: 'molar' });
    expect(tooth('Right upper secondary canine tooth')).toMatchObject({ arch: 'upper', side: 'right', position: 3 });
    expect(parseTooth('Mandible')).toBeNull();
  });

  it.each([
    ['Right upper central secondary incisor tooth', '11', '8', '1┘'],
    ['Left upper central secondary incisor tooth', '21', '9', '└1'],
    ['Right upper first secondary molar tooth', '16', '3', '6┘'],
    ['Left upper second secondary molar tooth', '27', '15', '└7'],
    ['Left lower first secondary molar tooth', '36', '19', '┌6'],
    ['Left lower central secondary incisor tooth', '31', '24', '┌1'],
    ['Right lower central secondary incisor tooth', '41', '25', '1┐'],
    ['Right lower second secondary molar tooth', '47', '31', '7┐'],
    ['Right lower secondary canine tooth', '43', '27', '3┐'],
  ])('%s → FDI %s, Universal %s, Palmer %s', (name, f, u, p) => {
    const t = tooth(name);
    expect([fdi(t), universal(t), palmer(t)]).toEqual([f, u, p]);
  });
});

describe('content coverage', () => {
  it('has all 28 permanent teeth with unique FDI numbers and morphology', () => {
    const teeth = STRUCTURES.filter((s) => s.tooth);
    expect(teeth).toHaveLength(28);
    expect(new Set(teeth.map((s) => fdi(s.tooth!))).size).toBe(28);
    for (const s of teeth) expect(morphology(s.tooth!), s.name).toBeDefined();
  });

  it('has a study note for every non-tooth structure', () => {
    const missing = STRUCTURES.filter((s) => !s.tooth && !noteFor(s.sourceName)).map((s) => s.sourceName);
    expect(missing).toEqual([]);
  });

  it('labels every group used by the model and by the modes', () => {
    for (const s of STRUCTURES) expect(GROUPS[s.group], s.group).toBeDefined();
    const tissueKeys = new Set(TISSUES.map((t) => t.key));
    for (const m of MODES) {
      for (const g of [...m.defaultVisible, ...(m.context ?? [])]) {
        expect(m.source === 'blender' ? tissueKeys.has(g) : g in GROUPS, `${m.id}: ${g}`).toBe(true);
      }
    }
  });
});

describe('mode models', () => {
  const glbNodeNames = (file: string) => {
    const buf = readFileSync(resolve(__dirname, '../../public/models', file));
    const len = buf.readUInt32LE(12);
    const json = JSON.parse(buf.subarray(20, 20 + len).toString('utf8'));
    return new Set<string>(json.nodes.map((n: { name: string }) => n.name));
  };

  it.each(MODES.map((m) => [m.id, m] as const))('%s model contains everything its content expects', (_, m) => {
    const names = glbNodeNames(m.model.replace('/models/', ''));
    const expected = m.source === 'blender'
      ? TISSUES.map((t) => t.key)
      : STRUCTURES.filter((s) => s.models.includes(m.id)).flatMap((s) => s.meshIds);
    expect(expected.length).toBeGreaterThan(0);
    expect(expected.filter((n) => !names.has(n))).toEqual([]);
  });

  it('keeps the dental model to the dentition and jaws', () => {
    const groups = new Set(STRUCTURES.filter((s) => s.models.includes('dental')).map((s) => s.group));
    expect([...groups].sort()).toEqual(['gingiva', 'mandible', 'maxilla', 'teeth']);
  });
});

describe('routes', () => {
  it('parses mode and selection', () => {
    expect(parseRoute('#/dental/left-maxilla')).toEqual({ mode: 'dental', selected: 'left-maxilla' });
    expect(parseRoute('#/histology')).toEqual({ mode: 'histology', selected: undefined });
    expect(parseRoute('')).toEqual({ mode: 'general' });
    expect(parseRoute('#/nonsense')).toEqual({ mode: 'general' });
  });
});
