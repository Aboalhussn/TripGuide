// The tourist's travel passport, ported from the passport kit: the open notebook with the holder's
// page fixed and one photo per page framed as a postage stamp with a postmark; pages turn in 3D
// (buttons, arrow keys, or dragging a page), with a synthesised paper sound and a closed cover.
// Looks and turns exactly as in the kit; fonts are the app's (Great Vibes, Aref Ruqaa, Reem Kufi, Thmanyah Sans).
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useApp } from './lib/app';
import { useFmt } from './lib/format';
import { photoSrc } from './assets';
import { Modal } from './ui';

export type PassportPage = { id: number; img: string; place: string; city: string; date: string; note: string };
export type PassportData = { number: string; pages: PassportPage[]; cities: number };
type Holder = { id: number; name: string; country: string; avatar?: string | null };

const TURN_MS = 820; // keep in step with the turn animations in styles.css
const SOUND_KEY = 'passport_page_sound';
const readSound = () => {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
};
const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const isRtlDoc = () => typeof document !== 'undefined' && document.documentElement.dir === 'rtl';

// ---------------------------------------------------------------- helpers
function formatDate(d: string, opts: Intl.DateTimeFormatOptions, rtl: boolean) {
  if (!d) return '';
  const date = d.length === 10 ? new Date(`${d}T00:00:00`) : new Date(d);
  return date.toLocaleDateString(rtl ? 'ar-IQ-u-nu-latn' : 'en-GB', opts);
}
const initials = (name = '?') =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || '?';
// Each governorate stamps in its own ink colour.
const INKS: Record<string, string> = { baghdad: '#7A2E1F', najaf: '#0F5E54', karbala: '#2F6B4F', babylon: '#1D3A8C', samarra: '#5E3D0B', erbil: '#7A2E1F', basra: '#0F5E54', mosul: '#2F6B4F' };
const FALLBACK_INKS = ['#1D3A8C', '#7A2E1F', '#0F5E54', '#2F6B4F', '#5E3D0B'];
const cityInk = (slug: string) => INKS[slug] || FALLBACK_INKS[[...slug].reduce((a, c) => a + c.charCodeAt(0), 0) % FALLBACK_INKS.length];

// ---------------------------------------------------------------- sound
// Page-turn sound, synthesised with the Web Audio API (no audio files). Four layers of shaped noise:
// lift (a rising rustle), crackle (sparse fibre clicks), swish (air through the swing), flap (the landing).
let audio: AudioContext | null = null;
const noiseCache = new WeakMap<BaseAudioContext, Record<string, AudioBuffer>>();
function noise(c: BaseAudioContext, kind: 'white' | 'sparse' | 'brown') {
  let set = noiseCache.get(c);
  if (!set) noiseCache.set(c, (set = {}));
  if (!set[kind]) {
    const len = Math.floor(c.sampleRate * 1.5);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      if (kind === 'sparse') d[i] = Math.random() < 0.004 ? white : white * 0.04;
      else {
        last = (last + 0.02 * white) / 1.02;
        d[i] = kind === 'brown' ? last * 3.5 : white;
      }
    }
    set[kind] = buf;
  }
  return set[kind];
}
type Layer = { kind: 'white' | 'sparse' | 'brown'; start: number; dur: number; type: BiquadFilterType; freq: number; freqTo?: number; q?: number; gain: number; attack: number; release: number };
function layer(c: BaseAudioContext, out: AudioNode, { kind, start, dur, type, freq, freqTo, q = 0.7, gain, attack, release }: Layer) {
  const src = c.createBufferSource();
  src.buffer = noise(c, kind);
  const filter = c.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(freq, start);
  if (freqTo) filter.frequency.exponentialRampToValueAtTime(freqTo, start + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + attack);
  g.gain.setValueAtTime(gain, start + Math.max(attack, dur - release));
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(filter).connect(g).connect(out);
  src.start(start, Math.random() * 0.4);
  src.stop(start + dur + 0.05);
}
function scheduleTurn(c: BaseAudioContext, t0: number, d = 0.82) {
  const out = c.createGain();
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 3;
  out.connect(comp).connect(c.destination);
  layer(c, out, { kind: 'white', start: t0, dur: d * 0.55, type: 'bandpass', freq: 1300, freqTo: 3000, q: 0.8, gain: 0.2, attack: 0.06, release: d * 0.25 });
  layer(c, out, { kind: 'sparse', start: t0 + 0.03, dur: d * 0.6, type: 'highpass', freq: 2800, gain: 0.32, attack: 0.05, release: d * 0.3 });
  layer(c, out, { kind: 'white', start: t0 + d * 0.15, dur: d * 0.7, type: 'bandpass', freq: 1000, freqTo: 520, q: 0.55, gain: 0.26, attack: d * 0.3, release: d * 0.28 });
  layer(c, out, { kind: 'brown', start: t0 + d * 0.1, dur: d * 0.72, type: 'lowpass', freq: 900, q: 0.5, gain: 0.12, attack: d * 0.25, release: d * 0.3 });
  layer(c, out, { kind: 'brown', start: t0 + d * 0.8, dur: 0.16, type: 'lowpass', freq: 420, q: 0.8, gain: 0.5, attack: 0.008, release: 0.12 });
  layer(c, out, { kind: 'white', start: t0 + d * 0.8, dur: 0.07, type: 'bandpass', freq: 2600, q: 1.2, gain: 0.07, attack: 0.004, release: 0.05 });
}
/** Plays a page turn now (duration in seconds). Silent where audio isn't available or is blocked. */
export function playPageTurn(duration = 0.82) {
  try {
    const AC: typeof AudioContext | undefined = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    audio ||= new AC();
    if (audio.state === 'suspended') audio.resume();
    scheduleTurn(audio, audio.currentTime + 0.01, duration);
  } catch {
    /* audio is a nicety */
  }
}

