// The trip assistant's draft: the trip post being built in a chat, before the tourist reviews and posts it.
// Pure code with no AI in it. The server uses it to clean what the AI says and to work out what is still
// missing; the app uses it to show the review page and to turn the draft into a POST /requests body.
// See docs/AI_ASSISTANT.md.
import type { Place } from './types';
import { addDays, daysInclusive, isDate } from './util';

// The same limits the four-step form and POST /requests use.
export const TRIP_LIMITS = { cities: 4, places: 6, languages: 3, interests: 5, people: 10, perDay: 2000, days: 30 };
export const DRAFT_TEXT = { title: 90, description: 2000, planTitle: 80, planDetails: 600 };

export interface DraftDay { title: string; details: string }

// Every field may be empty while the chat is going on. Budgets are per day, like the form.
export interface TripDraft {
  title: string;
  description: string;
  cities: string[];
  places: number[];
  startDate: string;
  endDate: string;
  groupSize: number | null;
  languages: string[];
  interests: string[];
  budgetMin: number | null;
  budgetMax: number | null;
  femaleGuide: boolean;
  urgent: boolean;
  plan: DraftDay[];
}

// What the draft rules need to know about the app. GET /assistant/context returns this (plus guide prices).
export interface DraftContext {
  today: string;
  cities: { slug: string; name: string; nameAr: string }[];
  places: Place[];
  languages: string[];
  interests: string[];
}

// The required parts of a trip post, in the order the assistant asks about them.
export type MissingKey = 'cities' | 'dates' | 'groupSize' | 'languages' | 'budget' | 'title';
export const REQUIRED: MissingKey[] = ['cities', 'dates', 'groupSize', 'languages', 'budget', 'title'];

// A problem with a value the tourist gave (not just a missing one), with an error code the app can translate.
export interface DraftProblem { key: MissingKey; code: string; params?: Record<string, unknown> }

export function emptyDraft(): TripDraft {
  return {
    title: '',
    description: '',
    cities: [],
    places: [],
    startDate: '',
    endDate: '',
    groupSize: null,
    languages: [],
    interests: [],
    budgetMin: null,
    budgetMax: null,
    femaleGuide: false,
    urgent: false,
    plan: [],
  };
}

// Number of days in the trip, or 0 while the dates are unknown or wrong.
export function draftDays(d: TripDraft): number {
  if (!isDate(d.startDate) || !isDate(d.endDate) || d.endDate < d.startDate) return 0;
  return daysInclusive(d.startDate, d.endDate);
}

// What is still needed before the draft can be posted. Same rules as parseRequestBody in api.ts.
export function checkDraft(d: TripDraft, ctx: Pick<DraftContext, 'today'>): { missing: MissingKey[]; problems: DraftProblem[] } {
  const problems: DraftProblem[] = [];
  const missing = new Set<MissingKey>();
  if (!d.cities.length) missing.add('cities');
  if (!isDate(d.startDate) || !isDate(d.endDate)) missing.add('dates');
  else if (d.startDate < ctx.today) problems.push({ key: 'dates', code: 'date_past' });
  else if (d.endDate < d.startDate) problems.push({ key: 'dates', code: 'dates_order' });
  else if (daysInclusive(d.startDate, d.endDate) > TRIP_LIMITS.days) problems.push({ key: 'dates', code: 'trip_too_long', params: { max: TRIP_LIMITS.days } });
  if (d.groupSize === null) missing.add('groupSize');
  if (!d.languages.length) missing.add('languages');
  if (d.budgetMax === null) missing.add('budget');
  else if (d.budgetMax < 10) problems.push({ key: 'budget', code: 'budget_low', params: { min: 10 } });
  else if (d.budgetMin !== null && d.budgetMax < d.budgetMin) problems.push({ key: 'budget', code: 'budget_order' });
  if (d.title.trim().length < 5) missing.add('title');
  for (const p of problems) missing.add(p.key);
  return { missing: REQUIRED.filter((k) => missing.has(k)), problems };
}

export const isReady = (d: TripDraft, ctx: Pick<DraftContext, 'today'>) => checkDraft(d, ctx).missing.length === 0;

// ---------- cleaning ----------
// The AI (or a suggestion chip) sends a patch: only the fields it wants to change. Lists replace the old list.
// Anything not allowed is dropped quietly, so a wrong answer from the AI can never break the draft.

const text = (v: unknown, max: number): string | undefined => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : undefined);
const longText = (v: unknown, max: number): string | undefined => (typeof v === 'string' ? v.trim().slice(0, max) : undefined);

function wholeNumber(v: unknown, min: number, max: number): number | null | undefined {
  if (v === null) return null;
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !isFinite(n)) return undefined;
  const r = Math.round(n);
  return r < min || r > max ? undefined : r;
}

function pickList<T>(v: unknown, allowed: (x: unknown) => T | null, max: number): T[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: T[] = [];
  for (const x of v) {
    const ok = allowed(x);
    if (ok !== null && !out.includes(ok)) out.push(ok);
  }
  return out.slice(0, max);
}

