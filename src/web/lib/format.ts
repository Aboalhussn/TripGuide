import { useApp } from './app';
import type { Lang } from '../strings';

const LANG_NAMES: Record<string, [string, string]> = {
  ar: ['Arabic', 'العربية'], en: ['English', 'الإنجليزية'], ku: ['Kurdish', 'الكردية'], fa: ['Persian', 'الفارسية'], tr: ['Turkish', 'التركية'],
  ur: ['Urdu', 'الأردية'], fr: ['French', 'الفرنسية'], de: ['German', 'الألمانية'], es: ['Spanish', 'الإسبانية'], it: ['Italian', 'الإيطالية'],
  ru: ['Russian', 'الروسية'], zh: ['Chinese', 'الصينية'],
};

export function makeFmt(lang: Lang, meta: any) {
  const locale = lang === 'ar' ? 'ar-IQ' : 'en-GB';
  const nf = new Intl.NumberFormat(lang === 'ar' ? 'ar-IQ' : 'en-US', { maximumFractionDigits: 2 });
  const num = (n: number) => nf.format(n);
  const nf2 = new Intl.NumberFormat(lang === 'ar' ? 'ar-IQ' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const usd = (n: number) => {
    const a = Math.abs(n);
    const s = Number.isInteger(Math.round(a * 100) / 100) ? nf.format(a) : nf2.format(a);
    const signed = n < 0 ? '−' : '';
    return lang === 'ar' ? `${signed}${s} $` : `${signed}$${s}`;
  };
  const iqd = (n: number) => {
    const v = Math.round((n * (meta?.iqdPerUsd || 1310)) / 250) * 250;
    return lang === 'ar' ? `${nf.format(v)} د.ع` : `${nf.format(v)} IQD`;
  };
  const toDate = (s: string) => (s.length === 10 ? new Date(s + 'T12:00:00Z') : new Date(s));
  const date = (s: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) => new Intl.DateTimeFormat(locale, { timeZone: 'Asia/Baghdad', ...opts }).format(toDate(s));
  const dateLong = (s: string) => date(s, { weekday: 'short', day: 'numeric', month: 'short' });
  const range = (a: string, b: string) => {
    if (a === b) return date(a);
    const A = toDate(a), B = toDate(b);
    if (A.getUTCMonth() === B.getUTCMonth()) {
      const d1 = new Intl.DateTimeFormat(locale, { day: 'numeric', timeZone: 'UTC' }).format(A);
      return `${d1}–${date(b)}`;
    }
    return `${date(a)} – ${date(b)}`;
  };
  const time = (s: string) => new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Baghdad' }).format(new Date(s));
  const ago = (s: string) => {
    const diff = (Date.now() - Date.parse(s)) / 1000;
    const rtf = new Intl.RelativeTimeFormat(lang === 'ar' ? 'ar-IQ' : 'en', { numeric: 'auto' });
    if (diff < 60) return rtf.format(0, 'minute');
    if (diff < 3600) return rtf.format(-Math.round(diff / 60), 'minute');
    if (diff < 86400) return rtf.format(-Math.round(diff / 3600), 'hour');
    if (diff < 86400 * 30) return rtf.format(-Math.round(diff / 86400), 'day');
    return date(s, { day: 'numeric', month: 'short', year: 'numeric' });
  };
  const until = (s: string) => {
    const hours = Math.max(0, Math.round((Date.parse(s) - Date.now()) / 3600000));
    return hours;
  };
  const city = (slug: string) => {
    const c = meta?.cities?.find((x: any) => x.slug === slug);
    return c ? (lang === 'ar' ? c.nameAr : c.name) : slug;
  };
  const cities = (slugs: string[]) => list(slugs.map(city));
  const place = (id: number) => {
    const p = meta?.places?.find((x: any) => x.id === id);
    return p ? (lang === 'ar' ? p.nameAr : p.name) : '';
  };
  const language = (code: string) => (LANG_NAMES[code] ? LANG_NAMES[code][lang === 'ar' ? 1 : 0] : code);
  const list = (xs: string[]) => {
    try {
      return new (Intl as any).ListFormat(lang, { style: 'long', type: 'conjunction' }).format(xs);
    } catch {
      return xs.join(', ');
    }
  };
  const pct = (x: number | null) => (x === null ? '—' : new Intl.NumberFormat(lang === 'ar' ? 'ar-IQ' : 'en-US', { style: 'percent' }).format(x));
  const minutes = (m: number | null) => m;
  const pick = (en: string, ar: string) => (lang === 'ar' && ar ? ar : en);
  return { num, usd, iqd, date, dateLong, range, time, ago, until, city, cities, place, language, list, pct, minutes, pick };
}

export function useFmt() {
  const { lang, meta } = useApp();
  return makeFmt(lang, meta);
}
