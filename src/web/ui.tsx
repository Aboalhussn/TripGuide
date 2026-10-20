import React, { useEffect, useRef, useState } from 'react';
import { useApp } from './lib/app';
import { useFmt } from './lib/format';
import { Link, back } from './lib/router';
import { asset, photoSrc } from './assets';

// ---------- icons (one stroke set) ----------
const P: Record<string, React.ReactNode> = {
  home: <path d="M3 10.5L12 3l9 7.5V21h-6v-6H9v6H3z" />,
  search: (<><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>),
  plus: <path d="M12 5v14M5 12h14" />,
  chat: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />,
  calendar: (<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>),
  user: (<><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>),
  bell: (<><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>),
  back: <path d="M15 5l-7 7 7 7" />,
  next: <path d="M9 5l7 7-7 7" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  send: <path d="M4 12l16-8-6 16-3-7z" />,
  list: <path d="M4 6h16M4 12h16M4 18h10" />,
  offer: (<><path d="M4 4h16v12H8l-4 4z" /><path d="M9 9h6" /></>),
  wallet: (<><rect x="3" y="6" width="18" height="14" rx="2" /><path d="M3 10h18M16 15h2" /></>),
  shield: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />,
  flag: <path d="M5 21V4h11l-1.5 4L16 12H5" />,
  logout: <path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" />,
  clock: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  pin: (<><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>),
  users: (<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c1-3.5 3.5-5 6.5-5s5.5 1.5 6.5 5" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 15c2 .6 3.2 2.2 3.5 5" /></>),
  filter: <path d="M4 6h16M7 12h10M10 18h4" />,
  heart: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
  image: (<><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="11" r="2" /><path d="M21 16l-5-5-9 8" /></>),
  edit: <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />,
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  money: (<><rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /></>),
  info: (<><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>),
  more: (<><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>),
};
export function Icon({ name, size = 22, stroke = 1.8, className }: { name: keyof typeof P | string; size?: number; stroke?: number; className?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" className={className}>
      {P[name]}
    </svg>
  );
}

export function Star({ size = 15, filled = true }: { size?: number; filled?: boolean }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24">
      <path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" fill={filled ? '#F7AD19' : 'none'} stroke={filled ? 'none' : '#9fb5c0'} strokeWidth="1.5" />
    </svg>
  );
}

export function VerifiedBadge({ size = 18 }: { size?: number }) {
  const { t } = useApp();
  return (
    <svg role="img" aria-label={t('badge.verified')} width={size} height={size} viewBox="0 0 24 24" style={{ flex: 'none' }}>
      <title>{t('badge.verified')}</title>
      <path d="M12 2l2.4 1.8 3-.2.9 2.9 2.5 1.7-.9 2.9.9 2.9-2.5 1.7-.9 2.9-3-.2L12 22l-2.4-1.8-3 .2-.9-2.9-2.5-1.7.9-2.9-.9-2.9 2.5-1.7.9-2.9 3 .2z" fill="#429EBD" />
      <path d="M8 12.3l2.6 2.6L16 9.5" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function initials(name: string) {
  const parts = name.replace(/\./g, '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0][0];
  // "Al-Rubaie" → R, "de Vries" → V
  const lastPart = parts.length > 1 ? parts[parts.length - 1].replace(/^(al|el)-/i, '') : '';
  const last = lastPart ? lastPart[0] : '';
  return (first + last).toUpperCase();
}

export function Avatar({ user, size = 48 }: { user: { name: string; avatarColor?: number }; size?: number }) {
  return (
    <span className={'avatar av-' + ((user.avatarColor ?? 0) % 6)} style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }} aria-hidden="true">
      {initials(user.name)}
    </span>
  );
}

export function Rating({ rating, count, size = 15 }: { rating: number | null; count?: number; size?: number }) {
  const { t } = useApp();
  const fmt = useFmt();
  if (rating === null) return <span className="pill">{t('guide.new')}</span>;
  return (
    <span className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
      <Star size={size} />
      <strong>{fmt.num(rating)}</strong>
      {count !== undefined && <span className="muted">({fmt.num(count)})</span>}
    </span>
  );
}

export function StarInput({ value, onChange, label }: { value: number; onChange(n: number): void; label: string }) {
  const { t } = useApp();
  return (
    <div className="between" role="radiogroup" aria-label={label}>
      <span>{label}</span>
      <span className="row" style={{ gap: 0 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={t('review.stars', { count: n })}
            onClick={() => onChange(n)}
            style={{ width: 40, height: 40, border: 'none', background: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <Star size={26} filled={n <= value} />
          </button>
        ))}
      </span>
    </div>
  );
}

export function Money({ usd, iqd = false, className }: { usd: number; iqd?: boolean; className?: string }) {
  const fmt = useFmt();
  return (
    <span className={className}>
      <span className="nowrap">{fmt.usd(usd)}</span>
      {iqd && <span className="muted small nowrap"> ≈ {fmt.iqd(usd)}</span>}
    </span>
  );
}

export function ResponseTime({ minutes }: { minutes: number | null }) {
  const { t } = useApp();
  if (minutes === null) return null;
  if (minutes < 60) return <span>{t('guide.replies_min', { count: Math.max(5, Math.round(minutes / 5) * 5) })}</span>;
  if (minutes < 60 * 24) return <span>{t('guide.replies_hour', { count: Math.round(minutes / 60) })}</span>;
  return <span>{t('guide.replies_day')}</span>;
}

export function PageHead({ title, backTo, children }: { title: React.ReactNode; backTo?: string; children?: React.ReactNode }) {
  const { t } = useApp();
  return (
    <div className="page-head">
      {backTo !== undefined && (
        <button type="button" className="back icon-btn" aria-label={t('common.back')} onClick={() => back(backTo)}>
          <Icon name="back" />
        </button>
      )}
      <h1>{title}</h1>
      {children}
    </div>
  );
}

export function Loading({ rows = 3 }: { rows?: number }) {
  const { t } = useApp();
  return (
    <div className="page" aria-busy="true">
      <span className="sr-only">{t('common.loading')}</span>
      <div className="skeleton" style={{ height: 34, width: '60%' }} />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 110 }} />
      ))}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t, errorText } = useApp();
  return (
    <div className="page">
      <div className="empty card">
        <h2>{t('err.title')}</h2>
        <p className="muted">{errorText(error)}</p>
        {onRetry && (
          <button className="btn outline" onClick={onRetry}>
            {t('common.retry')}
          </button>
        )}
      </div>
    </div>
  );
}

