import React from 'react';
import { brand } from '../config/brand';
import { useApp } from './lib/app';
import { api } from './lib/api';
import { resizeImage } from './lib/image';
import { Link, navigate } from './lib/router';
import { asset } from './assets';
import { Field, Icon, LangToggle, Modal } from './ui';
import { PassportFabIcon } from './passport';
import { AddMemory } from './pages/Passport';
import { PullToRefresh } from './PullToRefresh';

type NavItem = { to: string; label: string; icon: string; badge?: number; primary?: boolean; match?: string[] };

export function Shell({ path, children }: { path: string; children: React.ReactNode }) {
  const { me, t, lang } = useApp();
  // Sign-in and sign-up are full-screen: no bottom tab bar.
  const bare = path === '/login' || path === '/register' || path === '/forgot';
  // An open conversation fills the phone screen like a chat app: no bottom tab bar.
  const chat = /^\/messages\/[^/]+$/.test(path) || path === '/post/chat'; // full-screen chats (messages, trip assistant)
  const role = me?.role || 'guest';

  const items: Record<string, NavItem[]> = {
    guest: [
      { to: '/', label: t('nav.home'), icon: 'home' },
      { to: '/guides', label: t('nav.guides'), icon: 'search' },
      { to: '/post', label: t('nav.post'), icon: 'plus', primary: true },
      { to: '/login', label: t('nav.sign_in'), icon: 'user' },
      { to: '/register', label: t('nav.join'), icon: 'users' },
    ],
    tourist: [
      { to: '/', label: t('nav.home'), icon: 'home' },
      { to: '/guides', label: t('nav.guides'), icon: 'search' },
      { to: '/post', label: t('nav.post'), icon: 'plus', primary: true },
      { to: '/messages', label: t('nav.messages'), icon: 'chat', badge: me?.unreadMessages },
      { to: '/profile', label: t('nav.profile'), icon: 'user', badge: me?.unreadNotifications, match: ['/profile', '/bookings', '/requests', '/wallet', '/notifications'] },
    ],
    guide: [
      { to: '/', label: t('nav.home'), icon: 'home' },
      { to: '/requests', label: t('nav.requests'), icon: 'list' },
      { to: '/offers', label: t('nav.offers'), icon: 'offer' },
      { to: '/messages', label: t('nav.messages'), icon: 'chat', badge: me?.unreadMessages },
      { to: '/profile', label: t('nav.profile'), icon: 'user', badge: me?.unreadNotifications, match: ['/profile', '/bookings', '/wallet', '/notifications'] },
    ],
    admin: [
      { to: '/', label: t('nav.admin'), icon: 'home' },
      { to: '/admin/verify', label: t('nav.verify'), icon: 'shield', match: ['/admin/verify', '/admin/reports'] },
      { to: '/admin/stats', label: t('nav.stats'), icon: 'chart' },
      { to: '/admin/users', label: t('nav.users'), icon: 'users' },
      { to: '/profile', label: t('nav.profile'), icon: 'user', badge: me?.unreadNotifications },
    ],
  };
  const desktop: Record<string, NavItem[]> = {
    guest: [
      { to: '/', label: t('nav.home'), icon: 'home' },
      { to: '/guides', label: t('nav.find_guides'), icon: 'search' },
    ],
    tourist: [
      { to: '/', label: t('nav.home'), icon: 'home' },
      { to: '/guides', label: t('nav.find_guides'), icon: 'search' },
      { to: '/requests', label: t('nav.my_requests'), icon: 'list' },
      { to: '/bookings', label: t('nav.trips'), icon: 'calendar' },
      { to: '/messages', label: t('nav.messages'), icon: 'chat', badge: me?.unreadMessages },
    ],
    guide: [
      { to: '/', label: t('nav.dashboard'), icon: 'home' },
      { to: '/requests', label: t('nav.find_requests'), icon: 'list' },
      { to: '/offers', label: t('nav.offers'), icon: 'offer' },
      { to: '/bookings', label: t('nav.tours'), icon: 'calendar' },
      { to: '/messages', label: t('nav.messages'), icon: 'chat', badge: me?.unreadMessages },
      { to: '/wallet', label: t('nav.wallet'), icon: 'wallet' },
    ],
    admin: [
      { to: '/', label: t('nav.admin'), icon: 'home' },
      { to: '/admin/verify', label: t('nav.verify'), icon: 'shield' },
      { to: '/admin/reports', label: t('nav.reports'), icon: 'flag' },
      { to: '/admin/stats', label: t('nav.stats'), icon: 'chart' },
      { to: '/admin/users', label: t('nav.users'), icon: 'users' },
      { to: '/guides', label: t('nav.guides'), icon: 'search' },
    ],
  };
  const isActive = (it: NavItem) => (it.to === '/' ? path === '/' : (it.match || [it.to]).some((m) => path === m || path.startsWith(m + '/')));
  // Like a phone app, the bottom tab only moves when a tab's own screen opens. Screens opened from
  // inside a tab (a trip request, a guide, a booking...) keep the tab you came from highlighted.
  const lastTab = React.useRef<{ role: string; to: string } | null>(null);
  const tabs = items[role];
  const own = tabs.find((it) => path === it.to);
  const kept = lastTab.current?.role === role && tabs.some((it) => it.to === lastTab.current!.to) ? lastTab.current!.to : null;
  const activeTab = own?.to ?? kept ?? tabs.find(isActive)?.to ?? null;
  lastTab.current = activeTab ? { role, to: activeTab } : null;
  const name = lang === 'ar' ? brand.nameAr : brand.name;

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand" aria-label={name}>
            <img src={asset('tg-logo-horizontal.svg')} alt="" />
          </Link>
          {(role === 'guide' || role === 'admin') && <span className="role-tag">{t('role.' + role)}</span>}
          <nav className="topnav" aria-label={t('nav.main')}>
            {desktop[role].map((it) => (
              <Link key={it.to} to={it.to} aria-current={isActive(it) ? 'page' : undefined}>
                {it.label}
                {!!it.badge && <span className="pill gold" style={{ marginInlineStart: 6, padding: '1px 7px' }}>{it.badge}</span>}
              </Link>
            ))}
          </nav>
          <div className="top-actions">
            {!me && <LangToggle />}
            {me && (
              <Link to="/notifications" className="icon-btn" aria-label={t('nav.notifications_n', { count: me.unreadNotifications })}>
                <Icon name="bell" />
                {me.unreadNotifications > 0 && <span className="dot">{me.unreadNotifications > 9 ? '9+' : me.unreadNotifications}</span>}
              </Link>
            )}
            {me && (
              <Link to="/profile" className="icon-btn" aria-label={t('nav.account')}>
                <Icon name="user" />
              </Link>
            )}
          </div>
        </div>
      </header>
      <main className={'main' + (bare ? ' bare' : '') + (chat ? ' chat-open' : '')} id="main">
        {path === '/' ? <PullToRefresh>{children}</PullToRefresh> : children}
      </main>
      {role === 'guide' && !bare && !chat && path !== '/guide/setup' && <PhotoFab />}
      {role === 'tourist' && path === '/' && <PassportFab />}
      {role === 'admin' && !bare && !chat && !path.startsWith('/admin/cities/') && (
        <Link to="/admin/cities/new" className="photo-fab" aria-label={t('city.add')} title={t('city.add')}>
          <Icon name="plus" size={28} stroke={2.4} />
        </Link>
      )}
      {!bare && !chat && <nav className="tabbar" aria-label={t('nav.main')}>
        {items[role].map((it) => (
          <Link key={it.to} to={it.to} aria-current={activeTab === it.to ? 'page' : undefined}>
            {it.primary ? (
              <span className="plus">
                <Icon name="plus" size={20} stroke={2.2} />
              </span>
            ) : (
              <Icon name={it.icon} size={24} />
            )}
            {it.label}
            {!!it.badge && <span className="dot">{it.badge > 9 ? '9+' : it.badge}</span>}
          </Link>
        ))}
      </nav>}
    </div>
  );
}

