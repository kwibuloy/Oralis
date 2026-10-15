import { useEffect, useRef, useState } from 'react';
import { modeById } from '../content/modes';
import { SUBJECT_GROUPS, SUBJECTS, subjectById, type SubjectId } from '../content/subjects';
import { modeHref } from '../lib/route';

/** Subject switcher: a card button that opens a grouped panel of links (one per subject route). */
export default function SubjectPicker({ current }: { current: SubjectId }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const subject = subjectById(current)!;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); root.current?.querySelector<HTMLButtonElement>('.picker__button')?.focus(); }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      // Arrow keys move through the subjects in reading order.
      const links = [...(root.current?.querySelectorAll<HTMLAnchorElement>('.picker__item') ?? [])];
      const i = links.indexOf(document.activeElement as HTMLAnchorElement);
      links[(i + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length]?.focus();
      e.preventDefault();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    root.current?.querySelector<HTMLAnchorElement>('.picker__item[aria-current]')?.focus();
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div className="picker" ref={root}>
      <button className="card picker__button" aria-expanded={open} aria-controls="subject-panel" onClick={() => setOpen((o) => !o)}>
        <span className="picker__text">
          <span className="picker__eyebrow">{subject.group}</span>
          <span className="picker__name">{subject.name}</span>
        </span>
        <svg className="picker__chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <nav id="subject-panel" className="card picker__panel" aria-label="Subjects">
          {SUBJECT_GROUPS.map((g) => (
            <section key={g} className="picker__group">
              <h3>{g}</h3>
              {SUBJECTS.filter((s) => s.group === g).map((s) => (
                <a key={s.id} className="picker__item" href={modeHref(s.id)} aria-current={s.id === current ? 'page' : undefined} onClick={() => setOpen(false)}>
                  <span>{s.name}</span>
                  {!modeById(s.id) && <span className="picker__soon">Soon</span>}
                </a>
              ))}
            </section>
          ))}
        </nav>
      )}
    </div>
  );
}