// ---------------------------------------------------------------- icons, seal, gate
const ICONS: Record<string, (string | { r: number[] } | { c: number[] })[]> = {
  back: ['M15 5l-7 7 7 7'],
  forward: ['M9 5l7 7-7 7'],
  volume: ['M4 9h4l5-4v14l-5-4H4z', 'M16.5 8.5a5 5 0 0 1 0 7', 'M19 6a8.5 8.5 0 0 1 0 12'],
  mute: ['M4 9h4l5-4v14l-5-4H4z', 'M17 9l5 6', 'M22 9l-5 6'],
  image: [{ r: [3, 5, 18, 14, 2] }, { c: [8.5, 10, 1.5] }, 'M21 16l-5-5-8 8'],
  camera: ['M4 8h3l2-3h6l2 3h3v11H4z', { c: [12, 13, 3.5] }],
  plus: ['M12 5v14M5 12h14'],
};
function PIcon({ name, size = 20, stroke = 1.9, className }: { name: string; size?: number; stroke?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} focusable="false" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      {(ICONS[name] || []).map((p, i) =>
        typeof p === 'string' ? <path key={i} d={p} /> : 'c' in p ? <circle key={i} cx={p.c[0]} cy={p.c[1]} r={p.c[2]} /> : <rect key={i} x={p.r[0]} y={p.r[1]} width={p.r[2]} height={p.r[3]} rx={p.r[4]} />,
      )}
    </svg>
  );
}

// Splits a place name into at most two short lines for the inside of a postmark.
function sealLines(name = ''): [string, string?] {
  const clean = name.replace(/\(.*?\)/g, '').trim();
  const words = clean.split(/\s+/);
  if (clean.length <= 12 || words.length === 1) return [clean.slice(0, 16)];
  let first = '';
  let i = 0;
  while (i < words.length && (first + ' ' + words[i]).trim().length <= 13) {
    first = (first + ' ' + words[i]).trim();
    i += 1;
  }
  if (!first) {
    first = words[0];
    i = 1;
  }
  const rest = words.slice(i).join(' ');
  return [first, rest.length > 15 ? `${rest.slice(0, 14)}…` : rest];
}

