import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useApp, useLoad } from '../lib/app';
import { useFmt } from '../lib/format';
import { Link, navigate } from '../lib/router';
import { RequestFeedCard } from './Home';
import { Avatar, Empty, ErrorState, Field, GuideCard, Icon, Loading, Modal, Money, OfferStatus, PageHead, Rating, RequestFacts, RequestStatus, Star, Stepper, ToggleGroup, VerifiedBadge, useBusy } from '../ui';

function addDays(date: string, n: number) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000) + 1;
}

// ---------------------------------------------------------------- post
export function PostRequest({ query }: { query: Record<string, string> }) {
  const { t, meta, me, toast, errorText } = useApp();
  const fmt = useFmt();
  const direct = useLoad(() => (query.guide ? api('GET', `/guides/${query.guide}`) : Promise.resolve(null)), [query.guide]);
  const today = meta.today as string;
  const [f, setF] = useState({
    title: '',
    cities: [] as string[],
    places: [] as number[],
    startDate: addDays(today, 14),
    endDate: addDays(today, 16),
    groupSize: 2,
    languages: ['en'] as string[],
    interests: [] as string[],
    description: '',
    budgetMin: '',
    budgetMax: '',
    urgent: false,
    femaleGuide: false,
  });
  const [placeQuery, setPlaceQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { busy, run } = useBusy();
  const g = direct.data;

  useEffect(() => {
    if (g) setF((x) => ({ ...x, cities: x.cities.length ? x.cities : g.cities.slice(0, 1), languages: g.languages.some((l: any) => l.code === 'en') ? ['en'] : [g.languages[0].code] }));
  }, [g?.id]);

  const up = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));
  const days = f.startDate && f.endDate && f.endDate >= f.startDate ? daysBetween(f.startDate, f.endDate) : 0;
  const placesInCities = meta.places.filter((p: any) => f.cities.includes(p.city) && !f.places.includes(p.id) && (!placeQuery || fmt.place(p.id).toLowerCase().includes(placeQuery.toLowerCase())));
  const suggested = g && days ? g.pricePerDay * days : null;

  if (!me) {
    return (
      <div className="page">
        <PageHead title={t('post.title')} />
        <div className="card stack">
          <p>{t('post.sign_in_first')}</p>
          <div className="row">
            <Link to={'/login?next=' + encodeURIComponent('/post' + (query.guide ? `?guide=${query.guide}` : ''))} className="btn">
              {t('nav.sign_in')}
            </Link>
            <Link to="/register" className="btn outline">
              {t('nav.join')}
            </Link>
          </div>
        </div>
      </div>
    );
  }
  if (me.role !== 'tourist') {
    return (
      <div className="page">
        <PageHead title={t('post.title')} />
        <div className="note">{t('post.only_tourists')}</div>
      </div>
    );
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!f.cities.length) return setError(t('err.field_required', { field: t('field.cities') }));
    if (f.budgetMin === '' || f.budgetMax === '') return setError(t('err.field_required', { field: t('field.budgetMax') }));
    run(async () => {
      try {
        const r = await api('POST', '/requests', { ...f, budgetMin: Number(f.budgetMin), budgetMax: Number(f.budgetMax), directGuideId: g ? g.id : undefined });
        toast(g ? t('post.sent_direct', { name: g.name.split(' ')[0] }) : t('post.posted'));
        navigate(`/requests/${r.id}`, { replace: true });
      } catch (err) {
        setError(errorText(err));
        throw err;
      }
    });
  };

  return (
    <div className="page" style={{ maxWidth: 720, margin: '0 auto', width: '100%' }}>
      <PageHead title={g ? t('post.title_direct', { name: g.name.split(' ')[0] }) : t('post.title')} backTo="/" />
      {g && (
        <div className="card row" style={{ gap: 12, flexWrap: 'nowrap' }}>
          <Avatar user={g} size={48} />
          <div style={{ flex: 1 }}>
            <div className="row" style={{ gap: 6 }}>
              <strong>{g.name}</strong>
              {g.stats.verified && <VerifiedBadge />}
            </div>
            <div className="small muted">{t('post.direct_note', { amount: fmt.usd(g.pricePerDay) })}</div>
          </div>
        </div>
      )}
      <form onSubmit={submit} className="stack-lg" noValidate>
        <fieldset className="stack">
          <legend>{t('post.where_when')}</legend>
          <Field label={t('field.title')} hint={t('post.title_hint')}>
            <input className="input" value={f.title} onChange={(e) => up({ title: e.target.value })} maxLength={90} required />
          </Field>
          <ToggleGroup label={t('field.cities')} options={meta.cities.map((c: any) => c.slug)} value={f.cities} onChange={(cities) => up({ cities, places: f.places.filter((id) => cities.includes(meta.places.find((p: any) => p.id === id)?.city)) })} render={fmt.city} />
          {f.cities.length > 0 && (
            <div className="stack" style={{ gap: 6 }}>
              <span className="small" style={{ fontWeight: 500 }}>
                {t('post.places')} <span className="muted" style={{ fontWeight: 400 }}>{t('common.optional')}</span>
              </span>
              <div className="chips">
                {f.places.map((id) => (
                  <span key={id} className="chip lang" style={{ fontSize: 14 }}>
                    {fmt.place(id)}
                    <button type="button" aria-label={t('common.remove_x', { name: fmt.place(id) })} onClick={() => up({ places: f.places.filter((x) => x !== id) })} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 16, padding: '0 2px' }}>
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="chips">
                {placesInCities.slice(0, 10).map((p: any) => (
                  <button key={p.id} type="button" className="toggle-chip" style={{ borderStyle: 'dashed' }} onClick={() => up({ places: [...f.places, p.id] })}>
                    + {fmt.place(p.id)}
                  </button>
                ))}
              </div>
              {placesInCities.length > 10 && <input className="input" placeholder={t('post.find_place')} value={placeQuery} onChange={(e) => setPlaceQuery(e.target.value)} />}
            </div>
          )}
          <div className="grid-2">
            <Field label={t('field.from')}>
              <input className="input" type="date" min={today} value={f.startDate} onChange={(e) => up({ startDate: e.target.value, endDate: f.endDate < e.target.value ? e.target.value : f.endDate })} required />
            </Field>
            <Field label={t('field.to')}>
              <input className="input" type="date" min={f.startDate || today} value={f.endDate} onChange={(e) => up({ endDate: e.target.value })} required />
            </Field>
          </div>
          {days > 0 && <p className="small muted">{t('post.days', { count: days })}</p>}
        </fieldset>

        <fieldset className="stack">
          <legend>{t('post.who')}</legend>
          <Stepper label={t('field.groupSize')} value={f.groupSize} onChange={(groupSize) => up({ groupSize })} />
          <ToggleGroup label={t('post.guide_speaks')} options={meta.languages} value={f.languages} onChange={(languages) => up({ languages })} render={fmt.language} />
          {!g && (
            <label className="check">
              <input type="checkbox" checked={f.femaleGuide} onChange={(e) => up({ femaleGuide: e.target.checked })} />
              {t('post.female_guide')}
            </label>
          )}
        </fieldset>

        <fieldset className="stack">
          <legend>{t('post.into')}</legend>
          <ToggleGroup label={t('field.interests')} options={meta.interests} value={f.interests} onChange={(interests) => up({ interests })} render={(i) => t('interest.' + i)} />
          <Field label={t('post.anything_else')}>
            <textarea className="textarea" rows={4} value={f.description} onChange={(e) => up({ description: e.target.value })} maxLength={2000} placeholder={t('post.anything_placeholder')} />
          </Field>
        </fieldset>

        <fieldset className="stack">
          <legend>{t('post.budget')}</legend>
          <div className="grid-2">
            <Field label={t('field.budgetMin')}>
              <input className="input" inputMode="numeric" value={f.budgetMin} onChange={(e) => up({ budgetMin: e.target.value.replace(/\D/g, '') })} placeholder="$" />
            </Field>
            <Field label={t('field.budgetMax')}>
              <input className="input" inputMode="numeric" value={f.budgetMax} onChange={(e) => up({ budgetMax: e.target.value.replace(/\D/g, '') })} placeholder="$" />
            </Field>
          </div>
          {f.budgetMax !== '' && (
            <p className="small muted">
              {t('post.iqd', { min: fmt.iqd(Number(f.budgetMin || 0)), max: fmt.iqd(Number(f.budgetMax)) })}
            </p>
          )}
          {suggested !== null && (
            <p className="small muted">
              {t('post.guide_rate', { name: g.name.split(' ')[0], amount: fmt.usd(suggested), count: days })}{' '}
              <button type="button" className="linkish" onClick={() => up({ budgetMin: String(suggested), budgetMax: String(suggested) })}>
                {t('post.use_rate')}
              </button>
            </p>
          )}
          {!g && (
            <label className="check">
              <input type="checkbox" checked={f.urgent} onChange={(e) => up({ urgent: e.target.checked })} />
              {t('post.urgent')}
            </label>
          )}
        </fieldset>

        <div className="note">{g ? t('post.privacy_direct', { name: g.name.split(' ')[0] }) : t('post.privacy')}</div>
        {error && (
          <div className="note danger" role="alert">
            {error}
          </div>
        )}
        <button type="submit" className="btn lg" disabled={busy}>
          {g ? t('post.send_direct', { name: g.name.split(' ')[0] }) : t('post.submit')}
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------- lists
export function RequestsIndex({ query }: { query: Record<string, string> }) {
  const { me } = useApp();
  if (me?.role === 'guide' || me?.role === 'admin') return <BrowseRequests query={query} />;
  return <MyRequests />;
}

function MyRequests() {
  const { t, me } = useApp();
  const fmt = useFmt();
  const res = useLoad(() => (me ? api('GET', '/requests/mine') : Promise.resolve({ requests: [] })), [me?.id]);
  if (!me) return null;
  if (res.error) return <ErrorState error={res.error} onRetry={res.reload} />;
  if (!res.data) return <Loading />;
  return (
    <div className="page">
      <PageHead title={t('requests.mine')}>
        <Link to="/post" className="btn sm">
          <Icon name="plus" size={18} /> {t('nav.post_request')}
        </Link>
      </PageHead>
      {res.data.requests.length === 0 && <Empty title={t('requests.none')} text={t('requests.none_text')} action={<Link to="/post" className="btn">{t('home.cta_post')}</Link>} />}
      <div className="cards">
        {res.data.requests.map((r: any) => (
          <Link key={r.id} to={`/requests/${r.id}`} className="card link stack" style={{ gap: 10 }}>
            <div className="between">
              <div className="row">
                <RequestStatus status={r.status} />
                {r.directGuide && <span className="pill">{t('request.direct_to', { name: r.directGuide.name })}</span>}
              </div>
              <span className="xs muted">{fmt.ago(r.createdAt)}</span>
            </div>
            <strong style={{ fontSize: 17 }}>{r.title}</strong>
            <RequestFacts r={r} />
            <div className="small">
              <strong>{t('request.offers_n', { count: r.offersCount })}</strong>
              {r.avgOffer !== null && <span className="muted"> · {t('request.avg', { amount: fmt.usd(r.avgOffer) })}</span>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function BrowseRequests({ query }: { query: Record<string, string> }) {
  const { t, meta } = useApp();
  const fmt = useFmt();
  const f = { city: query.city || '', lang: query.lang || '', interest: query.interest || '', matching: query.matching ?? '1', q: query.q || '' };
  const res = useLoad(() => api('GET', '/requests', undefined, f), [JSON.stringify(f)]);
  const set = (patch: Record<string, string>) => {
    const next = { ...f, ...patch };
    navigate('/requests?' + new URLSearchParams(Object.entries(next).filter(([, v]) => v !== '')).toString(), { replace: true });
  };
  return (
    <div className="page">
      <PageHead title={t('requests.browse')} />
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={f.matching === '1'} onClick={() => set({ matching: '1' })}>
          {t('requests.matching')}
        </button>
        <button role="tab" aria-selected={f.matching !== '1'} onClick={() => set({ matching: '0' })}>
          {t('requests.all')}
        </button>
      </div>
      <div className="grid-2">
        <Field label={t('field.city')}>
          <select className="select" value={f.city} onChange={(e) => set({ city: e.target.value })}>
            <option value="">{t('common.any')}</option>
            {meta.cities.map((c: any) => (
              <option key={c.slug} value={c.slug}>
                {fmt.city(c.slug)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('field.interest')}>
          <select className="select" value={f.interest} onChange={(e) => set({ interest: e.target.value })}>
            <option value="">{t('common.any')}</option>
            {meta.interests.map((i: string) => (
              <option key={i} value={i}>
                {t('interest.' + i)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {res.error ? (
        <ErrorState error={res.error} onRetry={res.reload} />
      ) : !res.data ? (
        <div className="skeleton" style={{ height: 200 }} />
      ) : res.data.requests.length === 0 ? (
        <Empty title={t('requests.none_open')} text={f.matching === '1' ? t('requests.none_matching') : undefined} />
      ) : (
        <div className="cards">
          {res.data.requests.map((r: any) => (
            <RequestFeedCard key={r.id} r={r} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- detail
export function RequestDetail({ id }: { id: string }) {
  const { me } = useApp();
  const res = useLoad(() => api('GET', `/requests/${id}`), [id, me?.id]);
  if (!me) return null;
  if (res.error) return <ErrorState error={res.error} onRetry={res.reload} />;
  if (!res.data) return <Loading />;
  return me.role === 'guide' ? <GuideRequestView r={res.data} reload={res.reload} /> : <TouristRequestView r={res.data} reload={res.reload} />;
}

function RequestHeader({ r }: { r: any }) {
  const { t } = useApp();
  const fmt = useFmt();
  return (
    <section className="stack" style={{ gap: 10 }}>
      <div className="row">
        <RequestStatus status={r.status} />
        {r.urgent && <span className="pill gold">{t('request.urgent')}</span>}
        {r.femaleGuide && <span className="pill">{t('request.female_pref')}</span>}
        {r.directGuide && <span className="pill navy">{t('request.direct_to', { name: r.directGuide.name })}</span>}
        <span className="xs muted" style={{ marginInlineStart: 'auto' }}>
          {t('request.posted', { when: fmt.ago(r.createdAt) })}
        </span>
      </div>
      <h1 style={{ fontWeight: 900 }}>{r.title}</h1>
      <RequestFacts r={r} />
      {r.interests.length > 0 && (
        <div className="chips">
          {r.interests.map((i: string) => (
            <span key={i} className="chip">
              {t('interest.' + i)}
            </span>
          ))}
        </div>
      )}
      {r.places.length > 0 && <p className="small">{t('request.wants_to_see', { places: fmt.list(r.places.map((p: number) => fmt.place(p))) })}</p>}
      {r.description && <p className="quote">{r.description}</p>}
    </section>
  );
}

function TouristRequestView({ r, reload }: { r: any; reload(): void }) {
  const { t, toast, ask } = useApp();
  const fmt = useFmt();
  const [tab, setTab] = useState<'offers' | 'shortlist' | 'invite'>('offers');
  const [sort, setSort] = useState('rating');
  const [compare, setCompare] = useState(false);
  const [hireOffer, setHireOffer] = useState<any>(null);
  const { busy, run } = useBusy();
  const shortlisted = r.offers.filter((o: any) => o.shortlisted);
  const visible = (tab === 'shortlist' ? shortlisted : r.offers).slice().sort((a: any, b: any) => {
    if (sort === 'price') return a.price - b.price;
    if (sort === 'newest') return b.createdAt.localeCompare(a.createdAt);
    return (b.guide.stats.rating || 0) - (a.guide.stats.rating || 0);
  });

  const toggleShort = (o: any) => run(async () => {
    await api('POST', `/offers/${o.id}/shortlist`, { on: !o.shortlisted });
    reload();
  });
  const chat = (o: any) => run(async () => {
    const th = await api('POST', '/threads', { guideId: o.guideId, requestId: r.id });
    navigate(`/messages/${th.id}`);
  });
  const close = async () => {
    if (!(await ask(t('request.close_confirm'), t('request.close')))) return;
    run(async () => {
      await api('POST', `/requests/${r.id}/close`);
      reload();
    }, t('request.closed_toast'));
  };

  return (
    <div className="page">
      <PageHead title="" backTo="/requests" />
      <div className="split">
        <div className="stack-lg">
          <RequestHeader r={r} />
          {r.booking && ['awaiting_guide', 'confirmed', 'completed', 'disputed'].includes(r.booking.status) && (
            <Link to={`/bookings/${r.booking.id}`} className="card attention link between">
              <strong>{t('request.see_booking')}</strong>
              <Icon name="next" className="flip" />
            </Link>
          )}
          <div className="stat-row">
            <div>
              <div className="v">{fmt.num(r.offersCount)}</div>
              <div className="l">{t('request.offers_label')}</div>
            </div>
            <div>
              <div className="v">{r.avgOffer === null ? '—' : fmt.usd(r.avgOffer)}</div>
              <div className="l">{t('request.average')}</div>
            </div>
            <div>
              <div className="v">{fmt.num(shortlisted.length)}</div>
              <div className="l">{t('request.shortlisted')}</div>
            </div>
          </div>
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'offers'} onClick={() => setTab('offers')}>
              {t('request.tab_offers', { count: r.offers.length })}
            </button>
            <button role="tab" aria-selected={tab === 'shortlist'} onClick={() => setTab('shortlist')}>
              {t('request.tab_shortlist', { count: shortlisted.length })}
            </button>
            {r.status === 'open' && !r.directGuide && (
              <button role="tab" aria-selected={tab === 'invite'} onClick={() => setTab('invite')}>
                {t('request.tab_invite')}
              </button>
            )}
          </div>

          {tab === 'invite' ? (
            <InviteGuides r={r} reload={reload} />
          ) : (
            <>
              <div className="between">
                <button type="button" className="btn sm" style={{ background: 'var(--sky)', color: 'var(--navy)' }} disabled={shortlisted.length < 2} onClick={() => setCompare(true)}>
                  {t('request.compare')}
                </button>
                <label className="row small muted" style={{ gap: 6, flexWrap: 'nowrap' }}>
                  {t('guides.sort')}
                  <select className="select" style={{ minHeight: 38, width: 'auto' }} value={sort} onChange={(e) => setSort(e.target.value)}>
                    <option value="rating">{t('request.sort_rating')}</option>
                    <option value="price">{t('request.sort_price')}</option>
                    <option value="newest">{t('request.sort_newest')}</option>
                  </select>
                </label>
              </div>
              {shortlisted.length < 2 && r.offers.length > 1 && <p className="xs muted">{t('request.compare_hint')}</p>}
              {visible.length === 0 && <Empty title={tab === 'shortlist' ? t('request.no_shortlist') : t('request.no_offers')} text={tab === 'shortlist' ? t('request.no_shortlist_text') : t('request.no_offers_text')} />}
              {visible.map((o: any) => (
                <OfferCard key={o.id} o={o} r={r} onShort={() => toggleShort(o)} onChat={() => chat(o)} onHire={() => setHireOffer(o)} busy={busy} />
              ))}
            </>
          )}
        </div>
        <aside className="stack">
          {r.status === 'open' && (
            <div className="card stack">
              <strong>{t('request.manage')}</strong>
              <p className="small muted">{t('request.manage_text')}</p>
              <button type="button" className="btn ghost sm" onClick={close} disabled={busy}>
                {t('request.close')}
              </button>
            </div>
          )}
          <div className="note small">{t('request.how_payment')}</div>
        </aside>
      </div>
      {compare && <CompareModal offers={shortlisted} r={r} onClose={() => setCompare(false)} onHire={(o: any) => { setCompare(false); setHireOffer(o); }} />}
      {hireOffer && (
        <HireModal
          offer={hireOffer}
          r={r}
          onClose={() => setHireOffer(null)}
          onDone={(b: any) => {
            setHireOffer(null);
            toast(t('hire.done', { name: hireOffer.guide.name.split(' ')[0] }));
            navigate(`/bookings/${b.id}`);
          }}
        />
      )}
    </div>
  );
}

function OfferCard({ o, r, onShort, onChat, onHire, busy }: { o: any; r: any; onShort(): void; onChat(): void; onHire(): void; busy: boolean }) {
  const { t } = useApp();
  const fmt = useFmt();
  const [open, setOpen] = useState(o.shortlisted);
  const g = o.guide;
  const canHire = r.status === 'open' && o.status === 'pending';
  return (
    <article className={'card flush' + (o.shortlisted ? ' highlight' : '')}>
      <div className="stack" style={{ padding: 16 }}>
        <div className="row" style={{ gap: 12, flexWrap: 'nowrap' }}>
          <Avatar user={g} size={48} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="row" style={{ gap: 6 }}>
              <Link to={`/guides/${g.id}`} style={{ fontWeight: 700, fontSize: 16, textDecoration: 'none' }}>
                {g.name}
              </Link>
              {g.stats.verified && <VerifiedBadge size={16} />}
              {g.stats.topGuide && <span className="pill gold">{t('badge.top')}</span>}
            </div>
            <div className="row xs muted" style={{ gap: 8 }}>
              <Rating rating={g.stats.rating} count={g.stats.reviewsCount} size={13} />
              <span>{t('guide.tours', { count: g.stats.toursCompleted })}</span>
            </div>
          </div>
          <button type="button" className="icon-btn" aria-pressed={o.shortlisted} aria-label={o.shortlisted ? t('request.unshortlist') : t('request.shortlist')} onClick={onShort} disabled={busy}>
            <Star size={22} filled={o.shortlisted} />
          </button>
        </div>
        <div className="row" style={{ alignItems: 'baseline' }}>
          <strong style={{ fontSize: 26 }}>{fmt.usd(o.price)}</strong>
          <span className="small muted">{t('offer.for_days', { count: o.plan.length, perDay: fmt.usd(o.perDay) })}</span>
          {o.status !== 'pending' && <OfferStatus status={o.status} />}
        </div>
        <p className="quote">{o.message}</p>
        {open ? (
          <>
            <ol className="stack" style={{ listStyle: 'none', margin: 0, padding: 0, gap: 8 }}>
              {o.plan.map((d: any, i: number) => (
                <li key={i} className="row small" style={{ gap: 10, alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                  <strong style={{ flex: 'none', minWidth: 54 }}>{t('offer.day_n', { count: i + 1 })}</strong>
                  <span>
                    <strong>{d.title}</strong>
                    {d.details && <span className="muted"> {d.details}</span>}
                  </span>
                </li>
              ))}
            </ol>
            {o.includes.length > 0 && <div className="xs muted">{t('offer.includes', { list: fmt.list(o.includes.map((x: string) => t('include.' + x))) })}</div>}
          </>
        ) : (
          <button type="button" className="linkish small" style={{ alignSelf: 'flex-start' }} onClick={() => setOpen(true)} aria-expanded={false}>
            {t('offer.see_plan')}
          </button>
        )}
      </div>
      <div className="card-foot">
        <button type="button" className="btn outline" style={{ flex: 1 }} onClick={onChat} disabled={busy}>
          {t('offer.chat')}
        </button>
        {canHire && (
          <button type="button" className="btn" style={{ flex: 1.4 }} onClick={onHire}>
            {t('offer.hire_for', { amount: fmt.usd(o.price) })}
          </button>
        )}
      </div>
    </article>
  );
}

function CompareModal({ offers, r, onClose, onHire }: { offers: any[]; r: any; onClose(): void; onHire(o: any): void }) {
  const { t } = useApp();
  const fmt = useFmt();
  const rows: [string, (o: any) => React.ReactNode][] = [
    [t('compare.total'), (o) => <strong>{fmt.usd(o.price)}</strong>],
    [t('compare.per_day'), (o) => fmt.usd(o.perDay)],
    [t('compare.rating'), (o) => (o.guide.stats.rating === null ? t('guide.new') : `${fmt.num(o.guide.stats.rating)} (${fmt.num(o.guide.stats.reviewsCount)})`)],
    [t('compare.tours'), (o) => fmt.num(o.guide.stats.toursCompleted)],
    [t('compare.verified'), (o) => (o.guide.stats.verified ? t('common.yes') : t('common.no'))],
    [t('compare.includes'), (o) => (o.includes.length ? fmt.list(o.includes.map((x: string) => t('include.' + x))) : '—')],
    [t('compare.reply'), (o) => (o.guide.stats.responseMinutes === null ? '—' : o.guide.stats.responseMinutes < 60 ? t('compare.mins', { count: o.guide.stats.responseMinutes }) : t('compare.hours', { count: Math.round(o.guide.stats.responseMinutes / 60) }))],
    ...offers[0].plan.map((_: any, i: number) => [t('offer.day_n', { count: i + 1 }), (o: any) => o.plan[i]?.title] as [string, (o: any) => React.ReactNode]),
  ];
  return (
    <Modal title={t('request.compare_title')} onClose={onClose}>
      <div className="table-wrap">
        <table className="compare">
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">{t('compare.item')}</span>
              </th>
              {offers.map((o) => (
                <th key={o.id} scope="col">
                  {o.guide.name.split(' ')[0]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, cell]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                {offers.map((o) => (
                  <td key={o.id}>{cell(o)}</td>
                ))}
              </tr>
            ))}
            {r.status === 'open' && (
              <tr>
                <th scope="row" />
                {offers.map((o) => (
                  <td key={o.id}>
                    {o.status === 'pending' && (
                      <button type="button" className="btn sm" onClick={() => onHire(o)}>
                        {t('offer.hire')}
                      </button>
                    )}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

function HireModal({ offer, r, onClose, onDone }: { offer: any; r: any; onClose(): void; onDone(b: any): void }) {
  const { t, meta, me, errorText } = useApp();
  const fmt = useFmt();
  const [card, setCard] = useState(me.paymentVerified ? '4242 4242 4242 4242' : '');
  const [agree, setAgree] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const first = offer.guide.name.split(' ')[0];
  const go = async () => {
    setErr(null);
    if (!/^\d{12,19}$/.test(card.replace(/\s/g, ''))) return setErr(t('err.card_invalid'));
    if (!agree) return setErr(t('hire.agree_needed'));
    setBusy(true);
    try {
      if (!me.paymentVerified) await api('POST', '/me/verify-payment', { card });
      onDone(await api('POST', `/offers/${offer.id}/hire`, { confirmPayment: true }));
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={t('hire.title', { name: first })} onClose={onClose}>
      <div className="card stack" style={{ gap: 6 }}>
        <div className="between">
          <span>{r.title}</span>
        </div>
        <div className="between small muted">
          <span>{fmt.range(r.startDate, r.endDate)}</span>
          <span>{t('offer.for_days', { count: offer.plan.length, perDay: fmt.usd(offer.perDay) })}</span>
        </div>
        <hr className="divider" />
        <div className="between">
          <strong>{t('hire.you_pay')}</strong>
          <Money usd={offer.price} iqd className="bold" />
        </div>
      </div>
      <p className="small">{t('hire.explain', { name: first, hours: meta.confirmWindowHours })}</p>
      <Field label={t('hire.card')} hint={t('hire.card_hint')}>
        <input className="input ltr" inputMode="numeric" autoComplete="off" value={card} onChange={(e) => setCard(e.target.value.replace(/[^\d ]/g, '').slice(0, 23))} placeholder="4242 4242 4242 4242" />
      </Field>
      <label className="check small">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        {t('hire.agree')}
      </label>
      {err && (
        <div className="note danger" role="alert">
          {err}
        </div>
      )}
      <button type="button" className="btn lg" onClick={go} disabled={busy}>
        {t('hire.pay', { amount: fmt.usd(offer.price) })}
      </button>
    </Modal>
  );
}

function InviteGuides({ r, reload }: { r: any; reload(): void }) {
  const { t } = useApp();
  const res = useLoad(() => api('GET', `/requests/${r.id}/suggested-guides`), [r.id]);
  const { busy, run } = useBusy();
  if (!res.data) return <div className="skeleton" style={{ height: 160 }} />;
  if (!res.data.guides.length) return <p className="muted">{t('invite.none')}</p>;
  return (
    <div className="stack">
      <p className="small muted">{t('invite.text')}</p>
      {res.data.guides.map((g: any) => (
        <div key={g.id} className="stack" style={{ gap: 6 }}>
          <GuideCard g={g} compact />
          <button
            type="button"
            className={'btn sm ' + (g.invited ? 'ghost' : 'outline')}
            disabled={g.invited || busy}
            onClick={() =>
              run(async () => {
                await api('POST', `/requests/${r.id}/invite`, { guideId: g.id });
                res.reload();
                reload();
              }, t('invite.sent', { name: g.name.split(' ')[0] }))
            }
          >
            {g.invited ? t('invite.invited') : t('invite.invite', { name: g.name.split(' ')[0] })}
          </button>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- guide side
function GuideRequestView({ r, reload }: { r: any; reload(): void }) {
  const { t, me, ask } = useApp();
  const fmt = useFmt();
  const mine = r.offers[0] || null;
  const [editing, setEditing] = useState(!mine);
  const { busy, run } = useBusy();
  const withdraw = async () => {
    if (!(await ask(t('offer.withdraw_confirm'), t('offer.withdraw')))) return;
    run(async () => {
      await api('POST', `/offers/${mine.id}/withdraw`);
      reload();
      setEditing(true);
    }, t('offer.withdrawn_toast'));
  };
  const message = () =>
    run(async () => {
      const th = await api('POST', '/threads', { touristId: r.touristId, requestId: r.id });
      navigate(`/messages/${th.id}`);
    });
  useEffect(() => {
    if (window.location.hash.includes('offer')) document.getElementById('offer')?.scrollIntoView();
  }, []);
  return (
    <div className="page">
      <PageHead title="" backTo="/requests" />
      <div className="split">
        <div className="stack-lg">
          <RequestHeader r={r} />
          <div className="card row" style={{ gap: 12, flexWrap: 'nowrap' }}>
            <Avatar user={r.tourist} size={44} />
            <div style={{ flex: 1 }}>
              <Link to={`/users/${r.tourist.id}`} className="bold" style={{ textDecoration: 'none' }}>
                {r.tourist.name}
              </Link>
              <div className="xs muted">
                {r.tourist.country}
                {r.tourist.paymentVerified && ` · ${t('badge.payment_verified')}`}
              </div>
              <div className="xs muted">
                {r.tourist.stats.rating !== null ? t('request.tourist_rating', { rating: fmt.num(r.tourist.stats.rating) }) : t('request.new_tourist')} · {t('tourist.trips_n', { count: r.tourist.stats.tripsCompleted })}
              </div>
            </div>
          </div>
          {r.booking && r.booking.guideId === me.id && (
            <Link to={`/bookings/${r.booking.id}`} className="card attention link between">
              <strong>{t('request.see_booking')}</strong>
              <Icon name="next" className="flip" />
            </Link>
          )}
          <section id="offer" className="stack">
            {mine && !editing ? (
              <div className="card stack">
                <div className="between">
                  <h2>{t('offer.yours')}</h2>
                  <OfferStatus status={mine.status} />
                </div>
                <div className="row" style={{ alignItems: 'baseline' }}>
                  <strong style={{ fontSize: 26 }}>{fmt.usd(mine.price)}</strong>
                  <span className="small muted">{t('offer.for_days', { count: mine.plan.length, perDay: fmt.usd(mine.perDay) })}</span>
                </div>
                <ol className="stack small" style={{ listStyle: 'none', margin: 0, padding: 0, gap: 6 }}>
                  {mine.plan.map((d: any, i: number) => (
                    <li key={i}>
                      <strong>{t('offer.day_n', { count: i + 1 })}:</strong> {d.title}
                    </li>
                  ))}
                </ol>
                <p className="quote">{mine.message}</p>
                {mine.status === 'pending' && r.status === 'open' && (
                  <div className="row">
                    <button type="button" className="btn outline sm" onClick={() => setEditing(true)}>
                      <Icon name="edit" size={16} /> {t('offer.edit')}
                    </button>
                    <button type="button" className="btn danger sm" onClick={withdraw} disabled={busy}>
                      {t('offer.withdraw')}
                    </button>
                  </div>
                )}
              </div>
            ) : r.status === 'open' ? (
              <OfferForm r={r} existing={mine && mine.status === 'pending' ? mine : null} onDone={() => { setEditing(false); reload(); }} onCancel={mine ? () => setEditing(false) : undefined} />
            ) : (
              <div className="note">{t('offer.closed')}</div>
            )}
          </section>
        </div>
        <aside className="stack">
          <div className="stat-row">
            <div>
              <div className="v">{fmt.num(r.offersCount)}</div>
              <div className="l">{t('request.offers_label')}</div>
            </div>
            <div>
              <div className="v">{r.avgOffer === null ? '—' : fmt.usd(r.avgOffer)}</div>
              <div className="l">{t('request.average')}</div>
            </div>
            <div>
              <div className="v">{fmt.num(r.days)}</div>
              <div className="l">{t('request.days_label')}</div>
            </div>
          </div>
          {mine && (
            <button type="button" className="btn outline" onClick={message} disabled={busy}>
              {t('offer.message_tourist', { name: r.tourist.name.split(' ')[0] })}
            </button>
          )}
          <p className="xs muted">{t('offer.guide_note')}</p>
        </aside>
      </div>
    </div>
  );
}

function OfferForm({ r, existing, onDone, onCancel }: { r: any; existing: any; onDone(): void; onCancel?(): void }) {
  const { t, meta, me, errorText, toast } = useApp();
  const fmt = useFmt();
  const days = useMemo(() => Array.from({ length: r.days }, (_, i) => addDays(r.startDate, i)), [r.days, r.startDate]);
  const rate = me.guide?.pricePerDay || 40;
  const [price, setPrice] = useState(String(existing?.price ?? rate * r.days));
  const [plan, setPlan] = useState<{ title: string; details: string }[]>(existing?.plan ?? days.map(() => ({ title: '', details: '' })));
  const [includes, setIncludes] = useState<string[]>(existing?.includes ?? ['transport']);
  const [message, setMessage] = useState(existing?.message ?? '');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const p = Number(price) || 0;
  const fee = Math.round(p * meta.feeRate * 100) / 100;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const body = { price: p, plan, includes, message };
      if (existing) await api('PUT', `/offers/${existing.id}`, body);
      else await api('POST', `/requests/${r.id}/offers`, body);
      toast(existing ? t('offer.updated_toast') : t('offer.sent_toast'));
      onDone();
    } catch (e2) {
      setErr(errorText(e2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="stack-lg card" onSubmit={submit} noValidate>
      <h2>{existing ? t('offer.edit_title') : t('offer.send_title')}</h2>
      <fieldset className="stack">
        <legend>{t('offer.your_price')}</legend>
        <label className="price-input">
          <span style={{ fontSize: 20, fontWeight: 700 }}>$</span>
          <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))} aria-label={t('offer.price_label')} />
          <span className="small muted">{t('offer.whole_trip')}</span>
        </label>
        <div className="note" style={{ lineHeight: 1.7 }}>
          <div className="between">
            <span>{t('offer.tourist_pays')}</span>
            <span>{fmt.usd(p)}</span>
          </div>
          <div className="between">
            <span>{t('offer.fee', { pct: Math.round(meta.feeRate * 100) })}</span>
            <span>{fmt.usd(-fee)}</span>
          </div>
          <div className="between bold" style={{ borderTop: '1px solid #b9dde8', marginTop: 4, paddingTop: 4 }}>
            <span>{t('offer.you_receive')}</span>
            <span>{fmt.usd(Math.round((p - fee) * 100) / 100)}</span>
          </div>
        </div>
        <p className="xs muted">
          {r.offersCount > (existing ? 1 : 0) && r.avgOffer !== null ? t('offer.others', { count: r.offersCount - (existing ? 1 : 0), amount: fmt.usd(r.avgOffer) }) : t('offer.first')} {t('offer.budget_was', { min: fmt.usd(r.budgetMin), max: fmt.usd(r.budgetMax) })}
        </p>
      </fieldset>

      <fieldset className="stack">
        <legend>{t('offer.your_plan')}</legend>
        {days.map((d, i) => (
          <div key={d} className="card stack" style={{ background: 'var(--paper)', gap: 8 }}>
            <strong className="small">
              {t('offer.day_n', { count: i + 1 })}, {fmt.dateLong(d)}
            </strong>
            <Field label={t('field.title')}>
              <input className="input" value={plan[i]?.title || ''} onChange={(e) => setPlan(plan.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} maxLength={80} placeholder={t('offer.day_title_ph')} />
            </Field>
            <Field label={t('offer.what_we_do')}>
              <textarea className="textarea" rows={3} value={plan[i]?.details || ''} onChange={(e) => setPlan(plan.map((x, j) => (j === i ? { ...x, details: e.target.value } : x)))} maxLength={600} />
            </Field>
          </div>
        ))}
      </fieldset>

      <ToggleGroup label={t('offer.included')} options={meta.includes} value={includes} onChange={setIncludes} render={(x) => t('include.' + x)} />

      <Field label={t('offer.message_to', { name: r.tourist.name.split(' ')[0] })} hint={t('offer.message_hint')}>
        <textarea className="textarea" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} />
      </Field>
      {err && (
        <div className="note danger" role="alert">
          {err}
        </div>
      )}
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        {onCancel && (
          <button type="button" className="btn ghost" onClick={onCancel}>
            {t('common.cancel')}
          </button>
        )}
        <button type="submit" className="btn lg" style={{ flex: 1 }} disabled={busy}>
          {existing ? t('offer.save') : t('offer.send')}
        </button>
      </div>
      {!existing && <p className="xs muted center">{t('offer.can_edit', { name: r.tourist.name.split(' ')[0] })}</p>}
    </form>
  );
}

export function MyOffers() {
  const { t } = useApp();
  const fmt = useFmt();
  const [tab, setTab] = useState('active');
  const res = useLoad(() => api('GET', '/offers/mine'), []);
  if (res.error) return <ErrorState error={res.error} onRetry={res.reload} />;
  if (!res.data) return <Loading />;
  const groups: Record<string, string[]> = { active: ['pending', 'awarded'], won: ['accepted'], past: ['declined', 'withdrawn', 'not_selected'] };
  const list = res.data.offers.filter((o: any) => groups[tab].includes(o.status));
  return (
    <div className="page">
      <PageHead title={t('offers.title')} />
      <div className="tabs" role="tablist">
        {Object.keys(groups).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {t('offers.tab_' + k, { count: res.data.offers.filter((o: any) => groups[k].includes(o.status)).length })}
          </button>
        ))}
      </div>
      {list.length === 0 && <Empty title={t('offers.none')} action={<Link to="/requests" className="btn">{t('nav.find_requests')}</Link>} />}
      <div className="cards">
        {list.map((o: any) => (
          <Link key={o.id} to={o.booking && ['awarded', 'accepted'].includes(o.status) ? `/bookings/${o.booking.id}` : `/requests/${o.requestId}`} className="card link stack" style={{ gap: 8 }}>
            <div className="between">
              <OfferStatus status={o.status} />
              <span className="xs muted">{fmt.ago(o.updatedAt)}</span>
            </div>
            <strong>{o.request.title}</strong>
            <div className="small muted">
              {fmt.range(o.request.startDate, o.request.endDate)} · {o.request.tourist.name}
            </div>
            <div className="between small">
              <span>
                {t('offers.your_price')} <strong>{fmt.usd(o.price)}</strong>
              </span>
              <span className="muted">{t('request.offers_n', { count: o.request.offersCount })}</span>
            </div>
            {o.status === 'awarded' && <span className="note warn small">{t('offers.awarded_note')}</span>}
          </Link>
        ))}
      </div>
    </div>
  );
}
