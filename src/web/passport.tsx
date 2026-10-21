// The tourist's travel passport: an open notebook of photo memories, with real page turns
// (buttons, keyboard and dragging by hand), a paper sound, and a closed cover for visitors.
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useApp } from './lib/app';
import { useFmt } from './lib/format';
import { photoSrc } from './assets';
import { Icon, Modal } from './ui';

export type PassportPage = { id: number; img: string; place: string; city: string; date: string; note: string };
export type PassportData = { number: string; pages: PassportPage[]; cities: number };
type Holder = { id: number; name: string; country: string; avatar?: string | null };

const TURN_MS = 820;
const SOUND_KEY = 'tg.passport.sound';
const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const easeOutCubic = (k: number) => 1 - Math.pow(1 - k, 3);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
// "Ishtar Gate (reconstruction)" → "Ishtar Gate"
const cleanPlace = (s: string) => s.replace(/\s*[([].*?[)\]]\s*/g, ' ').trim();
const isArabic = (s: string) => /[؀-ۿ]/.test(s);

// ---------------------------------------------------------------- sound
// A paper page turn made with the Web Audio API (no audio files): a rising rustle as the page lifts,
// a few crackles while it bends, an airy swish in the middle and a soft thump when it lands.
let audio: AudioContext | null = null;
export function playPageTurn(ms = TURN_MS) {
  try {
    const AC: typeof AudioContext | undefined = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    audio ||= new AC();
    if (audio.state === 'suspended') audio.resume();
    const ac = audio;
    const t0 = ac.currentTime + 0.01;
    const d = Math.max(0.25, ms / 1000);
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -22;
    comp.ratio.value = 3;
    comp.connect(ac.destination);
    const master = ac.createGain();
    master.gain.value = 0.5;
    master.connect(comp);
    const noise = (len: number) => {
      const b = ac.createBuffer(1, Math.max(1, Math.ceil(ac.sampleRate * len)), ac.sampleRate);
      const ch = b.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
      return b;
    };
    const layer = (start: number, dur: number, type: BiquadFilterType, f1: number, f2: number, q: number, peak: number, attack: number) => {
      const src = ac.createBufferSource();
      src.buffer = noise(dur + 0.05);
      const f = ac.createBiquadFilter();
      f.type = type;
      f.Q.value = q;
      f.frequency.setValueAtTime(f1, start);
      f.frequency.exponentialRampToValueAtTime(f2, start + dur);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(peak, start + Math.max(0.004, dur * attack));
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      src.connect(f).connect(g).connect(master);
      src.start(start);
      src.stop(start + dur + 0.05);
    };
    layer(t0, d * 0.45, 'bandpass', 1400, 4200, 0.9, 0.32, 0.75); // rustle as the page lifts
    for (let i = 0; i < 6; i++) layer(t0 + d * (0.12 + Math.random() * 0.55), 0.01 + Math.random() * 0.014, 'highpass', 2800, 3600, 1, 0.18 + Math.random() * 0.3, 0.12); // crackles
    layer(t0 + d * 0.32, d * 0.42, 'highpass', 2200, 5600, 0.5, 0.22, 0.5); // swish
    layer(t0 + d * 0.86, 0.17, 'lowpass', 420, 110, 0.9, 0.55, 0.12); // soft landing thump
  } catch {
    /* sound is a nice extra; never break the page for it */
  }
}

function useSound(): [boolean, () => void] {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(SOUND_KEY) !== 'off';
    } catch {
      return true;
    }
  });
  const toggle = () =>
    setOn((v) => {
      try {
        localStorage.setItem(SOUND_KEY, v ? 'off' : 'on');
      } catch {
        /* private mode */
      }
      return !v;
    });
  return [on, toggle];
}

const SoundIcon = ({ on }: { on: boolean }) => (
  <svg aria-hidden="true" width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
    {on ? <path d="M15.5 9a4 4 0 0 1 0 6M18.2 6.5a7.5 7.5 0 0 1 0 11" /> : <path d="M16 9.5l5 5M21 9.5l-5 5" />}
  </svg>
);

