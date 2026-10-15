import { useEffect, useRef, useState } from 'react';
import { TISSUES } from '../content/histology';
import { MODES } from '../content/modes';
import { ALL_PLATES, PLATES, type Plate } from '../content/plates';
import { BODYPARTS3D, SITE } from '../content/site';
import { STRUCTURES } from '../content/structures';
import { modeHref } from '../lib/route';
import { useReveal } from '../lib/useReveal';
import ModeShowcase from './ModeShowcase';
import './landing.css';

const HERO_CYCLE: Plate[] = [PLATES.foxSkull, PLATES.jaws, PLATES.encyclopedie, PLATES.skullBones];
const stagger = (i: number) => ({ '--i': i }) as React.CSSProperties;

/** Crossfades the fixed half: cycles while the hero is in view, then holds the Encyclopédie plate. */
function useStagePlate(heroRef: React.RefObject<HTMLElement | null>) {
  const [inHero, setInHero] = useState(true);
  const [i, setI] = useState(0);

  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInHero(e.intersectionRatio > 0.35), { threshold: [0, 0.35, 1] });
    io.observe(el);
    return () => io.disconnect();
  }, [heroRef]);

  useEffect(() => {
    if (!inHero || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = setInterval(() => !document.hidden && setI((n) => (n + 1) % HERO_CYCLE.length), 6000);
    return () => clearInterval(id);
  }, [inHero]);

  return inHero ? HERO_CYCLE[i] : PLATES.encyclopedie;
}

function Row({ what, value }: { what: string; value: React.ReactNode }) {
  return (
    <li className="slip__row">
      <span>{what}</span>
      <span className="slip__dots" aria-hidden="true" />
      <span>{value}</span>
    </li>
  );
}

