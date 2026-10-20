import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useApp } from '../lib/app';
import { useFmt } from '../lib/format';
import { Link, navigate } from '../lib/router';
import { asset, photoSrc } from '../assets';
import { Avatar, Field, Icon, Loading, Modal, MonthCalendar, PageHead, ToggleGroup, VerifiedBadge, useBusy } from '../ui';

function goNext(query: Record<string, string>) {
  const next = query.next && query.next.startsWith('/') ? query.next : '/';
  navigate(next, { replace: true });
}

export function Login({ query }: { query: Record<string, string> }) {
  const { t, signIn, meta, errorText } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async (e?: React.FormEvent, creds?: { email: string; password: string }) => {
    e?.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const r = await api('POST', '/auth/login', creds || { email, password });
      signIn(r.token, r.user);
      goNext(query);
    } catch (x) {
      setErr(errorText(x));
    } finally {
      setBusy(false);
    }
  };
  const demo = meta?.demoLogins;
  return (
    <div className="page" style={{ maxWidth: 460, margin: '0 auto', width: '100%' }}>
      <div className="center stack" style={{ alignItems: 'center', gap: 8 }}>
        <img src={asset('tg-logo-stacked.svg')} alt="" style={{ width: 150 }} />
        <h1>{t('auth.welcome_back')}</h1>
      </div>
      <form className="card stack" onSubmit={go}>
        <Field label={t('field.email')}>
          <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label={t('field.password')}>
          <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        {err && (
          <div className="note danger" role="alert">
            {err}
          </div>
        )}
        <button className="btn lg" disabled={busy}>
          {t('nav.sign_in')}
        </button>
        <p className="small center">
          {t('auth.no_account')} <Link to={'/register' + (query.next ? '?next=' + encodeURIComponent(query.next) : '')}>{t('nav.join')}</Link>
        </p>
      </form>
      {demo && (
        <div className="card dashed stack">
          <strong>{t('auth.try_demo')}</strong>
          <p className="small muted">{t('auth.try_demo_text')}</p>
          <div className="stack" style={{ gap: 8 }}>
            <button type="button" className="btn outline" disabled={busy} onClick={() => go(undefined, { email: demo.tourist, password: demo.password })}>
              {t('auth.demo_tourist')}
            </button>
            <button type="button" className="btn outline" disabled={busy} onClick={() => go(undefined, { email: demo.guide, password: demo.password })}>
              {t('auth.demo_guide')}
            </button>
            <button type="button" className="btn ghost" disabled={busy} onClick={() => go(undefined, { email: demo.admin, password: demo.password })}>
              {t('auth.demo_admin')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Register({ query }: { query: Record<string, string> }) {
  const { t, signIn, errorText } = useApp();
  const [f, setF] = useState({ role: query.role === 'guide' ? 'guide' : 'tourist', name: '', email: '', password: '', country: query.role === 'guide' ? 'Iraq' : '', gender: '' });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const up = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const go = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const r = await api('POST', '/auth/register', f);
      signIn(r.token, r.user);
      if (f.role === 'guide') navigate('/profile/guide', { replace: true });
      else goNext(query);
    } catch (x) {
      setErr(errorText(x));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="page" style={{ maxWidth: 520, margin: '0 auto', width: '100%' }}>
      <PageHead title={t('auth.create')} />
      <form className="card stack" onSubmit={go} noValidate>
        <div className="grid-2" role="radiogroup" aria-label={t('auth.i_am')}>
          {(['tourist', 'guide'] as const).map((r) => (
            <button key={r} type="button" role="radio" aria-checked={f.role === r} className={'btn ' + (f.role === r ? '' : 'ghost')} style={{ flexDirection: 'column', minHeight: 72, gap: 2 }} onClick={() => up({ role: r })}>
              <span>{t('auth.role_' + r)}</span>
              <span className="xs" style={{ fontWeight: 400, opacity: 0.85 }}>
                {t('auth.role_' + r + '_text')}
              </span>
            </button>
          ))}
        </div>
        <Field label={t('field.name')}>
          <input className="input" autoComplete="name" value={f.name} onChange={(e) => up({ name: e.target.value })} />
        </Field>
        <Field label={t('field.email')}>
          <input className="input" type="email" autoComplete="email" value={f.email} onChange={(e) => up({ email: e.target.value })} />
        </Field>
        <Field label={t('field.password')} hint={t('auth.password_hint')}>
          <input className="input" type="password" autoComplete="new-password" value={f.password} onChange={(e) => up({ password: e.target.value })} />
        </Field>
        <div className="grid-2">
          <Field label={t('field.country')}>
            <input className="input" autoComplete="country-name" value={f.country} onChange={(e) => up({ country: e.target.value })} />
          </Field>
          <Field label={t('field.gender')}>
            <select className="select" value={f.gender} onChange={(e) => up({ gender: e.target.value })}>
              <option value="">{t('common.choose')}</option>
              <option value="f">{t('gender.f')}</option>
              <option value="m">{t('gender.m')}</option>
            </select>
          </Field>
        </div>
        {err && (
          <div className="note danger" role="alert">
            {err}
          </div>
        )}
        <button className="btn lg" disabled={busy}>
          {t('auth.create_btn')}
        </button>
        <p className="small center">
          {t('auth.have_account')} <Link to="/login">{t('nav.sign_in')}</Link>
        </p>
      </form>
    </div>
  );
}

export function Account() {
  const { t, me, setLang, lang, signOut, refreshMe, toast } = useApp();
  const [f, setF] = useState({ name: me?.name || '', country: me?.country || '', phone: me?.phone || '' });
  const [code, setCode] = useState('');
  const [showCode, setShowCode] = useState(false);
  const { busy, run } = useBusy();
  const { meta } = useApp();
  if (!me) return null; // the router sends signed-out visitors to sign in
  return (
    <div className="page" style={{ maxWidth: 720, margin: '0 auto', width: '100%' }}>
      <PageHead title={t('account.title')} />
      <div className="row" style={{ gap: 14 }}>
        <Avatar user={me} size={64} />
        <div>
          <h2>{me.name}</h2>
          <div className="muted small">
            {me.email} · {t('role.' + me.role)}
          </div>
        </div>
      </div>

      {me.role === 'guide' && (
        <div className="card stack">
          <div className="between">
            <strong>{t('account.guide_profile')}</strong>
            {me.guide.verification === 'verified' && (
              <span className="pill sky">
                <VerifiedBadge size={14} /> {t('badge.verified')}
              </span>
            )}
          </div>
          <p className="small muted">{me.guide.profileComplete ? t('account.guide_profile_text') : t('dash.finish_profile_text')}</p>
          <div className="row">
            <Link to="/profile/guide" className="btn sm">
              {t('dash.edit_profile')}
            </Link>
            <Link to={`/guides/${me.id}`} className="btn sm ghost">
              {t('dash.view_public')}
            </Link>
          </div>
        </div>
      )}

      <div className="cards">
        {me.role !== 'admin' && (
          <Link to="/wallet" className="card link row">
            <Icon name="wallet" /> <strong>{t('wallet.title')}</strong>
          </Link>
        )}
        <Link to="/notifications" className="card link row">
          <Icon name="bell" /> <strong>{t('notifications.title')}</strong>
        </Link>
        {me.role === 'tourist' && (
          <Link to="/requests" className="card link row">
            <Icon name="list" /> <strong>{t('nav.my_requests')}</strong>
          </Link>
        )}
        {me.role === 'admin' && (
          <Link to="/" className="card link row">
            <Icon name="shield" /> <strong>{t('nav.admin')}</strong>
          </Link>
        )}
      </div>

      <form
        className="card stack"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            await api('PUT', '/me', f);
            await refreshMe();
          }, t('common.saved'));
        }}
      >
        <h2>{t('account.details')}</h2>
        <Field label={t('field.name')}>
          <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label={t('field.country')}>
          <input className="input" value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })} />
        </Field>
        <Field label={t('field.phone')} hint={me.phoneVerified ? t('account.phone_verified') : t('account.phone_unverified')}>
          <input className="input ltr" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        </Field>
        <div className="row">
          <button className="btn" disabled={busy}>
            {t('common.save')}
          </button>
          {me.phone && !me.phoneVerified && f.phone === me.phone && (
            <button type="button" className="btn outline" onClick={() => setShowCode(true)}>
              {t('account.verify_phone')}
            </button>
          )}
        </div>
      </form>

      <div className="card stack">
        <h2>{t('account.language')}</h2>
        <div className="row">
          <button type="button" className="toggle-chip" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>
            English
          </button>
          <button type="button" className="toggle-chip" aria-pressed={lang === 'ar'} onClick={() => setLang('ar')}>
            العربية
          </button>
        </div>
      </div>

      <button
        type="button"
        className="btn ghost"
        onClick={async () => {
          navigate('/', { replace: true });
          await signOut();
        }}
      >
        <Icon name="logout" size={18} className="flip" /> {t('account.sign_out')}
      </button>
      <p className="xs faint center">{t('footer.independent')}</p>

      {showCode && (
        <Modal title={t('account.verify_phone')} onClose={() => setShowCode(false)}>
          <p className="small">{t('account.code_sent', { phone: me.phone })}</p>
          <p className="note small">{t('account.demo_code', { code: meta.demoPhoneCode })}</p>
          <Field label={t('account.code')}>
            <input className="input ltr" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await api('POST', '/me/verify-phone', { code });
                await refreshMe();
                setShowCode(false);
                toast(t('account.phone_done'));
              })
            }
          >
            {t('account.confirm_code')}
          </button>
        </Modal>
      )}
    </div>
  );
}

