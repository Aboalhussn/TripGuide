// The trip assistant: a chat that writes the tourist's trip post (#/post/chat), and the page where they
// check it and post it (#/post/review). The AI runs on the server (POST /api/assistant/trip); this page
// keeps the chat and the draft, shows suggestion chips, and posts with the normal POST /requests.
// See docs/AI_ASSISTANT.md.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiFailure } from '../lib/api';
import { useApp, useLoad } from '../lib/app';
import { useFmt } from '../lib/format';
import { Link, navigate } from '../lib/router';
import { checkDraft, draftDays, toRequestBody, type MissingKey, type TripDraft } from '../../core/draft';
import { applySuggestion, clearState, draftContext, freshState, isApplied, loadState, normalizeDraft, saveState, type AssistantState, type Suggestion } from '../lib/assistant';
import { Icon, Loading, PageHead, TripCard, useBusy } from '../ui';

const MAX_CHARS = 600;

// Is the assistant turned on? The offline phone app has no server, so the call fails and the answer is no.
function useAssistantOn() {
  const res = useLoad(() => api<{ enabled: boolean }>('GET', '/assistant/status').catch(() => ({ enabled: false })), []);
  return res.data ? res.data.enabled : null;
}

// The card on the tourist's home screen. Shows nothing when the assistant is off.
export function AssistantCta() {
  const { t } = useApp();
  if (!useAssistantOn()) return null;
  return (
    <Link to="/post/chat" className="card ai-cta link">
      <span className="ai-mark lg" aria-hidden="true">
        <Icon name="chat" size={24} />
      </span>
      <span className="stack" style={{ gap: 4, flex: 1, minWidth: 0 }}>
        <strong>{t('ai.cta_title')}</strong>
        <span className="small muted">{t('ai.cta_text')}</span>
        <span className="btn sm" style={{ alignSelf: 'flex-start', marginTop: 6 }}>
          {t('ai.cta_btn')}
        </span>
      </span>
    </Link>
  );
}

// A link at the top of the four-step form.
export function AssistantLink() {
  const { t } = useApp();
  if (!useAssistantOn()) return null;
  return (
    <Link to="/post/chat" className="ai-form-link">
      <Icon name="chat" size={18} />
      <span>{t('ai.form_link')}</span>
    </Link>
  );
}

function Unavailable() {
  const { t } = useApp();
  return (
    <div className="page" style={{ maxWidth: 640, margin: '0 auto', width: '100%' }}>
      <PageHead title={t('ai.title')} backTo="/" />
      <div className="card stack">
        <p>{t('ai.unavailable')}</p>
        <Link to="/post" className="btn">
          {t('ai.use_form')}
        </Link>
      </div>
    </div>
  );
}

function OnlyTourists() {
  const { t } = useApp();
  return (
    <div className="page">
      <PageHead title={t('ai.title')} />
      <div className="note">{t('post.only_tourists')}</div>
    </div>
  );
}

// ---------- the draft as small chips ----------

function DraftChips({ draft }: { draft: TripDraft }) {
  const { t } = useApp();
  const fmt = useFmt();
  const chips: { icon: string; text: string }[] = [];
  if (draft.cities.length) chips.push({ icon: 'pin', text: fmt.cities(draft.cities) });
  if (draftDays(draft)) chips.push({ icon: 'calendar', text: `${fmt.range(draft.startDate, draft.endDate)} · ${t('post.days', { count: draftDays(draft) })}` });
  if (draft.groupSize) chips.push({ icon: 'users', text: t('request.people', { count: draft.groupSize }) });
  if (draft.languages.length) chips.push({ icon: 'globe', text: fmt.list(draft.languages.map(fmt.language)) });
  if (draft.budgetMax !== null) chips.push({ icon: 'money', text: `${fmt.usd(draft.budgetMin ?? 0)}–${fmt.usd(draft.budgetMax)}${fmt.perDaySuffix}` });
  if (draft.places.length) chips.push({ icon: 'heart', text: t('ai.places_n', { count: draft.places.length }) });
  if (!chips.length) return null;
  return (
    <div className="ai-draft-chips" aria-label={t('ai.chips_label')}>
      {chips.map((c) => (
        <span key={c.icon} className="chip">
          <Icon name={c.icon} size={14} /> <bdi>{c.text}</bdi>
        </span>
      ))}
    </div>
  );
}

function missingText(t: (k: string, p?: any) => string, fmt: ReturnType<typeof useFmt>, missing: MissingKey[]) {
  return fmt.list(missing.map((k) => t('ai.missing.' + k)));
}

