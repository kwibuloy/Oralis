export interface LoadProgress { loaded: number; total: number | null }

const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);

/**
 * Model download progress. With a known size it fills and shows "4.1 of 10.3 MB · 40%"; without one
 * (no Content-Length) it slides indeterminately. After the download, Draco decoding takes a moment.
 */
export default function LoadingBar({ name, progress }: { name: string; progress: LoadProgress | null }) {
  const fraction = progress?.total ? Math.min(progress.loaded / progress.total, 1) : null;
  const decoding = fraction === 1;
  const status = decoding ? 'Preparing the model…'
    : fraction !== null && progress?.total ? `${mb(progress.loaded)} of ${mb(progress.total)} MB · ${Math.round(fraction * 100)}%`
      : progress ? `${mb(progress.loaded)} MB` : 'Starting…';
  return (
    <div className="loading" role="status" aria-live="polite">
      <div className="card loading__card">
        <p className="loading__title">Loading {name}</p>
        <div className="loading__track" role="progressbar" aria-label={`Loading ${name}`} aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={fraction !== null ? Math.round(fraction * 100) : undefined}>
          <span className={`loading__fill${fraction === null || decoding ? ' is-indeterminate' : ''}`}
            style={fraction !== null && !decoding ? { width: `${fraction * 100}%` } : undefined} />
        </div>
        <p className="loading__status">{status}</p>
      </div>
    </div>
  );
}
