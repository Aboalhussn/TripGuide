// Light / dark theme. 'system' follows the device; the choice is remembered in this browser.
import { useEffect, useState } from 'react';

export type ThemePref = 'light' | 'dark' | 'system';
const KEY = 'tg.theme';
// A host page (for example an embedding viewer) may already set data-theme; 'system' falls back to it.
const hostTheme = typeof document !== 'undefined' ? document.documentElement.getAttribute('data-theme') : null;
const listeners = new Set<() => void>();

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {}
  return 'system';
}

let current: ThemePref = readPref();

function apply(pref: ThemePref) {
  const el = document.documentElement;
  if (pref === 'light' || pref === 'dark') el.setAttribute('data-theme', pref);
  else if (hostTheme) el.setAttribute('data-theme', hostTheme);
  else el.removeAttribute('data-theme');
}

export function initTheme() {
  apply(current);
  const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
  mq?.addEventListener?.('change', () => listeners.forEach((f) => f()));
}

export function isDarkNow(): boolean {
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'dark' || attr === 'light') return attr === 'dark';
  return !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}

export function setThemePref(pref: ThemePref) {
  current = pref;
  try {
    localStorage.setItem(KEY, pref);
  } catch {}
  apply(pref);
  listeners.forEach((f) => f());
}

export function useTheme() {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((n) => n + 1);
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  }, []);
  const dark = isDarkNow();
  return { pref: current, dark, setPref: setThemePref, toggle: () => setThemePref(dark ? 'light' : 'dark') };
}
