// The phone number field: a country code picker and the number, in one row, styled like the other inputs.
import React, { useMemo, useState } from 'react';
import { DEFAULT_COUNTRY, cleanPhoneInput, countryOptions, latinDigits, parsePhone, searchCountries, splitPhone, type CountryCode } from '../core/phone';
import { useApp } from './lib/app';
import { Icon, Modal } from './ui';

export interface PhoneValue { country: CountryCode | null; number: string }

export const emptyPhone = (): PhoneValue => ({ country: DEFAULT_COUNTRY, number: '' });
// A stored E.164 number, shown back in the two parts of the field.
export function phoneFromE164(e164: string | null | undefined): PhoneValue {
  const s = e164 ? splitPhone(e164) : null;
  return s ? { country: s.country, number: s.national } : emptyPhone();
}
// The full E.164 number, or which problem the field has.
export const readPhone = (v: PhoneValue) => parsePhone(v.number, v.country);
// The message for the field, shown live like the other fields ('' when the number is fine).
export function phoneProblem(v: PhoneValue, t: (k: string) => string): string {
  if (!v.country) return t('err.country_code_required');
  if (!v.number.trim()) return t('v.phone');
  const r = readPhone(v);
  return r.ok ? '' : t('err.' + r.error);
}

export function PhoneField({ id, value, onChange, inputClassName = 'input', ...aria }: { id?: string; value: PhoneValue; onChange(v: PhoneValue): void; inputClassName?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) {
  const { t, lang } = useApp();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const all = useMemo(() => countryOptions(), []);
  const current = value.country ? all.find((c) => c.code === value.country) : null;
  const list = useMemo(() => searchCountries(q), [q]);
  const type = (text: string) => {
    const typed = latinDigits(text);
    // A pasted number that already starts with + (or 00) carries its country: switch the picker to it.
    if (/^\s*(\+|00)/.test(typed)) {
      const r = parsePhone(typed);
      if (r.ok) return onChange({ country: r.country, number: r.national });
      return onChange({ ...value, number: cleanPhoneInput(typed).slice(0, 17) });
    }
    onChange({ ...value, number: typed.replace(/[^\d\s-]/g, '').slice(0, 20) });
  };
  const big = inputClassName.includes('login-input');
  return (
    <>
      <div className={'phone-row' + (big ? ' big' : '')} dir="ltr">
        <button type="button" className="phone-cc" aria-haspopup="dialog" aria-label={t('field.countryCode') + (current ? ': ' + (lang === 'ar' ? current.nameAr : current.name) + ' ' + current.dial : '')} aria-invalid={!current ? true : undefined} onClick={() => { setQ(''); setOpen(true); }}>
          <span className="phone-flag" aria-hidden="true">{current ? current.flag : '🌐'}</span>
          <span className="phone-dial">{current ? current.dial : '+'}</span>
          <svg className="phone-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 9l7 7 7-7" /></svg>
        </button>
        <input id={id} className={inputClassName + ' phone-number'} type="tel" inputMode="tel" autoComplete="tel-national" dir="ltr" placeholder={value.country === 'IQ' ? '0770 123 4567' : ''} value={value.number} onChange={(e) => type(e.target.value)} {...aria} />
      </div>
      {open && (
        <Modal title={t('phone.pick_title')} onClose={() => setOpen(false)}>
          <div className="phone-search">
            <Icon name="search" size={18} />
            <input className="input" type="search" inputMode="search" autoComplete="off" aria-label={t('phone.search')} placeholder={t('phone.search')} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="phone-list" role="listbox" aria-label={t('phone.pick_title')}>
            {list.map((c) => (
              <button key={c.code} type="button" role="option" aria-selected={c.code === value.country} className={'phone-opt' + (c.code === value.country ? ' on' : '')} onClick={() => { onChange({ ...value, country: c.code }); setOpen(false); }}>
                <span className="phone-flag" aria-hidden="true">{c.flag}</span>
                <span className="phone-name">{lang === 'ar' ? c.nameAr : c.name}</span>
                <span className="phone-dial muted" dir="ltr">{c.dial}</span>
              </button>
            ))}
            {!list.length && <p className="muted small center">{t('phone.none')}</p>}
          </div>
        </Modal>
      )}
    </>
  );
}
