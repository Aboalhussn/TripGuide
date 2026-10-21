import React from 'react';
import { api } from '../lib/api';
import { useApp, useLoad } from '../lib/app';
import { useFmt } from '../lib/format';
import { CityStats } from './Admin';
import { Link } from '../lib/router';
import { asset, photoSrc } from '../assets';
import { Avatar, BookingStatus, Icon, Loading, Money, Rating, RequestFacts, RequestStatus, BrandBar, BrandFooter, TripCard, VerifiedBadge } from '../ui';

type Slide = { img: string; title: string; text?: string; cta: string; to: string };

/** Swipeable banners at the top of the home screen, like a store app. Advances by itself every few seconds. */
function HomeBanners({ slides }: { slides: Slide[] }) {
  const { t } = useApp();
  const ref = React.useRef<HTMLDivElement>(null);
  const [i, setI] = React.useState(0);
  const step = () => {
    const el = ref.current!;
    const first = el.children[0] as HTMLElement | undefined;
    return first ? first.offsetWidth + 12 : el.clientWidth;
  };
  const goTo = (n: number) => {
    const el = ref.current;
    if (!el) return;
    const sign = getComputedStyle(el).direction === 'rtl' ? -1 : 1;
    el.scrollTo({ left: sign * n * step(), behavior: 'smooth' });
  };
  const onScroll = () => {
    const el = ref.current;
    if (el) setI(Math.round(Math.abs(el.scrollLeft) / step()));
  };
  React.useEffect(() => {
    if (slides.length < 2) return;
    const id = window.setInterval(() => goTo((i + 1) % slides.length), 5000);
    return () => window.clearInterval(id);
  }, [i, slides.length]);
  return (
    <section className="home-banners" aria-label={t('home.highlights')}>
      <div className="banner-track" ref={ref} onScroll={onScroll}>
        {slides.map((s, n) => (
          <div key={n} className="promo-band banner" aria-hidden={n !== i ? true : undefined}>
            <img src={asset(s.img)} alt="" />
            <div className="over">
              <p className="mark-text">{s.title}</p>
              {s.text && <p className="promo-text">{s.text}</p>}
              <Link to={s.to} className="btn gold sm" tabIndex={n !== i ? -1 : undefined}>
                {s.cta}
              </Link>
            </div>
          </div>
        ))}
      </div>
      {slides.length > 1 && (
        <div className="banner-dots">
          {slides.map((_, n) => (
            <button key={n} type="button" className={n === i ? 'on' : ''} aria-label={t('home.slide_n', { n: n + 1 })} aria-current={n === i ? 'true' : undefined} onClick={() => goTo(n)} />
          ))}
        </div>
      )}
    </section>
  );
}

function SectionHead({ title, to }: { title: string; to?: string }) {
  const { t } = useApp();
  return (
    <div className="section-head">
      <h2>{title}</h2>
      {to && (
        <Link to={to} className="see-all">
          {t('common.see_all')}
        </Link>
      )}
    </div>
  );
}

function GuideTile({ g }: { g: any }) {
  const { t } = useApp();
  const fmt = useFmt();
  return (
    <Link to={`/guides/${g.id}`} className="guide-tile">
      <div className="gt-cover">
        {g.cover ? <img src={photoSrc(g.cover)} alt="" loading="lazy" /> : <img src={asset('map.jpg')} alt="" />}
      </div>
      <div className="gt-body">
        <div className="gt-av">
          <Avatar user={g} size={44} />
        </div>
        <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
          <strong className="gt-name">{g.name}</strong>
          {g.stats.verified && <VerifiedBadge />}
        </div>
        <div className="between small" style={{ flexWrap: 'nowrap' }}>
          <Rating rating={g.stats.rating} />
          <span>
            <strong>{fmt.usd(g.pricePerDay)}</strong>
            <span className="xs muted"> {t('common.per_day')}</span>
          </span>
        </div>
      </div>
    </Link>
  );
}

function TopGuides() {
  const { t } = useApp();
  const top = useLoad(() => api('GET', '/guides', undefined, { sort: 'best' }), []);
  return (
    <section className="stack" style={{ gap: 10 }}>
      <SectionHead title={t('home.top_guides')} to="/guides" />
      <div className="h-scroll">
        {top.data ? [...top.data.guides].sort((a: any, b: any) => Number(!!b.promoted) - Number(!!a.promoted)).slice(0, 6).map((g: any) => <GuideTile key={g.id} g={g} />) : [0, 1].map((n) => <div key={n} className="guide-tile skeleton" style={{ height: 200 }} />)}
      </div>
    </section>
  );
}