function SuggestionChip({ s, onPick }: { s: Suggestion; onPick(): void }) {
  const { t } = useApp();
  const fmt = useFmt();
  const label =
    s.kind === 'place'
      ? t('ai.sug_place', { name: fmt.place(s.placeId) })
      : s.kind === 'budget'
        ? t('ai.sug_budget', { range: `${fmt.usd(s.min)}–${fmt.usd(s.max)}` })
        : t('ai.sug_plan', { count: s.plan.length });
  if (s.kind === 'place' && !fmt.place(s.placeId)) return null;
  return (
    <button type="button" className="ai-sug" onClick={onPick}>
      <Icon name={s.kind === 'place' ? 'plus' : s.kind === 'budget' ? 'money' : 'list'} size={16} />
      <bdi>{label}</bdi>
    </button>
  );
}

// ---------- the chat ----------

export function AssistantChat() {
  const { t, me, meta, lang, ask, errorText } = useApp();
  const fmt = useFmt();
  const on = useAssistantOn();
  const ctx = useMemo(() => draftContext(meta), [meta]);
  const [state, setState] = useState<AssistantState>(() => {
    const s = loadState();
    return { ...s, draft: normalizeDraft(s.draft, draftContext(meta)) };
  });
  const [text, setText] = useState('');
  const [waiting, setWaiting] = useState(false);
  const [failed, setFailed] = useState<{ text: string; message: string } | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => saveState(state), [state]);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [state.messages.length, waiting, failed, state.suggestions.length]);

  // Phone layout, like the message screen: header on top, the chat scrolls, the box sits above the keyboard.
  useEffect(() => {
    if (!on) return;
    const root = document.documentElement;
    root.classList.add('chat-lock');
    const vv = window.visualViewport;
    const fit = () => {
      const el = boxRef.current;
      if (!el || !vv) return;
      if (window.innerWidth >= 960) {
        el.style.height = el.style.transform = '';
        return;
      }
      el.style.height = vv.height + 'px';
      el.style.transform = vv.offsetTop ? `translateY(${vv.offsetTop}px)` : '';
    };
    fit();
    vv?.addEventListener('resize', fit);
    vv?.addEventListener('scroll', fit);
    return () => {
      root.classList.remove('chat-lock');
      vv?.removeEventListener('resize', fit);
      vv?.removeEventListener('scroll', fit);
    };
  }, [on]);

  if (me?.role !== 'tourist') return <OnlyTourists />;
  if (on === null) return <Loading />;
  if (!on) return <Unavailable />;

  const first = me.name.split(' ')[0];
  const examples = [t('ai.ex1'), t('ai.ex2'), t('ai.ex3')];
  const { missing } = checkDraft(state.draft, ctx);
  const ready = missing.length === 0;

  const send = async (raw?: string) => {
    const body = (raw ?? text).trim().slice(0, MAX_CHARS);
    if (!body || waiting) return;
    const messages = [...state.messages, { role: 'user' as const, content: body }];
    setState((s) => ({ ...s, messages, suggestions: [] }));
    setText('');
    setFailed(null);
    setWaiting(true);
    try {
      const r = await api<any>('POST', '/assistant/trip', { messages, draft: state.draft, lang });
      setState({
        messages: [...messages, { role: 'assistant', content: r.reply }],
        draft: normalizeDraft(r.draft, ctx),
        missing: r.missing,
        suggestions: r.suggestions || [],
        ready: r.ready,
      });
    } catch (e) {
      // Take the message back out so it can be sent again.
      setState((s) => ({ ...s, messages: s.messages.slice(0, -1) }));
      setFailed({ text: body, message: errorText(e) });
      if (e instanceof ApiFailure && e.status === 401) navigate('/login?next=' + encodeURIComponent('/post/chat'));
    } finally {
      setWaiting(false);
      inputRef.current?.focus({ preventScroll: true });
    }
  };

  const pick = (s: Suggestion) => {
    setState((st) => {
      const draft = applySuggestion(st.draft, s, ctx);
      return { ...st, draft, suggestions: st.suggestions.filter((x) => x !== s) };
    });
  };

  const restart = async () => {
    if (!(await ask(t('ai.restart_confirm'), t('ai.restart')))) return;
    clearState();
    setState(freshState());
    setFailed(null);
  };

  const openSuggestions = state.suggestions.filter((s) => !isApplied(state.draft, s));
  return (
    <div className="chat ai-chat" ref={boxRef}>
      <div className="row chat-head ai-head">
        <button type="button" className="back icon-btn" aria-label={t('common.back')} onClick={() => navigate('/')}>
          <Icon name="back" />
        </button>
        <span className="ai-mark" aria-hidden="true">
          <Icon name="chat" size={20} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="bold">{t('ai.title')}</div>
          <div className="xs muted">{t('ai.subtitle')}</div>
        </div>
        {state.messages.length > 0 && (
          <button type="button" className="icon-btn" aria-label={t('ai.restart')} title={t('ai.restart')} onClick={restart}>
            <Icon name="trash" size={20} />
          </button>
        )}
      </div>

      <div className="chat-log" ref={logRef} role="log" aria-label={t('ai.title')} aria-live="polite">
        <div className="bubble them">{t('ai.hello', { name: first })}</div>
        {state.messages.length === 0 && (
          <div className="stack ai-examples">
            <span className="xs muted">{t('ai.examples')}</span>
            {examples.map((ex) => (
              <button key={ex} type="button" className="ai-example" onClick={() => send(ex)} disabled={waiting}>
                <bdi>{ex}</bdi>
              </button>
            ))}
          </div>
        )}
        {state.messages.map((m, i) => (
          <div key={i} className={'bubble ' + (m.role === 'user' ? 'me' : 'them')}>
            <bdi>{m.content}</bdi>
          </div>
        ))}
        {waiting && (
          <div className="bubble them ai-typing" aria-label={t('ai.thinking')}>
            <i />
            <i />
            <i />
          </div>
        )}
        {failed && (
          <div className="note danger stack" style={{ alignSelf: 'stretch', gap: 8 }} role="alert">
            <span>{failed.message}</span>
            <button type="button" className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => send(failed.text)}>
              {t('common.retry')}
            </button>
          </div>
        )}
        {!waiting && openSuggestions.length > 0 && (
          <div className="stack ai-sugs">
            <span className="xs muted">{t('ai.sug_title')}</span>
            <div className="chips">
              {openSuggestions.map((s, i) => (
                <SuggestionChip key={i} s={s} onPick={() => pick(s)} />
              ))}
            </div>
          </div>
        )}
        <div className="xs muted center ai-disclaimer">{t('ai.limit_note')}</div>
      </div>

      <div className="ai-bar">
        <DraftChips draft={state.draft} />
        {state.messages.length > 0 && (
          <div className="between" style={{ gap: 10, flexWrap: 'nowrap' }}>
            <span className="xs muted" style={{ minWidth: 0 }}>
              {ready ? t('ai.ready') : t('ai.still_need', { list: missingText(t, fmt, missing) })}
            </span>
            <Link to="/post/review" className={'btn sm' + (ready ? '' : ' ghost')}>
              {t('ai.review')}
            </Link>
          </div>
        )}
      </div>

      <form
        className="chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <label style={{ flex: 1, display: 'flex' }}>
          <span className="sr-only">{t('ai.write')}</span>
          <textarea
            ref={inputRef}
            rows={1}
            value={text}
            placeholder={t('ai.write')}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            maxLength={MAX_CHARS}
          />
        </label>
        <button type="submit" className="send" aria-label={t('ai.send')} disabled={waiting || !text.trim()}>
          <Icon name="send" size={20} stroke={2} className="flip" />
        </button>
      </form>
    </div>
  );
}

