import { GROUPS, noteFor } from '../content/anatomy';
import { tissueByKey } from '../content/histology';
import type { ModeId } from '../content/modes';
import { structureByKey } from '../content/structures';
import { fdi, morphology, palmer, universal } from '../content/teeth';

function Field({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <dt>{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export default function InfoCard({ mode, selected }: { mode: ModeId; selected: string }) {
  if (mode === 'histology') {
    const t = tissueByKey(selected);
    if (!t) return null;
    return (
      <article className="info" aria-labelledby="info-title">
        <h2 id="info-title"><span className="swatch" style={{ background: t.color }} aria-hidden="true" />{t.name}</h2>
        <dl>
          <Field term="Composition">{t.composition}</Field>
          <Field term="Cells">{t.cells}</Field>
          <Field term="Structure">
            <ul>{t.features.map((f) => <li key={f}>{f}</li>)}</ul>
          </Field>
          <Field term="Clinical link">{t.clinical}</Field>
        </dl>
      </article>
    );
  }

  const s = structureByKey(selected);
  if (!s) return null;
  if (s.tooth) {
    const m = morphology(s.tooth);
    return (
      <article className="info" aria-labelledby="info-title">
        <h2 id="info-title">{s.name}</h2>
        <p className="info__numbers">
          <span><small>FDI</small>{fdi(s.tooth)}</span>
          <span><small>Universal</small>{universal(s.tooth)}</span>
          <span><small>Palmer</small>{palmer(s.tooth)}</span>
        </p>
        <dl>
          <Field term="Class">{s.tooth.cls}</Field>
          <Field term="Roots">{m.roots}</Field>
          <Field term="Crown">{m.crown}</Field>
          <Field term="Erupts">{m.erupts}</Field>
          <Field term="Note">{m.notes}</Field>
        </dl>
      </article>
    );
  }

  const note = noteFor(s.sourceName);
  return (
    <article className="info" aria-labelledby="info-title">
      <h2 id="info-title">{s.name}</h2>
      <p className="info__group">{GROUPS[s.group]?.label}</p>
      <dl>
        <Field term="Overview">{note?.summary ?? GROUPS[s.group]?.blurb}</Field>
        {note?.supply && <Field term="Nerve supply">{note.supply}</Field>}
        {note?.clinical && <Field term="Clinical link">{note.clinical}</Field>}
        <Field term="FMA identifier">{s.fma}</Field>
      </dl>
    </article>
  );
}