/** A round postmark: two ink rings, the place name and the date. */
function Seal({ name, date, ink = '#1D3A8C', rotate = -6, size = 92, rtl }: { name: string; date: string; ink?: string; rotate?: number; size?: number; rtl?: boolean }) {
  const [l1, l2] = sealLines(name);
  const upper = !rtl;
  const longest = Math.max(l1.length, (l2 || '').length);
  const fs = Math.min(l2 ? 10.5 : 11.5, 62 / (longest * (upper ? 0.68 : 0.55)));
  const dfs = date ? Math.min(8, 50 / (String(date).length * (rtl ? 0.5 : 0.7))) : 8;
  return (
    <svg width={size} height={size} viewBox="0 0 92 92" aria-hidden="true" style={{ transform: `rotate(${rotate}deg)`, display: 'block' }}>
      <circle cx="46" cy="46" r="42" fill="none" stroke={ink} strokeWidth="3.5" opacity="0.88" />
      <circle cx="46" cy="46" r="35" fill="none" stroke={ink} strokeWidth="1" opacity="0.88" />
      <g fill={ink} opacity="0.92" fontFamily="Reem Kufi, Thmanyah Sans, sans-serif" fontWeight="600" textAnchor="middle">
        {l2 ? (
          <>
            <text x="46" y="41" fontSize={fs}>
              {upper ? l1.toUpperCase() : l1}
            </text>
            <text x="46" y="54" fontSize={fs}>
              {upper ? l2.toUpperCase() : l2}
            </text>
          </>
        ) : (
          <text x="46" y="50" fontSize={fs}>
            {upper ? l1.toUpperCase() : l1}
          </text>
        )}
        {date && (
          <text x="46" y="69" fontSize={dfs} fontFamily="Thmanyah Sans, sans-serif" letterSpacing={rtl ? 0 : 0.4}>
            {date}
          </text>
        )}
      </g>
    </svg>
  );
}

/** The Ishtar Gate emblem used on the cover. */
function GateArt({ width = 200, tower = '#14306F', arch = '#0F1E4A', line = '#F2C66B', reliefs = false }: { width?: number; tower?: string; arch?: string; line?: string; reliefs?: boolean }) {
  const height = Math.round((width * 230) / 250);
  return (
    <svg width={width} height={height} viewBox="0 0 250 230" aria-hidden="true" focusable="false" style={{ display: 'block' }}>
      <path d="M20 230V40h18V22h16v18h16V22h16v18h18v190z" fill={tower} />
      <path d="M144 230V40h18V22h16v18h16V22h16v18h18v190z" fill={tower} />
      <path d="M86 230V120a39 39 0 0 1 78 0v110z" fill={arch} />
      <path d="M86 230V120a39 39 0 0 1 78 0v110" fill="none" stroke={line} strokeWidth="3.5" />
      {reliefs && (
        <g fill="none" stroke={line} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M38 86h28M38 150h28M184 86h28M184 150h28" />
          <path d="M42 112c4-6 12-6 16 0l4 6M188 112c4-6 12-6 16 0l4 6" />
          <path d="M42 176c4-6 12-6 16 0l4 6M188 176c4-6 12-6 16 0l4 6" />
        </g>
      )}
    </svg>
  );
}

// ---------------------------------------------------------------- the book
type Page = { kind: 'photo'; page: PassportPage; n: number } | { kind: 'next'; n: number };
type Turn = { from: number; to: number; dir: 'next' | 'prev'; manual?: boolean };

