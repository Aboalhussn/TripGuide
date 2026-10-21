// The trip assistant: one chat turn = one AI call. The tourist describes the trip, the AI fills the draft
// and recommends places, a budget and a day plan; code (src/core/draft.ts) decides what is still missing
// and cleans everything the AI says. Nothing is saved and nothing is posted here: the tourist posts from
// the review page with POST /requests. See docs/AI_ASSISTANT.md.
import { applyPatch, checkDraft, draftDays, normalizeDraft, type DraftContext, type DraftProblem, type MissingKey, type TripDraft } from '../core/draft';
import type { ApiRequest, ApiResponse, Place } from '../core/types';
import { AiError, type AiProvider, type ChatMessage } from './ai';

// What GET /assistant/context returns (see src/core/api.ts).
export interface GuidePrice { guides: number; low: number | null; typical: number | null; high: number | null; languages: string[] }
export interface AssistantContext extends DraftContext {
  tourist: { name: string; country: string };
  guidePrices: Record<string, GuidePrice>;
}

// Suggestion chips. The app turns them into labels and applies them to the draft itself (no extra AI call).
export type Suggestion =
  | { kind: 'place'; placeId: number }
  | { kind: 'budget'; min: number; max: number }
  | { kind: 'plan'; plan: { title: string; details: string }[] };

export interface TurnInput { messages: ChatMessage[]; draft: TripDraft; lang: 'en' | 'ar' }
export interface TurnResult { reply: string; draft: TripDraft; missing: MissingKey[]; problems: DraftProblem[]; suggestions: Suggestion[]; ready: boolean }

// What the mock provider (and tests) see instead of the long prompt.
export interface TurnView { draft: TripDraft; missing: MissingKey[]; problems: DraftProblem[]; ctx: AssistantContext; lang: 'en' | 'ar'; lastUser: string }

export const LIMITS = { messageChars: 600, messages: 30, callsPerWindow: 20, windowMs: 10 * 60_000 };

const LANGUAGE_NAMES: Record<string, string> = {
  ar: 'Arabic', en: 'English', ku: 'Kurdish', fa: 'Persian', tr: 'Turkish', ur: 'Urdu', fr: 'French', de: 'German', es: 'Spanish', it: 'Italian', ru: 'Russian', zh: 'Chinese',
};

const NEEDED_TEXT: Record<MissingKey, string> = {
  cities: 'which governorates they want to visit (1–4)',
  dates: 'the exact start and end dates (from today, at most 30 days)',
  groupSize: 'how many people are travelling (1–10)',
  languages: 'which language(s) the guide should speak (1–3)',
  budget: 'their budget per day for the guide, in US dollars',
  title: 'a short title (you write it yourself; never ask the tourist)',
};

// ---------- the prompt ----------

function placeLine(p: Place) {
  return `  ${p.id}: ${p.name} / ${p.nameAr} (${p.kind})`;
}

