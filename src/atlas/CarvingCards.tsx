import { CARVING_TOOTH, KIND_LABEL, type Landmark } from '../content/carving';
import Icon from './Icon';

const singular = (kind: Landmark['kind']) => ({ cusp: 'Cusp', ridge: 'Ridge', groove: 'Groove', fossa: 'Fossa', pit: 'Pit', contour: 'Contour', cervix: 'Cervical line', root: 'Root' }[kind] ?? KIND_LABEL[kind]);

/** A carving-tooth landmark (tapped on its pin or in the list), in the structure card's layout. */
export function LandmarkCard({ landmark, onClose }: { landmark: Landmark; onClose: () => void }) {
  return (
    <aside className="card detail" aria-labelledby="landmark-title">
      <button className="icon-button detail__close" onClick={onClose} aria-label="Close landmark"><Icon name="close" /></button>
      <span className="detail__bar" style={{ background: 'var(--select)' }} aria-hidden="true" />
      <p className="detail__group">{singular(landmark.kind)} · {landmark.n}</p>
      <h2 id="landmark-title">{landmark.name}</h2>
      <div className="detail__scroll">
        <p className="detail__lead">{landmark.note}</p>
      </div>
      <div className="detail__meta">
        <div><small>Tooth</small>{CARVING_TOOTH.name}</div>
        <div><small>FDI · Universal</small>{CARVING_TOOTH.numbers.fdi} · {CARVING_TOOTH.numbers.universal}</div>
      </div>
    </aside>
  );
}

/** The carving tooth itself (tapped crown or roots). */
export function ToothCard({ part, onClose }: { part: string; onClose: () => void }) {
  const p = CARVING_TOOTH.parts[part];
  return (
    <aside className="card detail" aria-labelledby="tooth-title">
      <button className="icon-button detail__close" onClick={onClose} aria-label="Close details"><Icon name="close" /></button>
      <span className="detail__bar" style={{ background: part === 'carving-crown' ? '#e9e2d2' : '#d9c39a' }} aria-hidden="true" />
      <p className="detail__group">{p?.name ?? 'Carving tooth'}</p>
      <h2 id="tooth-title">{CARVING_TOOTH.name}</h2>
      <div className="detail__scroll">
        <p className="detail__lead">{CARVING_TOOTH.summary}</p>
        {p && <p className="detail__lead">{p.note}</p>}
      </div>
      <div className="detail__meta">
        <div><small>FDI · Universal · Palmer</small>{CARVING_TOOTH.numbers.fdi} · {CARVING_TOOTH.numbers.universal} · {CARVING_TOOTH.numbers.palmer}</div>
        <div><small>Model</small>Idealised (Wheeler)</div>
      </div>
    </aside>
  );
}
