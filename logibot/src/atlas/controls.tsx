/** Small shared controls in the Human Atlas style. */

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)}>
      <span className="switch__thumb" />
    </button>
  );
}

export function Segmented<T extends string>({ label, value, options, onChange }: {
  label: string; value: T | null; options: [T, string][]; onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} role="radio" aria-checked={value === v} onClick={() => onChange(v)}>{text}</button>
      ))}
    </div>
  );
}
