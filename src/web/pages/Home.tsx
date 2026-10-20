import React from 'react';
import { api } from '../lib/api';
import { useApp, useLoad } from '../lib/app';
import { useFmt } from '../lib/format';
import { Link } from '../lib/router';
import { asset } from '../assets';
import { BookingStatus, GuideCard, Icon, Loading, Money, RequestFacts, RequestStatus } from '../ui';

function Collage() {
  const { t, lang } = useApp();
  const rtl = lang === 'ar';
  return (
    <section className="collage" aria-label={t('home.pictures')}>
      <img className="shot" src={asset('arch.jpg')} alt={t('home.alt_arch')} />
      <svg className="route" viewBox="0 0 390 300" preserveAspectRatio="none" aria-hidden="true">
        <path d={rtl ? 'M400 270 C 310 250, 270 170, 180 140 S 90 70, 90 52' : 'M-10 270 C 80 250, 120 170, 210 140 S 300 70, 300 52'} fill="none" stroke="#FFFFFF" strokeOpacity="0.75" strokeWidth="2" strokeDasharray="2 7" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <img className="mark" src={asset('tg-mark-white.svg')} alt="" />
      <span className="cap">{t('home.alt_arch')}</span>
    </section>
  );
}

export function GuestHome() {
  const { t, meta, me } = useApp();
  const fmt = useFmt();
  const top = useLoad(() => api('GET', '/guides', undefined, { sort: 'best' }), []);
  return (
    <div>
      <section className="hero">
        <div className="stack" style={{ gap: 14 }}>
          <h1>{t('home.title')}</h1>
          <p className="lede">{t('home.lede')}</p>
          <div className="stack" style={{ gap: 10, maxWidth: 420, marginTop: 6 }}>
            <Link to="/post" className="btn lg">
              {t('home.cta_post')}
            </Link>
            <Link to="/guides" className="btn lg outline">
              {t('home.cta_browse')}
            </Link>
            <p className="small muted center">{t('home.cta_note')}</p>
          </div>
        </div>
        <Collage />
      </section>

      <div className="page" style={{ paddingTop: 8 }}>
        <section className="stack">
          <h2>{t('home.where')}</h2>
          <div className="chips">
            {(meta?.cities || []).map((c: any) => (
              <Link key={c.slug} to={`/guides?city=${c.slug}`} className="toggle-chip" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none', fontSize: 15 }}>
                {fmt.city(c.slug)}
              </Link>
            ))}
          </div>
        </section>

        <section className="stack">
          <h2>{t('home.how')}</h2>
          <ol className="steps-list">
            {[1, 2, 3].map((n) => (
              <li key={n}>
                <span className="step-n">{fmt.num(n)}</span>
                <div>
                  <strong>{t(`home.step${n}`)}</strong>
                  <p className="muted small" style={{ marginTop: 2 }}>
                    {t(`home.step${n}_text`)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="stack">
          <div className="between">
            <h2>{t('home.top_guides')}</h2>
            <Link to="/guides" className="small" style={{ fontWeight: 500 }}>
              {t('common.see_all')}
            </Link>
          </div>
          <div className="cards three">
            {top.data ? top.data.guides.slice(0, 3).map((g: any) => <GuideCard key={g.id} g={g} compact />) : <div className="skeleton" style={{ height: 120 }} />}
          </div>
        </section>

        {!me && (
          <section className="join-band">
            <img src={asset('skyline.jpg')} alt="" />
            <div className="over">
              <p className="mark-text">{t('home.join_title')}</p>
              <Link to="/register?role=guide" className="btn gold sm">
                {t('home.join_cta')}
              </Link>
            </div>
          </section>
        )}
        <p className="xs faint center">{t('footer.independent')}</p>
      </div>
    </div>
  );
}

export function TouristHome() {
  const { t, me } = useApp();
  const fmt = useFmt();
  const d = useLoad(() => api('GET', '/dashboard'), []);
  if (!d.data) return <Loading />;
  const { requests, bookings, toReview, releaseAsks } = d.data;
  const first = me.name.split(' ')[0];
  return (
    <div className="page">
      <div className="stack" style={{ gap: 6 }}>
        <h1 style={{ fontWeight: 900, fontSize: 34 }}>{t('dash.hello', { name: first })}</h1>
        <p className="muted">{t('dash.tourist_lede')}</p>
      </div>

      {releaseAsks.map((a: any) => (
        <Link key={a.milestoneId} to={`/bookings/${a.bookingId}`} className="card attention link stack" style={{ gap: 6 }}>
          <strong>{t('dash.release_ask_title')}</strong>
          <span className="small">{t('dash.release_ask', { day: a.day, title: a.title, amount: fmt.usd(a.amount) })}</span>
        </Link>
      ))}
      {toReview.map((b: any) => (
        <Link key={b.id} to={`/bookings/${b.id}`} className="card link stack" style={{ gap: 6 }}>
          <strong>{t('dash.review_title', { name: b.guide.name })}</strong>
          <span className="small muted">{b.title}</span>
        </Link>
      ))}

      <div className="split">
        <div className="stack-lg">
          <section className="stack">
            <div className="between">
              <h2>{t('dash.my_requests')}</h2>
              <Link to="/requests" className="small" style={{ fontWeight: 500 }}>
                {t('common.see_all')}
              </Link>
            </div>
            {requests.length === 0 && (
              <div className="card stack">
                <p className="muted">{t('dash.no_requests')}</p>
                <Link to="/post" className="btn">
                  {t('home.cta_post')}
                </Link>
              </div>
            )}
            {requests.map((r: any) => (
              <Link key={r.id} to={`/requests/${r.id}`} className="card link stack" style={{ gap: 10 }}>
                <div className="between">
                  <RequestStatus status={r.status} />
                  <span className="xs muted">{fmt.ago(r.createdAt)}</span>
                </div>
                <strong style={{ fontSize: 17 }}>{r.title}</strong>
                <RequestFacts r={r} />
                <div className="between small">
                  <span>
                    <strong>{t('request.offers_n', { count: r.offersCount })}</strong>
                    {r.avgOffer !== null && <span className="muted"> · {t('request.avg', { amount: fmt.usd(r.avgOffer) })}</span>}
                  </span>
                  <span className="bold">{t('request.view_offers')}</span>
                </div>
              </Link>
            ))}
          </section>
        </div>
        <aside className="stack-lg">
          <section className="stack">
            <h2>{t('dash.upcoming')}</h2>
            {bookings.length === 0 && <p className="muted small">{t('dash.no_trips')}</p>}
            {bookings.map((b: any) => (
              <Link key={b.id} to={`/bookings/${b.id}`} className="card link row" style={{ gap: 12, flexWrap: 'nowrap' }}>
                <div style={{ flex: 'none', width: 54, textAlign: 'center', padding: '6px 0', borderRadius: 10, background: 'var(--sky-soft)' }}>
                  <div className="xs">{fmt.date(b.startDate, { month: 'short' })}</div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{fmt.date(b.startDate, { day: 'numeric' })}</div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }} className="stack" >
                  <strong style={{ lineHeight: 1.3 }}>{b.title}</strong>
                  <span className="small muted">{b.guide.name}</span>
                  <div className="row">
                    <BookingStatus status={b.status} />
                    {b.money.held > 0 && (
                      <span className="xs muted">
                        {t('booking.held_short')} <Money usd={b.money.held} />
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </section>
          <div className="card dark stack">
            <strong style={{ fontFamily: 'var(--display)', fontSize: 21 }}>{t('dash.direct_title')}</strong>
            <span className="small muted">{t('dash.direct_text')}</span>
            <Link to="/guides" className="btn gold sm" style={{ alignSelf: 'flex-start' }}>
              {t('home.cta_browse')}
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}

export function GuideHome() {
  const { t, me } = useApp();
  const fmt = useFmt();
  const d = useLoad(() => api('GET', '/dashboard'), []);
  const w = useLoad(() => api('GET', '/wallet'), []);
  if (!d.data) return <Loading />;
  const x = d.data;
  return (
    <div className="page">
      <h1 style={{ fontWeight: 900, fontSize: 32 }}>{t('dash.hello', { name: me.name.split(' ')[0] })}</h1>

      {!x.profileComplete && (
        <div className="note warn stack" style={{ gap: 8 }}>
          <strong>{t('dash.finish_profile')}</strong>
          <span>{t('dash.finish_profile_text')}</span>
          <Link to="/profile/guide" className="btn sm" style={{ alignSelf: 'flex-start' }}>
            {t('dash.edit_profile')}
          </Link>
        </div>
      )}
      {x.profileComplete && x.verification !== 'verified' && (
        <div className="note stack" style={{ gap: 8 }}>
          <strong>{t('verify.status.' + x.verification)}</strong>
          <span>{t('verify.status_text.' + x.verification)}</span>
          {x.verification !== 'pending' && (
            <Link to="/profile/guide#verify" className="btn sm" style={{ alignSelf: 'flex-start' }}>
              {t('verify.get_verified')}
            </Link>
          )}
        </div>
      )}

      {w.data && (
        <section aria-label={t('wallet.title')} className="card dark grid-2" style={{ gap: 14, padding: 18 }}>
          <div>
            <div className="small muted">{t('dash.earned_month')}</div>
            <div style={{ fontSize: 26, fontWeight: 700 }}>{fmt.usd(w.data.thisMonth)}</div>
            <div className="xs muted">{t('dash.after_fee')}</div>
          </div>
          <div>
            <div className="small muted">{t('dash.held_for_you')}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--gold)' }}>{fmt.usd(w.data.held)}</div>
            <div className="xs muted">{t('dash.paid_each_day')}</div>
          </div>
          <Link to="/wallet" style={{ gridColumn: '1 / -1', color: 'var(--sky)', fontWeight: 500 }} className="small">
            {t('dash.open_wallet')}
          </Link>
        </section>
      )}

      {x.awaiting.map((b: any) => (
        <Link key={b.id} to={`/bookings/${b.id}`} className="card attention link stack" style={{ gap: 8 }}>
          <div className="between">
            <strong>{t('dash.hired_title')}</strong>
            <span className="xs bold" style={{ color: 'var(--gold-ink)' }}>
              {t('dash.confirm_within', { count: fmt.until(b.confirmBy) })}
            </span>
          </div>
          <span className="small">{t('dash.hired_text', { name: b.tourist.name, title: b.title, amount: fmt.usd(b.total), dates: fmt.range(b.startDate, b.endDate) })}</span>
          <span className="btn sm" style={{ alignSelf: 'flex-start' }}>
            {t('dash.review_hire')}
          </span>
        </Link>
      ))}

      {x.toReview.map((b: any) => (
        <Link key={b.id} to={`/bookings/${b.id}`} className="card link stack" style={{ gap: 4 }}>
          <strong>{t('dash.review_tourist', { name: b.tourist.name })}</strong>
          <span className="small muted">{b.title}</span>
        </Link>
      ))}

      <div className="split">
        <section className="stack">
          <div className="between">
            <h2>{t('dash.requests_for_you')}</h2>
            <Link to="/requests?matching=1" className="small" style={{ fontWeight: 500 }}>
              {t('common.all_n', { count: x.matchingCount })}
            </Link>
          </div>
          {x.matching.length === 0 && <p className="muted small">{t('dash.no_matching')}</p>}
          {x.matching.map((r: any) => (
            <RequestFeedCard key={r.id} r={r} />
          ))}
        </section>
        <aside className="stack">
          <h2>{t('dash.next_tours')}</h2>
          {x.upcoming.length === 0 && <p className="muted small">{t('dash.no_tours')}</p>}
          {x.upcoming.map((b: any) => (
            <Link key={b.id} to={`/bookings/${b.id}`} className="card link row" style={{ gap: 12, flexWrap: 'nowrap' }}>
              <div style={{ flex: 'none', width: 54, textAlign: 'center', padding: '6px 0', borderRadius: 10, background: 'var(--sky-soft)' }}>
                <div className="xs">{fmt.date(b.startDate, { month: 'short' })}</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{fmt.date(b.startDate, { day: 'numeric' })}</div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ display: 'block', lineHeight: 1.3 }}>{b.title}</strong>
                <span className="small muted">
                  {t('dash.tour_line', { name: b.tourist.name, count: b.groupSize })}
                </span>
                <div className="xs muted">
                  {t('dash.money_line', { released: fmt.usd(b.money.released), held: fmt.usd(b.money.held) })}
                </div>
              </div>
            </Link>
          ))}
          <div className="stat-row">
            <div>
              <div className="v">{fmt.num(x.offers.pending)}</div>
              <div className="l">{t('dash.offers_pending')}</div>
            </div>
            <div>
              <div className="v">{fmt.num(x.stats.toursCompleted)}</div>
              <div className="l">{t('dash.tours_done')}</div>
            </div>
            <div>
              <div className="v">{x.stats.rating === null ? '—' : fmt.num(x.stats.rating)}</div>
              <div className="l">{t('dash.rating')}</div>
            </div>
          </div>
          <Link to={`/guides/${me.id}`} className="btn ghost sm">
            {t('dash.view_public')}
          </Link>
        </aside>
      </div>
    </div>
  );
}

export function RequestFeedCard({ r }: { r: any }) {
  const { t, me } = useApp();
  const fmt = useFmt();
  return (
    <article className="card stack" style={{ gap: 10 }}>
      <div className="chips">
        {r.urgent && <span className="pill gold">{t('request.urgent')}</span>}
        {r.invitedMe && <span className="pill sky">{t('request.invited_you')}</span>}
        {r.directGuideId === me?.id && <span className="pill navy">{t('request.direct_you')}</span>}
        {r.femaleGuide && <span className="pill">{t('request.female_pref')}</span>}
        <span className="xs muted" style={{ marginInlineStart: 'auto' }}>
          {fmt.ago(r.createdAt)}
        </span>
      </div>
      <Link to={`/requests/${r.id}`} style={{ fontWeight: 700, fontSize: 17, textDecoration: 'none', lineHeight: 1.3 }}>
        {r.title}
      </Link>
      <RequestFacts r={r} />
      {r.description && (
        <p className="small muted" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {r.description}
        </p>
      )}
      <div className="between small">
        <span>
          {t('request.offers_n', { count: r.offersCount })}
          {r.avgOffer !== null && <span className="muted"> · {t('request.avg', { amount: fmt.usd(r.avgOffer) })}</span>}
        </span>
      </div>
      <div className="between" style={{ paddingTop: 10, borderTop: '1px solid var(--line)' }}>
        <Link to={`/users/${r.tourist.id}`} className="xs muted" style={{ textDecoration: 'none' }}>
          {r.tourist.name}, {r.tourist.country}
          {r.tourist.stats.rating !== null ? ` · ${t('request.tourist_rating', { rating: fmt.num(r.tourist.stats.rating) })}` : ` · ${t('request.new_tourist')}`}
        </Link>
        {r.myOffer ? (
          <Link to={`/requests/${r.id}`} className="btn sm ghost">
            {t('request.your_offer', { amount: fmt.usd(r.myOffer.price) })}
          </Link>
        ) : (
          <Link to={`/requests/${r.id}#offer`} className="btn sm">
            {t('request.send_offer')}
          </Link>
        )}
      </div>
    </article>
  );
}

export function AdminHome() {
  const { t, me } = useApp();
  const fmt = useFmt();
  const d = useLoad(() => api('GET', '/dashboard'), []);
  if (!d.data) return <Loading />;
  const x = d.data;
  const todo = [
    x.pendingVerifications > 0 && { to: '/admin/verify', icon: 'shield', text: t('admin.todo_verify', { count: x.pendingVerifications }) },
    x.openReports > 0 && { to: '/admin/reports', icon: 'flag', text: t('admin.todo_reports', { count: x.openReports }) },
  ].filter(Boolean) as { to: string; icon: string; text: string }[];
  const stats = [
    { to: '/admin/users', label: t('admin.users'), value: fmt.num(x.users) },
    { label: t('admin.open_requests'), value: fmt.num(x.openRequests) },
    { label: t('admin.active_bookings'), value: fmt.num(x.activeBookings) },
    { label: t('admin.held_total'), value: fmt.usd(x.heldTotal) },
  ];
  return (
    <div className="page">
      <div className="stack" style={{ gap: 4 }}>
        <h1>{t('admin.title')}</h1>
        {me?.name && <p className="muted">{me.name}</p>}
      </div>
      <section className="stack" style={{ gap: 10 }}>
        <h2>{t('admin.todo')}</h2>
        {todo.length === 0 ? (
          <div className="card row" style={{ gap: 10, flexWrap: 'nowrap' }}>
            <Icon name="check" size={20} />
            <span>{t('admin.all_clear')}</span>
          </div>
        ) : (
          <div className="card flush">
            {todo.map((i) => (
              <Link key={i.to} to={i.to} className="list-item todo-item">
                <span className="avatar av-2" style={{ width: 40, height: 40 }} aria-hidden="true">
                  <Icon name={i.icon} size={20} />
                </span>
                <strong style={{ flex: 1 }}>{i.text}</strong>
                <span className="small" style={{ color: 'var(--brand)', fontWeight: 600 }}>
                  {t('admin.review')}
                </span>
                <Icon name="next" size={18} className="flip" />
              </Link>
            ))}
          </div>
        )}
      </section>
      <SubscriptionSettings price={x.subscriptionPrice} days={x.subscriptionDays} active={x.activeSubscriptions} onSaved={d.reload} />
      <section className="stack" style={{ gap: 10 }}>
        <h2>{t('admin.platform')}</h2>
        <div className="stat-grid">
          {stats.map((s) =>
            s.to ? (
              <Link key={s.label} to={s.to} className="stat link">
                <span className="xs muted">{s.label}</span>
                <strong>{s.value}</strong>
              </Link>
            ) : (
              <div key={s.label} className="stat">
                <span className="xs muted">{s.label}</span>
                <strong>{s.value}</strong>
              </div>
            ),
          )}
        </div>
      </section>
    </div>
  );
}

/** Admin: price of the guide subscription that unlocks cash bookings. */
function SubscriptionSettings({ price, days, active, onSaved }: { price: number; days: number; active: number; onSaved(): void }) {
  const { t } = useApp();
  const [p, setP] = React.useState(String(price));
  const [dd, setDd] = React.useState(String(days));
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api('PUT', '/admin/settings', { guideSubscriptionPrice: Number(p), subscriptionDays: Number(dd) });
      setMsg(t('common.saved'));
      onSaved();
    } catch {
      setMsg(t('err.server_error'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="card stack" onSubmit={save} aria-labelledby="subs-title">
      <div className="between">
        <h2 id="subs-title" style={{ fontSize: 20 }}>{t('admin.subs_title')}</h2>
        <span className="pill sky">{t('admin.subs_active', { count: active })}</span>
      </div>
      <p className="small muted">{t('admin.subs_text')}</p>
      <div className="grid-2" style={{ gap: 12 }}>
        <label className="stack" style={{ gap: 6 }}>
          <span className="label-sm">{t('admin.subs_price')}</span>
          <input className="input ltr" inputMode="decimal" value={p} onChange={(e) => setP(e.target.value.replace(/[^\d.]/g, ''))} />
        </label>
        <label className="stack" style={{ gap: 6 }}>
          <span className="label-sm">{t('admin.subs_days')}</span>
          <input className="input ltr" inputMode="numeric" value={dd} onChange={(e) => setDd(e.target.value.replace(/\D/g, ''))} />
        </label>
      </div>
      <div className="row">
        <button className="btn" disabled={busy}>{t('common.save')}</button>
        {msg && <span className="small muted" role="status">{msg}</span>}
      </div>
    </form>
  );
}
