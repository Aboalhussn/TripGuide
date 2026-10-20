import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiFailure, getToken, setToken } from './api';
import { strings, type Lang } from '../strings';

export type Me = any;
export type Meta = any;

type Toast = { id: number; text: string; kind: 'ok' | 'error' };

type AppState = {
  me: Me | null;
  meta: Meta | null;
  ready: boolean;
  lang: Lang;
  setLang(l: Lang): void;
  refreshMe(): Promise<void>;
  signIn(token: string, me: Me): void;
  signOut(): Promise<void>;
  toast(text: string, kind?: 'ok' | 'error'): void;
  ask(text: string, okLabel?: string): Promise<boolean>;
  t(key: string, params?: Record<string, any>): string;
  errorText(e: unknown): string;
};

const Ctx = createContext<AppState>(null as any);
export const useApp = () => useContext(Ctx);

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem('tg.lang');
    if (saved === 'ar' || saved === 'en') return saved;
  } catch {
    /* ignore */
  }
  return (navigator.language || '').startsWith('ar') ? 'ar' : 'en';
}

export function translate(lang: Lang, key: string, params: Record<string, any> = {}): string {
  let entry: any = strings[lang][key] ?? strings.en[key];
  if (entry === undefined) return key;
  if (typeof entry === 'object') {
    const n = Number(params.count ?? 0);
    if (n === 0 && entry.zero) entry = entry.zero;
    else {
      const rule = new Intl.PluralRules(lang === 'ar' ? 'ar' : 'en').select(n);
      entry = entry[rule] ?? entry.other;
    }
  }
  return String(entry).replace(/\{(\w+)\}/g, (_, k) => {
    const v = params[k];
    if (v === undefined || v === null) return '';
    if (typeof v === 'number') return new Intl.NumberFormat(lang === 'ar' ? 'ar-IQ' : 'en-US').format(v);
    return String(v);
  });
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [ready, setReady] = useState(false);
  const [lang, setLangState] = useState<Lang>(initialLang);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);
  const [question, setQuestion] = useState<{ text: string; ok: string; resolve(v: boolean): void } | null>(null);
  // In-page confirmation: the browser's confirm() is blocked in embedded viewers.
  const ask = useCallback((text: string, ok?: string) => new Promise<boolean>((resolve) => setQuestion({ text, ok: ok || '', resolve })), []);
  const answer = (v: boolean) => {
    question?.resolve(v);
    setQuestion(null);
  };

  const t = useCallback((key: string, params?: Record<string, any>) => translate(lang, key, params), [lang]);

  const toast = useCallback((text: string, kind: 'ok' | 'error' = 'ok') => {
    const id = ++toastId.current;
    setToasts((xs) => [...xs, { id, text, kind }]);
    setTimeout(() => setToasts((xs) => xs.filter((x) => x.id !== id)), 4200);
  }, []);

  const errorText = useCallback(
    (e: unknown) => {
      if (e instanceof ApiFailure) {
        const p = { ...(e.params || {}) };
        if (p.field) p.field = t('field.' + String(p.field).replace(/\.\d+\./, '.'));
        const key = 'err.' + e.code;
        const msg = t(key, p);
        return msg === key ? t('err.generic') : msg;
      }
      return t('err.generic');
    },
    [t],
  );

  const refreshMe = useCallback(async () => {
    if (!getToken()) {
      setMe(null);
      return;
    }
    try {
      setMe(await api('GET', '/me'));
    } catch (e) {
      if (e instanceof ApiFailure && e.status === 401) {
        setToken(null);
        setMe(null);
      }
    }
  }, []);

  useEffect(() => {
    Promise.all([api('GET', '/meta').then(setMeta), refreshMe()]).finally(() => setReady(true));
  }, [refreshMe]);

  // Keep unread counts fresh.
  useEffect(() => {
    if (!me) return;
    const id = setInterval(refreshMe, 15000);
    return () => clearInterval(id);
  }, [me?.id, refreshMe]);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    try {
      localStorage.setItem('tg.lang', lang);
    } catch {
      /* ignore */
    }
  }, [lang]);

  const value = useMemo<AppState>(
    () => ({
      me,
      meta,
      ready,
      lang,
      setLang: setLangState,
      refreshMe,
      signIn(token, user) {
        setToken(token);
        setMe(user);
      },
      async signOut() {
        try {
          await api('POST', '/auth/logout');
        } catch {
          /* ignore */
        }
        setToken(null);
        setMe(null);
      },
      toast,
      ask,
      t,
      errorText,
    }),
    [me, meta, ready, lang, refreshMe, toast, ask, t, errorText],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {question && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && answer(false)} onKeyDown={(e) => e.key === 'Escape' && answer(false)}>
          <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="ask-text">
            <p id="ask-text" style={{ fontSize: 17, lineHeight: 1.5 }}>
              {question.text}
            </p>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <button type="button" className="btn ghost" style={{ flex: 1 }} onClick={() => answer(false)}>
                {t('common.cancel')}
              </button>
              <button type="button" className="btn" style={{ flex: 1.4 }} autoFocus onClick={() => answer(true)}>
                {question.ok || t('common.yes')}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((x) => (
          <div key={x.id} className={'toast' + (x.kind === 'error' ? ' error' : '')}>
            {x.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

// Loads data for a page and exposes reload; keeps the last value while reloading.
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const run = useCallback(async () => {
    const n = ++seq.current;
    setLoading(true);
    try {
      const d = await fn();
      if (n === seq.current) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (n === seq.current) setError(e);
    } finally {
      if (n === seq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    run();
  }, [run]);
  return { data, error, loading, reload: run, setData };
}
