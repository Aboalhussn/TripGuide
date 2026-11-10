// Identity verification for guides, special events, the admin's payouts and "what to add" sheet,
// and the tourist home sections (offers and special events).
import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useApp, useLoad } from '../lib/app';
import { useFmt } from '../lib/format';
import { Link, navigate } from '../lib/router';
import { coverSrc } from '../assets';
import { resizeImage } from '../lib/image';
import { Avatar, Empty, ErrorState, Field, HeroBand, Icon, Loading, Modal, PageHead, VerifiedBadge, useBusy } from '../ui';

/* ---------- Guides: prove who you are (ID front, ID back, residence card), step by step ---------- */

const DOCS = ['idFront', 'idBack', 'residence'] as const;
type DocKey = (typeof DOCS)[number];

export function VerifyAccount() {
  const { t, me, refreshMe, toast, errorText } = useApp();
  const [step, setStep] = useState(0);
  const [docs, setDocs] = useState<Record<DocKey, string>>({ idFront: '', idBack: '', residence: '' });
  const [tried, setTried] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { busy, run } = useBusy();
  if (!me || me.role !== 'guide') return null;
  const g = me.guide;
  const status = g.verification as string;

  if (status === 'verified' || status === 'pending') {
    return (
      <div className="page" style={{ maxWidth: 640, margin: '0 auto', width: '100%' }}>
        <PageHead title={t('verify.title')} backTo="/" />
        <HeroBand img="ishtar.jpg" title={t('idv.title')} text={t('idv.text')} />
        {status === 'verified' ? (
          <>
            <div className="card row" style={{ gap: 10, flexWrap: 'nowrap' }}>
              <VerifiedBadge size={22} /> <span>{t('verify.status_text.verified')}</span>
            </div>
            {!g.profileComplete && (
              <Link to="/guide/setup" className="btn lg">
                {t('idv.now_profile')}
              </Link>
            )}
          </>
        ) : (
          <div className="note warn verify-wait" role="status">
            <Icon name="clock" size={20} />
            <span>
              <strong>{t('verifyp.sent_title')}</strong>
              <br />
              {t('idv.pending_text')}
            </span>
          </div>
        )}
      </div>
    );
  }

  const key = DOCS[step];
  const last = DOCS.length - 1;
  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const img = await resizeImage(file, { max: 1400 });
      setDocs((d) => ({ ...d, [key]: img }));
      setTried(false);
    } catch {
      toast(t('err.photo_invalid'), 'error');
    }
  };
  const goBack = () => {
    setTried(false);
    if (step === 0) navigate('/');
    else setStep(step - 1);
  };
  const next = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!docs[key]) {
      setTried(true);
      return;
    }
    if (step < last) {
      setTried(false);
      setStep(step + 1);
      return;
    }
    run(async () => {
      try {
        await api('POST', '/guide/verification', docs);
        await refreshMe();
        window.scrollTo({ top: 0 });
      } catch (x) {
        setErr(errorText(x));
        throw x;
      }
    });
  };
  return (
    <div className="page post-wizard id-wizard" style={{ maxWidth: 640, margin: '0 auto', width: '100%' }}>
      <div className="wiz-head">
        <div className="wiz-top">
          <button type="button" className="back icon-btn" aria-label={step === 0 ? t('common.back') : t('post.prev')} onClick={goBack}>
            <Icon name="back" />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="xs muted">{t('verify.title')}</div>
            <div className="small bold">{t('post.step_n', { n: step + 1, total: DOCS.length })}</div>
          </div>
        </div>
        <div className="wiz-progress" role="progressbar" aria-valuemin={1} aria-valuemax={DOCS.length} aria-valuenow={step + 1} aria-label={t('post.step_n', { n: step + 1, total: DOCS.length })}>
          {DOCS.map((d, i) => (
            <i key={d} className={i <= step ? 'on' : ''} />
          ))}
        </div>
      </div>
      <div className="wiz-hero" key={key}>
        <HeroBand img={step === 0 ? 'ishtar.jpg' : step === 1 ? 'gate.jpg' : 'babylon.jpg'} title={t(`idv.${key}_title`)} text={t(`idv.${key}_text`)} />
      </div>
      <form onSubmit={next} className="stack-lg wiz-body" noValidate>
        {status === 'rejected' && step === 0 && <p className="note danger">{t('verify.rejected_note', { note: g.verificationNote })}</p>}
        <label className={'id-drop' + (docs[key] ? ' has' : '') + (tried && !docs[key] ? ' bad' : '')}>
          {docs[key] ? (
            <>
              <img src={docs[key]} alt={t(`idv.${key}_title`)} />
              <span className="pp-change">{t('idv.retake')}</span>
            </>
          ) : (
            <>
              <IdArt kind={key} />
              <strong>{t('idv.upload')}</strong>
              <span className="xs muted">{t('idv.upload_hint')}</span>
            </>
          )}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label={t(`idv.${key}_title`)} onChange={pick} />
        </label>
        {tried && !docs[key] && (
          <span className="err small" role="alert">
            {t('idv.v_photo')}
          </span>
        )}
        <ul className="id-tips small">
          <li>{t('idv.tip_clear')}</li>
          <li>{t('idv.tip_edges')}</li>
          <li>{t('idv.tip_private')}</li>
        </ul>
        {err && (
          <div className="note danger" role="alert">
            {err}
          </div>
        )}
        <div className="wiz-actions">
          {step > 0 && (
            <button type="button" className="btn lg ghost" onClick={goBack}>
              {t('post.prev')}
            </button>
          )}
          <button type="submit" className="btn lg" disabled={busy} style={{ flex: 1 }}>
            {step < last ? t('post.next') : t('idv.send')}
          </button>
        </div>
      </form>
    </div>
  );
}

