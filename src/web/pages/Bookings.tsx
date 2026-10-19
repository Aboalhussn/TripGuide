import React, { useState } from 'react';
import { api } from '../lib/api';
import { useApp, useLoad } from '../lib/app';
import { useFmt } from '../lib/format';
import { Link, navigate } from '../lib/router';
import { asset } from '../assets';
import { ReviewCard } from './Guides';
import { Avatar, BookingStatus, Empty, ErrorState, Field, Icon, Loading, Modal, Money, PageHead, StarInput, VerifiedBadge, useBusy } from '../ui';

export function BookingsList() {
  const { t, me } = useApp();
  const fmt = useFmt();
  const [tab, setTab] = useState('upcoming');
  const res = useLoad(() => api('GET', '/bookings'), [me?.id]);
  if (res.error) return <ErrorState error={res.error} onRetry={res.reload} />;
  if (!res.data) return <Loading />;
  const groups: Record<string, string[]> = { upcoming: ['awaiting_guide', 'confirmed', 'disputed'], done: ['completed'], cancelled: ['cancelled', 'declined', 'expired'] };
  const list = res.data.bookings.filter((b: any) => groups[tab].includes(b.status));
  if (tab === 'upcoming') list.sort((a: any, b: any) => a.startDate.localeCompare(b.startDate));
  const asGuide = me.role === 'guide';
  return (
    <div className="page">
      <PageHead title={asGuide ? t('bookings.title_guide') : t('bookings.title')}>
        {!asGuide && (
          <Link to="/requests" className="btn sm ghost">
            {t('nav.my_requests')}
          </Link>
        )}
      </PageHead>
      <div className="tabs" role="tablist">
        {Object.keys(groups).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {t('bookings.tab_' + k, { count: res.data.bookings.filter((b: any) => groups[k].includes(b.status)).length })}
          </button>
        ))}
      </div>
      {list.length === 0 && (
        <Empty
          title={t('bookings.none')}
          text={asGuide ? t('bookings.none_guide') : t('bookings.none_tourist')}
          action={asGuide ? <Link to="/requests" className="btn">{t('nav.find_requests')}</Link> : <Link to="/post" className="btn">{t('home.cta_post')}</Link>}
        />
      )}
      <div className="cards">
        {list.map((b: any) => {
          const other = asGuide ? b.tourist : b.guide;
          return (
            <Link key={b.id} to={`/bookings/${b.id}`} className="card link stack" style={{ gap: 10 }}>
              <div className="between">
                <BookingStatus status={b.status} />
                <span className="small muted">{fmt.range(b.startDate, b.endDate)}</span>
              </div>
              <strong style={{ fontSize: 17 }}>{b.title}</strong>
              <div className="row small" style={{ gap: 10 }}>
                <Avatar user={other} size={28} />
                <span>{other.name}</span>
              </div>
              <div className="between small">
                <span>
                  {t('booking.total')} <strong>{fmt.usd(b.total)}</strong>
                </span>
                {b.money.held > 0 && (
                  <span className="pill gold">
                    {t('booking.held_short')} {fmt.usd(b.money.held)}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function BookingDetail({ id }: { id: string }) {
  const { t, me, meta, refreshMe, ask } = useApp();
  const fmt = useFmt();
  const res = useLoad(() => api('GET', `/bookings/${id}`), [id, me?.id]);
  const { busy, run } = useBusy();
  const [modal, setModal] = useState<'cancel' | 'report' | 'review' | null>(null);
  const [releaseFor, setReleaseFor] = useState<any>(null);
  if (res.error) return <ErrorState error={res.error} onRetry={res.reload} />;
  if (!res.data) return <Loading />;
  const b = res.data;
  const asGuide = me.id === b.guideId;
  const asTourist = me.id === b.touristId;
  const other = asGuide ? b.tourist : b.guide;
  const first = (n: string) => n.split(' ')[0];
  const today = b.today as string;
  const started = today >= b.startDate;
  const pctReleased = b.total ? (b.money.released / b.total) * 100 : 0;
  const pctHeld = b.total ? (b.money.held / b.total) * 100 : 0;

  const act = (path: string, ok: string) =>
    run(async () => {
      const next = await api('POST', path);
      res.setData(next);
      refreshMe();
    }, ok);
  const message = () =>
    run(async () => {
      const th = await api('POST', '/threads', asGuide ? { touristId: b.touristId, requestId: b.requestId } : { guideId: b.guideId, requestId: b.requestId });
      navigate(`/messages/${th.id}`);
    });

  const headline: Record<string, string> = {
    awaiting_guide: asGuide ? t('booking.head.awaiting_guide_g') : t('booking.head.awaiting_guide_t', { name: first(other.name) }),
    confirmed: started ? t('booking.head.on_tour') : t('booking.head.confirmed'),
    completed: t('booking.head.completed'),
    cancelled: t('booking.head.cancelled'),
    declined: t('booking.head.declined'),
    expired: t('booking.head.expired'),
    disputed: t('booking.head.disputed'),
  };

  return (
    <div className="page">
      <PageHead title={t('booking.title')} backTo="/bookings">
        <BookingStatus status={b.status} />
      </PageHead>
      <div className="split">
        <div className="stack-lg">
          <section className="stack" style={{ gap: 12 }}>
            <h2 style={{ fontWeight: 900, fontSize: 28 }}>{b.title}</h2>
            <Link to={asGuide ? `/users/${other.id}` : `/guides/${other.id}`} className="card link row" style={{ gap: 12, flexWrap: 'nowrap' }}>
              <Avatar user={other} size={44} />
              <div style={{ flex: 1 }}>
                <div className="row" style={{ gap: 6 }}>
                  <strong>{other.name}</strong>
                  {!asGuide && b.guide.stats.verified && <VerifiedBadge size={16} />}
                </div>
                <div className="small muted">
                  {fmt.range(b.startDate, b.endDate)} · {t('request.people', { count: b.groupSize })}
                </div>
              </div>
            </Link>
            <p className="note">{headline[b.status]}</p>
            {b.report && <p className="note danger">{t('booking.report_open', { reason: t('report.reason.' + b.report.reason) })}</p>}
          </section>

          {b.status === 'awaiting_guide' && asGuide && (
            <div className="card attention stack">
              <strong>{t('booking.confirm_title', { name: b.tourist.name })}</strong>
              <p className="small">{t('booking.confirm_text', { amount: fmt.usd(b.total), hours: fmt.until(b.confirmBy) })}</p>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <button type="button" className="btn outline" style={{ flex: 1 }} disabled={busy} onClick={async () => (await ask(t('booking.decline_confirm'), t('booking.decline'))) && act(`/bookings/${b.id}/decline`, t('booking.declined_toast'))}>
                  {t('booking.decline')}
                </button>
                <button type="button" className="btn" style={{ flex: 1.4 }} disabled={busy} onClick={() => act(`/bookings/${b.id}/confirm`, t('booking.confirmed_toast'))}>
                  {t('booking.confirm')}
                </button>
              </div>
            </div>
          )}

          <section aria-label={t('booking.payment')} className="card dark stack" style={{ padding: 18 }}>
            <div className="between" style={{ alignItems: 'baseline' }}>
              <span className="muted">{t('booking.total')}</span>
              <strong style={{ fontSize: 26 }}>{fmt.usd(b.total)}</strong>
            </div>
            <div className="split-bar" role="img" aria-label={t('booking.bar_label', { released: fmt.usd(b.money.released), held: fmt.usd(b.money.held) })}>
              <div style={{ width: pctReleased + '%', background: 'var(--sky)' }} />
              <div style={{ width: pctHeld + '%', background: 'var(--gold)' }} />
            </div>
            <div className="between small" style={{ flexWrap: 'wrap' }}>
              <span className="row" style={{ gap: 6 }}>
                <span className="swatch" style={{ background: 'var(--sky)' }} />
                {t('booking.released', { amount: fmt.usd(b.money.released) })}
              </span>
              <span className="row" style={{ gap: 6 }}>
                <span className="swatch" style={{ background: 'var(--gold)' }} />
                {asGuide ? t('booking.held_guide', { amount: fmt.usd(b.money.held) }) : t('booking.held_tourist', { amount: fmt.usd(b.money.held) })}
              </span>
              {b.money.refunded > 0 && <span>{t('booking.refunded', { amount: fmt.usd(b.money.refunded) })}</span>}
            </div>
            <p className="xs muted" style={{ lineHeight: 1.5 }}>
              {asGuide ? t('booking.money_note_guide', { pct: Math.round(b.feeRate * 100) }) : t('booking.money_note_tourist', { name: first(other.name) })}
            </p>
          </section>

          <section className="stack">
            <h2>{t('booking.day_by_day')}</h2>
            <ol className="timeline">
              {b.milestones.map((m: any) => {
                const isToday = m.date === today;
                const done = m.status === 'released';
                const refunded = m.status === 'refunded';
                const held = m.status === 'held' || m.status === 'release_requested';
                const canRelease = asTourist && b.status === 'confirmed' && held;
                const canAsk = asGuide && b.status === 'confirmed' && m.status === 'held' && m.date <= today;
                const canRefund = asGuide && b.status === 'confirmed' && held;
                return (
                  <li key={m.id}>
                    <span className={'tl-mark' + (done ? ' done' : isToday && b.status === 'confirmed' ? ' now' : '')}>
                      {done ? <Icon name="check" size={16} stroke={2.6} /> : isToday && b.status === 'confirmed' ? <img src={asset('tg-mark.svg')} alt="" style={{ width: 20, height: 'auto' }} /> : null}
                    </span>
                    <div className={'tl-body card stack' + (isToday && held ? ' highlight' : '')} style={{ gap: 6, padding: 14 }}>
                      <div className="between">
                        <strong>
                          {t('offer.day_n', { count: m.index + 1 })}, {isToday ? t('booking.today') : fmt.dateLong(m.date)}
                        </strong>
                        <strong>{fmt.usd(m.amount)}</strong>
                      </div>
                      <div className="small muted">{m.title}</div>
                      <div className="row xs">
                        {done && <span style={{ color: 'var(--teal-ink)', fontWeight: 500 }}>{t(asGuide ? 'booking.m.released_g' : 'booking.m.released_t', { name: first(other.name), when: fmt.ago(m.settledAt) })}</span>}
                        {refunded && <span className="pill">{t('booking.m.refunded')}</span>}
                        {m.status === 'held' && <span className="pill gold">{t('booking.m.held')}</span>}
                        {m.status === 'release_requested' && (
                          <>
                            <span className="pill gold">{t('booking.m.held')}</span>
                            <span className="muted">{asGuide ? t('booking.m.asked_g') : t('booking.m.asked_t', { name: first(other.name) })}</span>
                          </>
                        )}
                      </div>
                      {canRelease && (
                        <button type="button" className="btn sm" style={{ marginTop: 4 }} disabled={busy} onClick={() => setReleaseFor(m)}>
                          {t('booking.release', { amount: fmt.usd(m.amount), name: first(other.name) })}
                        </button>
                      )}
                      {(canAsk || canRefund) && (
                        <div className="row" style={{ marginTop: 4 }}>
                          {canAsk && (
                            <button type="button" className="btn sm" disabled={busy} onClick={() => act(`/milestones/${m.id}/request-release`, t('booking.asked_toast'))}>
                              {t('booking.ask_release')}
                            </button>
                          )}
                          {canRefund && (
                            <button type="button" className="btn sm ghost" disabled={busy} onClick={async () => (await ask(t('booking.refund_confirm', { amount: fmt.usd(m.amount) }), t('booking.refund_day'))) && act(`/milestones/${m.id}/refund`, t('booking.refunded_toast'))}>
                              {t('booking.refund_day')}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          {(b.status === 'completed' || b.myReview || b.theirReview) && (
            <section className="stack">
              <h2>{t('booking.reviews')}</h2>
              {b.canReview && (
                <div className="card attention stack">
                  <strong>{asGuide ? t('booking.review_ask_g', { name: first(other.name) }) : t('booking.review_ask_t', { name: first(other.name) })}</strong>
                  <p className="small muted">{t('booking.review_blind')}</p>
                  <button type="button" className="btn" onClick={() => setModal('review')}>
                    {t('booking.write_review')}
                  </button>
                </div>
              )}
              {b.myReview && (
                <>
                  <span className="small muted">{t('booking.your_review')}</span>
                  <ReviewCard r={b.myReview} />
                </>
              )}
              {b.theirReview && (
                <>
                  <span className="small muted">{t('booking.their_review', { name: first(other.name) })}</span>
                  <ReviewCard r={b.theirReview} />
                </>
              )}
              {b.theirReviewPending && <p className="note small">{t('booking.their_review_pending', { name: first(other.name) })}</p>}
            </section>
          )}
        </div>

        <aside className="stack">
          <button type="button" className="btn outline" onClick={message} disabled={busy}>
            <Icon name="chat" size={18} /> {t('booking.message', { name: first(other.name) })}
          </button>
          {['awaiting_guide', 'confirmed'].includes(b.status) && (
            <>
              {!b.report && (
                <button type="button" className="btn ghost" onClick={() => setModal('report')}>
                  <Icon name="flag" size={18} /> {t('booking.report')}
                </button>
              )}
              {(b.status === 'confirmed' ? !started : asTourist) && (
                <button type="button" className="btn ghost" onClick={() => setModal('cancel')}>
                  {t('booking.cancel')}
                </button>
              )}
            </>
          )}
          {b.offer && b.offer.includes.length > 0 && (
            <div className="card small">
              <strong>{t('booking.included')}</strong>
              <p className="muted">{fmt.list(b.offer.includes.map((x: string) => t('include.' + x)))}</p>
            </div>
          )}
          <Link to={`/requests/${b.requestId}`} className="small" style={{ fontWeight: 500 }}>
            {t('booking.see_request')}
          </Link>
          {b.status === 'confirmed' && <p className="xs muted">{started ? t('booking.started_note') : t('booking.cancel_note')}</p>}
        </aside>
      </div>

      {releaseFor && (
        <Modal title={t('booking.release_title')} onClose={() => setReleaseFor(null)}>
          <p>{t('booking.release_text', { amount: fmt.usd(releaseFor.amount), name: first(other.name), day: releaseFor.index + 1 })}</p>
          <p className="small muted">{t('booking.release_final')}</p>
          <button
            type="button"
            className="btn lg"
            disabled={busy}
            onClick={async () => {
              const m = releaseFor;
              setReleaseFor(null);
              await act(`/milestones/${m.id}/release`, t('booking.released_toast', { amount: fmt.usd(m.amount) }));
            }}
          >
            {t('booking.release', { amount: fmt.usd(releaseFor.amount), name: first(other.name) })}
          </button>
        </Modal>
      )}
      {modal === 'cancel' && <CancelModal b={b} asGuide={asGuide} onClose={() => setModal(null)} onDone={(n: any) => { setModal(null); res.setData(n); refreshMe(); }} />}
      {modal === 'report' && <ReportModal b={b} onClose={() => setModal(null)} onDone={(n: any) => { setModal(null); res.setData(n); }} />}
      {modal === 'review' && <ReviewModal b={b} asGuide={asGuide} keys={asGuide ? meta.touristRatingKeys : meta.guideRatingKeys} onClose={() => setModal(null)} onDone={(n: any) => { setModal(null); res.setData(n); refreshMe(); }} />}
    </div>
  );
}

function CancelModal({ b, asGuide, onClose, onDone }: { b: any; asGuide: boolean; onClose(): void; onDone(n: any): void }) {
  const { t, errorText } = useApp();
  const fmt = useFmt();
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    try {
      onDone(await api('POST', `/bookings/${b.id}/cancel`, { reason }));
    } catch (e) {
      setErr(errorText(e));
    }
  };
  return (
    <Modal title={t('booking.cancel_title')} onClose={onClose}>
      <p>{asGuide ? t('booking.cancel_text_g') : t('booking.cancel_text_t', { amount: fmt.usd(b.money.held) })}</p>
      <Field label={t('booking.cancel_reason')}>
        <textarea className="textarea" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
      </Field>
      {err && <div className="note danger">{err}</div>}
      <button type="button" className="btn danger lg" onClick={go}>
        {t('booking.cancel_do')}
      </button>
    </Modal>
  );
}

const REASONS = ['no_show', 'not_as_agreed', 'safety', 'payment', 'other'];
function ReportModal({ b, onClose, onDone }: { b: any; onClose(): void; onDone(n: any): void }) {
  const { t, errorText } = useApp();
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    try {
      onDone(await api('POST', `/bookings/${b.id}/report`, { reason, details }));
    } catch (e) {
      setErr(errorText(e));
    }
  };
  return (
    <Modal title={t('report.title')} onClose={onClose}>
      <p className="small">{t('report.text')}</p>
      <div className="stack" role="radiogroup" aria-label={t('report.what')}>
        {REASONS.map((r) => (
          <label key={r} className="check">
            <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} />
            {t('report.reason.' + r)}
          </label>
        ))}
      </div>
      <Field label={t('report.details')}>
        <textarea className="textarea" rows={4} value={details} onChange={(e) => setDetails(e.target.value)} maxLength={2000} />
      </Field>
      {err && <div className="note danger">{err}</div>}
      <button type="button" className="btn lg" onClick={go}>
        {t('report.send')}
      </button>
    </Modal>
  );
}

function ReviewModal({ b, asGuide, keys, onClose, onDone }: { b: any; asGuide: boolean; keys: string[]; onClose(): void; onDone(n: any): void }) {
  const { t, errorText } = useApp();
  const other = asGuide ? b.tourist : b.guide;
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [comment, setComment] = useState('');
  const [again, setAgain] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    if (keys.some((k) => !ratings[k])) return setErr(t('review.rate_all'));
    try {
      onDone(await api('POST', `/bookings/${b.id}/review`, { ratings, comment, hireAgain: again }));
    } catch (e) {
      setErr(errorText(e));
    }
  };
  return (
    <Modal title={t('review.title', { name: other.name.split(' ')[0] })} onClose={onClose}>
      {keys.map((k) => (
        <StarInput key={k} label={t('rating.' + k)} value={ratings[k] || 0} onChange={(n) => setRatings({ ...ratings, [k]: n })} />
      ))}
      <Field label={t('review.comment')} hint={t('review.comment_hint')}>
        <textarea className="textarea" rows={4} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1500} />
      </Field>
      <label className="check">
        <input type="checkbox" checked={again} onChange={(e) => setAgain(e.target.checked)} />
        {asGuide ? t('review.would_guide_again_q') : t('review.would_hire_again_q')}
      </label>
      {err && <div className="note danger">{err}</div>}
      <button type="button" className="btn lg" onClick={go}>
        {t('review.submit')}
      </button>
    </Modal>
  );
}

export function Wallet() {
  const { t, me } = useApp();
  const fmt = useFmt();
  const res = useLoad(() => api('GET', '/wallet'), [me?.id]);
  if (res.error) return <ErrorState error={res.error} onRetry={res.reload} />;
  if (!res.data) return <Loading />;
  const w = res.data;
  const guide = w.role === 'guide';
  return (
    <div className="page" style={{ maxWidth: 760, margin: '0 auto', width: '100%' }}>
      <PageHead title={t('wallet.title')} backTo="/" />
      <section className="card dark grid-2" style={{ gap: 16, padding: 18 }}>
        <div>
          <div className="small muted">{guide ? t('wallet.earned') : t('wallet.paid_guides')}</div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>{fmt.usd(w.released)}</div>
          {guide && <div className="xs muted">{t('wallet.fees_paid', { amount: fmt.usd(w.fees) })}</div>}
        </div>
        <div>
          <div className="small muted">{guide ? t('wallet.held_guide') : t('wallet.held_tourist')}</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--gold)' }}>{fmt.usd(w.held)}</div>
        </div>
        {!guide && (
          <div>
            <div className="small muted">{t('wallet.refunded')}</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{fmt.usd(w.refunded)}</div>
          </div>
        )}
        {guide && w.thisMonth !== null && (
          <div>
            <div className="small muted">{t('dash.earned_month')}</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{fmt.usd(w.thisMonth)}</div>
          </div>
        )}
      </section>
      <p className="note small">{t('wallet.demo_note')}</p>
      <h2>{t('wallet.history')}</h2>
      {w.transactions.length === 0 && <p className="muted">{t('wallet.none')}</p>}
      <div className="card flush">
        {w.transactions.map((x: any, i: number) => (
          <Link key={i} to={`/bookings/${x.bookingId}`} className="list-item">
            <span className={'avatar ' + (x.amount < 0 ? 'av-5' : 'av-2')} style={{ width: 40, height: 40 }} aria-hidden="true">
              <Icon name={x.kind === 'released' ? 'check' : x.kind === 'refunded' ? 'back' : 'money'} size={18} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="small bold">{t('wallet.kind.' + x.kind + (guide ? '_g' : ''), { day: x.day })}</div>
              <div className="xs muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {x.title}
              </div>
            </div>
            <div style={{ textAlign: 'end' }}>
              <Money usd={x.amount} className={x.amount < 0 ? '' : 'bold'} />
              <div className="xs muted">{x.at ? fmt.date(x.at) : ''}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