export function buildSystemPrompt(view: TurnView): string {
  const { ctx, draft, missing, problems, lang } = view;
  const governorates = ctx.cities
    .map((c) => {
      const g = ctx.guidePrices[c.slug];
      const price = g && g.guides ? `${g.guides} guides, typical $${g.typical}/day (most charge $${g.low}–$${g.high}), guide languages: ${g.languages.join(', ')}` : 'no guides yet';
      return `- ${c.slug}: ${c.name} / ${c.nameAr} — ${price}`;
    })
    .join('\n');
  const places = ctx.cities
    .map((c) => {
      const list = ctx.places.filter((p) => p.city === c.slug);
      return list.length ? `${c.slug}:\n${list.map(placeLine).join('\n')}` : '';
    })
    .filter(Boolean)
    .join('\n');
  const days = draftDays(draft);
  const needed = missing.length ? missing.map((k) => `- ${k}: ${NEEDED_TEXT[k]}`).join('\n') : '- nothing: the draft is complete';
  const wrong = problems.length ? problems.map((p) => `- ${p.key}: ${p.code}${p.params ? ' ' + JSON.stringify(p.params) : ''}`).join('\n') : '- none';

  return `You are the trip assistant inside "Trip guide", an app that connects tourists visiting Iraq with local, verified tour guides. The tourist posts a trip, and guides send offers with a price and a day-by-day plan. You help the tourist write their trip post by chatting with them.

Each turn:
1. Read the tourist's latest message and update the draft. Put ONLY the fields that should change in "patch". Lists (cities, places, languages, interests, plan) replace the old list, so send the full new list.
2. If required parts are still missing, ask about them: at most two things per message, short and friendly. Never ask for a title: write a clear one yourself (5–90 characters) as soon as you know where they are going.
3. Recommend things that fit them, using only the data below: heritage places (by id) that match their interests, a sensible budget per day based on what guides really charge, and how many days the places need.
4. When nothing required is missing, give a two-line summary and tell them to tap "Review my trip" to check and post it.

Rules:
- Use only the governorate slugs, place ids, language codes and interests listed below. Never invent places, prices or facts.
- Today is ${ctx.today} (Iraq time). Dates are YYYY-MM-DD. Turn relative dates ("next Friday", "for 3 days") into real dates. If they are vague ("early December"), propose exact dates in the patch and ask them to confirm. You may send "days" with "startDate" instead of "endDate".
- The budget is the price per day for the guide, for the whole group, in US dollars (budgetMin and budgetMax). If they give one number, send it as budgetMax.
- groupSize counts everyone travelling ("me and my wife" = 2, "alone" = 1).
- languages are the languages the guide should speak. If they don't say, use the language they are writing in and mention it in one short phrase.
- Fill "description" with 1–3 sentences in the tourist's words about what they want (interests, pace, special needs).
- Only fill "plan" (one {title, details} per day) when they describe their days or accept a suggested plan; otherwise offer one in "suggest.plan".
- You cannot book, pay or post anything. Never say the trip is posted.
- Keep the reply under 80 words, plain text, no markdown headings or tables.
- Reply in the tourist's language. The app is set to ${lang === 'ar' ? 'Arabic' : 'English'}. In Arabic, write simple, friendly Arabic (Iraqi dialect is welcome).
- If they ask about something unrelated to planning their trip in Iraq, answer in one line and bring them back. For visas or safety, tell them to check their government's official travel advice.

Answer with ONLY one JSON object, nothing before or after it:
{"reply": "text for the tourist", "patch": {"title"?, "description"?, "cities"?, "places"?, "startDate"?, "endDate"?, "days"?, "groupSize"?, "languages"?, "interests"?, "budgetMin"?, "budgetMax"?, "femaleGuide"?, "urgent"?, "plan"?}, "suggest": {"places": [place ids], "budget": {"min": number, "max": number} or null, "plan": [{"title": "...", "details": "..."}] or null}}

GOVERNORATES (slug: name — guides there):
${governorates}

HERITAGE PLACES (id: name (kind)), by governorate:
${places}

LANGUAGES (code: name): ${ctx.languages.map((c) => `${c}: ${LANGUAGE_NAMES[c] || c}`).join(', ')}
INTERESTS: ${ctx.interests.join(', ')}
LIMITS: 1–4 governorates, up to 6 places, 1–3 languages, up to 5 interests, 1–10 people, up to 30 days.

THE TOURIST: ${ctx.tourist.name}${ctx.tourist.country ? ', from ' + ctx.tourist.country : ''}

CURRENT DRAFT${days ? ` (${days} days)` : ''}:
${JSON.stringify(draft)}

STILL NEEDED:
${needed}

PROBLEMS WITH WHAT THEY GAVE (explain kindly and ask again):
${wrong}`;
}

// ---------- reading the AI's answer ----------

// Pull the first JSON object out of the answer, even if the model wrapped it in text or ``` fences.
export function parseModelJson(text: string): { reply: string; patch: unknown; suggest: any } | null {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) {
      try {
        const o = JSON.parse(text.slice(start, i + 1));
        if (!o || typeof o !== 'object' || typeof o.reply !== 'string' || !o.reply.trim()) return null;
        return { reply: o.reply.trim().slice(0, 1500), patch: o.patch ?? {}, suggest: o.suggest && typeof o.suggest === 'object' ? o.suggest : {} };
      } catch {
        return null;
      }
    }
  }
  return null;
}