// A small drawing of the card to upload, so each step is clear at a glance.
function IdArt({ kind }: { kind: DocKey }) {
  return (
    <svg viewBox="0 0 120 76" width={150} aria-hidden="true" className="id-art">
      <rect x="2" y="2" width="116" height="72" rx="9" fill="#fff" stroke="currentColor" strokeWidth="2.5" />
      {kind === 'idFront' && (
        <>
          <rect x="12" y="18" width="30" height="38" rx="5" fill="currentColor" opacity=".25" />
          <path d="M52 24h52M52 36h40M52 48h46" stroke="currentColor" strokeWidth="4" strokeLinecap="round" opacity=".55" />
        </>
      )}
      {kind === 'idBack' && (
        <>
          <path d="M14 20h92M14 32h70M14 44h80" stroke="currentColor" strokeWidth="4" strokeLinecap="round" opacity=".55" />
          <rect x="14" y="54" width="92" height="10" rx="3" fill="currentColor" opacity=".25" />
        </>
      )}
      {kind === 'residence' && (
        <>
          <path d="M22 44l18-16 18 16v16H22z" fill="currentColor" opacity=".25" />
          <path d="M68 28h38M68 40h30M68 52h34" stroke="currentColor" strokeWidth="4" strokeLinecap="round" opacity=".55" />
        </>
      )}
    </svg>
  );
}

/** Shown where the profile form would be, until the team has verified the guide. */
export function VerifyFirst() {
  const { t, me } = useApp();
  const status = me?.guide?.verification;
  return (
    <div className="page" style={{ maxWidth: 640, margin: '0 auto', width: '100%' }}>
      <PageHead title={t('menu.guide_profile')} backTo="/" />
      <HeroBand img="ishtar.jpg" title={t('idv.first_title')} text={t('idv.first_text')} />
      {status === 'pending' ? (
        <div className="note warn verify-wait" role="status">
          <Icon name="clock" size={20} />
          <span>
            <strong>{t('verifyp.sent_title')}</strong>
            <br />
            {t('idv.pending_text')}
          </span>
        </div>
      ) : (
        <Link to="/verify" className="btn lg">
          <Icon name="shield" size={18} /> {t('idv.start')}
        </Link>
      )}
    </div>
  );
}

