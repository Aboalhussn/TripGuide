// Pull down at the top of the home screen: the logo bird spins in place, and letting go refreshes the page.
import React from 'react';
import { asset } from './assets';
import { useApp } from './lib/app';

const TRIGGER = 72; // how far to pull (px) before letting go refreshes
const MAX = 120;

export function PullToRefresh({ children }: { children: React.ReactNode }) {
  const { t, refreshMe } = useApp();
  const [pull, setPull] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [gen, setGen] = React.useState(0); // bumping it reloads the page's data
  const start = React.useRef<number | null>(null);
  const pullRef = React.useRef(0);
  const busyRef = React.useRef(false);

  React.useEffect(() => {
    const atTop = () => (window.scrollY || document.documentElement.scrollTop) <= 0;
    const onStart = (e: TouchEvent) => {
      start.current = !busyRef.current && atTop() && e.touches.length === 1 ? e.touches[0].clientY : null;
    };
    const onMove = (e: TouchEvent) => {
      if (start.current === null) return;
      const dy = e.touches[0].clientY - start.current;
      if (dy <= 0 || !atTop()) {
        if (pullRef.current) setPull((pullRef.current = 0));
        return;
      }
      if (e.cancelable) e.preventDefault(); // keep the page still while pulling
      const d = Math.min(MAX, dy * 0.5);
      pullRef.current = d;
      setPull(d);
    };
    const onEnd = async () => {
      if (start.current === null) return;
      start.current = null;
      const d = pullRef.current;
      pullRef.current = 0;
      if (d < TRIGGER) return setPull(0);
      busyRef.current = true;
      setBusy(true);
      setPull(TRIGGER);
      try {
        await Promise.all([refreshMe(), new Promise((r) => setTimeout(r, 700))]);
        setGen((g) => g + 1);
      } finally {
        busyRef.current = false;
        setBusy(false);
        setPull(0);
      }
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [refreshMe]);

  const shown = pull > 0 || busy;
  const ready = pull >= TRIGGER;
  return (
    <>
      <div
        className={'ptr' + (busy ? ' busy' : '') + (ready ? ' ready' : '') + (shown ? ' shown' : '')}
        style={{ transform: `translate(-50%, ${pull - 56}px)`, opacity: Math.min(1, pull / 40) || (busy ? 1 : 0) }}
        role="status"
        aria-live="polite"
        aria-label={busy ? t('ptr.refreshing') : ready ? t('ptr.release') : t('ptr.pull')}
      >
        <img src={asset('tg-mark.svg')} alt="" style={busy ? undefined : { transform: `rotate(${pull * 4}deg)` }} />
      </div>
      <div className="ptr-body" style={pull ? { transform: `translateY(${pull * 0.6}px)` } : undefined} key={gen}>
        {children}
      </div>
    </>
  );
}