// ---------- recommendations ----------

// Which kinds of heritage place fit each interest (used when the AI suggests no places itself).
const KINDS_FOR: Record<string, Place['kind'][]> = {
  history: ['archaeological', 'heritage'],
  archaeology: ['archaeological'],
  religious: ['religious'],
  architecture: ['heritage', 'religious'],
  markets: ['market'],
  food: ['market'],
  nature: ['nature'],
  photography: ['heritage', 'nature', 'archaeological'],
  museums: ['heritage'],
  families: ['nature', 'heritage'],
};

// A per-day budget range from what guides really charge in the trip's governorates.
export function budgetFromPrices(ctx: AssistantContext, cities: string[]): { min: number; max: number } | null {
  const known = cities.map((c) => ctx.guidePrices[c]).filter((g): g is GuidePrice => !!g && g.guides > 0 && g.typical !== null);
  if (!known.length) return null;
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const low = avg(known.map((g) => g.low ?? g.typical!));
  const high = avg(known.map((g) => g.high ?? g.typical!));
  const round5 = (n: number) => Math.max(10, Math.round(n / 5) * 5);
  const min = round5(low);
  return { min, max: Math.max(min, round5(high)) };
}

export function buildSuggestions(raw: any, draft: TripDraft, ctx: AssistantContext): Suggestion[] {
  const out: Suggestion[] = [];
  const inTrip = (id: number) => ctx.places.some((p) => p.id === id && draft.cities.includes(p.city));
  const ids = Array.isArray(raw?.places) ? raw.places.map(Number).filter((id: number) => Number.isInteger(id)) : [];
  let placeIds: number[] = [...new Set<number>(ids)].filter((id) => inTrip(id) && !draft.places.includes(id));
  // The AI suggested nothing: pick places that match the tourist's interests ourselves.
  if (!placeIds.length && draft.cities.length && draft.places.length < 3) {
    const kinds = new Set(draft.interests.flatMap((i) => KINDS_FOR[i] || []));
    const list = ctx.places.filter((p) => draft.cities.includes(p.city) && !draft.places.includes(p.id));
    placeIds = [...list.filter((p) => kinds.has(p.kind)), ...list.filter((p) => !kinds.has(p.kind))].map((p) => p.id);
  }
  for (const id of placeIds.slice(0, 3)) out.push({ kind: 'place', placeId: id });

  const b = raw?.budget;
  const min = Number(b?.min);
  const max = Number(b?.max);
  if (b && isFinite(min) && isFinite(max) && min >= 0 && max >= 10 && max >= min && max <= 2000) {
    if (draft.budgetMin !== Math.round(min) || draft.budgetMax !== Math.round(max)) out.push({ kind: 'budget', min: Math.round(min), max: Math.round(max) });
  } else if (draft.budgetMax === null && draft.cities.length) {
    const fromPrices = budgetFromPrices(ctx, draft.cities);
    if (fromPrices) out.push({ kind: 'budget', ...fromPrices });
  }

  const days = draftDays(draft);
  if (Array.isArray(raw?.plan) && raw.plan.length && days && !draft.plan.length) {
    const plan = raw.plan
      .slice(0, days)
      .map((d: any) => ({ title: String(d?.title ?? '').trim().slice(0, 80), details: String(d?.details ?? '').trim().slice(0, 600) }))
      .filter((d: { title: string }) => d.title);
    if (plan.length) out.push({ kind: 'plan', plan });
  }
  return out;
}

// ---------- one turn ----------

// Clean the chat the app sends: the right roles, short enough, and starting with the tourist.
export function cleanMessages(v: unknown): ChatMessage[] {
  if (!Array.isArray(v)) return [];
  const list: ChatMessage[] = [];
  for (const m of v.slice(-LIMITS.messages)) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') continue;
    const content = m.content.trim().slice(0, m.role === 'user' ? LIMITS.messageChars : 1500);
    if (!content) continue;
    const last = list[list.length - 1];
    if (last && last.role === m.role) last.content += '\n' + content; // models want turns to alternate
    else list.push({ role: m.role, content });
  }
  while (list.length && list[0].role !== 'user') list.shift();
  return list;
}

