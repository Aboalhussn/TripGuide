import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useApp, useLoad } from '../lib/app';
import { useFmt } from '../lib/format';
import { Link, navigate } from '../lib/router';
import { asset, photoSrc } from '../assets';
import { resizeImage } from '../lib/image';
import { MyRequestsList } from './Requests';
import { Avatar, BookingStatus, BrandFooter, HeroBand, LimitNote, LangToggle, CardForm, Field, Icon, Loading, Modal, Money, MonthCalendar, PageHead, ToggleGroup, VerifiedBadge, emptyCard, useBusy } from '../ui';
import type { CardValue } from '../ui';

function goNext(query: Record<string, string>) {
  const next = query.next && query.next.startsWith('/') ? query.next : '/';
  navigate(next, { replace: true });
}

export function Login({ query }: { query: Record<string, string> }) {
  const { t, signIn, meta, errorText, lang, setLang } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [demoPick, setDemoPick] = useState<'tourist' | 'guide' | 'admin'>('tourist');
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
    <div className="auth-page slide login-slide">
      <AuthHero img="babylon.jpg" title={t('auth.hero_title')} text={t('auth.hero_text')} />
      <section className="auth-sheet">
        <h2>{t('auth.login_btn')}</h2>
        <form className="login-form" onSubmit={go}>
          <label className="auth-label">
            {t('field.email')}
            <input className="input login-input" type="email" inputMode="email" autoComplete="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="auth-label" htmlFor="login-pw">
            {t('field.password')}
          </label>
          <div className="pw-wrap" style={{ marginTop: -8 }}>
            <input id="login-pw" className="input login-input" type={showPw ? 'text' : 'password'} autoComplete="current-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <button type="button" className="pw-eye" aria-label={showPw ? t('auth.hide_pw') : t('auth.show_pw')} aria-pressed={showPw} onClick={() => setShowPw(!showPw)}>
              <Icon name={showPw ? 'eyeOff' : 'eye'} size={20} />
            </button>
          </div>
          {err && !demoOpen && (
            <div className="note danger" role="alert" dir="auto">
              {err}
            </div>
          )}
          <button className="btn lg block login-submit" disabled={busy}>
            {t('auth.login_btn')}
          </button>
        </form>
        <div className="auth-links">
          <Link to={'/register' + (query.next ? '?next=' + encodeURIComponent(query.next) : '')} className="strong-link">{t('auth.create_account')}</Link>
          <button type="button" className="linkish guest-link" onClick={() => navigate('/', { replace: true })}>
            {t('auth.guest')}
          </button>
        </div>
        {demo && (
          <button type="button" className="demo-trigger" onClick={() => { setErr(null); setDemoOpen(true); }}>
            <Icon name="send" size={16} /> {t('auth.try_demo')}
          </button>
        )}
      </section>
      {demo && demoOpen && (
        // Pop-up sheet: pick a demo account (it gets a check), then "Enter as …".
        <Modal title={t('auth.demo_sheet_title')} onClose={() => setDemoOpen(false)}>
          <div className="stack demo-sheet" dir="auto" style={{ gap: 10 }} role="radiogroup" aria-label={t('auth.demo_sheet_title')}>
            {([
              ['tourist', demo.tourist, 'auth.demo_tourist', 'auth.demo_tourist_text', 'HW'],
              ['guide', demo.guide, 'auth.demo_guide', 'auth.demo_guide_text', 'ZR'],
              ['admin', demo.admin, 'auth.demo_admin', 'auth.demo_admin_text', 'TG'],
            ] as const).map(([k, mail, label, text, ini]) => (
              <button key={k} type="button" role="radio" aria-checked={demoPick === k} className={'demo-pick demo-' + k + (demoPick === k ? ' on' : '')} onClick={() => setDemoPick(k)}>
                <span className="demo-av" aria-hidden="true">{ini}</span>
                <span className="demo-text">
                  <strong>{t(label)}</strong>
                  <span className="xs muted">{t(text)}</span>
                  <span className="xs muted" dir="ltr">{mail}</span>
                </span>
                {demoPick === k ? (
                  <span className="demo-check" aria-hidden="true"><Icon name="check" size={14} stroke={3} /></span>
                ) : (
                  <Icon name="next" size={18} className="flip" />
                )}
              </button>
            ))}
            {err && (
              <div className="note danger" role="alert">
                {err}
              </div>
            )}
            <button type="button" className="btn lg demo-go" disabled={busy} onClick={() => go(undefined, { email: (demo as any)[demoPick], password: demo.password })}>
              {t('auth.enter_as', { role: t('auth.role_short_' + demoPick) })}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** Photo header for sign-in and sign-up: the picture under a navy wash, the white logo and a headline. */
function AuthHero({ img, title, text, small = false }: { img: string; title: string; text: string; small?: boolean }) {
  const { t } = useApp();
  const ref = React.useRef<HTMLElement>(null);
  const [covered, setCovered] = useState(false);
  useEffect(() => {
    // Once the white sheet slides up under the logo, give the top bar its own navy background.
    const onScroll = () => setCovered(window.scrollY > (ref.current?.offsetHeight || 300) - 110);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <header ref={ref} className={'auth-hero' + (small ? ' small' : '')}>
      <img className="auth-bg" src={asset(img)} alt="" />
      <div className={'auth-top' + (covered ? ' covered' : '')} dir="ltr">
        <span className="login-brand"><img src={asset('tg-logo-horizontal-white.svg')} alt={t('brand.name')} /></span>
        <LangToggle />
      </div>
      <div className="auth-head">
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
    </header>
  );
}

/** The rules a new password must meet, shown live under the field. */
function passwordRules(pw: string) {
  return [
    { key: 'len', ok: pw.length >= 8 },
    { key: 'upper', ok: /[A-Z]/.test(pw) },
    { key: 'lower', ok: /[a-z]/.test(pw) },
    { key: 'digit', ok: /\d/.test(pw) },
    { key: 'symbol', ok: /[^A-Za-z0-9]/.test(pw) },
  ];
}

/** Password strength: a bar that fills as rules are met, then only the rules still missing, as small chips. */
function PasswordMeter({ rules, typed, warn }: { rules: { key: string; ok: boolean }[]; typed: boolean; warn: boolean }) {
  const { t } = useApp();
  const score = rules.filter((r) => r.ok).length;
  const level = score >= 5 ? 'strong' : score === 4 ? 'good' : score >= 2 ? 'fair' : 'weak';
  const missing = rules.filter((r) => !r.ok);
  return (
    <div id="pw-meter" className={'pw-meter ' + (typed ? level : 'idle') + (warn ? ' warn' : '')} data-score={score} aria-live="polite">
      {!typed ? (
        <span className="pw-hint">{t('auth.pw_hint')}</span>
      ) : (
        <>
          <div className="pw-bar" aria-hidden="true">
            {rules.map((r, i) => (
              <i key={r.key} className={i < score ? 'on' : ''} />
            ))}
          </div>
          <div className="pw-status">
            {score === 5 ? (
              <span className="pw-ok">
                <Icon name="check" size={14} stroke={3} /> {t('auth.pw_strong_ok')}
              </span>
            ) : (
              <span className="pw-level">{t('auth.pw_' + level)}</span>
            )}
          </div>
          {missing.length > 0 && (
            <ul className="pw-rules" aria-label={t('auth.pw_still')}>
              <li className="pw-still">{t('auth.pw_still')}</li>
              {missing.map((r) => (
                <li key={r.key} className="pw-chip">
                  {t('auth.pw_chip_' + r.key)}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

export function Register({ query }: { query: Record<string, string> }) {
  const { t, signIn, errorText } = useApp();
  const [f, setF] = useState({ role: query.role === 'guide' ? 'guide' : 'tourist', name: '', email: '', password: '', country: query.role === 'guide' ? 'Iraq' : '', gender: '' });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [tried, setTried] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const up = (p: Partial<typeof f>) => {
    setF((x) => ({ ...x, ...p }));
    setDirty((d) => ({ ...d, ...Object.fromEntries(Object.keys(p).map((k) => [k, true])) }));
  };
  const rules = passwordRules(f.password);
  const strong = rules.every((r) => r.ok);
  // Every field is checked as you type; the message shows as soon as the field has been touched.
  const errs: Record<string, string> = {};
  if (f.name.trim().length < 2) errs.name = t('v.name');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())) errs.email = f.email ? t('err.email_invalid') : t('v.email');
  if (!strong) errs.password = t('err.password_weak');
  if (f.country.trim().length < 2) errs.country = t('v.country');
  if (!f.gender) errs.gender = t('v.gender');
  const show = (k: string) => (tried || dirty[k] ? errs[k] : undefined);
  const go = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setTried(true);
    const first = Object.keys(errs)[0];
    if (first) {
      document.getElementById('reg-' + first)?.focus();
      return;
    }
    setBusy(true);
    try {
      const r = await api('POST', '/auth/register', f);
      signIn(r.token, r.user);
      if (f.role === 'guide') navigate('/guide/setup', { replace: true });
      else goNext(query);
    } catch (x) {
      setErr(errorText(x));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="auth-page slide">
      <AuthHero small img="ishtar.jpg" title={t('auth.create')} text={t('auth.create_text')} />
      <section className="auth-sheet">
      <form className="stack" onSubmit={go} noValidate>
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
        <Field label={t('field.name')} error={show('name')}>
          <input id="reg-name" className="input" autoComplete="name" value={f.name} onChange={(e) => up({ name: e.target.value.slice(0, 60) })} />
        </Field>
        <Field label={t('field.email')} error={show('email')}>
          <input id="reg-email" className="input" type="email" autoComplete="email" value={f.email} onChange={(e) => up({ email: e.target.value.trim() })} />
        </Field>
        <div className="field">
          <label htmlFor="reg-password">{t('field.password')}</label>
          <div className="pw-wrap">
            <input id="reg-password" className="input" type={showPw ? 'text' : 'password'} autoComplete="new-password" value={f.password} onChange={(e) => up({ password: e.target.value })} aria-describedby={'pw-meter' + (tried && !strong ? ' pw-err' : '')} aria-invalid={tried && !strong ? true : undefined} />
            <button type="button" className="pw-eye" aria-label={showPw ? t('auth.hide_pw') : t('auth.show_pw')} aria-pressed={showPw} onClick={() => setShowPw(!showPw)}>
              <Icon name={showPw ? 'eyeOff' : 'eye'} size={20} />
            </button>
          </div>
          {tried && !strong && (
            <span className="err" id="pw-err">
              {errs.password}
            </span>
          )}
        </div>
        <PasswordMeter rules={rules} typed={!!f.password} warn={(tried || (dirty.password && f.password.length >= 8)) && !strong} />
        <div className="grid-2">
          <Field label={t('field.country')} error={show('country')}>
            <input id="reg-country" className="input" autoComplete="country-name" value={f.country} onChange={(e) => up({ country: e.target.value.slice(0, 60) })} />
          </Field>
          <Field label={t('field.gender')} error={show('gender')}>
            <select id="reg-gender" className="select" value={f.gender} onChange={(e) => up({ gender: e.target.value })}>
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
      <div className="guest-way">
        <span className="divider-text">{t('auth.or')}</span>
        <button type="button" className="btn ghost lg" onClick={() => navigate('/', { replace: true })}>
          <Icon name="user" size={18} /> {t('auth.guest')}
        </button>
        <p className="xs muted center">{t('auth.guest_note')}</p>
      </div>
      </section>
    </div>
  );
}

/* ---------- Tourist profile: a short menu, each row opens its own page ---------- */

function AccountMenu() {
  const { t, me, lang, signOut, ask } = useApp();
  const signOutNow = async () => {
    if (!(await ask(t('account.sign_out_confirm'), t('account.sign_out'), { danger: true }))) return;
    navigate('/login', { replace: true });
    await signOut();
  };
  const info = { to: '/profile/info', icon: 'user', label: t('menu.info'), sub: t('menu.info_sub') };
  const settings = { to: '/profile/settings', icon: 'globe', label: t('menu.settings'), sub: lang === 'ar' ? 'العربية' : 'English' };
  const notes = { to: '/notifications', icon: 'bell', label: t('notifications.title'), sub: me.unreadNotifications ? t('menu.unread', { count: me.unreadNotifications }) : t('notifications.none'), badge: me.unreadNotifications ? <span className="pill gold">{me.unreadNotifications}</span> : null };
  const policy = { to: '/profile/policy', icon: 'shield', label: t('menu.policy'), sub: t('menu.policy_sub') };
  const cardSub = me.savedCard ? `${me.savedCard.brand} •••• ${me.savedCard.last4}` : t('menu.wallet_add');
  const g = me.guide;
  const rows: { to: string; icon: string; label: string; sub: string; badge?: React.ReactNode }[] =
    me.role === 'guide'
      ? [
          info,
          { to: '/guide/setup', icon: 'edit', label: t('menu.guide_profile'), sub: g?.profileComplete ? t('menu.guide_profile_sub') : t('dash.finish_profile'), badge: !g?.profileComplete ? <span className="pill gold">{t('menu.todo')}</span> : null },
          { to: '/profile/guide', icon: 'image', label: t('editor.title_media'), sub: t('menu.media_sub', { count: g?.photos?.length || 0 }) },
          { to: '/profile/trips', icon: 'calendar', label: t('menu.tours'), sub: t('menu.tours_sub') },
          { to: '/wallet', icon: 'wallet', label: t('menu.wallet'), sub: t('menu.wallet_guide_sub') },
          { to: '/profile/plans', icon: 'money', label: t('menu.plans'), sub: g?.cashOpen ? t('menu.plans_cash_on') : t('menu.plans_sub') },
          {
            to: '/verify',
            icon: 'shield',
            label: t('menu.verification'),
            sub: t('verify.short.' + (g?.verification || 'none')),
            badge: g?.verification === 'verified' ? <VerifiedBadge size={18} /> : g?.verification === 'pending' ? <span className="pill gold">{t('verify.short.pending')}</span> : null,
          },
          notes,
          policy,
          settings,
        ]
      : me.role === 'admin'
        ? [
            info,
            { to: '/admin/cities', icon: 'pin', label: t('city.title'), sub: t('menu.cities_sub') },
            { to: '/admin/pricing', icon: 'money', label: t('admin.pricing'), sub: t('menu.pricing_sub') },
            { to: '/admin/stats', icon: 'chart', label: t('stats.title'), sub: t('menu.stats_sub') },
            notes,
            policy,
            settings,
          ]
        : [
            info,
            { to: '/passport', icon: 'passport', label: t('pp.mine'), sub: t('pp.pages_n', { count: me.passport?.pages?.length || 0 }) },
            { to: '/profile/trips', icon: 'list', label: t('menu.trips'), sub: t('menu.trips_sub') },
            { to: '/wallet', icon: 'wallet', label: t('menu.wallet'), sub: cardSub },
            notes,
            policy,
            settings,
          ];
  return (
    <div className="page" style={{ maxWidth: 720, margin: '0 auto', width: '100%' }}>
      <div className="account-top">
        <h1>{t('account.title')}</h1>
        <img src={asset('tg-logo-horizontal.svg')} alt={t('brand.name')} />
      </div>
      <ProfileHeader />
      {me.role === 'guide' && (
        <Link to={`/guides/${me.id}`} className="btn ghost sm" style={{ alignSelf: 'flex-start', marginTop: -10 }}>
          {t('dash.view_public')}
        </Link>
      )}
      <nav className="menu-list" aria-label={t('account.title')}>
        {rows.map((r) => (
          <Link key={r.to} to={r.to} className="menu-row">
            <span className="qa-ico sm"><Icon name={r.icon} size={20} /></span>
            <span className="menu-text">
              <strong>{r.label}</strong>
              <span className="xs muted">{r.sub}</span>
            </span>
            {r.badge}
            <Icon name="next" size={18} className="flip" />
          </Link>
        ))}
      </nav>
      <button type="button" className="btn lg signout-btn" onClick={signOutNow}>
        <Icon name="logout" size={18} className="flip" /> {t('account.sign_out')}
      </button>
    </div>
  );
}

/** Guides: cash payments subscription and the featured listing, on one page. */
export function GuidePlans() {
  const { t, me } = useApp();
  if (!me || me.role !== 'guide') return null;
  return (
    <div className="page" style={{ maxWidth: 720, margin: '0 auto', width: '100%' }}>
      <PageHead title={t('menu.plans')} backTo="/profile" />
      <CashPayments />
      <Promotion />
    </div>
  );
}

/** "Your info": name, country, phone (with code check) and email. */
export function ProfileInfo() {
  const { t, me, meta, refreshMe, toast, errorText } = useApp();
  const [f, setF] = useState({ name: me?.name || '', country: me?.country || '', phone: me?.phone || '', email: me?.email || '' });
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [code, setCode] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { busy, run } = useBusy();
  if (!me) return null;
  const up = (p: Partial<typeof f>) => {
    setF((x) => ({ ...x, ...p }));
    setDirty((d) => ({ ...d, ...Object.fromEntries(Object.keys(p).map((k) => [k, true])) }));
  };
  const errs: Record<string, string> = {};
  if (f.name.trim().length < 2) errs.name = t('v.name');
  if (f.country.trim().length < 2) errs.country = t('v.country');
  if (f.phone && !/^\+?[0-9 ]{7,20}$/.test(f.phone)) errs.phone = t('err.phone_invalid');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())) errs.email = f.email ? t('err.email_invalid') : t('v.email');
  const show = (k: string) => (dirty[k] ? errs[k] : undefined);
  const changed = f.name !== me.name || f.country !== me.country || f.phone !== (me.phone || '') || f.email !== me.email;
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setDirty({ name: true, country: true, phone: true, email: true });
    if (Object.keys(errs).length) return;
    run(async () => {
      setErr(null);
      try {
        await api('PUT', '/me', { ...f, name: f.name.trim(), country: f.country.trim(), email: f.email.trim() });
        await refreshMe();
        setDirty({});
        toast(t('common.saved'));
      } catch (x) {
        setErr(errorText(x));
        throw x;
      }
    });
  };
  return (
    <div className="page" style={{ maxWidth: 640, margin: '0 auto', width: '100%' }}>
      <PageHead title={t('menu.info')} backTo="/profile" />
      <form className="card stack" onSubmit={save} noValidate>
        <Field label={t('field.name')} error={show('name')}>
          <input className="input" autoComplete="name" value={f.name} onChange={(e) => up({ name: e.target.value.slice(0, 60) })} />
        </Field>
        <Field label={t('field.country')} error={show('country')}>
          <input className="input" autoComplete="country-name" value={f.country} onChange={(e) => up({ country: e.target.value.slice(0, 60) })} />
        </Field>
        <Field label={t('field.phone')} error={show('phone')} hint={show('phone') ? undefined : me.phone && f.phone === me.phone ? (me.phoneVerified ? t('account.phone_verified') : t('account.phone_unverified')) : undefined}>
          <input className="input ltr" type="tel" autoComplete="tel" value={f.phone} onChange={(e) => up({ phone: e.target.value.replace(/[^\d+ ]/g, '').slice(0, 20) })} />
        </Field>
        <Field label={t('field.email')} error={show('email')}>
          <input className="input ltr" type="email" autoComplete="email" value={f.email} onChange={(e) => up({ email: e.target.value.trim() })} />
        </Field>
        {err && (
          <div className="note danger" role="alert">
            {err}
          </div>
        )}
        <div className="row">
          <button className="btn" disabled={busy || !changed}>{t('common.save')}</button>
          {me.phone && !me.phoneVerified && f.phone === me.phone && (
            <button type="button" className="btn outline" onClick={() => setShowCode(true)}>
              {t('account.verify_phone')}
            </button>
          )}
        </div>
      </form>
      {showCode && (
        <Modal title={t('account.verify_phone')} onClose={() => setShowCode(false)}>
          <p className="small">{t('account.code_sent', { phone: me.phone })}</p>
          <p className="note small">{t('account.demo_code', { code: meta.demoPhoneCode })}</p>
          <Field label={t('account.code')}>
            <input className="input ltr" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
          </Field>
          <button
            type="button"
            className="btn"
            disabled={busy || code.length < 4}
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

/** "Requests and trips": switch at the top between trip requests and finished trips. */
export function TripsHub({ query }: { query: Record<string, string> }) {
  const { t, me } = useApp();
  const fmt = useFmt();
  const guide = me?.role === 'guide';
  const [tab, setTab] = useState<'first' | 'done'>(query.tab === 'done' ? 'done' : 'first');
  const res = useLoad(() => api('GET', '/bookings'), []);
  const all: any[] = res.data?.bookings || [];
  const done = all.filter((b) => b.status === 'completed').sort((a, b) => b.startDate.localeCompare(a.startDate));
  const upcoming = all.filter((b) => ['awaiting_guide', 'confirmed', 'disputed'].includes(b.status)).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const list = (items: any[], emptyTitle: string, emptyText: string) =>
    !res.data ? (
      <div className="skeleton" style={{ height: 160 }} />
    ) : items.length === 0 ? (
      <div className="card stack center" style={{ gap: 8 }}>
        <strong>{emptyTitle}</strong>
        <span className="small muted">{emptyText}</span>
      </div>
    ) : (
      <div className="cards">
        {items.map((b) => (
          <Link key={b.id} to={`/bookings/${b.id}`} className="card link row" style={{ gap: 12, flexWrap: 'nowrap' }}>
            <div className="date-chip">
              <div className="xs">{fmt.date(b.startDate, { month: 'short' })}</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{fmt.date(b.startDate, { day: 'numeric' })}</div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }} className="stack">
              <strong style={{ lineHeight: 1.3 }}><bdi>{b.title}</bdi></strong>
              <span className="small muted">{(guide ? b.tourist?.name : b.guide?.name) || ''} · {fmt.usd(b.total)}</span>
            </div>
            <BookingStatus status={b.status} />
          </Link>
        ))}
      </div>
    );
  return (
    <div className="page" style={{ maxWidth: 720, margin: '0 auto', width: '100%' }}>
      <PageHead title={guide ? t('menu.tours') : t('menu.trips')} backTo="/profile" />
      <div className="segmented" role="tablist">
        <button role="tab" aria-selected={tab === 'first'} onClick={() => setTab('first')}>
          {guide ? t('menu.tab_upcoming') : t('menu.tab_requests')}
        </button>
        <button role="tab" aria-selected={tab === 'done'} onClick={() => setTab('done')}>
          {guide ? t('menu.tab_done_tours') : t('menu.tab_done')}
        </button>
      </div>
      {tab === 'first'
        ? guide
          ? list(upcoming, t('menu.no_upcoming'), t('menu.no_upcoming_text'))
          : <MyRequestsList />
        : list(done, guide ? t('menu.no_done_tours') : t('menu.no_done'), t('menu.no_done_text'))}
    </div>
  );
}

/** Settings: the app language. */
export function ProfileSettings() {
  const { t, lang, setLang } = useApp();
  const opts: { code: 'en' | 'ar'; label: string; sub: string }[] = [
    { code: 'ar', label: 'العربية', sub: 'Arabic' },
    { code: 'en', label: 'English', sub: 'الإنجليزية' },
  ];
  return (
    <div className="page" style={{ maxWidth: 640, margin: '0 auto', width: '100%' }}>
      <PageHead title={t('menu.settings')} backTo="/profile" />
      <section className="stack" style={{ gap: 10 }}>
        <h2 style={{ fontSize: 18 }}>{t('account.language')}</h2>
        <div className="menu-list" role="radiogroup" aria-label={t('account.language')}>
          {opts.map((o) => (
            <button key={o.code} type="button" role="radio" aria-checked={lang === o.code} className="menu-row" onClick={() => setLang(o.code)}>
              <span className="qa-ico sm"><Icon name="globe" size={20} /></span>
              <span className="menu-text" lang={o.code}>
                <strong>{o.label}</strong>
                <span className="xs muted">{o.sub}</span>
              </span>
              <span className={'radio-dot' + (lang === o.code ? ' on' : '')} aria-hidden="true">{lang === o.code && <Icon name="check" size={14} stroke={3} />}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

/** Payment card kept in the profile (tourists and guides). Only brand, last 4, name and expiry are stored. */
export function PaymentCard({ gate = false }: { gate?: boolean }) {
  const { t, me, refreshMe, toast, errorText, ask } = useApp();
  const [open, setOpen] = useState(false);
  const [card, setCard] = useState<CardValue>({ ...emptyCard, saved: false });
  const [err, setErr] = useState<string | null>(null);
  const { busy, run } = useBusy();
  const c = me.savedCard;
  const save = () =>
    run(async () => {
      setErr(null);
      try {
        await api('PUT', '/me/card', card);
        await refreshMe();
        setOpen(false);
        setCard({ ...emptyCard, saved: false });
        toast(t('card.saved_toast'));
      } catch (x) {
        setErr(errorText(x));
        throw x;
      }
    });
  const remove = async () => {
    if (!(await ask(t('card.remove_confirm'), t('card.remove'), { danger: true }))) return;
    run(async () => {
      await api('DELETE', '/me/card');
      await refreshMe();
    }, t('card.removed_toast'));
  };
  return (
    <section className="card stack" aria-labelledby="pay-card-h">
      <div className="between">
        <strong id="pay-card-h" className="row" style={{ gap: 8 }}>
          <Icon name="wallet" size={20} /> {t('card.title')}
        </strong>
        {c && <span className="pill sky">{t('card.on_file')}</span>}
      </div>
      <p className="small muted">{gate ? t('card.gate_text') : me.role === 'guide' ? t('card.text_guide') : t('card.text_tourist')}</p>
      {c ? (
        <>
          <div className="pay-card-visual" dir="ltr">
            <span className="pcv-brand">{c.brand}</span>
            <span className="pcv-num">•••• •••• •••• {c.last4}</span>
            <span className="pcv-foot">
              <span>{c.name}</span>
              <span>{c.expiry}</span>
            </span>
          </div>
          <div className="row">
            <button type="button" className="btn sm outline" onClick={() => setOpen(true)}>{t('card.replace')}</button>
            <button type="button" className="btn sm ghost danger-text" onClick={remove} disabled={busy}>{t('card.remove')}</button>
          </div>
        </>
      ) : (
        <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => setOpen(true)}>
          <Icon name="plus" size={18} /> {t('card.add')}
        </button>
      )}
      <p className="xs muted">{t('card.safety')}</p>
      {open && (
        <Modal title={c ? t('card.replace') : t('card.add')} onClose={() => setOpen(false)}>
          <CardForm value={card} onChange={setCard} allowSaved={false} />
          {err && (
            <div className="note danger" role="alert">
              {err}
            </div>
          )}
          <button type="button" className="btn lg" onClick={save} disabled={busy}>
            {t('card.save')}
          </button>
        </Modal>
      )}
    </section>
  );
}

/** Profile header: cover photo and profile photo, each with its own change button. */
function ProfileHeader() {
  const { t, me, refreshMe, toast, errorText } = useApp();
  const [busy, setBusy] = useState<'' | 'avatar' | 'cover'>('');
  const pick = (kind: 'avatar' | 'cover') => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(kind);
    try {
      const img = kind === 'avatar' ? await resizeImage(file, { max: 320, limit: 190_000, square: true }) : await resizeImage(file, { max: 1280, limit: 440_000 });
      await api('PUT', '/me', { [kind]: img });
      await refreshMe();
      toast(kind === 'avatar' ? t('account.avatar_saved') : t('account.cover_saved'));
    } catch (x: any) {
      toast(x?.message === 'too big' || x instanceof Event ? t('err.photo_invalid') : errorText(x), 'error');
    } finally {
      setBusy('');
    }
  };
  const remove = (kind: 'avatar' | 'cover') => async () => {
    await api('PUT', '/me', { [kind]: null });
    await refreshMe();
  };
  return (
    <section className="profile-head" aria-label={t('account.photos')}>
      <div className="ph-cover" style={me.cover ? { backgroundImage: `url(${me.cover})` } : undefined}>
        <div className="ph-cover-actions" dir="ltr">
          <label className={'ph-chip' + (busy === 'cover' ? ' busy' : '')}>
            <Icon name="image" size={16} /> {me.cover ? t('account.change_cover') : t('account.add_cover')}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={pick('cover')} disabled={!!busy} />
          </label>
          {me.cover && (
            <button type="button" className="ph-chip icon" aria-label={t('account.remove_cover')} onClick={remove('cover')}>
              <Icon name="trash" size={16} />
            </button>
          )}
        </div>
      </div>
      <div className="ph-body">
        <div className="ph-avatar">
          <Avatar user={me} size={92} />
          <label className={'ph-cam' + (busy === 'avatar' ? ' busy' : '')} aria-label={me.avatar ? t('account.change_avatar') : t('account.add_avatar')} title={me.avatar ? t('account.change_avatar') : t('account.add_avatar')}>
            <Icon name="camera" size={16} stroke={2} />
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={pick('avatar')} disabled={!!busy} />
          </label>
        </div>
        <div className="ph-text">
          <h2>{me.name}</h2>
          <div className="muted small">
            <bdi>{me.email}</bdi> · {t('role.' + me.role)}
          </div>
          {me.avatar && (
            <button type="button" className="linkish xs" onClick={remove('avatar')}>
              {t('account.remove_avatar')}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

export function Account() {
  const { me } = useApp();
  if (!me) return null; // the router sends signed-out visitors to sign in
  return <AccountMenu />;
}


export function GuideEditor() {
  const { t, me, meta, refreshMe, toast, errorText } = useApp();
  const fmt = useFmt();
  const g = me?.guide;
  const [f, setF] = useState(() => (g ? { headline: g.headline, headlineAr: g.headlineAr, bio: g.bio, bioAr: g.bioAr, pricePerDay: String(g.pricePerDay), cities: g.cities, languages: g.languages, specialities: g.specialities, places: g.places, photos: g.photos, blockedDates: g.blockedDates } : null));
  const [month, setMonth] = useState(meta?.today?.slice(0, 7));
  const [err, setErr] = useState<string | null>(null);
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
        await api('PUT', '/guide/profile', { photos: f.photos, blockedDates: f.blockedDates });
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
      <PageHead title={t('editor.title_media')} backTo="/profile">
        <Link to={`/guides/${me.id}`} className="btn sm ghost">
          {t('dash.view_public')}
        </Link>
      </PageHead>
      <form className="stack-lg" onSubmit={save} noValidate>
        <fieldset className="card stack">
          <legend>{t('editor.photos')}</legend>
          <p className="small muted">{t('editor.photos_hint')}</p>
          <div className="polaroids" style={{ flexWrap: 'wrap' }}>
            {f.photos.map((ph: any, i: number) => (
              <figure key={i} className="polaroid" style={{ position: 'relative' }}>
                <img src={photoSrc(ph.img)} alt="" />
                <input className="input" style={{ minHeight: 36, fontSize: 13, marginTop: 6, padding: '0 8px' }} placeholder={t('editor.caption')} aria-label={t('editor.caption')} value={ph.caption} onChange={(e) => up({ photos: f.photos.map((x: any, j: number) => (j === i ? { ...x, caption: e.target.value } : x)) })} />
                <button type="button" className="icon-btn" style={{ position: 'absolute', top: 8, insetInlineEnd: 8, background: 'var(--surface)', width: 36, height: 36 }} aria-label={t('editor.remove_photo')} onClick={() => up({ photos: f.photos.filter((_: any, j: number) => j !== i) })}>
                  <Icon name="trash" size={16} />
                </button>
              </figure>
            ))}
          </div>
          {f.photos.length < 12 && (
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
        {g.verification !== 'verified' && g.verification !== 'pending' ? (
          <Link to="/verify" className="btn" style={{ alignSelf: 'flex-start' }}>
            {t('verifyp.open')}
          </Link>
        ) : g.verification === 'verified' ? (
          <p className="row">
            <VerifiedBadge /> {t('verify.status_text.verified')}
          </p>
        ) : (
          <p className="note warn">{t('verify.status_text.pending')}</p>
        )}
      </section>
    </div>
  );
}

/** Guides: subscription that unlocks cash bookings, and the accept-cash switch. */
function CashPayments() {
  const { t, me, refreshMe, errorText, toast } = useApp();
  const fmt = useFmt();
  const res = useLoad(() => api('GET', '/guide/subscription'), []);
  const [open, setOpen] = useState(false);
  const [card, setCard] = useState<CardValue>(emptyCard);
  const [err, setErr] = useState<string | null>(null);
  const { busy, run } = useBusy();
  const s = res.data;
  if (!s) return <div className="skeleton" style={{ height: 150 }} />;
  const toggle = (on: boolean) =>
    run(async () => {
      await api('PUT', '/guide/profile', { acceptsCash: on });
      await refreshMe();
      res.reload();
    }, on ? t('sub.cash_on_toast') : t('sub.cash_off_toast'));
  const subscribe = async () => {
    setErr(null);
    try {
      await api('POST', '/guide/subscription', { card: s.price > 0 ? card : undefined });
      setOpen(false);
      setCard(emptyCard);
      await refreshMe();
      res.reload();
      toast(t('sub.done_toast'));
    } catch (e) {
      setErr(errorText(e));
    }
  };
  return (
    <section className="card stack" aria-labelledby="cash-title">
      <div className="between">
        <strong id="cash-title" className="row" style={{ gap: 8 }}>
          <Icon name="money" size={20} /> {t('sub.title')}
        </strong>
        {s.active ? <span className="pill sky">{t('sub.active')}</span> : <span className="pill">{t('sub.inactive')}</span>}
      </div>
      <p className="small muted">{t('sub.text', { price: fmt.usd(s.price), days: s.days })}</p>
      {s.active ? (
        <>
          <p className="small">{t('sub.until', { date: fmt.dateLong(s.until.slice(0, 10)) })}</p>
          <label className="check">
            <input type="checkbox" checked={!!me.guide.acceptsCash} disabled={busy} onChange={(e) => toggle(e.target.checked)} />
            {t('sub.accept_cash')}
          </label>
          <button type="button" className="btn sm outline" style={{ alignSelf: 'flex-start' }} onClick={() => setOpen(true)}>
            {t('sub.renew', { price: fmt.usd(s.price) })}
          </button>
        </>
      ) : (
        <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => setOpen(true)}>
          {t('sub.subscribe', { price: fmt.usd(s.price) })}
        </button>
      )}
      {open && (
        <Modal title={t('sub.modal_title')} onClose={() => setOpen(false)}>
          <div className="card between">
            <span>{t('sub.period', { days: s.days })}</span>
            <Money usd={s.price} className="bold" />
          </div>
          {s.price > 0 ? <CardForm value={card} onChange={setCard} /> : <p className="note small">{t('sub.free')}</p>}
          {err && (
            <div className="note danger" role="alert">
              {err}
            </div>
          )}
          <button type="button" className="btn lg" onClick={subscribe}>
            {s.price > 0 ? t('sub.pay', { price: fmt.usd(s.price) }) : t('sub.activate')}
          </button>
        </Modal>
      )}
    </section>
  );
}

/** Guides: pay to be featured on the home screen for a while. */
function Promotion() {
  const { t, errorText, toast } = useApp();
  const fmt = useFmt();
  const res = useLoad(() => api('GET', '/guide/promotion'), []);
  const [open, setOpen] = useState(false);
  const [card, setCard] = useState<CardValue>(emptyCard);
  const [err, setErr] = useState<string | null>(null);
  const s = res.data;
  if (!s) return <div className="skeleton" style={{ height: 130 }} />;
  const buy = async () => {
    setErr(null);
    try {
      await api('POST', '/guide/promotion', { card: s.price > 0 ? card : undefined });
      setOpen(false);
      setCard(emptyCard);
      res.reload();
      toast(t('promo.done_toast'));
    } catch (e) {
      setErr(errorText(e));
    }
  };
  return (
    <section className="card stack" aria-labelledby="promo-title">
      <div className="between">
        <strong id="promo-title" className="row" style={{ gap: 8 }}>
          <Icon name="heart" size={20} /> {t('promo.title')}
        </strong>
        {s.active ? <span className="pill gold">{t('promo.active')}</span> : <span className="pill">{t('promo.inactive')}</span>}
      </div>
      <p className="small muted">{t('promo.text', { price: fmt.usd(s.price), days: s.days })}</p>
      {s.active && <p className="small">{t('promo.until', { date: fmt.dateLong(s.until.slice(0, 10)) })}</p>}
      <button type="button" className={'btn' + (s.active ? ' sm outline' : '')} style={{ alignSelf: 'flex-start' }} onClick={() => setOpen(true)}>
        {s.active ? t('promo.extend', { price: fmt.usd(s.price) }) : t('promo.buy', { price: fmt.usd(s.price) })}
      </button>
      {open && (
        <Modal title={t('promo.title')} onClose={() => setOpen(false)}>
          <div className="card between">
            <span>{t('sub.period', { days: s.days })}</span>
            <Money usd={s.price} className="bold" />
          </div>
          {s.price > 0 ? <CardForm value={card} onChange={setCard} /> : <p className="note small">{t('sub.free')}</p>}
          {err && (
            <div className="note danger" role="alert">
              {err}
            </div>
          )}
          <button type="button" className="btn lg" onClick={buy}>
            {s.price > 0 ? t('sub.pay', { price: fmt.usd(s.price) }) : t('sub.activate')}
          </button>
        </Modal>
      )}
    </section>
  );
}

/** Trips (tourist) or tours (guide), shown inside the profile instead of a separate tab. */
function MyTrips({ guide }: { guide: boolean }) {
  const { t } = useApp();
  const fmt = useFmt();
  const res = useLoad(() => api('GET', '/bookings'), []);
  const list: any[] = res.data?.bookings || [];
  const active = list.filter((b) => ['awaiting_guide', 'confirmed', 'disputed'].includes(b.status)).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const past = list.filter((b) => !['awaiting_guide', 'confirmed', 'disputed'].includes(b.status));
  return (
    <section className="stack" aria-labelledby="my-trips">
      <div className="between">
        <h2 id="my-trips">{guide ? t('profile.my_tours') : t('profile.my_trips')}</h2>
        {list.length > 0 && (
          <Link to="/bookings" className="small" style={{ fontWeight: 600 }}>
            {t('profile.see_all', { count: list.length })}
          </Link>
        )}
      </div>
      {!res.data ? (
        <div className="skeleton" style={{ height: 120 }} />
      ) : active.length === 0 ? (
        <div className="card stack" style={{ gap: 8 }}>
          <span className="small muted">{guide ? t('profile.no_tours') : t('profile.no_trips')}</span>
          {!guide && (
            <Link to="/post" className="btn sm" style={{ alignSelf: 'flex-start' }}>
              {t('home.cta_post')}
            </Link>
          )}
          {past.length > 0 && <span className="xs muted">{t('profile.past_n', { count: past.length })}</span>}
        </div>
      ) : (
        <div className="card flush">
          {active.slice(0, 4).map((b) => {
            const other = guide ? b.tourist : b.guide;
            return (
              <Link key={b.id} to={`/bookings/${b.id}`} className="list-item">
                <span className="avatar av-2" style={{ width: 44, height: 44 }} aria-hidden="true">
                  <Icon name="calendar" size={20} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong dir="auto" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'start' }}>{b.title}</strong>
                  <span className="xs muted">
                    {fmt.range(b.startDate, b.endDate)} · {other.name}
                  </span>
                </span>
                <BookingStatus status={b.status} />
              </Link>
            );
          })}
        </div>
      )}
      {!guide && (
        <Link to="/requests" className="card link row">
          <Icon name="list" /> <strong style={{ flex: 1 }}>{t('nav.my_requests')}</strong>
          <Icon name="next" size={18} className="flip" />
        </Link>
      )}
    </section>
  );
}

/* ---------- New guides: set up the profile in three short steps ---------- */

const GUIDE_LIMITS = { languages: 5, specialities: 6, places: 12 }; // same as the server

export function GuideSetup() {
  const { t, me, meta, refreshMe, toast, errorText } = useApp();
  const fmt = useFmt();
  const g = me?.guide;
  const [step, setStep] = useState(0);
  const [tried, setTried] = useState<Record<number, boolean>>({});
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState<string | null>(null);
  const { busy, run } = useBusy();
  const [f, setF] = useState(() => ({
    headline: g?.headline || '',
    headlineAr: g?.headlineAr || '',
    bio: g?.bio || '',
    bioAr: g?.bioAr || '',
    cities: (g?.cities || []) as string[],
    places: (g?.places || []) as number[],
    specialities: (g?.specialities || []) as string[],
    languages: (g?.languages?.length ? g.languages : [{ code: 'ar', level: 'native' }]) as { code: string; level: string }[],
    pricePerDay: g?.pricePerDay ? String(g.pricePerDay) : '40',
  }));
  if (!me || me.role !== 'guide') return null;
  if (!meta) return <Loading />;
  // Editing later opens the same steps with everything already filled in.
  const editing = !!g?.profileComplete;
  // Each change marks its field, so problems show while typing instead of only on Next.
  const up = (p: Partial<typeof f>) => {
    setF((x) => ({ ...x, ...p }));
    setDirty((d) => ({ ...d, ...Object.fromEntries(Object.keys(p).map((k) => [k === 'pricePerDay' ? 'price' : k, true])) }));
  };
  const STEPS = [
    { img: 'arch.jpg', check: () => ({ headline: f.headline.trim().length < 5 ? t('setup.v_headline') : '', bio: f.bio.trim().length < 30 ? t('setup.v_bio', { count: Math.max(0, 30 - f.bio.trim().length) }) : '' }) },
    { img: 'skyline.jpg', check: () => ({ cities: f.cities.length ? '' : t('v.cities') }) },
    { img: 'gate.jpg', check: () => ({ languages: f.languages.length ? '' : t('v.languages'), price: Number(f.pricePerDay) >= 10 && Number(f.pricePerDay) <= 1000 ? '' : t('setup.v_price') }) },
  ];
  const errs: Record<string, string> = STEPS[step].check();
  const show = (k: string) => (tried[step] || dirty[k] ? errs[k] || undefined : undefined);
  const langCodes = f.languages.map((l) => l.code);
  const last = STEPS.length - 1;
  const toTop = () => window.scrollTo({ top: 0 });
  const next = (e?: React.FormEvent) => {
    e?.preventDefault();
    setErr(null);
    if (Object.values(errs).some(Boolean)) {
      setTried((x) => ({ ...x, [step]: true }));
      return;
    }
    if (step < last) {
      setStep(step + 1);
      toTop();
      return;
    }
    run(async () => {
      try {
        await api('PUT', '/guide/profile', { ...f, headline: f.headline.trim(), bio: f.bio.trim(), pricePerDay: Number(f.pricePerDay) });
        await refreshMe();
        toast(editing ? t('common.saved') : t('setup.done_toast'));
        navigate(editing ? '/profile' : '/', { replace: true });
      } catch (x) {
        setErr(errorText(x));
        throw x;
      }
    });
  };
  return (
    <div className="page post-wizard" style={{ maxWidth: 640, margin: '0 auto', width: '100%' }}>
      <div className="wiz-head">
      <div className="wiz-top">
        {(step > 0 || editing) && (
          <button type="button" className="back icon-btn" aria-label={step > 0 ? t('post.prev') : t('common.back')} onClick={() => { if (step === 0) return navigate('/profile'); setStep(step - 1); toTop(); }}>
            <Icon name="back" />
          </button>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="xs muted">{editing ? t('setup.title_edit') : t('setup.title')}</div>
          <div className="small bold">{t('post.step_n', { n: step + 1, total: STEPS.length })}</div>
        </div>
      </div>
      <div className="wiz-progress three" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={step + 1} aria-label={t('post.step_n', { n: step + 1, total: STEPS.length })}>
        {STEPS.map((_, i) => (
          <i key={i} className={i <= step ? 'on' : ''} />
        ))}
      </div>
      </div>
      <div className="wiz-hero" key={step}>
        <HeroBand img={STEPS[step].img} title={t(`setup.s${step + 1}_title`)} text={t(`setup.s${step + 1}_text`)} />
      </div>
      <form className="stack-lg wiz-body" onSubmit={next} noValidate>
        {step === 0 && (
          <div className="stack">
            <Field label={t('field.headline')} hint={show('headline') ? undefined : t('editor.headline_hint')} error={show('headline')}>
              <input className="input" value={f.headline} onChange={(e) => up({ headline: e.target.value })} maxLength={90} />
            </Field>
            <Field label={t('field.headlineAr')}>
              <input className="input" dir="rtl" lang="ar" value={f.headlineAr} onChange={(e) => up({ headlineAr: e.target.value })} maxLength={90} />
            </Field>
            <Field label={t('field.bio')} hint={show('bio') ? undefined : t('editor.bio_hint')} error={show('bio')}>
              <textarea className="textarea" rows={5} value={f.bio} onChange={(e) => up({ bio: e.target.value })} maxLength={1500} />
            </Field>
            <Field label={t('field.bioAr')}>
              <textarea className="textarea" dir="rtl" lang="ar" rows={4} value={f.bioAr} onChange={(e) => up({ bioAr: e.target.value })} maxLength={1500} />
            </Field>
          </div>
        )}
        {step === 1 && (
          <div className="stack-lg">
            <div className="stack" style={{ gap: 6 }}>
              <ToggleGroup label={t('field.cities')} options={meta.cities.map((c: any) => c.slug)} value={f.cities} onChange={(cities) => up({ cities, places: f.places.filter((p) => cities.includes(meta.places.find((x: any) => x.id === p)?.city)) })} render={fmt.city} />
              {show('cities') && <span className="err small">{show('cities')}</span>}
            </div>
            {f.cities.length > 0 && (
              <ToggleGroup
                label={t('field.places')}
                options={meta.places.filter((p: any) => f.cities.includes(p.city)).map((p: any) => String(p.id))}
                value={f.places.map(String)}
                onChange={(v) => up({ places: v.map(Number) })}
                render={(id) => fmt.place(Number(id))}
                max={GUIDE_LIMITS.places}
              />
            )}
            <ToggleGroup max={GUIDE_LIMITS.specialities} label={t('field.specialities')} options={meta.interests} value={f.specialities} onChange={(specialities) => up({ specialities })} render={(i) => t('interest.' + i)} />
          </div>
        )}
        {step === 2 && (
          <div className="stack-lg">
            <div className="stack">
              <span className="label-like">{t('editor.languages')}</span>
              {f.languages.map((l, i) => (
                <div key={l.code} className="row" style={{ flexWrap: 'nowrap' }}>
                  <span style={{ flex: 1 }}>{fmt.language(l.code)}</span>
                  <select className="select" style={{ width: 'auto' }} aria-label={t('editor.level_for', { lang: fmt.language(l.code) })} value={l.level} onChange={(e) => up({ languages: f.languages.map((x, j) => (j === i ? { ...x, level: e.target.value } : x)) })}>
                    {meta.levels.map((lv: string) => (
                      <option key={lv} value={lv}>
                        {t('level.' + lv)}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="icon-btn" aria-label={t('common.remove_x', { name: fmt.language(l.code) })} disabled={f.languages.length === 1} onClick={() => up({ languages: f.languages.filter((_, j) => j !== i) })}>
                    <Icon name="trash" size={18} />
                  </button>
                </div>
              ))}
              <select className="select" value="" aria-label={t('editor.add_language')} disabled={f.languages.length >= GUIDE_LIMITS.languages} onChange={(e) => e.target.value && up({ languages: [...f.languages, { code: e.target.value, level: 'good' }] })}>
                <option value="">{t('editor.add_language')}</option>
                {meta.languages.filter((c: string) => !langCodes.includes(c)).map((c: string) => (
                  <option key={c} value={c}>
                    {fmt.language(c)}
                  </option>
                ))}
              </select>
              {f.languages.length >= GUIDE_LIMITS.languages && <LimitNote max={GUIDE_LIMITS.languages} />}
              {show('languages') && <span className="err small">{show('languages')}</span>}
            </div>
            <Field label={t('field.pricePerDay')} hint={show('price') ? undefined : t('editor.price_hint', { pct: Math.round(meta.feeRate * 100) })} error={show('price')}>
              <div className="price-input">
                <span className="bold">$</span>
                <input inputMode="numeric" value={f.pricePerDay} onChange={(e) => up({ pricePerDay: e.target.value.replace(/\D/g, '').slice(0, 4) })} aria-label={t('field.pricePerDay')} />
                <span className="small muted">{t('common.per_day')}</span>
              </div>
            </Field>
            {!editing && <p className="note small">{t('setup.later_note')}</p>}
          </div>
        )}
        {err && (
          <div className="note danger" role="alert">
            {err}
          </div>
        )}
        <div className="wiz-actions">
          {step > 0 && (
            <button type="button" className="btn lg ghost" onClick={() => { setStep(step - 1); toTop(); }}>
              {t('post.prev')}
            </button>
          )}
          <button className="btn lg" style={{ flex: 1 }} disabled={busy}>
            {step < last ? t('post.next') : editing ? t('setup.save') : t('setup.finish')}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ---------- Guides: verify the account ---------- */

export function VerifyAccount() {
  const { t, me, refreshMe, errorText } = useApp();
  const [docs, setDocs] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const { busy, run } = useBusy();
  if (!me || me.role !== 'guide') return null;
  const g = me.guide;
  const status = g.verification as string;
  const send = () =>
    run(async () => {
      setErr(null);
      try {
        await api('POST', '/guide/verification', { docs });
        await refreshMe();
        window.scrollTo({ top: 0 });
      } catch (x) {
        setErr(errorText(x));
        throw x;
      }
    });
  return (
    <div className="page" style={{ maxWidth: 640, margin: '0 auto', width: '100%' }}>
      <PageHead title={t('verify.title')} backTo="/" />
      <HeroBand img="ishtar.jpg" title={t('verifyp.title')} text={t('verifyp.text')} />
      {status === 'verified' ? (
        <div className="card row" style={{ gap: 10, flexWrap: 'nowrap' }}>
          <VerifiedBadge size={22} /> <span>{t('verify.status_text.verified')}</span>
        </div>
      ) : status === 'pending' ? (
        <div className="note warn verify-wait" role="status">
          <Icon name="clock" size={20} />
          <span>
            <strong>{t('verifyp.sent_title')}</strong>
            <br />
            {t('verify.status_text.pending')}
          </span>
        </div>
      ) : (
        <>
          {status === 'rejected' && <p className="note danger">{t('verify.rejected_note', { note: g.verificationNote })}</p>}
          {!me.guide.profileComplete && (
            <div className="note warn stack" style={{ gap: 8 }}>
              <span>{t('verifyp.finish_first')}</span>
              <Link to="/guide/setup" className="btn sm" style={{ alignSelf: 'flex-start' }}>
                {t('dash.edit_profile')}
              </Link>
            </div>
          )}
          <section className="card stack">
            <h2 style={{ fontSize: 18 }}>{t('verifyp.why')}</h2>
            <ul className="verify-list">
              {['badge', 'first', 'trust'].map((k) => (
                <li key={k}>
                  <span className="qa-ico sm"><Icon name={k === 'badge' ? 'shield' : k === 'first' ? 'search' : 'heart'} size={18} /></span>
                  <span>{t('verifyp.why_' + k)}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="card stack">
            <h2 style={{ fontSize: 18 }}>{t('verifyp.what')}</h2>
            <ul className="verify-list">
              {['id', 'licence'].map((k) => (
                <li key={k}>
                  <span className="qa-ico sm"><Icon name="image" size={18} /></span>
                  <span>{t('verifyp.what_' + k)}</span>
                </li>
              ))}
            </ul>
            <label className="btn outline" style={{ alignSelf: 'flex-start' }}>
              <Icon name="image" size={18} /> {t('verify.choose_files')}
              <input type="file" multiple accept="image/*,application/pdf" className="sr-only" onChange={(e) => setDocs(Array.from(e.target.files || []).slice(0, 4).map((x) => x.name))} />
            </label>
            {docs.length > 0 && (
              <ul className="small" style={{ margin: 0 }}>
                {docs.map((d) => (
                  <li key={d}><bdi>{d}</bdi></li>
                ))}
              </ul>
            )}
          </section>
          {err && (
            <div className="note danger" role="alert">
              {err}
            </div>
          )}
          <button type="button" className="btn lg" disabled={busy || !docs.length || !me.guide.profileComplete} onClick={send}>
            {t('verify.send')}
          </button>
          <p className="xs muted center">{t('verifyp.within_note')}</p>
        </>
      )}
    </div>
  );
}

/** Privacy and terms: how the platform handles your details, payments and bookings. Opened from the profile. */
export function PolicyPage() {
  const { t, meta } = useApp();
  const sections: [string, string[]][] = [
    ['privacy', ['p1', 'p2', 'p3', 'p4', 'p5']],
    ['payments', ['m1', 'm2', 'm3', 'm4']],
    ['bookings', ['b1', 'b2', 'b3', 'b4']],
    ['use', ['u1', 'u2', 'u3']],
  ];
  const vars = { hours: meta.confirmWindowHours, fee: Math.round((meta.feeRate || 0.1) * 100) };
  return (
    <div className="page policy-page" style={{ maxWidth: 720, margin: '0 auto', width: '100%' }}>
      <PageHead title={t('policy.title')} backTo="/profile" />
      <p className="muted" style={{ margin: 0 }}>{t('policy.lede')}</p>
      {sections.map(([key, items]) => (
        <section key={key} className="card stack policy-sec">
          <h2>{t('policy.h_' + key)}</h2>
          <ul>
            {items.map((i) => (
              <li key={i}>{t('policy.' + i, vars)}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