// ---------------------------------------------------------------- pages
function HolderPage({ holder, data, trips }: { holder: Holder; data: PassportData; trips: number }) {
  const { t } = useApp();
  const fmt = useFmt();
  return (
    <div className="pp-holder">
      <div className="pp-eyebrow">{t('pp.eyebrow')}</div>
      <div className="pp-title">{t('pp.title')}</div>
      <div className="pp-holder-mid">
        <dl className="pp-fields">
          <div>
            <dt>{t('pp.name')}</dt>
            <dd>
              <bdi>{holder.name}</bdi>
            </dd>
          </div>
          <div>
            <dt>{t('pp.nationality')}</dt>
            <dd>
              <bdi>{holder.country || '—'}</bdi>
            </dd>
          </div>
          <div>
            <dt>{t('pp.number')}</dt>
            <dd className="pp-mono" dir="ltr">
              {data.number}
            </dd>
          </div>
        </dl>
        <div className="pp-photo">{holder.avatar ? <img src={holder.avatar} alt="" draggable={false} /> : <span>{initials(holder.name)}</span>}</div>
      </div>
      <div className="pp-stats">
        <div>
          <b>{fmt.num(data.pages.length)}</b>
          <span>{t('pp.stat_memories')}</span>
        </div>
        <div>
          <b>{fmt.num(data.cities)}</b>
          <span>{t('pp.stat_cities')}</span>
        </div>
        <div>
          <b>{fmt.num(trips)}</b>
          <span>{t('pp.stat_trips')}</span>
        </div>
      </div>
      <div className="pp-sign">
        <span className="pp-sign-name" dir="auto">
          {holder.name}
        </span>
        <span className="pp-sign-label">{t('pp.signature')}</span>
      </div>
    </div>
  );
}

function MemoryPage({ page, n, total, onOpen }: { page: PassportPage; n: number; total: number; onOpen(): void }) {
  const { t } = useApp();
  const fmt = useFmt();
  const [broken, setBroken] = useState(false);
  const name = cleanPlace(page.place);
  const size = name.length > 22 ? ' xs' : name.length > 13 ? ' sm' : '';
  return (
    <div className="pp-leaf-in">
      <div className="pp-leaf-head">
        <span>{t('pp.page_n', { n, total })}</span>
        <span>{fmt.city(page.city)}</span>
      </div>
      <button type="button" className={'pp-mount ink-' + page.city} onClick={onOpen} aria-label={t('pp.open_memory', { place: name })}>
        <span className="pp-tape" aria-hidden="true" />
        <span className="pp-shot">
          {broken ? (
            <span className="pp-shot-fallback">
              <Icon name="image" size={28} />
            </span>
          ) : (
            <img src={photoSrc(page.img)} alt="" draggable={false} onError={() => setBroken(true)} />
          )}
          <span className="pp-vignette" aria-hidden="true" />
          <span className={'pp-script' + size + (isArabic(name) ? ' ar' : '')} dir="auto">
            {name}
          </span>
        </span>
        <span className="pp-mount-foot" aria-hidden="true">
          <span>IRAQ · العراق</span>
          <span>№ {n}</span>
        </span>
        <i className="pp-corner a" aria-hidden="true" />
        <i className="pp-corner b" aria-hidden="true" />
        <i className="pp-corner c" aria-hidden="true" />
        <i className="pp-corner d" aria-hidden="true" />
      </button>
      <div className="pp-caption">
        <strong dir="auto">{name}</strong>
        <span>
          {fmt.city(page.city)} · {fmt.date(page.date, { day: 'numeric', month: 'short', year: 'numeric' })}
        </span>
        {page.note && <p dir="auto">{page.note}</p>}
      </div>
    </div>
  );
}