export default function Landing() {
  const root = useRef<HTMLElement>(null);
  const hero = useRef<HTMLElement>(null);
  const plate = useStagePlate(hero);
  useReveal(root);

  const teeth = STRUCTURES.filter((s) => s.tooth).length;
  const general = STRUCTURES.length;

  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <main id="main" ref={root}>
        <div className="split">
          <div className="split__column">
            <section className="hero" ref={hero} aria-labelledby="hero-title">
              <nav className="hero__nav" aria-label="Primary">
                <a className="link" href="#modes">Modes</a>
                <a className="hero__wordmark" href="#/" aria-label={`${SITE.name} home`}>{SITE.name}</a>
                <a className="link" href="#why">About</a>
              </nav>
              <div className="hero__body">
                <h1 id="hero-title" className="hero__title" data-reveal>The mouth, taken apart.</h1>
                <p className="hero__lead" data-reveal style={stagger(1)}>
                  A 3D atlas for dental students. Turn a real skull, lift out each of the 28 permanent teeth, and cut a tooth
                  open to its pulp. Click any part to read what it is, what supplies it, and why it matters in the clinic.
                </p>
                <a className="button" href={modeHref('general')} data-reveal style={stagger(2)}>Open the atlas</a>
              </div>
            </section>

            <section id="modes" className="how" aria-labelledby="modes-title">
              <div className="how__intro">
                <h2 id="modes-title" data-reveal>Three ways into one mouth</h2>
                <p data-reveal style={stagger(1)}>
                  Each mode loads the model its subject needs. The counts below come straight from the atlas, not from a brochure.
                </p>
              </div>
              <div className="slip-wrap" data-reveal style={stagger(2)}>
                <div className="slip">
                  <h3><a href={modeHref('general')}>General anatomy</a></h3>
                  <ol>
                    <Row what="Selectable structures" value={general} />
                    <Row what="Bones of skull and neck" value={STRUCTURES.filter((s) => ['skull', 'maxilla', 'mandible', 'neck-bones'].includes(s.group)).length} />
                    <Row what="Muscles, glands and soft tissue" value={STRUCTURES.filter((s) => !['skull', 'maxilla', 'mandible', 'neck-bones', 'teeth'].includes(s.group)).length} />
                  </ol>
                  <h3><a href={modeHref('dental')}>Dental anatomy</a></h3>
                  <ol>
                    <Row what="Permanent teeth" value={teeth} />
                    <Row what="Numbering systems" value="FDI, Universal, Palmer" />
                    <Row what="Notes per tooth" value="roots, crown, eruption" />
                  </ol>
                  <h3><a href={modeHref('histology')}>Histology</a></h3>
                  <ol>
                    <Row what="Tissues in section" value={TISSUES.length} />
                    <Row what="Cut" value="longitudinal, in the socket" />
                  </ol>
                  <a className="slip__result" href={modeHref('general')}>
                    <span>Start with general anatomy</span>
                    <span aria-hidden="true">→</span>
                  </a>
                </div>
              </div>
            </section>
          </div>

          <figure className="split__stage">
            {ALL_PLATES.map((p) => (
              <img key={p.src} src={p.src} width={p.width} height={p.height} alt={p === plate ? p.alt : ''} className={p === plate ? 'is-shown' : undefined} decoding="async" />
            ))}
            <figcaption className="stage__bar">
              <span>{plate.title.split(',')[0]}</span>
              <span>{general} structures · {TISSUES.length} tissues</span>
            </figcaption>
          </figure>
        </div>

        <ModeShowcase />

        <section id="why" className="letter" aria-label="Why this atlas exists">
          <div className="letter__body">
            <p data-reveal>Dental anatomy is learned in three dimensions and examined in two. Textbook plates show a molar from five sides; the patient in the chair shows it from one, at an angle, half hidden by gingiva.</p>
            <p data-reveal>So this atlas lets you hold the thing itself. The geometry comes from BodyParts3D, a model built from a real adult scan, so the roots sit in real bone and the floor of the mouth has the slope you will feel under a mirror.</p>
            <p data-reveal>Every structure answers the questions an exam or a clinic will ask: <mark>what supplies it, what it is next to, what goes wrong</mark>. Tooth numbers switch between FDI, Universal and Palmer, because you will meet all three.</p>
            <p data-reveal>Some things the source data does not include: the muscles of mastication, the trigeminal branches and the parotid gland. They are named as gaps rather than drawn from guesswork.</p>
            <p data-reveal>It is a study aid. Check what you learn against your course and your teachers.</p>
            <p className="letter__sign" data-reveal>
              <em>{SITE.author}</em>
              <span>Author, {SITE.name}</span>
            </p>
          </div>
        </section>
      </main>

      <footer className="footer">
        <img src={PLATES.foxSkull.src} width={PLATES.foxSkull.width} height={PLATES.foxSkull.height} alt="" loading="lazy" />
        <div className="footer__top">
          <ul>
            {MODES.map((m) => <li key={m.id}><a className="link" href={modeHref(m.id)}>{m.name}</a></li>)}
            <li><a className="link" href={SITE.repo}>Source on GitHub</a></li>
          </ul>
          <p>{SITE.tagline}. Code under the MIT licence.</p>
        </div>
        <div className="footer__bottom">
          <p className="footer__wordmark" aria-hidden="true">{SITE.name}</p>
          <p className="footer__legal">
            For education only; not for diagnosis or treatment planning. 3D geometry: <a className="link" href={BODYPARTS3D.url}>{BODYPARTS3D.name}</a>,{' '}
            {BODYPARTS3D.by}, <a className="link" href={BODYPARTS3D.license.url}>{BODYPARTS3D.license.name}</a>, via <a className="link" href={BODYPARTS3D.via.url}>{BODYPARTS3D.via.name}</a>, reduced to the head and neck.
          </p>
          <p className="footer__legal">
            Plates via Wikimedia Commons, mostly from the Wellcome Collection:{' '}
            {ALL_PLATES.map((p, n) => (
              <span key={p.src}>
                <a className="link" href={p.page}>{p.title}</a>{' '}
                ({p.license.url ? <a className="link" href={p.license.url}>{p.license.name}</a> : p.license.name}){n < ALL_PLATES.length - 1 ? '; ' : '.'}
              </span>
            ))}
          </p>
        </div>
      </footer>
    </>
  );
}
