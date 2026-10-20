// Checks that every text key the app uses exists in English and Arabic. Run: npx tsx scripts/check-strings.ts
import fs from 'node:fs';
import path from 'node:path';
import { strings } from '../src/web/strings';
import { INTERESTS, INCLUDES, GUIDE_RATING_KEYS, TOURIST_RATING_KEYS, LANGUAGE_LEVELS } from '../src/core/catalog';

const used = new Set<string>();
const walk = (dir: string) => {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx?|mjs)$/.test(f)) {
      const src = fs.readFileSync(p, 'utf8');
      for (const m of src.matchAll(/\bt\(\s*['"]([a-z_]+\.[a-zA-Z0-9_.]+)['"]/g)) used.add(m[1]);
      for (const m of src.matchAll(/['"]((?:review|booking|home)\.[a-z_]+(?:\.[a-z_]+)?)['"]/g)) if (!m[1].endsWith('.')) used.add(m[1]);
    }
  }
};
walk(path.join(process.cwd(), 'src/web'));

const each = (prefix: string, xs: readonly string[]) => xs.forEach((x) => used.add(prefix + x));
each('interest.', INTERESTS);
each('include.', INCLUDES);
each('rating.', [...GUIDE_RATING_KEYS, ...TOURIST_RATING_KEYS]);
each('level.', LANGUAGE_LEVELS);
each('role.', ['tourist', 'guide', 'admin']);
each('request.status.', ['open', 'awarded', 'hired', 'closed']);
each('booking.status.', ['awaiting_guide', 'confirmed', 'completed', 'cancelled', 'declined', 'expired', 'disputed']);
each('offer.status.', ['pending', 'awarded', 'accepted', 'declined', 'withdrawn', 'not_selected']);
each('guides.sort.', ['best', 'rating', 'price_low', 'price_high', 'tours']);
each('verify.status.', ['none', 'pending', 'rejected', 'verified']);
each('verify.status_text.', ['none', 'pending', 'rejected', 'verified']);
each('verify.short.', ['pending', 'verified', 'rejected']);
each('report.reason.', ['no_show', 'not_as_agreed', 'safety', 'payment', 'other']);
each('report.resolution.', ['refund', 'release', 'dismiss']);
each('wallet.kind.', ['paid_in', 'released', 'refunded', 'released_g']);
each('bookings.tab_', ['upcoming', 'done', 'cancelled']);
each('offers.tab_', ['active', 'won', 'past']);
each('auth.role_', ['tourist', 'guide', 'tourist_text', 'guide_text']);
each('gender.', ['f', 'm']);
each('home.step', ['1', '2', '3', '1_text', '2_text', '3_text']);

// Every error code and notification type the core can produce.
const core = fs.readFileSync(path.join(process.cwd(), 'src/core/api.ts'), 'utf8') + fs.readFileSync(path.join(process.cwd(), 'src/core/util.ts'), 'utf8');
for (const m of core.matchAll(/(?:bad|conflict|forbidden|notFound|new ApiError\(\d+,)\s*\(?\s*'([a-z_]+)'/g)) used.add('err.' + m[1]);
for (const m of core.matchAll(/notify(?:Admins)?\(ctx,(?:\s*[\w.]+,)?\s*'([a-z_]+)'/g)) used.add('notif.' + m[1]);
for (const m of core.matchAll(/(?:str|optStr|num|strList)\([^,]+,\s*'([a-zA-Z.]+)'/g)) used.add('field.' + m[1]);
for (const m of core.matchAll(/field: '([a-zA-Z.]+)'/g)) used.add('field.' + m[1]);
const seed = fs.readFileSync(path.join(process.cwd(), 'src/core/seed.ts'), 'utf8');
for (const m of seed.matchAll(/type: '([a-z_]+)'/g)) used.add('notif.' + m[1]);
['offline', 'generic', 'title', 'too_large', 'bad_json', 'server_error', 'method_not_allowed'].forEach((x) => used.add('err.' + x));

let missing = 0;
for (const lang of ['en', 'ar'] as const) {
  for (const k of [...used].sort()) {
    const key = k.replace(/\.\d+\./, '.').replace(/\$\{.*$/, '');
    if (key.endsWith('.') || key.endsWith('_')) continue;
    if (!(key in strings[lang])) {
      console.log(`missing ${lang}: ${key}`);
      missing++;
    }
  }
}
const extra = Object.keys(strings.en).filter((k) => !(k in strings.ar));
for (const k of extra) console.log(`missing ar: ${k} (in en only)`);
const extraAr = Object.keys(strings.ar).filter((k) => !(k in strings.en));
for (const k of extraAr) console.log(`missing en: ${k} (in ar only)`);
console.log(`${used.size} keys used, ${missing + extra.length + extraAr.length} problems`);
process.exit(missing + extra.length + extraAr.length ? 1 : 0);