// Accept a governorate as its slug or its English or Arabic name.
function citySlug(ctx: DraftContext, v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();
  const c = ctx.cities.find((x) => x.slug === s || x.name.toLowerCase() === s || x.nameAr === v.trim());
  return c ? c.slug : null;
}

export function applyPatch(draft: TripDraft, patch: unknown, ctx: DraftContext): TripDraft {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return draft;
  const p = patch as Record<string, unknown>;
  const d: TripDraft = { ...draft };

  const title = text(p.title, DRAFT_TEXT.title);
  if (title !== undefined) d.title = title;
  const description = longText(p.description, DRAFT_TEXT.description);
  if (description !== undefined) d.description = description;

  const cities = pickList(p.cities, (x) => citySlug(ctx, x), TRIP_LIMITS.cities);
  if (cities) d.cities = cities;

  if ('startDate' in p) d.startDate = isDate(p.startDate) ? p.startDate : p.startDate === null || p.startDate === '' ? '' : d.startDate;
  if ('endDate' in p) d.endDate = isDate(p.endDate) ? p.endDate : p.endDate === null || p.endDate === '' ? '' : d.endDate;
  // "3 days from the 5th": the AI may send a start and a number of days instead of an end.
  const nDays = wholeNumber(p.days, 1, TRIP_LIMITS.days);
  if (typeof nDays === 'number' && isDate(d.startDate) && !isDate(p.endDate)) d.endDate = addDays(d.startDate, nDays - 1);

  const groupSize = wholeNumber(p.groupSize, 1, TRIP_LIMITS.people);
  if (groupSize !== undefined) d.groupSize = groupSize;

  const languages = pickList(p.languages, (x) => (typeof x === 'string' && ctx.languages.includes(x.trim().toLowerCase()) ? x.trim().toLowerCase() : null), TRIP_LIMITS.languages);
  if (languages) d.languages = languages;
  const interests = pickList(p.interests, (x) => (typeof x === 'string' && ctx.interests.includes(x.trim().toLowerCase()) ? x.trim().toLowerCase() : null), TRIP_LIMITS.interests);
  if (interests) d.interests = interests;

  const budgetMin = wholeNumber(p.budgetMin, 0, TRIP_LIMITS.perDay);
  if (budgetMin !== undefined) d.budgetMin = budgetMin;
  const budgetMax = wholeNumber(p.budgetMax, 0, TRIP_LIMITS.perDay);
  if (budgetMax !== undefined) d.budgetMax = budgetMax;
  // Only one number given ("about $80 a day"): use it as the top, and leave room below it.
  if (budgetMax !== undefined && budgetMin === undefined && d.budgetMax !== null && (d.budgetMin === null || d.budgetMin > d.budgetMax)) d.budgetMin = Math.max(0, Math.round(d.budgetMax * 0.7));
  if (d.budgetMin !== null && d.budgetMax === null && budgetMin !== undefined) d.budgetMax = d.budgetMin;

  if (typeof p.femaleGuide === 'boolean') d.femaleGuide = p.femaleGuide;
  if (typeof p.urgent === 'boolean') d.urgent = p.urgent;

  if (Array.isArray(p.plan)) {
    d.plan = p.plan
      .filter((x) => x && typeof x === 'object')
      .map((x: any) => ({ title: text(x.title, DRAFT_TEXT.planTitle) || '', details: longText(x.details, DRAFT_TEXT.planDetails) || '' }))
      .slice(0, TRIP_LIMITS.days);
  }

  const places = pickList(p.places, (x) => (typeof x === 'number' || typeof x === 'string' ? Number(x) : null), 50);
  if (places) d.places = places;
  return tidy(d, ctx);
}

// Keep the draft consistent after any change: places only from the chosen governorates, a plan no longer than the trip.
export function tidy(d: TripDraft, ctx: DraftContext): TripDraft {
  const places = d.places.filter((id) => ctx.places.some((pl) => pl.id === id && d.cities.includes(pl.city))).slice(0, TRIP_LIMITS.places);
  const days = draftDays(d);
  const plan = days ? d.plan.slice(0, days) : d.plan;
  return { ...d, places, plan };
}

// Make a whole draft from anything (for example what the app sends back), filling gaps with empty values.
export function normalizeDraft(v: unknown, ctx: DraftContext): TripDraft {
  return applyPatch(emptyDraft(), v, ctx);
}

// The body for POST /requests. Budgets are per day in the draft and whole-trip totals on the server.
export function toRequestBody(d: TripDraft, extra: { cover?: string } = {}) {
  const days = Math.max(1, draftDays(d));
  const plan = d.plan.some((x) => x.title.trim() || x.details.trim()) ? d.plan : [];
  return {
    title: d.title.trim(),
    description: d.description.trim(),
    cities: d.cities,
    places: d.places,
    startDate: d.startDate,
    endDate: d.endDate,
    groupSize: d.groupSize ?? 1,
    languages: d.languages,
    interests: d.interests,
    budgetMin: (d.budgetMin ?? 0) * days,
    budgetMax: (d.budgetMax ?? 0) * days,
    urgent: d.urgent,
    femaleGuide: d.femaleGuide,
    plan,
    ...(extra.cover ? { cover: extra.cover } : {}),
  };
}