export function PassportBook({ holder, data, trips, editable = false, onAdd, onDelete }: { holder: Holder; data: PassportData; trips: number; editable?: boolean; onAdd?(): void; onDelete?(id: number): void }) {
  const { t } = useApp();
  const fmt = useFmt();
  const isRtl = isRtlDoc();
  // Oldest first, like a real passport filling up; then one blank page for the next photo.
  const pages = useMemo<Page[]>(() => {
    const list: Page[] = [...data.pages].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id)).map((p, i) => ({ kind: 'photo', page: p, n: i + 1 }));
    list.push({ kind: 'next', n: list.length + 1 });
    return list;
  }, [data.pages]);
  const count = data.pages.length;

  // Always open on the first page.
  const [index, setIndex] = useState(0);
  const [turn, setTurn] = useState<Turn | null>(null);
  const [sound, setSound] = useState(readSound);
  const [open, setOpen] = useState<PassportPage | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const toggleSound = () =>
    setSound((on) => {
      try {
        localStorage.setItem(SOUND_KEY, on ? 'off' : 'on');
      } catch {
        /* private mode */
      }
      return !on;
    });

  useEffect(() => {
    setIndex((i) => Math.min(i, pages.length - 1));
  }, [pages.length]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const turnRef = useRef<Turn | null>(null);
  const finish = useCallback(() => {
    clearTimeout(timer.current);
    const tr = turnRef.current;
    if (!tr) return;
    turnRef.current = null;
    setIndex(tr.to);
    setTurn(null);
  }, []);

  const go = useCallback(
    (to: number) => {
      if (turnRef.current || to < 0 || to >= pages.length || to === index) return;
      if (reducedMotion()) {
        setIndex(to);
        return;
      }
      const tr: Turn = { from: index, to, dir: to > index ? 'next' : 'prev' };
      turnRef.current = tr;
      setTurn(tr);
      if (sound) playPageTurn(TURN_MS / 1000);
      timer.current = setTimeout(finish, TURN_MS + 150); // in case animationend never fires
    },
    [pages.length, index, finish, sound],
  );
  const next = () => go(index + 1);
  const prev = () => go(index - 1);

  // ---- Drag to turn: the point you grabbed stays under your finger (its distance from the spine's
  // middle is cos(angle) × the grab distance). On release it finishes or springs back from there.
  const bookRef = useRef<HTMLDivElement>(null);
  const spineRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const drag = useRef<null | { phase: 'pending' | 'active'; dir: 'next' | 'prev'; id: number; x0: number; y0: number; lastX: number; lastT: number; v: number; angle: number; pivot?: number; grab?: number }>(null);
  const dragged = useRef(false);
  const raf = useRef(0);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const applyAngle = (deg: number) => {
    if (drag.current) drag.current.angle = deg;
    if (sheetRef.current) sheetRef.current.style.transform = `rotateY(${isRtl ? deg : -deg}deg)`;
    bookRef.current?.style.setProperty('--p', String(deg / 180));
  };
  const lastAngle = useRef(0);
  // The sheet mounts on the render after a drag starts: put it at the drag's angle straight away.
  useLayoutEffect(() => {
    if (turn?.manual) applyAngle(drag.current ? drag.current.angle : lastAngle.current);
  });

  const onPointerDown = (e: React.PointerEvent) => {
    dragged.current = false;
    if (turnRef.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const target = e.target as HTMLElement;
    const onLeaf = target.closest('.leaf-stack');
    const onHolder = !onLeaf && target.closest('.book > .identity');
    const dir = onLeaf ? 'next' : onHolder ? 'prev' : null;
    if (!dir || (dir === 'next' && index >= pages.length - 1) || (dir === 'prev' && index === 0)) return;
    drag.current = { phase: 'pending', dir, id: e.pointerId, x0: e.clientX, y0: e.clientY, lastX: e.clientX, lastT: e.timeStamp, v: 0, angle: dir === 'next' ? 0 : 180 };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    if (d.phase === 'pending') {
      const dx = e.clientX - d.x0;
      const dy = e.clientY - d.y0;
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
        drag.current = null; // scrolling, not turning
        return;
      }
      if (Math.abs(dx) < 8) return;
      const towardSpine = isRtl ? dx > 0 : dx < 0;
      if ((d.dir === 'next') !== towardSpine) {
        drag.current = null;
        return;
      }
      const spine = spineRef.current!.getBoundingClientRect();
      d.pivot = spine.left + spine.width / 2;
      d.grab = Math.max(30, Math.abs(d.x0 - d.pivot));
      d.phase = 'active';
      dragged.current = true;
      try {
        bookRef.current!.setPointerCapture(e.pointerId);
      } catch {
        /* not supported */
      }
      const tr: Turn = { from: index, to: d.dir === 'next' ? index + 1 : index - 1, dir: d.dir, manual: true };
      turnRef.current = tr;
      setTurn(tr);
    }
    const along = isRtl ? d.pivot! - e.clientX : e.clientX - d.pivot!;
    const cos = Math.max(-1, Math.min(1, along / d.grab!));
    applyAngle((Math.acos(cos) * 180) / Math.PI);
    const dt = Math.max(1, e.timeStamp - d.lastT);
    d.v = 0.7 * d.v + 0.3 * ((e.clientX - d.lastX) / dt); // px per ms, smoothed
    d.lastX = e.clientX;
    d.lastT = e.timeStamp;
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    if (d.phase !== 'active') return;
    // A quick flick toward the other side turns the page even before halfway, but only if the
    // finger is still moving when it lets go (a pause before release means "put it back").
    const v = e.timeStamp - d.lastT > 90 ? 0 : d.v;
    const speed = isRtl ? -v : v; // positive = moving toward the photo page
    const complete = d.dir === 'next' ? d.angle > 90 || speed < -0.3 : d.angle < 90 || speed > 0.3;
    const target = (d.dir === 'next') === complete ? 180 : 0;
    const from = d.angle;
    const ms = 140 + (380 * Math.abs(target - from)) / 180;
    if (complete && sound) playPageTurn(Math.max(0.25, ms / 1000));
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      const ease = 1 - Math.pow(1 - k, 3);
      const a = from + (target - from) * ease;
      lastAngle.current = a;
      applyAngle(a);
      if (k < 1) {
        raf.current = requestAnimationFrame(step);
        return;
      }
      const tr = turnRef.current;
      turnRef.current = null;
      if (complete && tr) setIndex(tr.to);
      setTurn(null);
      bookRef.current?.style.removeProperty('--p');
    };
    lastAngle.current = from;
    raf.current = requestAnimationFrame(step);
  };

  // A drag ends with a click on whatever was under the finger; don't let it open a photo.
  const onClickCapture = (e: React.MouseEvent) => {
    if (dragged.current) {
      e.preventDefault();
      e.stopPropagation();
      dragged.current = false;
    }
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const fwd = isRtl ? 'ArrowLeft' : 'ArrowRight';
    const back = isRtl ? 'ArrowRight' : 'ArrowLeft';
    if (e.key === fwd || e.key === 'PageDown') {
      e.preventDefault();
      next();
    }
    if (e.key === back || e.key === 'PageUp') {
      e.preventDefault();
      prev();
    }
  };

  const shownIndex = turn ? (turn.dir === 'next' ? turn.to : turn.from) : index;
  const turningIndex = turn ? (turn.dir === 'next' ? turn.from : turn.to) : null;
  const current = pages[turn ? turn.to : index];

  const render = (i: number | null) => {
    const p = i === null ? null : pages[i];
    if (!p) return null;
    return p.kind === 'photo' ? (
      <PhotoPage key={`p${p.page.id}`} page={p.page} n={p.n} count={count} onOpen={() => setOpen(p.page)} />
    ) : (
      <NextPage key="next" first={count === 0} editable={editable} onAdd={onAdd} />
    );
  };
  const holderPage = <IdentityPage holder={holder} count={count} cities={data.cities} trips={trips} number={data.number} />;

  return (
    <div className="tg-passport" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="book-wrap">
        <div
          ref={bookRef}
          className={`book ${turn ? `is-turning turning-${turn.dir}` : ''} ${turn?.manual ? 'manual' : ''} ${index > 0 ? 'can-prev' : ''} ${index < pages.length - 1 ? 'can-next' : ''}`}
          role="region"
          aria-roledescription={t('pp.book')}
          aria-label={t('pp.book_label', { name: holder.name })}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onClickCapture={onClickCapture}
        >
          {holderPage}
          <div ref={spineRef} className="book-spine" aria-hidden="true">
            {Array.from({ length: 9 }, (_, i) => (
              <span key={i} className="ring" />
            ))}
          </div>
          <div className="leaf-stack">
            <div className="leaf base">{render(shownIndex)}</div>
            {turn && (
              <div
                ref={sheetRef}
                className={`leaf turning turn-${turn.dir} ${turn.manual ? 'manual' : ''}`}
                onAnimationEnd={(e) => {
                  if (!turn.manual && e.target === e.currentTarget) finish();
                }}
                aria-hidden="true"
              >
                <div className="face pp-front">{render(turningIndex)}</div>
                <div className="face pp-back">{holderPage}</div>
              </div>
            )}
          </div>
        </div>

        <div className="book-controls">
          <button type="button" className="pp-icon-btn" onClick={prev} disabled={index === 0 || !!turn} aria-label={t('pp.prev')}>
            <PIcon name="back" className="pp-flip-rtl" />
          </button>
          <span className="pp-small pp-count" aria-live="polite">
            {current?.kind === 'photo' ? t('pp.page_n', { n: current.n, total: count }) : count === 0 ? t('pp.first_page') : t('pp.page_blank')}
          </span>
          <button type="button" className="pp-icon-btn" onClick={next} disabled={index >= pages.length - 1 || !!turn} aria-label={t('pp.next')}>
            <PIcon name="forward" className="pp-flip-rtl" />
          </button>
          <button type="button" className="pp-icon-btn" onClick={toggleSound} aria-pressed={sound} aria-label={sound ? t('pp.sound_off') : t('pp.sound_on')}>
            <PIcon name={sound ? 'volume' : 'mute'} size={18} />
          </button>
        </div>
        {pages.length > 1 && <p className="pp-small pp-muted book-hint">{t('pp.hint')}</p>}
      </div>

      {open && (
        <Modal title={open.place} onClose={() => setOpen(null)}>
          <div className="stack pp-detail">
            <img src={photoSrc(open.img)} alt={open.place} />
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
                {t('pp.remove')}
              </button>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

/** The holder's page: details, photo and signature. It never turns. */
function IdentityPage({ holder, count, cities, trips, number }: { holder: Holder; count: number; cities: number; trips: number; number: string }) {
  const { t } = useApp();
  return (
    <section className="leaf-page identity" aria-label={t('pp.holder')}>
      <div className="id-head">
        <span className="id-eyebrow">{t('pp.eyebrow')}</span>
        <span className="id-title" lang="ar">
          جواز الرحلات
        </span>
      </div>
      <div className="id-body">
        <dl className="id-fields">
          <div>
            <dt>{t('pp.name')}</dt>
            <dd>
              <bdi>{holder.name}</bdi>
            </dd>
          </div>
          <div>
            <dt>{t('pp.nationality')}</dt>
            <dd>
              <bdi>{holder.country || '–'}</bdi>
            </dd>
          </div>
          <div>
            <dt>{t('pp.number')}</dt>
            <dd className="pp-num" dir="ltr">
              {number}
            </dd>
          </div>
          <div className="id-stats">
            <span>
              <b className="pp-num">{count}</b>
              {t('pp.stat_memories')}
            </span>
            <span>
              <b className="pp-num">{cities}</b>
              {t('pp.stat_cities')}
            </span>
            <span>
              <b className="pp-num">{trips}</b>
              {t('pp.stat_trips')}
            </span>
          </div>
        </dl>
        <div className="id-photo">{holder.avatar ? <img src={holder.avatar} alt="" draggable={false} /> : <span aria-hidden="true">{initials(holder.name)}</span>}</div>
      </div>
      <div className="id-signature" aria-hidden="true">
        <span className="id-sign">{holder.name}</span>
        <span className="id-sign-label">{t('pp.signature')}</span>
      </div>
    </section>
  );
}

// Calligraphy needs room: shrink long names so they stay inside the photo.
const nameSize = (n: string) => (n.length > 22 ? 'xl' : n.length > 13 ? 'l' : '');

/** One page: the traveller's own photo, framed as a postage stamp with a postmark. */
function PhotoPage({ page, n, count, onOpen }: { page: PassportPage; n: number; count: number; onOpen(): void }) {
  const { t } = useApp();
  const fmt = useFmt();
  const isRtl = isRtlDoc();
  const name = page.place;
  const stampName = name.replace(/\s*\(.*?\)/g, ''); // "Ishtar Gate (Reconstruction)" → "Ishtar Gate"
  const city = fmt.city(page.city);
  const ink = cityInk(page.city);
  const [failed, setFailed] = useState(false);
  const photo = page.img && !failed ? photoSrc(page.img) : null;
  const date = formatDate(page.date, { day: '2-digit', month: 'short', year: 'numeric' }, isRtl);
  const arabicName = /[؀-ۿ]/.test(stampName);
  return (
    <article className="leaf-page stamp-page">
      <div className="leaf-head">
        <span className="pp-num">{t('pp.page_n', { n, total: count })}</span>
        <span>{city}</span>
      </div>

      <button type="button" className="postage-wrap" onClick={onOpen} aria-label={t('pp.open_memory', { place: name })}>
        <span className="postage">
          <span className="postage-photo" style={{ '--ink': ink } as React.CSSProperties}>
            {photo ? <img src={photo} alt="" draggable={false} onError={() => setFailed(true)} /> : <PIcon name="image" size={40} />}
            <span className={`postage-name ${nameSize(stampName)}`} lang={arabicName ? 'ar' : 'en'}>
              {stampName}
            </span>
          </span>
          <span className="postage-foot">
            <span>IRAQ · العراق</span>
            <span className="pp-num">№ {n}</span>
          </span>
        </span>
        <span className="postmark" aria-hidden="true">
          <svg className="cancel-lines" viewBox="0 0 120 40">
            <path d="M0 8 q10 -6 20 0 t20 0 t20 0 t20 0 t20 0 t20 0 M0 20 q10 -6 20 0 t20 0 t20 0 t20 0 t20 0 t20 0 M0 32 q10 -6 20 0 t20 0 t20 0 t20 0 t20 0 t20 0" fill="none" stroke={ink} strokeWidth="2.4" />
          </svg>
          <Seal name={name} date={isRtl ? date : date.toUpperCase()} ink={ink} rotate={-14} size={92} rtl={arabicName || isRtl} />
        </span>
      </button>

      <div className="stamp-info">
        <b className="stamp-info-name" dir="auto">
          {name}
        </b>
        <span className="pp-muted">
          {city} · {date}
        </span>
        {page.note && (
          <p className="pp-clamp-2" dir="auto">
            {page.note}
          </p>
        )}
      </div>
    </article>
  );
}

/** The blank page after the last photo: a dashed outline waiting to be filled. */
function NextPage({ first, editable, onAdd }: { first: boolean; editable: boolean; onAdd?(): void }) {
  const { t } = useApp();
  return (
    <article className="leaf-page stamp-page next-page">
      <div className="leaf-head">
        <span>{first ? t('pp.first_page') : t('pp.next_page')}</span>
        <span />
      </div>
      <div className="postage-empty">
        <PIcon name="camera" size={40} />
        <span>{editable ? t('pp.blank_owner') : t('pp.blank_visitor')}</span>
      </div>
      {editable && onAdd && (
        <button type="button" className="pp-btn pp-btn-sm" style={{ alignSelf: 'center' }} onClick={onAdd}>
          <PIcon name="plus" size={16} />
          {t('pp.add')}
        </button>
      )}
    </article>
  );
}

// ---------------------------------------------------------------- closed cover
/** The passport, closed: a lapis cover with gold blocking. Tapping it opens the book. */
export function ClosedPassport({ name, pages, onOpen }: { name: string; pages: number; onOpen(): void }) {
  const { t } = useApp();
  const isRtl = isRtlDoc();
  return (
    <div className="tg-passport" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="closed-wrap">
        <button type="button" className="closed-book" aria-label={t('pp.open_cover', { name })} onClick={onOpen}>
          <span className="pp-cover-pages" aria-hidden="true" />
          <span className="pp-cover">
            <span className="pp-cover-frame" aria-hidden="true" />
            {/* Brand only: no state names or official passport marks. */}
            <span className="pp-cover-emblem" aria-hidden="true">
              <GateArt width={96} tower="rgba(232, 196, 106, 0.2)" arch="rgba(14, 29, 76, 0.6)" line="#E8C46A" reliefs />
            </span>
            <span className="pp-cover-title" lang="ar">
              جواز الرحلات
            </span>
            <span className="pp-cover-sub">TRAVEL PASSPORT</span>
            <span className="pp-cover-brand">TRIP GUIDE</span>
          </span>
          <span className="closed-rings" aria-hidden="true">
            {Array.from({ length: 9 }, (_, i) => (
              <span key={i} className="ring" />
            ))}
          </span>
        </button>
        <span className="closed-note">{t('pp.cover_note', { count: pages })}</span>
      </div>
    </div>
  );
}

/** The passport-shaped + button tourists use on the home screen. */
export function PassportFabIcon() {
  return (
    <span className="pp-fab-book" aria-hidden="true">
      <GateArt width={30} tower="rgba(232, 196, 106, 0.25)" arch="rgba(14, 29, 76, 0.6)" line="#E8C46A" />
      <span className="pp-fab-plus">
        <PIcon name="plus" size={12} stroke={3} />
      </span>
    </span>
  );
}
