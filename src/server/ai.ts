// Talking to an AI model. One small adapter so the trip assistant can use a free model now and Claude later
// without changing anything else. Configured only by environment variables on the server; the key never
// reaches the app. See docs/AI_ASSISTANT.md, section 6.
//
//   AI_PROVIDER  openai | anthropic | mock      (empty = the assistant is off)
//   AI_API_KEY   the provider's key              (not needed for mock)
//   AI_MODEL     the model name
//   AI_BASE_URL  for openai: any OpenAI-compatible API (OpenRouter, Groq, Gemini, Ollama…)

export interface ChatMessage { role: 'user' | 'assistant'; content: string }

export interface AiRequest {
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
  // Structured view of the same turn. Real models read `system`; the mock reads this instead.
  turn?: unknown;
}

export interface AiProvider {
  name: string;
  model: string;
  complete(req: AiRequest): Promise<string>;
}

export class AiError extends Error {
  constructor(public code: 'ai_unavailable' | 'ai_failed' | 'ai_timeout', message: string) {
    super(message);
  }
}

const TIMEOUT_MS = 45_000;

async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<{ status: number; data: any; text: string }> {
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e: any) {
    if (e?.name === 'TimeoutError') throw new AiError('ai_timeout', 'The AI took too long to answer');
    throw new AiError('ai_unavailable', 'Could not reach the AI: ' + (e?.message || e));
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    /* not JSON: keep the text for the error message */
  }
  return { status: res.status, data, text };
}

// Any OpenAI-compatible chat API (OpenAI, OpenRouter, Groq, Gemini's OpenAI endpoint, a local Ollama…).
function openAiProvider(key: string, model: string, base: string): AiProvider {
  const url = base.replace(/\/+$/, '') + '/chat/completions';
  let jsonMode = true; // some free models refuse response_format; then we stop asking for it
  return {
    name: 'openai',
    model,
    async complete(req) {
      const send = () =>
        postJson(
          url,
          { authorization: 'Bearer ' + key },
          {
            model,
            messages: [{ role: 'system', content: req.system }, ...req.messages],
            temperature: 0.3,
            max_tokens: req.maxTokens || 1200,
            ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
          },
        );
      let r = await send();
      if (r.status === 400 && jsonMode && /response_format|json/i.test(r.text)) {
        jsonMode = false;
        r = await send();
      }
      if (r.status >= 400) throw new AiError(r.status === 429 ? 'ai_unavailable' : 'ai_failed', `AI error ${r.status}: ${r.text.slice(0, 300)}`);
      const content = r.data?.choices?.[0]?.message?.content;
      if (typeof content !== 'string') throw new AiError('ai_failed', 'The AI sent no text');
      return content;
    },
  };
}

// Anthropic's Messages API (Claude).
function anthropicProvider(key: string, model: string, base: string): AiProvider {
  const url = base.replace(/\/+$/, '') + '/v1/messages';
  return {
    name: 'anthropic',
    model,
    async complete(req) {
      const r = await postJson(
        url,
        { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        { model, system: req.system, messages: req.messages, max_tokens: req.maxTokens || 1200, temperature: 0.3 },
      );
      if (r.status >= 400) throw new AiError(r.status === 429 || r.status === 529 ? 'ai_unavailable' : 'ai_failed', `AI error ${r.status}: ${r.text.slice(0, 300)}`);
      const content = (r.data?.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
      if (!content) throw new AiError('ai_failed', 'The AI sent no text');
      return content;
    },
  };
}

// Reads the settings and returns the provider, or null when the assistant is turned off.
// `mock` is passed in by the caller (src/server/mock-ai.ts) so this file has no assistant logic in it.
export function providerFromEnv(env: Record<string, string | undefined>, mock: () => AiProvider): AiProvider | null {
  const kind = (env.AI_PROVIDER || '').trim().toLowerCase();
  if (!kind || kind === 'off' || kind === 'none') return null;
  if (kind === 'mock') return mock();
  const key = env.AI_API_KEY || '';
  if (!key) {
    console.warn(`AI_PROVIDER=${kind} but AI_API_KEY is empty: the trip assistant is off.`);
    return null;
  }
  if (kind === 'openai') {
    const model = env.AI_MODEL || 'gpt-4o-mini';
    return openAiProvider(key, model, env.AI_BASE_URL || 'https://api.openai.com/v1');
  }
  if (kind === 'anthropic' || kind === 'claude') {
    const model = env.AI_MODEL || 'claude-haiku-5-5';
    return anthropicProvider(key, model, env.AI_BASE_URL || 'https://api.anthropic.com');
  }
  console.warn(`Unknown AI_PROVIDER "${kind}" (use openai, anthropic or mock): the trip assistant is off.`);
  return null;
}
