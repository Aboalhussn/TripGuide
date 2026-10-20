// Images live in /public/img; the single-file demo inlines them and sets window.__TG_ASSETS.
declare global {
  interface Window {
    __TG_ASSETS?: Record<string, string>;
  }
}

export function asset(file: string): string {
  return window.__TG_ASSETS?.[file] || '/img/' + file;
}

export function photoSrc(src: string): string {
  if (src.startsWith('lib:')) return asset(src.slice(4) + '.jpg');
  return src;
}
