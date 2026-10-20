// A small hash router: works on any static host and inside the single-file demo.
import React, { useEffect, useState } from 'react';

function current() {
  const h = window.location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = h.split('?');
  return { path: path || '/', query: Object.fromEntries(new URLSearchParams(qs)) as Record<string, string> };
}

export function useLocation() {
  const [loc, setLoc] = useState(current);
  useEffect(() => {
    const on = () => setLoc(current());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return loc;
}

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  const url = '#' + to;
  if (opts.replace) window.location.replace(url);
  else window.location.hash = to;
  window.scrollTo(0, 0);
}

export function back(fallback = '/') {
  if (window.history.length > 1) window.history.back();
  else navigate(fallback);
}

export function match(pattern: string, path: string): Record<string, string> | null {
  const keys: string[] = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '/?$');
  const m = path.match(re);
  if (!m) return null;
  const out: Record<string, string> = {};
  keys.forEach((k, i) => (out[k] = decodeURIComponent(m[i + 1])));
  return out;
}

type LinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string };
export function Link({ to, onClick, ...rest }: LinkProps) {
  return (
    <a
      href={'#' + to}
      onClick={(e) => {
        onClick?.(e);
        if (!e.defaultPrevented) window.scrollTo(0, 0);
      }}
      {...rest}
    />
  );
}
