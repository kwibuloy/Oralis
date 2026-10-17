export interface LoadProgress { loaded: number; total: number | null }

/**
 * Model download progress as a percentage. The size comes from the server or, when it sends none
 * (a compressed response), from the model's size at build time; the bar holds at 99% until the file
 * is in. After the download, Draco decoding takes a moment.
 */
export default function LoadingBar({ name, model, progress }: { name: string; model: string; progress: LoadProgress | null }) {
  const total = progress?.total ?? (typeof __MODEL_SIZES__ !== 'undefined' ? __MODEL_SIZES__[model] : undefined) ?? null;
  const fraction = progress && total ? Math.min(progress.loaded / total, progress.total ? 1 : 0.99) : null;
  const decoding = fraction === 1;
  const percent = fraction !== null ? Math.round(fraction * 100) : 0;
  const status = decoding ? 'Preparing the model… 100%' : progress ? `${percent}%` : 'Starting…';
  return (
    <div className="loading" role="status" aria-live="polite">
      <div className="card loading__card">
        <p className="loading__title">Loading {name}</p>
        <div className="loading__track" role="progressbar" aria-label={`Loading ${name}`} aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={fraction !== null ? percent : undefined}>
          <span className={`loading__fill${fraction === null || decoding ? ' is-indeterminate' : ''}`}
            style={fraction !== null && !decoding ? { width: `${fraction * 100}%` } : undefined} />
        </div>
        <p className="loading__status">{status}</p>
      </div>
    </div>
  );
}
