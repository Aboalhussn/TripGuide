// Shrinks a picked photo in the browser before it is saved, so uploads stay small.
export async function resizeImage(file: File, opts: { max?: number; limit?: number; square?: boolean } = {}): Promise<string> {
  const { max = 900, limit = 380_000, square = false } = opts;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d')!;
    if (square) {
      // Profile photos: crop the middle square.
      const side = Math.min(img.width, img.height);
      const out = Math.min(max, side);
      c.width = c.height = out;
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, out, out);
    } else {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      ctx.drawImage(img, 0, 0, c.width, c.height);
    }
    let q = 0.85;
    let out = c.toDataURL('image/jpeg', q);
    while (out.length > limit && q > 0.35) out = c.toDataURL('image/jpeg', (q -= 0.1));
    if (out.length > limit) throw new Error('too big');
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}
