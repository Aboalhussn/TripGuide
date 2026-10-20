import React, { useState } from 'react';
import { api } from '../lib/api';
import { useApp, useLoad } from '../lib/app';
import { useFmt } from '../lib/format';
import { Link } from '../lib/router';
import { Avatar, Empty, ErrorState, Field, Loading, PageHead, useBusy } from '../ui';

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
      <Link to="/admin/users" aria-current={active === 'users' ? 'page' : undefined}>
        {t('admin.users')}
      </Link>
    </nav>
  );
}

export function AdminVerify() {
  const { t } = useApp();
  const fmt = useFmt();
  const res = useLoad(() => api('GET', '/admin/verifications'), []);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const { busy, run } = useBusy();
  if (res.error) return <ErrorState error={res.error} onRetry={res.reload} />;
  if (!res.data) return <Loading />;
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
              <div style={{ flex: 1 }}>
                <Link to={`/guides/${g.id}`} className="bold" style={{ textDecoration: 'none' }}>
                  {g.name}
                </Link>
                <div className="xs muted">{t('admin.applied', { when: fmt.ago(g.requestedAt) })}. {fmt.cities(g.cities)}.</div>
              </div>
            </div>
            <dl className="small" style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 12px' }}>
              <dt className="muted">{t('admin.documents')}</dt>
              <dd style={{ margin: 0 }}>{g.docs.join(', ')}</dd>
              <dt className="muted">{t('field.phone')}</dt>
              <dd style={{ margin: 0 }} className="ltr">
                {g.phone || '—'} {g.phoneVerified ? `(${t('badge.phone_verified')})` : ''}
              </dd>
              <dt className="muted">{t('field.email')}</dt>
              <dd style={{ margin: 0 }}>{g.email}</dd>
              <dt className="muted">{t('guide.speaks')}</dt>
              <dd style={{ margin: 0 }}>{fmt.list(g.languages.map((l: any) => fmt.language(l.code)))}</dd>
            </dl>
            <p className="quote small">{g.bio}</p>
            <Field label={t('admin.reject_note')}>
              <input className="input" placeholder={t('admin.reject_ph')} value={notes[g.id] || ''} onChange={(e) => setNotes({ ...notes, [g.id]: e.target.value })} />
            </Field>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <button
                type="button"
                className="btn danger"
                style={{ flex: 1 }}
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await api('POST', `/admin/guides/${g.id}/verify`, { approve: false, note: notes[g.id] || '' });
                    res.reload();
                  }, t('admin.rejected_toast'))
                }
              >
                {t('admin.reject')}
              </button>
              <button
                type="button"
                className="btn"
                style={{ flex: 1.4 }}
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await api('POST', `/admin/guides/${g.id}/verify`, { approve: true });
                    res.reload();
                  }, t('admin.verified_toast', { name: g.name }))
                }
              >
                {t('admin.verify')}
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