// ---------- the review page ----------

// The cover the form would use: the first photo of the first governorate (or the general heritage photos).
function firstCover(meta: any, cities: string[]): string | undefined {
  for (const c of cities) {
    const own: string[] = meta.cityCovers?.[c] || [];
    if (own.length) return own[0];
  }
  return (meta.generalCovers || [])[0];
}

function ReviewSection({ title, step, children }: { title: string; step: number; children: React.ReactNode }) {
  const { t } = useApp();
  return (
    <section className="card stack ai-section">
      <div className="between">
        <h2 style={{ fontSize: 17 }}>{title}</h2>
        <Link to={`/post?from=assistant&step=${step}`} className="btn sm ghost">
          <Icon name="edit" size={16} /> {t('ai.edit')}
        </Link>
      </div>
      {children}
    </section>
  );
}

export function AssistantReview() {
  const { t, me, meta, toast, errorText } = useApp();
  const fmt = useFmt();
  const ctx = useMemo(() => draftContext(meta), [meta]);
  const [draft] = useState(() => normalizeDraft(loadState().draft, ctx));
  const [error, setError] = useState<string | null>(null);
  const { busy, run } = useBusy();

  if (me?.role !== 'tourist') return <OnlyTourists />;
  const { missing, problems } = checkDraft(draft, ctx);
  const days = draftDays(draft);
  const empty = !draft.cities.length && !draft.title;
  const cover = firstCover(meta, draft.cities);
  const body = toRequestBody(draft, { cover });

  const post = () =>
    run(async () => {
      setError(null);
      try {
        const r = await api<any>('POST', '/requests', body);
        clearState();
        toast(t('post.posted'));
        navigate(`/requests/${r.id}`, { replace: true });
      } catch (e) {
        setError(errorText(e));
        throw e;
      }
    });

  return (
    <div className="page" style={{ maxWidth: 640, margin: '0 auto', width: '100%' }}>
      <PageHead title={t('ai.review_title')} backTo="/post/chat" />
      {empty ? (
        <div className="card stack">
          <p>{t('ai.empty')}</p>
          <Link to="/post/chat" className="btn">
            {t('ai.back_chat')}
          </Link>
        </div>
      ) : (
        <>
          <p className="muted">{t('ai.review_lede')}</p>
          {draft.cities.length > 0 && draftDays(draft) > 0 && (
            <div className="ai-preview" aria-hidden="true">
              <TripCard r={{ ...body, id: 0, days, tourist: me, createdAt: new Date().toISOString() }} />
            </div>
          )}

          {missing.length > 0 && (
            <div className="note warn" role="status">
              <strong>{t('ai.incomplete')}</strong> {t('ai.still_need', { list: missingText(t, fmt, missing) })}
              {problems.map((p) => (
                <div key={p.code}>{t(p.code === 'budget_low' ? 'v.budget_low' : 'err.' + p.code, { amount: fmt.usd(10) })}</div>
              ))}
            </div>
          )}

          <ReviewSection title={t('ai.r_where')} step={0}>
            <div className="bold">
              <bdi>{draft.title || '—'}</bdi>
            </div>
            <div className="small">{draft.cities.length ? fmt.cities(draft.cities) : t('ai.missing.cities')}</div>
            <div className="chips">
              {draft.places.length ? draft.places.map((id) => <span key={id} className="chip">{fmt.place(id)}</span>) : <span className="xs muted">{t('ai.no_places')}</span>}
            </div>
          </ReviewSection>

          <ReviewSection title={t('ai.r_when')} step={1}>
            <div className="small">{days ? `${fmt.range(draft.startDate, draft.endDate)} · ${t('post.days', { count: days })}` : t('ai.missing.dates')}</div>
            <div className="small">{draft.groupSize ? t('request.people', { count: draft.groupSize }) : t('ai.missing.groupSize')}</div>
          </ReviewSection>

          <ReviewSection title={t('ai.r_guide')} step={2}>
            <div className="small">
              {t('post.guide_speaks')}: {draft.languages.length ? fmt.list(draft.languages.map(fmt.language)) : '—'}
            </div>
            {draft.femaleGuide && <div className="small">{t('post.female_guide')}</div>}
            {draft.interests.length > 0 && (
              <div className="chips">
                {draft.interests.map((i) => (
                  <span key={i} className="chip">{t('interest.' + i)}</span>
                ))}
              </div>
            )}
            {draft.description && (
              <p className="small" style={{ whiteSpace: 'pre-wrap' }}>
                <bdi>{draft.description}</bdi>
              </p>
            )}
            {draft.plan.length > 0 && (
              <ol className="ai-plan small">
                {draft.plan.map((d, i) => (
                  <li key={i}>
                    <strong>{t('post.day_n', { n: i + 1 })}: </strong>
                    <bdi>{d.title}</bdi>
                    {d.details && <div className="muted"><bdi>{d.details}</bdi></div>}
                  </li>
                ))}
              </ol>
            )}
          </ReviewSection>

          <ReviewSection title={t('ai.r_budget')} step={3}>
            {draft.budgetMax !== null ? (
              <>
                <div className="small">
                  {fmt.usd(draft.budgetMin ?? 0)}–{fmt.usd(draft.budgetMax)}
                  {fmt.perDaySuffix}
                </div>
                {days > 0 && (
                  <div className="xs muted">
                    {t('post.whole_trip', { count: days })}: {fmt.usd(body.budgetMin)}–{fmt.usd(body.budgetMax)}
                  </div>
                )}
              </>
            ) : (
              <div className="small">{t('ai.missing.budget')}</div>
            )}
          </ReviewSection>

          {error && (
            <div className="note danger" role="alert">
              {error}
            </div>
          )}
          <p className="xs muted">{t('post.privacy')}</p>
          <div className="stack" style={{ gap: 10 }}>
            <button type="button" className="btn" onClick={post} disabled={busy || missing.length > 0}>
              {t('ai.post')}
            </button>
            <Link to="/post/chat" className="btn ghost">
              {t('ai.back_chat')}
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