/* ---------- Admin: the three identity photos of a guide waiting for review ---------- */

export function IdPhotos({ photos }: { photos: Record<DocKey, string> | null }) {
  const { t } = useApp();
  const [open, setOpen] = useState<DocKey | null>(null);
  if (!photos) return <p className="small muted">{t('idv.no_photos')}</p>;
  return (
    <>
      <div className="id-thumbs">
        {DOCS.map((k) => (
          <button key={k} type="button" className="id-thumb" onClick={() => setOpen(k)} aria-label={t('idv.open', { doc: t(`idv.${k}_short`) })}>
            <img src={photos[k]} alt="" />
            <span>{t(`idv.${k}_short`)}</span>
          </button>
        ))}
      </div>
      {open && (
        <Modal title={t(`idv.${open}_short`)} onClose={() => setOpen(null)}>
          <img src={photos[open]} alt={t(`idv.${open}_short`)} style={{ width: '100%', borderRadius: 12, display: 'block' }} />
        </Modal>
      )}
    </>
  );
}

/* ---------- Admin: transfer each booking's full payment to its guide ---------- */

export function AdminPayouts() {
  const { t, ask, toast, errorText } = useApp();
  const fmt = useFmt();
  const res = useLoad(() => api('GET', '/admin/payouts'), []);
  const { busy, run } = useBusy();
  if (res.error) return <ErrorState error={res.error} onRetry={res.reload} />;
  if (!res.data) return <Loading />;
  const pay = async (x: any) => {
    const q = (x.ended ? '' : t('payout.not_ended') + ' ') + t('payout.q', { amount: fmt.usd(x.toGuide), name: x.guide.name });
    if (!(await ask(q, t('payout.btn')))) return;
    run(async () => {
      try {
        await api('POST', `/admin/bookings/${x.id}/payout`);
        toast(t('payout.done', { amount: fmt.usd(x.toGuide), name: x.guide.name }));
        res.reload();
      } catch (e) {
        toast(errorText(e), 'error');
      }
    });
  };
  return (
    <div className="page">
      <PageHead title={t('payout.title')} backTo="/" />
      <p className="muted small" style={{ margin: 0 }}>{t('payout.lede')}</p>
      {res.data.waiting.length === 0 ? (
        <Empty title={t('payout.none')} />
      ) : (
        <div className="cards">
          {res.data.waiting.map((x: any) => (
            <article key={x.id} className="card stack payout-card">
              <div className="row" style={{ gap: 12, flexWrap: 'nowrap' }}>
                <Avatar user={x.guide} size={44} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong>
                    <bdi>{x.guide.name}</bdi>
                  </strong>
                  <div className="xs muted offer-mini-title">
                    <bdi>{x.title}</bdi>
                  </div>
                  <div className="xs muted">{fmt.range(x.startDate, x.endDate)}</div>
                </div>
                <span className={'pill ' + (x.ended ? 'ok' : 'gold')}>{x.ended ? t('payout.ended') : x.started ? t('payout.on_tour') : t('payout.upcoming')}</span>
              </div>
              <dl className="facts small">
                <dt>{t('payout.paid_by', { name: x.tourist.name })}</dt>
                <dd>{fmt.usd(x.held)}</dd>
                <dt>{t('payout.fee')}</dt>
                <dd>− {fmt.usd(x.fee)}</dd>
                <dt className="bold">{t('payout.to_guide')}</dt>
                <dd className="bold">{fmt.usd(x.toGuide)}</dd>
              </dl>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <Link to={`/bookings/${x.id}`} className="btn outline" style={{ flex: 1 }}>
                  {t('payout.view')}
                </Link>
                <button type="button" className="btn" style={{ flex: 1.4 }} disabled={busy} onClick={() => pay(x)}>
                  {t('payout.btn')}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Special events ---------- */

const eventWhen = (fmt: ReturnType<typeof useFmt>, e: any) => fmt.range(e.startDate, e.endDate);

export function EventCard({ e }: { e: any }) {
  const { meta } = useApp();
  const fmt = useFmt();
  return (
    <Link to={`/events/${e.id}`} className="event-card">
      <img src={coverSrc(e.img, meta)} alt="" loading="lazy" />
      <span className="event-shade" aria-hidden="true" />
      <span className="event-date">{eventWhen(fmt, e)}</span>
      <span className="event-text">
        <strong dir="auto">{fmt.pick(e.title, e.titleAr)}</strong>
        <span>
          <Icon name="pin" size={13} /> {fmt.city(e.city)}
        </span>
      </span>
    </Link>
  );
}

/** Tourist home: special events the team added, side by side. */
export function EventsStrip({ events }: { events: any[] }) {
  const { t } = useApp();
  if (!events?.length) return null;
  return (
    <section className="stack" aria-labelledby="ev-h">
      <div className="between">
        <h2 id="ev-h">{t('event.section')}</h2>
        <Link to="/events" className="small" style={{ fontWeight: 500 }}>
          {t('common.see_all')}
        </Link>
      </div>
      <div className="event-strip">
        {events.map((e) => (
          <EventCard key={e.id} e={e} />
        ))}
      </div>
    </section>
  );
}

/** Tourist home: the offers waiting for the tourist's answer. */
export function OffersStrip({ offers }: { offers: any[] }) {
  const { t } = useApp();
  const fmt = useFmt();
  return (
    <section className="stack" aria-labelledby="of-h">
      <div className="between">
        <h2 id="of-h">{t('dash.your_offers')}</h2>
        {offers?.length > 0 && <span className="pill gold">{fmt.num(offers.length)}</span>}
      </div>
      {!offers?.length ? (
        <div className="card small muted">{t('dash.no_offers')}</div>
      ) : (
        <div className="offer-strip">
          {offers.map((o) => (
            <Link key={o.id} to={`/requests/${o.requestId}`} className="card link offer-mini">
              <div className="row" style={{ gap: 10, flexWrap: 'nowrap' }}>
                <Avatar user={o.guide} size={42} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                    <bdi>{o.guide.name}</bdi> {o.guide.verified && <VerifiedBadge size={15} />}
                  </strong>
                  <span className="xs muted">
                    ★ {o.guide.stats?.rating ? fmt.num(o.guide.stats.rating) : '—'} · {fmt.ago(o.createdAt)}
                  </span>
                </div>
              </div>
              <span className="xs muted offer-mini-title">
                <bdi>{o.requestTitle}</bdi>
              </span>
              <div className="between" style={{ alignItems: 'baseline' }}>
                <strong className="offer-mini-price">{fmt.usd(o.price)}</strong>
                <span className="xs muted">{t('dash.offer_days', { count: o.days })}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

export function EventsList() {
  const { t } = useApp();
  const res = useLoad(() => api('GET', '/events'), []);
  if (res.error) return <ErrorState error={res.error} onRetry={res.reload} />;
  if (!res.data) return <Loading />;
  return (
    <div className="page">
      <PageHead title={t('event.section')} backTo="/" />
      {res.data.length === 0 ? (
        <Empty title={t('event.none')} />
      ) : (
        <div className="event-grid">
          {res.data.map((e: any) => (
            <EventCard key={e.id} e={e} />
          ))}
        </div>
      )}
    </div>
  );
}

export function EventPage({ id }: { id: string }) {
  const { t, me, meta } = useApp();
  const fmt = useFmt();
  const res = useLoad(() => api('GET', `/events/${id}`), [id]);
  if (res.error) return <ErrorState error={res.error} onRetry={res.reload} />;
  if (!res.data) return <Loading />;
  const e = res.data;
  const venue = fmt.pick(e.venue, e.venueAr);
  const text = fmt.pick(e.description, e.descriptionAr);
  return (
    <div className="page event-page" style={{ maxWidth: 720, margin: '0 auto', width: '100%' }}>
      <PageHead title={t('event.one')} backTo={me?.role === 'admin' ? '/admin/events' : '/'} />
      <img className="event-hero" src={coverSrc(e.img, meta)} alt="" />
      <h1 dir="auto" style={{ fontSize: 26, fontWeight: 900, margin: 0 }}>{fmt.pick(e.title, e.titleAr)}</h1>
      <div className="tc-meta">
        <span>
          <Icon name="calendar" size={18} />
          <b>{eventWhen(fmt, e)}</b>
        </span>
        <span>
          <Icon name="pin" size={18} />
          <b>{fmt.city(e.city)}</b>
        </span>
        <span>
          <Icon name="home" size={18} />
          <b dir="auto">{venue || '—'}</b>
        </span>
      </div>
      {text && (
        <p dir="auto" className="quote">
          {text}
        </p>
      )}
      {me?.role === 'admin' ? (
        <Link to={`/admin/events/${e.id}`} className="btn lg">
          <Icon name="edit" size={18} /> {t('event.edit')}
        </Link>
      ) : me?.role === 'guide' ? null : (
        <div className="gp-actions">
          <Link to={`/post?event=${e.id}`} className="btn lg" style={{ flex: 1 }}>
            {t('event.post_trip')}
          </Link>
        </div>
      )}
    </div>
  );
}

/* ---------- Admin: list and add special events (three steps, like adding a governorate) ---------- */

export function AdminEvents() {
  const { t, meta } = useApp();
  const fmt = useFmt();
  const res = useLoad(() => api('GET', '/events', undefined, { all: '1' }), []);
  if (res.error) return <ErrorState error={res.error} onRetry={res.reload} />;
  if (!res.data) return <Loading />;
  const today = meta.today as string;
  return (
    <div className="page">
      <PageHead title={t('event.admin_title')} backTo="/" />
      <p className="muted small" style={{ margin: 0 }}>{t('event.admin_lede')}</p>
      <Link to="/admin/events/new" className="btn lg block">
        <Icon name="plus" size={20} /> {t('event.add')}
      </Link>
      {res.data.length === 0 && <Empty title={t('event.none')} />}
      <div className="stack city-list">
        {res.data.map((e: any) => (
          <Link key={e.id} to={`/admin/events/${e.id}`} className="card link city-row">
            <img src={coverSrc(e.img, meta)} alt="" />
            <span className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
              <strong dir="auto">{fmt.pick(e.title, e.titleAr)}</strong>
              <span className="xs muted">
                {fmt.city(e.city)} · {eventWhen(fmt, e)}
              </span>
              {e.endDate < today && <span className="xs city-warn">{t('event.over')}</span>}
            </span>
            <Icon name="edit" size={18} />
          </Link>
        ))}
      </div>
    </div>
  );
}

export function EventWizard({ id }: { id?: string }) {
  const { t, meta, refreshMeta, toast, errorText, ask } = useApp();
  const fmt = useFmt();
  const today = meta.today as string;
  const existing = useLoad(() => (id ? api('GET', `/events/${id}`) : Promise.resolve(null)), [id]);
  const [f, setF] = useState<any>(id ? null : { title: '', titleAr: '', city: '', venue: '', venueAr: '', startDate: '', endDate: '', description: '', descriptionAr: '', img: '' });
  const [step, setStep] = useState(0);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const { busy, run } = useBusy();
  useEffect(() => {
    if (existing.data) setF({ ...existing.data });
  }, [existing.data]);
  if (id && existing.error) return <ErrorState error={existing.error} onRetry={existing.reload} />;
  if (!f) return <Loading />;
  const up = (patch: any) => setF({ ...f, ...patch });
  const touch = (k: string) => setTouched((x) => (x[k] ? x : { ...x, [k]: true }));

  const errors: Record<string, string> = {};
  if (f.titleAr.trim().length < 3) errors.titleAr = t('event.v_title_ar');
  if (f.title.trim().length < 3) errors.title = t('event.v_title');
  if (!f.city) errors.city = t('pp.v_city');
  if (!f.startDate) errors.startDate = t('event.v_start');
  else if (!id && f.startDate < today) errors.startDate = t('err.date_past');
  if (!f.endDate) errors.endDate = t('event.v_end');
  else if (f.startDate && f.endDate < f.startDate) errors.endDate = t('event.v_order');
  if (!f.img) errors.img = t('pp.v_photo');
  const show = (k: string) => (touched[k] || touched.all ? errors[k] : undefined);

  const STEPS = [
    { key: 'what', img: 'skyline.jpg', fields: ['titleAr', 'title', 'city'] },
    { key: 'when', img: 'arch.jpg', fields: ['startDate', 'endDate'] },
    { key: 'photo', img: 'ishtar.jpg', fields: ['img'] },
  ];
  const last = STEPS.length - 1;
  const cur = STEPS[step];
  const goBack = () => (step === 0 ? navigate('/admin/events') : setStep(step - 1));
  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      up({ img: await resizeImage(file, { max: 1200 }) });
      touch('img');
    } catch {
      toast(t('err.photo_invalid'), 'error');
    }
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const bad = cur.fields.find((k) => errors[k]);
    if (bad) {
      setTouched((x) => ({ ...x, ...Object.fromEntries(cur.fields.map((k) => [k, true])) }));
      document.getElementById('ef-' + bad)?.focus();
      return;
    }
    if (step < last) {
      setStep(step + 1);
      window.scrollTo({ top: 0 });
      return;
    }
    run(async () => {
      try {
        await api(id ? 'PUT' : 'POST', id ? `/admin/events/${id}` : '/admin/events', f);
        await refreshMeta();
        toast(id ? t('event.saved') : t('event.added'));
        navigate('/admin/events', { replace: true });
      } catch (x) {
        setError(errorText(x));
        throw x;
      }
    });
  };
  const remove = async () => {
    if (!(await ask(t('event.delete_q'), t('event.delete'), { danger: true }))) return;
    try {
      await api('DELETE', `/admin/events/${id}`);
      toast(t('event.deleted'));
      navigate('/admin/events', { replace: true });
    } catch (x) {
      toast(errorText(x), 'error');
    }
  };
  const src = (c: string) => (c.startsWith('data:') ? c : coverSrc(c, meta));
  return (
    <div className="page post-wizard city-wizard" style={{ maxWidth: 640, margin: '0 auto', width: '100%' }}>
      <div className="wiz-head">
        <div className="wiz-top">
          <button type="button" className="back icon-btn" aria-label={step === 0 ? t('common.back') : t('post.prev')} onClick={goBack}>
            <Icon name="back" />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="xs muted">{id ? t('event.edit') : t('event.add')}</div>
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
        <HeroBand img={cur.img} title={t(`event.s${step + 1}_title`)} text={t(`event.s${step + 1}_text`)} />
      </div>
      <form onSubmit={submit} className="stack-lg wiz-body" noValidate>
        {step === 0 && (
          <div className="stack">
            <Field label={t('event.title_ar')} error={show('titleAr')}>
              <input id="ef-titleAr" className="input" dir="rtl" maxLength={80} value={f.titleAr} placeholder="مثال: مهرجان القهوة والشاي" onBlur={() => touch('titleAr')} onChange={(e) => up({ titleAr: e.target.value })} />
            </Field>
            <Field label={t('event.title_en')} error={show('title')}>
              <input id="ef-title" className="input" dir="ltr" maxLength={80} value={f.title} placeholder="e.g. Coffee & Tea Festival" onBlur={() => touch('title')} onChange={(e) => up({ title: e.target.value })} />
            </Field>
            <Field label={t('pp.city')} error={show('city')}>
              <select id="ef-city" className="input" value={f.city} onBlur={() => touch('city')} onChange={(e) => up({ city: e.target.value })}>
                <option value="">{t('common.choose')}</option>
                {meta.cities.map((c: any) => (
                  <option key={c.slug} value={c.slug}>
                    {fmt.city(c.slug)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('event.venue_ar')}>
              <input className="input" dir="rtl" maxLength={80} value={f.venueAr} onChange={(e) => up({ venueAr: e.target.value })} />
            </Field>
            <Field label={t('event.venue_en')}>
              <input className="input" dir="ltr" maxLength={80} value={f.venue} onChange={(e) => up({ venue: e.target.value })} />
            </Field>
          </div>
        )}
        {step === 1 && (
          <div className="stack">
            <div className="row" style={{ gap: 10, flexWrap: 'nowrap', alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Field label={t('event.start')} error={show('startDate')}>
                  <input id="ef-startDate" className="input" type="date" min={id ? undefined : today} value={f.startDate} onChange={(e) => { up({ startDate: e.target.value, endDate: f.endDate && f.endDate >= e.target.value ? f.endDate : e.target.value }); touch('startDate'); }} />
                </Field>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Field label={t('event.end')} error={show('endDate')}>
                  <input id="ef-endDate" className="input" type="date" min={f.startDate || today} value={f.endDate} onChange={(e) => { up({ endDate: e.target.value }); touch('endDate'); }} />
                </Field>
              </div>
            </div>
            <Field label={t('event.desc_ar')}>
              <textarea className="input" dir="rtl" rows={3} maxLength={600} value={f.descriptionAr} onChange={(e) => up({ descriptionAr: e.target.value })} />
            </Field>
            <Field label={t('event.desc_en')}>
              <textarea className="input" dir="ltr" rows={3} maxLength={600} value={f.description} onChange={(e) => up({ description: e.target.value })} />
            </Field>
          </div>
        )}
        {step === 2 && (
          <div className="stack">
            <label className="pp-photo-drop" id="ef-img" tabIndex={-1} style={{ minHeight: 190 }}>
              {f.img ? (
                <>
                  <img src={src(f.img)} alt="" />
                  <span className="pp-change">{t('pp.change_photo')}</span>
                </>
              ) : (
                <>
                  <Icon name="camera" size={30} />
                  <strong>{t('event.photo')}</strong>
                </>
              )}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label={t('event.photo')} onChange={pick} />
            </label>
            {show('img') && <span className="err small">{show('img')}</span>}
            <div className="card wiz-summary stack" style={{ gap: 6 }}>
              <strong>{t('post.summary')}</strong>
              <span className="bold">
                <bdi>{f.titleAr}</bdi> · <bdi>{f.title}</bdi>
              </span>
              <span className="small muted">
                {f.city ? fmt.city(f.city) : ''} {f.startDate && f.endDate ? '· ' + fmt.range(f.startDate, f.endDate) : ''}
              </span>
            </div>
            {id && (
              <button type="button" className="btn danger" onClick={remove}>
                <Icon name="trash" size={18} /> {t('event.delete')}
              </button>
            )}
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
            {step < last ? t('post.next') : id ? t('city.save') : t('event.publish')}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Admin's + button: first choose what to add (a governorate or a special event), then fill in the rest. */
export function AdminAddFab() {
  const { t } = useApp();
  const [open, setOpen] = useState(false);
  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };
  return (
    <>
      <button type="button" className="photo-fab" aria-label={t('add.title')} title={t('add.title')} onClick={() => setOpen(true)}>
        <Icon name="plus" size={28} stroke={2.4} />
      </button>
      {open && (
        <Modal title={t('add.title')} onClose={() => setOpen(false)}>
          <div className="stack" style={{ gap: 10 }}>
            <button type="button" className="demo-pick add-pick" onClick={() => go('/admin/cities/new')}>
              <span className="demo-av" aria-hidden="true"><Icon name="pin" size={22} /></span>
              <span className="demo-text">
                <strong>{t('add.city')}</strong>
                <span className="xs muted">{t('add.city_text')}</span>
              </span>
              <Icon name="next" size={18} className="flip" />
            </button>
            <button type="button" className="demo-pick add-pick" onClick={() => go('/admin/events/new')}>
              <span className="demo-av" aria-hidden="true"><Icon name="calendar" size={22} /></span>
              <span className="demo-text">
                <strong>{t('add.event')}</strong>
                <span className="xs muted">{t('add.event_text')}</span>
              </span>
              <Icon name="next" size={18} className="flip" />
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
