// Phone numbers: one set of rules for the screens, the offline engine and the server.
// Every number is checked for its country with libphonenumber and kept in E.164 form (+9647713111325).
import { getCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/max';
import { bad } from './util';

export type { CountryCode };
export const DEFAULT_COUNTRY: CountryCode = 'IQ';

// Arabic-Indic (٠-٩) and Persian (۰-۹) digits become 0-9.
export function latinDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

// What the user typed, reduced to digits and an optional leading +. Spaces, dashes, dots and brackets are dropped.
export function cleanPhoneInput(s: string): string {
  const t = latinDigits(String(s || '')).trim();
  const plus = t.startsWith('+') || t.startsWith('00');
  const digits = t.replace(/^00/, '').replace(/\D/g, '');
  return (plus ? '+' : '') + digits;
}

// Mobile numbers only. Some countries (the US, Canada…) cannot tell mobile from landline, so those pass too.
const MOBILE_TYPES = new Set(['MOBILE', 'FIXED_LINE_OR_MOBILE']);

export type PhoneResult = { ok: true; e164: string; country: CountryCode; national: string } | { ok: false; error: 'phone_invalid' | 'country_code_required' };

// Reads a number typed in the phone field. `country` is the picker's choice; a number that starts with + carries its own.
export function parsePhone(input: string, country?: CountryCode | null): PhoneResult {
  const raw = cleanPhoneInput(input);
  if (!raw || raw === '+') return { ok: false, error: 'phone_invalid' };
  if (!raw.startsWith('+') && !country) return { ok: false, error: 'country_code_required' };
  // libphonenumber drops the national leading 0 (Iraqis type 07…) for the chosen country.
  const p = raw.startsWith('+') ? parsePhoneNumberFromString(raw) : parsePhoneNumberFromString(raw, country!);
  if (!p || !p.isValid() || !p.country) return { ok: false, error: 'phone_invalid' };
  const type = p.getType();
  if (!type || !MOBILE_TYPES.has(type)) return { ok: false, error: 'phone_invalid' };
  return { ok: true, e164: p.number, country: p.country, national: p.nationalNumber };
}

// The server side of the same rule: the API takes the full E.164 number and checks it again.
export function serverPhone(v: unknown): string {
  if (typeof v !== 'string' || !v.trim()) throw bad('field_required', { field: 'phone' });
  const raw = cleanPhoneInput(v);
  if (!raw.startsWith('+')) throw bad('country_code_required');
  const r = parsePhone(raw);
  if (!r.ok) throw bad(r.error);
  return r.e164;
}

// For sign-in: a number that cannot be read simply matches nobody.
export function loginPhone(v: unknown): string | null {
  const r = typeof v === 'string' ? parsePhone(v) : null;
  return r && r.ok ? r.e164 : null;
}

// Splits a stored E.164 number back into the picker's country and the national number, to show it in a form.
export function splitPhone(e164: string): { country: CountryCode; national: string } | null {
  const p = parsePhoneNumberFromString(cleanPhoneInput(e164));
  return p && p.country ? { country: p.country, national: p.nationalNumber } : null;
}

export interface CountryOption { code: CountryCode; dial: string; flag: string; name: string; nameAr: string }

const flagOf = (code: string) => String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));

let cache: CountryOption[] | null = null;
// Every country with a dial code, named in English and Arabic (from the platform's own region names).
export function countryOptions(): CountryOption[] {
  if (cache) return cache;
  const names = (lang: string) => {
    try {
      return new Intl.DisplayNames([lang], { type: 'region' });
    } catch {
      return null;
    }
  };
  const en = names('en');
  const ar = names('ar');
  const nameOf = (dn: Intl.DisplayNames | null, code: string) => {
    try {
      return dn?.of(code) || code;
    } catch {
      return code;
    }
  };
  cache = getCountries()
    .map((code) => ({ code, dial: '+' + getCountryCallingCode(code), flag: flagOf(code), name: nameOf(en, code), nameAr: nameOf(ar, code) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return cache;
}

// Search by Arabic name, English name or dial code ("964", "+964", "٩٦٤").
export function searchCountries(q: string): CountryOption[] {
  const all = countryOptions();
  const term = latinDigits(q).trim().toLowerCase();
  if (!term) return all;
  const digits = term.replace(/[^\d]/g, '');
  return all.filter((c) => c.name.toLowerCase().includes(term) || c.nameAr.includes(term) || c.code.toLowerCase() === term || (!!digits && c.dial.slice(1).startsWith(digits)));
}
