// Images live in /public/img; the single-file demo inlines them and sets window.__TG_ASSETS.
declare global {
  interface Window {
    __TG_ASSETS?: Record<string, string>;
  }
}

export function asset(file: string): string {
  return window.__TG_ASSETS?.[file] || '/img/' + file;
}

/** A governorate cover: a picture in public/img, or 'm:<id>' for one the admin uploaded (served in meta.media). */
export function coverSrc(key: string, meta?: { media?: Record<string, string> } | null): string {
  if (!key) return '';
  if (key.startsWith('m:')) return meta?.media?.[key] || asset('skyline.jpg');
  return asset(key);
}

export function photoSrc(src: string): string {
  if (src.startsWith('lib:')) return asset(src.slice(4) + '.jpg');
  return src;
}
