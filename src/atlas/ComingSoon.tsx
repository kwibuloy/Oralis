import { subjectById, type SubjectId } from '../content/subjects';
import { SITE } from '../content/site';
import SubjectPicker from './SubjectPicker';
import './atlas.css';

/** Placeholder for a subject whose 3D model is not built yet. */
export default function ComingSoon({ id }: { id: SubjectId }) {
  const s = subjectById(id)!;
  return (
    <div className="atlas" data-mode={id}>
      <header className="brand">
        <p className="brand__eyebrow"><span className="brand__dot" />{SITE.eyebrow}</p>
        <h1>{SITE.name} <span className="chip">3D</span></h1>
      </header>
      <SubjectPicker current={id} />
      <section className="card soon" aria-labelledby="soon-title">
        <p className="soon__eyebrow">{s.group} · model in progress</p>
        <h2 id="soon-title">{s.name}</h2>
        <p>{s.planned}</p>
      </section>
    </div>
  );
}
