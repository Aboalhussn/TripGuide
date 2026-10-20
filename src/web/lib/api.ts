// Talks to /api on the server, or to the in-browser engine in the single-file demo.
export class ApiFailure extends Error {
  constructor(public status: number, public code: string, public params: Record<string, any> = {}) {
    super(code);
  }
}

type LocalApi = (req: { method: string; path: string; query: Record<string, string>; body: any; token: string | null }) => { status: number; body: any };

declare global {
  interface Window {
    __TG_LOCAL_API?: LocalApi;
    __TG_DEMO?: { reset(): void };
  }
}

const TOKEN_KEY = 'tg.token';
let memoryToken: string | null = null;

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? memoryToken;
  } catch {
    return memoryToken;
  }
}
export function setToken(t: string | null) {
  memoryToken = t;
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable: keep it in memory */
  }
}

export async function api<T = any>(method: string, path: string, body?: unknown, query?: Record<string, string | number | undefined | null>): Promise<T> {
  const q: Record<string, string> = {};
  for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== null && v !== '') q[k] = String(v);
  const token = getToken();
  if (window.__TG_LOCAL_API) {
    // Give React a tick, like a network call would.
    await new Promise((r) => setTimeout(r, 0));
    const res = window.__TG_LOCAL_API({ method, path, query: q, body: body === undefined ? null : JSON.parse(JSON.stringify(body)), token });
    if (res.status >= 400) throw new ApiFailure(res.status, res.body?.error || 'error', res.body?.params);
    return JSON.parse(JSON.stringify(res.body));
  }
  const qs = new URLSearchParams(q).toString();
  let res: Response;
  try {
    res = await fetch('/api' + path + (qs ? '?' + qs : ''), {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiFailure(0, 'offline');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiFailure(res.status, data.error || 'error', data.params);
  return data as T;
}

export const isDemo = () => !!window.__TG_LOCAL_API;
