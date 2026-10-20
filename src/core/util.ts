import type { Data } from './types';

export class ApiError extends Error {
  constructor(public status: number, public code: string, public params: Record<string, unknown> = {}) {
    super(code);
  }
}

export const bad = (code: string, params: Record<string, unknown> = {}) => new ApiError(400, code, params);
export const forbidden = (code = 'forbidden') => new ApiError(403, code);
export const notFound = (code = 'not_found') => new ApiError(404, code);
export const conflict = (code: string, params: Record<string, unknown> = {}) => new ApiError(409, code, params);

// Iraq is UTC+3 all year (no daylight saving).
const IRAQ_OFFSET_MS = 3 * 60 * 60 * 1000;

export function iraqDate(d: Date): string {
  return new Date(d.getTime() + IRAQ_OFFSET_MS).toISOString().slice(0, 10);
}

export function addDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysInclusive(start: string, end: string): number {
  const a = Date.parse(start + 'T00:00:00Z');
  const b = Date.parse(end + 'T00:00:00Z');
  return Math.round((b - a) / 86400000) + 1;
}

export function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

export const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z'));

export function nextId(data: Data, table: string): number {
  data.seq[table] = (data.seq[table] || 0) + 1;
  return data.seq[table];
}

export const money = (n: number) => Math.round(n * 100) / 100;

// Text helpers for validation.
export function str(v: unknown, field: string, min: number, max: number): string {
  if (typeof v !== 'string') throw bad('field_required', { field });
  const s = v.trim();
  if (s.length < min) throw bad(min <= 1 ? 'field_required' : 'field_too_short', { field, min });
  if (s.length > max) throw bad('field_too_long', { field, max });
  return s;
}

export function optStr(v: unknown, field: string, max: number): string {
  if (v === undefined || v === null || v === '') return '';
  if (typeof v !== 'string') throw bad('field_invalid', { field });
  const s = v.trim();
  if (s.length > max) throw bad('field_too_long', { field, max });
  return s;
}

export function num(v: unknown, field: string, min: number, max: number, integer = false): number {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !isFinite(n)) throw bad('field_required', { field });
  if (integer && !Number.isInteger(n)) throw bad('field_invalid', { field });
  if (n < min || n > max) throw bad('field_range', { field, min, max });
  return n;
}

export function strList(v: unknown, field: string, allowed: string[] | null, min = 0, max = 50): string[] {
  if (!Array.isArray(v)) {
    if (min === 0 && (v === undefined || v === null)) return [];
    throw bad('field_required', { field });
  }
  const out = [...new Set(v.map(String))];
  if (allowed) for (const x of out) if (!allowed.includes(x)) throw bad('field_invalid', { field });
  if (out.length < min) throw bad('field_required', { field });
  if (out.length > max) throw bad('field_too_long', { field, max });
  return out;
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function avg(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

export const round1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);
