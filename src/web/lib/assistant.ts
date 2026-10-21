// The trip assistant on the app side: the chat and the draft, kept for this browser tab so the tourist can
// go from the chat to the review page (or the form) and back without losing anything. See docs/AI_ASSISTANT.md.
import { applyPatch, emptyDraft, normalizeDraft, type DraftContext, type MissingKey, type TripDraft } from '../../core/draft';

export type ChatMsg = { role: 'user' | 'assistant'; content: string };
export type Suggestion =
  | { kind: 'place'; placeId: number }
  | { kind: 'budget'; min: number; max: number }
  | { kind: 'plan'; plan: { title: string; details: string }[] };

export interface AssistantState {
  messages: ChatMsg[];
  draft: TripDraft;
  missing: MissingKey[];
  suggestions: Suggestion[];
  ready: boolean;
}

const KEY = 'tg.assistant.v1';

export const freshState = (): AssistantState => ({
  messages: [],
  draft: emptyDraft(),
  missing: ['cities', 'dates', 'groupSize', 'languages', 'budget', 'title'],
  suggestions: [],
  ready: false,
});

export function loadState(): AssistantState {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) return { ...freshState(), ...JSON.parse(raw) };
  } catch {
    /* storage blocked: start fresh */
  }
  return freshState();
}

export function saveState(s: AssistantState) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage blocked: the chat still works on this page */
  }
}

export function clearState() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

// The draft rules need the allowed values; the app has them in GET /meta.
export function draftContext(meta: any): DraftContext {
  return { today: meta.today, cities: meta.cities, places: meta.places, languages: meta.languages, interests: meta.interests };
}

// Apply a suggestion chip to the draft (no AI call).
export function applySuggestion(draft: TripDraft, s: Suggestion, ctx: DraftContext): TripDraft {
  if (s.kind === 'place') return applyPatch(draft, { places: [...draft.places, s.placeId] }, ctx);
  if (s.kind === 'budget') return applyPatch(draft, { budgetMin: s.min, budgetMax: s.max }, ctx);
  return applyPatch(draft, { plan: s.plan }, ctx);
}

// Is this chip already reflected in the draft?
export function isApplied(draft: TripDraft, s: Suggestion): boolean {
  if (s.kind === 'place') return draft.places.includes(s.placeId);
  if (s.kind === 'budget') return draft.budgetMin === s.min && draft.budgetMax === s.max;
  return draft.plan.length > 0;
}

export { normalizeDraft };
