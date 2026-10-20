// Entry for the single-file demo: the whole marketplace runs in the browser and saves to this browser only.
import { createApi } from '../core/api';
import { seed } from '../core/seed';
import type { Data, Platform } from '../core/types';
import { sha256 } from './lib/sha256';

const KEY = 'tg.demo.data.v1';

const browserPlatform: Platform = {
  now: () => new Date(),
  hashPassword(password) {
    const salt = Math.random().toString(36).slice(2, 10);
    return `sha256:${salt}:${sha256(salt + password)}`;
  },
  verifyPassword(password, stored) {
    const [kind, salt, hash] = stored.split(':');
    return kind === 'sha256' && sha256(salt + password) === hash;
  },
  randomToken: () => Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => b.toString(16).padStart(2, '0')).join(''),
};

function load(): Data {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* storage blocked: start fresh in memory */
  }
  return seed(browserPlatform);
}

const data = load();
const save = (d: Data) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* ignore: the demo keeps working in memory */
  }
};
save(data);
window.__TG_LOCAL_API = createApi(data, browserPlatform, save);
window.__TG_DEMO = {
  reset() {
    try {
      localStorage.removeItem(KEY);
      localStorage.removeItem('tg.token');
    } catch {
      /* ignore */
    }
    window.location.hash = '/';
    window.location.reload();
  },
};

import('./main');