export function Empty({ title, text, action }: { title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="empty card">
      <img src={asset('tg-mark.svg')} alt="" />
      <h3>{title}</h3>
      {text && <p className="muted small">{text}</p>}
      {action}
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose(): void; children: React.ReactNode }) {
  const { t } = useApp();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('input, textarea, select, button:not([data-close])');
    first?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prev?.focus();
    };
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="between">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" data-close aria-label={t('common.close')} onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, hint, error, children }: { label: React.ReactNode; hint?: React.ReactNode; error?: string | null; children: React.ReactElement<any> }) {
  // The label names the control; the hint and error describe it.
  const id = React.useId();
  const hintId = hint ? id + '-hint' : undefined;
  const errId = error ? id + '-err' : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined;
  const control = React.cloneElement(children, { id: children.props.id || id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined });
  return (
    <div className="field">
      <label htmlFor={children.props.id || id}>{label}</label>
      {control}
      {hint && (
        <span className="hint" id={hintId}>
          {hint}
        </span>
      )}
      {error && (
        <span className="err" id={errId}>
          {error}
        </span>
      )}
    </div>
  );
}

export function ToggleGroup<T extends string>({ options, value, onChange, label, render }: { options: T[]; value: T[]; onChange(v: T[]): void; label: string; render(o: T): string }) {
  return (
    <div className="stack" style={{ gap: 6 }}>
      <span className="small" style={{ fontWeight: 500 }} id={'tg-' + label}>
        {label}
      </span>
      <div className="chips" role="group" aria-labelledby={'tg-' + label}>
        {options.map((o) => (
          <button key={o} type="button" className="toggle-chip" aria-pressed={value.includes(o)} onClick={() => onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o])}>
            {render(o)}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Stepper({ value, onChange, min = 1, max = 50, label }: { value: number; onChange(n: number): void; min?: number; max?: number; label: string }) {
  const { t } = useApp();
  const fmt = useFmt();
  return (
    <div className="stepper">
      <span>{label}</span>
      <div className="row" style={{ gap: 14, flexWrap: 'nowrap' }}>
        <button type="button" aria-label={t('common.fewer')} onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}>
          −
        </button>
        <strong style={{ fontSize: 18, minWidth: 24, textAlign: 'center' }} aria-live="polite">
          {fmt.num(value)}
        </strong>
        <button type="button" aria-label={t('common.more')} onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}>
          +
        </button>
      </div>
    </div>
  );
}

export function GuideCard({ g, compact = false }: { g: any; compact?: boolean }) {
  const { t } = useApp();
  const fmt = useFmt();
  return (
    <Link to={`/guides/${g.id}`} className="card link stack" style={{ gap: 12 }}>
      <div className="row" style={{ gap: 12, flexWrap: 'nowrap', alignItems: 'flex-start' }}>
        <Avatar user={g} size={compact ? 52 : 60} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: 6 }}>
            <strong style={{ fontSize: 17 }}>{g.name}</strong>
            {g.stats.verified && <VerifiedBadge />}
            {g.stats.topGuide && <span className="pill gold">{t('badge.top')}</span>}
          </div>
          <div className="small muted" style={{ marginTop: 3 }}>
            {fmt.pick(g.headline, g.headlineAr)}
          </div>
        </div>
        <div style={{ textAlign: 'end' }}>
          <strong style={{ fontSize: 18 }}>{fmt.usd(g.pricePerDay)}</strong>
          <div className="xs muted">{t('common.per_day')}</div>
        </div>
      </div>
      <div className="row small" style={{ gap: 14 }}>
        <Rating rating={g.stats.rating} count={g.stats.reviewsCount} />
        <span>{t('guide.tours', { count: g.stats.toursCompleted })}</span>
        {!compact && <ResponseTime minutes={g.stats.responseMinutes} />}
      </div>
      {!compact && (
        <div className="chips">
          {g.cities.map((c: string) => (
            <span key={c} className="chip">
              <Icon name="pin" size={13} /> {fmt.city(c)}
            </span>
          ))}
          {g.languages.slice(0, 3).map((l: any) => (
            <span key={l.code} className="chip lang">
              {fmt.language(l.code)}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}

export function RequestStatus({ status }: { status: string }) {
  const { t } = useApp();
  const cls: Record<string, string> = { open: 'ok', awarded: 'gold', hired: 'sky', closed: '' };
  return <span className={'pill ' + (cls[status] || '')}>{t('request.status.' + status)}</span>;
}

export function BookingStatus({ status }: { status: string }) {
  const { t } = useApp();
  const cls: Record<string, string> = { awaiting_guide: 'gold', confirmed: 'ok', completed: 'sky', cancelled: '', declined: '', expired: '', disputed: 'danger' };
  return <span className={'pill ' + (cls[status] || '')}>{t('booking.status.' + status)}</span>;
}

export function OfferStatus({ status }: { status: string }) {
  const { t } = useApp();
  const cls: Record<string, string> = { pending: 'sky', awarded: 'gold', accepted: 'ok', declined: '', withdrawn: '', not_selected: '' };
  return <span className={'pill ' + (cls[status] || '')}>{t('offer.status.' + status)}</span>;
}

export function RequestFacts({ r }: { r: any }) {
  const { t } = useApp();
  const fmt = useFmt();
  return (
    <div className="chips">
      <span className="chip">
        <Icon name="calendar" size={14} /> {fmt.range(r.startDate, r.endDate)}
      </span>
      <span className="chip">
        <Icon name="pin" size={14} /> {fmt.cities(r.cities)}
      </span>
      <span className="chip">
        <Icon name="users" size={14} /> {t('request.people', { count: r.groupSize })}
      </span>
      <span className="chip lang">{fmt.list(r.languages.map(fmt.language))}</span>
      <span className="chip">
        {fmt.usd(r.budgetMin)}–{fmt.usd(r.budgetMax)}
      </span>
    </div>
  );
}

export function Photo({ src, alt, className, style }: { src: string; alt: string; className?: string; style?: React.CSSProperties }) {
  return <img src={photoSrc(src)} alt={alt} className={className} style={style} loading="lazy" />;
}

// Month calendar used for availability (read-only) and for guides blocking days.
export function MonthCalendar({ month, blocked, booked, selected, onToggle, today }: { month: string; blocked: string[]; booked: { start: string; end: string }[]; selected?: { start: string; end: string } | null; onToggle?(d: string): void; today: string }) {
  const { lang } = useApp();
  const first = new Date(month + '-01T12:00:00Z');
  const startDow = first.getUTCDay();
  const daysIn = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const names = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(lang === 'ar' ? 'ar-IQ' : 'en-GB', { weekday: 'narrow', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 7 + i))));
  const nf = new Intl.NumberFormat(lang === 'ar' ? 'ar-IQ' : 'en-US');
  const cells: React.ReactNode[] = [];
  for (let i = 0; i < startDow; i++) cells.push(<span key={'e' + i} className="d empty" />);
  for (let d = 1; d <= daysIn; d++) {
    const iso = `${month}-${String(d).padStart(2, '0')}`;
    const isBooked = booked.some((b) => iso >= b.start && iso <= b.end);
    const isBlocked = blocked.includes(iso);
    const isSel = !!selected && iso >= selected.start && iso <= selected.end;
    const past = iso < today;
    const cls = 'd' + (past ? ' past' : isSel ? ' sel' : isBooked || isBlocked ? ' off' : '');
    cells.push(
      onToggle && !past && !isBooked ? (
        <button key={iso} type="button" className={cls} aria-pressed={isBlocked} onClick={() => onToggle(iso)}>
          {nf.format(d)}
        </button>
      ) : (
        <span key={iso} className={cls}>
          {nf.format(d)}
        </span>
      ),
    );
  }
  return (
    <div className="cal">
      {names.map((n, i) => (
        <span key={i} className="faint">
          {n}
        </span>
      ))}
      {cells}
    </div>
  );
}

export function useBusy() {
  const [busy, setBusy] = useState(false);
  const { toast, errorText } = useApp();
  const run = async (fn: () => Promise<unknown>, okText?: string) => {
    if (busy) return false;
    setBusy(true);
    try {
      await fn();
      if (okText) toast(okText);
      return true;
    } catch (e) {
      toast(errorText(e), 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}
