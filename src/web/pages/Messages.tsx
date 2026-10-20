import React, { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useApp, useLoad } from '../lib/app';
import { useFmt } from '../lib/format';
import { Link, navigate } from '../lib/router';
import { Avatar, Empty, ErrorState, Icon, Loading, PageHead, ResponseTime, useBusy } from '../ui';

export function Threads() {
  const { t, me } = useApp();
  const fmt = useFmt();
  const res = useLoad(() => api('GET', '/threads'), [me?.id, me?.unreadMessages]);
  if (res.error) return <ErrorState error={res.error} onRetry={res.reload} />;
  if (!res.data) return <Loading />;
  return (
    <div className="page" style={{ maxWidth: 760, margin: '0 auto', width: '100%' }}>
      <PageHead title={t('messages.title')} />
      {res.data.threads.length === 0 ? (
        <Empty title={t('messages.none')} text={me.role === 'tourist' ? t('messages.none_tourist') : t('messages.none_guide')} />
      ) : (
        <div className="card flush">
          {res.data.threads.map((th: any) => (
            <Link key={th.id} to={`/messages/${th.id}`} className={'list-item' + (th.unread ? ' unread' : '')}>
              <Avatar user={th.other} size={46} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="between">
                  <strong>{th.other.name}</strong>
                  <span className="xs muted">{th.last ? fmt.ago(th.last.createdAt) : ''}</span>
                </div>
                {th.request && <div className="xs muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{th.request.title}</div>}
                <div className="small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: th.unread ? 700 : 400, color: th.unread ? 'var(--navy)' : 'var(--muted)' }}>
                  {th.last ? (th.last.senderId === me.id ? t('messages.you') + ' ' : '') + th.last.body : t('messages.no_messages')}
                </div>
              </div>
              {th.unread > 0 && <span className="pill gold">{fmt.num(th.unread)}</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function Thread({ id }: { id: string }) {
  const { t, me, refreshMe } = useApp();
  const fmt = useFmt();
  const res = useLoad(() => api('GET', `/threads/${id}`), [id]);
  const [text, setText] = useState('');
  const logRef = useRef<HTMLDivElement>(null);
  const { busy, run } = useBusy();

  // Poll for new messages while the conversation is open.
  useEffect(() => {
    const iv = setInterval(() => {
      api('GET', `/threads/${id}`).then((d) => res.setData(d)).catch(() => {});
    }, 5000);
    refreshMe();
    return () => clearInterval(iv);
  }, [id]);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [res.data?.messages?.length]);

  if (res.error) return <ErrorState error={res.error} onRetry={res.reload} />;
  if (!res.data) return <Loading />;
  const th = res.data;
  const asTourist = me.id === th.touristId;
  const send = (e?: React.FormEvent) => {
    e?.preventDefault();
    const body = text.trim();
    if (!body) return;
    run(async () => {
      await api('POST', `/threads/${id}/messages`, { body });
      setText('');
      res.reload();
    });
  };
  let lastDay = '';
  return (
    <div className="chat">
      <div className="row" style={{ gap: 10, flexWrap: 'nowrap', padding: '8px 16px', background: 'var(--surface)', borderBottom: '1px solid var(--line)' }}>
        <button type="button" className="back icon-btn" aria-label={t('common.back')} onClick={() => navigate('/messages')}>
          <Icon name="back" />
        </button>
        <Avatar user={th.other} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link to={th.other.role === 'guide' ? `/guides/${th.other.id}` : `/users/${th.other.id}`} className="bold" style={{ textDecoration: 'none' }}>
            {th.other.name}
          </Link>
          <div className="xs muted">{th.other.role === 'guide' ? <ResponseTime minutes={th.responseMinutes} /> : th.other.country}</div>
        </div>
      </div>
      {th.request && (
        <div className="row" style={{ gap: 10, flexWrap: 'nowrap', padding: '10px 16px', background: 'var(--sky-soft)', borderBottom: '1px solid var(--line-strong)' }}>
          <div style={{ flex: 1, minWidth: 0 }} className="small">
            <div className="bold" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {th.request.title}
            </div>
            <div className="muted">
              {th.offer ? t('messages.offer_line', { amount: fmt.usd(th.offer.price), dates: fmt.range(th.request.startDate, th.request.endDate) }) : fmt.range(th.request.startDate, th.request.endDate)}
            </div>
          </div>
          {th.booking && !['declined', 'expired', 'cancelled'].includes(th.booking.status) ? (
            <Link to={`/bookings/${th.booking.id}`} className="btn sm">
              {t('messages.see_booking')}
            </Link>
          ) : asTourist && th.offer && th.offer.status === 'pending' && th.request.status === 'open' ? (
            <Link to={`/requests/${th.request.id}`} className="btn sm">
              {t('messages.hire')}
            </Link>
          ) : (
            <Link to={`/requests/${th.request.id}`} className="btn sm ghost">
              {t('messages.see_request')}
            </Link>
          )}
        </div>
      )}
      <div className="chat-log" ref={logRef} role="log" aria-label={t('messages.log')} aria-live="polite">
        {th.messages.length === 0 && <p className="muted center small" style={{ marginTop: 24 }}>{t('messages.start', { name: th.other.name.split(' ')[0] })}</p>}
        {th.messages.map((m: any) => {
          const day = fmt.date(m.createdAt, { weekday: 'long', day: 'numeric', month: 'short' });
          const showDay = day !== lastDay;
          lastDay = day;
          return (
            <React.Fragment key={m.id}>
              {showDay && (
                <div className="xs muted" style={{ alignSelf: 'center', padding: '4px 10px', background: '#eaf1f4', borderRadius: 999 }}>
                  {day}
                </div>
              )}
              <div className={'bubble ' + (m.senderId === me.id ? 'me' : 'them')}>
                {m.body}
                <div className="xs" style={{ opacity: 0.7, marginTop: 4, textAlign: 'end' }}>
                  {fmt.time(m.createdAt)}
                </div>
              </div>
            </React.Fragment>
          );
        })}
        <div className="xs muted center" style={{ alignSelf: 'center', maxWidth: 360, padding: '10px 14px', border: '1px dashed #9fc9d8', borderRadius: 12, marginTop: 8 }}>
          {t('messages.safety')}
        </div>
      </div>
      <form className="chat-form" onSubmit={send}>
        <label style={{ flex: 1, display: 'flex' }}>
          <span className="sr-only">{t('messages.write')}</span>
          <textarea
            rows={1}
            value={text}
            placeholder={t('messages.write')}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            maxLength={2000}
          />
        </label>
        <button type="submit" className="send" aria-label={t('messages.send')} disabled={busy || !text.trim()}>
          <Icon name="send" size={20} stroke={2} className="flip" />
        </button>
      </form>
    </div>
  );
}

export function Notifications() {
  const { t, me, refreshMe } = useApp();
  const fmt = useFmt();
  const res = useLoad(() => api('GET', '/notifications'), [me?.id]);
  const { run } = useBusy();
  if (res.error) return <ErrorState error={res.error} onRetry={res.reload} />;
  if (!res.data) return <Loading />;
  const open = (n: any) => {
    if (!n.read) api('POST', `/notifications/${n.id}/read`).then(refreshMe).catch(() => {});
    navigate(n.link === '/admin' ? (n.type === 'report_new' ? '/admin/reports' : '/admin/verify') : n.link);
  };
  const params = (n: any) => {
    const p = { ...n.params };
    if (typeof p.amount === 'number') p.amount = fmt.usd(p.amount);
    if (typeof p.price === 'number') p.price = fmt.usd(p.price);
    if (p.action) p.action = t('report.resolution.' + p.action);
    return p;
  };
  return (
    <div className="page" style={{ maxWidth: 760, margin: '0 auto', width: '100%' }}>
      <PageHead title={t('notifications.title')}>
        {res.data.unread > 0 && (
          <button
            type="button"
            className="btn sm ghost"
            onClick={() =>
              run(async () => {
                await api('POST', '/notifications/read-all');
                await res.reload();
                refreshMe();
              })
            }
          >
            {t('notifications.mark_all')}
          </button>
        )}
      </PageHead>
      {res.data.notifications.length === 0 ? (
        <Empty title={t('notifications.none')} />
      ) : (
        <div className="card flush">
          {res.data.notifications.map((n: any) => (
            <a
              key={n.id}
              href={'#' + n.link}
              onClick={(e) => {
                e.preventDefault();
                open(n);
              }}
              className={'list-item' + (n.read ? '' : ' unread')}
            >
              <span className="avatar av-2" style={{ width: 40, height: 40 }} aria-hidden="true">
                <Icon name={ICON[n.type] || 'bell'} size={18} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="small" style={{ fontWeight: n.read ? 400 : 700 }}>
                  {t('notif.' + n.type, params(n))}
                </div>
                <div className="xs muted">{fmt.ago(n.createdAt)}</div>
              </div>
              {!n.read && <span className="sr-only">{t('notifications.unread')}</span>}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

const ICON: Record<string, string> = {
  offer_new: 'offer', offer_updated: 'offer', hired: 'money', booking_confirmed: 'check', booking_declined: 'close', hire_expired: 'clock', hire_expired_guide: 'clock',
  release_requested: 'money', payment_released: 'money', payment_refunded: 'back', review_prompt: 'edit', review_received: 'edit', invited: 'users', direct_request: 'users',
  offer_not_selected: 'close', request_closed: 'close', booking_cancelled_by_guide: 'close', booking_cancelled_by_tourist: 'close', report_new: 'flag', report_filed: 'flag',
  report_resolved: 'shield', verification_new: 'shield', verification_approved: 'shield', verification_rejected: 'shield',
};
