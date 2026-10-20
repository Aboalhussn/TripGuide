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
  const side = (n: number) => (rtl ? { right: n } : { left: n });
  const other = (n: number) => (rtl ? { left: n } : { right: n });
  return (
    <section className="collage" aria-label={t('home.pictures')}>
      <svg className="route" viewBox="0 0 390 300" preserveAspectRatio="none" aria-hidden="true">
        <path d={rtl ? 'M366 250 C 300 290, 240 200, 185 235 S 70 280, 30 170' : 'M24 250 C 90 290, 150 200, 205 235 S 320 280, 360 170'} fill="none" stroke="#429EBD" strokeWidth="2" strokeDasharray="2 7" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="photo" style={{ ...side(18), top: 18, width: '39%', height: '64%', transform: `rotate(${rtl ? 5 : -5}deg)` }}>
        <img src={asset('ishtar.jpg')} alt={t('home.alt_ishtar')} />
        <span className="tape" style={{ [rtl ? 'right' : 'left']: '32%', transform: 'rotate(4deg)' } as React.CSSProperties} />
      </div>
      <div className="photo" style={{ ...side('34%' as any), top: '17%', width: '34%', height: '59%', transform: `rotate(${rtl ? -3 : 3}deg)` }}>
        <img src={asset('babylon.jpg')} alt={t('home.alt_babylon')} />
        <span className="tape gold" style={{ [rtl ? 'right' : 'left']: '30%', transform: 'rotate(-6deg)' } as React.CSSProperties} />
      </div>
      <div className="photo" style={{ ...other(16), top: 10, width: '33%', height: '54%', transform: `rotate(${rtl ? -6 : 6}deg)` }}>
        <img src={asset('arch.jpg')} alt={t('home.alt_arch')} />
        <span className="tape" style={{ [rtl ? 'right' : 'left']: '28%', transform: 'rotate(-3deg)' } as React.CSSProperties} />
      </div>
      <img src={asset('tg-mark.svg')} alt="" style={{ position: 'absolute', ...other(20), top: '68%', width: 56, height: 'auto', transform: 'rotate(-8deg)' }} />
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
  const { t } = useApp();
  const fmt = useFmt();
  const d = useLoad(() => api('GET', '/dashboard'), []);
  if (!d.data) return <Loading />;
  const x = d.data;
  return (
    <div className="page">
      <h1>{t('admin.title')}</h1>
      <div className="cards three">
        <Link to="/admin/verify" className="card link stack" style={{ gap: 4 }}>
          <span className="small muted">{t('admin.pending_verifications')}</span>
          <strong style={{ fontSize: 28 }}>{fmt.num(x.pendingVerifications)}</strong>
        </Link>
        <Link to="/admin/reports" className={'card link stack' + (x.openReports ? ' attention' : '')} style={{ gap: 4 }}>
          <span className="small muted">{t('admin.open_reports')}</span>
          <strong style={{ fontSize: 28 }}>{fmt.num(x.openReports)}</strong>
        </Link>
        <Link to="/admin/users" className="card link stack" style={{ gap: 4 }}>
          <span className="small muted">{t('admin.users')}</span>
          <strong style={{ fontSize: 28 }}>{fmt.num(x.users)}</strong>
        </Link>
        <div className="card stack" style={{ gap: 4 }}>
          <span className="small muted">{t('admin.open_requests')}</span>
          <strong style={{ fontSize: 28 }}>{fmt.num(x.openRequests)}</strong>
        </div>
        <div className="card stack" style={{ gap: 4 }}>
          <span className="small muted">{t('admin.active_bookings')}</span>
          <strong style={{ fontSize: 28 }}>{fmt.num(x.activeBookings)}</strong>
        </div>
        <div className="card stack" style={{ gap: 4 }}>
          <span className="small muted">{t('admin.held_total')}</span>
          <strong style={{ fontSize: 28 }}>{fmt.usd(x.heldTotal)}</strong>
        </div>
      </div>
      <div className="row">
        <Link to="/admin/verify" className="btn">
          <Icon name="shield" size={18} /> {t('admin.verify_guides')}
        </Link>
        <Link to="/admin/reports" className="btn outline">
          <Icon name="flag" size={18} /> {t('admin.reports')}
        </Link>
      </div>
    </div>
  );
}