/** Tourists: the passport-shaped button above the tab bar adds a photo memory to their travel passport. */
function PassportFab() {
  const { t, refreshMe } = useApp();
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button type="button" className="photo-fab pp-fab" aria-label={t('pp.fab')} title={t('pp.fab')} onClick={() => setOpen(true)}>
        <PassportFabIcon />
      </button>
      {open && (
        <AddMemory
          onClose={() => setOpen(false)}
          onDone={async () => {
            setOpen(false);
            await refreshMe();
            navigate('/passport');
          }}
        />
      )}
    </>
  );
}

/** Guides: the round + above the tab bar adds a photo from their tours to the public profile. */
function PhotoFab() {
  const { t, me, refreshMe, toast, errorText } = useApp();
  const [img, setImg] = React.useState<string | null>(null);
  const [caption, setCaption] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const full = (me?.guide?.photos?.length || 0) >= 12;
  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setImg(await resizeImage(file));
    } catch {
      toast(t('err.photo_invalid'), 'error');
    }
  };
  const add = async () => {
    if (!img) return;
    setBusy(true);
    try {
      await api('POST', '/guide/photos', { img, caption: caption.trim() });
      await refreshMe();
      setImg(null);
      setCaption('');
      toast(t('fab.added'));
    } catch (x) {
      toast(errorText(x), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {full ? (
        <Link to="/profile/guide" className="photo-fab" aria-label={t('fab.full')} title={t('fab.full')}>
          <Icon name="image" size={24} stroke={2} />
        </Link>
      ) : (
        <label className="photo-fab" aria-label={t('fab.add')} title={t('fab.add')}>
          <Icon name="plus" size={28} stroke={2.4} />
          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={pick} />
        </label>
      )}
      {img && (
        <Modal title={t('fab.title')} onClose={() => setImg(null)}>
          <img src={img} alt="" className="fab-preview" />
          <Field label={t('editor.caption')}>
            <input className="input" value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={80} placeholder={t('fab.caption_ph')} />
          </Field>
          <button type="button" className="btn lg" onClick={add} disabled={busy}>
            {t('fab.publish')}
          </button>
        </Modal>
      )}
    </>
  );
}
