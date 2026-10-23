import { GROUPS, noteFor } from '../content/anatomy';
import { tissueByKey } from '../content/histology';
import type { ModeId } from '../content/modes';
import { GROUP_COLOR, structureByKey } from '../content/structures';
import { fdi, morphology, palmer, universal } from '../content/teeth';
import Icon from './Icon';
import Sheet from './Sheet';

interface Props {
  mode: ModeId;
  selected: string;
  isolated: boolean;
  onIsolate: () => void;
  onClear: () => void;
}

function Field({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <dt>{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function body(mode: ModeId, key: string): { group: string; color: string; title: string; content: React.ReactNode; ref?: string; source?: string } | null {
  if (mode === 'histology') {
    const t = tissueByKey(key);
    if (!t) return null;
    return {
      group: 'Tissue', color: t.color, title: t.name,
      content: (
        <>
          <p className="detail__lead">{t.composition}</p>
          <dl>
            <Field term="Cells">{t.cells}</Field>
            <Field term="Structure"><ul className="detail__list">{t.features.map((f) => <li key={f}>{f}</li>)}</ul></Field>
            <Field term="Clinical link">{t.clinical}</Field>
          </dl>
        </>
      ),
    };
  }
  const s = structureByKey(key);
  if (!s) return null;
  const color = GROUP_COLOR[s.group] ?? '#ccc';
  if (s.tooth) {
    const m = morphology(s.tooth);
    return {
      group: `Teeth · ${s.tooth.cls}`, color, title: s.name, ref: s.fma,
      content: (
        <>
          <div className="detail__numbers">
            <span><small>FDI</small>{fdi(s.tooth)}</span>
            <span><small>Universal</small>{universal(s.tooth)}</span>
            <span><small>Palmer</small>{palmer(s.tooth)}</span>
          </div>
          <dl>
            <Field term="Roots">{m.roots}</Field>
            <Field term="Crown">{m.crown}</Field>
            <Field term="Erupts">{m.erupts}</Field>
            <Field term="Note">{m.notes}</Field>
          </dl>
        </>
      ),
    };
  }
  const note = noteFor(s.sourceName);
  return {
    group: GROUPS[s.group]?.label ?? s.group, color, title: s.name, ref: s.fma,
    // BodyParts3D meshes have FJ ids; the rest (Oral anatomy's lips) are authored for Oralis.
    source: s.meshIds[0].startsWith('FJ') ? undefined : 'Oralis (Blender)',
    content: (
      <>
        <p className="detail__lead">{note?.summary ?? GROUPS[s.group]?.blurb}</p>
        <dl>
          {note?.supply && <Field term="Nerve supply">{note.supply}</Field>}
          {note?.clinical && <Field term="Clinical link">{note.clinical}</Field>}
        </dl>
      </>
    ),
  };
}

export default function DetailCard({ mode, selected, isolated, onIsolate, onClear }: Props) {
  const b = body(mode, selected);
  if (!b) return null;
  return (
    <Sheet labelledBy="detail-title">
      <button className="icon-button detail__close" onClick={onClear} aria-label="Close details"><Icon name="close" /></button>
      <span className="detail__bar" style={{ background: b.color }} aria-hidden="true" />
      <p className="detail__group">{b.group}</p>
      <h2 id="detail-title">{b.title}</h2>
      <div className="detail__scroll">{b.content}</div>
      {b.ref && (
        <div className="detail__meta">
          <div><small>Atlas reference</small>{b.ref}</div>
          <div><small>Source</small>{b.source ?? 'BodyParts3D'}</div>
        </div>
      )}
      <button className="primary-button" onClick={onIsolate}>
        <Icon name="isolate" />
        {isolated ? 'Show surroundings' : 'Isolate structure'}
        <Icon name="chevron" size={16} />
      </button>
      <button className="text-button" onClick={onClear}>Clear selection</button>
    </Sheet>
  );
}
