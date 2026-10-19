import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { AppProvider, useApp } from './lib/app';
import { match, navigate, useLocation } from './lib/router';
import { Shell } from './Shell';
import { Loading } from './ui';
import { AdminHome, GuestHome, GuideHome, TouristHome } from './pages/Home';
import { FindGuides, GuideProfile, TouristProfile } from './pages/Guides';
import { MyOffers, PostRequest, RequestDetail, RequestsIndex } from './pages/Requests';
import { BookingDetail, BookingsList, Wallet } from './pages/Bookings';
import { Notifications, Thread, Threads } from './pages/Messages';
import { Account, GuideEditor, Login, Register } from './pages/Account';
import { AdminReports, AdminUsers, AdminVerify } from './pages/Admin';

function NeedLogin({ path }: { path: string }) {
  React.useEffect(() => navigate('/login?next=' + encodeURIComponent(path), { replace: true }), [path]);
  return null;
}

function NotFound() {
  const { t } = useApp();
  return (
    <div className="page">
      <div className="empty card">
        <h1>{t('notfound.title')}</h1>
        <p className="muted">{t('notfound.text')}</p>
        <a className="btn" href="#/">
          {t('notfound.home')}
        </a>
      </div>
    </div>
  );
}

function Routes() {
  const { me, ready, meta } = useApp();
  const { path, query } = useLocation();
  if (!ready || !meta) return <Loading />;
  const role = me?.role;
  const p = (pattern: string) => match(pattern, path);
  const authed = (el: React.ReactNode) => (me ? el : <NeedLogin path={path + (Object.keys(query).length ? '?' + new URLSearchParams(query) : '')} />);
  let m: Record<string, string> | null;

  let page: React.ReactNode = <NotFound />;
  if (p('/')) page = role === 'tourist' ? <TouristHome /> : role === 'guide' ? <GuideHome /> : role === 'admin' ? <AdminHome /> : <GuestHome />;
  else if (p('/guides')) page = <FindGuides query={query} />;
  else if ((m = p('/guides/:id'))) page = <GuideProfile id={m.id} />;
  else if (p('/post')) page = <PostRequest query={query} />;
  else if (p('/requests')) page = authed(<RequestsIndex query={query} />);
  else if ((m = p('/requests/:id'))) page = authed(<RequestDetail id={m.id} />);
  else if (p('/offers')) page = authed(<MyOffers />);
  else if (p('/bookings')) page = authed(<BookingsList />);
  else if ((m = p('/bookings/:id'))) page = authed(<BookingDetail id={m.id} />);
  else if (p('/messages')) page = authed(<Threads />);
  else if ((m = p('/messages/:id'))) page = authed(<Thread id={m.id} />);
  else if (p('/notifications')) page = authed(<Notifications />);
  else if (p('/wallet')) page = authed(<Wallet />);
  else if (p('/profile')) page = authed(<Account />);
  else if (p('/profile/guide')) page = authed(<GuideEditor />);
  else if ((m = p('/users/:id'))) page = authed(<TouristProfile id={m.id} />);
  else if (p('/login')) page = <Login query={query} />;
  else if (p('/register')) page = <Register query={query} />;
  else if (p('/admin') || p('/admin/verify')) page = authed(<AdminVerify />);
  else if (p('/admin/reports')) page = authed(<AdminReports />);
  else if (p('/admin/users')) page = authed(<AdminUsers />);

  // Re-mount pages on navigation so each route starts fresh.
  return (
    <Shell path={path}>
      <React.Fragment key={path + (me?.id ?? '')}>{page}</React.Fragment>
    </Shell>
  );
}

export function start() {
  createRoot(document.getElementById('root')!).render(
    <AppProvider>
      <Routes />
    </AppProvider>,
  );
}

if (!(window as any).__TG_DEFER_START) start();