function CityTiles() {
  const { t, meta } = useApp();
  const fmt = useFmt();
  return (
    <section className="stack" style={{ gap: 10 }}>
      <SectionHead title={t('home.where')} to="/guides" />
      <div className="h-scroll">
        {(meta?.cities || []).map((c: any) => (
          <Link key={c.slug} to={`/guides?city=${c.slug}`} className="city-tile">
            <span className="ct-ico">
              <Icon name="pin" size={20} />
            </span>
            <span>{fmt.city(c.slug)}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function HowItWorks() {
  const { t } = useApp();
  const icons = ['edit', 'offer', 'shield'];
  return (
    <section className="stack" style={{ gap: 10 }}>
      <SectionHead title={t('home.how')} />
      <div className="card flush how-card">
        {[1, 2, 3].map((n) => (
          <div key={n} className="how-row">
            <span className="qa-ico sm">
              <Icon name={icons[n - 1]} size={20} />
            </span>
            <div>
              <strong>{t(`home.step${n}`)}</strong>
              <p className="muted small" style={{ marginTop: 2 }}>
                {t(`home.step${n}_text`)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function GuestHome() {
  const { t } = useApp();
  return (
    <div className="page app-home">
      <BrandBar />
      <HomeBanners
        slides={[
          { img: 'skyline.jpg', title: t('home.join_title'), cta: t('home.join_cta'), to: '/register?role=guide' },
          { img: 'ishtar.jpg', title: t('home.slide_post'), cta: t('home.cta_post'), to: '/post' },
          { img: 'babylon.jpg', title: t('home.slide_pay'), cta: t('home.cta_browse'), to: '/guides' },
        ]}
      />
      <TopGuides />
      <CityTiles />
      <HowItWorks />
      <BrandFooter />
    </div>
  );
}

export function TouristHome() {
  const { t, me } = useApp();
  const fmt = useFmt();
  const d = useLoad(() => api('GET', '/dashboard'), []);
  if (!d.data) return <Loading />;
  const { requests, bookings } = d.data;
  const first = me.name.split(' ')[0];
  return (
    <div className="page">
      <BrandBar />
      <div className="stack" style={{ gap: 2 }}>
        <h1 style={{ fontWeight: 900, fontSize: 26 }}>{t('dash.hello', { name: first })}</h1>
        <p className="muted small">{t('dash.tourist_lede')}</p>
      </div>
      <HomeBanners
        slides={[
          { img: 'ishtar.jpg', title: t('home.slide_post'), cta: t('home.cta_post'), to: '/post' },
          { img: 'skyline.jpg', title: t('dash.direct_title'), text: t('dash.direct_text'), cta: t('home.cta_browse'), to: '/guides' },
          { img: 'babylon.jpg', title: t('home.slide_pay'), cta: t('home.cta_browse'), to: '/guides' },
        ]}
      />

      <TopGuides />

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
            <div className="cards">
              {requests.map((r: any) => (
                <TripCard
                  key={r.id}
                  r={{ ...r, tourist: r.tourist || me }}
                  badge={<RequestStatus status={r.status} />}
                  pills={r.directGuide ? <span className="pill navy">{t('request.direct_to', { name: r.directGuide.name })}</span> : null}
                  action={
                    <Link to={`/requests/${r.id}`} className="btn tc-action">
                      {t('request.offers_n', { count: r.offersCount })}
                    </Link>
                  }
                />
              ))}
            </div>
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
                  <strong style={{ lineHeight: 1.3 }}><bdi>{b.title}</bdi></strong>
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
      <BrandBar />
      <h1 style={{ fontWeight: 900, fontSize: 32 }}>{t('dash.hello', { name: me.name.split(' ')[0] })}</h1>

      {!x.profileComplete && (
        <Link to="/guide/setup" className="note warn stack link-note" style={{ gap: 6 }}>
          <strong>{t('dash.finish_profile')}</strong>
          <span>{t('dash.finish_profile_text')}</span>
          <span className="btn sm" style={{ alignSelf: 'flex-start' }}>{t('dash.edit_profile')}</span>
        </Link>
      )}
      {x.profileComplete && x.verification === 'pending' && (
        <Link to="/verify" className="note warn row link-note" style={{ gap: 10, flexWrap: 'nowrap' }} role="status">
          <Icon name="clock" size={20} />
          <span>
            <strong>{t('verifyp.sent_title')}</strong>
            <br />
            {t('verify.status_text.pending')}
          </span>
        </Link>
      )}
      {x.profileComplete && (x.verification === 'none' || x.verification === 'rejected') && (
        <Link to="/verify" className="verify-alert link-note">
          <span className="st-ico"><Icon name="shield" size={22} /></span>
          <span style={{ flex: 1 }}>
            <strong>{t('dash.verify_alert_title')}</strong>
            <span className="small">{x.verification === 'rejected' ? t('verify.status_text.rejected') : t('dash.verify_alert_text')}</span>
          </span>
          <Icon name="next" size={18} className="flip" />
        </Link>
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
          <span className="small muted"><bdi>{b.title}</bdi></span>
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
                <strong style={{ display: 'block', lineHeight: 1.3 }}><bdi>{b.title}</bdi></strong>
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
  const pills = (
    <>
      {r.urgent && <span className="pill gold">{t('request.urgent')}</span>}
      {r.invitedMe && <span className="pill sky">{t('request.invited_you')}</span>}
      {r.directGuideId === me?.id && <span className="pill navy">{t('request.direct_you')}</span>}
      {r.busyForMe && !r.myOffer && <span className="pill danger">{t('request.busy_pill')}</span>}
    </>
  );
  const action = r.myOffer ? (
    <Link to={`/requests/${r.id}`} className="btn ghost tc-action">
      {t('request.your_offer', { amount: fmt.usd(r.myOffer.price) })}
    </Link>
  ) : r.busyForMe ? (
    <Link to={`/requests/${r.id}`} className="btn ghost tc-action">
      {t('request.view')}
    </Link>
  ) : (
    <Link to={`/requests/${r.id}#offer`} className="btn tc-action tc-send">
      <Icon name="send" size={16} stroke={2.2} /> {t('request.send_offer')}
    </Link>
  );
  return <TripCard r={r} badge={t('request.offers_n', { count: r.offersCount })} pills={pills} action={action} />;
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
    { to: '/admin/users', label: t('admin.users'), value: fmt.num(x.users), icon: 'users', tone: 'sky' },
    { to: '/requests', label: t('admin.open_requests'), value: fmt.num(x.openRequests), icon: 'list', tone: 'teal' },
    { label: t('admin.active_bookings'), value: fmt.num(x.activeBookings), icon: 'calendar', tone: 'gold' },
    { label: t('admin.held_total'), value: fmt.usd(x.heldTotal), icon: 'wallet', tone: 'navy' },
  ];
  return (
    <div className="page">
      <BrandBar />
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
      <section className="stack" style={{ gap: 10 }}>
        <h2>{t('admin.platform')}</h2>
        <div className="stat-tiles four">
          {stats.map((s) => {
            const body = (
              <>
                <span className="st-ico"><Icon name={s.icon} size={20} /></span>
                <strong>{s.value}</strong>
                <span>{s.label}</span>
              </>
            );
            return s.to ? (
              <Link key={s.label} to={s.to} className={'stat-tile link ' + s.tone}>{body}</Link>
            ) : (
              <div key={s.label} className={'stat-tile ' + s.tone}>{body}</div>
            );
          })}
        </div>
      </section>
      <section className="stack" style={{ gap: 10 }}>
        <div className="section-head">
          <h2>{t('stats.governorates')}</h2>
          <Link to="/admin/stats" className="see-all">{t('common.see_all')}</Link>
        </div>
        <CityStats limit={5} />
      </section>
      <Link to="/admin/cities" className="card link row pricing-link" style={{ gap: 12, flexWrap: 'nowrap' }}>
        <span className="st-ico"><Icon name="pin" size={20} /></span>
        <span style={{ flex: 1 }} className="stack">
          <strong>{t('city.title')}</strong>
          <span className="xs muted">{t('menu.cities_sub')}</span>
        </span>
        <Icon name="next" size={18} className="flip" />
      </Link>
      <Link to="/admin/pricing" className="card link row pricing-link" style={{ gap: 12, flexWrap: 'nowrap' }}>
        <span className="st-ico gold"><Icon name="money" size={20} /></span>
        <span style={{ flex: 1 }} className="stack">
          <strong>{t('admin.pricing')}</strong>
          <span className="xs muted">{t('admin.pricing_text')}</span>
        </span>
        <Icon name="next" size={18} className="flip" />
      </Link>
    </div>
  );
}

/** Admin: price of the guide subscription that unlocks cash bookings. */
export function SubscriptionSettings({ price, days, active, onSaved, promo = false }: { price: number; days: number; active: number; onSaved(): void; promo?: boolean }) {
  const k = promo ? 'admin.promo_' : 'admin.subs_';
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
      await api('PUT', '/admin/settings', promo ? { promotionPrice: Number(p), promotionDays: Number(dd) } : { guideSubscriptionPrice: Number(p), subscriptionDays: Number(dd) });
      setMsg(t('common.saved'));
      onSaved();
    } catch {
      setMsg(t('err.server_error'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="card stack" onSubmit={save} aria-labelledby={k + 'title'}>
      <div className="between">
        <h2 id={k + 'title'} style={{ fontSize: 20 }}>{t(k + 'title')}</h2>
        <span className="pill sky">{t(k + 'active', { count: active })}</span>
      </div>
      <p className="small muted">{t(k + 'text')}</p>
      <div className="grid-2" style={{ gap: 12 }}>
        <label className="stack" style={{ gap: 6 }}>
          <span className="label-sm">{t(k + 'price')}</span>
          <input className="input ltr" inputMode="decimal" value={p} onChange={(e) => setP(e.target.value.replace(/[^\d.]/g, ''))} />
        </label>
        <label className="stack" style={{ gap: 6 }}>
          <span className="label-sm">{t(k + 'days')}</span>
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
