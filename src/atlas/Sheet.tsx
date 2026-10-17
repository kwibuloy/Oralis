import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

const PHONE = '(max-width: 860px)';
/** Swipe distance (px) or speed (px/ms) that settles the sheet in the other state. */
const SWIPE = 60;
const FLICK = 0.45;

/** Height of the collapsed sheet: everything down to the title. */
const peekOf = (el: HTMLElement) => {
  const title = el.querySelector('h2');
  return title ? title.offsetTop + title.offsetHeight + 12 : 96;
};

/** How much of the canvas the card covers: its height as a bottom sheet, or its width from the right edge. */
export interface SheetCover { right: number; bottom: number }
/** Atlas passes the viewer's insets here, so a card can keep the selected part in view. */
export const SheetInset = createContext<(cover: SheetCover) => void>(() => {});

/**
 * The detail card. Where there is room (desktop, tablets in landscape) a card on the right; on
 * phones and portrait tablets a bottom sheet that opens as a peek (bar, kind and name) so the tapped
 * part stays in view, and that the visitor swipes up (or taps) to read and down to hide again. It
 * stays where the visitor left it while they pick other parts or functions.
 */
export default function Sheet({ labelledBy, children }: { labelledBy: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const setInset = useContext(SheetInset);
  const [phone, setPhone] = useState(() => matchMedia(PHONE).matches);
  const [collapsed, setCollapsed] = useState(true);
  // No slide on the first frame: the sheet appears where it starts, then animates from there on.
  const [settled, setSettled] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setSettled(true)); return () => cancelAnimationFrame(id); }, []);
  const [dragY, setDragY] = useState<number | null>(null);
  const [size, setSize] = useState({ height: 0, peek: 0 });
  // Pointer capture retargets the later events to the card, so remember where the press started.
  const drag = useRef<{ y: number; t: number; base: number; moved: boolean; handle: boolean } | null>(null);

  useEffect(() => {
    const mq = matchMedia(PHONE);
    const on = () => setPhone(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  // Measure the card and its peek (everything down to the title) whenever content or width changes.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const peek = peekOf(el);
      setSize((s) => (s.height === el.offsetHeight && s.peek === peek ? s : { height: el.offsetHeight, peek }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const hiddenY = Math.max(0, size.height - size.peek);
  const y = !phone ? 0 : dragY ?? (collapsed ? hiddenY : 0);

  // Tell the viewer what the card covers once it settles: the bottom on phones (8px margin below
  // the sheet), the right-hand side elsewhere.
  // Read the element itself, not `size`: this must run in the first commit, because the viewer frames
  // the new selection in the passive effects that follow it.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!phone) {
      const area = (el.offsetParent ?? document.body).getBoundingClientRect();
      setInset({ right: area.right - el.getBoundingClientRect().left, bottom: 0 });
    } else if (dragY === null) {
      const height = el.offsetHeight;
      setInset({ right: 0, bottom: height + 8 - (collapsed ? Math.max(0, height - peekOf(el)) : 0) });
    }
  }, [phone, collapsed, dragY, size, setInset]);
  useEffect(() => () => setInset({ right: 0, bottom: 0 }), [setInset]);

  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (!phone || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const t = e.target as HTMLElement;
    // Content scrolls and buttons press as usual; the handle and the card's other parts drag it.
    if (!t.closest('.sheet__handle') && t.closest('button, a, input, .detail__scroll')) return;
    drag.current = { y: e.clientY, t: performance.now(), base: collapsed ? hiddenY : 0, moved: false, handle: !!t.closest('.sheet__handle') };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.abs(dy) < 6) return;
    d.moved = true;
    // Follow the finger, with resistance past either end.
    const raw = d.base + dy;
    setDragY(raw < 0 ? raw / 4 : raw > hiddenY ? hiddenY + (raw - hiddenY) / 4 : raw);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) {
      // A tap on the handle toggles; a tap anywhere on the peek opens the sheet again.
      if (d.handle) setCollapsed((c) => !c);
      else if (collapsed) setCollapsed(false);
      return;
    }
    const dy = e.clientY - d.y;
    const speed = dy / Math.max(1, performance.now() - d.t);
    setDragY(null);
    if (speed > FLICK || (!collapsed && dy > SWIPE)) setCollapsed(true);
    else if (speed < -FLICK || (collapsed && dy < -SWIPE)) setCollapsed(false);
  };
  const onPointerCancel = () => { drag.current = null; setDragY(null); };

  return (
    <aside ref={ref} className={`card detail${phone ? ' sheet' : ''}${collapsed && phone ? ' is-collapsed' : ''}${dragY !== null || !settled ? ' is-dragging' : ''}`}
      aria-labelledby={labelledBy} style={phone ? { transform: `translateY(${y}px)` } : undefined}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}>
      {phone && (
        <button className="sheet__handle" aria-expanded={!collapsed} aria-label={collapsed ? 'Show details' : 'Hide details to see the model'}
          onClick={(e) => { if (e.detail === 0) setCollapsed((c) => !c); /* keyboard; taps are handled above */ }}>
          <span aria-hidden="true" />
        </button>
      )}
      {children}
    </aside>
  );
}
