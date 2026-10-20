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
      <PageHead title={t('admin.title')} backTo="/" />
      <AdminTabs active="users" />
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