function BlankPage({ empty, editable, onAdd }: { empty: boolean; editable: boolean; onAdd?(): void }) {
  const { t } = useApp();
  return (
    <div className="pp-leaf-in pp-blank">
      <div className="pp-blank-frame">
        <Icon name="camera" size={30} />
        <strong>{empty ? t('pp.first_page') : t('pp.next_page')}</strong>
        <span>{editable ? t('pp.blank_owner') : t('pp.blank_visitor')}</span>
        {editable && onAdd && (
          <button type="button" className="pp-add" onClick={onAdd}>
            <Icon name="plus" size={16} stroke={2.4} /> {t('pp.add')}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- the book
type Turn = { dir: 'next' | 'prev' };

export function PassportBook({ holder, data, trips, editable = false, onAdd, onDelete }: { holder: Holder; data: PassportData; trips: number; editable?: boolean; onAdd?(): void; onDelete?(id: number): void }) {
  const { t } = useApp();
  const fmt = useFmt();
  const pages = data.pages;
  const total = pages.length; // the page after the last memory is the blank one
  const [index, setIndex] = useState(Math.max(0, total - 1)); // opens on the newest memory
  const [turn, setTurn] = useState<Turn | null>(null);
  const [open, setOpen] = useState<PassportPage | null>(null);
  const [sound, toggleSound] = useSound();
  const rtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';

  const bookRef = useRef<HTMLDivElement>(null);
  const spineRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const shadeHold = useRef<HTMLDivElement>(null);
  const shadeLeaf = useRef<HTMLDivElement>(null);
  const shadeFront = useRef<HTMLDivElement>(null);
  const shadeBack = useRef<HTMLDivElement>(null);
  const angle = useRef(0);
  const raf = useRef(0);
  const live = useRef({ index, turn, total, sound });
  live.current = { index, turn, total, sound };
  const drag = useRef<null | { id: number; x0: number; y0: number; dir: Turn['dir']; mid: number; grab: number; started: boolean; lastD: number; lastT: number; lastMove: number; v: number }>(null);
  const swallowClick = useRef(false);

  // Keep the page in range when memories are added or removed.
  useEffect(() => {
    setIndex((i) => clamp(i, 0, Math.max(0, total)));
  }, [total]);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  // Draws the sheet at an angle (0 = lying on the memory side, 180 = lying on the holder's page) and its shadows.
  const apply = useCallback(
    (a: number) => {
      angle.current = a;
      const p = a / 180;
      if (sheetRef.current) sheetRef.current.style.transform = `rotateY(${rtl ? a : -a}deg)`;
      if (shadeLeaf.current) shadeLeaf.current.style.opacity = String((1 - p) * 0.55); // page being uncovered
      if (shadeHold.current) shadeHold.current.style.opacity = String(p * 0.45); // page being covered
      const bend = Math.sin((a * Math.PI) / 180);
      if (shadeFront.current) shadeFront.current.style.opacity = String(p < 0.5 ? bend * 0.32 : 0);
      if (shadeBack.current) shadeBack.current.style.opacity = String(p >= 0.5 ? bend * 0.32 : 0);
    },
    [rtl],
  );

  const finish = (dir: Turn['dir'], done: boolean) => {
    if (done) setIndex((i) => (dir === 'next' ? i + 1 : i - 1));
    setTurn(null);
  };

  const runTo = (from: number, to: number, ms: number, ease: (k: number) => number, done: () => void) => {
    cancelAnimationFrame(raf.current);
    const start = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / ms);
      apply(from + (to - from) * ease(k));
      if (k < 1) raf.current = requestAnimationFrame(step);
      else done();
    };
    raf.current = requestAnimationFrame(step);
  };

  // A turn started by a button or a key: the sheet swings the whole way in 820 ms.
  const pending = useRef<null | Turn['dir']>(null);
  const go = (dir: Turn['dir']) => {
    const { index: i, turn: busy, total: n } = live.current;
    if (busy || (dir === 'next' ? i >= n : i <= 0)) return;
    if (reducedMotion()) {
      setIndex(dir === 'next' ? i + 1 : i - 1);
      return;
    }
    pending.current = dir;
    setTurn({ dir });
  };
  useLayoutEffect(() => {
    if (!turn) return;
    const from = turn.dir === 'next' ? 0 : 180;
    if (pending.current) {
      const dir = pending.current;
      pending.current = null;
      apply(from);
      if (live.current.sound) playPageTurn(TURN_MS);
      runTo(from, dir === 'next' ? 180 : 0, TURN_MS, easeInOut, () => finish(dir, true));
    } else apply(angle.current);
  }, [turn]);

  // ---- dragging a page by hand (mouse, touch and pen)
  const onPointerDown = (e: React.PointerEvent) => {
    if (live.current.turn || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const side = (e.target as HTMLElement).closest('[data-side]')?.getAttribute('data-side');
    const { index: i, total: n } = live.current;
    const dir: Turn['dir'] | null = side === 'leaf' && i < n ? 'next' : side === 'hold' && i > 0 ? 'prev' : null;
    if (!dir || !spineRef.current) return;
    const r = spineRef.current.getBoundingClientRect();
    const mid = r.left + r.width / 2;
    const d0 = (e.clientX - mid) * (rtl ? -1 : 1);
    drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, dir, mid, grab: Math.max(30, Math.abs(d0)), started: false, lastD: d0, lastT: performance.now(), lastMove: performance.now(), v: 0 };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const g = drag.current;
    if (!g || g.id !== e.pointerId) return;
    if (!g.started) {
      const dx = Math.abs(e.clientX - g.x0);
      const dy = Math.abs(e.clientY - g.y0);
      if (dy > 12 && dy > dx) {
        drag.current = null; // a scroll, not a page turn
        return;
      }
      if (dx < 8) return;
      g.started = true;
      swallowClick.current = true;
      try {
        bookRef.current?.setPointerCapture(e.pointerId);
      } catch {
        /* older browsers */
      }
      angle.current = g.dir === 'next' ? 0 : 180;
      setTurn({ dir: g.dir });
    }
    e.preventDefault();
    const d = (e.clientX - g.mid) * (rtl ? -1 : 1);
    const now = performance.now();
    const dt = Math.max(1, now - g.lastT);
    if (Math.abs(d - g.lastD) > 0.5) g.lastMove = now;
    g.v = g.v * 0.6 + ((d - g.lastD) / dt) * 0.4; // smoothed speed along the page, px/ms
    g.lastD = d;
    g.lastT = now;
    // The point you grabbed stays under your finger.
    const a = (Math.acos(clamp(d / g.grab, -1, 1)) * 180) / Math.PI;
    apply(a);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const g = drag.current;
    drag.current = null;
    if (!g || g.id !== e.pointerId || !g.started) return;
    const a = angle.current;
    const flicking = performance.now() - g.lastMove < 90;
    const done = g.dir === 'next' ? a > 90 || (flicking && g.v < -0.3) : a < 90 || (flicking && g.v > 0.3);
    const target = g.dir === 'next' ? (done ? 180 : 0) : done ? 0 : 180;
    const ms = 140 + 380 * (Math.abs(target - a) / 180);
    if (done && live.current.sound) playPageTurn(ms);
    runTo(a, target, ms, easeOutCubic, () => finish(g.dir, done));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const fwd = rtl ? 'ArrowLeft' : 'ArrowRight';
    const back = rtl ? 'ArrowRight' : 'ArrowLeft';
    if (e.key === fwd || e.key === 'PageDown') {
      e.preventDefault();
      go('next');
    } else if (e.key === back || e.key === 'PageUp') {
      e.preventDefault();
      go('prev');
    }
  };

  const leaf = (i: number) =>
    i >= total ? <BlankPage empty={total === 0} editable={editable} onAdd={onAdd} /> : <MemoryPage page={pages[i]} n={i + 1} total={total} onOpen={() => setOpen(pages[i])} />;
  const under = turn ? (turn.dir === 'next' ? index + 1 : index) : index;
  const front = turn ? (turn.dir === 'next' ? index : index - 1) : -1;
  const label = index >= total ? (total ? t('pp.page_blank') : t('pp.first_page')) : t('pp.page_n', { n: index + 1, total });

  return (
    <div className="pp-wrap">
      <div
        ref={bookRef}
        className={'pp-book' + (turn ? ' turning' : '')}
        tabIndex={0}
        role="group"
        aria-roledescription={t('pp.book')}
        aria-label={t('pp.book_label', { name: holder.name })}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={(e) => {
          if (swallowClick.current) {
            swallowClick.current = false;
            e.stopPropagation();
            e.preventDefault();
          }
        }}
      >
        <div className="pp-spread">
          <div className="pp-page pp-hold" data-side="hold">
            <HolderPage holder={holder} data={data} trips={trips} />
            <div ref={shadeHold} className="pp-cast hold" aria-hidden="true" />
          </div>
          <div ref={spineRef} className="pp-spine" aria-hidden="true">
            {Array.from({ length: 9 }, (_, i) => (
              <i key={i} />
            ))}
          </div>
          <div className="pp-page pp-leaf" data-side="leaf" aria-live="polite">
            {leaf(under)}
            <div ref={shadeLeaf} className="pp-cast leaf" aria-hidden="true" style={{ opacity: 0 }} />
          </div>
          {turn && front >= 0 && (
            <div ref={sheetRef} className="pp-sheet" data-side={turn.dir === 'next' ? 'leaf' : 'hold'} aria-hidden="true">
              <div className="pp-face front pp-page">
                {leaf(front)}
                <div ref={shadeFront} className="pp-face-shade" />
              </div>
              <div className="pp-face back pp-page">
                <HolderPage holder={holder} data={data} trips={trips} />
                <div ref={shadeBack} className="pp-face-shade" />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="pp-controls">
        <button type="button" className="pp-ctl" onClick={() => go('prev')} disabled={!!turn || index <= 0} aria-label={t('pp.prev')}>
          <Icon name="back" size={20} className="flip" />
        </button>
        <span className="pp-count" aria-live="polite">
          {label}
        </span>
        <button type="button" className="pp-ctl" onClick={() => go('next')} disabled={!!turn || index >= total} aria-label={t('pp.next')}>
          <Icon name="next" size={20} className="flip" />
        </button>
        <button type="button" className="pp-ctl" onClick={toggleSound} aria-pressed={sound} aria-label={sound ? t('pp.sound_off') : t('pp.sound_on')}>
          <SoundIcon on={sound} />
        </button>
      </div>
      <p className="pp-hint">{t('pp.hint')}</p>

      {open && (
        <Modal title={cleanPlace(open.place)} onClose={() => setOpen(null)}>
          <div className="stack pp-detail">
            <img src={photoSrc(open.img)} alt={cleanPlace(open.place)} />
            <span className="small muted">
              {fmt.city(open.city)} · {fmt.date(open.date, { day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
            {open.note && <p dir="auto">{open.note}</p>}
            {editable && onDelete && (
              <button
                type="button"
                className="btn danger"
                onClick={() => {
                  onDelete(open.id);
                  setOpen(null);
                }}
              >
                <Icon name="trash" size={18} /> {t('pp.remove')}
              </button>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- closed cover
const Emblem = () => (
  <svg viewBox="0 0 64 64" aria-hidden="true" className="pp-emblem">
    <circle cx="32" cy="32" r="29" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="32" cy="32" r="24" fill="none" stroke="currentColor" strokeWidth="0.8" strokeDasharray="1.5 2.5" />
    <path d="M46 18L28 34M46 18l-11 29-6.5-11.5L17 29z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
  </svg>
);

export function ClosedPassport({ name, pages, onOpen, label }: { name: string; pages: number; onOpen(): void; label?: string }) {
  const { t } = useApp();
  const [opening, setOpening] = useState(false);
  const open = () => {
    if (reducedMotion()) return onOpen();
    setOpening(true);
    playPageTurnIfOn();
    setTimeout(onOpen, 560);
  };
  return (
    <div className="pp-closed-wrap">
      <button type="button" className={'pp-closed' + (opening ? ' opening' : '')} onClick={open} aria-label={label || t('pp.open_cover', { name })}>
        <span className="pp-edges" aria-hidden="true" />
        <span className="pp-cover">
          <span className="pp-cover-rings" aria-hidden="true">
            {Array.from({ length: 9 }, (_, i) => (
              <i key={i} />
            ))}
          </span>
          <span className="pp-cover-frame">
            <span className="pp-cover-title">جواز السفر</span>
            <Emblem />
            <span className="pp-cover-en">TRAVEL PASSPORT</span>
            <span className="pp-cover-brand">Trip guide</span>
          </span>
        </span>
      </button>
      <span className="pp-closed-note">{t('pp.cover_note', { count: pages })}</span>
    </div>
  );
}
function playPageTurnIfOn() {
  try {
    if (localStorage.getItem(SOUND_KEY) === 'off') return;
  } catch {
    /* private mode */
  }
  playPageTurn(560);
}

/** The passport-shaped round button tourists use to add a memory, in the same place as the guide and admin + buttons. */
export function PassportFabIcon() {
  return (
    <span className="pp-fab-book" aria-hidden="true">
      <Emblem />
      <span className="pp-fab-plus">
        <Icon name="plus" size={12} stroke={3} />
      </span>
    </span>
  );
}
