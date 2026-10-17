import { BRAIN_AREAS, DEOXYGENATED, OXYGENATED, type FunctionLayer } from '../content/function';
import Icon from './Icon';
import Sheet from './Sheet';

/** Description of one Physiology function, in the same card as a structure's details. */
export default function FunctionCard({ fn, onClose }: { fn: FunctionLayer; onClose: () => void }) {
  const legend = fn.id === 'blood'
    ? [{ label: 'Oxygenated', colour: OXYGENATED }, { label: 'Deoxygenated', colour: DEOXYGENATED }]
    : fn.id === 'brain' ? BRAIN_AREAS.map((a) => ({ label: a.label, colour: a.colour })) : [];
  return (
    <Sheet labelledBy="function-title">
      <button className="icon-button detail__close" onClick={onClose} aria-label="Close description"><Icon name="close" /></button>
      <span className="detail__bar" style={{ background: legend[0]?.colour ?? 'var(--accent)' }} aria-hidden="true" />
      <p className="detail__group">Function</p>
      <h2 id="function-title">{fn.label}</h2>
      <div className="detail__scroll">
        <p className="detail__lead">{fn.overview}</p>
        {legend.length > 0 && (
          <ul className="legend" aria-label={`${fn.label} colours`}>
            {legend.map((l) => <li key={l.label}><span className="dot" style={{ background: l.colour }} />{l.label}</li>)}
          </ul>
        )}
        {fn.animated && <p className="schematic-note detail__note">Schematic: the pulses show direction, not real speed.</p>}
      </div>
    </Sheet>
  );
}
