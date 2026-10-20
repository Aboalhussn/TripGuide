// Launch screen: the bird appears, a short loading bar fills (3 s), then the bird flies off
// and the app opens. Shown once per launch.
import React from 'react';
import { asset } from './assets';

const KEY = 'tg.splash.shown';
const LOAD_MS = 3000;
const FLY_MS = 800;

export function shouldShowSplash() {
  try {
    return !sessionStorage.getItem(KEY);
  } catch {
    return true;
  }
}

export function Splash({ onDone }: { onDone(): void }) {
  const [phase, setPhase] = React.useState<'load' | 'fly' | 'out'>('load');
  React.useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const load = reduce ? 900 : LOAD_MS;
    const t1 = window.setTimeout(() => setPhase('fly'), load);
    const t2 = window.setTimeout(() => setPhase('out'), load + (reduce ? 200 : FLY_MS));
    const t3 = window.setTimeout(() => {
      try {
        sessionStorage.setItem(KEY, '1');
      } catch {
        /* private mode */
      }
      onDone();
    }, load + (reduce ? 400 : FLY_MS + 350));
    return () => [t1, t2, t3].forEach(clearTimeout);
  }, []);
  return (
    <div className={'splash ' + phase} role="status" aria-label="Trip guide">
      <div className="splash-center">
        <img className="splash-bird" src={asset('tg-mark.svg')} alt="" />
        <div className="splash-word" dir="ltr">
          <span>Trip</span> <span className="g">guide</span>
        </div>
        <div className="splash-bar" aria-hidden="true">
          <i />
        </div>
      </div>
    </div>
  );
}
