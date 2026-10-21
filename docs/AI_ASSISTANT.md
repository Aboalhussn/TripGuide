# Trip assistant (AI)

The trip assistant lets a tourist **describe their trip in their own words** instead of filling the four-step form. It asks follow-up questions for anything missing, recommends places, a budget and a day plan, and then sends the tourist to a **review page** where they check everything and post it.

The assistant **never posts anything by itself**. Posting still goes through `POST /requests` when the tourist taps "Post trip", so every rule in `src/core/api.ts` still applies.

> Status: being built step by step. Each step below is marked when it is done.

## Contents

1. [How it works](#1-how-it-works)
2. [Where the code lives](#2-where-the-code-lives)
3. [The draft](#3-the-draft)
4. [Follow-up questions](#4-follow-up-questions)
5. [Recommendations](#5-recommendations)
6. [AI providers and settings](#6-ai-providers-and-settings)
7. [The endpoint](#7-the-endpoint)
8. [Safety limits](#8-safety-limits)
9. [The offline phone app](#9-the-offline-phone-app)
10. [Build steps](#10-build-steps)

## 1. How it works

```
Tourist: "Me and my wife want to see Babylon in early December, 3 days, history stuff"
   │
   ▼
App ─► POST /api/assistant/trip { messages, draft, lang }
          │
          ├─ checks the token (tourists only)
          ├─ loads the context: today, governorates, places, languages, interests,
          │   limits, and what guides really charge per day in each governorate
          ├─ works out what is still missing from the draft (code, not the AI)
          ├─ asks the AI for { reply, patch, suggestions }
          ├─ cleans the AI's patch: unknown governorates/places dropped, limits enforced
          └─ returns { reply, draft, missing, suggestions, ready }
   │
   ▼
App shows the reply, updates the draft strip, shows suggestion chips.
When ready = true → "Review my trip" → review page → "Post trip" → POST /requests
```

One AI call per message. The AI answers in JSON; there is no tool loop. This works well with free models, and the same prompt works with Claude.

## 2. Where the code lives

| What | Where |
|---|---|
| The draft, what is missing, cleaning the AI's output, turning a draft into a `POST /requests` body | `src/core/draft.ts` (pure code, no AI, runs on the server and in the app) |
| The context the assistant needs (`GET /assistant/context`) | `src/core/api.ts` |
| Talking to the AI provider (OpenAI-compatible, Anthropic, mock) | `src/server/ai.ts` |
| The assistant itself: prompt, one chat turn, recommendations | `src/server/assistant.ts` |
| The HTTP route `POST /api/assistant/trip` | `src/server/index.ts` |
| Chat screen `#/post/chat` | `src/web/pages/Assistant.tsx` |
| Review screen `#/post/review` | `src/web/pages/Assistant.tsx` |
| Texts in English and Arabic | `src/web/strings.ts` (keys starting with `ai.`) |
| Tests | `src/core/draft.test.ts`, `src/server/assistant.test.ts`, `e2e/flows.test.ts` |

## 3. The draft

The draft is the trip post being built. It has the same fields as the four-step form, so the review page and the form can both use it. Unknown values are left empty.

| Field | Meaning | Required |
|---|---|---|
| `title` | Short title (5–90 characters). The assistant writes it; it never asks for it | yes |
| `cities` | 1–4 governorate slugs (`baghdad`, `babylon`, …) | yes |
| `startDate`, `endDate` | `YYYY-MM-DD`, from today, at most 30 days | yes |
| `groupSize` | 1–10 people | yes |
| `languages` | 1–3 language codes for the guide | yes |
| `budgetMin`, `budgetMax` | Budget **per day** in US dollars (the form and the draft use per day; the server stores whole-trip totals) | yes |
| `places` | Up to 6 heritage place ids from those governorates | no |
| `interests` | Up to 5 of the app's interests | no |
| `description` | A few sentences in the tourist's words | no |
| `plan` | One `{ title, details }` per day | no |
| `femaleGuide`, `urgent` | Yes/no wishes | no |

## 4. Follow-up questions

What is missing is decided by **code** (`checkDraft` in `src/core/draft.ts`), with the same rules the server uses when posting. Each turn the AI is told exactly which fields are still missing or wrong, and asks about at most two of them, in a natural way. When nothing required is missing, the reply says so and the app shows **Review my trip**.

## 5. Recommendations

Recommendations come only from the app's own data, so the AI cannot invent places or prices:

- **Places:** chosen from the heritage places of the trip's governorates, matched to the tourist's interests. Place ids the AI makes up are dropped.
- **Budget:** a per-day range from the real prices of the guides who work in those governorates.
- **Trip length and governorates:** for example "Babylon fits in one day; Karbala is close if you have a second day".
- **Day plan:** one short line per day, which guides see when they write their offer.

Suggestions are shown as chips (for example "+ Ishtar Gate", "Use $60–90 a day"). Tapping a chip changes the draft straight away, without another AI call.

## 6. AI providers and settings

The server reads these environment variables. Nothing about the AI is ever sent to the app.

| Variable | Example | Meaning |
|---|---|---|
| `AI_PROVIDER` | `openai`, `anthropic` or `mock` | Which kind of API to call. No value = the assistant is turned off |
| `AI_API_KEY` | `sk-...` | The provider's key |
| `AI_MODEL` | `meta-llama/llama-3.3-70b-instruct:free` | The model name |
| `AI_BASE_URL` | `https://openrouter.ai/api/v1` | Only for `openai`: any OpenAI-compatible API (OpenRouter, Groq, Gemini, a local Ollama) |

`mock` gives scripted answers with no key and no internet. The tests use it.

## 7. The endpoint

`POST /api/assistant/trip` (tourists only, `Authorization: Bearer <token>`)

Send:

```json
{
  "messages": [{ "role": "user", "content": "..." }, { "role": "assistant", "content": "..." }],
  "draft": { "cities": ["babylon"], "groupSize": 2 },
  "lang": "en"
}
```

Get back:

```json
{
  "reply": "Lovely! Which dates are you thinking of?",
  "draft": { "...the updated draft..." },
  "missing": ["dates", "budget"],
  "suggestions": [{ "kind": "place", "label": "Ishtar Gate", "patch": { "places": [14] } }],
  "ready": false
}
```

`GET /api/assistant/status` tells the app whether the assistant is turned on, so it can hide the button when it is not.

## 8. Safety limits

- Tourists only, with a valid token.
- Each message up to 600 characters; up to 30 messages in one chat.
- Up to 20 assistant calls per user every 10 minutes.
- If the AI answers with something that is not valid JSON, it is asked once more; after that the draft is kept as it was and the tourist is asked to say it again.
- The key stays on the server.

## 9. The offline phone app

The offline phone app runs the marketplace inside the phone with no server, so it has no AI key and no server account to check. In that build the assistant button is hidden. Phone apps built with `API_URL` (pointing at a server) get the assistant like the website.

## 10. Build steps

1. Draft rules in `src/core/draft.ts`, with tests.
2. The AI provider adapter, the mock, the assistant and its endpoint.
3. The chat screen with the live draft and suggestion chips.
4. The review screen and posting.
5. Browser tests with the mock provider, and this guide finished.
