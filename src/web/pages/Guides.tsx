import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useApp, useLoad } from '../lib/app';
import { useFmt } from '../lib/format';
import { Link, navigate } from '../lib/router';
import { asset } from '../assets';
import { Avatar, Empty, ErrorState, Field, GuideCard, Icon, Loading, Modal, MonthCalendar, PageHead, Photo, Rating, ResponseTime, Star, VerifiedBadge, useBusy } from '../ui';

const SORTS = ['best', 'rating', 'price_low', 'price_high', 'tours'];

export function FindGuides({ query }: { query: Record<string, string> }) {
  const { t, meta } = useApp();
  const fmt = useFmt();
  const [q, setQ] = useState(query.q || '');
  const [showFilters, setShowFilters] = useState(false);
  const f = {
    city: query.city || '',
    lang: query.lang || '',
    spec: query.spec || '',
    maxPrice: query.maxPrice || '',
    minRating: query.minRating || '',
    verified: query.verified || '',
    female: query.female || '',
    from: query.from || '',
    to: query.to || '',
    sort: query.sort || 'best',
    q: query.q || '',
  };
  const res = useLoad(() => api('GET', '/guides', undefined, f), [JSON.stringify(f)]);
  const set = (patch: Record<string, string>) => {
    const next = { ...f, ...patch };
    const qs = new URLSearchParams(Object.entries(next).filter(([k, v]) => v && !(k === 'sort' && v === 'best'))).toString();
    navigate('/guides' + (qs ? '?' + qs : ''), { replace: true });
  };
  const activeCount = ['city', 'lang', 'spec', 'maxPrice', 'minRating', 'verified', 'female', 'from'].filter((k) => (f as any)[k]).length;

  const chip = (label: string, key: string[]) => (
    <button key={key.join()} type="button" className="toggle-chip" aria-pressed="true" onClick={() => set(Object.fromEntries(key.map((k) => [k, ''])))} aria-label={t('guides.remove_filter', { name: label })}>
      {label} ×
    </button>
  );

  return (
    <div className="page">
      <PageHead title={t('guides.title')} />
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          set({ q });
        }}
        className="row"
        style={{ flexWrap: 'nowrap' }}
      >
        <label style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, minHeight: 50, padding: '0 14px', background: 'var(--surface)', border: '1px solid var(--line-strong)', borderRadius: 14 }}>
          <Icon name="search" size={20} />
          <span className="sr-only">{t('guides.search_label')}</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('guides.search_placeholder')} style={{ flex: 1, width: '100%', border: 'none', background: 'transparent', fontSize: 16, outline: 'none', minWidth: 0 }} />
        </label>
        <button className="btn" type="submit">
          {t('common.search')}
        </button>
      </form>
      <div className="scroll-x">
        <button type="button" className="toggle-chip" aria-pressed={activeCount > 0} onClick={() => setShowFilters(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Icon name="filter" size={16} /> {activeCount ? t('guides.filters_n', { count: activeCount }) : t('guides.filters')}
        </button>
        {f.city && chip(fmt.city(f.city), ['city'])}
        {f.lang && chip(fmt.language(f.lang), ['lang'])}
        {f.spec && chip(t('interest.' + f.spec), ['spec'])}
        {f.from && chip(fmt.range(f.from, f.to || f.from), ['from', 'to'])}
        {f.maxPrice && chip(t('guides.under', { amount: fmt.usd(Number(f.maxPrice)) }), ['maxPrice'])}
        {f.minRating && chip(t('guides.stars_up', { count: Number(f.minRating) }), ['minRating'])}
        {f.verified && chip(t('guides.verified_only'), ['verified'])}
        {f.female && chip(t('guides.female_only'), ['female'])}
      </div>
      <div className="between small muted">
        <span aria-live="polite">{res.data ? t(f.from ? 'guides.count_free' : 'guides.count', { count: res.data.total }) : t('common.loading')}</span>
        <label className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
          {t('guides.sort')}
          <select className="select" style={{ minHeight: 38, width: 'auto' }} value={f.sort} onChange={(e) => set({ sort: e.target.value })}>
            {SORTS.map((s) => (
              <option key={s} value={s}>
                {t('guides.sort.' + s)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {res.error ? (
        <ErrorState error={res.error} onRetry={res.reload} />
      ) : !res.data ? (
        <div className="cards">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: 150 }} />
          ))}
        </div>
      ) : res.data.guides.length === 0 ? (
        <Empty title={t('guides.none')} text={t('guides.none_text')} action={<button className="btn outline" onClick={() => navigate('/guides')}>{t('guides.clear')}</button>} />
      ) : (
        <div className="cards">
          {res.data.guides.map((g: any) => (
            <GuideCard key={g.id} g={g} />
          ))}
        </div>
      )}
      <div className="card dark stack">
        <strong style={{ fontFamily: 'var(--display)', fontSize: 21 }}>{t('guides.not_sure')}</strong>
        <span className="small muted">{t('guides.not_sure_text')}</span>
        <Link to="/post" className="btn gold sm" style={{ alignSelf: 'flex-start' }}>
          {t('home.cta_post')}
        </Link>
      </div>

      {showFilters && (
        <FiltersModal
          initial={f}
          onClose={() => setShowFilters(false)}
          onApply={(p) => {
            set(p);
            setShowFilters(false);
          }}
          meta={meta}
        />
      )}
    </div>
  );
}

