import React from 'react';
import { brand } from '../config/brand';
import { useApp } from './lib/app';
import { Link } from './lib/router';
import { asset } from './assets';
import { Icon, LangToggle } from './ui';

type NavItem = { to: string; label: string; icon: string; badge?: number; primary?: boolean; match?: string[] };

export function Shell({ path, children }: { path: string; children: React.ReactNode }) {
  const { me, t, lang } = useApp();
  // Sign-in and sign-up are full-screen: no bottom tab bar.
  const bare = path === '/login' || path === '/register';
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
      { to: '/admin/verify', label: t('nav.verify'), icon: 'shield', match: ['/admin/verify'] },
      { to: '/admin/reports', label: t('nav.reports'), icon: 'flag' },
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
      { to: '/admin/users', label: t('nav.users'), icon: 'users' },
      { to: '/guides', label: t('nav.guides'), icon: 'search' },
    ],
  };
  const isActive = (it: NavItem) => (it.to === '/' ? path === '/' : (it.match || [it.to]).some((m) => path === m || path.startsWith(m + '/')));
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
      <main className={'main' + (bare ? ' bare' : '')} id="main">
        {children}
      </main>
      {!bare && <nav className="tabbar" aria-label={t('nav.main')}>
        {items[role].map((it) => (
          <Link key={it.to} to={it.to} aria-current={isActive(it) ? 'page' : undefined}>
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
