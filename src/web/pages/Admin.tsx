import React, { useState } from 'react';
import { api } from '../lib/api';
import { useApp, useLoad } from '../lib/app';
import { useFmt } from '../lib/format';
import { Link, navigate } from '../lib/router';
import { coverSrc } from '../assets';
import { resizeImage } from '../lib/image';
import { Avatar, Empty, ErrorState, Field, HeroBand, Icon, LimitNote, Loading, PageHead, useBusy } from '../ui';
import { SubscriptionSettings } from './Home';

function AdminTabs({ active }: { active: string }) {
  const { t } = useApp();
  return (
    <nav className="tabs" aria-label={t('admin.sections')}>
      <Link to="/admin/verify" aria-current={active === 'verify' ? 'page' : undefined}>
        {t('admin.verify_guides')}
      </Link>
      <Link to="/admin/reports" aria-current={active === 'reports' ? 'page' : undefined}>
        {t('admin.reports')}
      </Link>
    </nav>
  );
}

/* ---------- Verify guides: approve is one tap, rejecting asks for a reason ---------- */

export function AdminVerify() {
  const { t } = useApp();
  const fmt = useFmt();
  const res = useLoad(() => api('GET', '/admin/verifications'), []);
  const [rejecting, setRejecting] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const { busy, run } = useBusy();
  if (res.error) return <ErrorState error={res.error} onRetry={res.reload} />;
  if (!res.data) return <Loading />;
  const decide = (g: any, approve: boolean) =>
    run(async () => {
      await api('POST', `/admin/guides/${g.id}/verify`, approve ? { approve: true } : { approve: false, note });
      setRejecting(null);
      setNote('');
      res.reload();
    }, approve ? t('admin.verified_toast', { name: g.name }) : t('admin.rejected_toast'));
  return (
    <div className="page">
      <PageHead title={t('admin.title')} backTo="/" />
      <AdminTabs active="verify" />
      {res.data.guides.length === 0 && <Empty title={t('admin.no_verifications')} />}
      <div className="cards">
        {res.data.guides.map((g: any) => (
          <article key={g.id} className="card stack">
            <div className="row" style={{ gap: 12, flexWrap: 'nowrap' }}>
              <Avatar user={g} size={48} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <Link to={`/guides/${g.id}`} className="bold" style={{ textDecoration: 'none' }}>
                  {g.name}
                </Link>
                <div className="xs muted">
                  {t('admin.applied', { when: fmt.ago(g.requestedAt) })}. {fmt.cities(g.cities)}.
                </div>
              </div>
            </div>
            <dl className="facts small">
              <dt>{t('admin.documents')}</dt>
              <dd>{g.docs.join(', ')}</dd>
              <dt>{t('field.phone')}</dt>
              <dd className="ltr">
                {g.phone || '—'} {g.phoneVerified ? `(${t('badge.phone_verified')})` : ''}
              </dd>
              <dt>{t('field.email')}</dt>
              <dd>{g.email}</dd>
              <dt>{t('guide.speaks')}</dt>
              <dd>{fmt.list(g.languages.map((l: any) => fmt.language(l.code)))}</dd>
            </dl>
            {g.bio && <p className="quote small"><bdi>{g.bio}</bdi></p>}
            {rejecting === g.id ? (
              <div className="stack" style={{ gap: 10 }}>
                <Field label={t('admin.reject_note')}>
                  <input className="input" autoFocus placeholder={t('admin.reject_ph')} value={note} onChange={(e) => setNote(e.target.value)} />
                </Field>
                <div className="row" style={{ flexWrap: 'nowrap' }}>
                  <button type="button" className="btn ghost" style={{ flex: 1 }} disabled={busy} onClick={() => setRejecting(null)}>
                    {t('common.cancel')}
                  </button>
                  <button type="button" className="btn danger" style={{ flex: 1.4 }} disabled={busy} onClick={() => decide(g, false)}>
                    {t('admin.reject_send')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <button
                  type="button"
                  className="btn outline"
                  style={{ flex: 1 }}
                  disabled={busy}
                  onClick={() => {
                    setNote('');
                    setRejecting(g.id);
                  }}
                >
                  {t('admin.reject')}
                </button>
                <button type="button" className="btn" style={{ flex: 1.4 }} disabled={busy} onClick={() => decide(g, true)}>
                  {t('admin.verify')}
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

/* ---------- Reports: read the case, pick one decision, resolve ---------- */

function ReportCard({ r, onDone }: { r: any; onDone: () => void }) {
  const { t } = useApp();
  const fmt = useFmt();
  const [action, setAction] = useState('');
  const [note, setNote] = useState('');
  const [suspend, setSuspend] = useState(false);
  const { busy, run } = useBusy();
  const held = r.booking.money.held;
  const options = [
    { key: 'refund', text: t('admin.refund_text', { amount: fmt.usd(held) }) },
    { key: 'release', text: t('admin.release_text', { amount: fmt.usd(held) }) },
    { key: 'dismiss', text: t('admin.dismiss_text') },
  ];
  const resolve = () => {
    if (!action) return;
    run(async () => {
      await api('POST', `/admin/reports/${r.id}/resolve`, { action, note, suspend });
      onDone();
    }, t('admin.resolved_toast'));
  };
  return (
    <article className="card stack">
      <div className="between" style={{ alignItems: 'flex-start' }}>
        <div className="stack" style={{ gap: 2 }}>
          <strong>{t('report.reason.' + r.reason)}</strong>
          <span className="small muted">{t('admin.vs', { reporter: `${r.reporter.name} (${t('role.' + r.reporter.role)})`, against: `${r.against.name} (${t('role.' + r.against.role)})` })}</span>
        </div>
        <span className="xs muted" style={{ flex: 'none' }}>
          {fmt.ago(r.createdAt)}
        </span>
      </div>
      <div className="held-box">
        <span className="small muted">
          <bdi>{r.booking.title}</bdi> · {fmt.range(r.booking.startDate, r.booking.endDate)}
        </span>
        <span className="between">
          <span className="small">{t('admin.held_on_booking')}</span>
          <strong style={{ fontSize: 20 }}>{fmt.usd(held)}</strong>
        </span>
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <span className="label-sm">{t('admin.what_happened')}</span>
        <p className="quote" style={{ margin: 0 }}><bdi>{r.details}</bdi></p>
      </div>
      {r.messages.length > 0 && (
        <details>
          <summary className="small" style={{ cursor: 'pointer', fontWeight: 500 }}>
            {t('admin.read_chat', { count: r.messages.length })}
          </summary>
          <div className="stack" style={{ gap: 6, marginTop: 8 }}>
            {r.messages.map((m: any) => (
              <div key={m.id} className="small">
                <strong>{m.senderId === r.threadParticipants?.tourist ? t('role.tourist') : t('role.guide')}:</strong> <bdi>{m.body}</bdi> <span className="xs muted">{fmt.ago(m.createdAt)}</span>
              </div>
            ))}
          </div>
        </details>
      )}
      {r.status === 'open' ? (
        <>
          <div className="divider" />
          <fieldset className="decision">
            <legend className="label-sm">{t('admin.decision')}</legend>
            {options.map((o) => (
              <label key={o.key} className={'decision-opt' + (action === o.key ? ' on' : '')}>
                <input type="radio" name={'decision-' + r.id} value={o.key} checked={action === o.key} onChange={() => setAction(o.key)} />
                <span>
                  <strong>{t('admin.' + o.key)}</strong>
                  <span className="xs muted" style={{ display: 'block' }}>
                    {o.text}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          <Field label={t('admin.note')}>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <label className="check small">
            <input type="checkbox" checked={suspend} onChange={(e) => setSuspend(e.target.checked)} />
            {t('admin.also_suspend', { name: r.against.name })}
          </label>
          <button type="button" className="btn block" disabled={busy || !action} onClick={resolve}>
            {action ? t('admin.resolve') : t('admin.choose_decision')}
          </button>
        </>
      ) : (
        <p className="note small">
          {t('admin.resolution', { action: t('report.resolution.' + r.resolution) })}
          {r.adminNote && ` ${r.adminNote}`}
        </p>
      )}
    </article>
  );
}

export function AdminReports() {
  const { t } = useApp();
  const [status, setStatus] = useState('open');
  const res = useLoad(() => api('GET', '/admin/reports', undefined, { status }), [status]);
  return (
    <div className="page">
      <PageHead title={t('admin.title')} backTo="/" />
      <AdminTabs active="reports" />
      <div className="seg" role="tablist" style={{ gridTemplateColumns: '1fr 1fr' }}>
        {['open', 'resolved'].map((s) => (
          <button key={s} type="button" role="tab" aria-selected={status === s} aria-pressed={status === s} onClick={() => setStatus(s)}>
            {t('admin.' + s)}
          </button>
        ))}
      </div>
      {res.error ? (
        <ErrorState error={res.error} onRetry={res.reload} />
      ) : !res.data ? (
        <Loading />
      ) : res.data.reports.length === 0 ? (
        <Empty title={t('admin.no_reports')} />
      ) : (
        <div className="cards">
          {res.data.reports.map((r: any) => (
            <ReportCard key={r.id} r={r} onDone={res.reload} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Users: search, filter, confirm before suspending ---------- */

export function AdminUsers() {
  const { t, ask } = useApp();
  const fmt = useFmt();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const res = useLoad(() => api('GET', '/admin/users', undefined, { q }), [q]);
  const { busy, run } = useBusy();
  const filters = [
    { key: 'all', label: t('admin.filter_all') },
    { key: 'tourist', label: t('role.tourist') },
    { key: 'guide', label: t('role.guide') },
    { key: 'suspended', label: t('badge.suspended') },
  ];
  const users = (res.data?.users || []).filter((u: any) => (filter === 'all' ? true : filter === 'suspended' ? u.status === 'suspended' : u.role === filter));
  const toggle = async (u: any) => {
    const suspending = u.status !== 'suspended';
    if (suspending && !(await ask(t('admin.suspend_confirm', { name: u.name }), t('admin.suspend')))) return;
    run(async () => {
      await api('POST', `/admin/users/${u.id}/status`, { status: suspending ? 'suspended' : 'active' });
      res.reload();
    });
  };
  return (
    <div className="page">
      <PageHead title={t('admin.users')} />
      <input className="input" type="search" placeholder={t('admin.search_users')} aria-label={t('admin.search_users')} value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="row" style={{ gap: 8 }}>
        {filters.map((f) => (
          <button key={f.key} type="button" className="toggle-chip" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>
      {!res.data ? (
        <div className="skeleton" style={{ height: 200 }} />
      ) : users.length === 0 ? (
        <Empty title={t('admin.no_users')} />
      ) : (
        <div className="card flush">
          {users.map((u: any) => (
            <div key={u.id} className="list-item">
              <Link to={u.role === 'guide' ? `/guides/${u.id}` : `/users/${u.id}`} className="user-link" aria-disabled={u.role === 'admin' ? true : undefined} onClick={(e) => u.role === 'admin' && e.preventDefault()}>
              <Avatar user={u} size={40} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row" style={{ gap: 6 }}>
                  <strong>{u.name}</strong>
                  <span className="pill">{t('role.' + u.role)}</span>
                  {u.verification && u.verification !== 'none' && <span className="pill sky">{t('verify.short.' + u.verification)}</span>}
                  {u.status === 'suspended' && <span className="pill danger">{t('badge.suspended')}</span>}
                </div>
                <div className="xs muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {u.email} · {u.country} · {fmt.date(u.memberSince, { month: 'short', year: 'numeric' })}
                </div>
              </div>
              </Link>
              {u.role !== 'admin' && (
                <button type="button" className={'btn sm ' + (u.status === 'suspended' ? 'outline' : 'ghost danger-text')} disabled={busy} onClick={() => toggle(u)}>
                  {u.status === 'suspended' ? t('admin.reactivate') : t('admin.suspend')}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- City statistics ---------- */

/** Visitors and activity per governorate, as bars. `limit` shows only the top cities (admin home). */
export function CityStats({ limit, detailed = false }: { limit?: number; detailed?: boolean }) {
  const { t } = useApp();
  const fmt = useFmt();
  const res = useLoad(() => api('GET', '/admin/stats'), []);
  if (res.error) return <ErrorState error={res.error} onRetry={res.reload} />;
  if (!res.data) return <div className="skeleton" style={{ height: 220 }} />;
  const cities: any[] = limit ? res.data.cities.slice(0, limit) : res.data.cities;
  const max = Math.max(1, ...res.data.cities.map((c: any) => c.visitors));
  return (
    <div className="card flush city-stats">
      {cities.map((c, i) => (
        <div key={c.slug} className="cs-row">
          <div className="between" style={{ gap: 8 }}>
            <strong className="row" style={{ gap: 8 }}>
              <span className={'cs-rank' + (i === 0 ? ' top' : '')}>{fmt.num(i + 1)}</span>
              {fmt.city(c.slug)}
            </strong>
            <span className="small">
              <strong>{fmt.num(c.visitors)}</strong> <span className="muted">{t('stats.visitors_short')}</span>
            </span>
          </div>
          <div className="cs-bar" aria-hidden="true">
            <i style={{ width: `${Math.max(3, (c.visitors / max) * 100)}%` }} className={i === 0 ? 'top' : ''} />
          </div>
          <div className="cs-meta xs muted">
            <span>{t('stats.trips_n', { count: c.trips })}</span>
            <span>{t('stats.guides_n', { count: c.guides })}</span>
            <span>{t('stats.requests_n', { count: c.requests })}</span>
            {detailed && c.avgPrice !== null && <span>{t('stats.avg_price', { amount: fmt.usd(c.avgPrice) })}</span>}
            {detailed && <span>{t('stats.revenue', { amount: fmt.usd(c.revenue) })}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

export function AdminStats() {
  const { t } = useApp();
  const fmt = useFmt();
  const res = useLoad(() => api('GET', '/admin/stats'), []);
  if (res.error) return <ErrorState error={res.error} onRetry={res.reload} />;
  if (!res.data) return <Loading />;
  const x = res.data.totals;
  const tiles = [
    { label: t('stats.visitors'), value: fmt.num(x.visitors), icon: 'users', tone: 'sky' },
    { label: t('stats.trips'), value: fmt.num(x.trips), icon: 'calendar', tone: 'teal' },
    { label: t('stats.completed'), value: fmt.num(x.completed), icon: 'check', tone: 'green' },
    { label: t('stats.revenue_total'), value: fmt.usd(x.revenue), icon: 'money', tone: 'navy' },
    { label: t('stats.avg_group'), value: fmt.num(x.avgGroup), icon: 'user', tone: 'gold' },
    { label: t('stats.avg_days'), value: fmt.num(x.avgTripDays), icon: 'clock', tone: 'rose' },
  ];
  const langMax = Math.max(1, ...res.data.languages.map((l: any) => l.count));
  return (
    <div className="page">
      <PageHead title={t('stats.title')} />
      <p className="muted small" style={{ marginTop: -12 }}>{t('stats.lede')}</p>
      <div className="stat-tiles">
        {tiles.map((s) => (
          <div key={s.label} className={'stat-tile ' + s.tone}>
            <span className="st-ico"><Icon name={s.icon} size={20} /></span>
            <strong>{s.value}</strong>
            <span>{s.label}</span>
          </div>
        ))}
      </div>
      <section className="stack" style={{ gap: 10 }}>
        <h2 style={{ fontSize: 19 }}>{t('stats.by_city')}</h2>
        <CityStats detailed />
      </section>
      <section className="stack" style={{ gap: 10 }}>
        <h2 style={{ fontSize: 19 }}>{t('stats.languages')}</h2>
        <div className="card stack" style={{ gap: 10 }}>
          {res.data.languages.map((l: any) => (
            <div key={l.code} className="stack" style={{ gap: 4 }}>
              <div className="between small">
                <span>{fmt.language(l.code)}</span>
                <strong>{fmt.num(l.count)}</strong>
              </div>
              <div className="cs-bar" aria-hidden="true"><i style={{ width: `${(l.count / langMax) * 100}%` }} className="gold" /></div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ---------- Prices: guide subscription and featured guides ---------- */

export function AdminPricing() {
  const { t } = useApp();
  const d = useLoad(() => api('GET', '/dashboard'), []);
  if (d.error) return <ErrorState error={d.error} onRetry={d.reload} />;
  if (!d.data) return <Loading />;
  const x = d.data;
  return (
    <div className="page" style={{ maxWidth: 720, margin: '0 auto', width: '100%' }}>
      <PageHead title={t('admin.pricing')} backTo="/" />
      <SubscriptionSettings price={x.subscriptionPrice} days={x.subscriptionDays} active={x.activeSubscriptions} onSaved={d.reload} />
      <SubscriptionSettings promo price={x.promotionPrice} days={x.promotionDays} active={x.activePromotions} onSaved={d.reload} />
      <RateSettings rate={x.iqdPerUsd} onSaved={d.reload} />
    </div>
  );
}

/** The dollar to dinar rate shown next to every USD price in the app. */
function RateSettings({ rate, onSaved }: { rate: number; onSaved(): void }) {
  const { t, refreshMeta, errorText } = useApp();
  const fmt = useFmt();
  const [v, setV] = useState(String(rate));
  const [msg, setMsg] = useState<string | null>(null);
  const { busy, run } = useBusy();
  const n = Number(v);
  const err = v === '' ? t('admin.rate_required') : n < 100 || n > 100000 ? t('admin.rate_range') : null;
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (err) return;
    run(async () => {
      try {
        await api('PUT', '/admin/settings', { iqdPerUsd: n });
        await refreshMeta?.();
        setMsg(t('common.saved'));
        onSaved();
      } catch (x) {
        setMsg(errorText(x));
      }
    });
  };
  return (
    <form className="card stack" onSubmit={save} aria-labelledby="rate-title">
      <h2 id="rate-title" style={{ fontSize: 20 }}>{t('admin.rate_title')}</h2>
      <p className="small muted">{t('admin.rate_text')}</p>
      <Field label={t('admin.rate_label')} error={err}>
        <input className="input ltr" inputMode="numeric" value={v} onChange={(e) => { setV(e.target.value.replace(/\D/g, '').slice(0, 6)); setMsg(null); }} />
      </Field>
      {!err && <p className="small muted">{t('admin.rate_example', { usd: fmt.usd(100), iqd: (100 * n).toLocaleString('en-US') })}</p>}
      <div className="row">
        <button className="btn" disabled={busy || !!err}>{t('common.save')}</button>
        {msg && <span className="small muted" role="status">{msg}</span>}
      </div>
    </form>
  );
}

/* ---------- Governorates: the admin adds governorates, their heritage places and the photos tourists pick from ---------- */

const CITY_LIMITS = { places: 30, covers: 12 };

export function AdminCities() {
  const { t, meta } = useApp();
  const fmt = useFmt();
  const res = useLoad(() => api('GET', '/admin/cities'), []);
  return (
    <div className="page">
      <PageHead title={t('city.title')} />
      <p className="muted small" style={{ margin: 0 }}>{t('city.lede')}</p>
      <Link to="/admin/cities/new" className="btn lg block">
        <Icon name="plus" size={20} /> {t('city.add')}
      </Link>
      {res.loading ? (
        <Loading />
      ) : res.error ? (
        <ErrorState error={res.error} onRetry={res.reload} />
      ) : (
        <div className="stack city-list">
          {res.data.map((c: any) => (
            <Link key={c.slug} to={`/admin/cities/${c.slug}`} className="card link city-row">
              {c.covers[0] ? <img src={coverSrc(c.covers[0], meta)} alt="" /> : <span className="city-noimg"><Icon name="image" size={22} /></span>}
              <span className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
                <strong>{fmt.city(c.slug)}</strong>
                <span className="xs muted">
                  {t('city.places_n', { count: c.places.length })} · {t('city.photos_n', { count: c.covers.length })}
                </span>
                {!c.covers.length && <span className="xs city-warn">{t('city.no_photos')}</span>}
              </span>
              <Icon name="edit" size={18} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

type PlaceRow = { id?: number; name: string; nameAr: string; kind: string };

/** Three steps, like posting a trip: the name, the heritage places, then the photos. Also used to edit. */
export function CityWizard({ slug }: { slug?: string }) {
  const { t, meta, refreshMeta, toast, errorText } = useApp();
  const existing = useLoad(() => (slug ? api('GET', `/admin/cities/${slug}`) : Promise.resolve(null)), [slug]);
  const [f, setF] = useState<{ name: string; nameAr: string; places: PlaceRow[]; covers: string[] } | null>(slug ? null : { name: '', nameAr: '', places: [{ name: '', nameAr: '', kind: 'heritage' }], covers: [] });
  const [step, setStep] = useState(0);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const { busy, run } = useBusy();
  React.useEffect(() => {
    const c = existing.data;
    if (c) setF({ name: c.name, nameAr: c.nameAr, places: c.places.map((p: any) => ({ id: p.id, name: p.name, nameAr: p.nameAr, kind: p.kind })), covers: [...c.covers] });
  }, [existing.data]);
  if (slug && existing.loading) return <Loading />;
  if (slug && existing.error) return <ErrorState error={existing.error} onRetry={existing.reload} />;
  if (!f) return <Loading />;

  const up = (patch: Partial<typeof f>) => setF({ ...f, ...patch });
  const setPlace = (i: number, patch: Partial<PlaceRow>) => up({ places: f.places.map((p, n) => (n === i ? { ...p, ...patch } : p)) });
  const kinds: string[] = meta.placeKinds || ['archaeological', 'religious', 'heritage', 'nature', 'market'];

  // Live checks, shown as soon as a field is touched.
  const errors: Record<string, string> = {};
  if (f.name.trim().length < 2) errors.name = t('city.v_name');
  if (f.nameAr.trim().length < 2) errors.nameAr = t('city.v_name_ar');
  const others = meta.cities.filter((c: any) => c.slug !== slug);
  if (!errors.name && others.some((c: any) => c.name.toLowerCase() === f.name.trim().toLowerCase())) errors.name = t('err.city_exists');
  if (!errors.nameAr && others.some((c: any) => c.nameAr === f.nameAr.trim())) errors.nameAr = t('err.city_exists');
  f.places.forEach((p, i) => {
    if (p.name.trim().length < 2) errors['p' + i + 'n'] = t('city.v_place');
    if (p.nameAr.trim().length < 2) errors['p' + i + 'a'] = t('city.v_place_ar');
  });
  if (!f.places.length) errors.places = t('city.v_places');
  if (!f.covers.length) errors.covers = t('city.v_photos');
  const show = (k: string) => (touched[k] || touched.all ? errors[k] : undefined);
  const touch = (k: string) => setTouched((x) => (x[k] ? x : { ...x, [k]: true }));

  const STEPS = [
    { key: 'name', img: 'ziggurat.jpg', fields: ['name', 'nameAr'] },
    { key: 'places', img: 'babylon.jpg', fields: Object.keys(errors).filter((k) => k === 'places' || /^p\d+[na]$/.test(k)) },
    { key: 'photos', img: 'malwiya.jpg', fields: ['covers'] },
  ];
  const last = STEPS.length - 1;
  const cur = STEPS[step];
  const toTop = () => document.querySelector('.post-wizard')?.scrollIntoView({ block: 'start' });
  const goBack = () => {
    if (step === 0) return navigate('/admin/cities');
    setStep(step - 1);
    toTop();
  };
  const fullPlaces = f.places.length >= CITY_LIMITS.places;
  const fullPhotos = f.covers.length >= CITY_LIMITS.covers;

  const addPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files || [])].slice(0, CITY_LIMITS.covers - f.covers.length);
    e.target.value = '';
    const out: string[] = [];
    for (const file of files) {
      try {
        out.push(await resizeImage(file, { max: 1200 }));
      } catch {
        toast(t('err.photo_invalid'), 'error');
      }
    }
    if (out.length) {
      touch('covers');
      setF((x) => (x ? { ...x, covers: [...x.covers, ...out].slice(0, CITY_LIMITS.covers) } : x));
    }
  };
  const src = (c: string) => (c.startsWith('data:') ? c : coverSrc(c, meta));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const bad = cur.fields.find((k) => errors[k]);
    if (bad) {
      setTouched((x) => ({ ...x, ...Object.fromEntries(cur.fields.map((k) => [k, true])) }));
      document.getElementById('cf-' + bad)?.focus();
      return;
    }
    if (step < last) {
      setStep(step + 1);
      toTop();
      return;
    }
    run(async () => {
      try {
        const body = { name: f.name.trim(), nameAr: f.nameAr.trim(), places: f.places.map((p) => ({ ...p, name: p.name.trim(), nameAr: p.nameAr.trim() })), covers: f.covers };
        await api(slug ? 'PUT' : 'POST', slug ? `/admin/cities/${slug}` : '/admin/cities', body);
        await refreshMeta();
        toast(slug ? t('city.saved') : t('city.added', { name: body.nameAr || body.name }));
        navigate('/admin/cities', { replace: true });
      } catch (x) {
        setError(errorText(x));
        throw x;
      }
    });
  };

  return (
    <div className="page post-wizard city-wizard" style={{ maxWidth: 640, margin: '0 auto', width: '100%' }}>
      <div className="wiz-head">
        <div className="wiz-top">
          <button type="button" className="back icon-btn" aria-label={step === 0 ? t('common.back') : t('post.prev')} onClick={goBack}>
            <Icon name="back" />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="xs muted">{slug ? t('city.edit') : t('city.add')}</div>
            <div className="small bold">{t('post.step_n', { n: step + 1, total: STEPS.length })}</div>
          </div>
        </div>
        <div className="wiz-progress" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={step + 1} aria-label={t('post.step_n', { n: step + 1, total: STEPS.length })}>
          {STEPS.map((st, i) => (
            <i key={st.key} className={i <= step ? 'on' : ''} />
          ))}
        </div>
      </div>
      <div className="wiz-hero" key={cur.key}>
        <HeroBand img={cur.img} title={t(`city.s${step + 1}_title`)} text={t(`city.s${step + 1}_text`)} />
      </div>

      <form onSubmit={submit} className="stack-lg wiz-body" noValidate>
        {step === 0 && (
          <div className="stack">
            <Field label={t('city.name_ar')} error={show('nameAr')}>
              <input id="cf-nameAr" className="input" dir="rtl" value={f.nameAr} maxLength={40} placeholder="مثال: ذي قار" onBlur={() => touch('nameAr')} onChange={(e) => up({ nameAr: e.target.value })} />
            </Field>
            <Field label={t('city.name_en')} error={show('name')}>
              <input id="cf-name" className="input" dir="ltr" value={f.name} maxLength={40} placeholder="e.g. Dhi Qar" onBlur={() => touch('name')} onChange={(e) => up({ name: e.target.value })} />
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="stack">
            {f.places.map((p, i) => (
              <fieldset key={i} className="card stack place-row">
                <legend className="small bold">{t('city.place_n', { n: i + 1 })}</legend>
                <Field label={t('city.place_ar')} error={show('p' + i + 'a')}>
                  <input id={`cf-p${i}a`} className="input" dir="rtl" value={p.nameAr} maxLength={80} onBlur={() => touch('p' + i + 'a')} onChange={(e) => setPlace(i, { nameAr: e.target.value })} />
                </Field>
                <Field label={t('city.place_en')} error={show('p' + i + 'n')}>
                  <input id={`cf-p${i}n`} className="input" dir="ltr" value={p.name} maxLength={80} onBlur={() => touch('p' + i + 'n')} onChange={(e) => setPlace(i, { name: e.target.value })} />
                </Field>
                <div className="row" style={{ gap: 10, alignItems: 'flex-end', flexWrap: 'nowrap' }}>
                  <div style={{ flex: 1 }}>
                    <Field label={t('city.kind')}>
                      <select className="input" value={p.kind} onChange={(e) => setPlace(i, { kind: e.target.value })}>
                        {kinds.map((k) => (
                          <option key={k} value={k}>
                            {t('kind.' + k)}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  {f.places.length > 1 && (
                    <button type="button" className="icon-btn danger-ghost" aria-label={t('city.remove_place', { n: i + 1 })} onClick={() => up({ places: f.places.filter((_, n) => n !== i) })}>
                      <Icon name="trash" size={20} />
                    </button>
                  )}
                </div>
              </fieldset>
            ))}
            {show('places') && <span className="err small">{show('places')}</span>}
            {fullPlaces ? (
              <LimitNote max={CITY_LIMITS.places} />
            ) : (
              <button type="button" className="btn outline block" onClick={() => up({ places: [...f.places, { name: '', nameAr: '', kind: 'heritage' }] })}>
                <Icon name="plus" size={18} /> {t('city.add_place')}
              </button>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="stack">
            <p className="small muted" style={{ margin: 0 }}>{t('city.photos_hint')}</p>
            <div className="city-photos" id="cf-covers" tabIndex={-1}>
              {f.covers.map((c, i) => (
                <div key={c.slice(-40) + i} className="city-photo">
                  <img src={src(c)} alt={t('post.cover_n', { n: i + 1 })} />
                  {i === 0 && <span className="pill city-first">{t('city.first')}</span>}
                  <button type="button" className="city-photo-x" aria-label={t('city.remove_photo', { n: i + 1 })} onClick={() => up({ covers: f.covers.filter((_, n) => n !== i) })}>
                    <Icon name="close" size={16} stroke={2.6} />
                  </button>
                </div>
              ))}
              {!fullPhotos && (
                <label className="city-photo add">
                  <Icon name="camera" size={26} />
                  <span className="xs bold">{t('city.add_photos')}</span>
                  <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={addPhotos} />
                </label>
              )}
            </div>
            {fullPhotos && <LimitNote max={CITY_LIMITS.covers} />}
            {show('covers') && <span className="err small">{show('covers')}</span>}
            <div className="card wiz-summary stack" style={{ gap: 6 }}>
              <strong>{t('post.summary')}</strong>
              <span className="bold">
                <bdi>{f.nameAr}</bdi> · <bdi>{f.name}</bdi>
              </span>
              <span className="small muted">{t('city.places_n', { count: f.places.length })} · {t('city.photos_n', { count: f.covers.length })}</span>
            </div>
          </div>
        )}

        {error && (
          <div className="note danger" role="alert">
            {error}
          </div>
        )}
        <div className="wiz-actions">
          {step > 0 && (
            <button type="button" className="btn lg ghost" onClick={goBack}>
              {t('post.prev')}
            </button>
          )}
          <button type="submit" className="btn lg" disabled={busy} style={{ flex: 1 }}>
            {step < last ? t('post.next') : slug ? t('city.save') : t('city.publish')}
          </button>
        </div>
      </form>
    </div>
  );
}