async function resizeImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const max = 900;
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    let q = 0.82;
    let out = c.toDataURL('image/jpeg', q);
    while (out.length > 380_000 && q > 0.4) out = c.toDataURL('image/jpeg', (q -= 0.1));
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function GuideEditor() {
  const { t, me, meta, refreshMe, toast, errorText } = useApp();
  const fmt = useFmt();
  const g = me?.guide;
  const [f, setF] = useState(() => (g ? { headline: g.headline, headlineAr: g.headlineAr, bio: g.bio, bioAr: g.bioAr, pricePerDay: String(g.pricePerDay), cities: g.cities, languages: g.languages, specialities: g.specialities, places: g.places, photos: g.photos, blockedDates: g.blockedDates } : null));
  const [month, setMonth] = useState(meta?.today?.slice(0, 7));
  const [err, setErr] = useState<string | null>(null);
  const [docs, setDocs] = useState<string[]>([]);
  const { busy, run } = useBusy();
  useEffect(() => {
    if (window.location.hash.includes('verify')) setTimeout(() => document.getElementById('verify')?.scrollIntoView(), 50);
  }, []);
  if (!me || me.role !== 'guide' || !f) return null;
  if (!meta) return <Loading />;
  const up = (p: Partial<typeof f>) => setF((x) => ({ ...x!, ...p }));
  const save = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setErr(null);
    await run(async () => {
      try {
        await api('PUT', '/guide/profile', { ...f, pricePerDay: Number(f.pricePerDay) });
        await refreshMe();
      } catch (x) {
        setErr(errorText(x));
        throw x;
      }
    }, t('common.saved'));
  };
  const shift = (n: number) => {
    const d = new Date(month + '-01T12:00:00Z');
    d.setUTCMonth(d.getUTCMonth() + n);
    setMonth(d.toISOString().slice(0, 7));
  };
  const langCodes = f.languages.map((l: any) => l.code);
  return (
    <div className="page" style={{ maxWidth: 760, margin: '0 auto', width: '100%' }}>
      <PageHead title={t('editor.title')} backTo="/profile">
        <Link to={`/guides/${me.id}`} className="btn sm ghost">
          {t('dash.view_public')}
        </Link>
      </PageHead>
      <form className="stack-lg" onSubmit={save} noValidate>
        <fieldset className="card stack">
          <legend>{t('editor.basics')}</legend>
          <Field label={t('field.headline')} hint={t('editor.headline_hint')}>
            <input className="input" value={f.headline} onChange={(e) => up({ headline: e.target.value })} maxLength={90} />
          </Field>
          <Field label={t('field.headlineAr')}>
            <input className="input" dir="rtl" lang="ar" value={f.headlineAr} onChange={(e) => up({ headlineAr: e.target.value })} maxLength={90} />
          </Field>
          <Field label={t('field.bio')} hint={t('editor.bio_hint')}>
            <textarea className="textarea" rows={6} value={f.bio} onChange={(e) => up({ bio: e.target.value })} maxLength={1500} />
          </Field>
          <Field label={t('field.bioAr')}>
            <textarea className="textarea" dir="rtl" lang="ar" rows={5} value={f.bioAr} onChange={(e) => up({ bioAr: e.target.value })} maxLength={1500} />
          </Field>
          <Field label={t('field.pricePerDay')} hint={t('editor.price_hint', { pct: Math.round(meta.feeRate * 100) })}>
            <input className="input" inputMode="numeric" value={f.pricePerDay} onChange={(e) => up({ pricePerDay: e.target.value.replace(/\D/g, '') })} />
          </Field>
        </fieldset>

        <fieldset className="card stack">
          <legend>{t('editor.where')}</legend>
          <ToggleGroup label={t('field.cities')} options={meta.cities.map((c: any) => c.slug)} value={f.cities} onChange={(cities) => up({ cities, places: f.places.filter((p: number) => cities.includes(meta.places.find((x: any) => x.id === p)?.city)) })} render={fmt.city} />
          {f.cities.length > 0 && (
            <ToggleGroup
              label={t('field.places')}
              options={meta.places.filter((p: any) => f.cities.includes(p.city)).map((p: any) => String(p.id))}
              value={f.places.map(String)}
              onChange={(v) => up({ places: v.map(Number) })}
              render={(id) => fmt.place(Number(id))}
            />
          )}
          <ToggleGroup label={t('field.specialities')} options={meta.interests} value={f.specialities} onChange={(specialities) => up({ specialities })} render={(i) => t('interest.' + i)} />
        </fieldset>

        <fieldset className="card stack">
          <legend>{t('editor.languages')}</legend>
          {f.languages.map((l: any, i: number) => (
            <div key={l.code} className="row" style={{ flexWrap: 'nowrap' }}>
              <span style={{ flex: 1 }}>{fmt.language(l.code)}</span>
              <select className="select" style={{ width: 'auto' }} aria-label={t('editor.level_for', { lang: fmt.language(l.code) })} value={l.level} onChange={(e) => up({ languages: f.languages.map((x: any, j: number) => (j === i ? { ...x, level: e.target.value } : x)) })}>
                {meta.levels.map((lv: string) => (
                  <option key={lv} value={lv}>
                    {t('level.' + lv)}
                  </option>
                ))}
              </select>
              <button type="button" className="icon-btn" aria-label={t('common.remove_x', { name: fmt.language(l.code) })} disabled={f.languages.length === 1} onClick={() => up({ languages: f.languages.filter((_: any, j: number) => j !== i) })}>
                <Icon name="trash" size={18} />
              </button>
            </div>
          ))}
          <select className="select" value="" aria-label={t('editor.add_language')} onChange={(e) => e.target.value && up({ languages: [...f.languages, { code: e.target.value, level: 'good' }] })}>
            <option value="">{t('editor.add_language')}</option>
            {meta.languages.filter((c: string) => !langCodes.includes(c)).map((c: string) => (
              <option key={c} value={c}>
                {fmt.language(c)}
              </option>
            ))}
          </select>
        </fieldset>

        <fieldset className="card stack">
          <legend>{t('editor.photos')}</legend>
          <p className="small muted">{t('editor.photos_hint')}</p>
          <div className="polaroids" style={{ flexWrap: 'wrap' }}>
            {f.photos.map((ph: any, i: number) => (
              <figure key={i} className="polaroid" style={{ position: 'relative' }}>
                <img src={photoSrc(ph.img)} alt="" />
                <input className="input" style={{ minHeight: 36, fontSize: 13, marginTop: 6, padding: '0 8px' }} placeholder={t('editor.caption')} aria-label={t('editor.caption')} value={ph.caption} onChange={(e) => up({ photos: f.photos.map((x: any, j: number) => (j === i ? { ...x, caption: e.target.value } : x)) })} />
                <button type="button" className="icon-btn" style={{ position: 'absolute', top: 8, insetInlineEnd: 8, background: '#fff', width: 36, height: 36 }} aria-label={t('editor.remove_photo')} onClick={() => up({ photos: f.photos.filter((_: any, j: number) => j !== i) })}>
                  <Icon name="trash" size={16} />
                </button>
              </figure>
            ))}
          </div>
          {f.photos.length < 8 && (
            <label className="btn outline" style={{ alignSelf: 'flex-start' }}>
              <Icon name="image" size={18} /> {t('editor.add_photo')}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  try {
                    const img = await resizeImage(file);
                    up({ photos: [...f.photos, { img, caption: '', captionAr: '' }] });
                  } catch {
                    toast(t('err.photo_invalid'), 'error');
                  }
                }}
              />
            </label>
          )}
        </fieldset>

        <fieldset className="card stack">
          <legend>{t('editor.availability')}</legend>
          <p className="small muted">{t('editor.availability_hint')}</p>
          <div className="between">
            <button type="button" className="icon-btn" aria-label={t('common.prev_month')} onClick={() => shift(-1)} disabled={month <= meta.today.slice(0, 7)}>
              <Icon name="back" className="flip" />
            </button>
            <strong>{fmt.date(month + '-01', { month: 'long', year: 'numeric' })}</strong>
            <button type="button" className="icon-btn" aria-label={t('common.next_month')} onClick={() => shift(1)}>
              <Icon name="next" className="flip" />
            </button>
          </div>
          <MonthCalendar month={month} blocked={f.blockedDates} booked={[]} today={meta.today} onToggle={(d) => up({ blockedDates: f.blockedDates.includes(d) ? f.blockedDates.filter((x: string) => x !== d) : [...f.blockedDates, d].sort() })} />
        </fieldset>

        {err && (
          <div className="note danger" role="alert">
            {err}
          </div>
        )}
        <div className="sticky-actions">
          <button className="btn lg" style={{ flex: 1 }} disabled={busy}>
            {t('editor.save')}
          </button>
        </div>
      </form>

      <section id="verify" className="card stack">
        <h2>{t('verify.title')}</h2>
        {g.verification === 'verified' ? (
          <p className="row">
            <VerifiedBadge /> {t('verify.status_text.verified')}
          </p>
        ) : g.verification === 'pending' ? (
          <p className="note">{t('verify.status_text.pending')}</p>
        ) : (
          <>
            {g.verification === 'rejected' && <p className="note danger">{t('verify.rejected_note', { note: g.verificationNote })}</p>}
            <p className="small">{t('verify.text')}</p>
            <label className="btn outline" style={{ alignSelf: 'flex-start' }}>
              <Icon name="image" size={18} /> {t('verify.choose_files')}
              <input type="file" multiple accept="image/*,application/pdf" className="sr-only" onChange={(e) => setDocs(Array.from(e.target.files || []).slice(0, 4).map((x) => x.name))} />
            </label>
            {docs.length > 0 && (
              <ul className="small" style={{ margin: 0 }}>
                {docs.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            )}
            <p className="xs muted">{t('verify.demo_note')}</p>
            <button
              type="button"
              className="btn"
              disabled={busy || !docs.length}
              onClick={() =>
                run(async () => {
                  await api('POST', '/guide/verification', { docs });
                  await refreshMe();
                }, t('verify.sent'))
              }
            >
              {t('verify.send')}
            </button>
          </>
        )}
      </section>
    </div>
  );
}