export function AdminReports() {
  const { t } = useApp();
  const fmt = useFmt();
  const [status, setStatus] = useState('open');
  const res = useLoad(() => api('GET', '/admin/reports', undefined, { status }), [status]);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [suspend, setSuspend] = useState<Record<number, boolean>>({});
  const { busy, run } = useBusy();
  if (res.error) return <ErrorState error={res.error} onRetry={res.reload} />;
  if (!res.data) return <Loading />;
  const resolve = (r: any, action: string) =>
    run(async () => {
      await api('POST', `/admin/reports/${r.id}/resolve`, { action, note: notes[r.id] || '', suspend: !!suspend[r.id] });
      res.reload();
    }, t('admin.resolved_toast'));
  return (
    <div className="page">
      <PageHead title={t('admin.title')} backTo="/" />
      <AdminTabs active="reports" />
      <div className="row">
        <button type="button" className="toggle-chip" aria-pressed={status === 'open'} onClick={() => setStatus('open')}>
          {t('admin.open')}
        </button>
        <button type="button" className="toggle-chip" aria-pressed={status === 'resolved'} onClick={() => setStatus('resolved')}>
          {t('admin.resolved')}
        </button>
      </div>
      {res.data.reports.length === 0 && <Empty title={t('admin.no_reports')} />}
      <div className="cards">
        {res.data.reports.map((r: any) => (
          <article key={r.id} className={'card stack' + (r.status === 'open' ? ' attention' : '')}>
            <div className="between">
              <strong>{t('report.reason.' + r.reason)}</strong>
              <span className="xs muted">{fmt.ago(r.createdAt)}</span>
            </div>
            <p className="small">
              {t('admin.reported_by', { reporter: `${r.reporter.name} (${t('role.' + r.reporter.role)})`, against: `${r.against.name} (${t('role.' + r.against.role)})` })}{' '}
              {r.booking.title}, {fmt.range(r.booking.startDate, r.booking.endDate)}.
            </p>
            <p className="quote">{r.details}</p>
            <div className="small">
              {t('admin.held_on_booking')} <strong>{fmt.usd(r.booking.money.held)}</strong>
            </div>
            {r.messages.length > 0 && (
              <details>
                <summary className="small" style={{ cursor: 'pointer', fontWeight: 500 }}>
                  {t('admin.read_chat', { count: r.messages.length })}
                </summary>
                <div className="stack" style={{ gap: 6, marginTop: 8 }}>
                  {r.messages.map((m: any) => (
                    <div key={m.id} className="small">
                      <strong>{m.senderId === r.threadParticipants?.tourist ? t('role.tourist') : t('role.guide')}:</strong> {m.body} <span className="xs muted">{fmt.ago(m.createdAt)}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
            {r.status === 'open' ? (
              <>
                <Field label={t('admin.note')}>
                  <input className="input" value={notes[r.id] || ''} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} />
                </Field>
                <div className="grid-2" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                  <button type="button" className="btn sm" disabled={busy} onClick={() => resolve(r, 'refund')}>
                    {t('admin.refund')}
                  </button>
                  <button type="button" className="btn sm outline" disabled={busy} onClick={() => resolve(r, 'release')}>
                    {t('admin.release')}
                  </button>
                  <button type="button" className="btn sm ghost" disabled={busy} onClick={() => resolve(r, 'dismiss')}>
                    {t('admin.dismiss')}
                  </button>
                </div>
                <label className="check small">
                  <input type="checkbox" checked={!!suspend[r.id]} onChange={(e) => setSuspend({ ...suspend, [r.id]: e.target.checked })} />
                  {t('admin.also_suspend', { name: r.against.name })}
                </label>
              </>
            ) : (
              <p className="note small">
                {t('admin.resolution', { action: t('report.resolution.' + r.resolution) })}
                {r.adminNote && ` ${r.adminNote}`}
              </p>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

export function AdminUsers() {
  const { t } = useApp();
  const fmt = useFmt();
  const [q, setQ] = useState('');
  const res = useLoad(() => api('GET', '/admin/users', undefined, { q }), [q]);
  const { busy, run } = useBusy();
  return (
    <div className="page">
      <PageHead title={t('admin.title')} backTo="/" />
      <AdminTabs active="users" />
      <input className="input" type="search" placeholder={t('admin.search_users')} aria-label={t('admin.search_users')} value={q} onChange={(e) => setQ(e.target.value)} />
      {!res.data ? (
        <div className="skeleton" style={{ height: 200 }} />
      ) : (
        <div className="card flush">
          {res.data.users.map((u: any) => (
            <div key={u.id} className="list-item">
              <Avatar user={u} size={40} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row" style={{ gap: 6 }}>
                  <strong>{u.name}</strong>
                  <span className="pill">{t('role.' + u.role)}</span>
                  {u.verification && u.verification !== 'none' && <span className="pill sky">{t('verify.short.' + u.verification)}</span>}
                  {u.status === 'suspended' && <span className="pill danger">{t('badge.suspended')}</span>}
                </div>
                <div className="xs muted">
                  {u.email} · {u.country} · {fmt.date(u.memberSince, { month: 'short', year: 'numeric' })}
                </div>
              </div>
              {u.role !== 'admin' && (
                <button
                  type="button"
                  className={'btn sm ' + (u.status === 'suspended' ? 'outline' : 'danger')}
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await api('POST', `/admin/users/${u.id}/status`, { status: u.status === 'suspended' ? 'active' : 'suspended' });
                      res.reload();
                    })
                  }
                >
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