function FiltersModal({ initial, onClose, onApply, meta }: { initial: any; onClose(): void; onApply(p: any): void; meta: any }) {
  const { t } = useApp();
  const fmt = useFmt();
  const [v, setV] = useState({ ...initial });
  const up = (k: string, val: string) => setV((x: any) => ({ ...x, [k]: val }));
  return (
    <Modal title={t('guides.filters')} onClose={onClose}>
      <div className="grid-2">
        <Field label={t('field.city')}>
          <select className="select" value={v.city} onChange={(e) => up('city', e.target.value)}>
            <option value="">{t('common.any')}</option>
            {meta.cities.map((c: any) => (
              <option key={c.slug} value={c.slug}>
                {fmt.city(c.slug)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('field.language')}>
          <select className="select" value={v.lang} onChange={(e) => up('lang', e.target.value)}>
            <option value="">{t('common.any')}</option>
            {meta.languages.map((l: string) => (
              <option key={l} value={l}>
                {fmt.language(l)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('field.speciality')}>
          <select className="select" value={v.spec} onChange={(e) => up('spec', e.target.value)}>
            <option value="">{t('common.any')}</option>
            {meta.interests.map((i: string) => (
              <option key={i} value={i}>
                {t('interest.' + i)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('field.maxPrice')}>
          <input className="input" inputMode="numeric" value={v.maxPrice} onChange={(e) => up('maxPrice', e.target.value.replace(/\D/g, ''))} placeholder="$" />
        </Field>
        <Field label={t('field.from')}>
          <input className="input" type="date" value={v.from} min={meta.today} onChange={(e) => setV((x: any) => ({ ...x, from: e.target.value, to: x.to && x.to >= e.target.value ? x.to : e.target.value }))} />
        </Field>
        <Field label={t('field.to')}>
          <input className="input" type="date" value={v.to} min={v.from || meta.today} onChange={(e) => up('to', e.target.value)} />
        </Field>
      </div>
      <Field label={t('field.minRating')}>
        <select className="select" value={v.minRating} onChange={(e) => up('minRating', e.target.value)}>
          <option value="">{t('common.any')}</option>
          {['4.5', '4', '3'].map((r) => (
            <option key={r} value={r}>
              {t('guides.stars_up', { count: Number(r) })}
            </option>
          ))}
        </select>
      </Field>
      <label className="check">
        <input type="checkbox" checked={v.verified === '1'} onChange={(e) => up('verified', e.target.checked ? '1' : '')} />
        {t('guides.verified_only')}
      </label>
      <label className="check">
        <input type="checkbox" checked={v.female === '1'} onChange={(e) => up('female', e.target.checked ? '1' : '')} />
        {t('guides.female_only')}
      </label>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <button type="button" className="btn ghost" onClick={() => onApply({ city: '', lang: '', spec: '', maxPrice: '', minRating: '', verified: '', female: '', from: '', to: '' })}>
          {t('guides.clear')}
        </button>
        <button type="button" className="btn" style={{ flex: 1 }} onClick={() => onApply(v)}>
          {t('guides.show_results')}
        </button>
      </div>
    </Modal>
  );
}

export function GuideProfile({ id }: { id: string }) {
  const { t, me, meta } = useApp();
  const fmt = useFmt();
  const res = useLoad(() => api('GET', `/guides/${id}`), [id]);
  const [month, setMonth] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const { busy, run } = useBusy();
  if (res.error) return <ErrorState error={res.error} onRetry={res.reload} />;
  if (!res.data || !meta) return <Loading />;
  const g = res.data;
  const s = g.stats;
  const m = month || meta.today.slice(0, 7);
  const shiftMonth = (n: number) => {
    const d = new Date(m + '-01T12:00:00Z');
    d.setUTCMonth(d.getUTCMonth() + n);
    setMonth(d.toISOString().slice(0, 7));
  };
  const isMe = me?.id === g.id;
  const canHire = !me || me.role === 'tourist';
  const first = g.name.split(' ')[0];
  const cover = g.photos[0]?.img;

  const message = () =>
    run(async () => {
      if (!me) return navigate('/login?next=' + encodeURIComponent(`/guides/${id}`));
      const th = await api('POST', '/threads', { guideId: g.id });
      navigate(`/messages/${th.id}`);
    });

  const reviews = showAll ? g.reviews : g.reviews.slice(0, 4);
  return (
    <div>
      <div className="banner-img">
        <img src={cover ? (cover.startsWith('lib:') ? asset(cover.slice(4) + '.jpg') : cover) : asset('gate.jpg')} alt="" />
      </div>
      <div className="split" style={{ padding: '0 0 24px' }}>
        <div className="stack-lg">
          <section className="guide-head stack" style={{ gap: 8 }}>
            <Avatar user={g} size={96} />
            <h1 style={{ fontWeight: 900, fontSize: 32 }}>{g.name}</h1>
            <p className="muted" style={{ fontSize: 16 }}>
              {fmt.pick(g.headline, g.headlineAr)}
            </p>
            <div className="chips">
              {s.verified && (
                <span className="pill sky">
                  <VerifiedBadge size={15} /> {t('badge.id_verified')}
                </span>
              )}
              {g.phoneVerified && <span className="pill sky">{t('badge.phone_verified')}</span>}
              {s.topGuide && <span className="pill gold">{t('badge.top')}</span>}
              {g.suspended && <span className="pill danger">{t('badge.suspended')}</span>}
            </div>
          </section>

          <div style={{ padding: '0 16px' }} className="stack-lg">
            <section className="stat-row" aria-label={t('guide.track_record')}>
              <div>
                <div className="v">
                  {s.rating !== null && <Star size={18} />}
                  {s.rating === null ? '—' : fmt.num(s.rating)}
                </div>
                <div className="l">{t('guide.reviews_n', { count: s.reviewsCount })}</div>
              </div>
              <div>
                <div className="v">{fmt.num(s.toursCompleted)}</div>
                <div className="l">{t('guide.tours_done')}</div>
              </div>
              <div>
                <div className="v">{fmt.usd(g.pricePerDay)}</div>
                <div className="l">{t('common.per_day')}</div>
              </div>
            </section>

            <section className="card stack" aria-label={t('guide.reliability')}>
              {[
                ['guide.completion', s.completionRate],
                ['guide.repeat', s.repeatHireRate],
                ['guide.response_rate', s.responseRate],
              ].map(([k, v]) => (
                <div key={k as string} className="stack" style={{ gap: 5 }}>
                  <div className="between small">
                    <span>{t(k as string)}</span>
                    <strong>{fmt.pct(v as number | null)}</strong>
                  </div>
                  <div className="meter">
                    <div style={{ width: `${Math.round(((v as number) || 0) * 100)}%` }} />
                  </div>
                </div>
              ))}
              <div className="small muted stack" style={{ gap: 2 }}>
                <ResponseTime minutes={s.responseMinutes} />
                <span>{t('guide.member_since', { date: fmt.date(g.memberSince, { month: 'long', year: 'numeric' }) })}</span>
              </div>
            </section>

            <section className="stack" style={{ gap: 8 }}>
              <h2>{t('guide.about', { name: first })}</h2>
              <p style={{ fontSize: 16, lineHeight: 1.6, whiteSpace: 'pre-line' }}>{fmt.pick(g.bio, g.bioAr)}</p>
            </section>

            <section className="stack">
              <div>
                <div className="small muted" style={{ marginBottom: 6 }}>
                  {t('guide.speaks')}
                </div>
                <div className="chips">
                  {g.languages.map((l: any) => (
                    <span key={l.code} className="chip lang" style={{ fontSize: 14 }}>
                      {fmt.language(l.code)} ({t('level.' + l.level)})
                    </span>
                  ))}
                </div>
              </div>
              {g.specialities.length > 0 && (
                <div>
                  <div className="small muted" style={{ marginBottom: 6 }}>
                    {t('guide.specialities')}
                  </div>
                  <div className="chips">
                    {g.specialities.map((x: string) => (
                      <span key={x} className="chip" style={{ fontSize: 14 }}>
                        {t('interest.' + x)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <div className="small muted" style={{ marginBottom: 6 }}>
                  {t('guide.guides_at')}
                </div>
                <p style={{ fontSize: 15, lineHeight: 1.6 }}>
                  {fmt.cities(g.cities)}
                  {g.places.length > 0 && <span className="muted">. {fmt.list(g.places.map((p: number) => fmt.place(p)).filter(Boolean))}</span>}
                </p>
              </div>
            </section>

            {g.photos.length > 0 && (
              <section className="stack" style={{ gap: 0 }}>
                <h2>{t('guide.past_tours')}</h2>
                <div className="polaroids">
                  {g.photos.map((ph: any, i: number) => (
                    <figure key={i} className="polaroid">
                      <Photo src={ph.img} alt={fmt.pick(ph.caption, ph.captionAr) || t('guide.photo_alt', { name: first })} />
                      {(ph.caption || ph.captionAr) && <figcaption>{fmt.pick(ph.caption, ph.captionAr)}</figcaption>}
                    </figure>
                  ))}
                </div>
              </section>
            )}

            <section className="stack">
              <div className="between">
                <h2>{t('guide.availability')}</h2>
                <div className="row" style={{ gap: 0 }}>
                  <button type="button" className="icon-btn" aria-label={t('common.prev_month')} onClick={() => shiftMonth(-1)} disabled={m <= meta.today.slice(0, 7)}>
                    <Icon name="back" className="flip" />
                  </button>
                  <span className="small" style={{ minWidth: 96, textAlign: 'center' }}>
                    {fmt.date(m + '-01', { month: 'long', year: 'numeric' })}
                  </span>
                  <button type="button" className="icon-btn" aria-label={t('common.next_month')} onClick={() => shiftMonth(1)}>
                    <Icon name="next" className="flip" />
                  </button>
                </div>
              </div>
              <MonthCalendar month={m} blocked={g.blockedDates} booked={g.booked} today={meta.today} />
              <p className="xs muted">{t('guide.availability_note')}</p>
            </section>

            <section className="stack" id="reviews">
              <h2>{t('guide.reviews')}</h2>
              {s.reviewsCount > 0 && (
                <div className="grid-2 small" style={{ gap: '8px 16px' }}>
                  {Object.entries(s.subRatings).map(([k, v]) => (
                    <div key={k} className="between">
                      <span>{t('rating.' + k)}</span>
                      <strong>{v === null ? '—' : fmt.num(v as number)}</strong>
                    </div>
                  ))}
                  {s.hireAgain !== null && (
                    <div className="between" style={{ gridColumn: '1 / -1' }}>
                      <span>{t('guide.would_hire_again')}</span>
                      <strong>{fmt.pct(s.hireAgain)}</strong>
                    </div>
                  )}
                </div>
              )}
              {g.reviews.length === 0 && <p className="muted small">{t('guide.no_reviews')}</p>}
              {reviews.map((r: any) => (
                <ReviewCard key={r.id} r={r} />
              ))}
              {g.reviews.length > 4 && !showAll && (
                <button type="button" className="btn ghost" onClick={() => setShowAll(true)}>
                  {t('guide.read_all', { count: g.reviews.length })}
                </button>
              )}
            </section>
          </div>
        </div>

        <aside style={{ padding: '0 16px' }}>
          <div className="sticky-actions" style={{ flexDirection: 'column' }}>
            <div className="between">
              <span>
                <strong style={{ fontSize: 22 }}>{fmt.usd(g.pricePerDay)}</strong> <span className="muted small">{t('common.per_day')}</span>
              </span>
              <Rating rating={s.rating} count={s.reviewsCount} />
            </div>
            {isMe ? (
              <Link to="/profile/guide" className="btn">
                {t('guide.edit_mine')}
              </Link>
            ) : canHire && !g.suspended ? (
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <button type="button" className="btn outline" style={{ flex: 1 }} onClick={message} disabled={busy}>
                  {t('guide.message')}
                </button>
                <Link to={me ? `/post?guide=${g.id}` : `/login?next=${encodeURIComponent('/post?guide=' + g.id)}`} className="btn" style={{ flex: 1.4 }}>
                  {t('guide.hire', { name: first })}
                </Link>
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}

export function ReviewCard({ r }: { r: any }) {
  const { t } = useApp();
  const fmt = useFmt();
  return (
    <article className="card stack" style={{ gap: 8 }}>
      <div className="between">
        <strong style={{ fontSize: 15 }}>
          {r.author.name}, {r.author.country}
        </strong>
        <span className="row" style={{ gap: 1, flexWrap: 'nowrap' }} role="img" aria-label={t('review.stars', { count: Math.round(r.overall) })}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Star key={n} size={14} filled={n <= Math.round(r.overall)} />
          ))}
        </span>
      </div>
      {r.trip && (
        <span className="xs muted">
          {r.trip.title}, {fmt.date(r.trip.startDate, { month: 'long', year: 'numeric' })}
        </span>
      )}
      <p style={{ fontSize: 15, lineHeight: 1.55 }}>{r.comment}</p>
      {r.hireAgain && <span className="xs bold">{t(r.author.role === 'guide' ? 'review.would_guide_again' : 'review.would_hire_again')}</span>}
    </article>
  );
}

export function TouristProfile({ id }: { id: string }) {
  const { t } = useApp();
  const fmt = useFmt();
  const res = useLoad(() => api('GET', `/users/${id}`), [id]);
  useEffect(() => {
    if (res.data?.redirect) navigate(res.data.redirect, { replace: true });
  }, [res.data?.redirect]);
  if (res.error) return <ErrorState error={res.error} />;
  if (!res.data) return <Loading />;
  if (res.data.redirect) return null;
  const u = res.data;
  return (
    <div className="page">
      <PageHead title={t('tourist.title')} backTo="/" />
      <div className="row" style={{ gap: 14 }}>
        <Avatar user={u} size={72} />
        <div>
          <h2>{u.name}</h2>
          <div className="muted">{u.country}</div>
          <div className="xs muted">{t('guide.member_since', { date: fmt.date(u.memberSince, { month: 'long', year: 'numeric' }) })}</div>
        </div>
      </div>
      <div className="chips">
        {u.paymentVerified && <span className="pill sky">{t('badge.payment_verified')}</span>}
        {u.phoneVerified && <span className="pill sky">{t('badge.phone_verified')}</span>}
      </div>
      <div className="stat-row">
        <div>
          <div className="v">{fmt.num(u.stats.tripsCompleted)}</div>
          <div className="l">{t('tourist.trips')}</div>
        </div>
        <div>
          <div className="v">{u.stats.rating === null ? '—' : fmt.num(u.stats.rating)}</div>
          <div className="l">{t('tourist.rating')}</div>
        </div>
        <div>
          <div className="v">{fmt.num(u.stats.requestsPosted)}</div>
          <div className="l">{t('tourist.requests')}</div>
        </div>
      </div>
      <h2>{t('tourist.reviews_from_guides')}</h2>
      {u.reviews.length === 0 && <p className="muted small">{t('guide.no_reviews')}</p>}
      {u.reviews.map((r: any) => (
        <ReviewCard key={r.id} r={r} />
      ))}
    </div>
  );
}