const FALLBACK = {
  en: "Sorry, I didn't catch that. Could you say it again in a different way?",
  ar: 'عذراً، ما فهمت قصدك. تكدر تعيدها بطريقة ثانية؟',
};

export async function runTurn(input: TurnInput, ctx: AssistantContext, ai: AiProvider): Promise<TurnResult> {
  const before = checkDraft(input.draft, ctx);
  const lastUser = [...input.messages].reverse().find((m) => m.role === 'user')?.content || '';
  const view: TurnView = { draft: input.draft, missing: before.missing, problems: before.problems, ctx, lang: input.lang, lastUser };
  const system = buildSystemPrompt(view);

  let parsed = parseModelJson(await ai.complete({ system, messages: input.messages, turn: view }));
  if (!parsed) {
    // Ask once more, firmly, for JSON only.
    const retry = [...input.messages, { role: 'assistant' as const, content: '(invalid answer)' }, { role: 'user' as const, content: 'Answer again with ONLY the JSON object described in the instructions.' }];
    parsed = parseModelJson(await ai.complete({ system, messages: retry, turn: view }));
  }
  if (!parsed) {
    return { reply: FALLBACK[input.lang], draft: input.draft, ...before, suggestions: [], ready: before.missing.length === 0 };
  }
  const draft = applyPatch(input.draft, parsed.patch, ctx);
  const after = checkDraft(draft, ctx);
  return {
    reply: parsed.reply,
    draft,
    missing: after.missing,
    problems: after.problems,
    suggestions: buildSuggestions(parsed.suggest, draft, ctx),
    ready: after.missing.length === 0,
  };
}

// ---------- HTTP ----------

// Up to LIMITS.callsPerWindow calls per signed-in user in each window, kept in memory.
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private max = LIMITS.callsPerWindow, private windowMs = LIMITS.windowMs, private now = () => Date.now()) {}
  take(key: string): boolean {
    const t = this.now();
    const list = (this.hits.get(key) || []).filter((x) => t - x < this.windowMs);
    if (list.length >= this.max) {
      this.hits.set(key, list);
      return false;
    }
    list.push(t);
    this.hits.set(key, list);
    if (this.hits.size > 5000) for (const [k, v] of this.hits) if (!v.some((x) => t - x < this.windowMs)) this.hits.delete(k);
    return true;
  }
}

type Api = (req: ApiRequest) => ApiResponse;

// Handles /assistant/status and /assistant/trip; returns null for any other path so the normal API takes it.
export function createAssistantHandler(api: Api, ai: AiProvider | null, limiter = new RateLimiter()) {
  return async (req: { method: string; path: string; body: any; token: string | null }): Promise<ApiResponse | null> => {
    if (req.path === '/assistant/status' && req.method === 'GET') return { status: 200, body: { enabled: !!ai } };
    if (req.path !== '/assistant/trip') return null;
    if (req.method !== 'POST') return { status: 404, body: { error: 'not_found' } };

    // The marketplace checks the token and the role, and gives the data the assistant needs.
    const c = api({ method: 'GET', path: '/assistant/context', query: {}, body: null, token: req.token });
    if (c.status !== 200) return c;
    if (!ai) return { status: 503, body: { error: 'assistant_off' } };
    if (!limiter.take(req.token || '')) return { status: 429, body: { error: 'too_many_requests' } };

    const ctx = c.body as AssistantContext;
    const b = req.body || {};
    const messages = cleanMessages(b.messages);
    if (!messages.length || messages[messages.length - 1].role !== 'user') return { status: 400, body: { error: 'field_required', params: { field: 'messages' } } };
    const lang = b.lang === 'ar' ? 'ar' : 'en';
    const draft = normalizeDraft(b.draft, ctx);
    try {
      return { status: 200, body: await runTurn({ messages, draft, lang }, ctx, ai) };
    } catch (e) {
      if (e instanceof AiError) {
        console.warn('Trip assistant:', e.message);
        return { status: e.code === 'ai_timeout' ? 504 : 503, body: { error: e.code } };
      }
      throw e;
    }
  };
}
